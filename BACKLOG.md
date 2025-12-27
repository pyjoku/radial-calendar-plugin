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

### Weitere Ideen
- [ ] Drag & Drop zum Verschieben von Notizen zwischen Tagen
- [ ] Export als Bild (SVG/PNG)
- [ ] Keyboard Navigation
- [ ] Animationen bei View-Wechsel

---

## Known Issues

(Aktuell keine offenen Bugs)

---

## Completed (Recent)

- [x] v1.17.1: Fix calendar source rings not showing (showAsRing undefined)
- [x] v1.17.0: Show as Ring toggle, centered tooltips
- [x] v1.16.0: Google Calendar Sync via iCal URLs
- [x] v1.15.x: Anniversary indicators in day ring, responsive fonts
