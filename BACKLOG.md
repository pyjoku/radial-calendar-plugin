# Radial Calendar Plugin - Backlog

## Feature Ideas

### Codeblock Source Mode Toggle
- Im gerenderten `radcal` Codeblock fehlt ein Button zum Zurückschalten in den Source-Mode
- Kleiner Toggle/Button (z.B. `</>` Icon) in der Ecke des Codeblocks
- Klick öffnet den Quellcode zur Bearbeitung

### Center Detail View (statt Popup-Menu)
- Bei Klick auf Datum: Center des Kreises wird zur Detailansicht
- Scrollbare Liste der Notizen für das Datum
- Klick auf Notiz öffnet sie
- Optisch integrierter als Context-Menu Popup

### Heatmap Mode für Codeblock
- Neuer YAML-Parameter: `heatmap: true`
- Rendert Tage mit variabler Opazität (10% - 100%) basierend auf Anzahl der Notizen
- Je mehr Notizen/Tags an einem Tag, desto intensiver die Farbe
- Beispiel:
  ```yaml
  heatmap: true
  color: red
  tag: "#project"
  ```
- Ähnlich wie GitHub Contribution Graph, aber radial

### Ring-Beschriftungen am Außenrand
- Labels für jeden Ring am äußeren Rand (wie "ACT 1", "Kalender", etc.)
- Rotiert entlang der Kurve
- Zeigt welcher Ring was darstellt

### Metadata-Boxen an Segment-Grenzen
- Kleine Kästchen zwischen Scenes/Arcs
- Zeigen zusätzliche Metadaten (Zahlen, Prozent, Status)
- Inspiriert von Radial Timeline Plugin

### Filter-Toggles im Zentrum
- Verschiedene Modi zum Filtern nach Properties
- Z/A/H/P Style Buttons
- Schnelles Umschalten zwischen Ansichten

### Detail-Panel bei Hover/Klick
- Seitliches Panel mit ausführlichen Infos zum ausgewählten Element
- Titel, Datum, Beschreibung
- Farbcodierte Tags und Labels
- Verknüpfte Notizen/Charaktere/Orte

### Verbindungslinien zwischen Arcs
- Linien die Beziehungen zwischen Events zeigen
- Storyline-Tracking über das Jahr
- Visualisiert Zusammenhänge

### Weitere Ideen
- [ ] Drag & Drop zum Verschieben von Notizen zwischen Tagen
- [ ] Export als Bild (SVG/PNG)
- [ ] Keyboard Navigation
- [ ] Animationen bei View-Wechsel
- [ ] Detaillierte Arc-Labels mit Metadaten

---

## Known Issues

(Aktuell keine offenen Bugs)

---

## Completed (Recent)

- [x] v1.17.1: Fix calendar source rings not showing (showAsRing undefined)
- [x] v1.17.0: Show as Ring toggle, centered tooltips
- [x] v1.16.0: Google Calendar Sync via iCal URLs
- [x] v1.15.x: Anniversary indicators in day ring, responsive fonts
