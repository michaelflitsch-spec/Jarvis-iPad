// Sprache: Vorlesen (TTS), Weckwort-Dauerlauschen und Diktat (STT).
// Auf iOS gilt: Audio und Mikrofon brauchen einmal eine echte Nutzer-Geste.
import { settings, WAKE_PATTERNS } from "./config.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const sttSupported = Boolean(SR);
export const ttsSupported = "speechSynthesis" in window;

/* ---------------------------------- TTS ----------------------------------- */

let germanVoice = null;
function pickVoice() {
  if (!ttsSupported) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  const de = voices.filter((v) => v.lang?.toLowerCase().startsWith("de"));
  // Tiefere/maennliche Stimmen kommen JARVIS am naechsten.
  const preferred = ["Markus", "Yannick", "Google Deutsch", "Anna", "Petra", "Helena"];
  for (const name of preferred) {
    const hit = de.find((v) => v.name.includes(name));
    if (hit) return hit;
  }
  return de[0] || voices[0];
}
if (ttsSupported) {
  const load = () => { germanVoice = pickVoice(); };
  load();
  speechSynthesis.addEventListener("voiceschanged", load);
}

const listeners = { speakstart: [], speakend: [], boundary: [] };
export const onVoice = (event, fn) => listeners[event]?.push(fn);
const emit = (event, arg) => listeners[event]?.forEach((fn) => fn(arg));

let speakingChain = Promise.resolve();
let currentUtterance = null;

/**
 * Liest Text vor und loest auf, wenn er fertig ist. Aufrufe werden in einer
 * Kette serialisiert, damit das Briefing Satz fuer Satz laeuft.
 */
export function speak(text, { interrupt = false } = {}) {
  if (!ttsSupported || !text) return Promise.resolve();
  if (interrupt) { speechSynthesis.cancel(); speakingChain = Promise.resolve(); }

  speakingChain = speakingChain.then(
    () =>
      new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "de-DE";
        u.rate = settings.get("voiceRate");
        u.pitch = settings.get("voicePitch");
        if (germanVoice) u.voice = germanVoice;

        let settled = false;
        const finish = () => { if (settled) return; settled = true; currentUtterance = null; emit("speakend"); resolve(); };
        u.onstart = () => { currentUtterance = u; emit("speakstart", text); };
        u.onboundary = (e) => emit("boundary", e);
        u.onend = finish;
        u.onerror = finish;

        // Safari bricht lange Aeusserungen gelegentlich still ab - Sicherheitsnetz.
        const guard = setTimeout(finish, Math.max(6000, text.length * 130));
        const clear = () => clearTimeout(guard);
        u.addEventListener("end", clear);
        u.addEventListener("error", clear);

        speechSynthesis.speak(u);
      }),
  );
  return speakingChain;
}

export function stopSpeaking() {
  if (!ttsSupported) return;
  speechSynthesis.cancel();
  currentUtterance = null;
  speakingChain = Promise.resolve();
  emit("speakend");
}
export const isSpeaking = () => Boolean(currentUtterance) || (ttsSupported && speechSynthesis.speaking);

/** iOS gibt Audio erst nach einer Nutzer-Geste frei - hier einmal "anstupsen". */
export function unlockAudio() {
  if (!ttsSupported) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

/* ------------------------- Weckwort und Diktat ---------------------------- */

const norm = (s) => s.toLowerCase().replace(/[^a-zäöüß ]/g, " ").replace(/\s+/g, " ").trim();

export function containsWakeWord(transcript) {
  const words = norm(transcript).split(" ");
  return words.some((w) => WAKE_PATTERNS.includes(w));
}

/** Entfernt das Weckwort, damit "Jarvis, wie ist das Wetter" direkt ausgeführt wird. */
export function stripWakeWord(transcript) {
  const words = transcript.split(/\s+/);
  while (words.length && WAKE_PATTERNS.includes(norm(words[0]))) words.shift();
  return words.join(" ").replace(/^[,.\s]+/, "").trim();
}

/**
 * Dauerlauschen auf das Weckwort. Safari beendet die Erkennung nach jeder
 * Aeusserung, deshalb wird sie mit wachsender Wartezeit neu gestartet.
 */
export class WakeListener {
  constructor({ onWake, onState = () => {}, onError = () => {} }) {
    this.onWake = onWake;
    this.onState = onState;
    this.onError = onError;
    this.want = false;
    this.rec = null;
    this.backoff = 400;
    this.paused = false;
  }

  start() {
    if (!sttSupported) { this.onError("Spracherkennung wird in diesem Browser nicht unterstützt."); return false; }
    this.want = true;
    this._spin();
    return true;
  }

  stop() {
    this.want = false;
    clearTimeout(this.retryTimer);
    try { this.rec?.abort(); } catch { /* egal */ }
    this.rec = null;
    this.onState("off");
  }

  /** Waehrend JARVIS spricht, pausieren - sonst hoert er sich selbst zu. */
  pause() { this.paused = true; try { this.rec?.abort(); } catch { /* egal */ } }
  resume() {
    this.paused = false;
    if (this.want) { this.backoff = 400; this._spin(); }
  }

  _spin() {
    if (!this.want || this.paused || this.rec) return;
    const rec = new SR();
    rec.lang = "de-DE";
    rec.continuous = true;      // von Safari teils ignoriert - Neustart faengt das ab
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => { this.backoff = 400; this.onState("listening"); };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const alt = e.results[i][0];
        const text = alt.transcript || "";
        if (!containsWakeWord(text)) continue;
        // Bei Zwischenergebnissen auf das Endergebnis warten, damit ein
        // direkt angehaengter Befehl ("Jarvis, Wetter") nicht verloren geht.
        if (!e.results[i].isFinal) { this.onState("wake-pending"); continue; }
        const rest = stripWakeWord(text);
        this.pause();
        this.onWake(rest);
        return;
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.want = false;
        this.onError("Mikrofonzugriff wurde abgelehnt. In Safari unter Einstellungen erlauben.");
      }
    };
    rec.onend = () => {
      // Ein spaet eintreffendes onend darf eine inzwischen neu gestartete
      // Erkennung nicht abraeumen - sonst laeuft der Neustart doppelt.
      if (this.rec !== rec) return;
      this.rec = null;
      this.onState(this.want && !this.paused ? "restarting" : "off");
      if (!this.want || this.paused) return;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this._spin(), this.backoff);
      this.backoff = Math.min(this.backoff * 1.6, 5000);
    };

    this.rec = rec;
    try { rec.start(); }
    catch {
      this.rec = null;
      clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this._spin(), 800);
    }
  }
}

/** Einmaliges Diktat fuer den Mikrofon-Knopf. */
export function dictateOnce({ onState = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    if (!sttSupported) return reject(new Error("Spracherkennung wird hier nicht unterstützt."));
    const rec = new SR();
    rec.lang = "de-DE";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let got = null;
    rec.onstart = () => onState("listening");
    rec.onresult = (e) => { got = e.results[0][0].transcript; };
    rec.onerror = (e) => { onState("off"); reject(new Error(e.error === "no-speech" ? "Ich habe nichts gehört." : `Mikrofon-Fehler: ${e.error}`)); };
    rec.onend = () => { onState("off"); got ? resolve(got) : reject(new Error("Ich habe nichts verstanden.")); };
    rec.start();
  });
}
