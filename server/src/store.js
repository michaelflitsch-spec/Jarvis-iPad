// Einfacher JSON-Store fuer OAuth-Tokens, Aufgaben und Laufzeit-Status.
// Absichtlich datei-basiert: kein DB-Setup, laeuft auf jedem Hoster mit Volume.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), process.env.DATA_DIR || "data");
const file = path.join(dir, "store.json");

const defaults = {
  google: null,        // { access_token, refresh_token, expires_at, scope }
  spotify: null,       // { access_token, refresh_token, expires_at }
  tasks: [],           // { id, title, done, due, note, source, createdAt }
  seenMailIds: [],     // bereits gemeldete Gmail-IDs
  lastBriefing: null,
  notified: [],        // { mailId, at, channel }
};

let state = null;

function load() {
  if (state) return state;
  try {
    state = { ...defaults, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    state = structuredClone(defaults);
  }
  return state;
}

let writeTimer = null;
function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  }, 50);
}

export const store = {
  get(key) {
    return load()[key];
  },
  set(key, value) {
    load()[key] = value;
    persist();
    return value;
  },
  update(key, fn) {
    const s = load();
    s[key] = fn(s[key]);
    persist();
    return s[key];
  },
  all() {
    return load();
  },
  flush() {
    clearTimeout(writeTimer);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(load(), null, 2));
  },
};
