// Spotify: OAuth + Wiedergabe-Steuerung ueber die Web API.
// Wichtig: Steuern der Wiedergabe setzt Spotify Premium und ein aktives Geraet voraus.
import { config } from "../config.js";
import { store } from "../store.js";
import { request, form } from "./http.js";

const AUTH = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

export const spotifyConfigured = () => Boolean(config.spotify.clientId && config.spotify.clientSecret);
export const spotifyConnected = () => Boolean(store.get("spotify")?.refresh_token);

export function spotifyAuthUrl(state = "") {
  const q = new URLSearchParams({
    client_id: config.spotify.clientId,
    response_type: "code",
    redirect_uri: `${config.publicUrl}/auth/spotify/callback`,
    scope: config.spotify.scopes.join(" "),
    state,
  });
  return `${AUTH}?${q}`;
}

const basic = () =>
  "Basic " + Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString("base64");

export async function spotifyExchangeCode(code) {
  const tok = await request("spotify-token", TOKEN, {
    method: "POST",
    headers: { authorization: basic(), "content-type": "application/x-www-form-urlencoded" },
    body: form({ grant_type: "authorization_code", code, redirect_uri: `${config.publicUrl}/auth/spotify/callback` }),
  });
  store.set("spotify", {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
  });
}

async function accessToken() {
  const t = store.get("spotify");
  if (!t?.refresh_token) throw new Error("Spotify ist nicht verbunden. Bitte /auth/spotify aufrufen.");
  if (t.access_token && Date.now() < t.expires_at) return t.access_token;
  const tok = await request("spotify-refresh", TOKEN, {
    method: "POST",
    headers: { authorization: basic(), "content-type": "application/x-www-form-urlencoded" },
    body: form({ grant_type: "refresh_token", refresh_token: t.refresh_token }),
  });
  store.set("spotify", {
    ...t,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || t.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
  });
  return tok.access_token;
}

async function api(path, options = {}) {
  const token = await accessToken();
  return request("spotify", `${API}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) },
  });
}

export async function devices() {
  const d = await api("/me/player/devices");
  return d.devices || [];
}

export async function searchTrack(query) {
  const q = new URLSearchParams({ q: query, type: "track", limit: "1" });
  const r = await api(`/search?${q}`);
  const t = r.tracks?.items?.[0];
  if (!t) return null;
  return { uri: t.uri, name: t.name, artist: t.artists.map((a) => a.name).join(", "), url: t.external_urls?.spotify };
}

export async function setVolume(percent) {
  try {
    await api(`/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(percent)))}`, { method: "PUT" });
    return true;
  } catch {
    // Viele Geraete (z. B. iPhone-Speaker) erlauben keine Fernsteuerung der Lautstaerke.
    return false;
  }
}

export async function pause() {
  try { await api("/me/player/pause", { method: "PUT" }); return true; } catch { return false; }
}

/**
 * Startet einen Track. Loest den Track per Suche auf (robuster als eine
 * fest verdrahtete ID) und faellt auf die konfigurierte URI zurueck.
 */
export async function play({ query, uri, volume } = {}) {
  let track = null;
  let targetUri = uri || null;
  if (!targetUri) {
    track = await searchTrack(query || config.spotify.bootTrackQuery);
    targetUri = track?.uri || config.spotify.bootTrackUri || null;
  }
  if (!targetUri) throw new Error("Kein passender Spotify-Track gefunden.");

  const list = await devices();
  const active = list.find((d) => d.is_active) || list[0];
  if (!active) {
    const err = new Error("Kein aktives Spotify-Geraet. Spotify auf dem iPad kurz oeffnen und einen Ton abspielen.");
    err.code = "NO_DEVICE";
    err.track = track;
    throw err;
  }

  if (volume != null) await setVolume(volume);
  await api(`/me/player/play?device_id=${encodeURIComponent(active.id)}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [targetUri] }),
  });
  return { uri: targetUri, device: active.name, track };
}
