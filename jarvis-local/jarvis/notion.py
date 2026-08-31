"""Notion-Aufgaben ueber die offizielle REST-API.

Auth ist bewusst simpel gehalten: eine interne Integration mit einem Token.
Kein OAuth, kein Redirect. Du erstellst die Integration einmal, teilst die
Datenbank mit ihr, fertig.

Die Spalten werden nicht fest verdrahtet, sondern aus dem Schema erkannt.
Notions deutsche Aufgaben-Vorlage nennt sie "Aufgabenbezeichnung", "Status"
und "Faellig"; die englische "Name", "Status", "Due". Beides funktioniert,
ohne dass du etwas konfigurierst.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import urllib.error
import urllib.request

API = "https://api.notion.com/v1"

# Kandidaten fuer die automatische Spaltenerkennung, beste zuerst
DATE_HINTS = ("fällig", "faellig", "due", "duedate", "datum", "date",
              "termin", "deadline", "abgabe")
DONE_HINTS = ("erledigt", "done", "fertig", "completed", "abgeschlossen")
STATUS_DONE_VALUES = ("done", "erledigt", "fertig", "abgeschlossen", "complete",
                      "completed", "archiviert")
PRIORITY_HINTS = ("priorität", "prioritaet", "priority", "wichtigkeit")


class NotionError(RuntimeError):
    pass


def _request(path: str, token: str, method: str = "GET",
             payload: dict | None = None, version: str = "2022-06-28",
             timeout: float = 20.0) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": version,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        try:
            message = json.loads(body).get("message", body)[:250]
        except json.JSONDecodeError:
            message = body[:250]
        if exc.code == 401:
            raise NotionError("Notion lehnt das Token ab. Neu erzeugen unter "
                              "notion.so/my-integrations") from exc
        if exc.code == 404:
            raise NotionError(
                "Datenbank nicht gefunden. Meist fehlt die Freigabe: in Notion "
                "die Datenbank oeffnen, oben rechts ··· > Verbindungen > "
                "deine Integration hinzufuegen."
            ) from exc
        if exc.code == 400 and "validation" in message.lower():
            raise NotionError(f"Notion weist die Anfrage ab: {message}") from exc
        raise NotionError(f"Notion Fehler {exc.code}: {message}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise NotionError(f"Notion nicht erreichbar: {exc}") from exc


def normalize_id(raw: str) -> str:
    """Akzeptiert Datenbank-Link oder nackte ID und liefert die UUID."""
    raw = (raw or "").strip()
    # Aus einer URL die letzte 32-stellige Hex-Folge ziehen
    matches = re.findall(r"[0-9a-fA-F]{32}", raw.replace("-", ""))
    if matches:
        value = matches[-1].lower()
        return f"{value[0:8]}-{value[8:12]}-{value[12:16]}-{value[16:20]}-{value[20:32]}"
    return raw


def _plain_text(items) -> str:
    if not isinstance(items, list):
        return ""
    return "".join(part.get("plain_text", "") for part in items).strip()


class NotionTasks:
    def __init__(self, config):
        self.config = config
        self._schema: dict | None = None
        self.last_error: str | None = None

    @property
    def token(self) -> str:
        return self.config.get("notion.token", "") or ""

    @property
    def database_id(self) -> str:
        return normalize_id(self.config.get("notion.database_id", "") or "")

    @property
    def available(self) -> bool:
        return bool(self.config.get("notion.enabled", True)) and bool(
            self.token and self.database_id
        )

    # ------------------------------------------------------------------

    def schema(self, refresh: bool = False) -> dict:
        if self._schema is not None and not refresh:
            return self._schema
        data = _request(f"/databases/{self.database_id}", self.token,
                        version=self.config.get("notion.api_version", "2022-06-28"))
        properties = data.get("properties", {})
        self._schema = {
            "title": _plain_text(data.get("title")) or "Notion",
            "properties": {name: prop.get("type") for name, prop in properties.items()},
            "raw": properties,
        }
        return self._schema

    def _pick(self, wanted_types: tuple[str, ...], hints: tuple[str, ...]) -> str | None:
        """Spalte nach Typ und Namen erraten."""
        properties = self.schema()["properties"]
        candidates = [n for n, t in properties.items() if t in wanted_types]
        if not candidates:
            return None
        for hint in hints:
            for name in candidates:
                if hint in name.lower():
                    return name
        return candidates[0]

    def columns(self) -> dict:
        """Welche Spalte ist Titel, Datum, Erledigt-Kennzeichen?"""
        properties = self.schema()["properties"]
        title = next((n for n, t in properties.items() if t == "title"), None)
        return {
            "title": title,
            "date": self._pick(("date",), DATE_HINTS),
            "status": self._pick(("status",), ("status",)),
            "checkbox": self._pick(("checkbox",), DONE_HINTS),
            "priority": self._pick(("select", "status"), PRIORITY_HINTS),
            "database": self.schema()["title"],
        }

    # ------------------------------------------------------------------

    def _is_done(self, page: dict, columns: dict) -> bool:
        properties = page.get("properties", {})
        if columns.get("checkbox"):
            value = properties.get(columns["checkbox"], {})
            if value.get("type") == "checkbox":
                return bool(value.get("checkbox"))
        if columns.get("status"):
            value = properties.get(columns["status"], {}).get("status") or {}
            name = (value.get("name") or "").lower()
            group = (value.get("group") or {})
            group_name = (group.get("name") or "").lower() if isinstance(group, dict) else ""
            if name in STATUS_DONE_VALUES or group_name in ("complete", "done", "abgeschlossen"):
                return True
        return False

    def tasks(self, only_open: bool = True, limit: int = 60,
              horizon_days: int | None = None) -> list[dict]:
        """Aufgaben im selben Format wie die aus den Markdown-Notizen."""
        if not self.available:
            return []
        columns = self.columns()
        version = self.config.get("notion.api_version", "2022-06-28")

        payload: dict = {"page_size": min(limit, 100)}
        if columns.get("date"):
            payload["sorts"] = [{"property": columns["date"], "direction": "ascending"}]

        data = _request(f"/databases/{self.database_id}/query", self.token,
                        method="POST", payload=payload, version=version)

        today = dt.date.today()
        out: list[dict] = []
        for page in data.get("results", []):
            properties = page.get("properties", {})

            title = ""
            if columns.get("title"):
                title = _plain_text(properties.get(columns["title"], {}).get("title"))
            if not title:
                continue  # leere Zeilen gibt es in fast jeder Notion-Datenbank

            done = self._is_done(page, columns)
            if only_open and done:
                continue

            due = None
            if columns.get("date"):
                date_value = properties.get(columns["date"], {}).get("date") or {}
                start = date_value.get("start")
                if start:
                    try:
                        due = dt.date.fromisoformat(start[:10])
                    except ValueError:
                        due = None

            days_left = (due - today).days if due else None
            if horizon_days is not None and days_left is not None and days_left > horizon_days:
                continue

            status_name = ""
            if columns.get("status"):
                status_name = ((properties.get(columns["status"], {}).get("status") or {})
                               .get("name") or "")

            out.append({
                "text": title,
                "done": done,
                "source": f"Notion · {columns['database']}",
                "origin": "notion",
                "due": due.isoformat() if due else None,
                "days_left": days_left,
                "overdue": bool(due and not done and due < today),
                "tags": [status_name] if status_name else [],
                "url": page.get("url", ""),
                "status": status_name,
            })

        far = dt.date.max
        out.sort(key=lambda t: (
            dt.date.fromisoformat(t["due"]) if t["due"] else far, t["text"].lower()
        ))
        return out[:limit]

    def check(self) -> dict:
        """Fuer den Setup-Assistenten: Verbindung und erkannte Spalten pruefen."""
        columns = self.columns()
        sample = self.tasks(limit=5)
        return {
            "ok": True,
            "database": columns["database"],
            "columns": {k: v for k, v in columns.items() if k != "database"},
            "open_tasks": len(sample),
            "sample": [t["text"] for t in sample[:3]],
        }
