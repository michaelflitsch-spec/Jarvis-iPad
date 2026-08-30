// Wetter ueber Open-Meteo - kein API-Key noetig.
import { config } from "../config.js";
import { request } from "./http.js";

const CODES = {
  0: "klar", 1: "überwiegend klar", 2: "teilweise bewölkt", 3: "bedeckt",
  45: "neblig", 48: "Nebel mit Reifablagerung", 51: "leichter Nieselregen",
  53: "Nieselregen", 55: "starker Nieselregen", 61: "leichter Regen", 63: "Regen",
  65: "starker Regen", 66: "gefrierender Regen", 71: "leichter Schneefall",
  73: "Schneefall", 75: "starker Schneefall", 77: "Schneegriesel",
  80: "Regenschauer", 81: "kräftige Regenschauer", 82: "heftige Regenschauer",
  85: "Schneeschauer", 86: "starke Schneeschauer", 95: "Gewitter",
  96: "Gewitter mit Hagel", 99: "schweres Gewitter mit Hagel",
};

async function geocode(city) {
  const q = new URLSearchParams({ name: city, count: "1", language: "de", format: "json" });
  const r = await request("geocode", `https://geocoding-api.open-meteo.com/v1/search?${q}`);
  const hit = r.results?.[0];
  if (!hit) throw new Error(`Ort "${city}" wurde nicht gefunden.`);
  return { latitude: hit.latitude, longitude: hit.longitude, city: hit.name };
}

export async function getWeather({ location, latitude, longitude } = {}) {
  let lat = latitude ?? config.owner.latitude;
  let lon = longitude ?? config.owner.longitude;
  let city = location || config.owner.city;
  if (location) ({ latitude: lat, longitude: lon, city } = await geocode(location));
  if (lat == null || lon == null) {
    if (!city) throw new Error("Kein Ort bekannt. HOME_LAT/HOME_LON oder HOME_CITY setzen.");
    ({ latitude: lat, longitude: lon, city } = await geocode(city));
  }

  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset",
    timezone: config.owner.timezone,
    forecast_days: "2",
  });
  const w = await request("open-meteo", `https://api.open-meteo.com/v1/forecast?${q}`);
  const d = w.daily;
  return {
    city: city || "aktueller Standort",
    temperature: Math.round(w.current.temperature_2m),
    feelsLike: Math.round(w.current.apparent_temperature),
    wind: Math.round(w.current.wind_speed_10m),
    code: w.current.weather_code,
    condition: CODES[w.current.weather_code] || "wechselhaft",
    today: {
      max: Math.round(d.temperature_2m_max[0]),
      min: Math.round(d.temperature_2m_min[0]),
      rainChance: d.precipitation_probability_max?.[0] ?? null,
      condition: CODES[d.weather_code[0]] || "wechselhaft",
      sunrise: d.sunrise?.[0],
      sunset: d.sunset?.[0],
    },
    tomorrow: {
      max: Math.round(d.temperature_2m_max[1]),
      min: Math.round(d.temperature_2m_min[1]),
      rainChance: d.precipitation_probability_max?.[1] ?? null,
      condition: CODES[d.weather_code[1]] || "wechselhaft",
    },
  };
}

export function weatherSentence(w) {
  const rain = w.today.rainChance != null ? ` Regenwahrscheinlichkeit ${w.today.rainChance} Prozent.` : "";
  return `In ${w.city} sind es aktuell ${w.temperature} Grad, ${w.condition}. Gefühlt ${w.feelsLike} Grad. Heute zwischen ${w.today.min} und ${w.today.max} Grad.${rain}`;
}
