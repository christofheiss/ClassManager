# Klassenmanager

Eine Web-App für Lehrpersonen: Klassen verwalten, Anwesenheit erfassen und auswerten, Prüfungen und Bonuspunkte führen, faire Teams bilden und Sitzordnungen planen.

*(früher "Team Generator" — umbenannt, weil die App deutlich mehr kann als Teams zu generieren)*

- **Geräte:** Die App ist für den **Laptop** gedacht, zur Not auch für das **Tablet** (Querformat empfohlen). Eine Bedienung auf dem Smartphone ist nicht vorgesehen.
- **Technik:** Reine Client-App (HTML/CSS/JavaScript), kein Server und kein Konto nötig.
- **Daten:** Alle Daten bleiben im `localStorage` des Browsers, optional zusätzlich in einer lokalen Datei.
- **Offline:** Es werden keine externen Ressourcen geladen (Schriften, Icons und Styles sind gebündelt). Als gehostete Version (https) läuft die App dank Service Worker auch ohne Netz, z.B. in der Turnhalle.

## Übersicht

Die App hat sieben Reiter. Die Leiste bleibt beim Scrollen oben stehen.

| Reiter | Wofür |
|---|---|
| **Klassen** | Klassen, Schüler(innen), Wochenplan, Unterrichtsart, Import/Export |
| **Anwesenheit** | Anwesenheit pro Termin erfassen, Termine importieren |
| **Auswertung** | Anwesenheitsstatistik pro Klasse, nach Semester/Kürzel filtern, CSV-Export |
| **Prüfungen** | Prüfungen/Lernzielkontrollen mit Noten-Auswertung und TXT-Export |
| **Punkte** | Punkte-Tracker für Bonusstunden mit Verlaufs-Graph |
| **Sitzordnung** | Visueller Sitzplan, automatische Zuteilung, speichern, präsentieren |
| **Teams** | Faire Zufallsteams, Klassen direkt laden, präsentieren |

## Funktionen

### Klassen
- Klassen anlegen, umbenennen, löschen; Schüler(innen) einzeln oder per Mehrfach-Import (Text) hinzufügen und wieder entfernen.
- **Wochenplan** pro Klasse (ein oder mehrere Wochentag/Uhrzeit-Termine).
- **Unterrichtsart** pro Klasse: *Sport*, *Klassenzimmer* oder *beides* (Standard). Die Sitzordnung zeigt nur Klassen mit Klassenzimmer-Unterricht.
- Pro Schüler(in): **Geschlecht**, **sportlich** (Läufer-Symbol) und **Hobbys/Sportarten** (Ball-Symbol, z.B. "Fussball, Tennis"). Beides fliesst in die Team-Bildung ein.
- **Klassenkürzel**: Mischt eine Gruppe mehrere Schulklassen (z.B. Sport 7a+7b), lässt sich pro Person ein Kürzel setzen (Feld "Klasse", `Max m [7b]` im Mehrfach-Import, 5. CSV-Spalte oder Tag-Symbol). Auswertung und Prüfungen können danach pro Kürzel getrennt werden.
- Gleiche Vornamen sind nach Rückfrage möglich, am besten mit Initial unterscheiden ("Lena M").
- Entfernte Schüler(innen) mit erfasster Anwesenheit oder Prüfungsergebnissen bleiben als **"ehemalig"** in den Auswertungen sichtbar.

### Import und Export
- Klassen als **JSON** exportieren und importieren (inkl. Wochenplan, Sportlich-Markierung, Hobbys).
- Import auch als **CSV/TXT**: `Klasse;Name;Geschlecht;Sportlich;Kürzel;Hobbys`. Sportlich ist optional (`s`/`ja`/`x`/`1`), Hobbys werden mit `/` getrennt, eine Kopfzeile wird erkannt.
- **Termin-Import:** Vergangene Anwesenheitschecks als CSV (aus Excel: *Speichern unter → CSV*), Format `Datum;Name;Status;Grund;Notiz`. Hilfe über das Fragezeichen im Anwesenheits-Reiter.

### Anwesenheit
- Pro Klasse und Datum ein eigener Termin (beliebig viele). Ein Klick wechselt den Status: **anwesend (grün) → abwesend (rot) → verletzt (orange)**.
- *Verletzt* heisst: anwesend, macht aber nicht mit. Diese Personen zählen als anwesend, werden aber nicht in Teams übernommen.
- Bei Abwesenheit ein **Grund** (Krank, Verletzt, Entschuldigt, Schnuppern, Unentschuldigt, Sonstiges) plus Notiz.
- Hinweis, wenn das Datum nicht zum Wochenplan passt. Termine lassen sich erneut öffnen, bearbeiten und löschen (mit Rückgängig).
- Ungespeicherte Änderungen werden angezeigt; vor Verlust wird gewarnt.

### Auswertung
- Anwesenheit, Abwesenheit, Quote, Anzahl Termine und Aufschlüsselung der Gründe pro Person, mit Durchschnittszeile, sortierbaren Spalten und CSV-Export.
- Filter nach **Semester 1** (Aug–Jan) oder **Semester 2** (Feb–Jul) und nach Klassenkürzel.

### Prüfungen
- Titel und Datum, wahlweise mit **Punkten und Maximum** (Note nach Schweizer Formel `5 × Punkte ÷ Max + 1`, auf Zehntel gerundet) oder mit **direkter Noteneingabe** (1–6).
- Auswertung: Anzahl bewertet, Ø-Note, Minimum, Maximum, Anzahl ungenügend, bei gemischten Gruppen zusätzlich pro Kürzel.
- **TXT-Export** im Format `Name Punkte` bzw. `Name Note`. Bei mehreren Kürzeln entsteht pro Kürzel eine Datei.

### Punkte (Bonusstunden)
- Pro Klasse aktivierbar. Pro Lektion werden erfüllte Ziele abgehakt (frei anpassbar, je **1 oder 2 Punkte**).
- Der Stand wird als **Verlaufs-Graph** gezeigt. *Punkte einlösen* setzt auf 0 zurück, der Verlauf bleibt erhalten.
- *Punkte anpassen* fügt pauschal Punkte hinzu oder zieht sie ab (z.B. Startstand). Der Stand fällt nie unter 0.

### Sitzordnung
- Pro Klasse ein Raster (bis 16 × 12): Tische per Klick **setzen oder entfernen**, oder eine **Vorlage** wählen (Reihen, Gruppentische, U-Form). **"Alle Tische löschen"** beginnt von vorn.
- **Plätze tauschen:** zwei Tische nacheinander anklicken; das Schloss **fixiert** einen Platz.
- **Automatisch erstellen** mit Optionen: Jungen/Mädchen abwechselnd, "Nicht zusammen"-Regeln beachten, nur Anwesende vom letzten Termin. Fixierte Plätze bleiben.
- Der aktuelle Plan wird **automatisch gespeichert**. Zusätzlich lassen sich pro Klasse beliebig viele benannte **Tischanordnungen** (nur Tische) und **Sitzordnungen** (Tische + Personen) ablegen und wieder laden.
- Drucken und **Präsentationsmodus** (siehe unten).

### Teams
- Quellen: anwesende Schüler(innen) aus dem Anwesenheits-Reiter, **direkt gewählte Klassen** (auch mehrere kombiniert) oder manuell hinzugefügte Personen.
- Aufteilung nach **Anzahl Teams** oder **Personen pro Team**; kopieren, drucken, neu mischen.
- **"Wofür sind die Gruppen?"**: *Kein Sport*, *Sport — allgemeines Spiel* (Sportlichkeit fair verteilen) oder eine **konkrete Sportart** (erscheint, sobald Hobbys erfasst sind). Optional werden auch Geschlechter fair verteilt.
- **"Nicht zusammen"-Regeln** halten Paare in verschiedenen Teams.
- Sportlichkeit und Hobbys sind im Teams-Reiter bewusst **nicht sichtbar**, damit sie beim Projizieren nicht auffallen.

### Präsentationsmodus
Bei Sitzordnung und Teams zeigt **"Präsentieren"** das Ergebnis im Vollbild für den Beamer: grosse Namen, keine Sport- oder Geschlechtshinweise. **Esc** oder "Schliessen" beendet.

### Backup und Datendatei
- **Komplett-Backup** (Fusszeile): alle Daten als JSON sichern, **optional mit Passwort verschlüsselt** (AES-GCM), und auf einem anderen Gerät wiederherstellen.
- **Automatische Datendatei** (Chrome/Edge): Eine JSON-Datei auf der Festplatte verbinden, z.B. im Dokumente-Ordner. Danach wird jede Änderung automatisch dorthin geschrieben und beim Start geladen. Weicht die Datei vom Browser-Stand ab, fragt die App, welcher gelten soll. In Safari und Firefox fehlt die Funktion; dort gelten `localStorage` und das manuelle Backup.

## Sicherheit und Datenschutz

- **Keine externen Requests:** Tailwind ist vorkompiliert, Font Awesome und Inter liegen lokal in `vendor/`. Es fliessen keine IP-Adressen an Drittanbieter (relevant für DSG/DSGVO im Schulkontext).
- Namen, Notizen und importierte Daten werden nur als Text ins DOM eingefügt (kein XSS über Schülernamen).
- Importe (Klassen und Backups) werden strikt validiert; ungültige Werte werden verworfen oder normalisiert.
- CSV-Exporte sind gegen Formel-Injection abgesichert.
- Strikte Content-Security-Policy (`default-src 'self'`).
- Keine Daten gehen an einen Server. Der `localStorage` selbst ist **unverschlüsselt**: Auf geteilten Geräten nach Gebrauch die Browserdaten löschen. Backups mit Passwort verschlüsseln, da sie sensible Daten (Abwesenheitsgründe) enthalten.

## Lokal starten

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Alternativ `index.html` direkt im Browser öffnen.

Auf `localhost` wird bewusst **kein Service Worker** registriert (alte Worker und Caches werden entfernt). So zeigt der Browser nach Code-Änderungen sofort die neuen Dateien. Nach Änderungen genügt ein normales Neuladen, bei Bedarf Cmd/Strg+Shift+R.

## Entwicklung

```bash
npm install          # einmalig (nur Tailwind als Dev-Dependency)
npm run build:css    # Tailwind neu kompilieren (nach Änderungen an index.html/app.js/core.js)
npm test             # Unit-Tests (Parser, Validierung, Team-Verteilung, Sitzordnung)
```

Struktur:
- `index.html` / `style.css` — Oberfläche und eigene Styles.
- `core.js` — reine, DOM-freie Logik (Parser, Backup-Validierung, Team-Verteilung, Sitzordnungs-Zuteilung); wird von den Tests direkt geladen.
- `app.js` — UI und Zustand, nutzt `window.TG` aus `core.js`.
- `vendor/` — gebündelte Assets. `vendor/tailwind.css` ist ein Build-Artefakt: nach Klassenänderungen `npm run build:css` ausführen und mit einchecken.
- `sw.js` / `manifest.webmanifest` / `icon.svg` — PWA und Offline-Betrieb.
- `tests/core.test.js` — Unit-Tests (`node:test`).

## Online hosten

Die App besteht nur aus statischen Dateien und lässt sich kostenlos hosten.

**GitHub Pages**
1. Repository auf GitHub pushen.
2. Unter *Settings → Pages* den Branch `main` (Ordner `/root`) wählen.
3. Die App ist unter `https://<username>.github.io/<repo>/` erreichbar.

**Netlify / Vercel**
1. Repository importieren.
2. Kein Build-Schritt nötig (Framework "None"/"Static"), Publish-Verzeichnis `.`
3. Deployen.

Die gehostete Version lässt sich im Browser als App installieren (Manifest + Icon) und läuft nach dem ersten Aufruf offline.

## Datenformat für den Klassen-Import (JSON)

```json
[
  {
    "name": "7a",
    "schedule": [
      { "weekday": 0, "time": "10:00" }
    ],
    "students": [
      { "name": "Anna", "gender": "female", "sporty": true, "hobbies": ["Fussball", "Tennis"] },
      { "name": "Max", "gender": "male", "sporty": false }
    ]
  }
]
```

- `gender`: `female`, `male` oder `diverse`.
- `weekday`: `0` = Montag … `6` = Sonntag. `schedule` ist optional.
