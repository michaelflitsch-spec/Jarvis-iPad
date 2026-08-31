"""Bildschirm-Analyse via Claude Vision.

Zwei Modi:
  - mathe: Aufgabe Schritt fuer Schritt loesen (Algebra, Wahrscheinlichkeit, Funktionen)
  - code:  JavaScript/Code auf dem Bildschirm erklaeren und Fehler finden
"""

from __future__ import annotations

import base64
import datetime as dt
import io
from pathlib import Path

from .brain import BrainError, _text_of

try:
    import anthropic
except ImportError:  # pragma: no cover
    anthropic = None


MODE_PROMPTS = {
    "mathe": (
        "Auf dem Screenshot ist eine Mathematik-Aufgabe (Oberstufe: Algebra, Funktionen, "
        "Wahrscheinlichkeitsrechnung, Analysis).\n\n"
        "1. Schreibe zuerst die Aufgabe auf, so wie du sie liest. Wenn etwas unleserlich ist, sage das.\n"
        "2. Nenne in einem Satz, welches Verfahren noetig ist und warum.\n"
        "3. Loese Schritt fuer Schritt, nummeriert. Ein Rechenschritt pro Zeile, mit kurzer Begruendung.\n"
        "4. Gib das Endergebnis klar markiert als 'Ergebnis:' an.\n"
        "5. Nenne zum Schluss die eine typische Falle bei diesem Aufgabentyp.\n\n"
        "Rechne echt nach und pruefe dein Ergebnis, bevor du es hinschreibst. "
        "Wenn die Aufgabe mehrdeutig ist, sage welche Annahme du triffst."
    ),
    "code": (
        "Auf dem Screenshot ist Quellcode, vermutlich JavaScript.\n\n"
        "1. Sage in einem Satz, was der Code tun soll.\n"
        "2. Gehe die relevanten Zeilen durch und erklaere sie in einfachen Worten.\n"
        "3. Nenne konkrete Bugs oder Fallstricke, jeweils mit Zeilenbezug und Korrektur.\n"
        "4. Gib die verbesserte Fassung der kritischen Stelle als kurzen Codeblock.\n\n"
        "Wenn Code abgeschnitten ist, sage das, statt zu raten."
    ),
    "allgemein": (
        "Beschreibe knapp, was auf dem Bildschirm zu sehen ist, und sage, "
        "was der sinnvollste naechste Schritt waere. Maximal fuenf Saetze."
    ),
}


class VisionError(RuntimeError):
    pass


def capture(monitor: int = 1, max_width: int = 1600) -> bytes:
    """Screenshot als PNG-Bytes. Nutzt mss, faellt auf Pillow zurueck."""
    image = None
    try:
        import mss
        from PIL import Image

        with mss.mss() as sct:
            monitors = sct.monitors
            index = monitor if 0 < monitor < len(monitors) else (1 if len(monitors) > 1 else 0)
            shot = sct.grab(monitors[index])
            image = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
    except ImportError:
        try:
            from PIL import Image, ImageGrab
            image = ImageGrab.grab()
        except Exception as exc:
            raise VisionError(
                "Screenshot nicht moeglich. Fix: pip install mss pillow\n"
                "macOS: Systemeinstellungen > Datenschutz > Bildschirmaufnahme fuer Terminal erlauben."
            ) from exc
    except Exception as exc:
        raise VisionError(f"Screenshot fehlgeschlagen: {exc}") from exc

    if image is None:
        raise VisionError("Screenshot lieferte kein Bild.")

    if image.width > max_width:
        ratio = max_width / image.width
        from PIL import Image as _Image
        image = image.resize((max_width, int(image.height * ratio)), _Image.LANCZOS)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


class Vision:
    def __init__(self, config, brain):
        self.config = config
        self.brain = brain

    @property
    def available(self) -> bool:
        return bool(self.config.get("vision.enabled", True)) and self.brain.available

    def analyze(self, mode: str = "mathe", question: str | None = None,
                image_png: bytes | None = None) -> dict:
        if anthropic is None:
            raise VisionError("Das Paket 'anthropic' fehlt. Fix: pip install -r requirements.txt")

        png = image_png or capture(
            monitor=self.config.get("vision.monitor", 1),
            max_width=self.config.get("vision.max_width", 1600),
        )

        if self.config.get("vision.save_screenshots"):
            self._save(png)

        instruction = MODE_PROMPTS.get(mode, MODE_PROMPTS["allgemein"])
        if question:
            instruction += f"\n\nKonkrete Frage von {self.config.address}: {question}"

        client = self.brain.client()
        model = self.config.get("api.anthropic.vision_model", "claude-opus-5")
        try:
            response = client.messages.create(
                model=model,
                max_tokens=self.config.get("api.anthropic.max_tokens_vision", 4000),
                system=(
                    self.config.system_prompt()
                    + "\n\nDIESE ANTWORT WIRD GELESEN, NICHT VORGELESEN. "
                    "Du darfst hier ausfuehrlich sein, Markdown und Formeln verwenden. "
                    "Die Laengenbegrenzung fuer Sprachausgabe gilt hier nicht."
                ),
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": base64.standard_b64encode(png).decode("ascii"),
                            },
                        },
                        {"type": "text", "text": instruction},
                    ],
                }],
            )
        except anthropic.APIStatusError as exc:
            raise VisionError(f"Claude Vision Fehler {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise VisionError("Keine Verbindung zur Anthropic API.") from exc

        answer = _text_of(response)
        return {
            "mode": mode,
            "model": model,
            "answer": answer,
            "spoken": self.spoken_summary(answer),
            "bytes": len(png),
            "created_at": dt.datetime.now().isoformat(timespec="seconds"),
        }

    @staticmethod
    def spoken_summary(answer: str) -> str:
        """Kurzfassung fuer die Sprachausgabe - der lange Text steht am Bildschirm."""
        for line in answer.splitlines():
            if line.strip().lower().startswith("ergebnis"):
                return f"Ich habe es geloest. {line.strip()}"
        first = next((l.strip() for l in answer.splitlines() if l.strip()), "")
        return (first[:200] if first else "Analyse steht auf dem Bildschirm.")

    def _save(self, png: bytes) -> Path | None:
        target = self.config.get("vision.screenshot_dir") or ""
        directory = Path(target).expanduser() if target else Path(__file__).resolve().parent.parent / "screenshots"
        try:
            directory.mkdir(parents=True, exist_ok=True)
            path = directory / f"screen-{dt.datetime.now():%Y%m%d-%H%M%S}.png"
            path.write_bytes(png)
            return path
        except OSError:
            return None
