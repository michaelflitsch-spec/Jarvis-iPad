// JARVIS Backend - ein einzelner Express-Dienst.
// Das iPad-Frontend spricht nur mit diesem Server; alle Secrets bleiben hier.
import express from "express";
import { config, featureStatus } from "./config.js";
import { store } from "./store.js";
import {
  googleAuthUrl, googleExchangeCode, googleConfigured, googleConnected, googleDisconnect,
  gmailList, gmailGet, calendarList, calendarCreate,
} from "./lib/google.js";
import {
  spotifyAuthUrl, spotifyExchangeCode, spotifyConfigured, spotifyConnected, spotifyDisconnect,
  play as spotifyPlay, pause as spotifyPause, setVolume, devices, searchTrack,
} from "./lib/spotify.js";
import { notionConfigured, notionCreatePlanPage } from "./lib/notion.js";
import { listTasks, addTask, completeTask, deleteTask, overdue } from "./lib/tasks.js";
import { getWeather, weatherSentence } from "./lib/weather.js";
import { ask, triageMails, claudeConfigured } from "./lib/claude.js";
import { alert, callPhone, phoneConfigured } from "./lib/notify.js";
import { startWatcher, watcherStatus, checkMailsOnce } from "./lib/watcher.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

/* ---------------------------------- CORS ---------------------------------- */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow =
    config.allowedOrigins.includes("*") || (origin && config.allowedOrigins.includes(origin));
  if (allow) {
    res.setHeader("access-control-allow-origin", origin || "*");
    res.setHeader("vary", "Origin");
  }
  res.setHeader("access-control-allow-headers", "content-type,x-jarvis-token");
  res.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* -------------------------------- Auth-Gate -------------------------------- */
// Alles unter /api ist mit dem Shared Secret geschuetzt (Gmail-Zugriff!).
app.use("/api", (req, res, next) => {
  if (!config.accessToken) return next(); // lokale Entwicklung ohne Token
  const token = req.headers["x-jarvis-token"] || req.query.token;
  if (token !== config.accessToken) return res.status(401).json({ error: "Nicht autorisiert." });
  next();
});

const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(`[${req.method} ${req.path}]`, e.message);
    res.status(e.status === 401 ? 401 : 500).json({ error: e.message, service: e.service });
  });
};

/* ------------------------------- Basis-Status ------------------------------ */
app.get("/", (_req, res) => {
  const f = featureStatus();
  res.type("html").send(`<!doctype html><meta charset=utf-8><title>JARVIS Backend</title>
<style>body{background:#02080c;color:#a9fbff;font:14px ui-monospace,monospace;padding:32px;line-height:1.7}
a{color:#29f3ff}h1{letter-spacing:6px}code{color:#8fffff}li{margin:4px 0}</style>
<h1>J.A.R.V.I.S.</h1><p>Backend laeuft.</p>
<h3>Systeme</h3><ul>
<li>Claude: ${f.claude ? "konfiguriert" : "<b>ANTHROPIC_API_KEY fehlt</b>"}</li>
<li>Google: ${googleConnected() ? 'verbunden &middot; <a href="/auth/google">Konto wechseln</a> &middot; <a href="/auth/google/disconnect">trennen</a>' : googleConfigured() ? '<a href="/auth/google">jetzt verbinden</a>' : "<b>nicht konfiguriert</b>"}</li>
<li>Spotify: ${spotifyConnected() ? 'verbunden &middot; <a href="/auth/spotify">Konto wechseln</a> &middot; <a href="/auth/spotify/disconnect">trennen</a>' : spotifyConfigured() ? '<a href="/auth/spotify">jetzt verbinden</a>' : "<b>nicht konfiguriert</b>"}</li>
<li>Notion: ${f.notion ? "konfiguriert" : "nicht konfiguriert"}</li>
<li>Telefon: ${f.phone ? "konfiguriert" : "nicht konfiguriert"}</li>
</ul><p>Status als JSON: <code>/api/status</code></p>`);
});

app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    features: featureStatus(),
    connected: { google: googleConnected(), spotify: spotifyConnected() },
    owner: { name: config.owner.name, timezone: config.owner.timezone, city: config.owner.city },
    watcher: watcherStatus(),
    model: config.anthropic.model,
    time: new Date().toISOString(),
  });
});

/* ---------------------------------- OAuth ---------------------------------- */
const done = (res, what) =>
  res.type("html").send(
    `<meta charset=utf-8><body style="background:#02080c;color:#29f3ff;font:16px monospace;padding:40px">
     ${what} verbunden. Du kannst dieses Fenster schliessen und zu JARVIS zurueckkehren.</body>`,
  );

app.get("/auth/google", (_req, res) => {
  if (!googleConfigured()) return res.status(400).send("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET fehlen.");
  res.redirect(googleAuthUrl());
});
app.get("/auth/google/callback", wrap(async (req, res) => {
  if (req.query.error) return res.status(400).send(`Google-Fehler: ${req.query.error}`);
  await googleExchangeCode(req.query.code);
  done(res, "Google (Gmail + Kalender)");
}));

// Verbindung loesen - danach fuehrt /auth/... zu einer frischen Anmeldung.
app.get("/auth/google/disconnect", (_req, res) => {
  googleDisconnect();
  res.type("html").send(`<meta charset=utf-8><body style="background:#02080c;color:#29f3ff;font:16px monospace;padding:40px">
    Google getrennt. <a style="color:#29f3ff" href="/auth/google">Jetzt mit einem anderen Konto verbinden</a>.</body>`);
});
app.get("/auth/spotify/disconnect", (_req, res) => {
  spotifyDisconnect();
  res.type("html").send(`<meta charset=utf-8><body style="background:#02080c;color:#29f3ff;font:16px monospace;padding:40px">
    Spotify getrennt. <a style="color:#29f3ff" href="/auth/spotify">Jetzt mit einem anderen Konto verbinden</a>.</body>`);
});

app.get("/auth/spotify", (_req, res) => {
  if (!spotifyConfigured()) return res.status(400).send("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET fehlen.");
  res.redirect(spotifyAuthUrl());
});
app.get("/auth/spotify/callback", wrap(async (req, res) => {
  if (req.query.error) return res.status(400).send(`Spotify-Fehler: ${req.query.error}`);
  await spotifyExchangeCode(req.query.code);
  done(res, "Spotify");
}));

/* --------------------------------- Wetter --------------------------------- */
app.get("/api/weather", wrap(async (req, res) => {
  const w = await getWeather({ location: req.query.location });
  res.json({ ...w, sentence: weatherSentence(w) });
}));

/* -------------------------------- Aufgaben -------------------------------- */
app.get("/api/tasks", wrap(async (req, res) => {
  const tasks = await listTasks({ includeDone: req.query.all === "1" });
  res.json({ tasks, overdue: overdue(tasks).length });
}));
app.post("/api/tasks", wrap(async (req, res) => res.json(await addTask(req.body))));
app.post("/api/tasks/:id/complete", wrap(async (req, res) => res.json(await completeTask(req.params.id))));
app.delete("/api/tasks/:id", wrap(async (req, res) => res.json(deleteTask(req.params.id))));

/* ---------------------------------- Gmail ---------------------------------- */
app.get("/api/mail", wrap(async (req, res) => {
  const mails = await gmailList({
    query: req.query.q || "is:unread newer_than:2d",
    max: Number(req.query.max || 8),
  });
  if (req.query.triage === "1" && mails.length) {
    const rated = new Map((await triageMails(mails)).map((r) => [r.id, r]));
    return res.json({ mails: mails.map((m) => ({ ...m, ...(rated.get(m.id) || {}) })) });
  }
  res.json({ mails });
}));
app.get("/api/mail/:id", wrap(async (req, res) => res.json(await gmailGet(req.params.id))));

/* -------------------------------- Kalender -------------------------------- */
app.get("/api/calendar", wrap(async (req, res) => {
  const days = Math.max(1, Math.min(31, Number(req.query.days || 1)));
  const start = new Date(); start.setHours(0, 0, 0, 0);
  res.json({
    events: await calendarList({
      timeMin: start.toISOString(),
      timeMax: new Date(start.getTime() + days * 86400000).toISOString(),
      max: 50,
    }),
  });
}));
app.post("/api/calendar", wrap(async (req, res) => res.json(await calendarCreate(req.body))));

/* --------------------------------- Spotify --------------------------------- */
app.get("/api/spotify/devices", wrap(async (_req, res) => res.json({ devices: await devices() })));
app.post("/api/spotify/play", wrap(async (req, res) => {
  const { query, uri, volume } = req.body || {};
  try {
    res.json(await spotifyPlay({ query, uri, volume: volume ?? config.spotify.bootVolume }));
  } catch (e) {
    // Kein aktives Geraet: dem Frontend einen Deeplink geben, damit der Nutzer
    // die Wiedergabe mit einem Tipp selbst startet.
    const track = e.track || (await searchTrack(query || config.spotify.bootTrackQuery).catch(() => null));
    res.status(409).json({
      error: e.message,
      code: e.code || "PLAY_FAILED",
      fallbackUrl: track?.url || `https://open.spotify.com/search/${encodeURIComponent(query || "Back In Black AC/DC")}`,
      track,
    });
  }
}));
app.post("/api/spotify/volume", wrap(async (req, res) => res.json({ ok: await setVolume(req.body?.volume ?? 25) })));
app.post("/api/spotify/pause", wrap(async (_req, res) => res.json({ ok: await spotifyPause() })));

/* ---------------------------------- Notion --------------------------------- */
app.post("/api/notion/plan", wrap(async (req, res) => {
  if (!notionConfigured()) return res.status(400).json({ error: "Notion ist nicht konfiguriert." });
  res.json(await notionCreatePlanPage({ title: req.body.title, markdown: req.body.markdown }));
}));

/* -------------------------------- Telefonie -------------------------------- */
app.post("/api/notify/call", wrap(async (req, res) => {
  const message = req.body?.message;
  if (!message) return res.status(400).json({ error: "message fehlt." });
  if (phoneConfigured()) return res.json(await callPhone({ message, to: req.body.to }));
  res.json(await alert({ title: "JARVIS", message }));
}));
app.get("/api/watcher", wrap(async (_req, res) => res.json(watcherStatus())));
app.post("/api/watcher/run", wrap(async (_req, res) => res.json(await checkMailsOnce({ force: true }))));

/* ---------------------------------- Chat ----------------------------------- */
app.post("/api/chat", wrap(async (req, res) => {
  if (!claudeConfigured()) return res.status(400).json({ error: "ANTHROPIC_API_KEY fehlt." });
  const { message, history = [], context = "" } = req.body || {};
  if (!message) return res.status(400).json({ error: "message fehlt." });
  const r = await ask({ message, history, systemExtra: context });
  res.json(r);
}));

/* ------------------------------- Morgen-Briefing --------------------------- */
// Ein einziger Aufruf liefert alles, was JARVIS beim Hochfahren vorliest.
app.get("/api/briefing", wrap(async (_req, res) => {
  const problems = [];
  const settled = async (p, fallback, label) => {
    try { return await p; }
    catch (e) { problems.push(`${label}: ${e.message}`); return fallback; }
  };
  const start = new Date(); start.setHours(0, 0, 0, 0);

  const [weather, tasks, events, mails] = await Promise.all([
    settled(getWeather({}), null, "Wetter"),
    settled(listTasks({}), [], "Aufgaben"),
    googleConnected()
      ? settled(calendarList({ timeMin: new Date().toISOString(), timeMax: new Date(start.getTime() + 86400000).toISOString() }), [], "Kalender")
      : Promise.resolve([]),
    googleConnected() ? settled(gmailList({ query: "is:unread newer_than:1d", max: 8 }), [], "Gmail") : Promise.resolve([]),
  ]);

  let rated = [];
  if (mails.length && claudeConfigured()) {
    rated = await triageMails(mails).catch((e) => { problems.push(`Mail-Bewertung: ${e.message}`); return []; });
  }
  const byId = new Map(rated.map((r) => [r.id, r]));
  const mailList = mails.map((m) => ({ ...m, ...(byId.get(m.id) || {}) }));

  if (problems.length) console.warn("[briefing]", problems.join(" | "));
  store.set("lastBriefing", new Date().toISOString());
  res.json({
    weather: weather ? { ...weather, sentence: weatherSentence(weather) } : null,
    tasks,
    overdue: overdue(tasks),
    events,
    mails: mailList.sort((a, b) => (b.importance || 0) - (a.importance || 0)),
    problems,
    generatedAt: new Date().toISOString(),
  });
}));

app.use((req, res) => res.status(404).json({ error: `Unbekannte Route ${req.method} ${req.path}` }));

app.listen(config.port, () => {
  console.log(`JARVIS Backend auf Port ${config.port} (${config.publicUrl})`);
  console.log("Systeme:", featureStatus());
  const w = startWatcher();
  if (w.running) console.log(`Mail-Waechter aktiv, alle ${w.intervalMinutes} Minuten.`);
});

process.on("SIGTERM", () => { store.flush(); process.exit(0); });
process.on("SIGINT", () => { store.flush(); process.exit(0); });
