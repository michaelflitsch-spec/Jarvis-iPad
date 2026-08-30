// Google OAuth + Gmail + Calendar (REST, ohne googleapis-Dependency).
import { config } from "../config.js";
import { store } from "../store.js";
import { request, form } from "./http.js";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

export function googleConfigured() {
  return Boolean(config.google.clientId && config.google.clientSecret);
}
export function googleConnected() {
  return Boolean(store.get("google")?.refresh_token);
}

export function googleAuthUrl(state = "") {
  const q = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${config.publicUrl}/auth/google/callback`,
    response_type: "code",
    scope: config.google.scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH}?${q}`;
}

export async function googleExchangeCode(code) {
  const tok = await request("google-token", TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: `${config.publicUrl}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const prev = store.get("google") || {};
  store.set("google", {
    access_token: tok.access_token,
    // Google liefert den refresh_token nur beim ersten consent - alten behalten.
    refresh_token: tok.refresh_token || prev.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
    scope: tok.scope,
  });
}

async function googleAccessToken() {
  const t = store.get("google");
  if (!t?.refresh_token) throw new Error("Google ist nicht verbunden. Bitte /auth/google aufrufen.");
  if (t.access_token && Date.now() < t.expires_at) return t.access_token;
  const tok = await request("google-refresh", TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: t.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  store.set("google", { ...t, access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in - 60) * 1000 });
  return tok.access_token;
}

async function gapi(service, url, options = {}) {
  const token = await googleAccessToken();
  return request(service, url, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) },
  });
}

/* ---------------------------------- Gmail --------------------------------- */

const header = (msg, name) =>
  msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

function decodeBody(payload) {
  if (!payload) return "";
  if (payload.body?.data) {
    const raw = Buffer.from(payload.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return payload.mimeType === "text/html" ? raw.replace(/<[^>]+>/g, " ") : raw;
  }
  for (const part of payload.parts || []) {
    if (part.mimeType === "text/plain") return decodeBody(part);
  }
  for (const part of payload.parts || []) {
    const t = decodeBody(part);
    if (t) return t;
  }
  return "";
}

export async function gmailList({ query = "is:unread newer_than:2d", max = 10, full = false } = {}) {
  const list = await gapi(
    "gmail-list",
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
  );
  const ids = (list.messages || []).map((m) => m.id);
  const format = full ? "full" : "metadata";
  const meta = full ? "" : "&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To";
  const messages = await Promise.all(
    ids.map((id) =>
      gapi("gmail-get", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=${format}${meta}`),
    ),
  );
  return messages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    from: header(m, "From"),
    to: header(m, "To"),
    subject: header(m, "Subject") || "(kein Betreff)",
    date: header(m, "Date"),
    receivedAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null,
    snippet: (m.snippet || "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
    unread: (m.labelIds || []).includes("UNREAD"),
    body: full ? decodeBody(m.payload).replace(/\s+/g, " ").trim().slice(0, 6000) : undefined,
  }));
}

export async function gmailGet(id) {
  const m = await gapi("gmail-get", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
  return {
    id: m.id,
    from: header(m, "From"),
    subject: header(m, "Subject"),
    date: header(m, "Date"),
    body: decodeBody(m.payload).replace(/\s+/g, " ").trim().slice(0, 8000),
  };
}

/* -------------------------------- Calendar -------------------------------- */

const calId = () => encodeURIComponent(config.google.calendarId);

export async function calendarList({ timeMin, timeMax, max = 25 } = {}) {
  const q = new URLSearchParams({
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || new Date(Date.now() + 86400000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(max),
  });
  const data = await gapi("calendar-list", `https://www.googleapis.com/calendar/v3/calendars/${calId()}/events?${q}`);
  return (data.items || []).map((e) => ({
    id: e.id,
    title: e.summary || "(ohne Titel)",
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: Boolean(e.start?.date),
    location: e.location || "",
    description: e.description || "",
    link: e.htmlLink,
  }));
}

export async function calendarCreate({ title, start, end, description = "", location = "", reminderMinutes = 15 }) {
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(start);
  const body = {
    summary: title,
    description,
    location,
    start: allDay ? { date: start } : { dateTime: start, timeZone: config.owner.timezone },
    end: allDay
      ? { date: end || start }
      : { dateTime: end || new Date(new Date(start).getTime() + 3600000).toISOString(), timeZone: config.owner.timezone },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: reminderMinutes }] },
  };
  const e = await gapi("calendar-create", `https://www.googleapis.com/calendar/v3/calendars/${calId()}/events`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { id: e.id, title: e.summary, start: e.start?.dateTime || e.start?.date, link: e.htmlLink };
}
