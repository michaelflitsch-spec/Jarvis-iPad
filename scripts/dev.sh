#!/usr/bin/env bash
# Startet JARVIS lokal zum Ausprobieren: Oberfläche auf Port 8000,
# Backend auf Port 8787 (nur wenn server/.env existiert).
#
#   ./scripts/dev.sh
#
# Danach http://localhost:8000 im Browser öffnen. Wichtig: localhost, nicht
# die IP-Adresse - nur localhost gilt dem Browser als sicherer Kontext, und
# ohne den gibt Safari das Mikrofon nicht frei.
set -euo pipefail
cd "$(dirname "$0")/.."

WEB_PORT="${WEB_PORT:-8000}"
API_PORT="${API_PORT:-8787}"
pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

if [ -f server/.env ]; then
  if [ ! -d server/node_modules ]; then
    echo "→ Installiere Backend-Abhängigkeiten …"
    (cd server && npm install --silent)
  fi
  echo "→ Backend startet auf Port $API_PORT"
  (cd server && PORT="$API_PORT" npm start) &
  pids+=($!)
else
  echo "→ Kein server/.env gefunden – Backend bleibt aus."
  echo "  Für Mails, Kalender, Notion und das Gespräch: cp server/.env.example server/.env"
fi

echo "→ Oberfläche startet auf Port $WEB_PORT"
python3 -m http.server "$WEB_PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
pids+=($!)

sleep 1
cat <<INFO

  JARVIS läuft.

    Oberfläche   http://localhost:$WEB_PORT
    Backend      http://localhost:$API_PORT

  Im Browser öffnen, auf AKTIVIEREN tippen, Mikrofon erlauben,
  dann "Jarvis" sagen.

  Wichtig: localhost verwenden, nicht die IP-Adresse. Nur localhost
  gilt als sicherer Kontext - ohne den gibt der Browser das Mikrofon
  nicht frei.

  Beenden mit Strg+C

INFO
wait
