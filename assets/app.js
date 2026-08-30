// JARVIS - Ablaufsteuerung: Weckwort, Hochfahren mit Musik, Briefing, Gespräch.
import { settings, trackUrlFor } from "./config.js";
import { api, localWeather, OfflineError } from "./api.js";
import { speak, stopSpeaking, isSpeaking, unlockAudio, dictateOnce, WakeListener, sttSupported, ttsSupported, onVoice } from "./voice.js";
import { Waveform, Log, BootSequence } from "./hud.js";
import { TaskManager } from "./tasks.js";

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

const el = {
  gate: $("#gate"), gateBtn: $("#gate-btn"), gateNote: $("#gate-note"),
  boot: $("#boot"), app: $("#app"), arc: $("#main-arc"), wave: $("#wave"),
  subtitle: $("#subtitle"), log: $("#log"), input: $("#cmd"), send: $("#send"), mic: $("#mic"),
  clock: $("#clock"), date: $("#date"), tempEl: $("#temp"), weatherText: $("#weather-text"),
  events: $("#events"), mails: $("#mails"), cpu: $("#cpu"), cb: $("#cb"), mem: $("#mem"), mb: $("#mb"), up: $("#uptime"),
  chips: { backend: $("#chip-backend"), voice: $("#chip-voice"), mail: $("#chip-mail"), music: $("#chip-music") },
  taskWin: $("#taskwin"), sheet: $("#sheet"),
};

const log = new Log(el.log);
const wave = new Waveform(el.wave);
const boot = new BootSequence(el.boot);
const started = Date.now();

const tasks = new TaskManager({
  win: el.taskWin,
  listEl: $("#task-list"),
  input: $("#task-input"),
  addBtn: $("#task-add"),
  closeBtn: $("#task-close"),
  titleEl: $("#task-title"),
});

const state = {
  history: [],       // Gespraechsverlauf fuer Claude
  awake: false,      // Boot bereits gelaufen?
  busy: false,
  backend: null,     // Status-Antwort des Backends
  musicPlaying: false,
};

/* --------------------------- Sprechen + Untertitel ------------------------ */

let resumeTimer = null;

async function say(text, { log: doLog = true } = {}) {
  if (!text) return;
  el.subtitle.textContent = text;
  if (doLog) log.add(text, "j");
  el.arc.classList.add("speaking");
  // Beim Briefing folgen die Saetze dicht aufeinander. Der verzoegerte
  // resume verhindert, dass die Erkennung dazwischen staendig neu startet -
  // und dass JARVIS sich selbst als Weckwort hoert.
  clearTimeout(resumeTimer);
  wake?.pause();
  await speak(text);
  el.arc.classList.remove("speaking");
  resumeTimer = setTimeout(() => wake?.resume(), 450);
}

onVoice("speakend", () => { if (!isSpeaking()) el.arc.classList.remove("speaking"); });

/* --------------------------------- Uhr/HUD -------------------------------- */

function tick() {
  const d = new Date();
  el.clock.textContent = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  el.date.textContent = d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
  const s = Math.floor((Date.now() - started) / 1000);
  el.up.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
setInterval(tick, 1000); tick();

// Rein dekorative Systemanzeige - sie misst nichts Echtes und behauptet das auch nicht.
setInterval(() => {
  const c = 18 + Math.floor(Math.random() * 34), m = 42 + Math.floor(Math.random() * 24);
  el.cpu.textContent = `${c} %`; el.cb.style.width = `${c}%`;
  el.mem.textContent = `${m} %`; el.mb.style.width = `${m}%`;
}, 2200);

function chip(name, on, cls = "on") {
  const node = el.chips[name];
  if (!node) return;
  node.classList.remove("on", "warn");
  if (on) node.classList.add(cls);
}

/* ------------------------------ Backend-Status ---------------------------- */

async function refreshStatus() {
  if (!api.online) {
    chip("backend", false);
    chip("mail", false);
    chip("music", false);
    return null;
  }
  try {
    state.backend = await api.status();
    chip("backend", true);
    chip("mail", state.backend.connected.google, state.backend.connected.google ? "on" : "warn");
    chip("music", state.backend.connected.spotify, state.backend.connected.spotify ? "on" : "warn");
    return state.backend;
  } catch (e) {
    state.backend = null;
    chip("backend", true, "warn");
    log.add(`Backend nicht erreichbar: ${e.message}`, "s");
    return null;
  }
}

/* -------------------------------- Musik ----------------------------------- */

/** Startet den Boot-Song. Ohne Backend gibt es einen Deeplink zum Antippen. */
async function startBootMusic() {
  const query = settings.get("bootTrack");
  if (!settings.get("music")) return { skipped: true };
  // Direktlink, wenn wir den Titel kennen - sonst die Spotify-Suche.
  const deepLink = trackUrlFor(query) || `https://open.spotify.com/search/${encodeURIComponent(query)}`;

  if (!api.online || !state.backend?.connected?.spotify) {
    return { fallbackUrl: deepLink, manual: true };
  }
  try {
    const r = await api.playMusic(query);
    state.musicPlaying = true;
    return r;
  } catch (e) {
    return { error: e.message, fallbackUrl: e.data?.fallbackUrl || deepLink, track: e.data?.track, manual: true };
  }
}

async function duckMusic() {
  if (!state.musicPlaying) return;
  try { await api.musicVolume(22); } catch { /* nicht alle Geraete lassen sich fernsteuern */ }
}

async function stopMusic() {
  if (!api.online) return;
  try { await api.pauseMusic(); state.musicPlaying = false; log.add("Musik pausiert.", "s"); }
  catch { log.add("Musik konnte nicht pausiert werden.", "s"); }
}

/* ------------------------------ Hochfahren -------------------------------- */

async function bootUp(trailingCommand = "") {
  if (state.busy) return;
  state.busy = true;
  el.gate.classList.add("hidden");
  boot.show();
  try {
    await runBootSequence(trailingCommand);
  } catch (e) {
    // Egal was schiefgeht: die Ueberlagerung muss weg, sonst haengt JARVIS.
    log.add(`Hochfahren fehlgeschlagen: ${e.message}`, "s");
    await boot.hide();
    el.app.classList.remove("hidden");
    state.awake = true;
    await say("Beim Hochfahren gab es ein Problem. Details stehen im Log.");
  } finally {
    state.busy = false;
  }
}

async function runBootSequence(trailingCommand = "") {

  const name = settings.get("name");
  await boot.line("> JARVIS CORE ...................... ", "", 8).then((n) => (n.innerHTML += '<span class="ok">ONLINE</span>'));
  await boot.line("> STIMMERKENNUNG ................... ", "", 8).then((n) => (n.innerHTML += `<span class="ok">${name.toUpperCase()}</span>`));

  // Musik parallel starten, damit sie waehrend der restlichen Sequenz laeuft.
  const musicPromise = startBootMusic();
  await boot.line("> AUDIO / SPOTIFY .................. ", "", 8);
  const music = await musicPromise;
  const lastLine = boot.logEl.lastElementChild;

  if (music.skipped) {
    lastLine.innerHTML += '<span class="warnline">DEAKTIVIERT</span>';
  } else if (music.manual || music.error) {
    lastLine.innerHTML += '<span class="warnline">MANUELL</span>';
    showMusicFallback(music.fallbackUrl, music.track);
  } else {
    lastLine.innerHTML += '<span class="ok">WIEDERGABE</span>';
    const t = music.track ? `${music.track.name} — ${music.track.artist}` : settings.get("bootTrack");
    boot.nowPlaying(t);
    log.add(`Spotify: ${t} (${music.device || "aktives Gerät"})`, "s");
  }

  await boot.line("> AUFGABENSPEICHER 7 ............... ", "", 8);
  await tasks.load();
  boot.logEl.lastElementChild.innerHTML += `<span class="ok">${tasks.tasks.length} OFFEN</span>`;

  await boot.line("> SENSORIK / WETTER ................ ", "", 8).then((n) => (n.innerHTML += '<span class="ok">BEREIT</span>'));
  const systems = state.backend
    ? [state.backend.connected.google && "GMAIL", state.backend.connected.google && "KALENDER",
       state.backend.features.notion && "NOTION", state.backend.features.phone && "TELEFONIE"].filter(Boolean)
    : [];
  await boot.line(`> SCHNITTSTELLEN ................... ${systems.length ? systems.join(" · ") : "LOKAL"}`, "", 8);
  await boot.line("", "", 0);
  await boot.line(`> GUTEN TAG, ${name.toUpperCase()}.`, "", 26);

  await sleep(700);
  await boot.hide();
  el.app.classList.remove("hidden");
  tasks.show();
  state.awake = true;

  await sleep(200);
  await duckMusic();

  if (settings.get("autoBriefing")) await briefing();
  else await say(`Ich bin bereit, ${name}.`);

  if (trailingCommand) await handleCommand(trailingCommand);
}

function showMusicFallback(url, track) {
  if (!url) return;
  const bar = $("#music-fallback");
  const link = $("#music-link");
  link.href = url;
  link.textContent = track ? `▶ ${track.name} — ${track.artist}` : "▶ BACK IN BLACK STARTEN";
  bar.classList.remove("hidden");
  link.addEventListener("click", () => { state.musicPlaying = true; bar.classList.add("hidden"); }, { once: true });
}

/* -------------------------------- Briefing -------------------------------- */

async function briefing() {
  const name = settings.get("name");
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  await say(`${greeting}, ${name}. Systeme laufen.`);

  if (api.online && state.backend) {
    await fullBriefing();
  } else {
    await offlineBriefing();
  }
}

async function fullBriefing() {
  let data;
  try {
    log.add("Briefing wird geladen …", "s");
    data = await api.briefing();
  } catch (e) {
    log.add(`Briefing fehlgeschlagen: ${e.message}`, "s");
    return offlineBriefing();
  }

  for (const p of data.problems || []) log.add(p, "s");

  // 1) Wetter
  if (data.weather?.sentence) {
    renderWeather(data.weather);
    await say(data.weather.sentence);
  } else {
    await say("Das Wetter konnte ich gerade nicht abrufen.");
  }

  // 2) Aufgabenspeicher 7
  tasks.tasks = data.tasks || [];
  tasks.render();
  tasks.show();
  await say(tasks.spokenSummary());

  // 3) Termine
  renderEvents(data.events);
  if (data.events?.length) {
    const next = data.events[0];
    await say(
      data.events.length === 1
        ? `Ein Termin heute: ${next.title} um ${fmtTime(next.start)}.`
        : `${data.events.length} Termine heute. Der nächste: ${next.title} um ${fmtTime(next.start)}.`,
    );
  } else {
    await say("Für heute steht kein Termin im Kalender.");
  }

  // 4) Neue Mails
  renderMails(data.mails);
  const mails = data.mails || [];
  if (!mails.length) {
    await say("Keine neuen Mails.");
  } else {
    const urgent = mails.filter((m) => (m.importance || 0) >= 4);
    await say(`${mails.length === 1 ? "Eine neue Mail" : `${mails.length} neue Mails`}.`);
    for (const m of urgent.slice(0, 3)) {
      await say(`Wichtig, von ${cleanSender(m.from)}: ${m.summary || m.subject}`);
    }
    if (urgent.length) {
      await say("Soll ich eine davon vorlesen oder direkt einen Termin dazu eintragen?");
    }
  }
}

async function offlineBriefing() {
  try {
    const w = await localWeather(settings.get("city"));
    renderWeather(w);
    await say(w.sentence);
  } catch {
    await say("Das Wetter konnte ich gerade nicht abrufen.");
  }
  await tasks.load();
  tasks.show();
  await say(tasks.spokenSummary());
  if (!api.online) {
    await say("Mails, Kalender und Notion brauchen noch das Backend. Tippe oben rechts auf Einstellungen, um es zu verbinden.");
  }
}

const cleanSender = (from = "") => from.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || "unbekannt";

/* ------------------------------- Anzeigen --------------------------------- */

function renderWeather(w) {
  if (!w) return;
  el.tempEl.textContent = `${w.temperature}°`;
  el.weatherText.textContent = `${w.condition} · ${w.today.min}° bis ${w.today.max}°${w.today.rainChance != null ? ` · ${w.today.rainChance} % Regen` : ""}`;
}

function renderEvents(events = []) {
  el.events.innerHTML = "";
  if (!events.length) { el.events.innerHTML = '<div class="empty">Keine Termine.</div>'; return; }
  for (const e of events.slice(0, 6)) {
    const div = document.createElement("div");
    div.className = "event";
    div.innerHTML = `<b>${e.allDay ? "ganztägig" : fmtTime(e.start)}</b> · `;
    div.append(document.createTextNode(e.title));
    el.events.appendChild(div);
  }
}

function renderMails(mails = []) {
  el.mails.innerHTML = "";
  if (!mails.length) { el.mails.innerHTML = '<div class="empty">Keine neuen Mails.</div>'; return; }
  for (const m of mails.slice(0, 6)) {
    const div = document.createElement("div");
    div.className = `mail${(m.importance || 0) >= 4 ? " urgent" : ""}`;
    const b = document.createElement("b");
    b.textContent = m.subject;
    const from = document.createElement("span");
    from.className = "from";
    from.textContent = cleanSender(m.from);
    div.append(b, from);
    el.mails.appendChild(div);
  }
}

/* --------------------------- Befehle und Gespräch -------------------------- */

// Ein paar Dinge beantwortet JARVIS ohne Umweg über die API - das ist schneller
// und funktioniert auch ganz ohne Backend.
const LOCAL_COMMANDS = [
  { re: /^(stopp?|ruhe|sei still|schweig)/i, run: async () => { stopSpeaking(); el.subtitle.textContent = ""; } },
  { re: /(wie sp(ä|ae)t|uhrzeit|wie viel uhr)/i, run: () => say(`Es ist ${el.clock.textContent.slice(0, 5)} Uhr.`) },
  { re: /(musik|song|lied).*(aus|stopp?|pausier)/i, run: async () => { await stopMusic(); await say("Musik pausiert."); } },
  { re: /(aufgaben|taskmanager|task manager).*(zeig|öffne|offne|auf)/i, run: async () => { tasks.show(); await say(tasks.spokenSummary()); } },
  { re: /^(taskmanager|aufgabenspeicher)/i, run: async () => { tasks.show(); await say(tasks.spokenSummary()); } },
];

async function handleCommand(text) {
  const q = text.trim();
  if (!q) return;
  log.add(q, "u");
  el.subtitle.textContent = "…";

  for (const c of LOCAL_COMMANDS) {
    if (c.re.test(q)) return c.run();
  }

  // Wetter und Aufgaben gehen ohne Backend lokal.
  if (!api.online) {
    if (/wetter|temperatur|regne/i.test(q)) {
      try {
        const w = await localWeather(settings.get("city"));
        renderWeather(w);
        return say(w.sentence);
      } catch { return say("Das Wetter konnte ich nicht abrufen."); }
    }
    if (/aufgabe|todo|to-do|erledig/i.test(q)) return say(tasks.spokenSummary());
    return say("Dafür brauche ich das Backend. Tippe oben rechts auf Einstellungen und trage die Adresse ein.");
  }

  try {
    el.arc.classList.add("speaking");
    const res = await api.chat(q, state.history, contextLine());
    state.history = res.history || state.history;
    el.arc.classList.remove("speaking");
    await say(res.text);
    for (const a of res.actions || []) applyAction(a);
    if ((res.actions || []).length) await refreshPanels();
  } catch (e) {
    el.arc.classList.remove("speaking");
    if (e instanceof OfflineError) return say("Es ist kein Backend verbunden.");
    log.add(`Fehler: ${e.message}`, "s");
    await say(e.status === 401 ? "Der Zugriffsschlüssel stimmt nicht." : "Da ist etwas schiefgegangen. Details stehen im Log.");
  }
}

// Kurzer Kontext, damit Claude weiss, was gerade auf dem Schirm steht.
const contextLine = () =>
  `Auf dem HUD sichtbar: ${tasks.tasks.length} offene Aufgaben im Aufgabenspeicher 7. ` +
  `Lokale Zeit ${new Date().toLocaleString("de-DE")}.`;

function applyAction(a) {
  const label = {
    task_added: `Aufgabe angelegt: ${a.detail?.title}`,
    task_completed: "Aufgabe abgehakt.",
    event_created: `Termin eingetragen: ${a.detail?.title}`,
    notion_plan: `Notion-Seite erstellt: ${a.detail?.title}`,
    music: `Musik: ${a.detail?.track?.name || "gestartet"}`,
    call: `Anruf ausgelöst (${a.detail?.channel}).`,
  }[a.type];
  if (label) log.add(label, "s");
}

async function refreshPanels() {
  await tasks.load();
  if (!api.online || !state.backend?.connected?.google) return;
  try { renderEvents((await api.calendar(1)).events); } catch { /* Anzeige bleibt */ }
}

/* --------------------------------- Weckwort -------------------------------- */

let wake = null;

function startWakeListener() {
  if (!settings.get("wakeWord") || !sttSupported) { chip("voice", false); return; }
  wake = new WakeListener({
    onWake: async (rest) => {
      chip("voice", true);
      if (!state.awake) { await bootUp(rest); wake.resume(); return; }
      // Bereits wach: direkt zuhoeren bzw. angehaengten Befehl ausfuehren.
      if (rest) { await handleCommand(rest); }
      else { await say("Ja?"); await listenOnce(); }
      wake.resume();
    },
    onState: (s) => {
      el.arc.classList.toggle("listening", s === "listening" || s === "wake-pending");
      chip("voice", s === "listening" || s === "wake-pending" || s === "restarting");
    },
    onError: (msg) => { log.add(msg, "s"); chip("voice", false); },
  });
  wake.start();
}

async function listenOnce() {
  wake?.pause();
  el.mic.classList.add("active");
  el.arc.classList.add("listening");
  try {
    const text = await dictateOnce();
    el.input.value = "";
    await handleCommand(text);
  } catch (e) {
    await say(e.message);
  } finally {
    el.mic.classList.remove("active");
    el.arc.classList.remove("listening");
    wake?.resume();
  }
}

/* ------------------------------ Einstellungen ------------------------------ */

function openSettings() {
  const s = settings.all;
  $("#set-backend").value = s.backend;
  $("#set-token").value = s.token;
  $("#set-name").value = s.name;
  $("#set-city").value = s.city;
  $("#set-track").value = s.bootTrack;
  $("#set-wake").checked = s.wakeWord;
  $("#set-music").checked = s.music;
  $("#set-briefing").checked = s.autoBriefing;
  renderAuthLinks(s.backend);
  el.sheet.classList.remove("hidden");
}

function renderAuthLinks(backend) {
  const box = $("#auth-links");
  if (!backend) { box.innerHTML = "Trage zuerst die Backend-Adresse ein, dann erscheinen hier die Verbinden-Links."; return; }
  const b = backend.replace(/\/$/, "");
  box.innerHTML =
    `<a href="${b}/auth/google" target="_blank" rel="noopener">→ Google verbinden (Gmail + Kalender)</a><br>` +
    `<a href="${b}/auth/spotify" target="_blank" rel="noopener">→ Spotify verbinden</a><br>` +
    `<a href="${b}/" target="_blank" rel="noopener">→ Backend-Status öffnen</a>`;
}

async function saveSettings() {
  settings.set({
    backend: $("#set-backend").value.trim().replace(/\/$/, ""),
    token: $("#set-token").value.trim(),
    name: $("#set-name").value.trim() || "Sir",
    city: $("#set-city").value.trim(),
    bootTrack: $("#set-track").value.trim() || "Back In Black AC/DC",
    wakeWord: $("#set-wake").checked,
    music: $("#set-music").checked,
    autoBriefing: $("#set-briefing").checked,
  });
  el.sheet.classList.add("hidden");
  log.add("Einstellungen gespeichert.", "s");
  await refreshStatus();
  if (settings.get("wakeWord") && !wake) startWakeListener();
  if (!settings.get("wakeWord")) { wake?.stop(); wake = null; chip("voice", false); }
}

/* -------------------------------- Verdrahtung ------------------------------ */

el.gateBtn.addEventListener("click", async () => {
  unlockAudio();                       // iOS: Audio hier freischalten
  await refreshStatus();
  startWakeListener();
  el.gate.classList.add("hidden");
  el.app.classList.remove("hidden");
  log.add("Bereit. Sag „Jarvis“.", "s");
  el.subtitle.textContent = sttSupported
    ? "Sag „Jarvis“ …"
    : "Spracherkennung nicht verfügbar – nutze die Befehlszeile unten.";
  if (!sttSupported) log.add("Dieser Browser kennt keine Spracherkennung. Safari auf dem iPad kann es.", "s");
});

$("#gate-boot").addEventListener("click", async () => {
  unlockAudio();
  await refreshStatus();
  startWakeListener();
  bootUp();
});

el.send.addEventListener("click", () => { const v = el.input.value; el.input.value = ""; handleCommand(v); });
el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const v = el.input.value; el.input.value = ""; handleCommand(v); }
});
el.mic.addEventListener("click", () => listenOnce());

$("#btn-settings").addEventListener("click", openSettings);
$("#sheet-save").addEventListener("click", saveSettings);
$("#sheet-close").addEventListener("click", () => el.sheet.classList.add("hidden"));
$("#set-backend").addEventListener("change", (e) => renderAuthLinks(e.target.value.trim()));

$("#btn-tasks").addEventListener("click", () => tasks.toggle());
$("#btn-boot").addEventListener("click", () => { state.awake = false; bootUp(); });
$("#btn-stop").addEventListener("click", () => { stopSpeaking(); el.subtitle.textContent = ""; });
$("#btn-music-off").addEventListener("click", () => stopMusic());

document.querySelectorAll("[data-cmd]").forEach((b) =>
  b.addEventListener("click", () => handleCommand(b.dataset.cmd)),
);

// Startzustand
if (!ttsSupported) el.gateNote.textContent = "Hinweis: Dieser Browser kann nicht sprechen. Auf dem iPad bitte Safari verwenden.";
refreshStatus();
tasks.load();
