#!/usr/bin/env python3
"""Gefuehrtes Setup fuer JARVIS.

    python3 setup_wizard.py

Fragt Schritt fuer Schritt alles ab, prueft jede Eingabe sofort gegen die
echte API und schreibt am Ende config.json. Bereits gesetzte Werte bleiben
erhalten, wenn du Enter drueckst.
"""

from __future__ import annotations

import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from jarvis import config as config_module

ROOT = Path(__file__).resolve().parent

C_BOLD = "\033[1m"
C_CYAN = "\033[36m"
C_GREEN = "\033[32m"
C_RED = "\033[31m"
C_YELLOW = "\033[33m"
C_DIM = "\033[2m"
C_OFF = "\033[0m"

if os.name == "nt" and not os.environ.get("WT_SESSION"):
    C_BOLD = C_CYAN = C_GREEN = C_RED = C_YELLOW = C_DIM = C_OFF = ""

TOTAL_STEPS = 10


def header(step: int, title: str) -> None:
    print(f"\n{C_CYAN}{'─' * 62}{C_OFF}")
    print(f"{C_BOLD}SCHRITT {step}/{TOTAL_STEPS}  ·  {title}{C_OFF}")
    print(f"{C_CYAN}{'─' * 62}{C_OFF}")


def ok(message: str) -> None:
    print(f"  {C_GREEN}✓{C_OFF} {message}")


def warn(message: str) -> None:
    print(f"  {C_YELLOW}!{C_OFF} {message}")


def fail(message: str) -> None:
    print(f"  {C_RED}✗{C_OFF} {message}")


def info(message: str) -> None:
    print(f"  {C_DIM}{message}{C_OFF}")


def ask(prompt: str, current: str = "", secret: bool = False) -> str:
    shown = ""
    if current:
        shown = f" [{_mask(current) if secret else current}]"
    while True:
        try:
            raw = (getpass.getpass(f"  {prompt}{shown}: ") if secret
                   else input(f"  {prompt}{shown}: ")).strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\nAbgebrochen. Nichts wurde gespeichert.")
            sys.exit(1)
        if raw:
            return raw
        if current:
            return current
        warn("Bitte einen Wert eingeben (oder Strg+C zum Abbrechen).")


def ask_optional(prompt: str, current: str = "", secret: bool = False) -> str:
    shown = f" [{_mask(current) if secret else current}]" if current else " [leer lassen ok]"
    try:
        raw = (getpass.getpass(f"  {prompt}{shown}: ") if secret
               else input(f"  {prompt}{shown}: ")).strip()
    except (EOFError, KeyboardInterrupt):
        print("\n\nAbgebrochen. Nichts wurde gespeichert.")
        sys.exit(1)
    return raw or current


def confirm(prompt: str, default: bool = True) -> bool:
    suffix = "[J/n]" if default else "[j/N]"
    try:
        raw = input(f"  {prompt} {suffix}: ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        print("\n\nAbgebrochen.")
        sys.exit(1)
    if not raw:
        return default
    return raw in {"j", "ja", "y", "yes"}


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:6]}…{value[-4:]}"


def _set(data: dict, dotted: str, value) -> None:
    node = data
    parts = dotted.split(".")
    for part in parts[:-1]:
        node = node.setdefault(part, {})
    node[parts[-1]] = value


def _get(data: dict, dotted: str, default=""):
    node = data
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return default
        node = node[part]
    return node if node is not None else default


# --------------------------- Pruefungen ---------------------------

def check_anthropic(key: str) -> tuple[bool, str]:
    try:
        import anthropic
    except ImportError:
        return False, "Paket 'anthropic' fehlt (pip install -r requirements.txt)"
    try:
        client = anthropic.Anthropic(api_key=key)
        client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=8,
            messages=[{"role": "user", "content": "Antworte nur mit: OK"}],
        )
        return True, "Key funktioniert"
    except anthropic.AuthenticationError:
        return False, "Key wird abgelehnt (falsch oder widerrufen)"
    except anthropic.RateLimitError:
        return True, "Key gueltig, aber gerade rate-limited"
    except anthropic.APIStatusError as exc:
        if exc.status_code == 400 and "credit" in str(exc).lower():
            return False, "Key gueltig, aber kein Guthaben auf dem Account"
        return False, f"API-Fehler {exc.status_code}"
    except anthropic.APIConnectionError:
        return False, "Keine Internetverbindung zur Anthropic API"
    except Exception as exc:
        return False, f"Unerwarteter Fehler: {str(exc)[:90]}"


def check_elevenlabs(key: str) -> tuple[bool, str, list]:
    request = urllib.request.Request(
        "https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": key}
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
        voices = [
            {"id": v.get("voice_id"), "name": v.get("name", "?")}
            for v in payload.get("voices", [])
        ]
        return True, f"{len(voices)} Stimmen verfuegbar", voices
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return False, "Key wird abgelehnt", []
        return False, f"HTTP {exc.code}", []
    except Exception as exc:
        return False, f"Nicht erreichbar: {str(exc)[:80]}", []


def check_calendar(url: str) -> tuple[bool, str]:
    import sys as _sys
    _sys.path.insert(0, str(ROOT))
    from jarvis.calendar import CalendarError, CalendarService

    class _Cfg:
        timezone = "Europe/Berlin"
        def get(self, key, default=None):
            return {
                "calendar.enabled": True,
                "calendar.sources": [{"name": "Test", "url": url, "enabled": True}],
                "calendar.skip_titles": [],
            }.get(key, default)

    service = CalendarService(_Cfg())
    try:
        events = service.upcoming(30)
    except CalendarError as exc:
        return False, str(exc)
    if not events:
        return True, "Verbunden, aber in den naechsten 30 Tagen steht nichts drin"
    preview = ", ".join(e["summary"][:28] for e in events[:3])
    return True, f"{len(events)} Termine gefunden: {preview}"


def check_notion(token: str, database_id: str) -> tuple[bool, str, dict]:
    import sys as _sys
    _sys.path.insert(0, str(ROOT))
    from jarvis.notion import NotionError, NotionTasks

    class _Cfg:
        def get(self, key, default=None):
            return {
                "notion.enabled": True,
                "notion.token": token,
                "notion.database_id": database_id,
                "notion.api_version": "2022-06-28",
            }.get(key, default)

    try:
        result = NotionTasks(_Cfg()).check()
    except NotionError as exc:
        return False, str(exc), {}
    return True, f"Datenbank \"{result['database']}\", {result['open_tasks']} offene Aufgaben", result


def geocode(place: str) -> tuple[float, float, str] | None:
    query = urllib.parse.quote(place)
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={query}&count=1&language=de"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
        results = data.get("results") or []
        if not results:
            return None
        first = results[0]
        label = first["name"]
        if first.get("country"):
            label += f", {first['country']}"
        return float(first["latitude"]), float(first["longitude"]), label
    except Exception:
        return None


YOUTUBE_ID_RE = re.compile(
    r"(?:youtu\.be/|v=|/embed/|/shorts/|/live/)([A-Za-z0-9_-]{11})"
)


def youtube_id(raw: str) -> str | None:
    raw = raw.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", raw):
        return raw
    match = YOUTUBE_ID_RE.search(raw)
    return match.group(1) if match else None


# ----------------------------- Ablauf -----------------------------

def main() -> int:
    print(f"""
{C_CYAN}╔════════════════════════════════════════════════════════════╗
║   {C_BOLD}J.A.R.V.I.S.  ·  Einrichtung{C_OFF}{C_CYAN}                             ║
╚════════════════════════════════════════════════════════════╝{C_OFF}

Ich führe dich durch {TOTAL_STEPS} Schritte. Enter übernimmt jeweils den
Wert in eckigen Klammern. Strg+C bricht ab, ohne etwas zu speichern.
API-Keys werden verdeckt eingegeben.
""")

    example = json.loads((ROOT / "config.example.json").read_text(encoding="utf-8"))
    example.pop("_comment", None)
    data = example
    if config_module.CONFIG_PATH.exists():
        try:
            existing = json.loads(config_module.CONFIG_PATH.read_text(encoding="utf-8"))
            data = config_module._deep_merge(example, existing)
            data.pop("_comment", None)
            ok(f"Bestehende config.json gefunden – Werte sind vorbelegt.")
        except json.JSONDecodeError:
            warn("config.json ist beschaedigt und wird neu aufgebaut.")

    # ---- 1: Person ----
    header(1, "Wer bist du")
    _set(data, "identity.owner_name", ask("Dein Vorname", _get(data, "identity.owner_name", "Michael")))
    _set(data, "identity.address_as", ask("Wie soll JARVIS dich ansprechen",
                                          _get(data, "identity.address_as", "Sir")))
    _set(data, "identity.timezone", ask("Zeitzone", _get(data, "identity.timezone", "Europe/Vienna")))
    ok(f"JARVIS sagt künftig \"{_get(data, 'identity.address_as')}\".")

    # ---- 2: Anthropic ----
    header(2, "Anthropic API-Key (das Gehirn)")
    info("Key holen: https://console.anthropic.com  →  Settings  →  API Keys")
    info("Der Key beginnt mit 'sk-ant-'. Ohne ihn läuft kein Chat, keine Vision.")
    while True:
        key = ask("Anthropic API-Key", _get(data, "api.anthropic.api_key"), secret=True)
        if not key.startswith("sk-ant-"):
            warn("Das sieht nicht nach einem Anthropic-Key aus (erwartet 'sk-ant-…').")
            if not confirm("Trotzdem verwenden?", default=False):
                continue
        print("  Teste den Key …")
        good, message = check_anthropic(key)
        (ok if good else fail)(message)
        if good or confirm("Trotzdem speichern und später korrigieren?", default=False):
            _set(data, "api.anthropic.api_key", key)
            break

    # ---- 3: ElevenLabs ----
    header(3, "ElevenLabs (die Stimme)")
    info("Key holen: https://elevenlabs.io  →  Profil  →  API Key")
    info("Leer lassen ist erlaubt: dann nutzt JARVIS die System-Stimme.")
    key = ask_optional("ElevenLabs API-Key", _get(data, "api.elevenlabs.api_key"), secret=True)
    if key:
        print("  Teste den Key …")
        good, message, voices = check_elevenlabs(key)
        (ok if good else fail)(message)
        _set(data, "api.elevenlabs.api_key", key)
        _set(data, "api.elevenlabs.enabled", good)
        if good and voices:
            print("\n  Verfügbare Stimmen:")
            for index, entry in enumerate(voices[:12], start=1):
                print(f"    {index:2}. {entry['name']}  {C_DIM}{entry['id']}{C_OFF}")
            choice = ask_optional("Nummer der Stimme (Enter = aktuelle behalten)", "")
            if choice.isdigit() and 1 <= int(choice) <= min(len(voices), 12):
                picked = voices[int(choice) - 1]
                _set(data, "api.elevenlabs.voice_id", picked["id"])
                ok(f"Stimme: {picked['name']}")
    else:
        _set(data, "api.elevenlabs.enabled", False)
        warn("Ohne ElevenLabs klingt JARVIS wie ein Navigationsgerät. Nachrüstbar.")

    # ---- 4: Notizen ----
    header(4, "Dein Notizverzeichnis (Obsidian)")
    info("Der Ordner mit deinen Markdown-Dateien für Schule und Training.")
    info("macOS-Tipp: Ordner ins Terminal ziehen fügt den Pfad ein.")
    while True:
        raw = ask("Pfad zum Notiz-Ordner", _get(data, "paths.notes_vault"))
        path = Path(os.path.expanduser(raw.strip().strip("'\""))).resolve()
        if not path.is_dir():
            fail(f"Kein Ordner: {path}")
            if confirm("Ordner jetzt anlegen?", default=True):
                try:
                    path.mkdir(parents=True, exist_ok=True)
                    ok(f"Angelegt: {path}")
                except OSError as exc:
                    fail(f"Ging nicht: {exc}")
                    continue
            else:
                continue
        markdown = list(path.rglob("*.md"))
        ok(f"{path}  ({len(markdown)} Markdown-Dateien)")
        if not markdown and confirm("Beispiel-Notizen (Stundenplan, Hausaufgaben, Prüfungen) hineinkopieren?", default=True):
            _copy_templates(path)
        _set(data, "paths.notes_vault", str(path))
        break

    export = ask_optional("Ordner für Goodnotes-Exporte (Enter = <Notizen>/Goodnotes)",
                          _get(data, "paths.goodnotes_export"))
    _set(data, "paths.goodnotes_export", export)

    project = ask_optional("Pfad zu deinem Projekt \"Kickplan\" (öffnet VS Code)",
                           _get(data, "paths.project_dir"))
    if project:
        project_path = Path(os.path.expanduser(project)).resolve()
        if not project_path.is_dir():
            warn(f"Existiert (noch) nicht: {project_path}")
        _set(data, "paths.project_dir", str(project_path))

    # ---- 5: Ort ----
    header(5, "Dein Ort (für Wetter und Trainingskleidung)")
    place = ask("Stadt", _get(data, "location.name", "Wien"))
    result = geocode(place)
    if result:
        latitude, longitude, label = result
        _set(data, "location.name", label)
        _set(data, "location.latitude", round(latitude, 4))
        _set(data, "location.longitude", round(longitude, 4))
        ok(f"{label}  ({latitude:.3f}, {longitude:.3f})")
    else:
        warn("Ort nicht gefunden, behalte die bisherigen Koordinaten.")
        _set(data, "location.name", place)

    # ---- 6: Musik ----
    header(6, "Startmusik")
    info("Beim Start des Dashboards läuft ein YouTube-Video unten rechts.")
    current_id = _get(data, "morning_routine.music.youtube_video_id", "")
    info(f"Voreingestellt: AC/DC – Back In Black (Video-ID {current_id})")
    warn("Prüf die ID einmal im Browser: youtube.com/watch?v=" + current_id)
    raw = ask_optional("YouTube-Link oder Video-ID (Enter = Voreinstellung behalten)", "")
    if raw:
        video_id = youtube_id(raw)
        if video_id:
            _set(data, "morning_routine.music.youtube_video_id", video_id)
            title = ask_optional("Titel für die Anzeige", "Startmusik")
            _set(data, "morning_routine.music.youtube_title", title)
            ok(f"Video-ID: {video_id}")
        else:
            fail("Daraus konnte ich keine Video-ID lesen – behalte die Voreinstellung.")

    spotify = ask_optional("Zusätzlich Spotify-Playlist-Link (optional)",
                           _get(data, "morning_routine.music.spotify_uri"))
    _set(data, "morning_routine.music.spotify_uri", spotify)
    if spotify:
        for app in data.get("morning_routine", {}).get("apps", []):
            if app.get("name") == "Spotify":
                app["enabled"] = True
        ok("Spotify wird in der Morgen-Routine mitgestartet.")

    # ---- 7: Kalender ----
    header(7, "Kalender (echte Termine im Dashboard)")
    info("JARVIS liest deinen Kalender ueber die geheime iCal-Adresse - nur lesend.")
    info("Google:  calendar.google.com > Zahnrad > Einstellungen > links deinen")
    info("         Kalender waehlen > ganz unten 'Geheime Adresse im iCal-Format'.")
    info("Apple:   Kalender > Rechtsklick auf den Kalender > Freigeben >")
    info("         Oeffentlicher Kalender > Adresse kopieren (webcal://... geht auch).")
    warn("Diese Adresse ist wie ein Passwort. Wer sie hat, sieht alle deine Termine.")

    sources = _get(data, "calendar.sources", []) or []
    current_url = sources[0].get("url", "") if sources else ""
    url = ask_optional("iCal-Adresse (Enter = ueberspringen)", current_url)
    if url:
        print("  Teste die Adresse …")
        good, message = check_calendar(url)
        (ok if good else fail)(message)
        if good or confirm("Trotzdem speichern?", default=False):
            name = ask_optional("Name fuer diesen Kalender", 
                                sources[0].get("name", "Privat") if sources else "Privat")
            _set(data, "calendar.sources", [{"name": name, "url": url, "enabled": True}])
            _set(data, "calendar.enabled", True)

            extra = ask_optional("Noch eine Adresse, z. B. Schulkalender (Enter = nein)", "")
            if extra:
                good2, message2 = check_calendar(extra)
                (ok if good2 else fail)(message2)
                if good2:
                    label = ask_optional("Name fuer diesen zweiten Kalender", "Schule")
                    current = _get(data, "calendar.sources", [])
                    current.append({"name": label, "url": extra, "enabled": True})
                    _set(data, "calendar.sources", current)

            skip = ask_optional(
                "Termine ausblenden, die diese Woerter enthalten (Komma-getrennt)",
                ", ".join(_get(data, "calendar.skip_titles", []) or []))
            _set(data, "calendar.skip_titles",
                 [w.strip() for w in skip.split(",") if w.strip()])
    else:
        _set(data, "calendar.enabled", False)
        info("Uebersprungen. Termine kommen dann nur aus deinen Notizen.")

    # ---- 8: Notion ----
    header(8, "Notion (To-dos aus deiner Aufgaben-Datenbank)")
    info("1. Oeffne notion.so/my-integrations und klicke 'New integration'.")
    info("2. Name egal, Typ 'Internal'. Das 'Internal Integration Secret' kopieren.")
    info("3. In Notion deine Aufgaben-Datenbank oeffnen, oben rechts ··· >")
    info("   Verbindungen > deine Integration hinzufuegen. Ohne das sieht sie nichts.")
    info("4. Dann den Link der Datenbank kopieren (Teilen > Link kopieren).")

    token = ask_optional("Notion-Token (Enter = ueberspringen)",
                         _get(data, "notion.token"), secret=True)
    if token:
        while True:
            database = ask("Link oder ID der Aufgaben-Datenbank",
                           _get(data, "notion.database_id"))
            print("  Teste die Verbindung …")
            good, message, result = check_notion(token, database)
            (ok if good else fail)(message)
            if good:
                columns = {k: v for k, v in result.get("columns", {}).items() if v}
                info(f"Erkannte Spalten: {columns}")
                if result.get("sample"):
                    for entry in result["sample"]:
                        info(f"  · {entry}")
                _set(data, "notion.token", token)
                _set(data, "notion.database_id", database)
                _set(data, "notion.enabled", True)
                break
            if not confirm("Nochmal versuchen?", default=True):
                _set(data, "notion.enabled", False)
                break
    else:
        _set(data, "notion.enabled", False)
        info("Uebersprungen. To-dos kommen dann nur aus deinen Markdown-Notizen.")

    # ---- 9: Apps ----
    header(9, "Morgen-Routine: welche Apps sollen starten")
    for app in data.get("morning_routine", {}).get("apps", []):
        name = app.get("name")
        state = "an" if app.get("enabled", True) else "aus"
        app["enabled"] = confirm(f"{name:<10} starten und anordnen?  (aktuell: {state})",
                                 default=app.get("enabled", True))
    port = ask("Port für das Dashboard", str(_get(data, "server.port", 8420)))
    _set(data, "server.port", int(port) if port.isdigit() else 8420)

    # ---- 8: Speichern ----
    header(8, "Speichern und prüfen")
    path = config_module.save(data)
    ok(f"Geschrieben: {path}")
    info("Dateirechte auf 600 gesetzt (nur du darfst lesen) – die Datei enthält Keys.")

    cfg = config_module.load(force=True)
    print(f"\n{C_BOLD}Status{C_OFF}")
    for label, value in [
        ("Anthropic (Chat & Vision)", cfg.has_anthropic()),
        ("ElevenLabs (Stimme)", cfg.has_elevenlabs()),
        ("Notizverzeichnis", cfg.vault is not None),
        ("Kalender", bool(cfg.get("calendar.enabled") and (cfg.get("calendar.sources") or []))),
        ("Notion", bool(cfg.get("notion.enabled") and cfg.get("notion.token"))),
    ]:
        (ok if value else warn)(f"{label}: {'bereit' if value else 'nicht konfiguriert'}")

    host = cfg.get("server.host", "127.0.0.1")
    port = cfg.get("server.port", 8420)
    print(f"""
{C_CYAN}{'─' * 62}{C_OFF}
{C_BOLD}Fertig. So geht es weiter:{C_OFF}

  1. Dashboard starten
     {C_CYAN}python3 server.py{C_OFF}
     dann im Browser:  http://{host}:{port}/

  2. Klatsch-Schwelle für deinen Raum messen
     {C_CYAN}python3 ClapTrigger.py --calibrate{C_OFF}

  3. Klatsch-Trigger laufen lassen (zweimal klatschen = Routine)
     {C_CYAN}python3 ClapTrigger.py{C_OFF}

  4. Routine einmal testen, ohne zu klatschen
     {C_CYAN}python3 morning_routine.py{C_OFF}
{C_CYAN}{'─' * 62}{C_OFF}
""")
    return 0


def _copy_templates(target: Path) -> None:
    source = ROOT / "notes_template"
    if not source.is_dir():
        warn("Keine Vorlagen gefunden.")
        return
    copied = 0
    for item in source.rglob("*.md"):
        destination = target / item.relative_to(source)
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(item.read_text(encoding="utf-8"), encoding="utf-8")
        copied += 1
    ok(f"{copied} Vorlagen kopiert nach {target}")


if __name__ == "__main__":
    raise SystemExit(main())
