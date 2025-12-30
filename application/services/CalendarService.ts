/**
 * CalendarService - Main application service for calendar functionality
 *
 * This service coordinates between the infrastructure repositories and
 * core engines to provide calendar functionality to the presentation layer.
 */

import type { App, TFile } from 'obsidian';
import { VaultRepository, FileInfo } from '../../infrastructure/repositories/VaultRepository';
import { MetadataRepository } from '../../infrastructure/repositories/MetadataRepository';
import { EntryCache } from '../../infrastructure/cache/EntryCache';
import { DateEngine, DateExtractionConfig } from '../../core/engines/DateEngine';
import { CalendarEngine, CalendarGrid } from '../../core/engines/CalendarEngine';
import { MultiDayEngine, BarPosition } from '../../core/engines/MultiDayEngine';
import { createCalendarEntry, CalendarEntry } from '../../core/domain/models/CalendarEntry';
import type { LocalDate } from '../../core/domain/models/LocalDate';
import { getToday } from '../../core/domain/models/LocalDate';
import type { LinearCalendarSettings, LifePhase, RingColorName, RenderedSegment, PatternName } from '../../core/domain/types';
import { PATTERN_NAMES } from '../../core/domain/types';
import { createLocalDate, daysBetween } from '../../core/domain/models/LocalDate';

/**
 * Events that can be subscribed to
 */
export interface CalendarServiceEvents {
  /** Called when entries are updated */
  onEntriesUpdated: () => void;
  /** Called when a year changes */
  onYearChanged: (year: number) => void;
}

/**
 * Main service for calendar functionality
 */
export class CalendarService {
  private readonly vaultRepository: VaultRepository;
  private readonly metadataRepository: MetadataRepository;
  private readonly entryCache: EntryCache;
  private readonly dateEngine: DateEngine;
  private readonly calendarEngine: CalendarEngine;
  private readonly multiDayEngine: MultiDayEngine;

  private settings: LinearCalendarSettings;
  private currentYear: number;
  private unregisterMetadataListener: (() => void) | null = null;
  private eventListeners: CalendarServiceEvents | null = null;
  private updateSubscribers: Set<() => void> = new Set();

  constructor(app: App, settings: LinearCalendarSettings) {
    this.vaultRepository = new VaultRepository(app);
    this.metadataRepository = new MetadataRepository(app);
    this.entryCache = new EntryCache({ debug: false });
    this.dateEngine = new DateEngine();
    this.calendarEngine = new CalendarEngine();
    this.multiDayEngine = new MultiDayEngine();

    this.settings = settings;
    this.currentYear = getToday().year;
  }

  /**
   * Initializes the service and loads initial data
   */
  async initialize(): Promise<void> {
    await this.rebuildCache();
    this.setupMetadataListener();
  }

  /**
   * Cleans up resources when the service is destroyed
   */
  destroy(): void {
    if (this.unregisterMetadataListener) {
      this.unregisterMetadataListener();
      this.unregisterMetadataListener = null;
    }
    this.eventListeners = null;
  }

  /**
   * Sets the event listeners
   * @param listeners - Event listener callbacks
   */
  setEventListeners(listeners: CalendarServiceEvents): void {
    this.eventListeners = listeners;
  }

  /**
   * Subscribe to entry updates (for codeblock live refresh)
   * @param callback - Function to call when entries are updated
   * @returns Unsubscribe function
   */
  subscribeToUpdates(callback: () => void): () => void {
    this.updateSubscribers.add(callback);
    return () => {
      this.updateSubscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of updates
   */
  private notifySubscribers(): void {
    for (const callback of this.updateSubscribers) {
      try {
        callback();
      } catch (e) {
        console.error('Radcal subscriber error:', e);
      }
    }
  }

  /**
   * Updates the settings
   * @param settings - New settings
   */
  async updateSettings(settings: LinearCalendarSettings): Promise<void> {
    const needsRebuild =
      this.settings.dateProperties.join(',') !== settings.dateProperties.join(',') ||
      this.settings.endDateProperties.join(',') !== settings.endDateProperties.join(',') ||
      this.settings.datePriority !== settings.datePriority;

    this.settings = settings;

    if (needsRebuild) {
      await this.rebuildCache();
    }
  }

  /**
   * Gets the current year being displayed
   */
  getCurrentYear(): number {
    return this.currentYear;
  }

  /**
   * Sets the current year to display
   * @param year - The year to display
   */
  setCurrentYear(year: number): void {
    if (this.currentYear !== year) {
      this.currentYear = year;
      this.eventListeners?.onYearChanged(year);
    }
  }

  /**
   * Alias for setCurrentYear - sets the year to display
   * @param year - The year to display
   */
  setYear(year: number): void {
    this.setCurrentYear(year);
  }

  /**
   * Navigates to the next year
   */
  nextYear(): void {
    this.setCurrentYear(this.currentYear + 1);
  }

  /**
   * Navigates to the previous year
   */
  previousYear(): void {
    this.setCurrentYear(this.currentYear - 1);
  }

  /**
   * Navigates to today's year
   */
  goToToday(): void {
    this.setCurrentYear(getToday().year);
  }

  /**
   * Generates the calendar grid for the current year
   * @returns CalendarGrid for the current year
   */
  generateCalendarGrid(): CalendarGrid {
    return this.calendarEngine.generateGrid(this.currentYear);
  }

  /**
   * Gets all entries for a specific date
   * @param date - The date to get entries for
   * @returns Array of calendar entries
   */
  getEntriesForDate(date: LocalDate): readonly CalendarEntry[] {
    return this.entryCache.getEntriesForDate(date);
  }

  /**
   * Gets entries for a specific date filtered by folder
   * @param date - The date to get entries for
   * @param folder - The folder path to filter by
   * @returns Array of calendar entries in the specified folder
   */
  getEntriesForDateInFolder(date: LocalDate, folder: string): readonly CalendarEntry[] {
    const entries = this.entryCache.getEntriesForDate(date);
    if (!folder) return entries;

    const normalizedFolder = folder.toLowerCase().replace(/\/$/, '');
    return entries.filter(entry => {
      if (!entry.path) return false;
      const entryFolder = entry.path.substring(0, entry.path.lastIndexOf('/')).toLowerCase();
      return entryFolder === normalizedFolder || entryFolder.startsWith(normalizedFolder + '/');
    });
  }

  /**
   * Gets all multi-day entries for the current year
   * @returns Array of multi-day entries
   */
  getMultiDayEntries(): readonly CalendarEntry[] {
    return this.entryCache.getMultiDayEntries().filter((entry) => {
      // Filter to entries that overlap with current year
      const yearStart: LocalDate = { year: this.currentYear, month: 1, day: 1 };
      const yearEnd: LocalDate = { year: this.currentYear, month: 12, day: 31 };

      const entryEnd = entry.endDate ?? entry.startDate;
      return (
        (entry.startDate.year === this.currentYear ||
          (entry.startDate.year < this.currentYear &&
            entryEnd.year >= this.currentYear))
      );
    });
  }

  /**
   * Gets anniversary entries for a specific date (recurring yearly)
   * @param date - The date to get anniversary entries for
   * @returns Array of anniversary entries matching this month/day
   */
  getAnniversaryEntriesForDate(date: LocalDate): readonly CalendarEntry[] {
    return this.entryCache.getAnniversaryEntriesForDate(date);
  }

  /**
   * Gets all anniversary entries
   * @returns Array of all anniversary entries
   */
  getAllAnniversaryEntries(): readonly CalendarEntry[] {
    return this.entryCache.getAllAnniversaryEntries();
  }

  /**
   * Calculates bar positions for multi-day entries
   * TODO: Implement proper multi-day bar positioning
   */
  calculateBarPositions(
    _entries: readonly CalendarEntry[],
    _year: number
  ): Map<string, BarPosition[]> {
    // Stub for MVP - full implementation coming in next phase
    return new Map();
  }

  /**
   * Opens or creates a daily note for a specific date
   * @param date - The date to open
   */
  async openDailyNote(date: LocalDate): Promise<void> {
    const format = this.settings.dailyNoteFormat;
    const folder = this.settings.dailyNoteFolder;

    const filename = this.formatDailyNoteFilename(date, format);
    const path = folder ? `${folder}/${filename}.md` : `${filename}.md`;

    const file = await this.vaultRepository.createOrOpenDailyNote(path);

    // Open the file in the workspace
    // This requires access to the workspace which we'll handle in the plugin
    // For now, return the file path
    console.log(`Opening daily note: ${file.path}`);
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): { entryCount: number; dateCount: number } {
    const stats = this.entryCache.getStats();
    return {
      entryCount: stats.entryCount,
      dateCount: stats.dateCount,
    };
  }

  // ============================================================================
  // Life Phases
  // ============================================================================

  /**
   * Loads life phases from multiple sources:
   * 1. Files in lifePhasesFolder with phase-* properties (legacy)
   * 2. Any file with radcal-showInLife: true and radcal-start property
   *
   * Supported YAML frontmatter:
   * - Legacy: phase-start, phase-end, phase-color, phase-label
   * - New: radcal-start, radcal-end, radcal-color, radcal-label, radcal-showInLife
   *
   * @param folder - The folder path to load phases from (legacy)
   * @param config - Field name configuration
   * @returns Array of parsed life phases
   */
  loadLifePhases(
    folder: string,
    config: {
      startDateField: string;
      endDateField: string;
      colorField: string;
      labelField: string;
      categoryField: string;
    } = {
      startDateField: 'phase-start',
      endDateField: 'phase-end',
      colorField: 'phase-color',
      labelField: 'phase-label',
      categoryField: 'phase-category',
    }
  ): LifePhase[] {
    const files = this.vaultRepository.getAllMarkdownFiles();
    const phases: LifePhase[] = [];
    const seenPaths = new Set<string>();

    // 1. Load from lifePhasesFolder with phase-* properties (legacy)
    if (folder) {
      const folderPrefix = folder.endsWith('/') ? folder : `${folder}/`;
      const folderFiles = files.filter(
        (f) => f.path === `${folder}.md` || f.path.startsWith(folderPrefix)
      );

      for (const fileInfo of folderFiles) {
        const phase = this.parseLifePhase(fileInfo, config);
        if (phase) {
          phases.push(phase);
          seenPaths.add(fileInfo.path);
        }
      }
    }

    // 2. Load any file with radcal-showInLife: true
    const radcalConfig = {
      startDateField: 'radcal-start',
      endDateField: 'radcal-end',
      colorField: 'radcal-color',
      labelField: 'radcal-label',
      categoryField: 'radcal-category',
    };

    for (const fileInfo of files) {
      // Skip already processed files
      if (seenPaths.has(fileInfo.path)) continue;

      const metadata = this.metadataRepository.getMetadataByPath(fileInfo.path);
      const frontmatter = metadata?.frontmatter;

      // Check for radcal-showInLife: true
      if (frontmatter?.['radcal-showInLife'] === true) {
        const phase = this.parseLifePhase(fileInfo, radcalConfig);
        if (phase) {
          phases.push(phase);
        }
      }
    }

    // Sort by start date
    return phases.sort((a, b) => {
      if (a.startDate.year !== b.startDate.year) return a.startDate.year - b.startDate.year;
      if (a.startDate.month !== b.startDate.month) return a.startDate.month - b.startDate.month;
      return a.startDate.day - b.startDate.day;
    });
  }

  /**
   * Parses a single file into a LifePhase
   */
  private parseLifePhase(
    fileInfo: FileInfo,
    config: {
      startDateField: string;
      endDateField: string;
      colorField: string;
      labelField: string;
      categoryField: string;
    }
  ): LifePhase | null {
    const metadata = this.metadataRepository.getMetadataByPath(fileInfo.path);
    const frontmatter = metadata?.frontmatter;

    if (!frontmatter) return null;

    // Parse start date
    const startStr = frontmatter[config.startDateField];
    if (!startStr || typeof startStr !== 'string') return null;

    const startDate = this.parseYAMLDate(startStr);
    if (!startDate) return null;

    // Parse end date (optional - null means ongoing)
    const endStr = frontmatter[config.endDateField];
    let endDate: LocalDate | null = null;
    if (endStr && typeof endStr === 'string' && endStr.trim() !== '') {
      endDate = this.parseYAMLDate(endStr);
    }

    // Get color (default to blue)
    const colorStr = frontmatter[config.colorField];
    const color: RingColorName = this.isValidColor(colorStr) ? colorStr : 'blue';

    // Get label (default to filename)
    const label = frontmatter[config.labelField] || fileInfo.basename;

    // Get category (optional)
    const category = frontmatter[config.categoryField];

    // Get ring name (for dynamic ring grouping)
    const ringName = frontmatter['radcal-ring'];

    // Get visual options
    const patternStr = frontmatter['radcal-pattern'];
    const pattern: PatternName | undefined = this.isValidPattern(patternStr) ? patternStr : undefined;

    const opacityValue = frontmatter['radcal-opacity'];
    let opacity: number | undefined;
    if (typeof opacityValue === 'number' && opacityValue >= 0 && opacityValue <= 100) {
      opacity = opacityValue;
    } else if (typeof opacityValue === 'string') {
      const parsed = parseInt(opacityValue, 10);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        opacity = parsed;
      }
    }

    const fadeValue = frontmatter['radcal-fade'];
    const fade = fadeValue === true || fadeValue === 'true';

    // Get icon (emoji/symbol)
    const iconValue = frontmatter['radcal-icon'];
    const icon = typeof iconValue === 'string' && iconValue.trim() ? iconValue.trim() : undefined;

    // Get preset name
    const presetValue = frontmatter['radcal-preset'];
    const preset = typeof presetValue === 'string' && presetValue.trim() ? presetValue.trim() : undefined;

    return {
      filePath: fileInfo.path,
      label: String(label),
      startDate,
      endDate,
      color,
      category: category ? String(category) : undefined,
      ringName: ringName ? String(ringName) : undefined,
      pattern,
      opacity,
      fade,
      icon,
      preset,
    };
  }

  /**
   * Validates if a string is a valid pattern name
   */
  private isValidPattern(value: unknown): value is PatternName {
    return typeof value === 'string' && PATTERN_NAMES.includes(value as PatternName);
  }

  /**
   * Loads life phases grouped by ring name.
   * Returns a Map where key is ring name and value is array of phases.
   * Phases without radcal-ring go into the "__default__" ring.
   *
   * @param folder - Legacy folder for phase-* properties
   * @returns Map of ring name to phases
   */
  loadLifePhasesByRing(folder: string): Map<string, LifePhase[]> {
    const allPhases = this.loadLifePhases(folder);
    const ringMap = new Map<string, LifePhase[]>();

    for (const phase of allPhases) {
      const ringName = phase.ringName || '__default__';
      const existing = ringMap.get(ringName) || [];
      existing.push(phase);
      ringMap.set(ringName, existing);
    }

    return ringMap;
  }

  /**
   * Parses a YAML date string (YYYY-MM-DD) to LocalDate
   */
  private parseYAMLDate(dateStr: string): LocalDate | null {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return createLocalDate(year, month, day);
  }

  /**
   * Checks if a value is a valid color name
   */
  private isValidColor(value: unknown): value is RingColorName {
    const validColors: RingColorName[] = [
      'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink',
      'teal', 'cyan', 'magenta', 'lime', 'amber', 'indigo', 'violet', 'rose',
      'gray', 'slate', 'stone',
    ];
    return typeof value === 'string' && validColors.includes(value as RingColorName);
  }

  /**
   * Converts life phases to rendered segments with angles
   *
   * The life ring spans from birthDate to expectedEndDate.
   * Each phase is mapped to its angular position based on dates.
   *
   * Preset values are applied when a phase has radcal-preset set:
   * - If phase has explicit color/pattern/opacity/icon, those take precedence
   * - Otherwise, preset values are used as fallback
   *
   * @param phases - Array of life phases
   * @param birthYear - Birth year (fallback)
   * @param expectedLifespan - Expected lifespan in years
   * @param birthDate - Optional precise birth date (YYYY-MM-DD)
   * @param presets - Optional array of preset configurations
   * @returns Array of rendered segments with angles
   */
  computeLifePhaseSegments(
    phases: LifePhase[],
    birthYear: number,
    expectedLifespan: number,
    birthDate?: string,
    presets?: import('../../core/domain/types').PresetConfig[]
  ): import('../../core/domain/types').RenderedSegment[] {
    // Parse birth date or use Jan 1 of birth year
    const birthLocalDate = birthDate
      ? this.parseYAMLDate(birthDate) || createLocalDate(birthYear, 1, 1)
      : createLocalDate(birthYear, 1, 1);

    // Calculate total lifespan in days for precise angles
    const expectedEndDate = createLocalDate(
      birthLocalDate.year + expectedLifespan,
      birthLocalDate.month,
      birthLocalDate.day
    );

    const totalDays = this.daysBetweenDates(birthLocalDate, expectedEndDate);

    // Today for ongoing phases
    const today = getToday();

    // Build preset lookup map
    const presetMap = new Map<string, import('../../core/domain/types').PresetConfig>();
    if (presets) {
      for (const preset of presets) {
        presetMap.set(preset.name.toLowerCase(), preset);
      }
    }

    return phases.map((phase) => {
      // Calculate days from birth to phase start
      const daysToStart = this.daysBetweenDates(birthLocalDate, phase.startDate);
      const startAngle = (daysToStart / totalDays) * 2 * Math.PI;

      // Calculate end angle
      let endDate: LocalDate;
      let isOngoing = false;

      if (phase.endDate) {
        endDate = phase.endDate;
      } else {
        // Ongoing phase - extends to expected end
        isOngoing = true;
        endDate = expectedEndDate;
      }

      const daysToEnd = this.daysBetweenDates(birthLocalDate, endDate);
      const endAngle = (daysToEnd / totalDays) * 2 * Math.PI;

      // Calculate today angle for ongoing phases
      let todayAngle: number | undefined;
      if (isOngoing) {
        const daysToToday = this.daysBetweenDates(birthLocalDate, today);
        todayAngle = (daysToToday / totalDays) * 2 * Math.PI;
      }

      // Apply preset values (phase values take precedence over preset)
      let resolvedColor = phase.color;
      let resolvedPattern = phase.pattern;
      let resolvedOpacity = phase.opacity;
      let resolvedIcon = phase.icon;

      if (phase.preset) {
        const preset = presetMap.get(phase.preset.toLowerCase());
        if (preset) {
          // Only use preset value if phase doesn't have explicit value
          // For color: 'blue' is the default, so only override if preset has different color
          if (phase.color === 'blue' && preset.color !== 'blue') {
            resolvedColor = preset.color;
          }
          if (resolvedPattern === undefined && preset.pattern !== undefined) {
            resolvedPattern = preset.pattern;
          }
          if (resolvedOpacity === undefined && preset.opacity !== undefined) {
            resolvedOpacity = preset.opacity;
          }
          if (resolvedIcon === undefined && preset.icon !== undefined) {
            resolvedIcon = preset.icon;
          }
        }
      }

      // Get hex color
      const { RING_COLORS } = require('../../core/domain/types');
      const hexColor = RING_COLORS[resolvedColor] || RING_COLORS.blue;

      return {
        id: phase.filePath,
        filePath: phase.filePath,
        label: phase.label,
        startAngle,
        endAngle,
        color: hexColor,
        entries: [],
        isOngoing,
        todayAngle,
        category: phase.category,
        // Visual options (resolved with presets)
        pattern: resolvedPattern,
        opacity: resolvedOpacity,
        fade: phase.fade,
        icon: resolvedIcon,
      };
    });
  }

  // ============================================================================
  // Spanning Arcs (Multi-Day Events for Annual View)
  // ============================================================================

  /**
   * Loads spanning arcs (multi-day events) from a folder for the annual view.
   *
   * Each file in the folder should have YAML frontmatter with configurable
   * date properties. Events that overlap with the specified year are included.
   *
   * @param folder - The folder path to load events from
   * @param year - The year to filter events for
   * @param config - Field name configuration
   * @returns Array of rendered segments with angles for the year ring
   */
  loadSpanningArcs(
    folder: string,
    year: number,
    config: {
      startDateField: string;
      endDateField: string;
      colorField: string;
      labelField: string;
    } = {
      startDateField: 'radcal-start',
      endDateField: 'radcal-end',
      colorField: 'radcal-color',
      labelField: 'radcal-label',
    },
    presets?: import('../../core/domain/types').PresetConfig[]
  ): RenderedSegment[] {
    if (!folder) return [];

    const files = this.vaultRepository.getAllMarkdownFiles();
    const segments: RenderedSegment[] = [];

    // Build preset lookup map
    const presetMap = new Map<string, import('../../core/domain/types').PresetConfig>();
    if (presets) {
      for (const preset of presets) {
        presetMap.set(preset.name.toLowerCase(), preset);
      }
    }

    // Filter files in the specified folder
    const folderPrefix = folder.endsWith('/') ? folder : `${folder}/`;
    const folderFiles = files.filter(
      (f) => f.path === `${folder}.md` || f.path.startsWith(folderPrefix)
    );

    const yearStart = createLocalDate(year, 1, 1);
    const yearEnd = createLocalDate(year, 12, 31);

    for (const fileInfo of folderFiles) {
      const metadata = this.metadataRepository.getMetadataByPath(fileInfo.path);
      const frontmatter = metadata?.frontmatter;

      if (!frontmatter) continue;

      // Parse start date
      const startStr = frontmatter[config.startDateField];
      if (!startStr || typeof startStr !== 'string') continue;

      const startDate = this.parseYAMLDate(startStr);
      if (!startDate) continue;

      // Parse end date (required for spanning arcs)
      const endStr = frontmatter[config.endDateField];
      let endDate: LocalDate | null = null;
      if (endStr && typeof endStr === 'string' && endStr.trim() !== '') {
        endDate = this.parseYAMLDate(endStr);
      }

      // If no end date, treat as single-day event
      if (!endDate) {
        endDate = startDate;
      }

      // Check if event overlaps with the year
      if (endDate.year < year || startDate.year > year) {
        continue; // Event doesn't overlap with this year
      }

      // Check if event crosses year boundaries
      const continuesFromPreviousYear = this.compareDates(startDate, yearStart) < 0;
      const continuesIntoNextYear = this.compareDates(endDate, yearEnd) > 0;

      // Clamp dates to the year boundaries
      const clampedStart = continuesFromPreviousYear ? yearStart : startDate;
      const clampedEnd = continuesIntoNextYear ? yearEnd : endDate;

      // Get color (undefined if not set - allows ring color fallback)
      const colorStr = frontmatter[config.colorField];
      const color: RingColorName | undefined = this.isValidColor(colorStr) ? colorStr : undefined;

      // Get label (default to filename)
      const label = frontmatter[config.labelField] || fileInfo.basename;

      // Convert dates to angles (0 = Jan 1, 2π = Dec 31)
      // For cross-year arcs, extend to full year boundary
      const startAngle = continuesFromPreviousYear ? 0 : this.dateToYearAngle(clampedStart, year);
      const endAngle = continuesIntoNextYear ? 2 * Math.PI : this.dateToYearAngle(clampedEnd, year);

      // RING_COLORS is needed for preset color resolution
      const { RING_COLORS } = require('../../core/domain/types');

      // Calculate duration using original dates (not clamped)
      const durationDays = daysBetween(startDate, endDate) + 1; // +1 to include both start and end day

      // Parse visual options
      const patternStr = frontmatter['radcal-pattern'];
      const pattern: PatternName | undefined = this.isValidPattern(patternStr) ? patternStr : undefined;

      const opacityValue = frontmatter['radcal-opacity'];
      let opacity: number | undefined;
      if (typeof opacityValue === 'number' && opacityValue >= 0 && opacityValue <= 100) {
        opacity = opacityValue;
      } else if (typeof opacityValue === 'string') {
        const parsed = parseInt(opacityValue, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          opacity = parsed;
        }
      }

      const fadeValue = frontmatter['radcal-fade'];
      const fade = fadeValue === true || fadeValue === 'true';

      // Get icon (emoji/symbol)
      const iconValue = frontmatter['radcal-icon'];
      const icon = typeof iconValue === 'string' && iconValue.trim() ? iconValue.trim() : undefined;

      // Get preset name
      const presetValue = frontmatter['radcal-preset'];
      const presetName = typeof presetValue === 'string' && presetValue.trim() ? presetValue.trim().toLowerCase() : undefined;

      // Apply preset values (explicit values take precedence)
      let resolvedColor = color;
      let resolvedPattern = pattern;
      let resolvedOpacity = opacity;
      let resolvedIcon = icon;

      if (presetName) {
        const preset = presetMap.get(presetName);
        if (preset) {
          if (resolvedColor === undefined) {
            resolvedColor = preset.color;
          }
          if (resolvedPattern === undefined && preset.pattern !== undefined) {
            resolvedPattern = preset.pattern;
          }
          if (resolvedOpacity === undefined && preset.opacity !== undefined) {
            resolvedOpacity = preset.opacity;
          }
          if (resolvedIcon === undefined && preset.icon !== undefined) {
            resolvedIcon = preset.icon;
          }
        }
      }

      // Get hex color only if color was resolved
      const resolvedHexColor = resolvedColor ? RING_COLORS[resolvedColor] : undefined;

      segments.push({
        id: fileInfo.path,
        filePath: fileInfo.path,
        label: String(label),
        startAngle,
        endAngle,
        color: resolvedHexColor, // undefined means use ring's fallback color
        entries: [],
        continuesFromPreviousYear,
        continuesIntoNextYear,
        // Store original dates and duration for tooltip display
        startDate: { year: startDate.year, month: startDate.month, day: startDate.day },
        endDate: { year: endDate.year, month: endDate.month, day: endDate.day },
        durationDays,
        // Visual options (resolved with presets)
        pattern: resolvedPattern,
        opacity: resolvedOpacity,
        fade,
        icon: resolvedIcon,
      });
    }

    // Sort by start angle
    return segments.sort((a, b) => a.startAngle - b.startAngle);
  }

  /**
   * Loads all files with radcal-showInAnnual: true for the annual view.
   *
   * Similar to loadSpanningArcs but not restricted to a folder.
   * Files must have radcal-start and optionally radcal-end.
   *
   * @param year - The year to filter events for
   * @param presets - Optional array of preset configurations
   * @returns Array of rendered segments with angles for the year ring
   */
  loadShowInAnnualArcs(
    year: number,
    presets?: import('../../core/domain/types').PresetConfig[]
  ): RenderedSegment[] {
    const files = this.vaultRepository.getAllMarkdownFiles();
    const segments: RenderedSegment[] = [];

    // Build preset lookup map
    const presetMap = new Map<string, import('../../core/domain/types').PresetConfig>();
    if (presets) {
      for (const preset of presets) {
        presetMap.set(preset.name.toLowerCase(), preset);
      }
    }

    const yearStart = createLocalDate(year, 1, 1);
    const yearEnd = createLocalDate(year, 12, 31);
    const { RING_COLORS } = require('../../core/domain/types');

    for (const fileInfo of files) {
      const metadata = this.metadataRepository.getMetadataByPath(fileInfo.path);
      const frontmatter = metadata?.frontmatter;

      if (!frontmatter) continue;

      // Check for radcal-showInAnnual: true
      if (frontmatter['radcal-showInAnnual'] !== true) continue;

      // Parse start date
      const startStr = frontmatter['radcal-start'];
      if (!startStr || typeof startStr !== 'string') continue;

      const startDate = this.parseYAMLDate(startStr);
      if (!startDate) continue;

      // Parse end date with three-way logic:
      // - Property NOT SET (undefined) → single-day (end = start)
      // - Property EMPTY (null or "") → open-ended (end = year end)
      // - Property WITH VALUE → parse as date
      const endRaw = frontmatter['radcal-end'];
      let endDate: LocalDate;
      let isOpenEnded = false;

      if (endRaw === undefined) {
        // Property not set → single-day event
        endDate = startDate;
      } else if (endRaw === null || endRaw === '' || (typeof endRaw === 'string' && endRaw.trim() === '')) {
        // Property set but empty → open-ended (extends to year end)
        endDate = yearEnd;
        isOpenEnded = true;
      } else if (typeof endRaw === 'string') {
        // Property has value → parse date
        const parsed = this.parseYAMLDate(endRaw);
        endDate = parsed || startDate;
      } else {
        endDate = startDate;
      }

      // Check if event overlaps with the year
      if (endDate.year < year || startDate.year > year) {
        continue;
      }

      // Check if event crosses year boundaries
      const continuesFromPreviousYear = this.compareDates(startDate, yearStart) < 0;
      const continuesIntoNextYear = isOpenEnded || this.compareDates(endDate, yearEnd) > 0;

      // Clamp dates to the year boundaries
      const clampedStart = continuesFromPreviousYear ? yearStart : startDate;
      const clampedEnd = continuesIntoNextYear ? yearEnd : endDate;

      // Get color
      const colorStr = frontmatter['radcal-color'];
      const color: RingColorName | undefined = this.isValidColor(colorStr) ? colorStr : undefined;

      // Get label
      const label = frontmatter['radcal-label'] || fileInfo.basename;

      // Convert dates to angles
      const startAngle = continuesFromPreviousYear ? 0 : this.dateToYearAngle(clampedStart, year);
      const endAngle = continuesIntoNextYear ? 2 * Math.PI : this.dateToYearAngle(clampedEnd, year);

      // Calculate duration
      const durationDays = daysBetween(startDate, endDate) + 1;

      // Parse visual options
      const patternStr = frontmatter['radcal-pattern'];
      const pattern: PatternName | undefined = this.isValidPattern(patternStr) ? patternStr : undefined;

      const opacityValue = frontmatter['radcal-opacity'];
      let opacity: number | undefined;
      if (typeof opacityValue === 'number' && opacityValue >= 0 && opacityValue <= 100) {
        opacity = opacityValue;
      } else if (typeof opacityValue === 'string') {
        const parsed = parseInt(opacityValue, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          opacity = parsed;
        }
      }

      const fadeValue = frontmatter['radcal-fade'];
      const fade = fadeValue === true || fadeValue === 'true';

      // Get icon
      const iconValue = frontmatter['radcal-icon'];
      const icon = typeof iconValue === 'string' && iconValue.trim() ? iconValue.trim() : undefined;

      // Get preset
      const presetValue = frontmatter['radcal-preset'];
      const presetName = typeof presetValue === 'string' && presetValue.trim() ? presetValue.trim().toLowerCase() : undefined;

      // Apply preset values
      let resolvedColor = color;
      let resolvedPattern = pattern;
      let resolvedOpacity = opacity;
      let resolvedIcon = icon;

      if (presetName) {
        const preset = presetMap.get(presetName);
        if (preset) {
          if (resolvedColor === undefined) {
            resolvedColor = preset.color;
          }
          if (resolvedPattern === undefined && preset.pattern !== undefined) {
            resolvedPattern = preset.pattern;
          }
          if (resolvedOpacity === undefined && preset.opacity !== undefined) {
            resolvedOpacity = preset.opacity;
          }
          if (resolvedIcon === undefined && preset.icon !== undefined) {
            resolvedIcon = preset.icon;
          }
        }
      }

      // Default color if still undefined
      const hexColor = resolvedColor ? RING_COLORS[resolvedColor] : RING_COLORS.blue;

      segments.push({
        id: fileInfo.path,
        filePath: fileInfo.path,
        label: String(label),
        startAngle,
        endAngle,
        color: hexColor,
        entries: [],
        continuesFromPreviousYear,
        continuesIntoNextYear,
        startDate: { year: startDate.year, month: startDate.month, day: startDate.day },
        endDate: { year: endDate.year, month: endDate.month, day: endDate.day },
        durationDays,
        pattern: resolvedPattern,
        opacity: resolvedOpacity,
        fade: fade || isOpenEnded, // Open-ended events get fade effect
        icon: resolvedIcon,
        isOngoing: isOpenEnded,
      });
    }

    return segments.sort((a, b) => a.startAngle - b.startAngle);
  }

  /**
   * Converts a date to an angle for the year ring (0 = Jan 1, 2π = Dec 31)
   */
  private dateToYearAngle(date: LocalDate, year: number): number {
    const daysInYear = this.isLeapYear(year) ? 366 : 365;
    const dayOfYear = this.getDayOfYear(date);
    // Map day 1-365/366 to angle 0-2π
    return ((dayOfYear - 1) / daysInYear) * 2 * Math.PI;
  }

  /**
   * Compares two LocalDate objects
   * Returns negative if a < b, positive if a > b, 0 if equal
   */
  private compareDates(a: LocalDate, b: LocalDate): number {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  }

  /**
   * Calculates days between two dates
   */
  private daysBetweenDates(start: LocalDate, end: LocalDate): number {
    const startMs = new Date(start.year, start.month - 1, start.day).getTime();
    const endMs = new Date(end.year, end.month - 1, end.day).getTime();
    return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
  }

  /**
   * Converts a date to a year fraction (0-1)
   * Jan 1 = 0, Dec 31 = ~1
   */
  private dateToYearFraction(date: LocalDate): number {
    const daysInYear = this.isLeapYear(date.year) ? 366 : 365;
    const dayOfYear = this.getDayOfYear(date);
    return (dayOfYear - 1) / daysInYear;
  }

  /**
   * Checks if a year is a leap year
   */
  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /**
   * Gets the day of year (1-366)
   */
  private getDayOfYear(date: LocalDate): number {
    const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (this.isLeapYear(date.year)) {
      daysPerMonth[1] = 29;
    }

    let dayOfYear = date.day;
    for (let i = 0; i < date.month - 1; i++) {
      dayOfYear += daysPerMonth[i];
    }
    return dayOfYear;
  }

  /**
   * Rebuilds the entry cache from all vault files
   */
  private async rebuildCache(): Promise<void> {
    const files = this.vaultRepository.getAllMarkdownFiles();
    const entries: CalendarEntry[] = [];

    const config = this.getDateExtractionConfig();

    for (const fileInfo of files) {
      const fileEntries = this.createEntriesFromFile(fileInfo, config);
      entries.push(...fileEntries);
    }

    this.entryCache.rebuild(entries);
    this.eventListeners?.onEntriesUpdated();
    this.notifySubscribers();
  }

  /**
   * Creates calendar entries from a file.
   * Returns an array because anniversary entries with both start and end dates
   * create two separate entries (e.g., birthday + death day).
   */
  private createEntriesFromFile(
    fileInfo: FileInfo,
    config: DateExtractionConfig
  ): CalendarEntry[] {
    const metadata = this.metadataRepository.getMetadataByPath(fileInfo.path);
    const frontmatter = metadata?.frontmatter ?? null;

    const { start, end } = this.dateEngine.extractDates(
      fileInfo.name,
      frontmatter,
      config
    );

    // Check for radcal-annual (anniversary entries)
    const isAnniversary = frontmatter?.['radcal-annual'] === true;

    // Convert frontmatter to the expected properties format
    const properties: Record<string, string | number | boolean> = {};
    if (frontmatter) {
      for (const [key, value] of Object.entries(frontmatter)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          properties[key] = value;
        }
      }
    }

    const baseMetadata = {
      tags: metadata?.tags.map((t) => t.name) ?? [],
      folder: fileInfo.folderPath ?? '',
      properties,
    };

    // Handle anniversary entries specially
    if (isAnniversary && frontmatter) {
      const entries: CalendarEntry[] = [];

      // Check for radcal-annual-fix (overrides everything else)
      const radcalFix = this.parseFrontmatterDate(frontmatter['radcal-annual-fix']);

      if (radcalFix) {
        // Only use the fix date, ignore start/end
        entries.push(createCalendarEntry({
          id: `${fileInfo.path}#fix`,
          filePath: fileInfo.path,
          fileName: fileInfo.name,
          displayName: fileInfo.basename,
          startDate: radcalFix,
          endDate: null,
          metadata: baseMetadata,
          isAnniversary: true,
        }));
        return entries;
      }

      // Parse radcal-start
      const radcalStart = this.parseFrontmatterDate(frontmatter['radcal-start']);
      // Parse radcal-end
      const radcalEnd = this.parseFrontmatterDate(frontmatter['radcal-end']);

      // Create entry for start date (e.g., birthday)
      if (radcalStart) {
        entries.push(createCalendarEntry({
          id: `${fileInfo.path}#start`,
          filePath: fileInfo.path,
          fileName: fileInfo.name,
          displayName: fileInfo.basename,
          startDate: radcalStart,
          endDate: null,
          metadata: baseMetadata,
          isAnniversary: true,
        }));
      }

      // Create entry for end date (e.g., death day)
      if (radcalEnd) {
        entries.push(createCalendarEntry({
          id: `${fileInfo.path}#end`,
          filePath: fileInfo.path,
          fileName: fileInfo.name,
          displayName: fileInfo.basename,
          startDate: radcalEnd,
          endDate: null,
          metadata: baseMetadata,
          isAnniversary: true,
        }));
      }

      // Check additional anniversary properties from settings
      const additionalProps = this.settings.anniversaryDateProperties || [];
      for (const propName of additionalProps) {
        const propDate = this.parseFrontmatterDate(frontmatter[propName]);
        if (propDate) {
          // Use property name as suffix for unique ID
          const propId = propName.toLowerCase().replace(/\s+/g, '-');
          entries.push(createCalendarEntry({
            id: `${fileInfo.path}#${propId}`,
            filePath: fileInfo.path,
            fileName: fileInfo.name,
            displayName: fileInfo.basename,
            startDate: propDate,
            endDate: null,
            metadata: baseMetadata,
            isAnniversary: true,
          }));
        }
      }

      // Fallback: if no specific anniversary date found, use normal start date
      if (entries.length === 0 && start) {
        entries.push(createCalendarEntry({
          id: `${fileInfo.path}#fallback`,
          filePath: fileInfo.path,
          fileName: fileInfo.name,
          displayName: fileInfo.basename,
          startDate: start,
          endDate: null,
          metadata: baseMetadata,
          isAnniversary: true,
        }));
      }

      return entries;
    }

    // Normal (non-anniversary) entry
    if (!start) {
      return [];
    }

    return [createCalendarEntry({
      id: fileInfo.path,
      filePath: fileInfo.path,
      fileName: fileInfo.name,
      displayName: fileInfo.basename,
      startDate: start,
      endDate: end,
      metadata: baseMetadata,
      isAnniversary: false,
    })];
  }

  /**
   * Parses a frontmatter date value (string or Date object)
   */
  private parseFrontmatterDate(value: unknown): LocalDate | null {
    if (!value) return null;

    if (typeof value === 'string') {
      return this.parseYAMLDate(value);
    }

    if (value instanceof Date) {
      return createLocalDate(
        value.getFullYear(),
        value.getMonth() + 1,
        value.getDate()
      );
    }

    return null;
  }

  /**
   * Gets the date extraction config from settings
   */
  private getDateExtractionConfig(): DateExtractionConfig {
    return {
      startSources: this.settings.dateProperties,
      endSources: this.settings.endDateProperties,
      priorities:
        this.settings.datePriority === 'property'
          ? ['properties', 'filename']
          : ['filename', 'properties'],
    };
  }

  /**
   * Formats a daily note filename
   */
  private formatDailyNoteFilename(date: LocalDate, format: string): string {
    return format
      .replace('YYYY', String(date.year))
      .replace('MM', String(date.month).padStart(2, '0'))
      .replace('DD', String(date.day).padStart(2, '0'));
  }

  /**
   * Sets up the metadata change listener
   */
  private setupMetadataListener(): void {
    this.unregisterMetadataListener = this.metadataRepository.onMetadataChange(
      (file: TFile) => {
        this.handleFileChange(file.path);
      }
    );
  }

  /**
   * Handles a file change
   */
  private handleFileChange(filePath: string): void {
    const fileInfo = this.vaultRepository.getAllMarkdownFiles().find(
      (f) => f.path === filePath
    );

    if (!fileInfo) {
      // File was deleted - remove all entries for this file
      this.entryCache.removeEntry(filePath);
      this.entryCache.removeEntry(`${filePath}#start`);
      this.entryCache.removeEntry(`${filePath}#end`);
      this.entryCache.removeEntry(`${filePath}#fix`);
      this.entryCache.removeEntry(`${filePath}#fallback`);
      // Also remove any custom property entries
      const additionalProps = this.settings.anniversaryDateProperties || [];
      for (const propName of additionalProps) {
        const propId = propName.toLowerCase().replace(/\s+/g, '-');
        this.entryCache.removeEntry(`${filePath}#${propId}`);
      }
    } else {
      // File was added or modified - remove old entries first
      this.entryCache.removeEntry(filePath);
      this.entryCache.removeEntry(`${filePath}#start`);
      this.entryCache.removeEntry(`${filePath}#end`);
      this.entryCache.removeEntry(`${filePath}#fix`);
      this.entryCache.removeEntry(`${filePath}#fallback`);
      // Also remove any custom property entries
      const additionalProps = this.settings.anniversaryDateProperties || [];
      for (const propName of additionalProps) {
        const propId = propName.toLowerCase().replace(/\s+/g, '-');
        this.entryCache.removeEntry(`${filePath}#${propId}`);
      }

      // Add new entries
      const config = this.getDateExtractionConfig();
      const entries = this.createEntriesFromFile(fileInfo, config);

      for (const entry of entries) {
        this.entryCache.addEntry(entry);
      }
    }

    this.eventListeners?.onEntriesUpdated();
    this.notifySubscribers();
  }
}
