# JARVIS einrichten

Schritt für Schritt. Plane für den ersten Durchlauf etwa eine Stunde ein –
die meiste Zeit geht für die Konten-Freigaben drauf, nicht für den Code.

Du kannst jederzeit aufhören: **Schritt 1 allein reicht schon**, damit JARVIS
auf dem iPad spricht, das Wetter sagt und den Aufgabenspeicher führt.

---

## Schritt 1 – Oberfläche aufs iPad (5 Minuten)

1. Im GitHub-Repo auf **Settings → Pages** gehen.
2. Unter *Build and deployment* als Quelle **Deploy from a branch** wählen,
   Branch `main` (oder dein Feature-Branch), Ordner `/ (root)`, speichern.
3. Nach ein bis zwei Minuten ist die Seite unter
   `https://<dein-github-name>.github.io/Jarvis-iPad/` erreichbar.
4. Auf dem iPad in **Safari** öffnen (nicht Chrome – die Spracherkennung
   braucht Safari), dann **Teilen → Zum Home-Bildschirm**. Damit läuft JARVIS
   im Vollbild ohne Browserleiste.
5. App starten, auf **AKTIVIEREN** tippen und den Mikrofonzugriff erlauben.
6. Auf ⚙︎ tippen und unter *Heimatort* deine Stadt eintragen – dann stimmt
   das Wetter auch ohne Backend.

Sag jetzt **„Jarvis“**. Er fährt hoch und briefed dich.

> Ohne Backend fehlen: Mails, Kalender, Notion, Spotify-Steuerung, freies Gespräch
> und der Anruf. Dafür geht es weiter mit Schritt 2.

---

## Schritt 2 – Backend starten

Das Backend ist ein einzelner Node-Dienst. Er hält deine Zugangsdaten und
spricht mit den Diensten. Node 20 oder neuer wird gebraucht.

```bash
cd server
cp .env.example .env
npm install
npm start
```

Der Dienst läuft dann auf `http://localhost:8787`. Öffne die Adresse im Browser –
dort steht, welche Systeme schon konfiguriert sind.

### Damit das iPad ihn erreicht

Zum Ausprobieren im gleichen WLAN genügt die lokale IP deines Rechners
(`PUBLIC_URL=http://192.168.x.x:8787`).

Für den Dauerbetrieb brauchst du eine feste Adresse. Bewährt haben sich Hoster
wie Render, Railway oder Fly.io – überall gilt dasselbe Muster:

- Repository verbinden, **Root Directory** auf `server` setzen
- Build: `npm install`, Start: `npm start`
- Alle Werte aus deiner `.env` als *Environment Variables* eintragen
- `PUBLIC_URL` auf die vom Hoster vergebene Adresse setzen
- Ein persistentes Volume auf `server/data` legen, sonst musst du nach jedem
  Neustart Google und Spotify neu verbinden

### Pflichtwerte in der `.env`

```
PUBLIC_URL=https://deine-backend-adresse
JARVIS_TOKEN=<langes Zufallspasswort>
ALLOWED_ORIGINS=https://<dein-github-name>.github.io
ANTHROPIC_API_KEY=sk-ant-...
```

Den Anthropic-Schlüssel bekommst du unter <https://console.anthropic.com> → *API Keys*.

### Im iPad verbinden

⚙︎ → *Backend-Adresse* und *Zugriffsschlüssel* (= `JARVIS_TOKEN`) eintragen → **SPEICHERN**.
Der Punkt **CORE** in der Kopfzeile wird grün.

---

## Schritt 3 – Gmail und Kalender

1. <https://console.cloud.google.com> → Projekt anlegen.
2. **APIs & Dienste → Bibliothek**: *Gmail API* und *Google Calendar API* aktivieren.
3. **OAuth-Zustimmungsbildschirm**: Nutzertyp *Extern*, App-Name eintragen.
   Unter *Testnutzer* deine eigene Gmail-Adresse hinzufügen – solange die App
   im Test-Modus ist, darf nur sie zugreifen. Das genügt für den Eigenbedarf.
4. **Anmeldedaten → OAuth-Client-ID → Webanwendung**.
   Autorisierte Weiterleitungs-URI:
   `https://deine-backend-adresse/auth/google/callback`
5. Client-ID und Secret in die `.env` eintragen, Backend neu starten.
6. Im iPad ⚙︎ öffnen – dort erscheint jetzt **→ Google verbinden**. Antippen,
   einmal durch die Google-Freigabe klicken, fertig.

Verwendete Berechtigungen: Gmail nur lesen, Kalender lesen und Termine anlegen.
JARVIS kann keine Mails verschicken oder löschen.

---

## Schritt 4 – Spotify

1. <https://developer.spotify.com/dashboard> → **Create app**.
2. Redirect URI: `https://deine-backend-adresse/auth/spotify/callback`
3. Client-ID und Secret in die `.env`, Backend neu starten.
4. Im iPad ⚙︎ → **→ Spotify verbinden**.

**Wichtig:** Das Fernsteuern der Wiedergabe erlaubt Spotify nur mit **Premium**
und nur, wenn gerade ein Gerät aktiv ist. Praktisch heißt das: Spotify auf dem
iPad einmal öffnen und kurz etwas abspielen, dann kennt Spotify das Gerät.

Klappt es nicht, ist das kein Fehler – JARVIS zeigt dann einen Knopf
**▶ BACK IN BLACK STARTEN**, der den Song mit einem Tipp direkt öffnet.
(Bei einem selbst gewählten Boot-Song führt der Knopf auf die Spotify-Suche,
weil JARVIS den Titel dann nicht vorab kennt.)

> **Nicht verwechseln:** Ein Spotify-Konnektor in Claude ist etwas anderes.
> Der gehört zum Chat und kann nur suchen, Playlists anlegen und sagen, was
> gerade läuft – er kann keine Wiedergabe starten. Damit JARVIS Musik abspielt,
> braucht es die Verbindung hier über `/auth/spotify`.

Anderen Boot-Song willst du? ⚙︎ → *Boot-Song* ändern.

### Wenn dein Spotify-Konto ein anderes ist als dein Google-Konto

Das ist völlig in Ordnung – die Konten haben nichts miteinander zu tun.
Wichtig sind nur zwei Dinge:

1. **Das Konto, mit dem du dich bei der Freigabe anmeldest, ist das Konto,
   dessen Musik JARVIS steuert.** Melde dich also mit genau dem Spotify-Konto
   an, auf dem du Musik hörst – nicht zwingend mit dem, unter dem du die
   Entwickler-App angelegt hast.
2. **Die Entwickler-App steht im Entwicklungsmodus.** Dort darf nur zugreifen,
   wer im Dashboard eingetragen ist. Sind App-Konto und Hör-Konto verschieden,
   musst du das Hör-Konto freischalten: Dashboard → deine App →
   **Settings → User Management** → Name und E-Mail-Adresse des Spotify-Kontos
   eintragen. Ohne diesen Eintrag bricht die Freigabe mit einem Fehler ab.

### Spotify-Konto wechseln

`https://deine-backend-adresse/auth/spotify` erneut aufrufen – die Freigabe
erscheint immer mit Auswahldialog, dort gibt es **„Als anderer Nutzer anmelden“**.

Bleibt Spotify stur beim alten Konto, hängt die Browser-Sitzung: erst
<https://accounts.spotify.com/logout> aufrufen (oder ein privates Fenster
nehmen), dann die Freigabe neu starten.

Gespeicherte Verbindung ganz verwerfen:
`https://deine-backend-adresse/auth/spotify/disconnect`

Für Google gilt dasselbe unter `/auth/google` bzw. `/auth/google/disconnect` –
dort erscheint die Kontoauswahl von sich aus. Beide Links findest du auch auf
der Statusseite deines Backends (einfach die Backend-Adresse im Browser öffnen).

---

## Schritt 5 – Notion

1. <https://www.notion.so/my-integrations> → **New integration** (intern),
   Token kopieren → `NOTION_TOKEN`.
2. Deine Aufgaben-Datenbank in Notion öffnen → **···** → *Verbindungen* →
   deine Integration hinzufügen. Ohne diesen Schritt sieht die Integration nichts.
3. Datenbank-ID aus der URL kopieren (die 32 Zeichen vor dem `?`) → `NOTION_TASKS_DB`.
4. Eine Seite anlegen, unter der die Pläne entstehen sollen, ebenfalls freigeben,
   ID kopieren → `NOTION_PLAN_PARENT`.

Die Spalten der Aufgaben-Datenbank darfst du nennen, wie du willst – JARVIS sucht
sie über ihren Typ (Titel, Status oder Checkbox, Datum).

Danach funktionieren „Plane meinen Tag“ und „Plane meine Woche“: JARVIS zieht
Aufgaben, Termine und wichtige Mails zusammen und legt eine neue Notion-Seite an.

---

## Schritt 6 – Der Anruf aufs iPhone

Ja, das geht. Ein Browser kann von sich aus kein Telefon klingeln lassen,
also übernimmt das ein Telefonie-Anbieter. JARVIS ruft dich an und liest die
Nachricht vor.

### Variante A – echter Anruf über Twilio

1. Konto bei <https://www.twilio.com> anlegen.
2. Im Test-Modus deine eigene Handynummer unter *Verified Caller IDs* bestätigen.
3. Eine Telefonnummer kaufen (etwa 1 € im Monat) → das wird `TWILIO_FROM`.
4. In die `.env`:
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_FROM=+43...
   TWILIO_TO=+43...        # deine iPhone-Nummer
   ```
5. Testen:
   ```bash
   curl -X POST https://deine-backend-adresse/api/notify/call \
     -H "content-type: application/json" \
     -H "x-jarvis-token: DEIN_TOKEN" \
     -d '{"message":"Test. Hier spricht Jarvis."}'
   ```

Ein Anruf kostet wenige Cent.

### Variante B – Push statt Anruf (kostenlos)

Setze `PUSH_WEBHOOK_URL` auf einen Webhook, der `{title, message, priority}`
als JSON annimmt. Mit <https://ntfy.sh> reicht ein selbst gewählter Themenname
plus die ntfy-App auf dem iPhone. Alternativ nimmst du einen iOS-Kurzbefehl mit
*Automation → Wenn ich eine Anfrage erhalte*.

Ist beides gesetzt, versucht JARVIS zuerst den Anruf und fällt auf Push zurück.

### Automatisch anrufen bei dringenden Mails

```
MAIL_WATCH_ENABLED=true
MAIL_WATCH_INTERVAL=10        # Minuten
MAIL_CALL_THRESHOLD=5         # 1-5, 5 = nur wirklich dringend
MAIL_QUIET_HOURS=22:00-07:00  # in dieser Zeit kein Anruf
```

Der Wächter holt alle zehn Minuten neue Mails, lässt Claude sie von 1 bis 5
bewerten und ruft nur bei Stufe 5 an. Jede Mail wird höchstens einmal gemeldet.

Einmal von Hand prüfen:
```bash
curl -X POST https://deine-backend-adresse/api/watcher/run -H "x-jarvis-token: DEIN_TOKEN"
```

Fang mit `MAIL_CALL_THRESHOLD=5` an. Wenn dich JARVIS zu selten anruft, geh auf 4.

---

## Wenn etwas nicht geht

| Symptom | Ursache und Abhilfe |
|---|---|
| Weckwort reagiert nicht | Nur Safari kann das. Einmal auf **AKTIVIEREN** tippen und Mikrofon erlauben. Der Punkt STIMME muss grün sein. |
| JARVIS spricht nicht | iPad-Stummschalter prüfen. Sprachausgabe braucht die erste Tipp-Geste – dafür ist der Startbildschirm da. |
| CORE-Punkt orange | Backend nicht erreichbar oder Schlüssel falsch. Backend-Adresse ohne Schrägstrich am Ende eintragen. |
| 401 im Log | `JARVIS_TOKEN` und der Zugriffsschlüssel im iPad stimmen nicht überein. |
| Musik startet nicht | Kein Premium oder kein aktives Gerät. Spotify kurz öffnen und etwas abspielen, dann Neustart. |
| Mails bleiben leer | Google verbunden? Im Backend-Status nachsehen. Im Test-Modus muss deine Adresse als Testnutzer eingetragen sein. |
| Falsches Spotify-Konto verbunden | `/auth/spotify` erneut aufrufen und „Als anderer Nutzer anmelden“ wählen. Hilft das nicht: bei Spotify im Browser abmelden, dann `/auth/spotify/disconnect` und neu verbinden. |
| Fehler bei der Spotify-Freigabe | Die App steht im Entwicklungsmodus. Das Hör-Konto unter *Settings → User Management* im Spotify-Dashboard eintragen. |
| Weckwort schläft ein | iOS pausiert die Erkennung bei gesperrtem Bildschirm. Unter *Einstellungen → Anzeige → Automatische Sperre* auf *Nie* stellen, wenn JARVIS dauerhaft lauschen soll. |
