/**
 * RadialCalendarBasesView - Radial Calendar as a Bases View Type
 *
 * Displays Bases entries on a radial annual calendar.
 * Requires Obsidian 1.10+
 */

import {
  BasesView,
  BasesEntry,
  type QueryController,
} from 'obsidian';
import { createArcPath, monthToAngle0 } from '../svg/SvgArc';
import { createSvgLine, createSvgCircle, createSvgText } from '../svg/SvgHelpers';

// Constants for SVG rendering — BasesView uses a smaller canvas than the main view
const SVG_SIZE = 600;
const CENTER = SVG_SIZE / 2;
const OUTER_RADIUS = (SVG_SIZE / 2) - 30;
const INNER_RADIUS = OUTER_RADIUS - 40;
const LABEL_RADIUS = OUTER_RADIUS + 15;

// Ring colors
const RING_COLORS: Record<string, string> = {
  blue: '#4a90d9',
  green: '#50c878',
  red: '#e74c3c',
  purple: '#9b59b6',
  orange: '#e67e22',
  teal: '#1abc9c',
  pink: '#e91e63',
  yellow: '#f1c40f',
  cyan: '#00bcd4',
  indigo: '#3f51b5',
};

// Color options in same order as registered in plugin (for index lookup)
const COLOR_OPTIONS = ['blue', 'green', 'red', 'purple', 'orange', 'teal', 'pink', 'yellow'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Radial Calendar view for Obsidian Bases
 */
export class RadialCalendarBasesView extends BasesView {
  type = 'radial-calendar';

  private containerEl: HTMLElement;
  private svgEl: SVGSVGElement | null = null;
  private currentYear: number;
  private dateProperty: string = 'date';
  private color: string = 'blue';
  constructor(controller: QueryController, parentEl: HTMLElement) {
    super(controller);
    // Create a child div — never empty/modify the parent scroll container directly
    this.containerEl = parentEl.createDiv('radial-calendar-bases-view');
    this.currentYear = new Date().getFullYear();
  }

  /**
   * Safely extract a string value from config
   * Handles objects, indices, and direct values
   */
  private getConfigString(key: string, defaultValue: string): string {
    const value = this.config.get(key);
    if (value === null || value === undefined) {
      return defaultValue;
    }
    // Direct string - but check if it's a numeric string (index)
    if (typeof value === 'string') {
      // If it looks like an index, convert it
      if (/^\d+$/.test(value) && key === 'color') {
        const index = parseInt(value, 10);
        if (index >= 0 && index < COLOR_OPTIONS.length) {
          return COLOR_OPTIONS[index];
        }
      }
      return value;
    }
    // Number (index from dropdown)
    if (typeof value === 'number') {
      if (key === 'color' && value >= 0 && value < COLOR_OPTIONS.length) {
        return COLOR_OPTIONS[value];
      }
      return defaultValue;
    }
    // Object with value property
    if (typeof value === 'object' && 'value' in value) {
      return String((value as { value: unknown }).value);
    }
    // Object with label property (dropdown option)
    if (typeof value === 'object' && 'label' in value) {
      return String((value as { label: unknown }).label).toLowerCase();
    }
    return defaultValue;
  }

  /**
   * Called by Obsidian whenever there is a configuration or data change
   */
  onDataUpdated(): void {
    try {
      // Get config values - handle various return types from Bases
      this.dateProperty = this.getConfigString('dateProperty', 'date');
      this.color = this.getConfigString('color', 'blue');
      const yearConfig = this.config?.get('year');
      if (yearConfig && typeof yearConfig === 'number') {
        this.currentYear = yearConfig;
      }

      // Clear our container and re-render
      this.containerEl.empty();

      // Create header with year navigation
      this.renderHeader();

      // Create SVG container
      const svgContainer = this.containerEl.createDiv({ cls: 'rc-bases-svg-container' });
      this.svgEl = this.createSVG();
      svgContainer.appendChild(this.svgEl);

      // Render the calendar
      this.renderCalendar();
    } catch (err) {
      console.error('Radial Calendar: render error in BasesView', err);
      try {
        this.containerEl.empty();
        this.containerEl.createDiv({
          cls: 'radial-calendar-bases-view',
          text: `Radial Calendar render error: ${err}`,
        });
      } catch { /* container may be gone */ }
    }
  }

  /**
   * Create the SVG element
   */
  private createSVG(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'rc-bases-calendar');
    return svg;
  }

  /**
   * Render the header with year navigation
   */
  private renderHeader(): void {
    const header = this.containerEl.createDiv({ cls: 'rc-bases-header' });

    // Previous year button
    const prevBtn = header.createEl('button', { cls: 'rc-bases-nav-btn', text: '←' });
    prevBtn.addEventListener('click', () => {
      this.currentYear--;
      this.onDataUpdated();
    });

    // Year display
    header.createSpan({ cls: 'rc-bases-year', text: String(this.currentYear) });

    // Next year button
    const nextBtn = header.createEl('button', { cls: 'rc-bases-nav-btn', text: '→' });
    nextBtn.addEventListener('click', () => {
      this.currentYear++;
      this.onDataUpdated();
    });

    // Today button
    const todayBtn = header.createEl('button', { cls: 'rc-bases-today-btn', text: 'Today' });
    todayBtn.addEventListener('click', () => {
      this.currentYear = new Date().getFullYear();
      this.onDataUpdated();
    });
  }

  /**
   * Render the radial calendar
   */
  private renderCalendar(): void {
    if (!this.svgEl) return;

    // Clear SVG
    this.svgEl.innerHTML = '';

    // Background circle
    this.svgEl.appendChild(createSvgCircle(CENTER, CENTER, OUTER_RADIUS, 'rc-bases-background'));

    // Month segments
    this.renderMonthSegments();

    // Entry indicators
    this.renderEntryIndicators();

    // Month labels
    this.renderMonthLabels();

    // Today marker
    this.renderTodayMarker();

    // Center
    this.renderCenter();
  }

  /**
   * Render month segments (separators)
   */
  private renderMonthSegments(): void {
    for (let month = 0; month < 12; month++) {
      const angle = monthToAngle0(month) - Math.PI / 2;
      const x1 = CENTER + INNER_RADIUS * Math.cos(angle);
      const y1 = CENTER + INNER_RADIUS * Math.sin(angle);
      const x2 = CENTER + OUTER_RADIUS * Math.cos(angle);
      const y2 = CENTER + OUTER_RADIUS * Math.sin(angle);
      this.svgEl!.appendChild(createSvgLine(x1, y1, x2, y2, 'rc-bases-month-separator'));
    }
  }

  /**
   * Render entry indicators based on Bases data
   */
  private renderEntryIndicators(): void {
    const entries = this.data.data;
    const entriesByDay = new Map<number, BasesEntry[]>();

    // Group entries by day of year
    for (const entry of entries) {
      const date = this.getEntryDate(entry);
      if (!date) continue;

      if (date.getFullYear() !== this.currentYear) continue;

      const dayOfYear = this.getDayOfYear(date);
      if (!entriesByDay.has(dayOfYear)) {
        entriesByDay.set(dayOfYear, []);
      }
      entriesByDay.get(dayOfYear)!.push(entry);
    }

    // Render indicators
    const color = RING_COLORS[this.color] || RING_COLORS.blue;

    for (const [dayOfYear, dayEntries] of entriesByDay) {
      this.renderDayIndicator(dayOfYear, dayEntries.length, color, dayEntries);
    }
  }

  /**
   * Get date from a BasesEntry
   */
  private getEntryDate(entry: BasesEntry): Date | null {
    // Try the configured date property
    const dateValue = entry.getValue(this.dateProperty);
    if (dateValue) {
      const date = this.parseDate(dateValue);
      if (date) return date;
    }

    // Try common date property names
    for (const prop of ['date', 'Date', 'created', 'birthday', 'Birthday', 'due', 'Due']) {
      const value = entry.getValue(prop);
      if (value) {
        const date = this.parseDate(value);
        if (date) return date;
      }
    }

    // Try to extract date from filename (e.g., "2022-04-19 Meeting Notes")
    if (entry.file?.basename) {
      const filenameMatch = entry.file.basename.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (filenameMatch) {
        return new Date(
          parseInt(filenameMatch[1]),
          parseInt(filenameMatch[2]) - 1,
          parseInt(filenameMatch[3])
        );
      }
    }

    // Fallback: use file creation date
    if (entry.file?.stat?.ctime) {
      return new Date(entry.file.stat.ctime);
    }

    return null;
  }

  /**
   * Parse a date value from Bases
   */
  private parseDate(value: unknown): Date | null {
    if (!value) return null;

    // Already a Date
    if (value instanceof Date) return value;

    // Luxon DateTime (from Dataview/Bases) - has toJSDate() method
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;

      // Luxon DateTime
      if (typeof obj.toJSDate === 'function') {
        return (obj.toJSDate as () => Date)();
      }

      // Luxon DateTime alternative - has ts (timestamp) property
      if (typeof obj.ts === 'number') {
        return new Date(obj.ts);
      }

      // Object with value property (Bases Value type)
      if ('value' in obj) {
        return this.parseDate(obj.value);
      }

      // Object with path property (Dataview Link) - skip
      if ('path' in obj) {
        return null;
      }
    }

    // String date
    if (typeof value === 'string') {
      // Try YYYY-MM-DD format first (most reliable)
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      }

      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    // Number (timestamp)
    if (typeof value === 'number') {
      return new Date(value);
    }

    return null;
  }

  /**
   * Render a day indicator
   */
  private renderDayIndicator(dayOfYear: number, count: number, color: string, entries: BasesEntry[]): void {
    const daysInYear = this.isLeapYear(this.currentYear) ? 366 : 365;
    // Angles in calendar space (0 = top/Jan 1, clockwise) — createArcPath handles the -PI/2 offset
    const startAngle = ((dayOfYear - 1) / daysInYear) * 2 * Math.PI;
    const endAngle = (dayOfYear / daysInYear) * 2 * Math.PI;

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', createArcPath(CENTER, INNER_RADIUS, OUTER_RADIUS, startAngle, endAngle));
    arc.setAttribute('class', 'rc-bases-entry-indicator');
    arc.style.fill = color;
    arc.style.opacity = Math.min(0.3 + count * 0.2, 1).toString();

    // Add tooltip
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    const entryNames = entries.map(e => e.file?.basename || 'Unknown').join('\n');
    title.textContent = `${count} ${count === 1 ? 'entry' : 'entries'}:\n${entryNames}`;
    arc.appendChild(title);

    // Click handler to open first file
    arc.addEventListener('click', () => {
      if (entries.length > 0 && entries[0].file) {
        this.app.workspace.getLeaf().openFile(entries[0].file);
      }
    });

    arc.style.cursor = 'pointer';
    this.svgEl!.appendChild(arc);
  }

  /**
   * Render month labels
   */
  private renderMonthLabels(): void {
    for (let month = 0; month < 12; month++) {
      const midAngle = monthToAngle0(month) + (Math.PI / 12) - Math.PI / 2;
      const x = CENTER + LABEL_RADIUS * Math.cos(midAngle);
      const y = CENTER + LABEL_RADIUS * Math.sin(midAngle);
      this.svgEl!.appendChild(createSvgText(x, y, MONTH_NAMES[month], 'rc-bases-month-label'));
    }
  }

  /**
   * Render today marker
   */
  private renderTodayMarker(): void {
    const today = new Date();
    if (today.getFullYear() !== this.currentYear) return;

    const dayOfYear = this.getDayOfYear(today);
    const daysInYear = this.isLeapYear(this.currentYear) ? 366 : 365;
    const angle = ((dayOfYear - 0.5) / daysInYear) * 2 * Math.PI - Math.PI / 2;

    const x1 = CENTER + (INNER_RADIUS - 5) * Math.cos(angle);
    const y1 = CENTER + (INNER_RADIUS - 5) * Math.sin(angle);
    const x2 = CENTER + (OUTER_RADIUS + 5) * Math.cos(angle);
    const y2 = CENTER + (OUTER_RADIUS + 5) * Math.sin(angle);
    this.svgEl!.appendChild(createSvgLine(x1, y1, x2, y2, 'rc-bases-today-marker'));
  }

  /**
   * Render center circle with year
   */
  private renderCenter(): void {
    this.svgEl!.appendChild(createSvgCircle(CENTER, CENTER, INNER_RADIUS - 10, 'rc-bases-center'));
    this.svgEl!.appendChild(createSvgText(CENTER, CENTER, String(this.currentYear), 'rc-bases-center-text'));

    // Entry count
    const entriesInYear = this.data.data.filter(e => {
      const date = this.getEntryDate(e);
      return date && date.getFullYear() === this.currentYear;
    }).length;

    this.svgEl!.appendChild(createSvgText(
      CENTER, CENTER + 25,
      `${entriesInYear} entries`,
      'rc-bases-entry-count'
    ));
  }

  /**
   * Get day of year (1-366)
   */
  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * Check if year is leap year
   */
  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }
}

/**
 * Factory function for creating the view
 */
export function createRadialCalendarBasesView(
  controller: QueryController,
  containerEl: HTMLElement
): RadialCalendarBasesView {
  return new RadialCalendarBasesView(controller, containerEl);
}
