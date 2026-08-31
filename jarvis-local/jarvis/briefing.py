"""Tages-Briefing: Wetter -> Schule -> Sport, in dieser Reihenfolge."""

from __future__ import annotations

import datetime as dt

from . import weather as weather_api
from .calendar import CalendarService
from .notion import NotionError, NotionTasks
from .school import School
from .training import Training


def _normalize(text: str) -> str:
    """Fuer den Duplikat-Vergleich: Kleinschreibung, keine Satzzeichen."""
    lowered = "".join(c if c.isalnum() or c.isspace() else " " for c in text.lower())
    return " ".join(lowered.split())


def _deduplicate(tasks: list[dict]) -> list[dict]:
    """Dieselbe Aufgabe in Obsidian und Notion nur einmal zeigen.

    Exakte Gleichheit reicht nicht: dieselbe Aufgabe steht in Notion oft
    kuerzer als in den Notizen ("Mathe Seite 42" gegen "Mathe Seite 42
    Wahrscheinlichkeitsrechnung"). Deshalb gilt auch als Duplikat, wenn der
    eine Text mit dem anderen beginnt. Die Mindestlaenge verhindert, dass
    kurze Eintraege wie "Lernen" alles Moegliche verschlucken.
    """
    MIN_PREFIX = 18
    kept: list[dict] = []
    keys: list[str] = []

    for task in tasks:
        key = _normalize(task["text"])
        if not key:
            continue
        duplicate_of = None
        for index, existing in enumerate(keys):
            if key == existing:
                duplicate_of = index
                break
            shorter, longer = sorted((key, existing), key=len)
            if len(shorter) >= MIN_PREFIX and longer.startswith(shorter):
                duplicate_of = index
                break

        if duplicate_of is None:
            kept.append(task)
            keys.append(key)
            continue

        # Beide behalten waere doppelt; wir behalten den informativeren Text,
        # uebernehmen aber ein Faelligkeitsdatum, falls nur die andere Seite eins hat.
        current = kept[duplicate_of]
        if not current.get("due") and task.get("due"):
            current["due"] = task["due"]
            current["days_left"] = task.get("days_left")
            current["overdue"] = task.get("overdue", False)
        if len(task["text"]) > len(current["text"]):
            merged = dict(task)
            merged["due"] = current["due"]
            merged["days_left"] = current.get("days_left")
            merged["overdue"] = current.get("overdue", False)
            merged["also_in"] = current.get("origin")
            kept[duplicate_of] = merged
            keys[duplicate_of] = _normalize(merged["text"])
        else:
            current["also_in"] = task.get("origin")

    return kept


class Briefing:
    def __init__(self, config, vault, brain=None):
        self.config = config
        self.vault = vault
        self.brain = brain
        self.school = School(vault, config.get("dashboard.exam_horizon_days", 21))
        self.training = Training(vault, config.get("training", {}))
        self.calendar = CalendarService(config)
        self.notion = NotionTasks(config)

    def weather(self) -> dict | None:
        try:
            return weather_api.fetch(
                self.config.get("location.latitude", 48.2082),
                self.config.get("location.longitude", 16.3738),
                self.config.timezone,
            )
        except weather_api.WeatherError:
            return None


    def merged_tasks(self, limit: int = 12) -> tuple[list[dict], dict]:
        """Aufgaben aus Markdown und Notion in einer Liste.

        Notion fehlt nicht selten (Token abgelaufen, Netz weg). Das darf das
        Dashboard nicht kippen - dann bleiben eben die Notizen uebrig.
        """
        notes_tasks = self.school.homework(limit=50)
        for task in notes_tasks:
            task.setdefault("origin", "notes")

        info = {"notion_available": self.notion.available, "notion_error": None,
                "notion_count": 0, "notes_count": len(notes_tasks)}

        notion_tasks: list[dict] = []
        if self.notion.available and self.config.get("notion.merge_with_notes", True):
            try:
                notion_tasks = self.notion.tasks(limit=50)
                info["notion_count"] = len(notion_tasks)
            except NotionError as exc:
                info["notion_error"] = str(exc)

        combined = notes_tasks + notion_tasks
        unique = _deduplicate(combined)

        far = "9999-12-31"
        unique.sort(key=lambda t: (not t.get("overdue"), t.get("due") or far,
                                   t["text"].lower()))
        return unique[:limit], info

    def build(self, day: dt.date | None = None, polish: bool = False) -> dict:
        day = day or dt.date.today()
        current_weather = self.weather()
        session = self.training.session_for(day)
        school_overview = self.school.overview(day)

        greeting = self.config.get(
            "personality.greeting", "Guten Morgen, {address_as}."
        ).format(address_as=self.config.address, owner_name=self.config.owner)

        calendar_line = ""
        if self.config.get("calendar.show_in_briefing", True):
            try:
                calendar_line = self.calendar.briefing_text()
            except Exception:
                calendar_line = ""

        merged, _ = self.merged_tasks(limit=50)

        parts = [
            greeting,
            weather_api.briefing_text(current_weather, outdoor=session["outdoor"]),
            self.school.briefing_text(day, tasks=merged),
            calendar_line,
            self.training.briefing_text(day, current_weather),
        ]
        text = " ".join(p.strip() for p in parts if p and p.strip())

        if polish and self.brain and self.brain.available:
            text = self.brain.polish_briefing(text)

        return {
            "date": day.isoformat(),
            "text": text,
            "sections": {
                "greeting": greeting,
                "weather": parts[1],
                "school": parts[2],
                "calendar": calendar_line,
                "training": parts[4],
            },
            "weather": current_weather,
            "clothing": weather_api.clothing_advice(current_weather, session["outdoor"])
            if current_weather else None,
            "school": school_overview,
            "training": session,
            "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        }

    def dashboard_payload(self, day: dt.date | None = None) -> dict:
        """Alles was das Dashboard links anzeigt - ohne Claude-Aufruf."""
        day = day or dt.date.today()
        current_weather = self.weather()
        session = self.training.session_for(day)
        overview = self.school.overview(day)

        tasks, task_info = self.merged_tasks(self.config.get("dashboard.todo_limit", 12))
        overview["homework"] = tasks
        overview["sources"] = task_info

        events: list[dict] = []
        calendar_error = None
        if self.calendar.available:
            try:
                events = self.calendar.upcoming(
                    self.config.get("calendar.horizon_days", 14)
                )
                calendar_error = self.calendar.last_error
            except Exception as exc:
                calendar_error = str(exc)

        return {
            "date": day.isoformat(),
            "weekday": overview["weekday"],
            "calendar": {
                "available": self.calendar.available,
                "events": events,
                "today": [e for e in events if e["is_today"]],
                "error": calendar_error,
            },
            "weather": current_weather,
            "clothing": weather_api.clothing_advice(current_weather, session["outdoor"])
            if current_weather else None,
            "school": overview,
            "training": session,
            "vault": self.vault.stats(),
            "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        }
