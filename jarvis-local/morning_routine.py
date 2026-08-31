#!/usr/bin/env python3
"""Morgen-Routine: Apps starten, anordnen, Musik, Audio-Briefing.

    python3 morning_routine.py            # komplett
    python3 morning_routine.py --silent   # ohne Sprachausgabe
    python3 morning_routine.py --dry-run  # nur zeigen, was passieren wuerde
"""

from __future__ import annotations

import argparse
import sys

from jarvis import config as config_module
from jarvis import launcher
from jarvis.brain import Brain
from jarvis.briefing import Briefing
from jarvis.notes import Vault
from jarvis.voice import Voice


def run(speak: bool = True, open_dashboard: bool = True, dry_run: bool = False) -> dict:
    cfg = config_module.load()
    routine = cfg.get("morning_routine", {}) or {}
    apps = [a for a in (routine.get("apps") or []) if a.get("enabled", True)]
    project_dir = cfg.get("paths.project_dir", "") or ""

    host = cfg.get("server.host", "127.0.0.1")
    port = cfg.get("server.port", 8420)
    dashboard_url = f"http://{host}:{port}/"

    # Dashboard-URL in der App-Liste aktuell halten
    for app in apps:
        if app.get("open_url", "").startswith("http://localhost") or \
           app.get("open_url", "").startswith("http://127.0.0.1"):
            app["open_url"] = dashboard_url

    report: dict = {"apps": [], "briefing": None, "music": None, "dry_run": dry_run}

    if dry_run:
        report["apps"] = [
            {"name": a.get("name"), "position": a.get("position"),
             "launched": False, "positioned": False, "message": "dry-run"}
            for a in apps
        ]
        print("Wuerde starten:")
        for app in apps:
            print(f"  - {app.get('name'):<10} -> {app.get('position')}")
    else:
        print("Starte Anwendungen …")
        report["apps"] = launcher.launch_all(apps, project_dir)
        for entry in report["apps"]:
            mark = "OK " if entry["launched"] else "-- "
            extra = "" if entry["positioned"] else (f"  ({entry['message']})" if entry["message"] else "")
            print(f"  {mark}{entry['name']}{extra}")

    # Musik: Spotify-URI direkt, YouTube laeuft im Dashboard (Browser-Autoplay)
    music = routine.get("music", {}) or {}
    if music.get("provider") == "spotify" and music.get("spotify_uri") and not dry_run:
        played = launcher.play_spotify(music["spotify_uri"])
        report["music"] = {"provider": "spotify", "started": played}
        print(f"  {'OK ' if played else '-- '}Spotify")
    elif music.get("provider") == "youtube":
        report["music"] = {
            "provider": "youtube",
            "video_id": music.get("youtube_video_id", ""),
            "title": music.get("youtube_title", ""),
            "started": False,
            "note": "Startet im Dashboard, sobald du dort einmal klickst "
                    "(Browser erlauben Ton erst nach einer Nutzeraktion).",
        }
        print(f"  >> {music.get('youtube_title', 'Musik')} startet im Dashboard")

    if open_dashboard and not dry_run and not any(
        a.get("open_url") for a in apps
    ):
        launcher.open_dashboard(dashboard_url)

    # Briefing
    vault = Vault(cfg.get("paths.notes_vault"), cfg.get("notes.max_files", 400),
              cfg.get("notes.ignore_dirs"))
    brain = Brain(cfg)
    data = Briefing(cfg, vault, brain).build(polish=brain.available)
    report["briefing"] = data

    print("\n" + "-" * 60)
    print(data["text"])
    print("-" * 60)

    if speak and routine.get("speak_briefing", True) and not dry_run:
        Voice(cfg).speak(data["text"], blocking=False)

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="JARVIS Morgen-Routine")
    parser.add_argument("--silent", action="store_true", help="ohne Sprachausgabe")
    parser.add_argument("--dry-run", action="store_true", help="nur anzeigen")
    parser.add_argument("--no-browser", action="store_true", help="Dashboard nicht oeffnen")
    args = parser.parse_args()

    try:
        run(speak=not args.silent, open_dashboard=not args.no_browser, dry_run=args.dry_run)
    except config_module.ConfigError as exc:
        print(f"Konfigurationsfehler: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
