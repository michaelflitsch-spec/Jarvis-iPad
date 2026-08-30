# JARVIS // iPad

Ein persönlicher Sprachassistent im Iron-Man-Stil für das iPad.

Du sagst **„Jarvis“** – er fährt hoch, startet über Spotify *Back In Black* von AC/DC,
zeigt das HUD, briefed dich zu Wetter, Aufgabenspeicher 7, Kalender und neuen Mails,
öffnet den Taskmanager und ist danach im Gespräch ansprechbar. Er plant Tag und Woche
in Notion, trägt Termine in den Google Kalender ein – und ruft dich bei wirklich
dringenden Mails auf dem iPhone an.

## Aufbau

Zwei Teile, die getrennt laufen:

| Teil | Wo es läuft | Was es tut |
|---|---|---|
| **Frontend** (`index.html`, `assets/`) | iPad-Safari, z. B. über GitHub Pages | Oberfläche, Weckwort, Sprachausgabe, Taskmanager |
| **Backend** (`server/`) | Node.js bei einem Hoster deiner Wahl | Claude, Gmail, Kalender, Notion, Spotify, Telefonie |

Das Frontend allein funktioniert schon: HUD, Sprache, Wetter und der Aufgabenspeicher
laufen ohne Server. Alles, was an deine Konten geht, braucht das Backend – dort und
nur dort liegen die Zugangsdaten.

```
  iPad (Safari)                  dein Backend                 Dienste
  ─────────────                  ────────────                 ───────
  Weckwort „Jarvis“   ──────►    /api/briefing      ──────►   Gmail, Kalender
  Sprachausgabe       ◄──────    /api/chat  (Claude) ─────►   Notion, Spotify
  Taskmanager         ◄─────►    /api/tasks         ──────►   Twilio → iPhone
```

## Schnellstart

1. **Frontend veröffentlichen** – im GitHub-Repo unter *Settings → Pages* die Quelle
   auf den Branch stellen. Danach `https://<name>.github.io/Jarvis-iPad/` auf dem
   iPad in Safari öffnen und über *Teilen → Zum Home-Bildschirm* ablegen.
2. **Backend aufsetzen** – siehe [`docs/SETUP.md`](docs/SETUP.md). Kurzfassung:
   ```bash
   cd server
   cp .env.example .env      # ausfüllen
   npm install
   npm start
   ```
3. **Verbinden** – im JARVIS-HUD oben rechts auf ⚙︎, Backend-Adresse und
   Zugriffsschlüssel eintragen, speichern. Dann über die erscheinenden Links
   Google und Spotify verbinden.

## Was JARVIS kann

- **Weckwort** „Jarvis“ – dauerhaftes Lauschen, mit direkt angehängtem Befehl
  („Jarvis, lies meine Mails“)
- **Boot-Sequenz** mit Terminal-Log, Arc-Reaktor und Klang: der Startsweep wird
  selbst erzeugt, eigene `assets/boot-intro.mp3` wird bevorzugt, Spotify optional
- **Briefing**: Wetter, offene Aufgaben, Termine heute, neue Mails nach Wichtigkeit
- **Gespräch** über Claude mit Werkzeugen: Mails lesen, Termine anlegen,
  Aufgaben verwalten, Musik steuern, Tages-/Wochenplan in Notion schreiben
- **Taskmanager**: verschiebbares Fenster, „Aufgabenspeicher 7“, mit Notion synchron
- **Anruf aufs iPhone** bei dringenden Mails (über Twilio), wahlweise als Push

## Kosten und Voraussetzungen, ehrlich

- **Claude-API**: nach Verbrauch. Ein Briefing plus ein paar Fragen liegt im
  Cent-Bereich pro Tag.
- **Spotify-Fernsteuerung**: braucht **Spotify Premium** und ein aktives Gerät.
  Nur nötig, wenn du beim Hochfahren den *ganzen* Song willst – das mitgelieferte
  Intro läuft ohne all das. Ohne Premium zeigt JARVIS einen Knopf, der den Song
  mit einem Tipp öffnet.
  Das Spotify-Konto darf ein ganz anderes sein als das Google-Konto – Konto wechseln
  geht über `/auth/spotify`, siehe [SETUP](docs/SETUP.md#spotify-konto-wechseln).
- **Anruf**: Twilio kostet pro Anruf wenige Cent und braucht eine eigene Nummer.
  Kostenlose Alternative: ein Push-Webhook (z. B. ntfy.sh oder ein iOS-Kurzbefehl).
- **Spracherkennung**: funktioniert in Safari ab iOS 14.5. Das Weckwort läuft nur,
  solange die Seite offen und der Bildschirm an ist – iOS lässt keine
  Hintergrund-Spracherkennung im Browser zu.

## Sicherheit

Das Backend hat Zugriff auf dein Postfach. Deshalb:

- `JARVIS_TOKEN` setzen (langes Zufallspasswort) – ohne passenden Schlüssel
  antwortet jede `/api`-Route mit 401.
- `ALLOWED_ORIGINS` auf deine GitHub-Pages-Adresse einschränken.
- `server/.env` und `server/data/` sind über `.gitignore` ausgeschlossen und dürfen
  nie eingecheckt werden.
