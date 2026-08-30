// Nutzer-Einstellungen. Liegen im localStorage des iPads - nichts davon
// verlaesst das Geraet ausser der Anfrage an dein eigenes Backend.
const KEY = "jarvis.settings.v1";

const defaults = {
  backend: "",            // z. B. https://jarvis-backend.onrender.com
  token: "",              // muss JARVIS_TOKEN im Backend entsprechen
  name: "Sir",
  city: "",               // fuer das Wetter ohne Backend
  wakeWord: true,         // dauerhaft auf "Jarvis" lauschen
  autoBriefing: true,     // nach dem Hochfahren automatisch briefen
  music: true,            // beim Hochfahren Musik starten
  bootTrack: "Back In Black AC/DC",
  voiceRate: 0.95,
  voicePitch: 0.85,
};

function read() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { ...defaults }; }
}

export const settings = {
  get all() { return read(); },
  get(k) { return read()[k]; },
  set(patch) {
    const next = { ...read(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  },
  get hasBackend() { return Boolean(read().backend); },
};

// Weckwort-Varianten: die Spracherkennung versteht "Jarvis" selten exakt.
export const WAKE_PATTERNS = [
  "jarvis", "jarvis.", "jervis", "jarwis", "jarves", "charvis", "dscharvis",
  "service", "harvest", "jarvi", "jarfis", "yarvis",
];
