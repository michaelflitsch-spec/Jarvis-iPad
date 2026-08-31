"""Trainingsplan-Logik: was steht heute an, was muss eingepackt werden."""

from __future__ import annotations

import datetime as dt

from .notes import WEEKDAY_KEYS_EN, WEEKDAY_NAMES_DE, Vault

TYPE_LABELS = {
    "intervall": "Lauf-Intervalltraining",
    "kraft": "Krafttraining",
    "mannschaft": "Mannschaftstraining",
    "spiel": "Matchtag",
    "regeneration": "Regeneration",
    "frei": "Ruhetag",
}

# Wird der Trainingstext aus den Notizen uebernommen, raten wir den Typ daraus.
TYPE_KEYWORDS = {
    "intervall": ("intervall", "sprint", "tempolauf", "400", "1000", "laufen", "dauerlauf"),
    "kraft": ("kraft", "gym", "hantel", "kniebeuge", "bankdruecken", "core", "rumpf"),
    "spiel": ("spiel", "match", "auswaerts", "heimspiel", "anpfiff", "turnier"),
    "mannschaft": ("mannschaft", "team", "training", "taktik", "technik"),
    "regeneration": ("regeneration", "ruhe", "frei", "dehnen", "faszien", "erholung", "pause"),
}

BASE_EQUIPMENT = {
    "intervall": ["Laufschuhe", "Pulsuhr", "Trinkflasche"],
    "kraft": ["Trainingsschuhe", "Handtuch", "Trinkflasche"],
    "mannschaft": ["Fussballschuhe", "Schienbeinschoner", "Stutzen", "Trinkflasche"],
    "spiel": ["Fussballschuhe", "Schienbeinschoner", "Stutzen", "Trikot", "Trinkflasche"],
    "regeneration": ["Faszienrolle"],
    "frei": [],
}


class Training:
    def __init__(self, vault: Vault, config: dict):
        self.vault = vault
        self.config = config or {}
        self.plan = self.config.get("plan", {}) or {}

    def session_for(self, day: dt.date | None = None) -> dict:
        day = day or dt.date.today()
        key = WEEKDAY_KEYS_EN[day.weekday()]
        entry = dict(self.plan.get(key) or {})

        session_type = entry.get("type", "frei")
        title = entry.get("title") or TYPE_LABELS.get(session_type, "Training")
        detail = entry.get("detail", "")
        equipment = list(entry.get("equipment") or BASE_EQUIPMENT.get(session_type, []))
        outdoor = bool(entry.get("outdoor", session_type in {"intervall", "mannschaft", "spiel"}))
        source = "config"

        # Notizen schlagen die config.json, wenn erlaubt.
        if self.config.get("override_from_notes", True):
            override = self.vault.training_overrides().get(key)
            if override:
                detail = override
                guessed = self._guess_type(override)
                if guessed:
                    session_type = guessed
                    title = TYPE_LABELS.get(guessed, title)
                    if not entry.get("equipment"):
                        equipment = list(BASE_EQUIPMENT.get(guessed, equipment))
                    outdoor = guessed in {"intervall", "mannschaft", "spiel"}
                source = "notes"

        return {
            "weekday": WEEKDAY_NAMES_DE[day.weekday()],
            "date": day.isoformat(),
            "type": session_type,
            "type_label": TYPE_LABELS.get(session_type, session_type.title()),
            "title": title,
            "detail": detail,
            "equipment": equipment,
            "outdoor": outdoor,
            "is_rest_day": session_type in {"regeneration", "frei"},
            "source": source,
        }

    def week(self) -> list[dict]:
        monday = dt.date.today() - dt.timedelta(days=dt.date.today().weekday())
        return [self.session_for(monday + dt.timedelta(days=i)) for i in range(7)]

    @staticmethod
    def _guess_type(text: str) -> str | None:
        lower = text.lower()
        for session_type, words in TYPE_KEYWORDS.items():
            if any(word in lower for word in words):
                return session_type
        return None

    def briefing_text(self, day: dt.date | None = None, weather: dict | None = None) -> str:
        """Sprechbarer Sport-Absatz inkl. Equipment-Erinnerung."""
        session = self.session_for(day)

        if session["is_rest_day"]:
            text = f"Sportlich ist heute {session['title']}."
            if session["detail"]:
                text += f" {session['detail']}"
            return text

        text = f"Sportlich steht {session['title']} an."
        if session["detail"]:
            text += f" {session['detail'].rstrip('.')}."

        if session["equipment"]:
            items = session["equipment"]
            listing = ", ".join(items[:-1]) + " und " + items[-1] if len(items) > 1 else items[0]
            text += f" Einpacken: {listing}."

        if session["outdoor"] and weather:
            from .weather import clothing_advice
            advice = clothing_advice(weather, outdoor=True)
            if advice["items"]:
                text += f" Dazu {', '.join(advice['items'][:3])}."

        return text
