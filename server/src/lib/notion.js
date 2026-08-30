// Notion: Aufgaben lesen/schreiben und Tages-/Wochenplaene als Seite anlegen.
import { config } from "../config.js";
import { request } from "./http.js";

const API = "https://api.notion.com/v1";
export const notionConfigured = () => Boolean(config.notion.token);

async function api(path, options = {}) {
  if (!notionConfigured()) throw new Error("Notion ist nicht konfiguriert (NOTION_TOKEN fehlt).");
  return request("notion", `${API}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${config.notion.token}`,
      "Notion-Version": config.notion.version,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
}

// Notion-Datenbanken haben frei benannte Properties. Wir suchen die Spalten
// anhand ihres Typs, damit die Integration ohne exaktes Schema funktioniert.
async function tasksSchema() {
  const db = await api(`/databases/${config.notion.tasksDb}`);
  const props = db.properties || {};
  const byType = (type) => Object.entries(props).find(([, p]) => p.type === type)?.[0];
  const named = (re, type) =>
    Object.entries(props).find(([n, p]) => re.test(n) && (!type || p.type === type))?.[0];

  const status =
    named(/status|erledigt|done/i, "status") || byType("status") ||
    named(/erledigt|done/i, "checkbox") || byType("checkbox");

  return {
    title: byType("title"),
    status,
    statusType: status ? props[status].type : null,   // "status" oder "checkbox"
    date: named(/f(ä|ae)llig|due|datum|date/i, "date") || byType("date"),
    props,
  };
}

const plainTitle = (page, titleProp) =>
  (page.properties?.[titleProp]?.title || []).map((t) => t.plain_text).join("").trim();

export async function notionTasks({ includeDone = false } = {}) {
  if (!config.notion.tasksDb) return [];
  const s = await tasksSchema();
  const data = await api(`/databases/${config.notion.tasksDb}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 100 }),
  });
  return (data.results || [])
    .map((p) => {
      const st = s.status ? p.properties[s.status] : null;
      const done = st?.type === "checkbox" ? st.checkbox : /done|fertig|erledigt|abgeschlossen/i.test(st?.status?.name || "");
      return {
        id: p.id,
        title: plainTitle(p, s.title) || "(ohne Titel)",
        done: Boolean(done),
        due: s.date ? p.properties[s.date]?.date?.start || null : null,
        url: p.url,
        source: "notion",
      };
    })
    .filter((t) => (includeDone ? true : !t.done));
}

export async function notionAddTask({ title, due }) {
  if (!config.notion.tasksDb) throw new Error("NOTION_TASKS_DB ist nicht gesetzt.");
  const s = await tasksSchema();
  const properties = { [s.title]: { title: [{ text: { content: title } }] } };
  if (due && s.date) properties[s.date] = { date: { start: due } };
  const p = await api("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: config.notion.tasksDb }, properties }),
  });
  return { id: p.id, title, due: due || null, url: p.url, source: "notion" };
}

export async function notionCompleteTask(pageId) {
  const s = await tasksSchema();
  if (!s.status) throw new Error("Keine Status- oder Checkbox-Spalte in der Notion-Datenbank gefunden.");

  let value;
  if (s.statusType === "checkbox") {
    value = { checkbox: true };
  } else {
    // Die Erledigt-Option heisst je nach Datenbank anders ("Done", "Erledigt",
    // "Fertig"). Deshalb aus den echten Optionen suchen statt "Done" zu raten.
    const options = s.props[s.status].status?.options || [];
    const groups = s.props[s.status].status?.groups || [];
    const completeGroup = groups.find((g) => /complete|done|fertig|abgeschlossen/i.test(g.name));
    const option =
      options.find((o) => /^(done|erledigt|fertig|abgeschlossen|completed)$/i.test(o.name)) ||
      (completeGroup && options.find((o) => completeGroup.option_ids?.includes(o.id))) ||
      options.at(-1);
    if (!option) throw new Error(`Die Spalte "${s.status}" hat keine Option für "erledigt".`);
    value = { status: { name: option.name } };
  }

  await api(`/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties: { [s.status]: value } }) });
  return true;
}

// Markdown-Untermenge -> Notion-Bloecke (Ueberschriften, Listen, To-dos, Absaetze).
function toBlocks(markdown) {
  const rich = (t) => [{ type: "text", text: { content: t.slice(0, 1900) } }];
  return markdown
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length)
    .slice(0, 100)
    .map((line) => {
      let m;
      if ((m = line.match(/^###\s+(.*)/))) return { object: "block", type: "heading_3", heading_3: { rich_text: rich(m[1]) } };
      if ((m = line.match(/^##\s+(.*)/))) return { object: "block", type: "heading_2", heading_2: { rich_text: rich(m[1]) } };
      if ((m = line.match(/^#\s+(.*)/))) return { object: "block", type: "heading_1", heading_1: { rich_text: rich(m[1]) } };
      if ((m = line.match(/^[-*]\s+\[[ xX]\]\s+(.*)/)))
        return { object: "block", type: "to_do", to_do: { rich_text: rich(m[1]), checked: /\[[xX]\]/.test(line) } };
      if ((m = line.match(/^[-*]\s+(.*)/)))
        return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(m[1]) } };
      return { object: "block", type: "paragraph", paragraph: { rich_text: rich(line) } };
    });
}

export async function notionCreatePlanPage({ title, markdown }) {
  const parent = config.notion.planParent;
  if (!parent) throw new Error("NOTION_PLAN_PARENT ist nicht gesetzt.");
  // Der Parent darf eine Seite oder eine Datenbank sein - wir probieren beides.
  const asDatabase = {
    parent: { database_id: parent },
    properties: { title: { title: [{ text: { content: title } }] } },
    children: toBlocks(markdown),
  };
  const asPage = {
    parent: { page_id: parent },
    properties: { title: { title: [{ text: { content: title } }] } },
    children: toBlocks(markdown),
  };
  try {
    const p = await api("/pages", { method: "POST", body: JSON.stringify(asPage) });
    return { id: p.id, url: p.url, title };
  } catch {
    const p = await api("/pages", { method: "POST", body: JSON.stringify(asDatabase) });
    return { id: p.id, url: p.url, title };
  }
}
