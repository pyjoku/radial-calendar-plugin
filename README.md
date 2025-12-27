# Radial Calendar Plugin for Obsidian

A beautiful circular/radial calendar visualization for [Obsidian](https://obsidian.md). View your entire year or life as an interactive circular timeline.

![Radial Calendar Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple)
![Version](https://img.shields.io/github/v/release/pyjoku/radial-calendar-plugin)
![License](https://img.shields.io/github/license/pyjoku/radial-calendar-plugin)

## Features

- **Radial Year View** - See all 365 days arranged in a beautiful circle
- **Life View** - Visualize your entire lifespan with nested rings
- **Life Phases** - Display life phases (education, jobs, relationships) as colored arcs
- **Category Grouping** - Group life phases into separate rings by category
- **Daily Notes Integration** - Click any day to open or create daily notes
- **Note Indicators** - See which days have notes at a glance
- **Birthday Marker** - Mark your birthday on the year ring
- **Multiple Rings** - Configure multiple folder-based rings
- **Customizable Segments** - Show quarters, seasons, weeks, or custom segments
- **Local Calendar Sidebar** - Compact calendar view in the sidebar
- **Dark/Light Theme Support** - Adapts to your Obsidian theme

## Installation

### Using BRAT (Recommended for Beta)

This plugin is currently in beta. Use the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) to install:

1. Install the BRAT plugin from Obsidian Community Plugins
2. Open BRAT settings
3. Click "Add Beta Plugin"
4. Enter: `pyjoku/radial-calendar-plugin`
5. Click "Add Plugin"
6. Enable "Radial Calendar" in Settings → Community Plugins

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/pyjoku/radial-calendar-plugin/releases)
2. Create a folder `radial-calendar-plugin` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into this folder
4. Enable the plugin in Obsidian Settings → Community Plugins

## Views

### Annual View

The default view showing a single year as a radial calendar:

- **Outer ring**: Days of the year (365/366 segments)
- **Center**: Current year display
- **Month separators**: Lines dividing the 12 months
- **Today marker**: Red line indicating the current day
- **Note indicators**: Highlighted days with existing notes

**Navigation:**
- Click `←` / `→` to navigate between years
- Click `Today` to jump to the current year
- Click any day to open/create a daily note
- Right-click for context menu with note options

### Life View

A nested clock visualization of your entire life:

- **Outer ring**: Years from birth to expected lifespan
- **Middle ring**: Life phases (configurable)
- **Inner ring**: Current year with months
- **Center**: Displays selected year and age

**Navigation:**
- Click any year in the outer ring to navigate to that year
- Hover over years to see age information
- Click life phases to open the corresponding note

## Configuration

### Basic Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Daily Note Folder | Folder for daily notes | `Daily` |
| Daily Note Format | Date format for filenames | `YYYY-MM-DD` |
| Birth Year | Your birth year (for Life View) | `1990` |
| Birth Date | Precise birth date (YYYY-MM-DD) | - |
| Expected Lifespan | Expected lifespan in years | `85` |
| Life Phases Folder | Folder containing life phase notes | - |

### Birth Date

For precise positioning on the life ring, you can enter your full birth date:

```
1977-08-27
```

This enables:
- Accurate phase angle calculations (day-precise instead of year-based)
- Birthday marker on the year ring with a cake icon

### Ring Configuration

Configure multiple rings, each showing notes from a specific folder:

```
Ring 1: Daily Notes    → Folder: Calendar/Daily
Ring 2: Work Projects  → Folder: Work/Projects
Ring 3: Personal       → Folder: Personal/Journal
```

Each ring can have:
- Custom name
- Folder filter
- Color (18 colors available)
- Order (0 = outermost)
- Spanning Arcs mode (for multi-day events)

### Spanning Arcs (Multi-Day Events)

Enable "Spanning Arcs" mode for a ring to display multi-day events as continuous arcs instead of individual day segments.

**Setup:**
1. Create a ring with a folder (e.g., `Projects`)
2. Enable "Spanning Arcs" in the ring settings
3. Configure the YAML property names (or use defaults)

**Default properties:**
- `radcal-start` - Start date (YYYY-MM-DD)
- `radcal-end` - End date (YYYY-MM-DD)
- `radcal-color` - Color name (optional)
- `radcal-label` - Display label (optional, defaults to filename)

**Example: Project Note**

```yaml
---
radcal-start: 2025-03-01
radcal-end: 2025-06-15
radcal-color: blue
radcal-label: Website Redesign
---

# Website Redesign Project

Project details...
```

**Example: Vacation**

```yaml
---
radcal-start: 2025-07-10
radcal-end: 2025-07-24
radcal-color: teal
radcal-label: Summer Vacation
---
```

Overlapping events are automatically placed in separate tracks within the ring.

### Outer Segments

Display markers around the outer edge of the calendar:

| Type | Description |
|------|-------------|
| None | No segments |
| Quarters | Q1, Q2, Q3, Q4 |
| Seasons | Spring, Summer, Fall, Winter |
| Semesters | 1st/2nd Semester |
| Weeks | Week numbers 1-52 |
| 10-Day Phases | 36 phases of ~10 days each |
| Custom | Define your own segments |

## Life Phases

Life phases are notes in a designated folder with YAML frontmatter defining their time span and appearance.

### Folder Setup

1. Create a folder for life phases (e.g., `Life/Phases`)
2. Set this folder in Settings → Life Phases Folder
3. Create notes with the required frontmatter

### Frontmatter Fields

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `phase-start` | Yes | Start date (YYYY-MM-DD) | `1983-09-01` |
| `phase-end` | No | End date (leave empty for ongoing) | `1987-07-15` |
| `phase-color` | No | Color name | `blue` |
| `phase-label` | No | Display label (defaults to filename) | `Elementary School` |
| `phase-category` | No | Category for grouping | `Education` |

### Available Colors

```
red, orange, yellow, green, blue, purple, pink,
teal, cyan, magenta, lime, amber, indigo, violet, rose,
gray, slate, stone
```

### Example: Education Phases

**Life/Phases/Elementary School.md**
```yaml
---
phase-start: 1983-09-01
phase-end: 1987-07-15
phase-color: blue
phase-label: Elementary School
phase-category: Education
---

Notes about elementary school...
```

**Life/Phases/High School.md**
```yaml
---
phase-start: 1987-09-01
phase-end: 1996-06-30
phase-color: green
phase-label: High School
phase-category: Education
---

Notes about high school...
```

**Life/Phases/University.md**
```yaml
---
phase-start: 1996-10-01
phase-end: 2002-03-15
phase-color: purple
phase-label: University
phase-category: Education
---

Notes about university...
```

### Example: Locations

**Life/Phases/Stuttgart.md**
```yaml
---
phase-start: 1977-08-27
phase-end: 1989-05-31
phase-color: teal
phase-label: Stuttgart
phase-category: Locations
---
```

**Life/Phases/Munich.md**
```yaml
---
phase-start: 1989-06-01
phase-end: 2005-12-31
phase-color: orange
phase-label: Munich
phase-category: Locations
---
```

**Life/Phases/Berlin.md**
```yaml
---
phase-start: 2006-01-01
phase-color: pink
phase-label: Berlin
phase-category: Locations
---

(No end date = ongoing, shown with gradient fade)
```

### Category Grouping

When you use `phase-category`, phases are automatically grouped:

```
┌─────────────────────────────────────────────┐
│  Life Years Ring (outer)                    │
│  ┌─────────────────────────────────────┐    │
│  │  Education Ring (category band)     │    │
│  │  → Elementary, High School, Uni     │    │
│  ├─────────────────────────────────────┤    │
│  │  Locations Ring (category band)     │    │
│  │  → Stuttgart, Munich, Berlin        │    │
│  ├─────────────────────────────────────┤    │
│  │  Uncategorized (if any)             │    │
│  └─────────────────────────────────────┘    │
│  Year Ring (inner)                          │
└─────────────────────────────────────────────┘
```

### Ongoing Phases (No End Date)

Phases without an end date are treated as "ongoing":

- Displayed with full color from start to today
- Gradient fade from today to expected lifespan end
- Marked as "Active (ongoing)" in tooltip

## Local Calendar (Sidebar)

A compact radial calendar that fits in the sidebar:

1. Open Command Palette (`Ctrl/Cmd + P`)
2. Search for "Radial Calendar: Open Local Calendar"
3. The calendar opens in the right sidebar

Features:
- Compact view of current year
- Day indicators for notes
- Click to navigate to daily notes

## Daily Notes Integration

The plugin integrates with your daily notes:

### Configuration

```
Folder: Calendar/2025/Daily
Format: YYYY-MM-DD
```

This creates notes like `Calendar/2025/Daily/2025-01-15.md`

### Supported Date Formats

| Format | Example |
|--------|---------|
| `YYYY-MM-DD` | 2025-01-15 |
| `YYYY/MM/DD` | 2025/01/15 |
| `DD-MM-YYYY` | 15-01-2025 |
| `MM-DD-YYYY` | 01-15-2025 |

### Date Properties

The plugin reads dates from:

1. **Filename** - Parsed according to your format setting
2. **Frontmatter** - Custom date properties

Configure which frontmatter properties to check in Settings → Date Properties.

## Commands

| Command | Description |
|---------|-------------|
| Open Radial Calendar | Opens the main radial calendar view |
| Open Local Calendar | Opens the compact sidebar calendar |

## Keyboard Shortcuts

You can assign keyboard shortcuts to the commands in Obsidian Settings → Hotkeys.

## Styling

The plugin uses CSS variables from your Obsidian theme. For custom styling, add CSS snippets:

```css
/* Example: Change today marker color */
.rc-today-marker {
  stroke: #ff6b6b;
  stroke-width: 3;
}

/* Example: Customize life phase labels */
.rc-phase-label {
  font-size: 10px;
  font-weight: 600;
}

/* Example: Adjust tooltip appearance */
.rc-tooltip {
  background: var(--background-secondary);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}
```

## FAQ

### Q: Why don't I see any notes on the calendar?

A: Check that:
1. Your daily note folder is correctly configured
2. Your date format matches your filenames
3. Notes have valid dates (in filename or frontmatter)

### Q: How do I show notes from multiple folders?

A: Use the Ring Configuration in settings to add multiple rings, each pointing to a different folder.

### Q: Can I use this with the Daily Notes core plugin?

A: Yes! Configure the same folder and date format as your Daily Notes settings.

### Q: The life phases aren't showing up?

A: Ensure:
1. Life Phases Folder is set correctly in settings
2. Notes have valid `phase-start` dates in YAML frontmatter
3. Date format is `YYYY-MM-DD`

### Q: How do overlapping phases work?

A: Within each category, overlapping phases are automatically placed in separate sub-rings (tracks) so they don't overlap visually.

## Support

- **Issues**: [GitHub Issues](https://github.com/pyjoku/radial-calendar-plugin/issues)
- **Discussions**: [GitHub Discussions](https://github.com/pyjoku/radial-calendar-plugin/discussions)

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with care for the Obsidian community.
