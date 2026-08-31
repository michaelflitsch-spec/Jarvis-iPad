"""Tages-Briefing: Wetter -> Schule -> Sport, in dieser Reihenfolge."""

from __future__ import annotations

import datetime as dt

from . import weather as weather_api
from .school import School
from .training import Training


class Briefing:
    def __init__(self, config, vault, brain=None):
        self.config = config
        self.vault = vault
        self.brain = brain
        self.school = School(vault, config.get("dashboard.exam_horizon_days", 21))
        self.training = Training(vault, config.get("training", {}))

    def weather(self) -> dict | None:
        try:
            return weather_api.fetch(
                self.config.get("location.latitude", 48.2082),
                self.config.get("location.longitude", 16.3738),
                self.config.timezone,
            )
        except weather_api.WeatherError:
            return None

    def build(self, day: dt.date | None = None, polish: bool = False) -> dict:
        day = day or dt.date.today()
        current_weather = self.weather()
        session = self.training.session_for(day)
        school_overview = self.school.overview(day)

        greeting = self.config.get(
            "personality.greeting", "Guten Morgen, {address_as}."
        ).format(address_as=self.config.address, owner_name=self.config.owner)

        parts = [
            greeting,
            weather_api.briefing_text(current_weather, outdoor=session["outdoor"]),
            self.school.briefing_text(day),
            self.training.briefing_text(day, current_weather),
        ]
        text = " ".join(p.strip() for p in parts if p and p.strip())

        if polish and self.brain and self.brain.available:
            text = self.brain.polish_briefing(text)

        return {
            "date": day.isoformat(),
            "text": text,
            "sections": {
                "greeting": greeting,
                "weather": parts[1],
                "school": parts[2],
                "training": parts[3],
            },
            "weather": current_weather,
            "clothing": weather_api.clothing_advice(current_weather, session["outdoor"])
            if current_weather else None,
            "school": school_overview,
            "training": session,
            "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        }

    def dashboard_payload(self, day: dt.date | None = None) -> dict:
        """Alles was das Dashboard links anzeigt - ohne Claude-Aufruf."""
        day = day or dt.date.today()
        current_weather = self.weather()
        session = self.training.session_for(day)
        overview = self.school.overview(day)
        return {
            "date": day.isoformat(),
            "weekday": overview["weekday"],
            "weather": current_weather,
            "clothing": weather_api.clothing_advice(current_weather, session["outdoor"])
            if current_weather else None,
            "school": overview,
            "training": session,
            "vault": self.vault.stats(),
            "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        }
