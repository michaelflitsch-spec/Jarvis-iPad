"""Schul-Logik auf Basis des Notiz-Vaults."""

from __future__ import annotations

import datetime as dt

from .notes import WEEKDAY_NAMES_DE, Vault


class School:
    def __init__(self, vault: Vault, exam_horizon_days: int = 21):
        self.vault = vault
        self.exam_horizon_days = exam_horizon_days

    def lessons_for(self, day: dt.date | None = None) -> list[dict]:
        day = day or dt.date.today()
        return [l.to_dict() for l in self.vault.timetable().get(day.weekday(), [])]

    def subjects_for(self, day: dt.date | None = None) -> list[str]:
        seen, out = set(), []
        for lesson in self.lessons_for(day):
            key = lesson["subject"].lower()
            if key not in seen:
                seen.add(key)
                out.append(lesson["subject"])
        return out

    def homework(self, limit: int = 12, horizon_days: int | None = 14) -> list[dict]:
        """Offene Aufgaben. Ueberfaellige zuerst, dann nach Faelligkeit."""
        today = dt.date.today()
        out = []
        for task in self.vault.tasks(only_open=True):
            if horizon_days is not None and task.due and (task.due - today).days > horizon_days:
                continue
            out.append(task.to_dict())
        return out[:limit]

    def due_today_or_tomorrow(self) -> list[dict]:
        return [t for t in self.homework(limit=50) if (t["days_left"] is not None and t["days_left"] <= 1)]

    def exams(self) -> list[dict]:
        return [e.to_dict() for e in self.vault.exams(self.exam_horizon_days)]

    def next_exam(self) -> dict | None:
        exams = self.exams()
        return exams[0] if exams else None

    def overview(self, day: dt.date | None = None) -> dict:
        day = day or dt.date.today()
        lessons = self.lessons_for(day)
        homework = self.homework()
        return {
            "date": day.isoformat(),
            "weekday": WEEKDAY_NAMES_DE[day.weekday()],
            "is_school_day": day.weekday() < 5 and bool(lessons),
            "lessons": lessons,
            "subjects": self.subjects_for(day),
            "first_lesson": lessons[0] if lessons else None,
            "homework": homework,
            "homework_open_count": len(self.vault.tasks(only_open=True)),
            "urgent": self.due_today_or_tomorrow(),
            "overdue": [t for t in homework if t["overdue"]],
            "exams": self.exams(),
            "next_exam": self.next_exam(),
        }

    def briefing_text(self, day: dt.date | None = None) -> str:
        """Kurzer, sprechbarer Schul-Absatz fuer das Audio-Briefing."""
        data = self.overview(day)

        if not self.vault.available:
            return "Ihr Notizverzeichnis ist noch nicht verbunden. Schule kann ich daher nicht berichten."

        parts: list[str] = []
        if not data["is_school_day"]:
            parts.append("Heute steht kein Unterricht an.")
        else:
            subjects = data["subjects"]
            first = data["first_lesson"]
            start = f" Start um {_spoken_time(first['time'])}." if first and first.get("time") else ""
            if len(subjects) <= 4:
                parts.append(f"Heute haben Sie {_join(subjects)}.{start}")
            else:
                parts.append(
                    f"Heute stehen {len(subjects)} Faecher an, darunter {_join(subjects[:3])}.{start}"
                )

        overdue = data["overdue"]
        urgent = data["urgent"]
        if overdue:
            parts.append(
                f"Achtung: {len(overdue)} Aufgabe{'n' if len(overdue) > 1 else ''} ist ueberfaellig. "
                f"{_shorten(overdue[0]['text'])}."
            )
        elif urgent:
            parts.append(f"Faellig bis morgen: {_shorten(urgent[0]['text'])}.")
        elif data["homework"]:
            parts.append(f"{len(data['homework'])} offene Aufgaben, nichts davon brennt heute.")
        else:
            parts.append("Keine offenen Hausaufgaben. Bemerkenswert.")

        exam = data["next_exam"]
        if exam:
            days = exam["days_left"]
            when = "heute" if days == 0 else "morgen" if days == 1 else f"in {days} Tagen"
            parts.append(f"{_shorten(exam['subject'])} {when}.")

        return " ".join(parts)


def _spoken_time(value: str | None) -> str:
    """08:00 -> 'acht Uhr', 09:50 -> 'neun Uhr fuenfzig' (ElevenLabs liest das sauberer)."""
    if not value or ":" not in value:
        return value or ""
    hour, minute = value.split(":")
    names = ["null", "ein", "zwei", "drei", "vier", "fuenf", "sechs", "sieben", "acht",
             "neun", "zehn", "elf", "zwoelf", "dreizehn", "vierzehn", "fuenfzehn",
             "sechzehn", "siebzehn", "achtzehn", "neunzehn", "zwanzig", "einundzwanzig",
             "zweiundzwanzig", "dreiundzwanzig"]
    hour_word = names[int(hour)] if int(hour) < len(names) else hour
    if minute == "00":
        return f"{hour_word} Uhr"
    return f"{hour_word} Uhr {int(minute)}"


def _join(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " und " + items[-1]


def _shorten(text: str, limit: int = 90) -> str:
    text = text.strip().rstrip(".")
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"
