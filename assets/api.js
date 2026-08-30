// Backend-Client. Ohne konfiguriertes Backend faellt alles auf lokale
// Funktionen zurueck, damit die Oberflaeche auf GitHub Pages allein laeuft.
import { settings } from "./config.js";

class Api {
  get base() { return (settings.get("backend") || "").replace(/\/$/, ""); }
  get online() { return Boolean(this.base); }

  async call(path, { method = "GET", body, timeout = 45000 } = {}) {
    if (!this.online) throw new OfflineError();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(this.base + path, {
        method,
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-jarvis-token": settings.get("token") || "" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `Backend antwortet mit ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("Das Backend hat nicht rechtzeitig geantwortet.");
      throw e;
    } finally { clearTimeout(t); }
  }

  status()               { return this.call("/api/status"); }
  briefing()             { return this.call("/api/briefing", { timeout: 60000 }); }
  weather(location)      { return this.call(`/api/weather${location ? `?location=${encodeURIComponent(location)}` : ""}`); }
  tasks()                { return this.call("/api/tasks"); }
  addTask(task)          { return this.call("/api/tasks", { method: "POST", body: task }); }
  completeTask(id)       { return this.call(`/api/tasks/${encodeURIComponent(id)}/complete`, { method: "POST" }); }
  deleteTask(id)         { return this.call(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  mail(q, triage)        { return this.call(`/api/mail?q=${encodeURIComponent(q || "is:unread newer_than:2d")}${triage ? "&triage=1" : ""}`, { timeout: 60000 }); }
  calendar(days = 1)     { return this.call(`/api/calendar?days=${days}`); }
  playMusic(query, volume){ return this.call("/api/spotify/play", { method: "POST", body: { query, volume } }); }
  musicVolume(volume)    { return this.call("/api/spotify/volume", { method: "POST", body: { volume } }); }
  pauseMusic()           { return this.call("/api/spotify/pause", { method: "POST" }); }
  chat(message, history, context) {
    return this.call("/api/chat", { method: "POST", body: { message, history, context }, timeout: 120000 });
  }
  callPhone(message)     { return this.call("/api/notify/call", { method: "POST", body: { message } }); }
}

export class OfflineError extends Error {
  constructor() { super("Kein Backend verbunden."); this.name = "OfflineError"; }
}

export const api = new Api();

/* ---------------------- Fallbacks ohne Backend ---------------------------- */

const CODES = {
  0:"klar",1:"überwiegend klar",2:"teilweise bewölkt",3:"bedeckt",45:"neblig",48:"Nebel",
  51:"leichter Nieselregen",53:"Nieselregen",55:"starker Nieselregen",61:"leichter Regen",
  63:"Regen",65:"starker Regen",71:"leichter Schneefall",73:"Schneefall",75:"starker Schneefall",
  80:"Regenschauer",81:"kräftige Schauer",82:"heftige Schauer",95:"Gewitter",96:"Gewitter mit Hagel",
};

/** Wetter direkt vom Browser aus - ohne API-Key, ohne Backend. */
export async function localWeather(city) {
  let lat, lon, place = city;
  if (city) {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=de&format=json`).then((r) => r.json());
    const hit = g.results?.[0];
    if (!hit) throw new Error(`Ort "${city}" nicht gefunden.`);
    ({ latitude: lat, longitude: lon } = hit);
    place = hit.name;
  } else {
    const p = await fetch("https://ipapi.co/json/").then((r) => r.json());
    lat = p.latitude; lon = p.longitude; place = p.city || "deinem Standort";
  }
  const w = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`,
  ).then((r) => r.json());

  const out = {
    city: place,
    temperature: Math.round(w.current.temperature_2m),
    feelsLike: Math.round(w.current.apparent_temperature),
    condition: CODES[w.current.weather_code] || "wechselhaft",
    today: {
      max: Math.round(w.daily.temperature_2m_max[0]),
      min: Math.round(w.daily.temperature_2m_min[0]),
      rainChance: w.daily.precipitation_probability_max?.[0] ?? null,
    },
  };
  out.sentence =
    `In ${out.city} sind es aktuell ${out.temperature} Grad, ${out.condition}. ` +
    `Heute zwischen ${out.today.min} und ${out.today.max} Grad.` +
    (out.today.rainChance != null ? ` Regenwahrscheinlichkeit ${out.today.rainChance} Prozent.` : "");
  return out;
}
