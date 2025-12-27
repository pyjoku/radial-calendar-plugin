# Release Skill

Erstellt ein neues Release für das Radial Calendar Plugin.

## Verwendung

```
/release [patch|minor|major] "Kurze Beschreibung"
```

Beispiele:
- `/release patch "Fix tooltip positioning"`
- `/release minor "Add sidebar view"`
- `/release major "Complete redesign"`

## Schritte

1. **Build** das Plugin
2. **Version bump** basierend auf Argument (patch/minor/major)
3. **Commit** alle Änderungen
4. **Tag** erstellen
5. **Push** zu GitHub
6. **Release** mit main.js, manifest.json, styles.css erstellen

## Anweisungen für Claude

Wenn dieser Skill aufgerufen wird:

1. Führe `npm run build` aus
2. Lese aktuelle Version aus package.json
3. Berechne neue Version:
   - patch: 1.4.0 → 1.4.1
   - minor: 1.4.0 → 1.5.0
   - major: 1.4.0 → 2.0.0
4. Aktualisiere Version in package.json UND manifest.json
5. Führe `npm run build` erneut aus (mit neuer Version)
6. Führe aus:
   ```bash
   git add -A
   git commit -m "release: vX.X.X - BESCHREIBUNG"
   git tag -a vX.X.X -m "BESCHREIBUNG"
   git push origin main --tags
   gh release create vX.X.X main.js manifest.json styles.css --title "vX.X.X - BESCHREIBUNG" --notes "BESCHREIBUNG"
   ```
7. Gib die Release-URL zurück
