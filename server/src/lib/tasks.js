// "Aufgabenspeicher 7": lokaler Speicher, optional gespiegelt aus Notion.
import { randomUUID } from "node:crypto";
import { store } from "../store.js";
import { config } from "../config.js";
import { notionConfigured, notionTasks, notionAddTask, notionCompleteTask } from "./notion.js";

const local = () => store.get("tasks") || [];

export async function listTasks({ includeDone = false } = {}) {
  const localTasks = local().filter((t) => (includeDone ? true : !t.done));
  let remote = [];
  if (notionConfigured() && config.notion.tasksDb) {
    try { remote = await notionTasks({ includeDone }); } catch { remote = []; }
  }
  const seen = new Set(remote.map((t) => t.title.toLowerCase()));
  const merged = [...remote, ...localTasks.filter((t) => !seen.has(t.title.toLowerCase()))];
  // Faellige/ueberfaellige zuerst, dann Aufgaben ohne Datum.
  return merged.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
}

export async function addTask({ title, due = null, note = "" }) {
  if (notionConfigured() && config.notion.tasksDb) {
    try { return await notionAddTask({ title, due }); } catch { /* faellt lokal zurueck */ }
  }
  const task = { id: randomUUID(), title, due, note, done: false, source: "local", createdAt: new Date().toISOString() };
  store.update("tasks", (t) => [...(t || []), task]);
  return task;
}

export async function completeTask(id) {
  const item = local().find((t) => t.id === id);
  if (item) {
    store.update("tasks", (list) => list.map((t) => (t.id === id ? { ...t, done: true, doneAt: new Date().toISOString() } : t)));
    return { id, done: true, source: "local" };
  }
  if (notionConfigured()) {
    await notionCompleteTask(id);
    return { id, done: true, source: "notion" };
  }
  throw new Error(`Aufgabe ${id} nicht gefunden.`);
}

export function deleteTask(id) {
  store.update("tasks", (list) => list.filter((t) => t.id !== id));
  return { id, deleted: true };
}

export function overdue(tasks) {
  const today = new Date().toISOString().slice(0, 10);
  return tasks.filter((t) => t.due && t.due.slice(0, 10) < today);
}
