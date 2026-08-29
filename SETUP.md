# Jarvis - iPad Training & School Organizer

Eine vollständige PWA-App für dein iPad, die dein Fußball-Offseason-Training, Schulorganisation und Goodnotes-Notizen in einer App vereint.

## 🚀 Quick Start

### Voraussetzungen
- Node.js 18+ und npm
- Ein iPad mit Safari (iPadOS 13+)
- Ein Computer im gleichen WLAN-Netz

### Installation & Start

1. **Klone das Projekt** (falls noch nicht geschehen):
   ```bash
   cd Jarvis-iPad
   ```

2. **Installiere Dependencies**:
   ```bash
   npm install
   ```

3. **Starte den Dev-Server**:
   ```bash
   npm run dev
   ```
   
   Die App läuft dann unter `http://localhost:3000`

4. **Auf dem iPad zugänglich machen**:
   
   a) Finde die IP-Adresse deines Computers:
   - **macOS/Linux**:
     ```bash
     ifconfig | grep "inet " | grep -v 127.0.0.1
     ```
   - **Windows**:
     ```bash
     ipconfig
     ```
     Suche nach "IPv4-Adresse" im WLAN-Adapter
   
   b) Öffne Safari auf dem iPad und navigiere zu:
   ```
   http://[DEINE_IP]:3000
   ```
   
   z.B.: `http://192.168.1.100:3000`

### PWA Installation (Empfohlen!)

1. Öffne die App im iPad-Safari
2. Tippe auf das **Teilen-Symbol** (Pfeil nach oben)
3. Wähle **"Zum Startbildschirm"**
4. Gib dem Symbol einen Namen (z.B. "Jarvis")
5. Tippe **"Hinzufügen"**

Jetzt hast du einen App-ähnlichen Zugriff mit Vollbild-Modus! ✨

## 📱 Features

### 1. **Dashboard (Startbildschirm)**
- Übersicht aller wichtigen Infos
- Quick-Links zu allen Modulen
- Aktuelle Statistiken (Aufgaben, Training, Fortschritt)

### 2. **Trainingsmodul** ⚽
- **Trainingsplan**: Intervallläufe, Krafttraining, Fitnessstudio, Ruhetage
- **Wochenfortschritt**: Prozentualer Abschluss anzeigen
- **Abhak-System**: Trainingseinheiten als erledigt markieren
- **Notizen**: Zusätzliche Infos zu jeder Einheit speichern

### 3. **Schulorganisation** 📚
- **Aufgabenverwaltung**: 
  - Titel, Fach, Fälligkeitsdatum
  - Prioritäten (niedrig/mittel/hoch)
  - Kategorien nach Zeit (heute, zukünftig, erledigt)
- **Stundenplan**: Platzhalter für zukünftige Integration

### 4. **Goodnotes-Integration** 📝
- **URL-Scheme-Links**: Direkte Links zu Goodnotes-Dokumenten
- **Fach-Kategorisierung**: Automatische Sortierung nach Schulfächern
- **Folder & Document Support**: Unterscheidung zwischen Ordnern und Dokumenten

## 🔧 Konfiguration

### Goodnotes-UUIDs ermitteln

1. Öffne ein Dokument in Goodnotes
2. Tippe das **Teilen-Symbol**
3. Wähle **"Link kopieren"**
4. Die URL sieht etwa so aus:
   ```
   goodnotes://open?uuid=12AB34CD-5EF6-7890-GHIJ-KLMNOPQRST
   ```
5. Kopiere diese URL ins Notizen-Modul

### Dark Mode / Light Mode

Nutze den Button in der unteren Navigation um zwischen Dark/Light Mode zu wechseln. 
Die Wahl wird lokal gespeichert.

## 💾 Datenspeicherung

Alle Daten werden **lokal auf deinem iPad** im `localStorage` des Browsers gespeichert:

- Trainingsplan & Fortschritt
- Schulaufgaben & To-Do Liste
- Goodnotes-Links
- Theme-Preference (Dark/Light Mode)

**Hinweis**: Wenn du den Browser-Cache leerst, gehen die Daten verloren. 
Für kritische Daten solltest du regelmäßige Backups machen.

## 🎨 UI/UX Optimierungen für iPad

- **Touch-Targets**: Alle Buttons sind mindestens 44x44px (iOS-Standard)
- **Safe Area Support**: Respektiert die notch/home-indicator des iPad
- **Orientierung**: App unterstützt Portrait-Modus optimal
- **Responsive Grid**: 2-Spalten Layout für bessere Raumausnutzung

## 📦 Build & Deployment

### Lokal bauen:
```bash
npm run build
npm start
```

### Für Production:
Die App kann auf einen beliebigen Server deployed werden:
- Vercel: `vercel deploy`
- Netlify: `netlify deploy`
- Jeder andere statische Host (mit Node.js)

## 🔌 Technologien

- **Framework**: Next.js 14
- **Styling**: Tailwind CSS
- **State Management**: React Hooks + localStorage
- **Icons**: Lucide React
- **PWA**: Manifest.json + Service Worker
- **Offline Support**: Service Worker Caching

## 🐛 Troubleshooting

### App lädt nicht auf dem iPad

1. **Überprüfe die IP-Adresse** - Stelle sicher, dass Computer und iPad im gleichen WLAN sind
2. **Firewall** - Überprüfe, ob Port 3000 in der Firewall freigegeben ist
3. **Dev Server läuft?** - Kontrolliere in Terminal, dass `npm run dev` noch läuft

### Goodnotes-Links funktionieren nicht

1. UUID muss korrekt sein (komplett aus der URL kopieren)
2. Goodnotes muss auf dem iPad installiert sein
3. Format: `goodnotes://open?uuid=DEINE_UUID` (keine zusätzlichen Parameter)

### Daten gehen verloren

1. Verwende nicht "Private Browsing" - dort funktioniert localStorage nicht
2. Leere regelmäßig nicht deinen Browser-Cache
3. Exportiere wichtige Daten (Screenshot oder manuell speichern)

### Service Worker wird nicht installiert

1. App muss über HTTPS oder localhost laufen
2. Öffne DevTools (iPad: Einstellungen → Safari → Erweitert → Web-Inspector)
3. Überprüfe die Console auf Fehler

## 📝 Entwicklung

### Struktur
```
/app              - Next.js App Router Pages
/components       - React Komponenten für jedes Modul
/lib              - Utility-Funktionen (Storage, etc.)
/public           - Statische Assets (Icons, Manifest, Service Worker)
```

### Neue Features hinzufügen

1. Erstelle eine neue Komponente in `/components`
2. Importiere sie in `/app/page.tsx`
3. Füge sie zur Navigation hinzu
4. Nutze `getLocalStorage()` / `setLocalStorage()` für Datenspeicherung

### Stil-Anpassungen

Tailwind CSS ist konfiguriert. Passe Colors/Spacing in `tailwind.config.js` an.

## 📞 Support

Falls Fehler oder Fragen auftreten:
1. Überprüfe die Console (iPad DevTools)
2. Schaue in `.next/` ob Build-Fehler sind
3. Starte `npm install` erneut, um Dependencies zu aktualisieren

## 🎯 Roadmap

- [ ] Kalender-Integration für Schulferien
- [ ] Synchronisation mit Goodnotes Cloud
- [ ] Wecker/Notifications für Trainingszeiten
- [ ] Export von Trainingsstatistiken (PDF)
- [ ] iCloud Sync für Multi-Device Support
- [ ] Integration mit Apple Health für Trainingsmetriken

## 📄 Lizenz

Dieses Projekt ist für deinen persönlichen Gebrauch optimiert. 

---

**Viel Spaß mit deiner neuen Trainings- und Schulorganisations-App!** 🚀⚽
