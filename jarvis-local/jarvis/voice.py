"""ElevenLabs Text-to-Speech + lokale Wiedergabe."""

from __future__ import annotations

import json
import platform
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

API_BASE = "https://api.elevenlabs.io/v1/text-to-speech"


class VoiceError(RuntimeError):
    pass


class Voice:
    def __init__(self, config):
        self.config = config

    @property
    def available(self) -> bool:
        return self.config.has_elevenlabs()

    def synthesize(self, text: str, timeout: float = 30.0) -> bytes:
        """Text -> MP3-Bytes."""
        key = self.config.get("api.elevenlabs.api_key")
        if not key:
            raise VoiceError("Kein ElevenLabs API-Key hinterlegt. Fix: python3 setup_wizard.py")
        if not text.strip():
            raise VoiceError("Leerer Text.")

        voice_id = self.config.get("api.elevenlabs.voice_id", "pNInz6obpgDQGcFmaJgB")
        payload = {
            "text": text,
            "model_id": self.config.get("api.elevenlabs.model_id", "eleven_multilingual_v2"),
            "voice_settings": {
                "stability": self.config.get("api.elevenlabs.stability", 0.45),
                "similarity_boost": self.config.get("api.elevenlabs.similarity_boost", 0.8),
                "style": self.config.get("api.elevenlabs.style", 0.15),
                "use_speaker_boost": True,
                "speed": self.config.get("api.elevenlabs.speed", 1.0),
            },
        }
        request = urllib.request.Request(
            f"{API_BASE}/{voice_id}",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "xi-api-key": key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            if exc.code == 401:
                raise VoiceError("ElevenLabs lehnt den API-Key ab.") from exc
            if exc.code == 429:
                raise VoiceError("ElevenLabs Kontingent erschoepft oder Rate Limit.") from exc
            raise VoiceError(f"ElevenLabs Fehler {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise VoiceError(f"ElevenLabs nicht erreichbar: {exc}") from exc

    def speak(self, text: str, blocking: bool = True) -> bool:
        """Sprechen ueber die Systemausgabe. True bei Erfolg."""
        try:
            audio = self.synthesize(text)
        except VoiceError:
            return self._fallback_say(text, blocking)

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as handle:
            handle.write(audio)
            path = Path(handle.name)
        try:
            return _play(path, blocking)
        finally:
            if blocking:
                path.unlink(missing_ok=True)

    def _fallback_say(self, text: str, blocking: bool) -> bool:
        """Ohne ElevenLabs: System-TTS. Besser als Stille."""
        system = platform.system()
        command: list[str] | None = None
        if system == "Darwin":
            # Die deutschen Stimmen sind nicht auf jedem Mac installiert.
            # Fehlt sie, bricht "say -v Markus" ab - dann lieber die
            # Standardstimme als gar nichts.
            command = (["say", "-v", "Markus", text] if _macos_voice_exists("Markus")
                       else ["say", text])
        elif system == "Linux" and shutil.which("espeak-ng"):
            command = ["espeak-ng", "-v", "de", text]
        elif system == "Windows":
            escaped = text.replace("'", "''")
            command = [
                "powershell", "-NoProfile", "-Command",
                "Add-Type -AssemblyName System.Speech; "
                "(New-Object System.Speech.Synthesis.SpeechSynthesizer)"
                f".Speak('{escaped}')",
            ]
        if not command:
            return False
        try:
            if blocking:
                subprocess.run(command, check=False, timeout=120)
            else:
                subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True
        except (OSError, subprocess.SubprocessError):
            return False


def _macos_voice_exists(name: str) -> bool:
    try:
        result = subprocess.run(["say", "-v", "?"], capture_output=True,
                                text=True, timeout=8)
        return name.lower() in (result.stdout or "").lower()
    except (OSError, subprocess.SubprocessError):
        return False


def _play(path: Path, blocking: bool = True) -> bool:
    system = platform.system()
    if system == "Darwin":
        command = ["afplay", str(path)]
    elif system == "Windows":
        command = [
            "powershell", "-NoProfile", "-Command",
            f"$p = New-Object -ComObject WMPlayer.OCX; $p.URL = '{path}'; $p.controls.play(); "
            f"Start-Sleep -Seconds 1; while ($p.playState -eq 3) {{ Start-Sleep -Milliseconds 200 }}",
        ]
    else:
        player = next((p for p in ("mpg123", "ffplay", "mpv", "aplay", "paplay") if shutil.which(p)), None)
        if not player:
            return False
        command = {
            "mpg123": [player, "-q", str(path)],
            "ffplay": [player, "-nodisp", "-autoexit", "-loglevel", "quiet", str(path)],
            "mpv": [player, "--really-quiet", str(path)],
        }.get(player, [player, str(path)])

    try:
        if blocking:
            subprocess.run(command, check=False, timeout=300)
        else:
            subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except (OSError, subprocess.SubprocessError):
        return False
