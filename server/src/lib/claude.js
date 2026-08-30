// Das Gehirn: Claude mit Werkzeugen fuer Wetter, Aufgaben, Gmail, Kalender,
// Notion, Spotify und Telefon. Nutzt den Tool-Runner des offiziellen SDK.
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { config, featureStatus } from "../config.js";
import { getWeather, weatherSentence } from "./weather.js";
import { listTasks, addTask, completeTask } from "./tasks.js";
import { gmailList, gmailGet, calendarList, calendarCreate, googleConnected } from "./google.js";
import { notionCreatePlanPage, notionConfigured } from "./notion.js";
import { play as spotifyPlay, pause as spotifyPause, setVolume, spotifyConnected } from "./spotify.js";
import { alert, phoneConfigured } from "./notify.js";

let client = null;
export function claudeConfigured() {
  return Boolean(config.anthropic.apiKey);
}
function getClient() {
  if (!claudeConfigured()) throw new Error("ANTHROPIC_API_KEY fehlt - das KI-Gehirn ist nicht verbunden.");
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

const iso = (d) => new Date(d).toISOString();
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

/* ------------------------------ Werkzeuge -------------------------------- */
// `actions` sammelt, was JARVIS tatsaechlich getan hat - das UI zeigt es an.
function buildTools(actions) {
  const log = (type, detail) => { actions.push({ type, detail, at: new Date().toISOString() }); };

  const tools = [
    betaTool({
      name: "get_weather",
      description: "Aktuelles Wetter und Vorhersage. Ohne Ort wird der hinterlegte Heimatort verwendet.",
      inputSchema: {
        type: "object",
        properties: { location: { type: "string", description: "Ort, z. B. 'München'. Weglassen für Zuhause." } },
      },
      run: async ({ location }) => {
        const w = await getWeather({ location });
        return JSON.stringify({ ...w, satz: weatherSentence(w) });
      },
    }),

    betaTool({
      name: "list_tasks",
      description: "Offene Aufgaben aus dem Aufgabenspeicher lesen (lokal + Notion).",
      inputSchema: {
        type: "object",
        properties: { include_done: { type: "boolean", description: "Auch erledigte Aufgaben mitliefern." } },
      },
      run: async ({ include_done }) => JSON.stringify(await listTasks({ includeDone: Boolean(include_done) })),
    }),

    betaTool({
      name: "add_task",
      description: "Neue Aufgabe im Aufgabenspeicher anlegen.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          due: { type: "string", description: "Fälligkeit als YYYY-MM-DD, optional." },
          note: { type: "string" },
        },
        required: ["title"],
      },
      run: async (input) => {
        const t = await addTask(input);
        log("task_added", t);
        return JSON.stringify(t);
      },
    }),

    betaTool({
      name: "complete_task",
      description: "Aufgabe als erledigt markieren. Die ID stammt aus list_tasks.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      run: async ({ id }) => {
        const r = await completeTask(id);
        log("task_completed", r);
        return JSON.stringify(r);
      },
    }),
  ];

  if (googleConnected()) {
    tools.push(
      betaTool({
        name: "list_mail",
        description:
          "Gmail durchsuchen. Standard: ungelesene Mails der letzten 2 Tage. Gmail-Suchsyntax wird unterstützt (z. B. 'from:chef is:unread').",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Gmail-Suchanfrage." },
            max: { type: "integer", description: "Maximale Anzahl (Standard 10)." },
          },
        },
        run: async ({ query, max }) =>
          JSON.stringify(await gmailList({ query: query || "is:unread newer_than:2d", max: max || 10 })),
      }),
      betaTool({
        name: "read_mail",
        description: "Volltext einer einzelnen Mail lesen, damit du sie vorlesen oder zusammenfassen kannst.",
        inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        run: async ({ id }) => JSON.stringify(await gmailGet(id)),
      }),
      betaTool({
        name: "list_calendar",
        description: "Termine im Google Kalender auflisten.",
        inputSchema: {
          type: "object",
          properties: {
            days: { type: "integer", description: "Wie viele Tage ab jetzt (Standard 1, Woche = 7)." },
          },
        },
        run: async ({ days }) => {
          const span = Math.max(1, Math.min(31, days || 1));
          return JSON.stringify(
            await calendarList({
              timeMin: iso(startOfToday()),
              timeMax: iso(startOfToday().getTime() + span * 86400000),
              max: 50,
            }),
          );
        },
      }),
      betaTool({
        name: "create_event",
        description:
          "Termin im Google Kalender anlegen. Zeiten als ISO-8601 mit Zeitzone, ganztägig als YYYY-MM-DD.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            description: { type: "string" },
            location: { type: "string" },
            reminder_minutes: { type: "integer" },
          },
          required: ["title", "start"],
        },
        run: async (i) => {
          const e = await calendarCreate({ ...i, reminderMinutes: i.reminder_minutes ?? 15 });
          log("event_created", e);
          return JSON.stringify(e);
        },
      }),
    );
  }

  if (notionConfigured()) {
    tools.push(
      betaTool({
        name: "write_notion_plan",
        description:
          "Einen Tages- oder Wochenplan als neue Notion-Seite anlegen. Der Inhalt ist Markdown (Überschriften, Listen, To-dos).",
        inputSchema: {
          type: "object",
          properties: { title: { type: "string" }, markdown: { type: "string" } },
          required: ["title", "markdown"],
        },
        run: async (i) => {
          const p = await notionCreatePlanPage(i);
          log("notion_plan", p);
          return JSON.stringify(p);
        },
      }),
    );
  }

  if (spotifyConnected()) {
    tools.push(
      betaTool({
        name: "play_music",
        description: "Musik über Spotify abspielen. Suchbegriff wie 'Back In Black AC/DC'.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" }, volume: { type: "integer", description: "0-100" } },
          required: ["query"],
        },
        run: async ({ query, volume }) => {
          const r = await spotifyPlay({ query, volume });
          log("music", r);
          return JSON.stringify(r);
        },
      }),
      betaTool({
        name: "control_music",
        description: "Musik pausieren oder Lautstärke ändern.",
        inputSchema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["pause", "volume"] },
            volume: { type: "integer", description: "0-100, nur bei action=volume" },
          },
          required: ["action"],
        },
        run: async ({ action, volume }) => {
          const ok = action === "pause" ? await spotifyPause() : await setVolume(volume ?? 30);
          return JSON.stringify({ ok, action });
        },
      }),
    );
  }

  if (phoneConfigured() || config.pushWebhook) {
    tools.push(
      betaTool({
        name: "call_owner",
        description:
          "NUR bei wirklich dringenden Dingen: ruft den Besitzer auf dem iPhone an und liest die Nachricht vor " +
          "(Fallback: Push). Nicht für Routine-Infos verwenden - der Besitzer wird dadurch unterbrochen.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "Kurzer, klarer Text zum Vorlesen (max. 2 Sätze)." },
            reason: { type: "string", description: "Warum ist das dringend?" },
          },
          required: ["message", "reason"],
        },
        run: async ({ message, reason }) => {
          const r = await alert({ title: "JARVIS", message });
          log("call", { ...r, reason, message });
          return JSON.stringify(r);
        },
      }),
    );
  }

  return tools;
}

/* ------------------------------ Systemprompt ------------------------------ */

function systemPrompt() {
  const f = featureStatus();
  const now = new Date().toLocaleString(config.owner.locale, { timeZone: config.owner.timezone });
  return [
    `Du bist JARVIS, der persönliche Assistent von ${config.owner.name}.`,
    `Aktuelle Zeit: ${now} (${config.owner.timezone}). Sprache: Deutsch, per Du.`,
    "",
    "Stil: ruhig, präzise, freundlich-britisch-trocken wie JARVIS in Iron Man. Kurze Sätze.",
    "Deine Antworten werden VORGELESEN. Deshalb:",
    "- Keine Markdown-Formatierung, keine Aufzählungszeichen, keine Emojis, keine URLs im Fließtext.",
    "- Zahlen und Uhrzeiten ausschreibbar formulieren ('halb neun', '18 Grad').",
    "- Standardlänge: zwei bis vier Sätze. Nur wenn ausdrücklich gewünscht, ausführlicher.",
    "",
    "Arbeitsweise:",
    "- Nutze Werkzeuge, statt zu raten. Wenn du Termine anlegst, bestätige kurz, was du eingetragen hast.",
    "- Bei Terminwünschen ohne Datum: heute annehmen und die Annahme im Satz nennen.",
    "- Mails: nenne Absender und Kern in einem Satz. Vorlesen nur, wenn danach gefragt wird.",
    "- Wenn eine Mail eine konkrete Zeit enthält, biete an, sie in den Kalender einzutragen, oder trage sie ein, wenn gebeten.",
    `- call_owner ist ein Notfallwerkzeug. Nur nutzen, wenn ${config.owner.name} es verlangt oder etwas wirklich keine Stunde warten kann.`,
    "",
    `Verfügbare Systeme: ${Object.entries(f).filter(([, v]) => v).map(([k]) => k).join(", ") || "nur Grundfunktionen"}.`,
    "Wenn ein System fehlt, sag knapp, was verbunden werden muss - keine langen Entschuldigungen.",
  ].join("\n");
}

/* -------------------------------- Ausführung ------------------------------ */

/**
 * Führt eine Anfrage aus. `history` ist ein Array aus {role, content}-Objekten.
 * Gibt Text, ausgeführte Aktionen und die neue Historie zurück.
 */
export async function ask({ message, history = [], systemExtra = "" }) {
  const actions = [];
  const tools = buildTools(actions);
  const messages = [...history, { role: "user", content: message }];

  const runner = getClient().beta.messages.toolRunner({
    model: config.anthropic.model,
    max_tokens: 8000,
    system: [
      { type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } },
      ...(systemExtra ? [{ type: "text", text: systemExtra }] : []),
    ],
    thinking: { type: "adaptive" },
    output_config: { effort: config.anthropic.effort },
    tools,
    messages,
    max_iterations: 12,
  });

  const final = await runner.runUntilDone();
  const text = final.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return {
    text: text || "Verstanden.",
    actions,
    stopReason: final.stop_reason,
    // Der Runner haengt Assistant- und Tool-Turns selbst an params.messages an.
    history: trimHistory(runner.params.messages),
  };
}

/**
 * Kuerzt die Historie, ohne ein tool_result von seinem tool_use zu trennen -
 * ein solcher Schnitt wuerde die API mit 400 ablehnen. Deshalb wird nur an
 * echten Nutzer-Turns (reiner Text) geschnitten.
 */
function trimHistory(messages, keep = 20) {
  if (messages.length <= keep) return messages;
  for (let i = messages.length - keep; i < messages.length; i++) {
    if (messages[i].role === "user" && typeof messages[i].content === "string") {
      return messages.slice(i);
    }
  }
  return messages.slice(-2);
}

/** Bewertet Mails nach Dringlichkeit - Basis fuer den automatischen Anruf. */
export async function triageMails(mails) {
  if (!mails.length) return [];
  if (!claudeConfigured()) {
    return mails.map((m) => ({ id: m.id, importance: 2, reason: "Keine KI-Bewertung verfügbar.", summary: m.subject, has_event: false }));
  }
  const res = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            mails: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  importance: { type: "integer", description: "1 = Werbung, 5 = sofort handeln" },
                  summary: { type: "string", description: "Ein Satz auf Deutsch, zum Vorlesen." },
                  reason: { type: "string" },
                  has_event: { type: "boolean", description: "true, wenn die Mail einen konkreten Termin enthält." },
                  event_title: { type: "string", description: "Leer, wenn has_event false ist." },
                  event_start: { type: "string", description: "ISO-8601 oder leer." },
                  event_end: { type: "string", description: "ISO-8601 oder leer." },
                },
                required: ["id", "importance", "summary", "reason", "has_event", "event_title", "event_start", "event_end"],
                additionalProperties: false,
              },
            },
          },
          required: ["mails"],
          additionalProperties: false,
        },
      },
    },
    system:
      `Du bewertest E-Mails für ${config.owner.name}. Heute ist ${new Date().toISOString().slice(0, 10)}, Zeitzone ${config.owner.timezone}. ` +
      "Bewerte jede Mail von 1 (irrelevant/Newsletter) bis 5 (dringend, muss sofort gelesen werden). " +
      "Wenn eine Mail einen konkreten Termin enthält, setze has_event true und fülle event_title/event_start/event_end mit ISO-8601-Zeiten. Sonst has_event false und leere Strings.",
    messages: [{ role: "user", content: JSON.stringify(mails.map((m) => ({ id: m.id, from: m.from, subject: m.subject, snippet: m.snippet }))) }],
  });

  const block = res.content.find((b) => b.type === "text");
  try {
    return JSON.parse(block.text).mails;
  } catch {
    return mails.map((m) => ({ id: m.id, importance: 3, summary: m.subject, reason: "Bewertung nicht lesbar.", has_event: false }));
  }
}
