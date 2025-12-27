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
import type { LinearCalendarSettings, LifePhase, RingColorName } from '../../core/domain/types';
import { createLocalDate } from '../../core/domain/models/LocalDate';

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
   * Loads life phases from a folder
   *
   * Each file in the folder should have YAML frontmatter with:
   * - phase-start: Start date (YYYY-MM-DD)
   * - phase-end: End date (YYYY-MM-DD) or empty for ongoing
   * - phase-color: Color name
   * - phase-label: Display label
   *
   * @param folder - The folder path to load phases from
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
    if (!folder) return [];

    const files = this.vaultRepository.getAllMarkdownFiles();
    const phases: LifePhase[] = [];

    // Filter files in the specified folder
    const folderPrefix = folder.endsWith('/') ? folder : `${folder}/`;
    const folderFiles = files.filter(
      (f) => f.path === `${folder}.md` || f.path.startsWith(folderPrefix)
    );

    for (const fileInfo of folderFiles) {
      const metadata = this.metadataRepository.getMetadataByPath(fileInfo.path);
      const frontmatter = metadata?.frontmatter;

      if (!frontmatter) continue;

      // Parse start date
      const startStr = frontmatter[config.startDateField];
      if (!startStr || typeof startStr !== 'string') continue;

      const startDate = this.parseYAMLDate(startStr);
      if (!startDate) continue;

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

      phases.push({
        filePath: fileInfo.path,
        label: String(label),
        startDate,
        endDate,
        color,
        category: category ? String(category) : undefined,
      });
    }

    // Sort by start date
    return phases.sort((a, b) => {
      if (a.startDate.year !== b.startDate.year) return a.startDate.year - b.startDate.year;
      if (a.startDate.month !== b.startDate.month) return a.startDate.month - b.startDate.month;
      return a.startDate.day - b.startDate.day;
    });
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
   * @param phases - Array of life phases
   * @param birthYear - Birth year (fallback)
   * @param expectedLifespan - Expected lifespan in years
   * @param birthDate - Optional precise birth date (YYYY-MM-DD)
   * @returns Array of rendered segments with angles
   */
  computeLifePhaseSegments(
    phases: LifePhase[],
    birthYear: number,
    expectedLifespan: number,
    birthDate?: string
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

      // Get hex color
      const { RING_COLORS } = require('../../core/domain/types');
      const hexColor = RING_COLORS[phase.color] || RING_COLORS.blue;

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
    }
  ): import('../../../core/domain/types').RenderedSegment[] {
    if (!folder) return [];

    const files = this.vaultRepository.getAllMarkdownFiles();
    const segments: import('../../../core/domain/types').RenderedSegment[] = [];

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

      // Clamp dates to the year boundaries
      const clampedStart = this.compareDates(startDate, yearStart) < 0 ? yearStart : startDate;
      const clampedEnd = this.compareDates(endDate, yearEnd) > 0 ? yearEnd : endDate;

      // Get color (undefined if not set - allows ring color fallback)
      const colorStr = frontmatter[config.colorField];
      const color: RingColorName | undefined = this.isValidColor(colorStr) ? colorStr : undefined;

      // Get label (default to filename)
      const label = frontmatter[config.labelField] || fileInfo.basename;

      // Convert dates to angles (0 = Jan 1, 2π = Dec 31)
      const startAngle = this.dateToYearAngle(clampedStart, year);
      const endAngle = this.dateToYearAngle(clampedEnd, year);

      // Get hex color only if color was specified in frontmatter
      const { RING_COLORS } = require('../../core/domain/types');
      const hexColor = color ? RING_COLORS[color] : undefined;

      segments.push({
        id: fileInfo.path,
        filePath: fileInfo.path,
        label: String(label),
        startAngle,
        endAngle,
        color: hexColor, // undefined means use ring's fallback color
        entries: [],
      });
    }

    // Sort by start angle
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
      const entry = this.createEntryFromFile(fileInfo, config);
      if (entry) {
        entries.push(entry);
      }
    }

    this.entryCache.rebuild(entries);
    this.eventListeners?.onEntriesUpdated();
  }

  /**
   * Creates a calendar entry from a file
   */
  private createEntryFromFile(
    fileInfo: FileInfo,
    config: DateExtractionConfig
  ): CalendarEntry | null {
    const metadata = this.metadataRepository.getMetadataByPath(fileInfo.path);
    const frontmatter = metadata?.frontmatter ?? null;

    const { start, end } = this.dateEngine.extractDates(
      fileInfo.name,
      frontmatter,
      config
    );

    if (!start) {
      return null;
    }

    // Convert frontmatter to the expected properties format
    const properties: Record<string, string | number | boolean> = {};
    if (frontmatter) {
      for (const [key, value] of Object.entries(frontmatter)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          properties[key] = value;
        }
      }
    }

    return createCalendarEntry({
      id: fileInfo.path,
      filePath: fileInfo.path,
      fileName: fileInfo.name,
      displayName: fileInfo.basename,
      startDate: start,
      endDate: end,
      metadata: {
        tags: metadata?.tags.map((t) => t.name) ?? [],
        folder: fileInfo.folderPath ?? '',
        properties,
      },
    });
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
      // File was deleted
      this.entryCache.removeEntry(filePath);
    } else {
      // File was added or modified
      const config = this.getDateExtractionConfig();
      const entry = this.createEntryFromFile(fileInfo, config);

      if (entry) {
        this.entryCache.addEntry(entry);
      } else {
        this.entryCache.removeEntry(filePath);
      }
    }

    this.eventListeners?.onEntriesUpdated();
  }
}
