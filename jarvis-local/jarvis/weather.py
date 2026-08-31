"""Wetter via Open-Meteo (kein API-Key noetig) inkl. Bekleidungsempfehlung."""

from __future__ import annotations

import datetime as dt
import json
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.open-meteo.com/v1/forecast"

WEATHER_CODES = {
    0: "klar", 1: "ueberwiegend klar", 2: "teilweise bewoelkt", 3: "bedeckt",
    45: "neblig", 48: "Nebel mit Reifablagerung",
    51: "leichter Nieselregen", 53: "Nieselregen", 55: "starker Nieselregen",
    56: "gefrierender Nieselregen", 57: "gefrierender Nieselregen",
    61: "leichter Regen", 63: "Regen", 65: "starker Regen",
    66: "gefrierender Regen", 67: "starker gefrierender Regen",
    71: "leichter Schneefall", 73: "Schneefall", 75: "starker Schneefall",
    77: "Schneegriesel",
    80: "Regenschauer", 81: "kraeftige Schauer", 82: "heftige Schauer",
    85: "Schneeschauer", 86: "starke Schneeschauer",
    95: "Gewitter", 96: "Gewitter mit Hagel", 99: "schweres Gewitter mit Hagel",
}

WET_CODES = set(range(51, 68)) | set(range(80, 87)) | {95, 96, 99}
SNOW_CODES = set(range(71, 78)) | {85, 86}


class WeatherError(RuntimeError):
    pass


def fetch(latitude: float, longitude: float, timezone: str = "Europe/Vienna",
          timeout: float = 8.0) -> dict:
    query = urllib.parse.urlencode({
        "latitude": latitude,
        "longitude": longitude,
        "timezone": timezone,
        "current": "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,"
                 "precipitation_sum,weather_code,wind_speed_10m_max,sunrise,sunset",
        "forecast_days": 2,
    })
    try:
        with urllib.request.urlopen(f"{API}?{query}", timeout=timeout) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise WeatherError(f"Wetterdaten nicht abrufbar: {exc}") from exc

    current = raw.get("current", {})
    daily = raw.get("daily", {})

    def day0(key, default=None):
        values = daily.get(key) or []
        return values[0] if values else default

    code = int(current.get("weather_code", 0) or 0)
    return {
        "temperature": _round(current.get("temperature_2m")),
        "feels_like": _round(current.get("apparent_temperature")),
        "wind_kmh": _round(current.get("wind_speed_10m")),
        "code": code,
        "description": WEATHER_CODES.get(code, "wechselhaft"),
        "temp_max": _round(day0("temperature_2m_max")),
        "temp_min": _round(day0("temperature_2m_min")),
        "rain_probability": _round(day0("precipitation_probability_max")),
        "precipitation_sum": day0("precipitation_sum"),
        "wind_max_kmh": _round(day0("wind_speed_10m_max")),
        "sunrise": _time_only(day0("sunrise")),
        "sunset": _time_only(day0("sunset")),
        "day_code": int(day0("weather_code", 0) or 0),
        "fetched_at": dt.datetime.now().isoformat(timespec="seconds"),
    }


def _round(value):
    try:
        return round(float(value))
    except (TypeError, ValueError):
        return None


def _time_only(value):
    if isinstance(value, str) and "T" in value:
        return value.split("T", 1)[1][:5]
    return value


def clothing_advice(weather: dict, outdoor: bool = True) -> dict:
    """Bekleidungsempfehlung fuer Outdoor-Training."""
    temp = weather.get("temp_max")
    if temp is None:
        temp = weather.get("temperature")
    low = weather.get("temp_min")
    rain = weather.get("rain_probability") or 0
    wind = weather.get("wind_max_kmh") or 0
    code = weather.get("day_code") or weather.get("code") or 0

    items: list[str] = []
    if not outdoor:
        return {
            "items": ["Hallenschuhe"],
            "summary": "Training findet drinnen statt. Wetter ist heute Ihr geringstes Problem.",
            "layer": "indoor",
        }

    if temp is None:
        return {"items": [], "summary": "Keine Wetterdaten, kleiden Sie sich nach Gefuehl.", "layer": "unknown"}

    if temp >= 24:
        layer = "sehr warm"
        items += ["kurzes Trikot", "kurze Hose", "Sonnencreme", "extra Wasser"]
    elif temp >= 17:
        layer = "warm"
        items += ["kurzes Trikot", "kurze Hose"]
        if (low or temp) < 13:
            items.append("leichte Jacke fuer danach")
    elif temp >= 10:
        layer = "kuehl"
        items += ["Langarmshirt", "lange Trainingshose"]
    elif temp >= 3:
        layer = "kalt"
        items += ["Thermoshirt", "lange Hose", "Handschuhe", "Haube"]
    else:
        layer = "sehr kalt"
        items += ["Thermounterwaesche", "Haube", "Handschuhe", "Halswaermer"]

    if code in SNOW_CODES:
        items.append("Schuhe mit Profil")
    if rain >= 50 or code in WET_CODES:
        items.append("Regenjacke")
        items.append("Wechselshirt")
    elif rain >= 25:
        items.append("Regenjacke sicherheitshalber")
    if wind >= 30:
        items.append("winddichte Jacke")

    # Duplikate raus, Reihenfolge behalten
    seen, unique = set(), []
    for item in items:
        if item.lower() not in seen:
            seen.add(item.lower())
            unique.append(item)

    if rain >= 50:
        summary = f"{temp} Grad und {rain} Prozent Regenrisiko. Regenjacke ist Pflicht."
    elif temp <= 5:
        summary = f"Nur {temp} Grad. Warm anziehen, sonst wird das Aufwaermen laenger als das Training."
    elif temp >= 26:
        summary = f"{temp} Grad. Trinken Sie mehr als Sie denken."
    else:
        summary = f"{temp} Grad, {weather.get('description', 'wechselhaft')}. Gute Bedingungen."

    return {"items": unique, "summary": summary, "layer": layer}


def briefing_text(weather: dict | None, outdoor: bool = True) -> str:
    """Sprechbarer Wetter-Absatz."""
    if not weather:
        return "Wetterdaten sind gerade nicht verfuegbar."
    now = weather.get("temperature")
    high = weather.get("temp_max")
    low = weather.get("temp_min")
    text = f"Draussen sind es {now} Grad, {weather.get('description')}."
    if high is not None and low is not None:
        text += f" Heute zwischen {low} und {high} Grad."
    advice = clothing_advice(weather, outdoor)
    text += " " + advice["summary"]
    return text
