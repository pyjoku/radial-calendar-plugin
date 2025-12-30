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
- **Spanning Arcs** - Display multi-day events as continuous arcs
- **Google Calendar Sync** - Import events from iCal URLs
- **Radcal Codeblock** - Embed filtered calendars in notes (Dataview-like)
- **Time Block Views** - Day/Week/Month radial clocks with time blocks
- **Memento Mori View** - Multi-ring life visualization (hour/day/week/month/year/life)
- **Periodic Notes Integration** - Load time blocks from Periodic Notes
- **Advanced Filters** - Filter by tag, folder, filename, property, or links
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

## Radcal Codeblock

Embed filtered radial calendars directly in your notes using the `radcal` codeblock - similar to Dataview or Bases.

### Basic Usage

````markdown
```radcal
year: 2024
```
````

This renders an interactive radial calendar for 2024 directly in your note.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `year` | number | current year | Year to display |
| `style` | string | `annual` | `annual` or `life` |
| `filter` | string/yaml | - | Bases-compatible filter expression |
| `dateProperty` | string | - | Frontmatter property to use as date source |
| `folder` | string | - | Filter by folder (legacy, use `filter` instead) |
| `folders` | list | - | Filter by multiple folders (legacy) |
| `rings` | list | - | Multiple ring configuration |
| `showLabels` | boolean | `true` | Show month labels |
| `showToday` | boolean | `true` | Show today marker |
| `showAnniversaries` | boolean | `false` | Show anniversary ring |
| `segments` | string | `none` | `none`, `seasons`, `quarters`, `weeks` |
| `birthYear` | number | - | For life view |
| `lifespan` | number | - | For life view |

### Filter Syntax (Bases-compatible)

The filter syntax is compatible with Obsidian Bases:

#### Available Filter Functions

| Function | Description | Example |
|----------|-------------|---------|
| `file.hasTag("tag")` | Exact tag or nested tags | `file.hasTag("project")` matches `#project`, `#project/work` |
| `file.tagContains("text")` | Tag contains text (wildcard) | `file.tagContains("lyt")` matches `#lyt`, `#lyt12`, `#catalytisch` |
| `file.inFolder("folder")` | In folder or subfolder | `file.inFolder("Work")` matches `Work/`, `Work/Projects/` |
| `file.hasLink("note")` | Links to a note | `file.hasLink("MOC Dashboard")` |
| `file.name("text")` | Exact filename match | `file.name("Project A")` matches only `Project A.md` |
| `file.nameContains("text")` | Filename contains text | `file.nameContains("lyt")` matches `LYT12.md`, `catalytisch.md` |
| `file.property("key", "value")` | Property equals value | `file.property("status", "active")` |
| `file.hasProperty("key")` | Property exists | `file.hasProperty("due-date")` |

#### Examples

**By Tag:**
````markdown
```radcal
filter: file.hasTag("project")
```
````

**By Folder:**
````markdown
```radcal
filter: file.inFolder("Work/Projects")
```
````

**By Filename (wildcard):**
````markdown
```radcal
filter: file.nameContains("LYT")
```
````

**By Property:**
````markdown
```radcal
filter: file.property("status", "active")
```
````

**Combined with AND/OR:**
````markdown
```radcal
filter: file.hasTag("korea") && file.inFolder("trips")
```
````

````markdown
```radcal
filter: file.hasTag("work") || file.hasTag("project")
```
````

**Negation:**
````markdown
```radcal
filter: !file.hasTag("archived")
```
````

**YAML Filter Structure (for complex logic):**
````markdown
```radcal
filter:
  and:
    - file.inFolder("Projects")
    - file.hasTag("active")
  not:
    - file.hasTag("archived")
```
````

**Note:** All string comparisons are case-insensitive.

### Date Property

Use `dateProperty` to position entries by a specific frontmatter property instead of the file's default date:

````markdown
```radcal
filter: file.hasTag("person")
dateProperty: Birthday
```
````

This displays all notes tagged `#person` positioned by their `Birthday` frontmatter field.

**Use cases:**
- Birthday calendars from contact notes
- Project deadlines
- Publication dates
- Any custom date field

### Multiple Rings

Display different folders as separate colored rings:

````markdown
```radcal
rings:
  - folder: "Work"
    color: blue
  - folder: "Personal"
    color: green
  - folder: "Health"
    color: red
```
````

**Available colors:** `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `teal`, `cyan`, `magenta`, `lime`, `amber`, `indigo`, `violet`, `rose`, `gray`, `slate`, `stone`

### Examples

**Simple Year View:**
````markdown
```radcal
year: 2024
showLabels: true
showToday: true
```
````

**Project Calendar:**
````markdown
```radcal
filter: file.inFolder("Projects") && file.hasTag("active")
segments: quarters
```
````

**Birthday Calendar:**
````markdown
```radcal
filter: file.hasTag("person")
dateProperty: Birthday
showToday: false
```
````

**Multi-Ring Overview:**
````markdown
```radcal
rings:
  - folder: "Daily"
    color: blue
  - folder: "Events"
    color: green
  - folder: "Projects"
    color: purple
segments: seasons
```
````

**Life View:**
````markdown
```radcal
style: life
birthYear: 1985
lifespan: 85
```
````

### Interactivity

- **Click** on a day with entries to open the note
- **Hover** over days to see tooltips with entry names
- **Live updates** - calendar refreshes automatically when notes change

---

## Time Block Views

Visualize your schedule as radial clocks using the unified `radcal` codeblock with `type:` parameter.

### Daily View (24-Hour Clock)

````markdown
```radcal
type: day
09:00-10:00 blue: Morning Meeting
14:00-16:00 green: Project Work
18:00-19:00 orange: Exercise
```
````

Renders a 24-hour clock with your time blocks as colored arcs.

### Weekly View (7-Day Ring)

````markdown
```radcal
type: week
Mo 09:00-17:00 blue: Work
Mi 14:00-15:00 green: Team Meeting
Sa 10:00-12:00 orange: Sport
```
````

Displays a 7-day ring (Monday at top) with time blocks mapped within each day segment.

**Supported day names:** `Mon/Mo`, `Tue/Di`, `Wed/Mi`, `Thu/Do`, `Fri/Fr`, `Sat/Sa`, `Sun/So`

### Monthly View (31-Day Ring)

````markdown
```radcal
type: month
15 red: Dentist
20-22 blue: Conference
25 green: Christmas
```
````

Shows a monthly ring with day markers. Ranges like `20-22` create multi-day arcs.

### Multi-Ring View

Combine multiple types in a single codeblock for concentric rings:

````markdown
```radcal
type: day
09:00-10:00 blue: Meeting

type: week
Mo 09:00-17:00 blue: Work
Fr 14:00-16:00 green: Review

type: month
15 red: Deadline
20-22 purple: Vacation
```
````

This renders three concentric rings (month → week → day from outside to inside).

### Syntax

The syntax uses `color: label` format (no pipe symbol needed):

```
TIME color: Label
```

**Examples:**
- `09:00-10:00 blue: Meeting` - Day block
- `Mo 09:00-12:00 green: Work` - Week block
- `15 red: Appointment` - Month block (single day)
- `15-17 purple: Conference` - Month block (range)

**Available colors:** `blue`, `green`, `red`, `orange`, `purple`, `yellow`, `cyan`, `pink`, `teal`, `lime`, `amber`, `indigo`

---

## Memento Mori View

A philosophical multi-ring visualization of time at different scales - from hours to your entire life.

### Opening the View

1. Command Palette → "Open Memento Mori View"
2. Or click the skull icon in the ribbon

### Configurable Rings

Each ring represents a different time scale:

| Ring | Description |
|------|-------------|
| Hour | Current hour progress (60 minutes) |
| Day | 24-hour ring with current time |
| Custom Short | Configurable 1-30 days (default: 7 days = week) |
| Month | Current month (28-31 days) |
| Season | Current quarter (90 days) |
| Year | Full year (365 days) |
| Life | From birth to expected lifespan |

### Configuration

In Settings → Memento Mori:

- **Birth Date** - Your birth date for life calculations
- **Expected Lifespan** - Default: 85 years
- **Ring Order** - Drag to reorder rings
- **Enable/Disable** - Toggle individual rings

### Periodic Notes Integration

The Memento Mori view can load time blocks from your Periodic Notes:

1. Install the [Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes) plugin
2. Add `radcal` codeblocks to your periodic notes
3. Click the refresh button in Memento Mori to load them

**Weekly Note Example:**
````markdown
```radcal
type: week
Mo 09:00-17:00 blue: Work
Mi 14:00-15:00 green: Meeting
```
````

**Monthly Note Example:**
````markdown
```radcal
type: month
15 red: Dentist
20-22 blue: Conference
```
````

### Right-Click Integration

Right-click on any ring to open the corresponding Periodic Note (requires Periodic Notes plugin):

- Day ring → Open Daily Note
- Week ring (7 days) → Open Weekly Note
- Month ring → Open Monthly Note
- Season ring → Open Quarterly Note
- Year ring → Open Yearly Note

---

## Google Calendar Sync

Sync events from Google Calendar (or any iCal-compatible calendar) to display them as a ring in the radial calendar.

### Setup

1. Get your calendar's private iCal URL:
   - Google Calendar: Settings → Calendar → Integrate calendar → Secret address in iCal format
   - Other calendars: Look for "iCal export" or "Subscribe URL"

2. In Radial Calendar Settings → Calendar Sources:
   - Click "Add Calendar Source"
   - Enter a name and paste the iCal URL
   - Choose a color and folder for synced events
   - Enable "Show as Ring" to display as a separate ring
   - Enable "Show Spanning Arcs" for multi-day events

### Options

| Setting | Description |
|---------|-------------|
| Name | Display name for the calendar |
| URL | Private iCal URL (https://...) |
| Folder | Local folder to store synced events |
| Color | Ring color |
| Sync on Start | Automatically sync when Obsidian starts |
| Sync Interval | Auto-sync interval in minutes (0 = manual only) |
| Show as Ring | Display events as a ring in the calendar |
| Show Spanning Arcs | Display multi-day events as arcs |

### Manual Sync

Use the command palette:
- "Radial Calendar: Sync All Calendars" - Sync all enabled sources
- "Radial Calendar: Sync [Calendar Name]" - Sync a specific calendar

### Cross-Year Events

Events that span across year boundaries show indicators:
- Triangle pointing left (◀) = continues from previous year
- Triangle pointing right (▶) = continues into next year

---

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
| Sync All Calendars | Syncs all enabled calendar sources |
| Sync [Calendar Name] | Syncs a specific calendar source |

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
