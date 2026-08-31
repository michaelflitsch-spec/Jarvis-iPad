#!/usr/bin/env python3
"""Doppelklatschen erkennen und die Morgen-Routine ausloesen.

    python3 ClapTrigger.py                # lauschen
    python3 ClapTrigger.py --calibrate    # Schwelle im Raum messen
    python3 ClapTrigger.py --list-devices # Mikrofone anzeigen
    python3 ClapTrigger.py --test         # Routine sofort starten

Erkennung: ein Klatscher ist ein sehr kurzer, sehr lauter Peak. Wir suchen
zwei davon innerhalb eines Zeitfensters und verlangen zwischen ihnen eine
Pause, damit ein einzelnes langes Geraeusch nicht als Doppelklatschen zaehlt.
"""

from __future__ import annotations

import argparse
import queue
import sys
import threading
import time

from jarvis import config as config_module

# sounddevice wirft beim Import ein OSError, wenn die PortAudio-Bibliothek des
# Systems fehlt - nicht nur ImportError. Beides abfangen, sonst stuerzt das
# Skript ab, statt den Hinweis unten anzuzeigen.
_AUDIO_IMPORT_ERROR = ""
try:
    import numpy as np
    import sounddevice as sd
except (ImportError, OSError) as exc:
    np = None
    sd = None
    _AUDIO_IMPORT_ERROR = str(exc)


DEPENDENCY_HINT = (
    "Die Klatsch-Erkennung ist nicht einsatzbereit.\n"
    f"  Grund: {_AUDIO_IMPORT_ERROR or 'sounddevice/numpy fehlen'}\n\n"
    "  1. Python-Pakete:  pip install sounddevice numpy\n"
    "  2. Systembibliothek PortAudio:\n"
    "       macOS:    brew install portaudio\n"
    "       Debian:   sudo apt install libportaudio2\n"
    "       Fedora:   sudo dnf install portaudio\n"
    "       Windows:  bereits enthalten, nichts zu tun\n"
    "  3. Mikrofon-Zugriff fuer das Terminal erlauben.\n\n"
    "Alles andere funktioniert auch ohne das. Routine ohne Klatschen starten:\n"
    "  python3 morning_routine.py"
)


class ClapDetector:
    def __init__(self, settings: dict, on_trigger):
        self.samplerate = int(settings.get("samplerate", 44100))
        self.blocksize = int(settings.get("blocksize", 1024))
        self.threshold = float(settings.get("threshold", 0.28))
        self.min_gap = float(settings.get("min_gap_seconds", 0.12))
        self.max_gap = float(settings.get("max_gap_seconds", 0.75))
        self.cooldown = float(settings.get("cooldown_seconds", 12.0))
        self.required = int(settings.get("required_claps", 2))
        self.device = settings.get("input_device")
        self.on_trigger = on_trigger

        self._peaks: list[float] = []
        self._last_trigger = 0.0
        self._level = 0.0
        self._running = False
        self._queue: queue.Queue = queue.Queue()

    @property
    def level(self) -> float:
        return self._level

    def _callback(self, indata, frames, time_info, status):
        if status:
            pass  # Buffer-Ueberlauf ignorieren, sonst rauscht die Konsole zu
        peak = float(np.max(np.abs(indata)))
        self._level = peak
        if peak >= self.threshold:
            self._queue.put(time.monotonic())

    def _consume(self):
        while self._running:
            try:
                stamp = self._queue.get(timeout=0.25)
            except queue.Empty:
                continue

            if stamp - self._last_trigger < self.cooldown:
                continue

            # Peaks, die zu dicht beieinander liegen, sind derselbe Klatscher.
            if self._peaks and stamp - self._peaks[-1] < self.min_gap:
                continue

            self._peaks = [p for p in self._peaks if stamp - p <= self.max_gap]
            self._peaks.append(stamp)

            if len(self._peaks) >= self.required:
                self._peaks.clear()
                self._last_trigger = stamp
                print(f"\n[{time.strftime('%H:%M:%S')}] Doppelklatschen erkannt.")
                try:
                    self.on_trigger()
                except Exception as exc:  # eine Panne darf den Listener nicht killen
                    print(f"Routine fehlgeschlagen: {exc}", file=sys.stderr)
                print("\nWieder bereit. Zweimal klatschen zum Starten. (Strg+C beendet)")

    def run(self):
        if sd is None or np is None:
            raise RuntimeError(DEPENDENCY_HINT)

        self._running = True
        worker = threading.Thread(target=self._consume, daemon=True)
        worker.start()

        print(f"Lausche auf Doppelklatschen … (Schwelle {self.threshold:.2f})")
        print("Zweimal klatschen zum Starten. Strg+C beendet.\n")
        try:
            with sd.InputStream(
                channels=1,
                samplerate=self.samplerate,
                blocksize=self.blocksize,
                device=self.device,
                callback=self._callback,
            ):
                while self._running:
                    bar = "#" * int(min(self._level, 1.0) * 30)
                    marker = "  <- ueber Schwelle" if self._level >= self.threshold else ""
                    print(f"\rPegel |{bar:<30}| {self._level:.3f}{marker}   ", end="", flush=True)
                    time.sleep(0.08)
        except KeyboardInterrupt:
            print("\nBeendet.")
        except Exception as exc:
            raise RuntimeError(f"Mikrofon nicht verfuegbar: {exc}") from exc
        finally:
            self._running = False


def calibrate(settings: dict, seconds: int = 12) -> float:
    """Misst Raumpegel und Klatsch-Pegel und schlaegt eine Schwelle vor."""
    if sd is None or np is None:
        raise RuntimeError(DEPENDENCY_HINT)

    samplerate = int(settings.get("samplerate", 44100))
    peaks: list[float] = []

    print(f"Kalibrierung laeuft {seconds} Sekunden.")
    print("Sekunde 1 bis 5: bitte still sein.")
    print("Ab Sekunde 6: mehrmals kraeftig klatschen.\n")

    def callback(indata, frames, time_info, status):
        peaks.append((time.monotonic(), float(np.max(np.abs(indata)))))

    peaks = []
    start = time.monotonic()
    with sd.InputStream(channels=1, samplerate=samplerate,
                        blocksize=int(settings.get("blocksize", 1024)),
                        device=settings.get("input_device"), callback=callback):
        while time.monotonic() - start < seconds:
            elapsed = time.monotonic() - start
            phase = "STILL " if elapsed < 5 else "KLATSCHEN"
            print(f"\r{phase}  {seconds - elapsed:4.1f}s   ", end="", flush=True)
            time.sleep(0.1)

    quiet = [value for stamp, value in peaks if stamp - start < 5]
    loud = [value for stamp, value in peaks if stamp - start >= 6]
    if not quiet or not loud:
        raise RuntimeError("Zu wenig Audiodaten. Mikrofon pruefen.")

    noise = float(np.percentile(quiet, 95))
    clap = float(np.percentile(loud, 99))
    if clap <= noise * 1.5:
        raise RuntimeError(
            f"Klatschen ({clap:.3f}) hebt sich kaum vom Raum ab ({noise:.3f}). "
            "Naeher ans Mikrofon oder Eingangspegel erhoehen."
        )

    suggestion = round(min(max(noise + (clap - noise) * 0.45, 0.05), 0.9), 3)
    print(f"\n\nRaumpegel:   {noise:.3f}")
    print(f"Klatschen:   {clap:.3f}")
    print(f"Empfehlung:  threshold = {suggestion}")
    return suggestion


def list_devices() -> None:
    if sd is None:
        raise RuntimeError(DEPENDENCY_HINT)
    print("Verfuegbare Eingabegeraete:\n")
    for index, device in enumerate(sd.query_devices()):
        if device["max_input_channels"] > 0:
            print(f"  [{index}] {device['name']}  ({device['max_input_channels']} Kanaele)")
    print('\nIn config.json: "clap_trigger": { "input_device": <Nummer> }')


def main() -> int:
    parser = argparse.ArgumentParser(description="JARVIS Klatsch-Trigger")
    parser.add_argument("--calibrate", action="store_true", help="Schwelle messen")
    parser.add_argument("--list-devices", action="store_true", help="Mikrofone anzeigen")
    parser.add_argument("--test", action="store_true", help="Routine sofort ausfuehren")
    parser.add_argument("--silent", action="store_true", help="Routine ohne Sprachausgabe")
    parser.add_argument("--threshold", type=float, help="Schwelle ueberschreiben")
    args = parser.parse_args()

    try:
        cfg = config_module.load()
    except config_module.ConfigError as exc:
        print(f"Konfigurationsfehler: {exc}", file=sys.stderr)
        return 1

    settings = dict(cfg.get("clap_trigger", {}) or {})
    if args.threshold is not None:
        settings["threshold"] = args.threshold

    try:
        if args.list_devices:
            list_devices()
            return 0

        if args.calibrate:
            suggestion = calibrate(settings)
            print("\nTrage den Wert in config.json unter clap_trigger.threshold ein.")
            return 0

        import morning_routine

        def trigger():
            morning_routine.run(speak=not args.silent, open_dashboard=True)

        if args.test:
            trigger()
            return 0

        if not settings.get("enabled", True):
            print("clap_trigger ist in config.json deaktiviert.")
            return 1

        ClapDetector(settings, trigger).run()
    except RuntimeError as exc:
        print(f"\n{exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
