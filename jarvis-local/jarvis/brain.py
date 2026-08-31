"""Claude-Anbindung: Dialog mit JARVIS-Persoenlichkeit."""

from __future__ import annotations

import datetime as dt
from typing import Any

try:
    import anthropic
except ImportError:  # pragma: no cover
    anthropic = None


class BrainError(RuntimeError):
    pass


class Brain:
    def __init__(self, config):
        self.config = config
        self._client = None

    @property
    def available(self) -> bool:
        return anthropic is not None and bool(self.config.get("api.anthropic.api_key"))

    def client(self):
        if anthropic is None:
            raise BrainError("Das Paket 'anthropic' fehlt. Fix: pip install -r requirements.txt")
        key = self.config.get("api.anthropic.api_key")
        if not key:
            raise BrainError(
                "Kein Anthropic API-Key hinterlegt. Fix: python3 setup_wizard.py"
            )
        if self._client is None:
            self._client = anthropic.Anthropic(api_key=key)
        return self._client

    # ---------------------------------------------------------------

    def _context_block(self, context: dict | None) -> str:
        """Live-Daten als System-Kontext. Bewusst kompakt, das spart Tokens."""
        now = dt.datetime.now()
        lines = [
            "Aktueller Zustand (nutze das nur, wenn es zur Frage passt):",
            f"- Datum: {now.strftime('%A, %d.%m.%Y')}, Uhrzeit: {now.strftime('%H:%M')}",
        ]
        if not context:
            return "\n".join(lines)

        weather = context.get("weather")
        if weather:
            lines.append(
                f"- Wetter: {weather.get('temperature')} Grad, {weather.get('description')}, "
                f"Regenrisiko {weather.get('rain_probability')} Prozent"
            )

        school = context.get("school") or {}
        if school.get("subjects"):
            lines.append(f"- Faecher heute: {', '.join(school['subjects'])}")
        homework = school.get("homework") or []
        if homework:
            items = "; ".join(
                f"{t['text']}" + (f" (faellig in {t['days_left']} Tagen)" if t.get("days_left") is not None else "")
                for t in homework[:6]
            )
            lines.append(f"- Offene Aufgaben: {items}")
        exam = school.get("next_exam")
        if exam:
            lines.append(f"- Naechste Pruefung: {exam['subject']} in {exam['days_left']} Tagen")

        training = context.get("training")
        if training:
            lines.append(f"- Training heute: {training['title']}. {training.get('detail', '')}".strip())

        return "\n".join(lines)

    def ask(
        self,
        message: str,
        history: list[dict[str, Any]] | None = None,
        context: dict | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Eine Sprachantwort. Kurz gehalten, weil sie vorgelesen wird."""
        client = self.client()
        model = self.config.get("api.anthropic.chat_model", "claude-haiku-4-5")
        limit = max_tokens or self.config.get("api.anthropic.max_tokens_voice", 600)

        system = [
            {"type": "text", "text": self.config.system_prompt()},
            {"type": "text", "text": self._context_block(context)},
        ]

        messages: list[dict[str, Any]] = []
        for turn in (history or [])[-10:]:
            role = turn.get("role")
            content = (turn.get("content") or "").strip()
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message})

        try:
            response = client.messages.create(
                model=model,
                max_tokens=limit,
                system=system,
                messages=messages,
            )
        except anthropic.RateLimitError as exc:
            raise BrainError("Anthropic Rate Limit erreicht. Kurz warten.") from exc
        except anthropic.AuthenticationError as exc:
            raise BrainError("Anthropic API-Key wird abgelehnt. Bitte pruefen.") from exc
        except anthropic.APIStatusError as exc:
            raise BrainError(f"Anthropic Fehler {exc.status_code}: {exc.message}") from exc
        except anthropic.APIConnectionError as exc:
            raise BrainError("Keine Verbindung zur Anthropic API.") from exc

        return _text_of(response) or "Ich habe darauf gerade keine Antwort."

    def polish_briefing(self, raw: str) -> str:
        """Optional: das zusammengesetzte Briefing in JARVIS-Ton buegeln.

        Faellt bei jedem Fehler auf den Rohtext zurueck - ein Briefing darf nie
        daran scheitern, dass die API zickt.
        """
        if not self.available:
            return raw
        try:
            client = self.client()
            response = client.messages.create(
                model=self.config.get("api.anthropic.chat_model", "claude-haiku-4-5"),
                max_tokens=500,
                system=self.config.system_prompt(),
                messages=[{
                    "role": "user",
                    "content": (
                        "Formuliere dieses Morgen-Briefing in deinem Stil um. "
                        "Behalte jede Zahl, jeden Termin und jedes Ausruestungsstueck exakt bei - "
                        "erfinde nichts dazu und lasse nichts weg. "
                        "Maximal sechs kurze Saetze, reiner Fliesstext fuer Sprachausgabe.\n\n"
                        f"{raw}"
                    ),
                }],
            )
            return _text_of(response) or raw
        except Exception:
            return raw


def _text_of(response) -> str:
    return "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    ).strip()
