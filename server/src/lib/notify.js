// Ausgehende Benachrichtigungen: echter Anruf aufs iPhone (Twilio) + Push-Webhook.
import { config } from "../config.js";
import { request, form } from "./http.js";

export const phoneConfigured = () =>
  Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.from && config.twilio.to);

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

/** Ruft die hinterlegte iPhone-Nummer an und liest den Text per TTS vor. */
export async function callPhone({ message, repeat = 2, to }) {
  if (!phoneConfigured()) throw new Error("Telefonie ist nicht konfiguriert (Twilio-Variablen fehlen).");
  const say = `<Say voice="${config.twilio.voice}" language="${config.twilio.language}">${escapeXml(message)}</Say>`;
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Pause length="1"/>` +
    Array.from({ length: Math.max(1, Math.min(3, repeat)) }, () => say + '<Pause length="1"/>').join("") +
    `</Response>`;

  const res = await request(
    "twilio",
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        authorization: "Basic " + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form({ To: to || config.twilio.to, From: config.twilio.from, Twiml: twiml }),
    },
  );
  return { sid: res.sid, status: res.status, to: res.to };
}

/**
 * Push-Fallback ueber einen frei konfigurierbaren Webhook.
 * Funktioniert z. B. mit ntfy.sh oder einer iOS-Kurzbefehl-Automation.
 */
export async function pushMessage({ title, message, priority = "high" }) {
  if (!config.pushWebhook) throw new Error("PUSH_WEBHOOK_URL ist nicht gesetzt.");
  await request("push", config.pushWebhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, message, priority, source: "JARVIS" }),
  });
  return { ok: true };
}

/** Ruft an, wenn moeglich - sonst Push. Gibt zurueck, welcher Kanal genutzt wurde. */
export async function alert({ title, message }) {
  const errors = [];
  if (phoneConfigured()) {
    try {
      const r = await callPhone({ message });
      return { channel: "call", detail: r };
    } catch (e) { errors.push(`Anruf: ${e.message}`); }
  }
  if (config.pushWebhook) {
    try {
      await pushMessage({ title, message });
      return { channel: "push" };
    } catch (e) { errors.push(`Push: ${e.message}`); }
  }
  return { channel: "none", errors };
}
