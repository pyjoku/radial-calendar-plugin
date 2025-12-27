/**
 * RadialCalendarView - Circular Calendar View for Obsidian
 *
 * Displays the entire year as a radial/circular visualization:
 * - 12 month segments arranged in a circle (like a clock)
 * - Days shown as arcs within each month segment
 * - Notes displayed as colored indicators on day arcs
 * - Interactive hover and click for navigation
 */

import { ItemView, WorkspaceLeaf, Menu, TFile } from 'obsidian';
import type { CalendarService } from '../../application/services/CalendarService';
import type { CalendarEntry } from '../../core/domain/models/CalendarEntry';
import type { LocalDate } from '../../core/domain/models/LocalDate';
import { getToday, createLocalDate, getWeekday, getDaysInMonth } from '../../core/domain/models/LocalDate';
import type { RadialCalendarSettings, RingConfig, OuterSegmentConfig, LifeActConfig } from '../../core/domain/types';
import {
  RING_COLORS,
  PREDEFINED_SEASONS,
  PREDEFINED_QUARTERS,
  PREDEFINED_SEMESTERS,
  generate10DayPhases,
  generateWeekSegments,
} from '../../core/domain/types';

export const VIEW_TYPE_RADIAL_CALENDAR = 'radial-calendar-plugin';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// SVG Constants
const SVG_SIZE = 800;
const CENTER = SVG_SIZE / 2;
const OUTER_RADIUS = 380;
const INNER_RADIUS = 120;
const MONTH_LABEL_RADIUS = 100;
const DAY_RING_WIDTH = (OUTER_RADIUS - INNER_RADIUS) / 31; // Approximate width per day ring
const RING_GAP = 4; // Gap between rings in pixels
const MIN_RING_WIDTH = 20; // Minimum width for a ring

// Outer segment constants
const SEGMENT_TICK_INNER = OUTER_RADIUS + 2;  // Start of tick mark
const SEGMENT_TICK_OUTER = OUTER_RADIUS + 8;  // End of tick mark
const SEGMENT_LABEL_RADIUS = OUTER_RADIUS + 14; // Position for labels

/**
 * Calculated radii for a ring
 */
interface RingRadii {
  innerRadius: number;
  outerRadius: number;
}

export interface RadialCalendarViewConfig {
  service: CalendarService;
  openFile: (path: string) => Promise<void>;
  settings: RadialCalendarSettings;
  onSettingsChange: (settings: RadialCalendarSettings) => Promise<void>;
}

export class RadialCalendarView extends ItemView {
  private config: RadialCalendarViewConfig | null = null;
  private containerEl_: HTMLElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private tooltipEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_RADIAL_CALENDAR;
  }

  getDisplayText(): string {
    return 'Radial Calendar';
  }

  getIcon(): string {
    return 'circle';
  }

  initialize(config: RadialCalendarViewConfig): void {
    this.config = config;
    this.config.service.setEventListeners({
      onEntriesUpdated: () => this.render(),
      onYearChanged: () => this.render(),
    });
  }

  async onOpen(): Promise<void> {
    this.containerEl_ = this.contentEl;
    this.containerEl_.addClass('radial-calendar-plugin');
    this.render();
  }

  async onClose(): Promise<void> {
    this.containerEl_?.empty();
    this.containerEl_ = null;
    this.svgEl = null;
    this.tooltipEl = null;
  }

  render(): void {
    if (!this.containerEl_ || !this.config) return;

    this.containerEl_.empty();

    const service = this.config.service;
    const year = service.getCurrentYear();

    // Create container
    const container = this.containerEl_.createDiv({ cls: 'rc-container' });

    // Header with navigation
    this.renderHeader(container, year);

    // SVG wrapper
    const wrapper = container.createDiv({ cls: 'rc-wrapper' });

    // Create SVG
    this.renderRadialCalendar(wrapper, year);

    // Tooltip element
    this.tooltipEl = container.createDiv({ cls: 'rc-tooltip' });
    this.tooltipEl.style.display = 'none';
  }

  private renderHeader(container: HTMLElement, year: number): void {
    if (!this.config) return;

    const header = container.createDiv({ cls: 'rc-header' });

    // Previous year button
    const prevBtn = header.createEl('button', {
      text: '\u2190',
      cls: 'rc-nav-btn',
      attr: { 'aria-label': 'Previous year' },
    });
    prevBtn.addEventListener('click', () => {
      this.config?.service.previousYear();
    });

    // Year display
    header.createEl('span', {
      text: String(year),
      cls: 'rc-year-title',
    });

    // Next year button
    const nextBtn = header.createEl('button', {
      text: '\u2192',
      cls: 'rc-nav-btn',
      attr: { 'aria-label': 'Next year' },
    });
    nextBtn.addEventListener('click', () => {
      this.config?.service.nextYear();
    });

    // Today button
    const todayBtn = header.createEl('button', {
      text: 'Today',
      cls: 'rc-nav-btn rc-today-btn',
      attr: { 'aria-label': 'Go to today' },
    });
    todayBtn.addEventListener('click', () => {
      this.config?.service.goToToday();
    });

    // View mode toggle
    this.renderViewModeToggle(header);
  }

  private renderViewModeToggle(header: HTMLElement): void {
    if (!this.config) return;

    const currentView = this.config.settings.currentView;

    const toggleContainer = header.createDiv({ cls: 'rc-view-toggle' });

    // Annual view button
    const annualBtn = toggleContainer.createEl('button', {
      text: 'Jahresansicht',
      cls: `rc-toggle-btn ${currentView === 'annual' ? 'rc-toggle-btn--active' : ''}`,
      attr: { 'aria-label': 'Switch to annual view' },
    });
    annualBtn.addEventListener('click', async () => {
      if (this.config && this.config.settings.currentView !== 'annual') {
        const newSettings = { ...this.config.settings, currentView: 'annual' as const };
        await this.config.onSettingsChange(newSettings);
        this.render();
      }
    });

    // Life view button
    const lifeBtn = toggleContainer.createEl('button', {
      text: 'Lebensansicht',
      cls: `rc-toggle-btn ${currentView === 'life' ? 'rc-toggle-btn--active' : ''}`,
      attr: { 'aria-label': 'Switch to life view' },
    });
    lifeBtn.addEventListener('click', async () => {
      if (this.config && this.config.settings.currentView !== 'life') {
        const newSettings = { ...this.config.settings, currentView: 'life' as const };
        await this.config.onSettingsChange(newSettings);
        this.render();
      }
    });
  }

  private renderRadialCalendar(wrapper: HTMLElement, year: number): void {
    if (!this.config) return;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'rc-svg');
    this.svgEl = svg;

    // Background circle
    this.renderBackgroundCircle(svg);

    // Get enabled rings sorted by order (0 = outermost)
    const enabledRings = this.getEnabledRingsSorted();

    if (enabledRings.length === 0) {
      // No rings configured - render single ring with all entries (fallback)
      for (let month = 1; month <= 12; month++) {
        this.renderMonthSegment(svg, year, month);
      }
    } else {
      // Calculate ring radii based on number of rings
      const ringRadiiMap = this.calculateRingRadii(enabledRings.length);

      // Render each ring
      for (const ring of enabledRings) {
        const radii = ringRadiiMap.get(ring.order);
        if (radii) {
          this.renderRing(svg, year, ring, radii);
        }
      }
    }

    // Render month separators (spanning all rings)
    for (let month = 1; month <= 12; month++) {
      this.renderMonthSeparator(svg, this.monthToAngle(month));
    }

    // Render outer segments (ticks with labels)
    this.renderOuterSegments(svg, year);

    // Render center with year
    this.renderCenter(svg, year);

    // Render month labels
    this.renderMonthLabels(svg);

    // Render today marker
    this.renderTodayMarker(svg, year);

    wrapper.appendChild(svg);
  }

  /**
   * Gets enabled rings sorted by order (0 = outermost, higher = inner)
   */
  private getEnabledRingsSorted(): RingConfig[] {
    if (!this.config) return [];

    return this.config.settings.rings
      .filter(ring => ring.enabled)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Calculates radii for each ring based on total number of enabled rings
   * Order 0 = outermost ring, higher orders = inner rings
   */
  private calculateRingRadii(ringCount: number): Map<number, RingRadii> {
    const radiiMap = new Map<number, RingRadii>();

    if (ringCount === 0) return radiiMap;

    // Available space for rings (excluding gaps)
    const totalGapSpace = (ringCount - 1) * RING_GAP;
    const availableSpace = OUTER_RADIUS - INNER_RADIUS - totalGapSpace;
    const ringWidth = Math.max(MIN_RING_WIDTH, availableSpace / ringCount);

    // Calculate radii for each ring order
    // Order 0 = outermost, so it starts at OUTER_RADIUS
    for (let order = 0; order < ringCount; order++) {
      const outerRadius = OUTER_RADIUS - (order * (ringWidth + RING_GAP));
      const innerRadius = outerRadius - ringWidth;

      radiiMap.set(order, {
        outerRadius,
        innerRadius,
      });
    }

    return radiiMap;
  }

  /**
   * Renders a single ring with its entries
   */
  private renderRing(
    svg: SVGSVGElement,
    year: number,
    ring: RingConfig,
    radii: RingRadii
  ): void {
    if (!this.config) return;

    const ringColor = RING_COLORS[ring.color] || RING_COLORS.blue;

    // Render each month segment for this ring
    for (let month = 1; month <= 12; month++) {
      this.renderRingMonthSegment(svg, year, month, ring, radii, ringColor);
    }
  }

  /**
   * Renders a month segment for a specific ring
   */
  private renderRingMonthSegment(
    svg: SVGSVGElement,
    year: number,
    month: number,
    ring: RingConfig,
    radii: RingRadii,
    ringColor: string
  ): void {
    if (!this.config) return;

    const daysInMonth = getDaysInMonth(year, month);
    const startAngle = this.monthToAngle(month);
    const monthArcSpan = Math.PI / 6; // 30 degrees per month
    const dayArcSpan = monthArcSpan / daysInMonth;

    const today = getToday();
    const isCurrentMonth = today.year === year && today.month === month;

    // Get all entries and filter by ring folder
    const allEntries = this.config.service.getEntriesForDate(createLocalDate(year, month, 1));

    // Render each day as an arc
    for (let day = 1; day <= daysInMonth; day++) {
      const date = createLocalDate(year, month, day);
      const dayOfWeek = getWeekday(date);
      const isToday = isCurrentMonth && today.day === day;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // Calculate day arc position
      const dayStartAngle = startAngle + (day - 1) * dayArcSpan;
      const dayEndAngle = dayStartAngle + dayArcSpan - 0.002; // Small gap

      // Get entries for this date filtered by ring folder
      const entries = this.getEntriesForRing(date, ring);

      this.renderRingDayArc(
        svg,
        date,
        dayStartAngle,
        dayEndAngle,
        isToday,
        isWeekend,
        entries,
        radii,
        ringColor,
        ring
      );
    }
  }

  /**
   * Gets entries for a specific date filtered by ring folder
   */
  private getEntriesForRing(date: LocalDate, ring: RingConfig): readonly CalendarEntry[] {
    if (!this.config) return [];

    const allEntries = this.config.service.getEntriesForDate(date);

    // If no folder specified, return all entries
    if (!ring.folder || ring.folder.trim() === '') {
      return allEntries;
    }

    // Filter entries by folder (check if entry's folder starts with ring folder)
    const normalizedRingFolder = ring.folder.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes

    return allEntries.filter(entry => {
      const entryFolder = entry.metadata.folder || '';
      const normalizedEntryFolder = entryFolder.replace(/^\/+|\/+$/g, '');

      // Match if entry is in the ring folder or a subfolder
      return normalizedEntryFolder === normalizedRingFolder ||
             normalizedEntryFolder.startsWith(normalizedRingFolder + '/');
    });
  }

  /**
   * Renders a day arc for a specific ring
   */
  private renderRingDayArc(
    svg: SVGSVGElement,
    date: LocalDate,
    startAngle: number,
    endAngle: number,
    isToday: boolean,
    isWeekend: boolean,
    entries: readonly CalendarEntry[],
    radii: RingRadii,
    ringColor: string,
    ring: RingConfig
  ): void {
    if (!this.config) return;

    // Create arc path
    const path = this.createArcPath(radii.innerRadius, radii.outerRadius, startAngle, endAngle);

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', path);

    const classes = ['rc-day-arc', `rc-ring-${ring.order}`];
    if (isToday) classes.push('rc-day-arc--today');
    if (isWeekend) classes.push('rc-day-arc--weekend');
    if (entries.length > 0) classes.push('rc-day-arc--has-notes');
    if (entries.length > 3) classes.push('rc-day-arc--many-notes');

    arc.setAttribute('class', classes.join(' '));
    arc.setAttribute('data-date', `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`);
    arc.setAttribute('data-ring', ring.id);

    // Apply ring color for entries
    if (entries.length > 0) {
      arc.style.fill = ringColor;
      arc.style.fillOpacity = '0.6';
    }

    // Click handler
    arc.addEventListener('click', async (e) => {
      e.preventDefault();
      if (entries.length > 0) {
        // If there are entries, show context menu
        this.showDayContextMenu(e, date, entries);
      } else {
        // Otherwise open/create daily note
        await this.config?.service.openDailyNote(date);
      }
    });

    // Hover handlers for tooltip
    arc.addEventListener('mouseenter', (e) => {
      this.showRingTooltip(e, date, entries, ring);
    });

    arc.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    // Context menu
    arc.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showDayContextMenu(e, date, entries);
    });

    svg.appendChild(arc);

    // Render note indicators as smaller arcs if there are entries
    if (entries.length > 0) {
      this.renderRingNoteIndicators(svg, startAngle, endAngle, entries, radii, ringColor);
    }
  }

  /**
   * Renders note indicators for a specific ring
   */
  private renderRingNoteIndicators(
    svg: SVGSVGElement,
    startAngle: number,
    endAngle: number,
    entries: readonly CalendarEntry[],
    radii: RingRadii,
    ringColor: string
  ): void {
    const indicatorWidth = Math.min(10, (radii.outerRadius - radii.innerRadius) * 0.3);
    const indicatorInnerR = radii.outerRadius - indicatorWidth;
    const indicatorOuterR = radii.outerRadius - 2;

    // Show up to 3 note indicators
    const maxIndicators = Math.min(entries.length, 3);
    const indicatorSpan = (endAngle - startAngle) / maxIndicators;

    for (let i = 0; i < maxIndicators; i++) {
      const indStart = startAngle + i * indicatorSpan + 0.001;
      const indEnd = indStart + indicatorSpan - 0.002;

      const path = this.createArcPath(indicatorInnerR, indicatorOuterR, indStart, indEnd);
      const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      indicator.setAttribute('d', path);
      indicator.setAttribute('class', 'rc-note-indicator');
      indicator.style.fill = ringColor;
      svg.appendChild(indicator);
    }
  }

  /**
   * Shows tooltip with ring-specific information
   */
  private showRingTooltip(
    event: MouseEvent,
    date: LocalDate,
    entries: readonly CalendarEntry[],
    ring: RingConfig
  ): void {
    if (!this.tooltipEl) return;

    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][getWeekday(date)];
    const dateStr = `${dayName}, ${FULL_MONTH_NAMES[date.month - 1]} ${date.day}, ${date.year}`;

    let content = `<div class="rc-tooltip-date">${dateStr}</div>`;
    content += `<div class="rc-tooltip-ring" style="color: ${RING_COLORS[ring.color]}">${ring.name}</div>`;

    if (entries.length > 0) {
      content += '<div class="rc-tooltip-notes">';
      for (const entry of entries.slice(0, 5)) {
        content += `<div class="rc-tooltip-note">${entry.displayName}</div>`;
      }
      if (entries.length > 5) {
        content += `<div class="rc-tooltip-more">+${entries.length - 5} more</div>`;
      }
      content += '</div>';
    }

    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';

    // Position tooltip near mouse
    const rect = this.containerEl_?.getBoundingClientRect();
    if (rect) {
      const x = event.clientX - rect.left + 10;
      const y = event.clientY - rect.top + 10;
      this.tooltipEl.style.left = `${x}px`;
      this.tooltipEl.style.top = `${y}px`;
    }
  }

  private renderBackgroundCircle(svg: SVGSVGElement): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(OUTER_RADIUS));
    circle.setAttribute('class', 'rc-background');
    svg.appendChild(circle);
  }

  private renderCenter(svg: SVGSVGElement, year: number): void {
    // Center circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(INNER_RADIUS - 10));
    circle.setAttribute('class', 'rc-center');
    svg.appendChild(circle);

    // Year text in center (handled by CSS/HTML overlay for better text rendering)
  }

  private renderMonthLabels(svg: SVGSVGElement): void {
    for (let month = 0; month < 12; month++) {
      const angle = this.monthToAngle(month + 1) + (Math.PI / 12); // Center of month
      const x = CENTER + MONTH_LABEL_RADIUS * Math.cos(angle - Math.PI / 2);
      const y = CENTER + MONTH_LABEL_RADIUS * Math.sin(angle - Math.PI / 2);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'rc-month-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.textContent = MONTH_NAMES[month];
      svg.appendChild(text);
    }
  }

  private renderMonthSegment(svg: SVGSVGElement, year: number, month: number): void {
    if (!this.config) return;

    const daysInMonth = getDaysInMonth(year, month);
    const startAngle = this.monthToAngle(month);
    const monthArcSpan = Math.PI / 6; // 30 degrees per month
    const dayArcSpan = monthArcSpan / daysInMonth;

    const today = getToday();
    const isCurrentMonth = today.year === year && today.month === month;

    // Render each day as an arc
    for (let day = 1; day <= daysInMonth; day++) {
      const date = createLocalDate(year, month, day);
      const dayOfWeek = getWeekday(date);
      const isToday = isCurrentMonth && today.day === day;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // Calculate day arc position
      const dayStartAngle = startAngle + (day - 1) * dayArcSpan;
      const dayEndAngle = dayStartAngle + dayArcSpan - 0.002; // Small gap

      // Get entries for this date
      const entries = this.config.service.getEntriesForDate(date);

      this.renderDayArc(svg, date, dayStartAngle, dayEndAngle, isToday, isWeekend, entries);
    }

    // Month separator line
    this.renderMonthSeparator(svg, startAngle);
  }

  private renderDayArc(
    svg: SVGSVGElement,
    date: LocalDate,
    startAngle: number,
    endAngle: number,
    isToday: boolean,
    isWeekend: boolean,
    entries: readonly CalendarEntry[]
  ): void {
    if (!this.config) return;

    const innerR = INNER_RADIUS;
    const outerR = OUTER_RADIUS;

    // Create arc path
    const path = this.createArcPath(innerR, outerR, startAngle, endAngle);

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', path);

    const classes = ['rc-day-arc'];
    if (isToday) classes.push('rc-day-arc--today');
    if (isWeekend) classes.push('rc-day-arc--weekend');
    if (entries.length > 0) classes.push('rc-day-arc--has-notes');
    if (entries.length > 3) classes.push('rc-day-arc--many-notes');

    arc.setAttribute('class', classes.join(' '));
    arc.setAttribute('data-date', `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`);

    // Click handler
    arc.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.config?.service.openDailyNote(date);
    });

    // Hover handlers for tooltip
    arc.addEventListener('mouseenter', (e) => {
      this.showTooltip(e, date, entries);
    });

    arc.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    // Context menu
    arc.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (entries.length > 0) {
        this.showDayContextMenu(e, date, entries);
      }
    });

    svg.appendChild(arc);

    // Render note indicators as smaller arcs if there are entries
    if (entries.length > 0) {
      this.renderNoteIndicators(svg, startAngle, endAngle, entries);
    }
  }

  private renderNoteIndicators(
    svg: SVGSVGElement,
    startAngle: number,
    endAngle: number,
    entries: readonly CalendarEntry[]
  ): void {
    const indicatorInnerR = OUTER_RADIUS - 15;
    const indicatorOuterR = OUTER_RADIUS - 5;

    // Show up to 3 note indicators
    const maxIndicators = Math.min(entries.length, 3);
    const indicatorSpan = (endAngle - startAngle) / maxIndicators;

    for (let i = 0; i < maxIndicators; i++) {
      const indStart = startAngle + i * indicatorSpan + 0.001;
      const indEnd = indStart + indicatorSpan - 0.002;

      const path = this.createArcPath(indicatorInnerR, indicatorOuterR, indStart, indEnd);
      const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      indicator.setAttribute('d', path);
      indicator.setAttribute('class', 'rc-note-indicator');
      svg.appendChild(indicator);
    }
  }

  private renderMonthSeparator(svg: SVGSVGElement, angle: number): void {
    const x1 = CENTER + INNER_RADIUS * Math.cos(angle - Math.PI / 2);
    const y1 = CENTER + INNER_RADIUS * Math.sin(angle - Math.PI / 2);
    const x2 = CENTER + OUTER_RADIUS * Math.cos(angle - Math.PI / 2);
    const y2 = CENTER + OUTER_RADIUS * Math.sin(angle - Math.PI / 2);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-month-separator');
    svg.appendChild(line);
  }

  private renderTodayMarker(svg: SVGSVGElement, year: number): void {
    const today = getToday();
    if (today.year !== year) return;

    const daysInMonth = getDaysInMonth(year, today.month);
    const startAngle = this.monthToAngle(today.month);
    const monthArcSpan = Math.PI / 6;
    const dayArcSpan = monthArcSpan / daysInMonth;
    const todayAngle = startAngle + (today.day - 0.5) * dayArcSpan;

    // Draw a line from center to edge for today
    const x1 = CENTER + (INNER_RADIUS - 10) * Math.cos(todayAngle - Math.PI / 2);
    const y1 = CENTER + (INNER_RADIUS - 10) * Math.sin(todayAngle - Math.PI / 2);
    const x2 = CENTER + (OUTER_RADIUS + 5) * Math.cos(todayAngle - Math.PI / 2);
    const y2 = CENTER + (OUTER_RADIUS + 5) * Math.sin(todayAngle - Math.PI / 2);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-today-marker');
    svg.appendChild(line);
  }

  private createArcPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string {
    // Convert to SVG coordinates (0 = top, clockwise)
    const startRad = startAngle - Math.PI / 2;
    const endRad = endAngle - Math.PI / 2;

    const innerStartX = CENTER + innerR * Math.cos(startRad);
    const innerStartY = CENTER + innerR * Math.sin(startRad);
    const innerEndX = CENTER + innerR * Math.cos(endRad);
    const innerEndY = CENTER + innerR * Math.sin(endRad);
    const outerStartX = CENTER + outerR * Math.cos(startRad);
    const outerStartY = CENTER + outerR * Math.sin(startRad);
    const outerEndX = CENTER + outerR * Math.cos(endRad);
    const outerEndY = CENTER + outerR * Math.sin(endRad);

    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    return `
      M ${innerStartX} ${innerStartY}
      L ${outerStartX} ${outerStartY}
      A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}
      L ${innerEndX} ${innerEndY}
      A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}
      Z
    `;
  }

  private monthToAngle(month: number): number {
    // January starts at top (12 o'clock position)
    // Each month is 30 degrees (PI/6 radians)
    return ((month - 1) * Math.PI) / 6;
  }

  private showTooltip(event: MouseEvent, date: LocalDate, entries: readonly CalendarEntry[]): void {
    if (!this.tooltipEl) return;

    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][getWeekday(date)];
    const dateStr = `${dayName}, ${FULL_MONTH_NAMES[date.month - 1]} ${date.day}, ${date.year}`;

    let content = `<div class="rc-tooltip-date">${dateStr}</div>`;

    if (entries.length > 0) {
      content += '<div class="rc-tooltip-notes">';
      for (const entry of entries.slice(0, 5)) {
        content += `<div class="rc-tooltip-note">${entry.displayName}</div>`;
      }
      if (entries.length > 5) {
        content += `<div class="rc-tooltip-more">+${entries.length - 5} more</div>`;
      }
      content += '</div>';
    }

    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';

    // Position tooltip near mouse
    const rect = this.containerEl_?.getBoundingClientRect();
    if (rect) {
      const x = event.clientX - rect.left + 10;
      const y = event.clientY - rect.top + 10;
      this.tooltipEl.style.left = `${x}px`;
      this.tooltipEl.style.top = `${y}px`;
    }
  }

  private hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  private showDayContextMenu(event: MouseEvent, date: LocalDate, entries: readonly CalendarEntry[]): void {
    if (!this.config) return;

    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle(`Open ${FULL_MONTH_NAMES[date.month - 1]} ${date.day}`)
        .setIcon('calendar')
        .onClick(async () => {
          await this.config?.service.openDailyNote(date);
        });
    });

    menu.addSeparator();

    for (const entry of entries.slice(0, 10)) {
      menu.addItem((item) => {
        item
          .setTitle(entry.displayName)
          .setIcon('file')
          .onClick(() => {
            this.config?.openFile(entry.filePath);
          });
      });
    }

    if (entries.length > 10) {
      menu.addItem((item) => {
        item.setTitle(`+${entries.length - 10} more...`).setDisabled(true);
      });
    }

    menu.showAtMouseEvent(event);
  }

  // ============================================================================
  // Outer Segment Rendering
  // ============================================================================

  /**
   * Renders outer segment tick marks and labels
   */
  private renderOuterSegments(svg: SVGSVGElement, year: number): void {
    if (!this.config) return;

    const segments = this.getSegmentsForCurrentView();
    if (segments.length === 0) return;

    for (const segment of segments) {
      this.renderSegmentTick(svg, segment, year);
    }
  }

  /**
   * Gets the segments based on current view and settings
   */
  private getSegmentsForCurrentView(): OuterSegmentConfig[] {
    if (!this.config) return [];

    const settings = this.config.settings;

    // For now, only support annual view segments
    if (settings.currentView === 'life') {
      // Convert life acts to segment format
      return this.lifeActsToSegments(settings.lifeActs);
    }

    switch (settings.annualSegmentType) {
      case 'seasons':
        return PREDEFINED_SEASONS;
      case 'quarters':
        return PREDEFINED_QUARTERS;
      case 'semester':
        return PREDEFINED_SEMESTERS;
      case 'ten-days':
        return generate10DayPhases();
      case 'weeks':
        return generateWeekSegments();
      case 'custom':
        return settings.customSegments;
      case 'none':
      default:
        return [];
    }
  }

  /**
   * Converts life acts to outer segment format
   */
  private lifeActsToSegments(lifeActs: readonly LifeActConfig[]): OuterSegmentConfig[] {
    if (!this.config) return [];

    const { birthYear, expectedLifespan } = this.config.settings;
    const totalYears = expectedLifespan;

    // Convert age-based life acts to day-of-year equivalent for positioning
    return lifeActs.map(act => {
      // Map age to "day of life" (treating life like a year)
      const startDay = Math.floor((act.startAge / totalYears) * 365) + 1;
      const endDay = Math.floor((act.endAge / totalYears) * 365);

      return {
        id: act.id,
        label: act.label,
        startDay,
        endDay,
        color: act.color,
      };
    });
  }

  /**
   * Renders a single segment tick and label
   */
  private renderSegmentTick(svg: SVGSVGElement, segment: OuterSegmentConfig, year: number): void {
    if (!this.config) return;

    const showLabels = this.config.settings.showSegmentLabels;

    // Calculate angle for start position
    const startAngle = this.dayOfYearToAngle(segment.startDay);
    const endAngle = segment.endDay > segment.startDay
      ? this.dayOfYearToAngle(segment.endDay)
      : this.dayOfYearToAngle(segment.endDay) + 2 * Math.PI; // Handle wrap-around

    // Calculate tick position
    const tickAngle = startAngle - Math.PI / 2; // SVG coordinate adjustment
    const x1 = CENTER + SEGMENT_TICK_INNER * Math.cos(tickAngle);
    const y1 = CENTER + SEGMENT_TICK_INNER * Math.sin(tickAngle);
    const x2 = CENTER + SEGMENT_TICK_OUTER * Math.cos(tickAngle);
    const y2 = CENTER + SEGMENT_TICK_OUTER * Math.sin(tickAngle);

    // Render tick line
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', String(x1));
    tick.setAttribute('y1', String(y1));
    tick.setAttribute('x2', String(x2));
    tick.setAttribute('y2', String(y2));
    tick.setAttribute('class', 'rc-segment-tick');

    // Apply custom color if specified
    if (segment.color) {
      tick.style.stroke = RING_COLORS[segment.color];
    }

    svg.appendChild(tick);

    // Render label if enabled
    if (showLabels) {
      // Position label in the middle of the segment
      const midAngle = (startAngle + (segment.endDay > segment.startDay ? endAngle : endAngle - 2 * Math.PI)) / 2;
      const labelAngle = midAngle - Math.PI / 2;
      const labelX = CENTER + SEGMENT_LABEL_RADIUS * Math.cos(labelAngle);
      const labelY = CENTER + SEGMENT_LABEL_RADIUS * Math.sin(labelAngle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(labelX));
      label.setAttribute('y', String(labelY));
      label.setAttribute('class', 'rc-segment-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');

      // Rotate text to follow the circle (radial orientation)
      const rotationAngle = (midAngle * 180) / Math.PI;
      // Flip text if on bottom half to keep it readable
      const adjustedRotation = rotationAngle > 90 && rotationAngle < 270
        ? rotationAngle + 180
        : rotationAngle;
      label.setAttribute('transform', `rotate(${adjustedRotation}, ${labelX}, ${labelY})`);

      if (segment.color) {
        label.style.fill = RING_COLORS[segment.color];
      }

      label.textContent = segment.label;
      svg.appendChild(label);
    }
  }

  /**
   * Converts day of year (1-366) to angle in radians
   * January 1 = 0 radians (top), December 31 = 2π
   */
  private dayOfYearToAngle(dayOfYear: number): number {
    // Map day 1-365 to angle 0-2π
    return ((dayOfYear - 1) / 365) * 2 * Math.PI;
  }
}
