/**
 * @fileoverview Core domain types and re-exports.
 *
 * This module serves as the central export point for all domain models
 * and types used throughout the Linear Calendar 2 plugin.
 *
 * @module types
 */

import type { LocalDate as LocalDateType } from '../models/LocalDate';

// Re-export LocalDate types and functions
export type { LocalDate } from '../models/LocalDate';

// Local alias for internal use
type LocalDate = LocalDateType;
export {
  createLocalDate,
  localDateToKey,
  keyToLocalDate,
  compareLocalDates,
  localDatesEqual,
  isValidLocalDate,
  getDaysInMonth,
  isLeapYear,
  getWeekday,
  addDays,
  subtractDays,
  getToday,
  daysBetween,
  isBefore,
  isAfter,
  isWithinRange,
  getFirstDayOfMonth,
  getLastDayOfMonth
} from '../models/LocalDate';

// Re-export CalendarEntry types and functions
export type { CalendarEntry, EntryMetadata } from '../models/CalendarEntry';
export {
  createCalendarEntry,
  createEmptyMetadata,
  isCalendarEntry
} from '../models/CalendarEntry';

// Re-export DateRange types and functions
export type { DateRange, MonthSegment } from '../models/DateRange';
export {
  createDateRange,
  createSingleDayRange,
  rangesOverlap,
  isDateInRange,
  rangeContains,
  intersectRanges,
  getRangeDays,
  splitRangeByMonth,
  getMonthSegment,
  createMonthRange,
  isSingleDay,
  extendRange
} from '../models/DateRange';

// ============================================================================
// Plugin Settings Types
// ============================================================================

/**
 * Configuration for how dates are extracted from files.
 */
export interface DateExtractionConfig {
  /**
   * Whether to extract dates from filenames.
   * @default true
   */
  readonly fromFilename: boolean;

  /**
   * Whether to extract dates from YAML frontmatter.
   * @default true
   */
  readonly fromFrontmatter: boolean;

  /**
   * The frontmatter field name to look for dates.
   * @default "date"
   */
  readonly frontmatterField: string;

  /**
   * The frontmatter field name for end dates (multi-day events).
   * @default "endDate"
   */
  readonly endDateField: string;

  /**
   * Regex patterns for extracting dates from filenames.
   * Patterns are tried in order until one matches.
   */
  readonly filenamePatterns: readonly string[];

  /**
   * Whether to use file creation date as fallback.
   * @default false
   */
  readonly useCreationDateFallback: boolean;
}

/**
 * Configuration for folder filtering.
 */
export interface FolderFilterConfig {
  /**
   * List of folders to include. Empty means include all.
   * Supports glob patterns.
   */
  readonly includeFolders: readonly string[];

  /**
   * List of folders to exclude.
   * Takes precedence over includeFolders.
   * Supports glob patterns.
   */
  readonly excludeFolders: readonly string[];
}

/**
 * Configuration for visual display.
 */
export interface DisplayConfig {
  /**
   * The first day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
   * @default 1 (Monday)
   */
  readonly firstDayOfWeek: number;

  /**
   * Whether to show week numbers.
   * @default false
   */
  readonly showWeekNumbers: boolean;

  /**
   * Whether to highlight today.
   * @default true
   */
  readonly highlightToday: boolean;

  /**
   * Whether to show entries from adjacent months in the calendar view.
   * @default true
   */
  readonly showAdjacentMonths: boolean;

  /**
   * Maximum number of entries to show per day before collapsing.
   * @default 3
   */
  readonly maxEntriesPerDay: number;

  /**
   * Whether to show multi-day event bars.
   * @default true
   */
  readonly showMultiDayBars: boolean;
}

/**
 * Main plugin settings interface.
 *
 * Contains all configurable options for the Linear Calendar 2 plugin.
 */
export interface PluginSettings {
  /**
   * Configuration for date extraction.
   */
  readonly dateExtraction: DateExtractionConfig;

  /**
   * Configuration for folder filtering.
   */
  readonly folderFilter: FolderFilterConfig;

  /**
   * Configuration for visual display.
   */
  readonly display: DisplayConfig;

  /**
   * The locale to use for date formatting.
   * @default "en-US"
   */
  readonly locale: string;

  /**
   * Whether debug mode is enabled.
   * @default false
   */
  readonly debugMode: boolean;
}

/**
 * Default date extraction configuration.
 */
export const DEFAULT_DATE_EXTRACTION_CONFIG: DateExtractionConfig = Object.freeze({
  fromFilename: true,
  fromFrontmatter: true,
  frontmatterField: 'date',
  endDateField: 'endDate',
  filenamePatterns: Object.freeze([
    '^(\\d{4}-\\d{2}-\\d{2})',           // 2024-03-15 at start
    '(\\d{4}-\\d{2}-\\d{2})$',           // 2024-03-15 at end
    '^(\\d{4}-\\d{2}-\\d{2})[-_\\s]',    // 2024-03-15- or 2024-03-15_ prefix
    '[-_\\s](\\d{4}-\\d{2}-\\d{2})\\.md$' // -2024-03-15.md suffix
  ]),
  useCreationDateFallback: false
});

/**
 * Default folder filter configuration.
 */
export const DEFAULT_FOLDER_FILTER_CONFIG: FolderFilterConfig = Object.freeze({
  includeFolders: Object.freeze([]),
  excludeFolders: Object.freeze([])
});

/**
 * Default display configuration.
 */
export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = Object.freeze({
  firstDayOfWeek: 1,
  showWeekNumbers: false,
  highlightToday: true,
  showAdjacentMonths: true,
  maxEntriesPerDay: 3,
  showMultiDayBars: true
});

/**
 * Default plugin settings.
 */
export const DEFAULT_PLUGIN_SETTINGS: PluginSettings = Object.freeze({
  dateExtraction: DEFAULT_DATE_EXTRACTION_CONFIG,
  folderFilter: DEFAULT_FOLDER_FILTER_CONFIG,
  display: DEFAULT_DISPLAY_CONFIG,
  locale: 'en-US',
  debugMode: false
});

/**
 * Creates plugin settings by merging provided options with defaults.
 *
 * @param partial - Partial settings to merge with defaults
 * @returns Complete plugin settings
 */
export function createPluginSettings(partial: Partial<PluginSettings>): PluginSettings {
  return Object.freeze({
    dateExtraction: partial.dateExtraction
      ? Object.freeze({ ...DEFAULT_DATE_EXTRACTION_CONFIG, ...partial.dateExtraction })
      : DEFAULT_DATE_EXTRACTION_CONFIG,
    folderFilter: partial.folderFilter
      ? Object.freeze({ ...DEFAULT_FOLDER_FILTER_CONFIG, ...partial.folderFilter })
      : DEFAULT_FOLDER_FILTER_CONFIG,
    display: partial.display
      ? Object.freeze({ ...DEFAULT_DISPLAY_CONFIG, ...partial.display })
      : DEFAULT_DISPLAY_CONFIG,
    locale: partial.locale ?? DEFAULT_PLUGIN_SETTINGS.locale,
    debugMode: partial.debugMode ?? DEFAULT_PLUGIN_SETTINGS.debugMode
  });
}

// ============================================================================
// Simplified Settings Types (used by plugin)
// ============================================================================

/**
 * Calendar width modes
 */
export type CalendarWidth = 'fit' | 'scroll';

/**
 * Date extraction priority
 */
export type DatePriority = 'property' | 'filename';

/**
 * Simplified settings interface used by the plugin
 */
export interface LinearCalendarSettings {
  /** Calendar width mode */
  calendarWidth: CalendarWidth;

  /** Frontmatter properties to check for start dates */
  dateProperties: string[];

  /** Frontmatter properties to check for end dates */
  endDateProperties: string[];

  /** Priority when both filename and property have dates */
  datePriority: DatePriority;

  /** Folder for daily notes */
  dailyNoteFolder: string;

  /** Format for daily note filenames */
  dailyNoteFormat: string;

  /** Show multi-day event bars */
  showMultiDayBars: boolean;

  /** Highlight weekend days */
  showWeekendHighlight: boolean;

  /**
   * Additional frontmatter properties to use for anniversary dates.
   * These are checked in addition to radcal-start/radcal-end.
   * Example: ["Birthday", "Todestag", "Hochzeitstag"]
   */
  anniversaryDateProperties: string[];
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: LinearCalendarSettings = {
  calendarWidth: 'fit',
  dateProperties: ['date', 'startDate', 'created'],
  endDateProperties: ['endDate', 'due', 'deadline'],
  datePriority: 'property',
  dailyNoteFolder: '',
  dailyNoteFormat: 'YYYY-MM-DD',
  showMultiDayBars: true,
  showWeekendHighlight: true,
  anniversaryDateProperties: [],
};

// ============================================================================
// View State Types
// ============================================================================

/**
 * Represents the currently displayed month in the calendar view.
 */
export interface ViewState {
  /** The year being displayed */
  readonly year: number;

  /** The month being displayed (1-12) */
  readonly month: number;

  /** The currently selected date (if any) */
  readonly selectedDate: LocalDate | null;

  /** The currently focused entry ID (if any) */
  readonly focusedEntryId: string | null;
}

/**
 * Creates a new ViewState for the current month.
 *
 * @returns A ViewState set to the current month
 */
export function createCurrentViewState(): ViewState {
  const today = new Date();
  return Object.freeze({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    selectedDate: null,
    focusedEntryId: null
  });
}

/**
 * Creates a ViewState for a specific month.
 *
 * @param year - The year
 * @param month - The month (1-12)
 * @returns A ViewState for the specified month
 */
export function createViewState(year: number, month: number): ViewState {
  return Object.freeze({
    year,
    month,
    selectedDate: null,
    focusedEntryId: null
  });
}

// ============================================================================
// Radial Calendar Types
// ============================================================================

/**
 * Available color names for ring styling
 */
export type RingColorName =
  | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink'
  | 'teal' | 'cyan' | 'magenta' | 'lime' | 'amber' | 'indigo' | 'violet' | 'rose'
  | 'gray' | 'slate' | 'stone';

/**
 * Ring style options
 */
export type RingStyle = 'solid' | 'striped' | 'dotted' | 'gradient';

/**
 * Available pattern names for arc fills
 * - solid: Uniform fill (default)
 * - striped: Diagonal lines (45°)
 * - horizontal: Horizontal lines
 * - vertical: Vertical lines
 * - dotted: Dot pattern
 * - crosshatch: Crossed diagonal lines
 * - grid: Horizontal + vertical lines
 * - wavy: Wavy lines
 */
export type PatternName =
  | 'solid'
  | 'striped'
  | 'horizontal'
  | 'vertical'
  | 'dotted'
  | 'crosshatch'
  | 'grid'
  | 'wavy';

/**
 * Visual options for rendered segments
 */
export interface SegmentVisualOptions {
  /** Fill pattern (default: solid) */
  pattern?: PatternName;
  /** Opacity 0-100 (default: 100) */
  opacity?: number;
  /** Fade effect at the end (default: false) */
  fade?: boolean;
}

/**
 * Segment type for ring entries
 */
export type SegmentType = 'monthly' | 'weekly' | 'daily' | 'custom';

/**
 * Outer segment type for annual view
 */
export type AnnualSegmentType =
  | 'none'       // No segments
  | 'seasons'    // 4 seasons
  | 'quarters'   // Q1-Q4
  | 'semester'   // H1, H2
  | 'ten-days'   // 36-37 ten-day phases
  | 'weeks'      // 52 weeks
  | 'custom';    // User-defined

/**
 * Configuration for an outer segment marker
 */
export interface OuterSegmentConfig {
  /** Unique identifier */
  readonly id: string;

  /** Display label */
  readonly label: string;

  /** Start day of year (1-366) */
  readonly startDay: number;

  /** End day of year (1-366) */
  readonly endDay: number;

  /** Optional color for the tick */
  readonly color?: RingColorName;
}

/**
 * Configuration for a life act (life view)
 */
export interface LifeActConfig {
  /** Unique identifier */
  readonly id: string;

  /** Display label */
  readonly label: string;

  /** Start age */
  readonly startAge: number;

  /** End age */
  readonly endAge: number;

  /** Optional color for the tick */
  readonly color?: RingColorName;
}

/**
 * View mode for the radial calendar
 */
export type RadialViewMode = 'annual' | 'life';

/**
 * Center display mode
 */
export type CenterDisplayMode = 'countdown' | 'stats' | 'navigation';

/**
 * Ring type - determines how segments are computed
 */
export type RingType =
  | 'life-years'    // Years from birth to expected lifespan
  | 'life-phases'   // Life phases from YAML frontmatter
  | 'year-months'   // 12 months
  | 'year-weeks'    // 52 weeks
  | 'year-days'     // 365/366 days
  | 'events';       // Variable events with start/end dates

/**
 * Segment computation style
 */
export type RingSegmentStyle =
  | 'fixed'         // Fixed number of segments (365 days, 12 months, etc.)
  | 'proportional'  // Equal width per item
  | 'from-yaml';    // Start/end dates from YAML frontmatter

/**
 * Folder pattern type
 */
export type FolderPatternType =
  | 'fixed'             // Static folder path
  | 'year-substitution'; // {year} gets replaced with current year

/**
 * Configuration for a single ring
 */
export interface RingConfig {
  /** Unique identifier */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Folder path in vault (supports {year} placeholder) */
  readonly folder: string;

  /** Primary color (color name) */
  readonly color: RingColorName;

  /** Segment type (legacy - use ringType instead) */
  readonly segmentType: SegmentType;

  /** Whether ring is enabled */
  readonly enabled: boolean;

  /** Position order (0 = outermost) */
  readonly order: number;

  // ======== Extended Ring Configuration ========

  /** Ring type - determines segment computation */
  readonly ringType?: RingType;

  /** How segments are computed */
  readonly segmentStyle?: RingSegmentStyle;

  /** Folder pattern type */
  readonly folderPattern?: FolderPatternType;

  /** Include subfolders */
  readonly recursive?: boolean;

  // ======== YAML Field Mapping (for from-yaml) ========

  /** YAML field for start date (e.g., "phase-start") */
  readonly startDateField?: string;

  /** YAML field for end date (e.g., "phase-end") */
  readonly endDateField?: string;

  /** YAML field for color (e.g., "phase-color") */
  readonly colorField?: string;

  /** YAML field for label (e.g., "phase-label") */
  readonly labelField?: string;

  // ======== Display Options ========

  /** Allow gaps between segments */
  readonly showGaps?: boolean;

  /** Show labels on segments */
  readonly showLabels?: boolean;

  // ======== Spanning Arcs (Multi-Day Events) ========

  /**
   * Enable spanning arcs mode for this ring.
   * Instead of showing day-based segments, shows continuous arcs
   * from startDate to endDate read from YAML frontmatter.
   */
  readonly showSpanningArcs?: boolean;
}

/**
 * Rendered segment for display
 */
export interface RenderedSegment {
  /** Unique identifier */
  id: string;

  /** File path in vault (if applicable) */
  filePath?: string;

  /** Display label */
  label: string;

  /** Start angle in radians */
  startAngle: number;

  /** End angle in radians */
  endAngle: number;

  /** Color (hex or CSS color) */
  color: string;

  /** Associated calendar entries */
  entries: readonly CalendarEntry[];

  /** Is this an ongoing phase (no end date) */
  isOngoing?: boolean;

  /** Angle position of "today" within segment (for gradients) */
  todayAngle?: number;

  /** Track index for overlapping phases (0, 1, 2, ...) */
  track?: number;

  /** Category for grouping (e.g., "Wohnorte", "Sport") */
  category?: string;

  /** Indicates this arc continues from the previous year */
  continuesFromPreviousYear?: boolean;

  /** Indicates this arc continues into the next year */
  continuesIntoNextYear?: boolean;

  /** Original start date (for duration calculation) */
  startDate?: { year: number; month: number; day: number };

  /** Original end date (for duration calculation) */
  endDate?: { year: number; month: number; day: number };

  /** Duration in days */
  durationDays?: number;

  // ======== Visual Options ========

  /** Fill pattern (default: solid) */
  pattern?: PatternName;

  /** Opacity 0-100 (default: 100) */
  opacity?: number;

  /** Fade effect at the end (default: false) */
  fade?: boolean;

  /** Icon/emoji to display at arc start (e.g., "🎂") */
  icon?: string;
}

/**
 * Phase with track assignment for sub-ring rendering
 */
export interface PhaseWithTrack extends RenderedSegment {
  track: number;
}

/**
 * Life phase parsed from YAML frontmatter
 */
export interface LifePhase {
  /** File path in vault */
  filePath: string;

  /** Phase label */
  label: string;

  /** Start date */
  startDate: LocalDate;

  /** End date (null = ongoing) */
  endDate: LocalDate | null;

  /** Color name */
  color: RingColorName;

  /** Category for grouping phases within a ring (e.g., "Wohnorte", "Sport") */
  category?: string;

  /** Ring name for dynamic ring grouping (e.g., "Mutter", "Karriere") */
  ringName?: string;

  // ======== Visual Options ========

  /** Fill pattern (default: solid) */
  pattern?: PatternName;

  /** Opacity 0-100 (default: 100) */
  opacity?: number;

  /** Fade effect at the end (default: false) */
  fade?: boolean;

  /** Icon/emoji to display at arc start (e.g., "🎂") */
  icon?: string;

  /** Preset name (applies preset values if defined) */
  preset?: string;
}

// Re-export CalendarEntry for RenderedSegment
import type { CalendarEntry } from '../models/CalendarEntry';

/**
 * Periodic notes format configuration
 */
export interface PeriodicNotesFormat {
  /** Yearly note format, e.g., "YYYY" */
  readonly yearly: string;

  /** Monthly note format, e.g., "YYYY-MM" */
  readonly monthly: string;

  /** Daily note format, e.g., "YYYY-MM-DD" */
  readonly daily: string;
}

/**
 * Complete Radial Calendar settings
 */
export interface RadialCalendarSettings {
  /** Current view mode */
  currentView: RadialViewMode;

  /** Birth year for life view (legacy, use birthDate if available) */
  birthYear: number;

  /** Full birth date for precise life view calculations (YYYY-MM-DD) */
  birthDate?: string;

  /** Expected lifespan for life view */
  expectedLifespan: number;

  /** Current year for annual view */
  currentYear: number;

  /** Ring configurations (ordered from outside to inside) */
  rings: RingConfig[];

  /** Center display mode */
  centerDisplay: CenterDisplayMode;

  /** Periodic notes format */
  periodicNotesFormat: PeriodicNotesFormat;

  /** Template folder for generated templates */
  templateFolder: string;

  // ======== Daily Notes ========

  /** Folder for daily notes (where new notes are created) */
  dailyNoteFolder: string;

  /** Folder filter for which files to show in calendar */
  calendarFilterFolder: string;

  /** Folder for annual recurring notes (birthdays, anniversaries) */
  annualRecurringFolder: string;

  // ======== Life Phases ========

  /** Folder for life phase notes */
  lifePhasesFolder: string;

  // ======== Outer Segments ========

  /** Annual view segment type */
  annualSegmentType: AnnualSegmentType;

  /** Custom segments for annual view */
  customSegments: OuterSegmentConfig[];

  /** Life acts for life view */
  lifeActs: LifeActConfig[];

  /** Whether to show segment labels */
  showSegmentLabels: boolean;

  // ======== Anniversary Settings ========

  /**
   * Additional frontmatter properties to use for anniversary dates.
   * These are checked in addition to radcal-start/radcal-end.
   * Example: ["Birthday", "Todestag", "Hochzeitstag"]
   */
  anniversaryDateProperties: string[];

  // ======== Calendar Sync ========

  /**
   * External calendar sources (Google Calendar, etc.)
   */
  calendarSources: CalendarSourceConfig[];

  // ======== Presets ========

  /**
   * User-defined appearance presets.
   * Use radcal-preset: presetName to apply.
   */
  presets: PresetConfig[];
}

/**
 * Configuration for an external calendar source
 */
export interface CalendarSourceConfig {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** iCal URL (private link) */
  url: string;

  /** Target folder for synced events */
  folder: string;

  /** Color for ring display */
  color: RingColorName;

  /** Sync on Obsidian start */
  syncOnStart: boolean;

  /** Sync interval in minutes (0 = manual only) */
  syncIntervalMinutes: number;

  /** Whether this source is enabled */
  enabled: boolean;

  /** Show as ring in annual view */
  showAsRing: boolean;

  /** Show multi-day events as spanning arcs */
  showSpanningArcs: boolean;

  /** Last sync timestamp */
  lastSync?: number;
}

/**
 * Configuration for an appearance preset
 * Allows users to define reusable appearance combinations
 */
export interface PresetConfig {
  /** Unique name (used in radcal-preset property) */
  name: string;

  /** Display label (shown in UI) */
  label?: string;

  /** Color */
  color: RingColorName;

  /** Pattern */
  pattern?: PatternName;

  /** Opacity (0-100) */
  opacity?: number;

  /** Icon/emoji */
  icon?: string;
}

/**
 * Default presets for common use cases
 */
export const DEFAULT_PRESETS: PresetConfig[] = [
  { name: 'family', label: 'Family', color: 'pink', icon: '❤️' },
  { name: 'work', label: 'Work', color: 'blue', icon: '💼' },
  { name: 'education', label: 'Education', color: 'indigo', icon: '🎓' },
  { name: 'health', label: 'Health', color: 'green', icon: '🏥' },
  { name: 'travel', label: 'Travel', color: 'cyan', icon: '✈️' },
  { name: 'project', label: 'Project', color: 'amber', icon: '📋' },
  { name: 'completed', label: 'Completed', color: 'green', opacity: 60, icon: '✅' },
  { name: 'cancelled', label: 'Cancelled', color: 'gray', pattern: 'striped', opacity: 50, icon: '❌' },
];

/**
 * Color name to CSS color mapping
 */
export const RING_COLORS: Record<RingColorName, string> = {
  // Basis
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  // Erweitert
  teal: '#14b8a6',
  cyan: '#06b6d4',
  magenta: '#d946ef',
  lime: '#84cc16',
  amber: '#f59e0b',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  // Neutral
  gray: '#6b7280',
  slate: '#64748b',
  stone: '#78716c',
};

/**
 * SVG Pattern builder functions for arc fills.
 * Each function takes a color and a parent pattern element, and appends SVG children.
 */
export const SVG_PATTERN_BUILDERS: Record<PatternName, (pattern: SVGPatternElement, color: string) => void> = {
  // Solid fill - just a rect
  solid: (pattern, color) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', color);
    pattern.appendChild(rect);
  },

  // Diagonal stripes (45°)
  striped: (pattern, color) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', color);
    rect.setAttribute('fill-opacity', '0.3');
    pattern.appendChild(rect);

    for (const [x1, y1, x2, y2] of [[0, 0, 10, 10], [-10, 0, 0, 10], [10, 0, 20, 10]]) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '2');
      pattern.appendChild(line);
    }
  },

  // Horizontal lines
  horizontal: (pattern, color) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', color);
    rect.setAttribute('fill-opacity', '0.2');
    pattern.appendChild(rect);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '5');
    line.setAttribute('x2', '10');
    line.setAttribute('y2', '5');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '2');
    pattern.appendChild(line);
  },

  // Vertical lines
  vertical: (pattern, color) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', color);
    rect.setAttribute('fill-opacity', '0.2');
    pattern.appendChild(rect);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '5');
    line.setAttribute('y1', '0');
    line.setAttribute('x2', '5');
    line.setAttribute('y2', '10');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '2');
    pattern.appendChild(line);
  },

  // Dot pattern
  dotted: (pattern, color) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', color);
    rect.setAttribute('fill-opacity', '0.2');
    pattern.appendChild(rect);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '5');
    circle.setAttribute('cy', '5');
    circle.setAttribute('r', '2');
    circle.setAttribute('fill', color);
    pattern.appendChild(circle);
  },

  // Crosshatch (diagonal both ways)
  crosshatch: (pattern, color) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', color);
    rect.setAttribute('fill-opacity', '0.2');
    pattern.appendChild(rect);

    for (const [x1, y1, x2, y2] of [[0, 0, 10, 10], [10, 0, 0, 10]]) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '1.5');
      pattern.appendChild(line);
    }
  },

  // Grid pattern
  grid: (pattern, color) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', color);
    rect.setAttribute('fill-opacity', '0.2');
    pattern.appendChild(rect);

    const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    vLine.setAttribute('x1', '5');
    vLine.setAttribute('y1', '0');
    vLine.setAttribute('x2', '5');
    vLine.setAttribute('y2', '10');
    vLine.setAttribute('stroke', color);
    vLine.setAttribute('stroke-width', '1');
    pattern.appendChild(vLine);

    const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hLine.setAttribute('x1', '0');
    hLine.setAttribute('y1', '5');
    hLine.setAttribute('x2', '10');
    hLine.setAttribute('y2', '5');
    hLine.setAttribute('stroke', color);
    hLine.setAttribute('stroke-width', '1');
    pattern.appendChild(hLine);
  },

  // Wavy lines
  wavy: (pattern, color) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', color);
    rect.setAttribute('fill-opacity', '0.2');
    pattern.appendChild(rect);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M0,5 Q2.5,0 5,5 T10,5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '1.5');
    pattern.appendChild(path);
  },
};

/**
 * List of available pattern names for UI
 */
export const PATTERN_NAMES: PatternName[] = [
  'solid', 'striped', 'horizontal', 'vertical',
  'dotted', 'crosshatch', 'grid', 'wavy',
];

/**
 * Default ring configuration
 */
export function createDefaultRing(order: number): RingConfig {
  return {
    id: `ring-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: `Ring ${order + 1}`,
    folder: '',
    color: 'blue',
    segmentType: 'monthly',
    enabled: true,
    order,
    // Extended defaults
    ringType: 'year-days',
    segmentStyle: 'fixed',
    folderPattern: 'fixed',
    recursive: false,
    showGaps: false,
    showLabels: false,
  };
}

/**
 * Create a life-phases ring configuration
 */
export function createLifePhasesRing(folder: string, order: number = 0): RingConfig {
  return {
    id: `life-phases-${Date.now()}`,
    name: 'Life Phases',
    folder,
    color: 'blue',
    segmentType: 'custom',
    enabled: true,
    order,
    // Life phases specific
    ringType: 'life-phases',
    segmentStyle: 'from-yaml',
    folderPattern: 'fixed',
    recursive: false,
    startDateField: 'phase-start',
    endDateField: 'phase-end',
    colorField: 'phase-color',
    labelField: 'phase-label',
    showGaps: true,
    showLabels: true,
  };
}

/**
 * Create a year-events ring configuration
 */
export function createEventsRing(folder: string, order: number = 1): RingConfig {
  return {
    id: `events-${Date.now()}`,
    name: 'Events',
    folder,
    color: 'teal',
    segmentType: 'custom',
    enabled: true,
    order,
    // Events specific
    ringType: 'events',
    segmentStyle: 'from-yaml',
    folderPattern: 'year-substitution',
    recursive: false,
    startDateField: 'event-start',
    endDateField: 'event-end',
    colorField: 'event-color',
    labelField: 'event-label',
    showGaps: true,
    showLabels: true,
  };
}

// ============================================================================
// Track Assignment for Overlapping Phases
// ============================================================================

/**
 * Assign tracks to overlapping phases (for sub-ring rendering)
 *
 * Uses a greedy interval scheduling algorithm:
 * - Sort phases by start angle
 * - For each phase, find the first available track
 * - If no track is available, create a new one
 */
export function assignTracks(phases: RenderedSegment[]): PhaseWithTrack[] {
  // Sort by start angle
  const sorted = [...phases].sort((a, b) => a.startAngle - b.startAngle);
  const tracks: { endAngle: number }[] = [];

  return sorted.map(phase => {
    // Find first track that is free (its endAngle <= phase.startAngle)
    let trackIndex = tracks.findIndex(t => t.endAngle <= phase.startAngle);

    if (trackIndex === -1) {
      // No free track, create a new one
      trackIndex = tracks.length;
      tracks.push({ endAngle: phase.endAngle });
    } else {
      // Reuse existing track
      tracks[trackIndex].endAngle = phase.endAngle;
    }

    return { ...phase, track: trackIndex };
  });
}

/**
 * Compute sub-ring radii for a given track
 *
 * @param outerRadius - Outer radius of the parent ring
 * @param innerRadius - Inner radius of the parent ring
 * @param trackCount - Total number of tracks
 * @param trackIndex - Index of the track (0 = outermost)
 * @returns Inner and outer radius for this track
 */
export function computeSubRingRadii(
  outerRadius: number,
  innerRadius: number,
  trackCount: number,
  trackIndex: number
): { inner: number; outer: number } {
  const trackHeight = (outerRadius - innerRadius) / trackCount;
  return {
    outer: outerRadius - trackIndex * trackHeight,
    inner: outerRadius - (trackIndex + 1) * trackHeight,
  };
}

/**
 * Get the maximum number of tracks needed for overlapping phases
 */
export function getMaxTrackCount(phases: PhaseWithTrack[]): number {
  if (phases.length === 0) return 1;
  return Math.max(...phases.map(p => p.track)) + 1;
}

// ============================================================================
// Predefined Outer Segments
// ============================================================================

/**
 * Seasons (meteorological, Northern Hemisphere)
 */
export const PREDEFINED_SEASONS: OuterSegmentConfig[] = [
  { id: 'spring', label: 'Spring', startDay: 60, endDay: 152 },   // 1 Mar - 31 May
  { id: 'summer', label: 'Summer', startDay: 152, endDay: 244 },  // 1 Jun - 31 Aug
  { id: 'autumn', label: 'Autumn', startDay: 244, endDay: 335 },  // 1 Sep - 30 Nov
  { id: 'winter', label: 'Winter', startDay: 335, endDay: 60 },   // 1 Dec - 28 Feb (wraps)
];

/**
 * Quarters (Q1-Q4)
 */
export const PREDEFINED_QUARTERS: OuterSegmentConfig[] = [
  { id: 'q1', label: 'Q1', startDay: 1, endDay: 90 },
  { id: 'q2', label: 'Q2', startDay: 91, endDay: 181 },
  { id: 'q3', label: 'Q3', startDay: 182, endDay: 273 },
  { id: 'q4', label: 'Q4', startDay: 274, endDay: 365 },
];

/**
 * Semesters (H1, H2)
 */
export const PREDEFINED_SEMESTERS: OuterSegmentConfig[] = [
  { id: 's1', label: 'H1', startDay: 1, endDay: 181 },
  { id: 's2', label: 'H2', startDay: 182, endDay: 365 },
];

/**
 * Generate 10-day phases for a year
 */
export function generate10DayPhases(): OuterSegmentConfig[] {
  const phases: OuterSegmentConfig[] = [];
  let dayOfYear = 1;
  let phaseNum = 1;

  while (dayOfYear <= 365) {
    const endDay = Math.min(dayOfYear + 9, 365);
    phases.push({
      id: `10d-${phaseNum}`,
      label: `P${phaseNum}`,
      startDay: dayOfYear,
      endDay: endDay,
    });
    dayOfYear = endDay + 1;
    phaseNum++;
  }

  return phases;
}

/**
 * Generate week segments for a year
 */
export function generateWeekSegments(): OuterSegmentConfig[] {
  const weeks: OuterSegmentConfig[] = [];
  for (let week = 1; week <= 52; week++) {
    const startDay = (week - 1) * 7 + 1;
    const endDay = Math.min(week * 7, 365);
    weeks.push({
      id: `w-${week}`,
      label: `W${week}`,
      startDay,
      endDay,
    });
  }
  return weeks;
}

/**
 * Default Radial Calendar settings
 */
export const DEFAULT_RADIAL_SETTINGS: RadialCalendarSettings = {
  currentView: 'annual',
  birthYear: 1990,
  expectedLifespan: 85,
  currentYear: new Date().getFullYear(),
  rings: [],
  centerDisplay: 'countdown',
  periodicNotesFormat: {
    yearly: 'YYYY',
    monthly: 'YYYY-MM',
    daily: 'YYYY-MM-DD',
  },
  templateFolder: 'Templates',
  // Daily notes
  dailyNoteFolder: '',
  calendarFilterFolder: '',
  annualRecurringFolder: '',
  // Life phases
  lifePhasesFolder: '',
  // Outer segments
  annualSegmentType: 'none',
  customSegments: [],
  lifeActs: [],
  showSegmentLabels: true,
  // Anniversary
  anniversaryDateProperties: [],
  // Calendar sync
  calendarSources: [],
  // Presets
  presets: [...DEFAULT_PRESETS],
};

/**
 * Available colors for reference in templates
 */
export const COLOR_LIST_COMMENT =
`# Farben: red, orange, yellow, green, blue, purple, pink, teal,
#         cyan, magenta, lime, amber, indigo, violet, rose, gray, slate, stone
# Patterns: solid, striped, horizontal, vertical, dotted, crosshatch, grid, wavy`;

/**
 * Template for Life Phase notes (unified radcal-* properties)
 * Uses radcal-showInLife: true to appear in Life View
 * Uses radcal-ring to group into named rings (e.g., "Mutter", "Karriere")
 */
export const LIFE_PHASE_TEMPLATE = `---
# Farben: red, orange, yellow, green, blue, purple, pink, teal,
#         cyan, magenta, lime, amber, indigo, violet, rose, gray, slate, stone
# Patterns: solid, striped, horizontal, vertical, dotted, crosshatch, grid, wavy
radcal-start: {{date}}
radcal-end:
radcal-color: blue
radcal-label:
radcal-showInLife: true
radcal-ring:
radcal-pattern:
radcal-opacity:
radcal-fade:
---

# {{title}}

Beschreibung der Lebensphase...
`;

/**
 * Template for Spanning Arc notes (date ranges, Annual View only)
 */
export const SPANNING_ARC_TEMPLATE = `---
# Farben: red, orange, yellow, green, blue, purple, pink, teal,
#         cyan, magenta, lime, amber, indigo, violet, rose, gray, slate, stone
# Patterns: solid, striped, horizontal, vertical, dotted, crosshatch, grid, wavy
radcal-start: {{date}}
radcal-end:
radcal-color: blue
radcal-label:
radcal-pattern:
radcal-opacity:
radcal-fade:
---

# {{title}}

Beschreibung des Zeitraums...
`;

/**
 * Template for Anniversary notes (yearly recurring)
 * For persons: use radcal-start (birthday) + radcal-end (death) for both dates
 * For single events: use radcal-annual-fix
 */
export const ANNIVERSARY_TEMPLATE = `---
# Farben: red, orange, yellow, green, blue, purple, pink, teal,
#         cyan, magenta, lime, amber, indigo, violet, rose, gray, slate, stone
# Patterns: solid, striped, horizontal, vertical, dotted, crosshatch, grid, wavy
radcal-annual: true
radcal-start:
radcal-end:
radcal-color: pink
radcal-label:
radcal-showInLife: true
radcal-ring:
radcal-pattern:
radcal-opacity:
radcal-fade:
---

# {{title}}

Person oder jährliches Event...
`;
