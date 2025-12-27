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
  type App,
  type TFile,
} from 'obsidian';

// Constants for SVG rendering
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

  constructor(controller: QueryController, containerEl: HTMLElement) {
    super(controller);
    this.containerEl = containerEl;
    this.currentYear = new Date().getFullYear();
  }

  /**
   * Called when data is updated - re-render the calendar
   */
  onDataUpdated(): void {
    // Get config values
    this.dateProperty = String(this.config.get('dateProperty') ?? 'date');
    this.color = String(this.config.get('color') ?? 'blue');
    const yearConfig = this.config.get('year');
    if (yearConfig && typeof yearConfig === 'number') {
      this.currentYear = yearConfig;
    }

    // Clear and re-render
    this.containerEl.empty();
    this.containerEl.addClass('radial-calendar-bases-view');

    // Create header with year navigation
    this.renderHeader();

    // Create SVG container
    const svgContainer = this.containerEl.createDiv({ cls: 'rc-bases-svg-container' });
    this.svgEl = this.createSVG();
    svgContainer.appendChild(this.svgEl);

    // Render the calendar
    this.renderCalendar();
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
    this.renderBackgroundCircle();

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
   * Render the background circle
   */
  private renderBackgroundCircle(): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(OUTER_RADIUS));
    circle.setAttribute('class', 'rc-bases-background');
    this.svgEl!.appendChild(circle);
  }

  /**
   * Render month segments (separators)
   */
  private renderMonthSegments(): void {
    for (let month = 0; month < 12; month++) {
      const angle = this.monthToAngle(month) - Math.PI / 2;
      const x1 = CENTER + INNER_RADIUS * Math.cos(angle);
      const y1 = CENTER + INNER_RADIUS * Math.sin(angle);
      const x2 = CENTER + OUTER_RADIUS * Math.cos(angle);
      const y2 = CENTER + OUTER_RADIUS * Math.sin(angle);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'rc-bases-month-separator');
      this.svgEl!.appendChild(line);
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

      // Check if date is in current year
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

    // String date
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;

      // Try YYYY-MM-DD format
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      }
    }

    // Number (timestamp)
    if (typeof value === 'number') {
      return new Date(value);
    }

    // Object with value property (Bases Value type)
    if (typeof value === 'object' && value !== null && 'value' in value) {
      return this.parseDate((value as { value: unknown }).value);
    }

    return null;
  }

  /**
   * Render a day indicator
   */
  private renderDayIndicator(dayOfYear: number, count: number, color: string, entries: BasesEntry[]): void {
    const daysInYear = this.isLeapYear(this.currentYear) ? 366 : 365;
    const startAngle = ((dayOfYear - 1) / daysInYear) * 2 * Math.PI - Math.PI / 2;
    const endAngle = (dayOfYear / daysInYear) * 2 * Math.PI - Math.PI / 2;

    // Create arc path
    const path = this.createArcPath(INNER_RADIUS, OUTER_RADIUS, startAngle, endAngle);
    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', path);
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
      const midAngle = this.monthToAngle(month) + (Math.PI / 12) - Math.PI / 2;
      const x = CENTER + LABEL_RADIUS * Math.cos(midAngle);
      const y = CENTER + LABEL_RADIUS * Math.sin(midAngle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'rc-bases-month-label');
      text.textContent = MONTH_NAMES[month];
      this.svgEl!.appendChild(text);
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

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-bases-today-marker');
    this.svgEl!.appendChild(line);
  }

  /**
   * Render center circle with year
   */
  private renderCenter(): void {
    // Center circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(INNER_RADIUS - 10));
    circle.setAttribute('class', 'rc-bases-center');
    this.svgEl!.appendChild(circle);

    // Year text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(CENTER));
    text.setAttribute('y', String(CENTER));
    text.setAttribute('class', 'rc-bases-center-text');
    text.textContent = String(this.currentYear);
    this.svgEl!.appendChild(text);

    // Entry count
    const entriesInYear = this.data.data.filter(e => {
      const date = this.getEntryDate(e);
      return date && date.getFullYear() === this.currentYear;
    }).length;

    const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    countText.setAttribute('x', String(CENTER));
    countText.setAttribute('y', String(CENTER + 25));
    countText.setAttribute('class', 'rc-bases-entry-count');
    countText.textContent = `${entriesInYear} entries`;
    this.svgEl!.appendChild(countText);
  }

  /**
   * Create an arc path for SVG
   */
  private createArcPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string {
    const x1 = CENTER + innerR * Math.cos(startAngle);
    const y1 = CENTER + innerR * Math.sin(startAngle);
    const x2 = CENTER + outerR * Math.cos(startAngle);
    const y2 = CENTER + outerR * Math.sin(startAngle);
    const x3 = CENTER + outerR * Math.cos(endAngle);
    const y3 = CENTER + outerR * Math.sin(endAngle);
    const x4 = CENTER + innerR * Math.cos(endAngle);
    const y4 = CENTER + innerR * Math.sin(endAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    return [
      `M ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3}`,
      `L ${x4} ${y4}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}`,
      'Z',
    ].join(' ');
  }

  /**
   * Convert month (0-11) to angle
   */
  private monthToAngle(month: number): number {
    return (month / 12) * 2 * Math.PI;
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
