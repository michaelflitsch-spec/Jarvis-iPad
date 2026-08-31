"""Liest das lokale Markdown-Notizverzeichnis (Obsidian-Vault).

Bewusst tolerant geschrieben: es gibt keine erzwungene Datei-Struktur.
Alles was wie eine Aufgabe, ein Stundenplan-Eintrag oder ein Pruefungstermin
aussieht, wird erkannt - egal in welcher Datei es steht.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from pathlib import Path

WEEKDAYS = {
    "montag": 0, "monday": 0, "mo": 0,
    "dienstag": 1, "tuesday": 1, "di": 1,
    "mittwoch": 2, "wednesday": 2, "mi": 2,
    "donnerstag": 3, "thursday": 3, "do": 3,
    "freitag": 4, "friday": 4, "fr": 4,
    "samstag": 5, "saturday": 5, "sa": 5, "sonnabend": 5,
    "sonntag": 6, "sunday": 6, "so": 6,
}
WEEKDAY_NAMES_DE = [
    "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag",
]
WEEKDAY_KEYS_EN = [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]

TASK_RE = re.compile(r"^\s*[-*+]\s*\[(?P<mark>[ xX/\-])\]\s*(?P<text>.+?)\s*$")
HEADING_RE = re.compile(r"^\s{0,3}(?P<hashes>#{1,6})\s+(?P<title>.+?)\s*#*\s*$")
BULLET_RE = re.compile(r"^\s*[-*+]\s+(?P<text>.+?)\s*$")
CHECKBOX_PREFIX_RE = re.compile(r"^\s*[-*+]\s*\[[ xX/\-]\]\s*")
TIME_RE = re.compile(r"\b(?P<h>[01]?\d|2[0-3])[:.](?P<m>[0-5]\d)\b")
TAG_RE = re.compile(r"(?<![\w#])#([A-Za-zÄÖÜäöüß][\w/\-]*)")
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")

# Faellig-Datum: "(faellig: 2026-09-02)", "due: 02.09.2026", "📅 2026-09-02", "@2026-09-02"
_DATE_ISO = r"(?P<y>\d{4})-(?P<mo>\d{1,2})-(?P<d>\d{1,2})"
_DATE_DE = r"(?P<d2>\d{1,2})\.(?P<mo2>\d{1,2})\.(?P<y2>\d{2,4})"
DATE_RE = re.compile(f"(?:{_DATE_ISO}|{_DATE_DE})")
_HINT_WORD = r"(?:f(?:ae|ä)llig(?:\s*am)?|due(?:\s*date)?|abgabe|deadline|termin)"
DUE_HINT_RE = re.compile(rf"(?:{_HINT_WORD}\s*[:\-]?\s*|📅\s*|⏳\s*|@)", re.IGNORECASE)

# Die komplette Faellig-Angabe inkl. optionaler Klammern, damit im Aufgabentext
# kein "()" oder ein nacktes Datum uebrig bleibt.
DUE_CLAUSE_RE = re.compile(
    rf"\s*[\(\[]?\s*(?:{_HINT_WORD}\s*[:\-]?\s*|📅\s*|⏳\s*|@)\s*"
    rf"(?:{_DATE_ISO}|{_DATE_DE})\s*[\)\]]?",
    re.IGNORECASE,
)

EXAM_WORDS = (
    "schularbeit", "test", "pruefung", "prüfung", "klausur", "exam",
    "referat", "praesentation", "präsentation", "wiederholung", "sa ",
)


def _parse_date(match: re.Match) -> dt.date | None:
    try:
        if match.group("y"):
            return dt.date(int(match.group("y")), int(match.group("mo")), int(match.group("d")))
        year = int(match.group("y2"))
        if year < 100:
            year += 2000
        return dt.date(year, int(match.group("mo2")), int(match.group("d2")))
    except (ValueError, TypeError):
        return None


def find_date(text: str, prefer_due_hint: bool = True) -> dt.date | None:
    """Erstes plausibles Datum in der Zeile. Bevorzugt eines nach 'faellig:'/'due:'."""
    if prefer_due_hint:
        for hint in DUE_HINT_RE.finditer(text):
            match = DATE_RE.search(text, hint.end())
            if match and match.start() - hint.end() <= 2:
                found = _parse_date(match)
                if found:
                    return found
    match = DATE_RE.search(text)
    return _parse_date(match) if match else None


def strip_due(text: str) -> str:
    """Entfernt die Faellig-Angabe aus dem Aufgabentext und raeumt Reste auf."""
    text = DUE_CLAUSE_RE.sub(" ", text)
    text = re.sub(r"\(\s*\)|\[\s*\]", " ", text)  # leere Klammern
    return clean(text)


def clean(text: str) -> str:
    """Markdown-Rauschen entfernen, damit die Sprachausgabe nicht stolpert."""
    text = WIKILINK_RE.sub(r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)   # [Titel](url)
    text = re.sub(r"[*_`~]{1,3}", "", text)                  # Betonung
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip(" -–—:•")


@dataclass
class Task:
    text: str
    done: bool
    source: str
    due: dt.date | None = None
    tags: list[str] = field(default_factory=list)
    line: int = 0

    @property
    def overdue(self) -> bool:
        return bool(self.due and not self.done and self.due < dt.date.today())

    def days_left(self) -> int | None:
        return (self.due - dt.date.today()).days if self.due else None

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "done": self.done,
            "source": self.source,
            "due": self.due.isoformat() if self.due else None,
            "days_left": self.days_left(),
            "overdue": self.overdue,
            "tags": self.tags,
        }


@dataclass
class Lesson:
    weekday: int
    time: str | None
    subject: str
    room: str | None = None
    source: str = ""

    def to_dict(self) -> dict:
        return {
            "weekday": self.weekday,
            "weekday_name": WEEKDAY_NAMES_DE[self.weekday],
            "time": self.time,
            "subject": self.subject,
            "room": self.room,
        }


@dataclass
class Exam:
    date: dt.date
    subject: str
    source: str
    note: str = ""

    def days_left(self) -> int:
        return (self.date - dt.date.today()).days

    def to_dict(self) -> dict:
        return {
            "date": self.date.isoformat(),
            "date_de": self.date.strftime("%d.%m.%Y"),
            "subject": self.subject,
            "note": self.note,
            "days_left": self.days_left(),
        }


class Vault:
    """Zugriff auf das Markdown-Verzeichnis."""

    # Ordner, die nie als Notizen zaehlen. Vor allem der Export-Ordner: dessen
    # Zusammenfassungen enthalten dieselben Aufgaben noch einmal und wuerden
    # sonst als Duplikate im Dashboard landen.
    DEFAULT_IGNORE = ("goodnotes", "jarvis-export", "export", "templates",
                      "vorlagen", "archiv", "archive", "attachments")

    def __init__(self, root: Path | str | None, max_files: int = 400,
                 ignore_dirs: tuple[str, ...] | list[str] | None = None):
        self.root = Path(root).expanduser() if root else None
        self.max_files = max_files
        self.ignore_dirs = tuple(
            d.lower() for d in (ignore_dirs if ignore_dirs is not None else self.DEFAULT_IGNORE)
        )
        self._cache: dict[str, str] | None = None
        self._cache_stamp: float = 0.0

    @property
    def available(self) -> bool:
        return bool(self.root and self.root.is_dir())

    def files(self) -> list[Path]:
        if not self.available:
            return []
        found: list[Path] = []
        for path in sorted(self.root.rglob("*.md")):
            relative = path.relative_to(self.root).parts
            if any(part.startswith(".") for part in relative):
                continue  # .obsidian, .trash, .git
            folders = {part.lower() for part in relative[:-1]}
            if folders & set(self.ignore_dirs) or "node_modules" in folders:
                continue
            found.append(path)
            if len(found) >= self.max_files:
                break
        return found

    def read_all(self, refresh: bool = False) -> dict[str, str]:
        """{relativer Pfad: Inhalt}. Cache invalidiert sich ueber die mtime."""
        if not self.available:
            return {}
        newest = max((p.stat().st_mtime for p in self.files()), default=0.0)
        if self._cache is not None and not refresh and newest <= self._cache_stamp:
            return self._cache
        data: dict[str, str] = {}
        for path in self.files():
            try:
                data[str(path.relative_to(self.root))] = path.read_text(
                    encoding="utf-8", errors="replace"
                )
            except OSError:
                continue
        self._cache, self._cache_stamp = data, newest
        return data

    def read_file(self, name: str) -> str | None:
        """Datei nach Name finden - egal wo im Vault sie liegt."""
        if not self.available:
            return None
        target = name.lower()
        for rel, content in self.read_all().items():
            if Path(rel).name.lower() == target or rel.lower() == target:
                return content
        return None

    # ---------------- Parser ----------------

    def tasks(self, only_open: bool = True) -> list[Task]:
        out: list[Task] = []
        for rel, content in self.read_all().items():
            for number, raw in enumerate(content.splitlines(), start=1):
                match = TASK_RE.match(raw)
                if not match:
                    continue
                done = match.group("mark").strip().lower() in {"x", "/"}
                if only_open and done:
                    continue
                body = match.group("text")
                out.append(
                    Task(
                        text=strip_due(body) or clean(body),
                        done=done,
                        source=rel,
                        due=find_date(body),
                        tags=TAG_RE.findall(body),
                        line=number,
                    )
                )
        # Ueberfaellig zuerst, dann nach Datum, Undatiertes ans Ende.
        far = dt.date.max
        out.sort(key=lambda t: (t.due or far, t.text.lower()))
        return out

    TIMETABLE_HINTS = ("stundenplan", "timetable", "schule", "school", "unterricht")
    NON_TIMETABLE_HINTS = ("training", "trainingsplan", "workout", "sport/")

    def _timetable_sources(self) -> dict[str, str]:
        """Nur Dateien, die plausibel ein Stundenplan sind.

        Ohne diesen Filter landen Zeilen wie "- Mittwoch: Intervalllauf" aus dem
        Trainingsplan im Stundenplan.
        """
        files = self.read_all()
        candidates = {
            rel: text
            for rel, text in files.items()
            if any(hint in rel.lower() for hint in self.TIMETABLE_HINTS)
        }
        pool = candidates or files
        return {
            rel: text
            for rel, text in pool.items()
            if not any(hint in rel.lower() for hint in self.NON_TIMETABLE_HINTS)
        }

    def timetable(self) -> dict[int, list[Lesson]]:
        """Stundenplan: Wochentag -> Stunden.

        Erkennt zwei Schreibweisen:
          ## Montag
          - 08:00 Mathematik (R204)
        und
          - Montag: 08:00 Mathematik, 09:50 Deutsch
        """
        table: dict[int, list[Lesson]] = {i: [] for i in range(7)}
        for rel, content in self._timetable_sources().items():
            current: int | None = None
            for raw in content.splitlines():
                heading = HEADING_RE.match(raw)
                if heading:
                    key = clean(heading.group("title")).lower().strip()
                    current = WEEKDAYS.get(key.split()[0] if key else "", None)
                    continue

                bullet = BULLET_RE.match(raw)
                if not bullet or TASK_RE.match(raw):
                    continue
                body = bullet.group("text")

                inline = re.match(r"^\s*([A-Za-zÄÖÜäöüß]+)\s*[:\-]\s*(.+)$", body)
                day = current
                rest = body
                if inline and inline.group(1).lower() in WEEKDAYS:
                    day = WEEKDAYS[inline.group(1).lower()]
                    rest = inline.group(2)
                if day is None:
                    continue

                for chunk in re.split(r"\s*[,;|]\s*", rest):
                    chunk = chunk.strip()
                    if not chunk:
                        continue
                    time_match = TIME_RE.search(chunk)
                    time_str = (
                        f"{int(time_match.group('h')):02d}:{time_match.group('m')}"
                        if time_match else None
                    )
                    subject = chunk[: time_match.start()] + chunk[time_match.end():] if time_match else chunk
                    room = None
                    room_match = re.search(r"\(([^)]+)\)", subject)
                    if room_match:
                        room = clean(room_match.group(1))
                        subject = subject[: room_match.start()] + subject[room_match.end():]
                    subject = clean(subject)
                    if not subject or len(subject) > 60:
                        continue
                    table[day].append(Lesson(day, time_str, subject, room, rel))

        for day, lessons in table.items():
            lessons.sort(key=lambda l: l.time or "99:99")
            # Duplikate (gleiche Zeit + Fach) aus mehreren Dateien zusammenfassen
            seen: set[tuple] = set()
            unique = []
            for lesson in lessons:
                key = (lesson.time, lesson.subject.lower())
                if key not in seen:
                    seen.add(key)
                    unique.append(lesson)
            table[day] = unique
        return table

    def exams(self, horizon_days: int = 21) -> list[Exam]:
        today = dt.date.today()
        limit = today + dt.timedelta(days=horizon_days)
        out: list[Exam] = []
        seen: set[tuple] = set()

        for rel, content in self.read_all().items():
            exam_file = "pruef" in rel.lower() or "prüf" in rel.lower() or "exam" in rel.lower()
            for raw in content.splitlines():
                lower = raw.lower()
                if not (exam_file or any(word in lower for word in EXAM_WORDS)):
                    continue
                date = find_date(raw, prefer_due_hint=False)
                if not date or not (today <= date <= limit):
                    continue
                body = CHECKBOX_PREFIX_RE.sub("", raw).lstrip("-*+ \t")
                body = clean(DATE_RE.sub("", body)) or "Termin"
                key = (date, body.lower())
                if key in seen:
                    continue
                seen.add(key)
                out.append(Exam(date=date, subject=body[:80], source=rel))

        out.sort(key=lambda e: e.date)
        return out

    def training_overrides(self) -> dict[str, str]:
        """Aus Trainingsplan.md: Wochentag -> eigener Text (schlaegt config.json)."""
        overrides: dict[str, str] = {}
        for rel, content in self.read_all().items():
            if "training" not in rel.lower():
                continue
            current: int | None = None
            for raw in content.splitlines():
                heading = HEADING_RE.match(raw)
                if heading:
                    key = clean(heading.group("title")).lower().strip()
                    current = WEEKDAYS.get(key.split()[0] if key else "", None)
                    continue
                bullet = BULLET_RE.match(raw)
                if not bullet:
                    continue
                body = bullet.group("text")
                inline = re.match(r"^\s*([A-Za-zÄÖÜäöüß]+)\s*[:\-]\s*(.+)$", body)
                if inline and inline.group(1).lower() in WEEKDAYS:
                    overrides[WEEKDAY_KEYS_EN[WEEKDAYS[inline.group(1).lower()]]] = clean(inline.group(2))
                elif current is not None:
                    key = WEEKDAY_KEYS_EN[current]
                    overrides[key] = (overrides.get(key, "") + " " + clean(body)).strip()
        return overrides

    def stats(self) -> dict:
        files = self.files()
        return {
            "available": self.available,
            "root": str(self.root) if self.root else None,
            "file_count": len(files),
            "truncated": len(files) >= self.max_files,
            "ignored_dirs": list(self.ignore_dirs),
        }
