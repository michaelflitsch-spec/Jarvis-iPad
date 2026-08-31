# J.A.R.V.I.S.

Persönlicher Assistent für Schule, Fußball und Coding.
Dashboard im Browser, Gehirn von Claude, Stimme von ElevenLabs, Daten aus deinem Obsidian-Ordner.

---

## Was das System kann

| Bereich | Funktion |
|---|---|
| **Morgen-Routine** | Doppelklatschen startet Obsidian, VS Code (Projekt Kickplan), Chrome mit dem Dashboard und optional Spotify – und ordnet die Fenster an |
| **Schule** | Liest Stundenplan, Hausaufgaben und Prüfungstermine aus deinen Markdown-Notizen |
| **Kalender** | Echte Termine über die geheime iCal-Adresse, inklusive Serientermine |
| **Notion** | To-dos aus deiner Aufgaben-Datenbank, zusammengeführt mit den Notizen |
| **Bildschirm-Analyse** | Claude sieht deinen Bildschirm und löst Mathe-Aufgaben Schritt für Schritt oder erklärt JavaScript |
| **Fußball** | Trainingsplan pro Wochentag, Wetter-Check und Packliste („Fußballschuhe einpacken") |
| **Audio-Briefing** | Beim Start: Wetter + Kleidung, dann Schule, dann Sporteinheit |
| **Goodnotes-Export** | Zusammenfassungen als Markdown + druckfertiges A4-HTML |

---

## Aufbau

```
Jarvis-iPad/
├── index.html              ← Dashboard (3 Bereiche)
├── jarvis-local/           ← der lokale Teil, läuft auf deinem Rechner
│   ├── setup_wizard.py     ← START HIER
│   ├── server.py           ← FastAPI: liefert Dashboard + API
│   ├── ClapTrigger.py      ← Klatsch-Erkennung
│   ├── morning_routine.py  ← Apps starten und anordnen
│   ├── config.json         ← deine Einstellungen (wird angelegt, nie ins Git)
│   ├── notes_template/     ← Beispiel-Notizen zum Kopieren
│   └── jarvis/             ← Module (Notizen, Schule, Training, Wetter, Vision, Stimme)
└── server/                 ← alter Node-Backend-Entwurf, aktuell ungenutzt
```

**Das Dashboard ist in drei Bereiche geteilt:**

```
┌──────────────────────────────────────────────┐
│  Kopfzeile: Uhr, Datum, Systemstatus         │
├───────────────────┬──────────────────────────┤
│                   │  Obsidian-Daten          │
│   JARVIS          │  To-dos · Stundenplan    │
│   Punkte-Kreis    │  Termine · Training      │
│   reagiert auf    ├──────────────────────────┤
│   Stimme          │  AC/DC – Back In Black   │
│                   │  (YouTube, mit Ton)      │
└───────────────────┴──────────────────────────┘
```

Der Punkte-Kreis links pulsiert nach der echten Lautstärke:
**grün** wenn er dir zuhört, **cyan** wenn er spricht, **gelb** wenn er denkt.

---

## Einrichtung

### Schritt 1 – Python-Pakete installieren

> **Du brauchst Python 3.10 oder neuer.** Prüfen mit `python3 --version`.
> macOS bringt ab Werk nur **3.9** mit – damit läuft es nicht. Dann:
> `brew install python@3.12` und die venv mit
> `$(brew --prefix)/bin/python3.12 -m venv .venv` anlegen.
> JARVIS sagt es dir beim Start, falls die Version nicht reicht.

```bash
cd jarvis-local
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

<details>
<summary>Systempakete für den Klatsch-Trigger (nur wenn <code>sounddevice</code> meckert)</summary>

```bash
# macOS
brew install portaudio

# Linux
sudo apt install libportaudio2 wmctrl

# Windows (optional, für exaktes Fenster-Anordnen)
pip install pywin32
```
</details>

### Schritt 2 – Assistent einrichten

```bash
python3 setup_wizard.py
```

Der Assistent führt dich durch **10 Schritte** und prüft jede Eingabe sofort gegen die echte API:

| Schritt | Was du brauchst | Wo du es herbekommst |
|---|---|---|
| 1 | Name und Anrede | – (Voreinstellung: „Sir") |
| 2 | **Anthropic API-Key** | [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys → beginnt mit `sk-ant-` |
| 3 | **ElevenLabs API-Key** | [elevenlabs.io](https://elevenlabs.io) → Profil → API Key (darf leer bleiben) |
| 4 | **Pfad zum Notiz-Ordner** | dein Obsidian-Vault, z. B. `~/Documents/Obsidian/Michael` |
| 5 | Deine Stadt | für Wetter und Kleidungsempfehlung |
| 6 | **YouTube-Link** | für die Startmusik |
| 7 | **iCal-Adresse** | Google Kalender → Einstellungen → *Geheime Adresse im iCal-Format* (optional) |
| 8 | **Notion-Token + Datenbank** | notion.so/my-integrations (optional) |
| 9 | Welche Apps starten sollen | – |
| 10 | Speichern | schreibt `config.json` mit Rechten 600 |

> Enter übernimmt jeweils den vorgeschlagenen Wert. Strg+C bricht ab, ohne etwas zu speichern.
> API-Keys werden verdeckt eingegeben und landen **nur** in `config.json` – die ist in `.gitignore`.

**Zu Schritt 2 – der Anthropic-Key:** Ohne ihn läuft kein Chat und keine Bildschirm-Analyse.
Du brauchst Guthaben auf dem Account; der Wizard sagt dir sofort, wenn keins da ist.

**Zu Schritt 3 – die Stimme:** Der Wizard listet deine ElevenLabs-Stimmen auf und du wählst per
Nummer. Lässt du den Key leer, nutzt JARVIS die eingebaute Systemstimme – klingt schlechter,
funktioniert aber sofort und kostet nichts.

**Zu Schritt 4 – der Notiz-Ordner:** Zieh den Ordner ins Terminal, dann steht der Pfad da.
Ist er leer, bietet der Wizard an, Beispiel-Notizen hineinzukopieren.

**Zu Schritt 6 – die Musik:** Voreingestellt ist die Video-ID `pAgnJDJN4VA` für
AC/DC – Back In Black. **Prüf sie einmal** unter `youtube.com/watch?v=pAgnJDJN4VA`;
wenn das nicht das richtige Video ist, füg im Wizard einfach den Link deiner Wahl ein.

### Schritt 3 – Starten

```bash
python3 server.py
```

Dann im Browser: **http://127.0.0.1:8420/**

Einmal auf **SYSTEM STARTEN** klicken.

> Auf dem iPad statt am Mac testen? Siehe [Auf dem iPad benutzen](#auf-dem-ipad-benutzen). Damit beginnt die Musik mit Ton, das Audio-Briefing
läuft los und das Mikrofon wird freigegeben.

> **Warum dieser Klick nötig ist:** Chrome, Safari und Firefox blockieren Ton, der ohne
> Zutun des Nutzers startet. Das ist eine feste Browser-Regel, kein Einstellungsfehler.
> Ein Klick ist das Minimum – danach läuft alles automatisch.

### Schritt 4 – Klatsch-Trigger scharf schalten

```bash
python3 ClapTrigger.py --calibrate   # misst deinen Raum, dauert 12 Sekunden
python3 ClapTrigger.py               # lauscht: zweimal klatschen startet alles
```

Der Kalibrierlauf schlägt dir einen Wert vor – trag ihn in `config.json` unter
`clap_trigger.threshold` ein. Zu viele Fehlauslöser? Wert erhöhen. Reagiert nicht? Senken.

---

## Wie du deine Notizen schreiben musst

JARVIS liest **alle** `.md`-Dateien im Vault. Es zählt nicht der Dateiname, sondern das Format
der Zeile. Ordner wie `Goodnotes/`, `Archiv/` und `templates/` werden übersprungen
(einstellbar über `notes.ignore_dirs`).

### Hausaufgaben und To-dos

Alles, was eine Markdown-Checkbox ist:

```markdown
- [ ] Mathematik: Seite 42, Aufgaben 3 bis 7 (fällig: 2026-09-02)
- [ ] Informatik: Fetch-Übung fertig machen due: 03.09.2026 #kickplan
- [ ] Deutsch: Erörterung gliedern 📅 2026-09-04
- [x] Physik: Protokoll abgegeben          ← erledigt, wird ausgeblendet
```

Erkannte Datumsformate: `2026-09-02`, `02.09.2026`, mit `fällig:`, `due:`, `Abgabe:`,
`Deadline:`, `📅` oder `@` davor. Ohne Datum landet die Aufgabe unter „OFFEN".
Überfällige Aufgaben erscheinen rot ganz oben.

### Stundenplan

Datei mit `Stundenplan`, `Schule` oder `Unterricht` im Pfad:

```markdown
## Montag
- 08:00 Mathematik (R204)
- 09:50 Deutsch (R112)
- 13:30 Sport (Halle)

## Dienstag
- 08:00 Physik (R301)
```

Kurzform in einer Zeile geht auch: `- Montag: 08:00 Mathe, 09:50 Deutsch`

### Prüfungen

Eine Zeile mit Datum **und** einem Stichwort wie Schularbeit, Test, Prüfung, Klausur oder Referat:

```markdown
- 2026-09-08 Mathematik Schularbeit (Funktionen und Wahrscheinlichkeit)
- 12.09.2026 Englisch Test Unit 3
```

### Trainingsplan

Datei mit `Training` im Namen. Überschreibt für diesen Tag die `config.json`:

```markdown
- Mittwoch: Intervall 8 mal 400 Meter, 90 Sekunden Pause
- Samstag: Auswärtsspiel, Abfahrt 12:30
```

JARVIS errät aus dem Text die Art der Einheit (Intervall, Kraft, Spiel, Regeneration)
und leitet daraus die Packliste ab.

---

## Täglicher Ablauf

```bash
# einmal morgens, Terminal offen lassen
python3 server.py &
python3 ClapTrigger.py
```

Dann **zweimal klatschen**:

1. Obsidian, VS Code (mit Kickplan), Chrome und optional Spotify starten und ordnen sich an
2. Das Dashboard öffnet sich
3. Nach dem Klick auf SYSTEM STARTEN läuft die Musik und JARVIS liest das Briefing vor:
   *Wetter und was du anziehen sollst → Fächer und To-dos → Trainingseinheit und Packliste*

**Ohne Klatschen testen:** `python3 morning_routine.py`
**Nur anschauen, nichts starten:** `python3 morning_routine.py --dry-run`

---

## Bildschirm-Analyse

Mathe-Aufgabe oder Code auf dem Bildschirm offen lassen, dann im Dashboard auf
**MATHE LÖSEN** oder **CODE ERKLÄREN**. Optional vorher eine konkrete Frage ins Eingabefeld tippen.

Claude macht einen Screenshot, löst die Aufgabe Schritt für Schritt und zeigt den Weg
als Overlay. JARVIS spricht nur die Kurzfassung – den Rechenweg liest du.
**NACH GOODNOTES** legt daraus eine Notiz an.

> macOS fragt beim ersten Mal nach der Berechtigung „Bildschirmaufnahme" für dein Terminal.
> Ohne diese Freigabe kommt ein schwarzes Bild.

---

## Goodnotes-Export

Jeder Export erzeugt zwei Dateien im Export-Ordner:

- **`.md`** – zum Weiterarbeiten in Obsidian
- **`.html`** – A4-Layout mit Platz für eigene Notizen

So kommt es nach Goodnotes: HTML im Browser öffnen → Drucken → **Als PDF sichern** →
Teilen → Goodnotes. PDF ist das Format, das Goodnotes am saubersten importiert.

---

## Persönlichkeit anpassen

Alles in `config.json` unter `personality`:

```json
"personality": {
  "system_prompt": "Du bist J.A.R.V.I.S. ...",
  "max_sentences": 4,
  "greeting": "Systeme hochgefahren, {address_as}."
}
```

`max_sentences` ist der wichtigste Hebel: Die Antworten werden vorgelesen, deshalb sind sie
bewusst kurz gehalten – kein Markdown, keine Aufzählungen, keine Schachtelsätze.
Willst du ihn geschwätziger, stell auf 6. Für die Bildschirm-Analyse gilt das Limit nicht.

---

## Was tun, wenn …

| Problem | Ursache und Lösung |
|---|---|
| Dashboard sagt „SERVER OFFLINE" | `python3 server.py` läuft nicht, oder ein anderer Port. Prüfen: `server.port` in `config.json` |
| Keine Musik zu hören | Du hast SYSTEM STARTEN nicht geklickt. Browser lassen Ton nicht ohne Klick zu |
| YouTube zeigt „Video nicht verfügbar" | Video-ID stimmt nicht. Im Wizard Schritt 6 den richtigen Link einfügen |
| To-dos bleiben leer | Format prüfen: die Zeile muss mit `- [ ]` beginnen. Danach **NOTES**-Anzeige oben rechts prüfen |
| Stundenplan leer | Datei braucht `Stundenplan`, `Schule` oder `Unterricht` im Pfad, und `## Montag` als Überschrift |
| Klatschen löst nichts aus | `python3 ClapTrigger.py --calibrate`, Wert eintragen. Mikrofon wählen: `--list-devices` |
| Klatschen löst dauernd aus | `clap_trigger.threshold` erhöhen |
| Fenster werden nicht angeordnet | macOS: Systemeinstellungen → Datenschutz → **Bedienungshilfen** → Terminal erlauben. Windows: `pip install pywin32`. Linux: `sudo apt install wmctrl` |
| Ein Fenster landet falsch | Selten: eine App meldet sich unter anderem Prozessnamen. In `config.json` bei der App `"process_name": "Code"` ergänzen |
| „JARVIS braucht Python 3.10“ | Deine venv nutzt macOS-Python 3.9. `rm -rf .venv`, dann mit `brew install python@3.12` neu anlegen |
| Screenshot ist schwarz | macOS: Datenschutz → **Bildschirmaufnahme** → Terminal erlauben |
| Stimme klingt nach Navi | ElevenLabs ist nicht konfiguriert – JARVIS nutzt die Systemstimme. Wizard Schritt 3 |
| Mikrofon-Knopf ist ausgegraut | Seite läuft über `http`. Kein Browser-Problem – `https` einrichten (Tailscale) oder am Rechner über `localhost` öffnen |
| Kein Wetter | Open-Meteo nicht erreichbar. Kein Key nötig, aber Internet |

Status jederzeit prüfen: **http://127.0.0.1:8420/api/status**
Alle Endpunkte ausprobieren: **http://127.0.0.1:8420/api/docs**

---

## Kalender und Notion verbinden

Beides ist optional. Ohne läuft JARVIS weiter mit den Terminen und Aufgaben
aus deinen Markdown-Notizen.

### Kalender (echte Termine)

JARVIS liest deinen Kalender über die **geheime iCal-Adresse** – nur lesend,
kein OAuth, kein Google-Cloud-Projekt. Eine Adresse zum Kopieren.

**Google Kalender:** calendar.google.com → Zahnrad → Einstellungen → links
deinen Kalender anklicken → ganz unten *Geheime Adresse im iCal-Format*.

**Apple Kalender:** Rechtsklick auf den Kalender → Freigeben → *Öffentlicher
Kalender* → Adresse kopieren. `webcal://` wird automatisch umgesetzt.

**Schulkalender:** Viele Schulen und Vertretungsplan-Apps bieten einen
ICS-Export an. Der funktioniert genauso – im Wizard kannst du eine zweite
Adresse hinterlegen.

> ⚠️ **Diese Adresse ist wie ein Passwort.** Wer sie hat, sieht alle deine
> Termine – ohne Anmeldung. Nicht weitergeben, nicht committen. Falls sie doch
> mal irgendwo landet: in Google Kalender an derselben Stelle *Zurücksetzen*.

Wiederholungen werden korrekt aufgelöst: Ein wöchentlicher Termin steht in der
Datei nur einmal drin, JARVIS rechnet die Folgetermine aus. Abgesagte
Einzeltermine einer Serie verschwinden, verschobene erscheinen am neuen Datum.

Termine, die nur Platz kosten, kannst du ausblenden – standardmäßig
*Aufstehen*, *Wecker*, *Schlafen*. Änderbar unter `calendar.skip_titles`.

### Notion (To-dos)

1. **Integration anlegen:** [notion.so/my-integrations](https://www.notion.so/my-integrations)
   → *New integration* → Typ *Internal* → das **Internal Integration Secret** kopieren.
2. **Datenbank freigeben:** In Notion deine Aufgaben-Datenbank öffnen →
   oben rechts **···** → *Verbindungen* → deine Integration hinzufügen.
   **Ohne diesen Schritt sieht die Integration nichts** – das ist der Fehler,
   den praktisch jeder beim ersten Mal macht.
3. **Link kopieren:** *Teilen* → *Link kopieren*. Der Wizard zieht sich die ID heraus.

Die Spalten musst du nicht konfigurieren – JARVIS erkennt sie am Schema.
Getestet mit Notions deutscher Aufgaben-Vorlage (`Aufgabenbezeichnung`,
`Status`, `Fällig`) und der englischen (`Name`, `Done`, `Due date`).
Erledigtes wird ausgeblendet, egal ob über *Status* oder eine Checkbox.

### Wie die To-dos zusammengeführt werden

Aufgaben aus Obsidian und Notion landen in **einer** Liste, sortiert nach
Dringlichkeit: überfällig zuerst, dann nach Fälligkeit. Ein Abzeichen zeigt,
woher jede Aufgabe kommt; Notion-Einträge sind anklickbar.

Steht dieselbe Aufgabe in beiden Systemen, erscheint sie **einmal**. JARVIS
erkennt das auch, wenn eine Seite ausführlicher ist – „Mathe Seite 42" und
„Mathe Seite 42 Wahrscheinlichkeitsrechnung" gelten als dieselbe Aufgabe.
Behalten wird der längere Text, ein Fälligkeitsdatum wird von der anderen
Seite übernommen, falls es dort steht.

Unter der Liste steht, wie viele Aufgaben aus welcher Quelle kommen. Klemmt
Notion – Token abgelaufen, Netz weg – erscheint dort der Grund, und die
Obsidian-Aufgaben bleiben trotzdem sichtbar.

### Neue Endpunkte

| Endpunkt | Zweck |
|---|---|
| `/api/calendar?days=14` | anstehende Termine |
| `/api/notion/tasks` | offene Notion-Aufgaben |
| `/api/notion/check` | Verbindung testen, erkannte Spalten anzeigen |

### Wenn etwas nicht geht

| Problem | Lösung |
|---|---|
| „Datenbank nicht gefunden" | Schritt 2 vergessen: Datenbank über ··· → Verbindungen mit der Integration teilen |
| „Notion lehnt das Token ab" | Token neu erzeugen unter notion.so/my-integrations |
| Kalender liefert HTTP 404 | Geheime Adresse wurde zurückgesetzt – neu kopieren |
| „Die Adresse liefert keinen Kalender" | Es muss die iCal-Adresse sein (endet auf `.ics`), nicht der Link zur Web-Ansicht |
| Serientermine fehlen | Prüfen, ob sie unter `calendar.skip_titles` fallen |
| Termine um Stunden verschoben | `identity.timezone` in der `config.json` prüfen |

---

## Auf dem iPad benutzen

Der Python-Teil läuft **nicht** auf dem iPad – iPadOS lässt keine dauerhaften
Hintergrundserver zu. Das Prinzip ist deshalb:

> **Der Mac ist das Gehirn, das iPad ist der Bildschirm.**

Beide müssen im selben WLAN sein.

### Am Mac

```bash
cd jarvis-local
source .venv/bin/activate
python3 server.py --lan
```

Der Server zeigt dir die Adresse, die du am iPad eintippen musst:

```
  Auf dem iPad im selben WLAN oeffnen:
    http://192.168.1.42:8420/
```

### Am iPad

Adresse in Safari eingeben → **SYSTEM STARTEN** tippen.

Danach: Teilen-Symbol → **Zum Home-Bildschirm**. JARVIS bekommt ein eigenes Icon
und startet ohne Safari-Leiste im Vollbild.

### Was auf dem iPad geht – und was nicht

| Funktion | Über WLAN (http) | Anmerkung |
|---|---|---|
| Dashboard, To-dos, Stundenplan, Termine | ✅ | aktualisiert sich jede Minute |
| Audio-Briefing und Antworten (ElevenLabs) | ✅ | |
| Chat per Texteingabe | ✅ | |
| Musik | ⚠️ | iOS verbietet Autoplay mit Ton in eingebetteten Videos. Einmal auf Play tippen |
| Mikrofon-Animation | ❌ | braucht https – ein anderer Browser hilft nicht |
| Spracherkennung | ❌ | braucht https – ein anderer Browser hilft nicht |
| Klatsch-Trigger | ➡️ | läuft am Mac, du klatschst dort |
| Apps starten und anordnen | ➡️ | passiert am Mac, nicht am iPad |
| Bildschirm-Analyse | ⚠️ | analysiert den **Mac**-Bildschirm, nicht den des iPads |

**Warum Mikrofon und Spracherkennung fehlen:** Browser geben beides nur in
einem „sicheren Kontext" frei – also über `https`. `localhost` ist ausgenommen,
eine LAN-Adresse wie `192.168.1.42` nicht. Fürs Ausprobieren reicht die
Texteingabe; JARVIS antwortet trotzdem mit Stimme.

> **Hilft ein anderer Browser? Nein.** Der sichere Kontext ist eine Regel des
> Web-Standards, keine Eigenheit von Safari – Chrome, Firefox und Edge sperren
> das Mikrofon über `http` genauso. Dazu kommt: Auf iPhone und iPad benutzen
> alle Browser dieselbe Engine wie Safari (WebKit); Chrome ist dort im Kern
> Safari mit anderer Oberfläche. Es liegt an der **Adresse**, nicht am Browser.
> Die Lösung ist deshalb `https`, siehe unten.

### Mit https – dann geht auch das Mikrofon

Der bequemste Weg ist [Tailscale](https://tailscale.com) (kostenlos für private Nutzung).
Es verbindet Mac und iPad über ein privates Netz und liefert ein gültiges Zertifikat mit:

```bash
# einmalig auf beiden Geräten installieren und anmelden, dann am Mac:
tailscale serve --bg 8420
tailscale serve status        # zeigt dir die https-Adresse
```

Die angezeigte `https://…​.ts.net`-Adresse am iPad öffnen. Damit funktionieren
Mikrofon und Spracherkennung – und es klappt auch **außerhalb** des heimischen WLAN,
etwa aus der Schule.

### Sicherheit

`--lan` öffnet den Server für **jedes** Gerät im Netz. Wer die Adresse kennt, kann
deine Notizen lesen und Bildschirmfotos deines Macs auslösen.

- Nur im eigenen WLAN benutzen, **nie** im Schul- oder Café-Netz.
- Ohne `--lan` lauscht der Server wie bisher nur lokal.
- Sicherer als `--lan` ist Tailscale: dort erreichen dich nur deine eigenen Geräte.

### Bekannte Einschränkung: Bildschirm-Analyse

„MATHE LÖSEN" fotografiert den Bildschirm des **Macs**. Wenn deine Aufgabe auf dem
iPad liegt – etwa in Goodnotes – sieht JARVIS sie nicht. Bisher gibt es keinen Weg,
ein Foto vom iPad hochzuladen; das wäre ein eigener Endpunkt.

---

## Sicherheit

- `config.json` enthält deine API-Keys, steht in `.gitignore` und bekommt die Rechte `600`.
- Der Server lauscht nur auf `127.0.0.1` – aus dem Netz ist er nicht erreichbar.
- **Committe niemals einen echten Key.** Falls doch passiert: Key beim Anbieter sofort
  widerrufen und neu erzeugen. Ihn nur aus der Datei zu löschen reicht nicht – er bleibt
  in der Git-Historie lesbar.

---

## Der Ordner `server/`

Ein früherer Node-Backend-Entwurf, dessen Routen bis auf die TTS-Weiterleitung noch leer sind.
Er wird aktuell **nicht** verwendet – das Dashboard spricht mit `jarvis-local/server.py`.
Liegt nur noch da, falls du JARVIS später vom iPad aus über einen echten Server nutzen willst.
