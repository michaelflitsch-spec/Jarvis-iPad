#!/usr/bin/env python3
"""JARVIS FastAPI-Server.

Startet die API und liefert das Dashboard aus.

    python3 server.py            # http://127.0.0.1:8420
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from jarvis import config as config_module
from jarvis import launcher
from jarvis.brain import Brain, BrainError
from jarvis.briefing import Briefing
from jarvis.goodnotes import GoodnotesExport
from jarvis.notes import Vault
from jarvis.vision import Vision, VisionError
from jarvis.voice import Voice, VoiceError

ROOT = Path(__file__).resolve().parent
DASHBOARD = ROOT.parent / "index.html"

cfg = config_module.load()
vault = Vault(cfg.get("paths.notes_vault"), cfg.get("notes.max_files", 400),
              cfg.get("notes.ignore_dirs"))
brain = Brain(cfg)
voice = Voice(cfg)
vision = Vision(cfg, brain)
briefing = Briefing(cfg, vault, brain)
goodnotes = GoodnotesExport(cfg)

app = FastAPI(title="JARVIS", version="2.0.0", docs_url="/api/docs")
app.add_middleware(
    CORSMiddleware,
    # Loopback plus private Netze: das iPad greift ueber die LAN-IP zu.
    # Oeffentliche Adressen bleiben aussen vor.
    allow_origin_regex=(
        r"^https?://("
        r"localhost|127\.0\.0\.1|\[::1\]"
        r"|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
        r"|192\.168\.\d{1,3}\.\d{1,3}"
        r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r"|100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d{1,3}\.\d{1,3}"  # Tailscale
        r"|[\w-]+\.local|[\w-]+\.ts\.net"
        r")(:\d+)?$"
    ),
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict] = Field(default_factory=list)
    with_context: bool = True


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class VisionIn(BaseModel):
    mode: str = "mathe"
    question: str | None = None
    export: bool = False


class ExportIn(BaseModel):
    title: str
    body: str
    subtitle: str = ""


# ------------------------------ Dashboard ------------------------------

@app.get("/", include_in_schema=False)
def dashboard():
    if not DASHBOARD.exists():
        raise HTTPException(404, f"index.html nicht gefunden unter {DASHBOARD}")
    return FileResponse(DASHBOARD, headers={"Cache-Control": "no-store"})


# Icons und Assets fuer "Zum Home-Bildschirm" auf dem iPad
if (DASHBOARD.parent / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DASHBOARD.parent / "assets"), name="assets")


@app.get("/api/status")
def status():
    return {
        "ok": True,
        "owner": cfg.owner,
        "address": cfg.address,
        "time": dt.datetime.now().isoformat(timespec="seconds"),
        "config_file": str(cfg.source) if cfg.source else None,
        "modules": {
            "anthropic": brain.available,
            "elevenlabs": voice.available,
            "vision": vision.available,
            "notes": vault.available,
        },
        "vault": vault.stats(),
    }


@app.get("/api/config/public")
def public_config():
    """Nur was das Dashboard braucht - niemals Keys."""
    music = cfg.get("morning_routine.music", {}) or {}
    return {
        "owner": cfg.owner,
        "address": cfg.address,
        "timezone": cfg.timezone,
        "location": cfg.get("location.name", ""),
        "show_seconds": cfg.get("dashboard.show_seconds", True),
        "todo_limit": cfg.get("dashboard.todo_limit", 12),
        "greeting": cfg.get("personality.greeting", "").format(
            address_as=cfg.address, owner_name=cfg.owner
        ),
        "music": {
            "youtube_video_id": music.get("youtube_video_id", ""),
            "youtube_title": music.get("youtube_title", ""),
            "volume": music.get("volume", 0.7),
            "autoplay": music.get("autoplay_in_dashboard", True),
        },
        "tts": {"elevenlabs": voice.available},
    }


# ------------------------------ Daten ------------------------------

@app.get("/api/today")
def today(refresh: bool = False):
    if refresh:
        vault.read_all(refresh=True)
    return briefing.dashboard_payload()


@app.get("/api/notes/tasks")
def tasks(limit: int = 50, open_only: bool = True):
    return {"tasks": [t.to_dict() for t in vault.tasks(only_open=open_only)][:limit]}


@app.get("/api/notes/timetable")
def timetable():
    return {
        "days": {
            str(day): [lesson.to_dict() for lesson in lessons]
            for day, lessons in vault.timetable().items()
        }
    }


@app.get("/api/school/exams")
def exams():
    horizon = cfg.get("dashboard.exam_horizon_days", 21)
    return {"exams": [e.to_dict() for e in vault.exams(horizon)]}


@app.get("/api/training/week")
def training_week():
    return {"week": briefing.training.week(), "today": briefing.training.session_for()}


@app.get("/api/briefing")
def get_briefing(polish: bool = False, speak: bool = False):
    data = briefing.build(polish=polish)
    if speak and voice.available:
        try:
            voice.speak(data["text"], blocking=False)
            data["spoken"] = True
        except VoiceError as exc:
            data["spoken"] = False
            data["speak_error"] = str(exc)
    return data


# ------------------------------ Interaktion ------------------------------

@app.post("/api/chat")
def chat(payload: ChatIn):
    if not brain.available:
        raise HTTPException(
            503, "Anthropic ist nicht konfiguriert. Fix: python3 setup_wizard.py"
        )
    context = briefing.dashboard_payload() if payload.with_context else None
    try:
        reply = brain.ask(payload.message, payload.history, context)
    except BrainError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"reply": reply, "model": cfg.get("api.anthropic.chat_model")}


@app.post("/api/tts")
def tts(payload: SpeakIn):
    """MP3 fuer den Browser. Das Dashboard analysiert den Stream fuer die Animation."""
    if not voice.available:
        raise HTTPException(503, "ElevenLabs ist nicht konfiguriert.")
    try:
        audio = voice.synthesize(payload.text)
    except VoiceError as exc:
        raise HTTPException(502, str(exc)) from exc
    return Response(content=audio, media_type="audio/mpeg",
                    headers={"Cache-Control": "no-store"})


@app.post("/api/vision")
def analyze_screen(payload: VisionIn):
    if not vision.available:
        raise HTTPException(503, "Vision ist nicht verfuegbar (Key fehlt oder deaktiviert).")
    try:
        result = vision.analyze(mode=payload.mode, question=payload.question)
    except VisionError as exc:
        raise HTTPException(502, str(exc)) from exc
    if payload.export:
        try:
            result["export"] = goodnotes.from_vision(result)
        except OSError as exc:
            result["export_error"] = str(exc)
    return result


@app.post("/api/export/goodnotes")
def export_goodnotes(payload: ExportIn):
    try:
        return goodnotes.write(payload.title, payload.body, payload.subtitle)
    except OSError as exc:
        raise HTTPException(500, f"Export fehlgeschlagen: {exc}") from exc


@app.post("/api/export/today")
def export_today():
    try:
        return goodnotes.from_briefing(briefing.build())
    except OSError as exc:
        raise HTTPException(500, f"Export fehlgeschlagen: {exc}") from exc


@app.post("/api/routine/start")
def start_routine(speak: bool = Body(True, embed=True)):
    """Morgen-Routine auch aus dem Dashboard ausloesbar."""
    from morning_routine import run

    return JSONResponse(run(speak=speak, open_dashboard=False))


@app.post("/api/notes/refresh")
def refresh_notes():
    vault.read_all(refresh=True)
    return vault.stats()


def lan_addresses() -> list[str]:
    """IPv4-Adressen, unter denen andere Geraete im WLAN den Server erreichen."""
    import socket

    found: list[str] = []
    # Ein UDP-"Verbindungsaufbau" ohne Datenverkehr verraet die Adresse des
    # Interfaces, ueber das dieser Rechner nach draussen routet.
    for probe in ("8.8.8.8", "1.1.1.1"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(0.4)
                sock.connect((probe, 80))
                address = sock.getsockname()[0]
                if address and not address.startswith("127.") and address not in found:
                    found.append(address)
                break
        except OSError:
            continue
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            address = info[4][0]
            if not address.startswith("127.") and address not in found:
                found.append(address)
    except (OSError, socket.gaierror):
        pass
    return found


def main() -> None:
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(description="JARVIS Server")
    parser.add_argument("--lan", action="store_true",
                        help="auch fuer iPad und andere Geraete im WLAN erreichbar machen")
    parser.add_argument("--host", help="Bind-Adresse ueberschreiben")
    parser.add_argument("--port", type=int, help="Port ueberschreiben")
    args = parser.parse_args()

    port = args.port or int(cfg.get("server.port", 8420))
    host = args.host or ("0.0.0.0" if args.lan else cfg.get("server.host", "127.0.0.1"))
    open_to_network = host in {"0.0.0.0", "::"}

    print(f"\nJARVIS Dashboard:  http://127.0.0.1:{port}/")
    print(f"API-Dokumentation: http://127.0.0.1:{port}/api/docs")

    if open_to_network:
        addresses = lan_addresses()
        if addresses:
            print("\n  Auf dem iPad im selben WLAN oeffnen:")
            for address in addresses:
                print(f"    http://{address}:{port}/")
        else:
            print("\n  Keine LAN-Adresse gefunden. WLAN verbunden?")
        print(
            "\n  ACHTUNG: In diesem Modus kann jedes Geraet im Netz deine Notizen\n"
            "  lesen und Bildschirmfotos ausloesen. Nur im eigenen WLAN benutzen,\n"
            "  nie in oeffentlichen Netzen. Beenden mit Strg+C.\n"
            "\n  Hinweis: Ueber http (statt https) sperrt Safari Mikrofon und\n"
            "  Spracherkennung. Texteingabe und Sprachausgabe funktionieren."
        )

    if not vault.available:
        print("Hinweis: Notizverzeichnis ist nicht gesetzt -> python3 setup_wizard.py")
    if not brain.available:
        print("Hinweis: Anthropic API-Key fehlt -> python3 setup_wizard.py")
    print()
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
