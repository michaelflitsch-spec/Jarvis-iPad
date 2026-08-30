// Hintergrundwaechter: prueft regelmaessig neue Mails, bewertet sie und ruft
// bei wirklich dringenden Nachrichten auf dem iPhone an.
import { config } from "../config.js";
import { store } from "../store.js";
import { gmailList, googleConnected } from "./google.js";
import { triageMails } from "./claude.js";
import { alert } from "./notify.js";

let timer = null;
let lastRun = null;
let lastResult = null;

function inQuietHours(now = new Date()) {
  const m = (config.watcher.quietHours || "").match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const mins = (h, mi) => Number(h) * 60 + Number(mi);
  const t = now.getHours() * 60 + now.getMinutes();
  const from = mins(m[1], m[2]);
  const to = mins(m[3], m[4]);
  return from <= to ? t >= from && t < to : t >= from || t < to; // ueber Mitternacht
}

export async function checkMailsOnce({ force = false } = {}) {
  if (!googleConnected()) return { skipped: "google-nicht-verbunden" };

  const mails = await gmailList({ query: "is:unread newer_than:1d", max: 10 });
  const seen = new Set(store.get("seenMailIds") || []);
  const fresh = mails.filter((m) => !seen.has(m.id));
  if (!fresh.length) return { checked: mails.length, new: 0 };

  const rated = await triageMails(fresh);
  const byId = new Map(rated.map((r) => [r.id, r]));
  const urgent = fresh
    .map((m) => ({ ...m, ...(byId.get(m.id) || { importance: 2 }) }))
    .filter((m) => m.importance >= config.watcher.callThreshold);

  store.set("seenMailIds", [...seen, ...fresh.map((m) => m.id)].slice(-500));

  const notifications = [];
  if (urgent.length && (force || !inQuietHours())) {
    const top = urgent[0];
    const text =
      urgent.length === 1
        ? `Wichtige Nachricht von ${top.from.replace(/<.*>/, "").trim()}. ${top.summary}`
        : `${urgent.length} wichtige Nachrichten. Die dringendste von ${top.from.replace(/<.*>/, "").trim()}. ${top.summary}`;
    const r = await alert({ title: "JARVIS - dringende Mail", message: text });
    notifications.push({ ...r, mailId: top.id, text });
    store.update("notified", (l) => [...(l || []), { mailId: top.id, at: new Date().toISOString(), channel: r.channel }].slice(-100));
  }

  lastResult = { checked: mails.length, new: fresh.length, urgent: urgent.length, notifications, quiet: inQuietHours() };
  return lastResult;
}

export function startWatcher() {
  if (!config.watcher.enabled) return { running: false, reason: "MAIL_WATCH_ENABLED ist aus." };
  if (timer) return { running: true };
  const run = async () => {
    lastRun = new Date().toISOString();
    try { await checkMailsOnce(); }
    catch (e) { console.error("[watcher]", e.message); lastResult = { error: e.message }; }
  };
  timer = setInterval(run, Math.max(2, config.watcher.intervalMinutes) * 60 * 1000);
  run();
  return { running: true, intervalMinutes: config.watcher.intervalMinutes };
}

export const watcherStatus = () => ({
  enabled: config.watcher.enabled,
  running: Boolean(timer),
  intervalMinutes: config.watcher.intervalMinutes,
  callThreshold: config.watcher.callThreshold,
  quietHours: config.watcher.quietHours,
  quietNow: inQuietHours(),
  lastRun,
  lastResult,
});
