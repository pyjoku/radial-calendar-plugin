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

export interface RadialCalendarViewConfig {
  service: CalendarService;
  openFile: (path: string) => Promise<void>;
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

    // Render month segments
    for (let month = 1; month <= 12; month++) {
      this.renderMonthSegment(svg, year, month);
    }

    // Render center with year
    this.renderCenter(svg, year);

    // Render month labels
    this.renderMonthLabels(svg);

    // Render today marker
    this.renderTodayMarker(svg, year);

    wrapper.appendChild(svg);
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
}
