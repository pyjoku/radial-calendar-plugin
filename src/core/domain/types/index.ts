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
 * Segment type for ring entries
 */
export type SegmentType = 'monthly' | 'weekly' | 'daily' | 'custom';

/**
 * View mode for the radial calendar
 */
export type RadialViewMode = 'annual' | 'life';

/**
 * Center display mode
 */
export type CenterDisplayMode = 'countdown' | 'stats' | 'navigation';

/**
 * Configuration for a single ring
 */
export interface RingConfig {
  /** Unique identifier */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Folder path in vault */
  readonly folder: string;

  /** Primary color (color name) */
  readonly color: RingColorName;

  /** Segment type */
  readonly segmentType: SegmentType;

  /** Whether ring is enabled */
  readonly enabled: boolean;

  /** Position order (0 = outermost) */
  readonly order: number;
}

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

  /** Birth year for life view */
  birthYear: number;

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
}

/**
 * Frontmatter properties for ring segment styling
 */
export interface RingSegmentFrontmatter {
  /** Override ring color */
  'ring-color'?: RingColorName;

  /** Label text in segment */
  'ring-label'?: string;

  /** Lucide icon name */
  'ring-icon'?: string;

  /** Progress percentage (0-100) */
  'ring-progress'?: number;

  /** Visual style */
  'ring-style'?: RingStyle;

  /** Start date */
  'date'?: string;

  /** End date */
  'end-date'?: string;
}

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
  };
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
};

/**
 * Template content for ring segment notes
 */
export const RING_SEGMENT_TEMPLATE = `---
# === RADIAL CALENDAR TEMPLATE ===
# Lösche die Zeilen, die du nicht brauchst

# FARBEN (wähle eine):
ring-color: blue
# ring-color: red
# ring-color: orange
# ring-color: yellow
# ring-color: green
# ring-color: teal
# ring-color: purple
# ring-color: magenta
# ring-color: pink
# ring-color: cyan
# ring-color: lime
# ring-color: amber
# ring-color: indigo

# STIL (wähle einen):
ring-style: solid
# ring-style: striped
# ring-style: dotted
# ring-style: gradient

# LABEL & ICON:
ring-label: ""
ring-icon: circle

# ZEITRAUM:
date: {{date}}
# end-date:

# FORTSCHRITT (0-100):
# ring-progress: 0
---

# {{title}}

`;
