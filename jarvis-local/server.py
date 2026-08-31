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
    # Lokaler Assistent: das Dashboard laeuft im Browser derselben Maschine.
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
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


def main() -> None:
    import uvicorn

    host = cfg.get("server.host", "127.0.0.1")
    port = int(cfg.get("server.port", 8420))
    print(f"JARVIS Dashboard:  http://{host}:{port}/")
    print(f"API-Dokumentation: http://{host}:{port}/api/docs")
    if not vault.available:
        print("Hinweis: Notizverzeichnis ist nicht gesetzt -> python3 setup_wizard.py")
    if not brain.available:
        print("Hinweis: Anthropic API-Key fehlt -> python3 setup_wizard.py")
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
