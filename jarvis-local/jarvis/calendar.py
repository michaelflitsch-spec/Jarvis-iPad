"""Echte Kalendertermine ueber die geheime iCal-Adresse (RFC 5545).

Warum iCal und nicht OAuth: Google, Apple, Outlook und die meisten
Schulkalender bieten eine private .ics-URL an. Das ist eine Adresse zum
Kopieren statt eines OAuth-Projekts mit Consent-Screen. Lesend reicht das
fuer ein Dashboard vollkommen.

Wiederholungen muessen wir selbst aufloesen: eine .ics-Datei enthaelt eine
woechentliche Stunde genau einmal, plus eine RRULE. Ohne Expansion sieht
man einen Termin nur an seinem allerersten Tag.
"""

from __future__ import annotations

import datetime as dt
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Iterable

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

WEEKDAY_NAMES_DE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag",
                    "Freitag", "Samstag", "Sonntag"]
ICS_DAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}

# Termine, die auf einem Dashboard nur Platz kosten
DEFAULT_SKIP = ("aufstehen", "wecker", "schlafen", "zaehneputzen")


class CalendarError(RuntimeError):
    pass


# --------------------------------------------------------------------------
# Parsen
# --------------------------------------------------------------------------

def unfold(text: str) -> list[str]:
    """RFC 5545: Zeilen ueber 75 Zeichen werden umgebrochen und mit einem
    Leerzeichen oder Tab fortgesetzt. Das machen wir rueckgaengig."""
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _unescape(value: str) -> str:
    return (value.replace("\\n", " ").replace("\\N", " ")
                 .replace("\\,", ",").replace("\;", ";")
                 .replace("\\\\", "\\").strip())


def _split_line(line: str) -> tuple[str, dict[str, str], str]:
    """'DTSTART;TZID=Europe/Berlin:20260901T080000' -> (name, params, value)"""
    head, _, value = line.partition(":")
    parts = head.split(";")
    name = parts[0].upper()
    params: dict[str, str] = {}
    for part in parts[1:]:
        key, _, val = part.partition("=")
        params[key.upper()] = val.strip('"')
    return name, params, value


def _zone(name: str | None):
    if not name or ZoneInfo is None:
        return None
    try:
        return ZoneInfo(name)
    except Exception:
        return None


def parse_datetime(value: str, params: dict[str, str], default_tz):
    """Gibt date (ganztaegig) oder aware datetime zurueck."""
    value = value.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", value):
        return dt.date(int(value[0:4]), int(value[4:6]), int(value[6:8]))

    match = re.fullmatch(r"(\d{8})T(\d{6})(Z)?", value)
    if not match:
        return None
    day, time, zulu = match.groups()
    naive = dt.datetime(
        int(day[0:4]), int(day[4:6]), int(day[6:8]),
        int(time[0:2]), int(time[2:4]), int(time[4:6]),
    )
    if zulu:
        return naive.replace(tzinfo=dt.timezone.utc)
    tz = _zone(params.get("TZID")) or default_tz or dt.timezone.utc
    return naive.replace(tzinfo=tz)


@dataclass
class RawEvent:
    uid: str = ""
    summary: str = ""
    location: str = ""
    description: str = ""
    start: object = None
    end: object = None
    rrule: dict[str, str] = field(default_factory=dict)
    exdates: set = field(default_factory=set)
    recurrence_id: object = None
    status: str = ""
    transparent: bool = False

    @property
    def all_day(self) -> bool:
        return isinstance(self.start, dt.date) and not isinstance(self.start, dt.datetime)


def parse_ics(text: str, default_tz=None) -> list[RawEvent]:
    events: list[RawEvent] = []
    current: RawEvent | None = None
    depth_other = 0  # VALARM/VTIMEZONE ueberspringen

    for line in unfold(text):
        if not line.strip():
            continue
        upper = line.upper()

        if upper.startswith("BEGIN:VEVENT"):
            current = RawEvent()
            continue
        if upper.startswith("END:VEVENT"):
            if current and current.start is not None:
                events.append(current)
            current = None
            continue
        if current is None:
            continue
        # Verschachtelte Komponenten im VEVENT (z. B. VALARM) ignorieren
        if upper.startswith("BEGIN:"):
            depth_other += 1
            continue
        if upper.startswith("END:"):
            depth_other = max(0, depth_other - 1)
            continue
        if depth_other:
            continue

        name, params, value = _split_line(line)
        if name == "UID":
            current.uid = value.strip()
        elif name == "SUMMARY":
            current.summary = _unescape(value)
        elif name == "LOCATION":
            current.location = _unescape(value)
        elif name == "DESCRIPTION":
            current.description = _unescape(value)[:400]
        elif name == "STATUS":
            current.status = value.strip().upper()
        elif name == "TRANSP":
            current.transparent = value.strip().upper() == "TRANSPARENT"
        elif name == "DTSTART":
            current.start = parse_datetime(value, params, default_tz)
        elif name == "DTEND":
            current.end = parse_datetime(value, params, default_tz)
        elif name == "DURATION":
            current.end = None  # ueber _duration unten aufgeloest
            current.rrule.setdefault("_DURATION", value.strip())
        elif name == "RRULE":
            for chunk in value.split(";"):
                key, _, val = chunk.partition("=")
                current.rrule[key.upper()] = val
        elif name == "EXDATE":
            for chunk in value.split(","):
                parsed = parse_datetime(chunk, params, default_tz)
                if parsed is not None:
                    current.exdates.add(_key(parsed))
        elif name == "RECURRENCE-ID":
            current.recurrence_id = parse_datetime(value, params, default_tz)

    return events


def _key(value) -> str:
    """Vergleichsschluessel, unabhaengig von der Zeitzone."""
    if isinstance(value, dt.datetime):
        return value.astimezone(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if isinstance(value, dt.date):
        return value.strftime("%Y%m%d")
    return str(value)


# --------------------------------------------------------------------------
# Wiederholungen aufloesen
# --------------------------------------------------------------------------

def _add_months(value, count: int):
    month = value.month - 1 + count
    year = value.year + month // 12
    month = month % 12 + 1
    day = min(value.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
                          else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return value.replace(year=year, month=month, day=day)


def expand(event: RawEvent, window_start: dt.date, window_end: dt.date,
           limit: int = 400) -> list[object]:
    """Alle Startzeitpunkte im Fenster. Ohne RRULE hoechstens einer."""
    start = event.start
    if start is None:
        return []

    def as_date(value) -> dt.date:
        return value.date() if isinstance(value, dt.datetime) else value

    if not event.rrule or "FREQ" not in event.rrule:
        return [start] if window_start <= as_date(start) <= window_end else []

    rule = event.rrule
    freq = rule.get("FREQ", "").upper()
    interval = max(int(rule.get("INTERVAL", 1) or 1), 1)
    count = int(rule["COUNT"]) if rule.get("COUNT", "").isdigit() else None

    until = None
    if rule.get("UNTIL"):
        until = parse_datetime(rule["UNTIL"], {}, getattr(start, "tzinfo", None))

    bydays = [ICS_DAYS[d[-2:]] for d in rule.get("BYDAY", "").split(",")
              if d and d[-2:] in ICS_DAYS]

    occurrences: list[object] = []
    produced = 0
    cursor = start
    guard = 0

    while guard < limit * 12:
        guard += 1
        candidates = [cursor]

        # Bei woechentlichen Regeln mit BYDAY liefert jede Woche mehrere Tage
        if freq == "WEEKLY" and bydays:
            monday = as_date(cursor) - dt.timedelta(days=as_date(cursor).weekday())
            candidates = []
            for weekday in sorted(bydays):
                day = monday + dt.timedelta(days=weekday)
                if isinstance(cursor, dt.datetime):
                    candidates.append(cursor.replace(
                        year=day.year, month=day.month, day=day.day))
                else:
                    candidates.append(day)

        for candidate in candidates:
            candidate_date = as_date(candidate)
            if candidate_date < as_date(start):
                continue
            if until is not None:
                stop = until if isinstance(until, type(candidate)) else None
                if stop is not None and candidate > stop:
                    return occurrences
                if stop is None and candidate_date > as_date(until):
                    return occurrences
            if count is not None and produced >= count:
                return occurrences

            produced += 1
            if _key(candidate) in event.exdates:
                continue
            if window_start <= candidate_date <= window_end:
                occurrences.append(candidate)
            elif candidate_date > window_end:
                return occurrences

        if len(occurrences) >= limit:
            return occurrences

        if freq == "DAILY":
            cursor = cursor + dt.timedelta(days=interval)
        elif freq == "WEEKLY":
            cursor = cursor + dt.timedelta(weeks=interval)
        elif freq == "MONTHLY":
            cursor = _add_months(cursor, interval)
        elif freq == "YEARLY":
            try:
                cursor = cursor.replace(year=cursor.year + interval)
            except ValueError:            # 29. Februar
                cursor = cursor.replace(year=cursor.year + interval, day=28)
        else:
            return occurrences            # unbekannte FREQ: nur der erste Termin

        if as_date(cursor) > window_end:
            return occurrences

    return occurrences


# --------------------------------------------------------------------------
# Oeffentliche Schnittstelle
# --------------------------------------------------------------------------

@dataclass
class Event:
    summary: str
    start: object
    end: object
    all_day: bool
    location: str = ""
    calendar: str = ""

    def sort_key(self) -> tuple:
        if isinstance(self.start, dt.datetime):
            return (self.start.date(), 1, self.start.timetuple()[3:5])
        return (self.start, 0, (0, 0))

    def time_label(self) -> str:
        if self.all_day:
            return "ganztägig"
        return self.start.strftime("%H:%M")

    def to_dict(self) -> dict:
        date = self.start.date() if isinstance(self.start, dt.datetime) else self.start
        today = dt.date.today()
        return {
            "summary": self.summary,
            "date": date.isoformat(),
            "date_de": date.strftime("%d.%m."),
            "weekday": WEEKDAY_NAMES_DE[date.weekday()],
            "time": None if self.all_day else self.start.strftime("%H:%M"),
            "end_time": (None if self.all_day or not isinstance(self.end, dt.datetime)
                         else self.end.strftime("%H:%M")),
            "time_label": self.time_label(),
            "all_day": self.all_day,
            "location": self.location,
            "calendar": self.calendar,
            "days_left": (date - today).days,
            "is_today": date == today,
        }


class CalendarService:
    """Holt und cached alle konfigurierten iCal-Feeds."""

    def __init__(self, config):
        self.config = config
        self._cache: dict[str, tuple[float, str]] = {}
        self.last_error: str | None = None

    @property
    def sources(self) -> list[dict]:
        raw = self.config.get("calendar.sources") or []
        return [s for s in raw if s.get("url") and s.get("enabled", True)]

    @property
    def available(self) -> bool:
        return bool(self.config.get("calendar.enabled", True)) and bool(self.sources)

    def _timezone(self):
        return _zone(self.config.timezone) or dt.timezone.utc

    def _download(self, url: str, ttl: float = 600.0) -> str:
        import time

        now = time.time()
        cached = self._cache.get(url)
        if cached and now - cached[0] < ttl:
            return cached[1]

        # webcal:// ist Apples Schreibweise fuer eine https-Abo-Adresse
        request_url = re.sub(r"^webcal://", "https://", url.strip())
        request = urllib.request.Request(
            request_url, headers={"User-Agent": "JARVIS/2.0 (+local dashboard)"}
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                text = response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as exc:
            raise CalendarError(
                f"Kalender antwortet mit HTTP {exc.code}. "
                "Adresse abgelaufen? In Google Kalender die geheime Adresse neu erzeugen."
            ) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise CalendarError(f"Kalender nicht erreichbar: {exc}") from exc

        if "BEGIN:VCALENDAR" not in text.upper():
            raise CalendarError(
                "Die Adresse liefert keinen Kalender. Es muss die iCal-Adresse "
                "sein, die auf .ics endet, nicht der Link zur Web-Ansicht."
            )
        self._cache[url] = (now, text)
        return text

    def events(self, day_from: dt.date | None = None,
               day_to: dt.date | None = None) -> list[Event]:
        day_from = day_from or dt.date.today()
        day_to = day_to or (day_from + dt.timedelta(days=14))
        skip = tuple(w.lower() for w in (self.config.get("calendar.skip_titles") or DEFAULT_SKIP))
        tz = self._timezone()
        errors: list[str] = []
        collected: list[Event] = []

        for source in self.sources:
            name = source.get("name", "Kalender")
            try:
                text = self._download(source["url"])
            except CalendarError as exc:
                errors.append(f"{name}: {exc}")
                continue

            raw_events = parse_ics(text, tz)
            # Einzeln geaenderte Termine einer Serie ersetzen die Originalinstanz
            overrides = {
                (e.uid, _key(e.recurrence_id)): e
                for e in raw_events if e.recurrence_id is not None
            }

            for event in raw_events:
                if event.recurrence_id is not None:
                    continue
                if event.status == "CANCELLED":
                    continue
                title = event.summary or "(ohne Titel)"
                if any(word in title.lower() for word in skip):
                    continue

                duration = None
                if isinstance(event.start, dt.datetime) and isinstance(event.end, dt.datetime):
                    duration = event.end - event.start

                for occurrence in expand(event, day_from, day_to):
                    replacement = overrides.get((event.uid, _key(occurrence)))
                    if replacement is not None:
                        if replacement.status == "CANCELLED":
                            continue
                        collected.append(Event(
                            summary=replacement.summary or title,
                            start=replacement.start, end=replacement.end,
                            all_day=replacement.all_day,
                            location=replacement.location, calendar=name,
                        ))
                        continue
                    collected.append(Event(
                        summary=title,
                        start=occurrence,
                        end=(occurrence + duration) if duration else event.end,
                        all_day=event.all_day,
                        location=event.location,
                        calendar=name,
                    ))

        self.last_error = "; ".join(errors) if errors else None
        collected.sort(key=lambda e: e.sort_key())
        return collected

    def today(self) -> list[dict]:
        today = dt.date.today()
        return [e.to_dict() for e in self.events(today, today)]

    def upcoming(self, days: int = 14, limit: int = 25) -> list[dict]:
        today = dt.date.today()
        found = self.events(today, today + dt.timedelta(days=days))
        return [e.to_dict() for e in found][:limit]

    def briefing_text(self) -> str:
        """Sprechbarer Absatz zu den heutigen Terminen."""
        if not self.available:
            return ""
        events = self.today()
        timed = [e for e in events if not e["all_day"]]
        if not events:
            return "Im Kalender steht heute nichts."
        if len(events) == 1:
            entry = events[0]
            when = "ganztägig" if entry["all_day"] else f"um {entry['time']} Uhr"
            place = f" in {entry['location']}" if entry["location"] else ""
            return f"Ein Termin heute: {entry['summary']} {when}{place}."
        first = timed[0] if timed else events[0]
        when = "ganztägig" if first["all_day"] else f"um {first['time']} Uhr"
        return (f"{len(events)} Termine heute. Der erste ist {first['summary']} {when}.")
