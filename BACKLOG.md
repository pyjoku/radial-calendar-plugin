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

### Curved Text am Kreisrand (In-Place Anzeige)
- Bei Klick auf Element: Text erscheint am Kreisrand entlang
- Folgt der Krümmung des Rings
- Alternative zu Popup/Tooltip - direkt im Kalender integriert
- Inspiriert von Radial Timeline Plugin

### Verbindungslinien zwischen Arcs
- Linien die Beziehungen zwischen Events zeigen
- Storyline-Tracking über das Jahr
- Visualisiert Zusammenhänge

### Radial Calendar als Bases View (Obsidian 1.10+)
- Nutzt `plugin.registerBasesView()` API
- Radial Calendar als zusätzlicher View-Type in Bases
- Doku: https://docs.obsidian.md/plugins/guides/bases-view
- Beispiel: https://github.com/obsidianmd/obsidian-maps

**Use-Case:** Einzeldateien nach Properties filtern (Geburtstage, Deadlines)
- Bases übernimmt: Filter, Query Engine, Properties, Filter-UI
- Wir liefern: Radial Renderer

**Abgrenzung zum Standalone-Plugin:**
| Bases View | Standalone |
|------------|------------|
| Einzeldateien | Spanning Arcs |
| Bases Filter-UI | Eigener Filter-Parser |
| Properties | Multi-Day Events |
| - | Google Calendar Sync |
| - | radcal Codeblock |
| - | Life View |

**Zwei Systeme koexistieren** - Nutzer können wählen.

### Visueller Filter-Builder (wie Bases)
- Modal/Popover mit Filter-Optionen
- Dropdown für Funktion (inFolder, hasTag, nameContains, etc.)
- Input-Feld für Werte
- AND/OR Logik-Buttons zum Kombinieren
- Generiert YAML automatisch in den Codeblock
- Inspiriert von Obsidian Bases Filter-Picker
- **Alternative:** Bases View nutzen (siehe oben)

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

- [x] v1.17.17: Strikte Filter-Validierung (unbekannte Funktionen → Fehler)
- [x] v1.17.16: Bases-kompatibles `filters` alias
- [x] v1.17.15: Array-Syntax für Filter (implizites AND)
- [x] v1.17.14: Cross-year arc gap fix
- [x] v1.17.13: Erweiterte Filter (name, nameContains, tagContains, property), Cross-year Indikatoren verbessert
- [x] v1.17.10: Codeblock Source Toggle Button
- [x] v1.17.9: Year boundary marker, cross-year arc indicators
- [x] v1.17.8: Ring separators (visible lines between rings)
- [x] v1.17.6-7: Dynamic arc/daily allocation, 1px ring gap
- [x] v1.17.3-5: Combined daily notes + spanning arcs view
- [x] v1.17.2: Spanning arcs toggle for calendar sources
- [x] v1.17.1: Fix calendar source rings not showing
- [x] v1.17.0: Show as Ring toggle, centered tooltips
- [x] v1.16.0: Google Calendar Sync via iCal URLs
