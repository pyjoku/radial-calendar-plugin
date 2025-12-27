/**
 * LocalCalendarView - Sidebar view showing current note's position in time
 *
 * Like "Local Graph" but for time - shows where the active note
 * sits in the life cycle and year cycle.
 */

import { ItemView, WorkspaceLeaf, TFile, Menu } from 'obsidian';
import type { CalendarService } from '../../application/services/CalendarService';
import type { CalendarEntry } from '../../core/domain/models/CalendarEntry';
import type { RadialCalendarSettings } from '../../core/domain/types';
import { RING_COLORS } from '../../core/domain/types';
import { getToday, createLocalDate, getDaysInMonth, getWeekday } from '../../core/domain/models/LocalDate';
import type { LocalDate } from '../../core/domain/models/LocalDate';

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const VIEW_TYPE_LOCAL_CALENDAR = 'local-calendar-view';

// Compact SVG dimensions for sidebar
const SVG_SIZE = 300;
const CENTER = SVG_SIZE / 2;
const LIFE_RING_OUTER = 140;
const LIFE_RING_INNER = 115;
const YEAR_RING_OUTER = 105;
const YEAR_RING_INNER = 40;
const CENTER_RADIUS = 35;

export interface LocalCalendarViewConfig {
  service: CalendarService;
  settings: RadialCalendarSettings;
  getActiveFileDate: () => LocalDate | null;
  openFile: (path: string) => Promise<void>;
}

export class LocalCalendarView extends ItemView {
  private config: LocalCalendarViewConfig | null = null;
  private containerEl_: HTMLElement | null = null;
  private svgEl: SVGSVGElement | null = null;
  private activeFileDate: LocalDate | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LOCAL_CALENDAR;
  }

  getDisplayText(): string {
    return 'Local Calendar';
  }

  getIcon(): string {
    return 'clock';
  }

  initialize(config: LocalCalendarViewConfig): void {
    this.config = config;

    // Listen to active file changes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.updateActiveFileDate();
        this.render();
      })
    );

    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        this.updateActiveFileDate();
        this.render();
      })
    );
  }

  async onOpen(): Promise<void> {
    this.containerEl_ = this.contentEl;
    this.containerEl_.addClass('local-calendar-view');
    this.updateActiveFileDate();
    this.render();
  }

  async onClose(): Promise<void> {
    this.containerEl_?.empty();
    this.containerEl_ = null;
    this.svgEl = null;
  }

  private updateActiveFileDate(): void {
    if (!this.config) return;
    this.activeFileDate = this.config.getActiveFileDate();
  }

  render(): void {
    if (!this.containerEl_ || !this.config) return;

    this.containerEl_.empty();

    const container = this.containerEl_.createDiv({ cls: 'lc-container' });

    // Title
    const title = container.createDiv({ cls: 'lc-title' });
    if (this.activeFileDate) {
      title.textContent = `${this.activeFileDate.day}.${this.activeFileDate.month}.${this.activeFileDate.year}`;
    } else {
      title.textContent = 'Keine Datums-Notiz';
    }

    // SVG
    const wrapper = container.createDiv({ cls: 'lc-wrapper' });
    this.renderNestedClock(wrapper);
  }

  private renderNestedClock(wrapper: HTMLElement): void {
    if (!this.config) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'lc-svg');
    this.svgEl = svg;

    const { birthYear, expectedLifespan } = this.config.settings;
    const endYear = birthYear + expectedLifespan;
    const today = getToday();
    const noteDate = this.activeFileDate || today;

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', String(CENTER));
    bg.setAttribute('cy', String(CENTER));
    bg.setAttribute('r', String(LIFE_RING_OUTER));
    bg.setAttribute('class', 'lc-background');
    svg.appendChild(bg);

    // Life Ring
    this.renderLifeRing(svg, birthYear, endYear, noteDate.year, today.year);

    // Year Ring
    this.renderYearRing(svg, noteDate, today);

    // Center
    this.renderCenter(svg, noteDate);

    // Note position markers
    if (this.activeFileDate) {
      this.renderNoteMarkers(svg, birthYear, expectedLifespan, this.activeFileDate);
    }

    // Today markers (if different from note)
    if (!this.activeFileDate ||
        this.activeFileDate.year !== today.year ||
        this.activeFileDate.month !== today.month ||
        this.activeFileDate.day !== today.day) {
      this.renderTodayMarkers(svg, birthYear, expectedLifespan, today);
    }

    wrapper.appendChild(svg);
  }

  private renderLifeRing(
    svg: SVGSVGElement,
    birthYear: number,
    endYear: number,
    noteYear: number,
    todayYear: number
  ): void {
    const totalYears = endYear - birthYear;

    // Simplified life ring - just show segments for decades
    for (let decade = 0; decade < totalYears; decade += 10) {
      const startAngle = (decade / totalYears) * 2 * Math.PI;
      const endAngle = Math.min(((decade + 10) / totalYears) * 2 * Math.PI, 2 * Math.PI) - 0.02;

      const path = this.createArcPath(LIFE_RING_INNER, LIFE_RING_OUTER, startAngle, endAngle);
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arc.setAttribute('d', path);

      const decadeYear = birthYear + decade;
      const isPast = decadeYear + 10 <= todayYear;
      const isCurrent = decadeYear <= todayYear && todayYear < decadeYear + 10;

      let cls = 'lc-life-decade';
      if (isPast) cls += ' lc-life-decade--past';
      if (isCurrent) cls += ' lc-life-decade--current';

      arc.setAttribute('class', cls);
      svg.appendChild(arc);

      // Decade label
      const labelAngle = ((decade + 5) / totalYears) * 2 * Math.PI - Math.PI / 2;
      const labelR = (LIFE_RING_INNER + LIFE_RING_OUTER) / 2;
      const x = CENTER + labelR * Math.cos(labelAngle);
      const y = CENTER + labelR * Math.sin(labelAngle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.setAttribute('class', 'lc-decade-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.textContent = String(birthYear + decade);
      svg.appendChild(label);
    }
  }

  private renderYearRing(svg: SVGSVGElement, noteDate: LocalDate, today: LocalDate): void {
    if (!this.config) return;

    const year = noteDate.year;

    // Render all days of the year as small arcs
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = getDaysInMonth(year, month);
      const startAngle = this.monthToAngle(month);
      const monthArcSpan = Math.PI / 6; // 30 degrees per month
      const dayArcSpan = monthArcSpan / daysInMonth;

      for (let day = 1; day <= daysInMonth; day++) {
        const date = createLocalDate(year, month, day);
        const dayOfWeek = getWeekday(date);
        const isToday = today.year === year && today.month === month && today.day === day;
        const isNoteDay = noteDate.month === month && noteDate.day === day;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const dayStartAngle = startAngle + (day - 1) * dayArcSpan;
        const dayEndAngle = dayStartAngle + dayArcSpan - 0.002;

        // Get entries for this date
        const entries = this.config.service.getEntriesForDate(date);

        const path = this.createArcPath(YEAR_RING_INNER, YEAR_RING_OUTER, dayStartAngle, dayEndAngle);
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arc.setAttribute('d', path);

        const classes = ['lc-day'];
        if (isToday) classes.push('lc-day--today');
        if (isNoteDay) classes.push('lc-day--note');
        if (isWeekend) classes.push('lc-day--weekend');
        if (entries.length > 0) classes.push('lc-day--has-notes');
        if (entries.length > 2) classes.push('lc-day--many-notes');

        arc.setAttribute('class', classes.join(' '));
        arc.style.cursor = 'pointer';

        // Click handler - show notes or create new
        arc.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (entries.length > 0) {
            this.showDayContextMenu(e as MouseEvent, date, entries);
          } else {
            this.config?.service.openDailyNote(date);
          }
        });

        svg.appendChild(arc);
      }
    }

    // Month separators
    for (let month = 1; month <= 12; month++) {
      const angle = this.monthToAngle(month) - Math.PI / 2;
      const x1 = CENTER + YEAR_RING_INNER * Math.cos(angle);
      const y1 = CENTER + YEAR_RING_INNER * Math.sin(angle);
      const x2 = CENTER + YEAR_RING_OUTER * Math.cos(angle);
      const y2 = CENTER + YEAR_RING_OUTER * Math.sin(angle);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'lc-month-separator');
      svg.appendChild(line);
    }

    // Month labels (abbreviated) - positioned inside
    const MONTH_ABBR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    for (let month = 0; month < 12; month++) {
      const labelAngle = this.monthToAngle(month + 1) + (Math.PI / 12) - Math.PI / 2;
      const labelR = YEAR_RING_INNER - 8;
      const x = CENTER + labelR * Math.cos(labelAngle);
      const y = CENTER + labelR * Math.sin(labelAngle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.setAttribute('class', 'lc-month-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.textContent = MONTH_ABBR[month];
      svg.appendChild(label);
    }
  }

  private monthToAngle(month: number): number {
    // January starts at top (12 o'clock position)
    return ((month - 1) * Math.PI) / 6;
  }

  private renderCenter(svg: SVGSVGElement, date: LocalDate): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(CENTER_RADIUS - 5));
    circle.setAttribute('class', 'lc-center');
    svg.appendChild(circle);

    // Day number
    const dayText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dayText.setAttribute('x', String(CENTER));
    dayText.setAttribute('y', String(CENTER));
    dayText.setAttribute('class', 'lc-center-day');
    dayText.setAttribute('text-anchor', 'middle');
    dayText.setAttribute('dominant-baseline', 'central');
    dayText.textContent = String(date.day);
    svg.appendChild(dayText);
  }

  private renderNoteMarkers(
    svg: SVGSVGElement,
    birthYear: number,
    lifespan: number,
    date: LocalDate
  ): void {
    // Life ring marker (blue)
    const lifeAge = date.year - birthYear;
    const lifeAngle = (lifeAge / lifespan) * 2 * Math.PI - Math.PI / 2;
    this.drawMarker(svg, lifeAngle, LIFE_RING_INNER - 3, LIFE_RING_OUTER + 3, 'lc-marker--note');

    // Year ring marker (blue) - using day-based angle
    const yearAngle = this.dateToAngle(date);
    this.drawMarker(svg, yearAngle, YEAR_RING_INNER - 3, YEAR_RING_OUTER + 3, 'lc-marker--note');
  }

  private renderTodayMarkers(
    svg: SVGSVGElement,
    birthYear: number,
    lifespan: number,
    today: LocalDate
  ): void {
    // Life ring marker (red, thinner)
    const lifeAge = today.year - birthYear;
    const lifeAngle = (lifeAge / lifespan) * 2 * Math.PI - Math.PI / 2;
    this.drawMarker(svg, lifeAngle, LIFE_RING_INNER, LIFE_RING_OUTER, 'lc-marker--today');

    // Year ring marker (red, thinner) - using day-based angle
    const yearAngle = this.dateToAngle(today);
    this.drawMarker(svg, yearAngle, YEAR_RING_INNER, YEAR_RING_OUTER, 'lc-marker--today');
  }

  private dateToAngle(date: LocalDate): number {
    // Calculate exact position based on day within the year
    const daysInMonth = getDaysInMonth(date.year, date.month);
    const startAngle = this.monthToAngle(date.month);
    const monthArcSpan = Math.PI / 6;
    const dayArcSpan = monthArcSpan / daysInMonth;
    return startAngle + (date.day - 0.5) * dayArcSpan - Math.PI / 2;
  }

  private drawMarker(
    svg: SVGSVGElement,
    angle: number,
    innerR: number,
    outerR: number,
    className: string
  ): void {
    const x1 = CENTER + innerR * Math.cos(angle);
    const y1 = CENTER + innerR * Math.sin(angle);
    const x2 = CENTER + outerR * Math.cos(angle);
    const y2 = CENTER + outerR * Math.sin(angle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', className);
    svg.appendChild(line);
  }

  private showDayContextMenu(event: MouseEvent, date: LocalDate, entries: readonly CalendarEntry[]): void {
    if (!this.config) return;

    const menu = new Menu();

    // Add header with date
    menu.addItem((item) => {
      item
        .setTitle(`${date.day}. ${MONTH_NAMES[date.month - 1]} ${date.year}`)
        .setIcon('calendar')
        .setDisabled(true);
    });

    menu.addSeparator();

    // Add entry for creating new note
    menu.addItem((item) => {
      item
        .setTitle('Neue Notiz erstellen')
        .setIcon('plus')
        .onClick(async () => {
          await this.config?.service.openDailyNote(date);
        });
    });

    if (entries.length > 0) {
      menu.addSeparator();

      // Add entries (max 10)
      for (const entry of entries.slice(0, 10)) {
        menu.addItem((item) => {
          item
            .setTitle(entry.displayName)
            .setIcon('file')
            .onClick(async () => {
              await this.config?.openFile(entry.filePath);
            });
        });
      }

      if (entries.length > 10) {
        menu.addItem((item) => {
          item.setTitle(`+${entries.length - 10} weitere...`).setDisabled(true);
        });
      }
    }

    menu.showAtMouseEvent(event);
  }

  private createArcPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string {
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
}
