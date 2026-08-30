// Kleiner fetch-Wrapper mit sprechenden Fehlern - jede Integration nutzt ihn.
export class ApiError extends Error {
  constructor(service, status, body) {
    super(`${service} ${status}: ${typeof body === "string" ? body.slice(0, 400) : JSON.stringify(body).slice(0, 400)}`);
    this.name = "ApiError";
    this.service = service;
    this.status = status;
    this.body = body;
  }
}

export async function request(service, url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = text;
  if (text && (res.headers.get("content-type") || "").includes("json")) {
    try { body = JSON.parse(text); } catch { /* rohtext behalten */ }
  }
  if (!res.ok) throw new ApiError(service, res.status, body);
  return body;
}

export const form = (obj) => new URLSearchParams(obj).toString();
