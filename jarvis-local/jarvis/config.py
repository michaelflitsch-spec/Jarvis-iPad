"""Konfiguration laden, mergen und validieren."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"
EXAMPLE_PATH = ROOT / "config.example.json"

# Env-Variablen duerfen Secrets aus der config.json ueberschreiben.
# Praktisch, wenn du die Keys lieber in der Shell haelst als in einer Datei.
ENV_OVERRIDES = {
    "ANTHROPIC_API_KEY": ("api", "anthropic", "api_key"),
    "ELEVENLABS_API_KEY": ("api", "elevenlabs", "api_key"),
    "ELEVENLABS_VOICE_ID": ("api", "elevenlabs", "voice_id"),
    "JARVIS_NOTES_VAULT": ("paths", "notes_vault"),
    "JARVIS_PORT": ("server", "port"),
}


class ConfigError(RuntimeError):
    pass


def _deep_merge(base: dict, override: dict) -> dict:
    """override gewinnt, aber fehlende Keys kommen aus base (dem Beispiel)."""
    out = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _set_path(data: dict, path: tuple[str, ...], value: Any) -> None:
    node = data
    for part in path[:-1]:
        node = node.setdefault(part, {})
    node[path[-1]] = value


def _apply_env(data: dict) -> dict:
    for env_name, path in ENV_OVERRIDES.items():
        raw = os.environ.get(env_name)
        if not raw:
            continue
        if path[-1] == "port":
            try:
                raw = int(raw)
            except ValueError:
                continue
        _set_path(data, path, raw)
    return data


class Config:
    """Duenner Wrapper um das Config-Dict mit Punkt-Zugriff."""

    def __init__(self, data: dict, source: Path | None = None):
        self.data = data
        self.source = source

    def get(self, dotted: str, default: Any = None) -> Any:
        node: Any = self.data
        for part in dotted.split("."):
            if not isinstance(node, dict) or part not in node:
                return default
            node = node[part]
        return node

    def require(self, dotted: str, hint: str = "") -> Any:
        value = self.get(dotted)
        if value in (None, "", [], {}):
            raise ConfigError(
                f"Konfigurationswert '{dotted}' fehlt. {hint}\n"
                f"Fix: python3 setup_wizard.py  (oder config.json direkt bearbeiten)"
            )
        return value

    # --- haeufig gebrauchte Kurzformen ---
    @property
    def owner(self) -> str:
        return self.get("identity.owner_name", "Sir")

    @property
    def address(self) -> str:
        return self.get("identity.address_as", "Sir")

    @property
    def timezone(self) -> str:
        return self.get("identity.timezone", "Europe/Vienna")

    @property
    def vault(self) -> Path | None:
        raw = self.get("paths.notes_vault") or ""
        if not raw:
            return None
        path = Path(os.path.expanduser(raw))
        return path if path.exists() else None

    def system_prompt(self) -> str:
        template = self.get("personality.system_prompt", "")
        return template.format(
            owner_name=self.owner,
            address_as=self.address,
            max_sentences=self.get("personality.max_sentences", 4),
        )

    def has_anthropic(self) -> bool:
        return bool(self.get("api.anthropic.api_key"))

    def has_elevenlabs(self) -> bool:
        return bool(self.get("api.elevenlabs.api_key")) and bool(
            self.get("api.elevenlabs.enabled", True)
        )


_cached: Config | None = None


def load(force: bool = False) -> Config:
    """Laedt config.json, ergaenzt fehlende Keys aus config.example.json."""
    global _cached
    if _cached is not None and not force:
        return _cached

    if not EXAMPLE_PATH.exists():
        raise ConfigError(f"config.example.json fehlt unter {EXAMPLE_PATH}")

    defaults = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))

    if CONFIG_PATH.exists():
        try:
            user_data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ConfigError(
                f"config.json ist kein gueltiges JSON (Zeile {exc.lineno}, Spalte {exc.colno}): {exc.msg}"
            ) from exc
        merged = _deep_merge(defaults, user_data)
    else:
        merged = defaults

    merged.pop("_comment", None)
    _cached = Config(_apply_env(merged), CONFIG_PATH if CONFIG_PATH.exists() else None)
    return _cached


def save(data: dict) -> Path:
    data = copy.deepcopy(data)
    data.pop("_comment", None)
    CONFIG_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    try:
        CONFIG_PATH.chmod(0o600)  # enthaelt API-Keys
    except OSError:
        pass
    load(force=True)
    return CONFIG_PATH


def exists() -> bool:
    return CONFIG_PATH.exists()
