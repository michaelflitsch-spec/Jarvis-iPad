// Aufgabenspeicher 7 - der Taskmanager im kleinen Fenster.
// Mit Backend kommen die Aufgaben aus Notion/Server, ohne Backend aus dem iPad.
import { api } from "./api.js";
import { makeDraggable } from "./hud.js";

const LOCAL_KEY = "jarvis.tasks.v1";
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; } };
const writeLocal = (list) => localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export class TaskManager {
  constructor({ win, listEl, input, addBtn, closeBtn, titleEl, onChange = () => {} }) {
    this.win = win;
    this.listEl = listEl;
    this.input = input;
    this.titleEl = titleEl;
    this.onChange = onChange;
    this.tasks = [];

    addBtn.addEventListener("click", () => this.addFromInput());
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") this.addFromInput(); });
    closeBtn.addEventListener("click", () => this.hide());
    makeDraggable(win, win.querySelector(".win-bar"));
  }

  get open() { return !this.win.classList.contains("hidden"); }
  show() { this.win.classList.remove("hidden"); }
  hide() { this.win.classList.add("hidden"); }
  toggle() { this.open ? this.hide() : this.show(); }

  async load() {
    if (api.online) {
      try {
        const { tasks } = await api.tasks();
        this.tasks = tasks;
        this.render();
        return this.tasks;
      } catch { /* faellt auf den lokalen Speicher zurueck */ }
    }
    this.tasks = readLocal().filter((t) => !t.done);
    this.render();
    return this.tasks;
  }

  async add(title, due = null) {
    if (!title?.trim()) return null;
    const task = { id: uid(), title: title.trim(), due, done: false, source: "local", createdAt: new Date().toISOString() };
    if (api.online) {
      try {
        const created = await api.addTask({ title: task.title, due });
        this.tasks = [...this.tasks, created];
        this.render();
        return created;
      } catch { /* lokal weiter */ }
    }
    writeLocal([...readLocal(), task]);
    this.tasks = [...this.tasks, task];
    this.render();
    return task;
  }

  addFromInput() {
    const raw = this.input.value.trim();
    if (!raw) return;
    this.input.value = "";
    // "Zahnarzt anrufen bis 2026-09-04" oder "... bis morgen"
    const m = raw.match(/^(.*?)\s+bis\s+(\d{4}-\d{2}-\d{2}|heute|morgen)$/i);
    let title = raw, due = null;
    if (m) {
      title = m[1];
      const when = m[2].toLowerCase();
      const d = new Date();
      if (when === "morgen") d.setDate(d.getDate() + 1);
      due = when.match(/^\d{4}/) ? when : d.toISOString().slice(0, 10);
    }
    this.add(title, due);
  }

  async complete(id) {
    if (api.online) { try { await api.completeTask(id); } catch { /* lokal weiter */ } }
    writeLocal(readLocal().map((t) => (t.id === id ? { ...t, done: true } : t)));
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.render();
  }

  async remove(id) {
    if (api.online) { try { await api.deleteTask(id); } catch { /* lokal weiter */ } }
    writeLocal(readLocal().filter((t) => t.id !== id));
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.render();
  }

  render() {
    const today = new Date().toISOString().slice(0, 10);
    this.titleEl.textContent = `AUFGABENSPEICHER 7 · ${this.tasks.length}`;
    this.listEl.innerHTML = "";
    if (!this.tasks.length) {
      this.listEl.innerHTML = '<div class="empty">Keine offenen Aufgaben. Beeindruckend.</div>';
      this.onChange(this.tasks);
      return;
    }
    for (const t of this.tasks) {
      const late = t.due && t.due.slice(0, 10) < today;
      const row = document.createElement("div");
      row.className = `task${late ? " late" : ""}`;

      const tick = document.createElement("button");
      tick.className = "tick";
      tick.title = "Erledigt";
      tick.addEventListener("click", () => this.complete(t.id));

      const label = document.createElement("div");
      label.className = "t";
      label.textContent = t.title;
      if (t.due) {
        const due = document.createElement("span");
        due.className = "due";
        due.textContent = late ? `überfällig seit ${t.due.slice(0, 10)}` : `fällig ${t.due.slice(0, 10)}`;
        label.appendChild(due);
      }

      const rm = document.createElement("button");
      rm.className = "rm";
      rm.textContent = "×";
      rm.title = "Löschen";
      rm.addEventListener("click", () => this.remove(t.id));

      row.append(tick, label, rm);
      this.listEl.appendChild(row);
    }
    this.onChange(this.tasks);
  }

  /** Ein vorlesbarer Satz ueber den Stand des Aufgabenspeichers. */
  spokenSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const late = this.tasks.filter((t) => t.due && t.due.slice(0, 10) < today);
    if (!this.tasks.length) return "Im Aufgabenspeicher sieben ist nichts offen.";
    const head =
      this.tasks.length === 1
        ? "Im Aufgabenspeicher sieben liegt eine offene Aufgabe:"
        : `Im Aufgabenspeicher sieben liegen ${this.tasks.length} offene Aufgaben.`;
    const items = this.tasks.slice(0, 4).map((t) => t.title).join(", ");
    const rest = this.tasks.length > 4 ? ` Und ${this.tasks.length - 4} weitere.` : "";
    const overdue = late.length ? ` ${late.length === 1 ? "Eine davon ist überfällig" : `${late.length} davon sind überfällig`}.` : "";
    return `${head} ${items}.${rest}${overdue}`;
  }
}
