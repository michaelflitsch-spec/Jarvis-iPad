"""JARVIS - persoenlicher Assistent (lokaler Teil)."""

import sys

__version__ = "2.1.0"

# macOS liefert als /usr/bin/python3 noch Python 3.9. Damit laeuft weder das
# anthropic-SDK noch Pydantic mit moderner Typschreibweise. Ohne diese Pruefung
# bekaeme man einen Fehler tief aus einer fremden Bibliothek statt einer
# Erklaerung, was zu tun ist.
MIN_PYTHON = (3, 10)

if sys.version_info < MIN_PYTHON:
    have = ".".join(str(part) for part in sys.version_info[:3])
    need = ".".join(str(part) for part in MIN_PYTHON)
    sys.exit(
        f"\nJARVIS braucht Python {need} oder neuer - hier laeuft {have}.\n"
        f"({sys.executable})\n\n"
        "macOS bringt ab Werk nur Python 3.9 mit. So bekommst du eine neuere Version:\n\n"
        "  1. Homebrew installieren, falls noch nicht vorhanden:\n"
        '     /bin/bash -c "$(curl -fsSL '
        'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\n\n'
        "  2. Python installieren:\n"
        "     brew install python@3.12\n\n"
        "  3. Die alte Umgebung loeschen und mit der neuen Version neu anlegen:\n"
        "     rm -rf .venv\n"
        "     $(brew --prefix)/bin/python3.12 -m venv .venv\n"
        "     source .venv/bin/activate\n"
        "     pip install -r requirements.txt\n\n"
        "Alternativ der Installer von python.org.\n"
    )
