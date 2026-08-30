// Zentrale Konfiguration. Alle Werte kommen aus Umgebungsvariablen (.env),
// damit keine Secrets im Repository landen.
import fs from "node:fs";
import path from "node:path";

// Minimaler .env-Loader (kein dotenv-Dependency noetig).
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const bool = (v, def = false) => (v === undefined ? def : /^(1|true|yes|on)$/i.test(v));

export const config = {
  port: Number(process.env.PORT || 8787),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/$/, ""),
  // Shared Secret zwischen iPad-Frontend und Backend. Ohne das kommt niemand an die Mails.
  accessToken: process.env.JARVIS_TOKEN || "",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean),

  owner: {
    name: process.env.OWNER_NAME || "Sir",
    timezone: process.env.TIMEZONE || "Europe/Berlin",
    locale: process.env.LOCALE || "de-DE",
    latitude: process.env.HOME_LAT ? Number(process.env.HOME_LAT) : null,
    longitude: process.env.HOME_LON ? Number(process.env.HOME_LON) : null,
    city: process.env.HOME_CITY || "",
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    effort: process.env.ANTHROPIC_EFFORT || "medium",
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
  },

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    // Primaer wird der Track per Suche aufgeloest - das ueberlebt auch
    // Katalogwechsel. Die URI dient nur als Rueckfall, wenn die Suche im
    // Markt des Kontos nichts findet.
    bootTrackQuery: process.env.SPOTIFY_BOOT_TRACK || 'track:"Back In Black" artist:"AC/DC"',
    bootTrackUri: process.env.SPOTIFY_BOOT_TRACK_URI || "spotify:track:08mG3Y1vljYA6bvDt4Wqkj",
    bootVolume: Number(process.env.SPOTIFY_BOOT_VOLUME || 70),
    duckVolume: Number(process.env.SPOTIFY_DUCK_VOLUME || 22),
    scopes: [
      "user-read-playback-state",
      "user-modify-playback-state",
      "user-read-currently-playing",
    ],
  },

  notion: {
    token: process.env.NOTION_TOKEN || "",
    tasksDb: process.env.NOTION_TASKS_DB || "",
    planParent: process.env.NOTION_PLAN_PARENT || "",
    version: "2022-06-28",
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    from: process.env.TWILIO_FROM || "",
    to: process.env.TWILIO_TO || "",
    voice: process.env.TWILIO_VOICE || "Google.de-DE-Standard-B",
    language: process.env.TWILIO_LANGUAGE || "de-DE",
  },

  // Generischer Webhook-Fallback fuer Push/Kurzbefehle (z. B. iOS Shortcuts Automation, ntfy.sh).
  pushWebhook: process.env.PUSH_WEBHOOK_URL || "",

  watcher: {
    enabled: bool(process.env.MAIL_WATCH_ENABLED, false),
    intervalMinutes: Number(process.env.MAIL_WATCH_INTERVAL || 10),
    // Ab welcher Wichtigkeit (1-5) JARVIS auf dem iPhone anruft.
    callThreshold: Number(process.env.MAIL_CALL_THRESHOLD || 5),
    quietHours: process.env.MAIL_QUIET_HOURS || "22:00-07:00",
  },
};

export function featureStatus() {
  return {
    claude: Boolean(config.anthropic.apiKey),
    google: Boolean(config.google.clientId && config.google.clientSecret),
    spotify: Boolean(config.spotify.clientId && config.spotify.clientSecret),
    notion: Boolean(config.notion.token),
    phone: Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.from && config.twilio.to),
    push: Boolean(config.pushWebhook),
  };
}
