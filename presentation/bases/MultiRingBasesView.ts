/**
 * MultiRingBasesView - Multi-ring radial calendar for Bases
 *
 * Uses Bases groupedData API: each group becomes a concentric ring.
 * Group by folder, tag, or any property in the Bases UI.
 * Without grouping, all entries render on a single ring.
 *
 * Requires Obsidian 1.10+
 */

import {
  BasesView,
  BasesEntry,
  BasesEntryGroup,
  type QueryController,
} from 'obsidian';
import { createArcPath, monthToAngle0 } from '../svg/SvgArc';
import { createSvgLine, createSvgCircle, createSvgText } from '../svg/SvgHelpers';

// SVG canvas
const SVG_SIZE = 600;
const CENTER = SVG_SIZE / 2;
const LABEL_RADIUS = (SVG_SIZE / 2) - 15;

// Ring layout: rings grow inward from outer edge
const RING_AREA_OUTER = (SVG_SIZE / 2) - 35;
const RING_AREA_INNER = 80; // leave space for center text
const RING_GAP = 3;

// Colors assigned to groups in order
const GROUP_COLORS = [
  '#4a90d9', // blue
  '#50c878', // green
  '#e74c3c', // red
  '#9b59b6', // purple
  '#e67e22', // orange
  '#1abc9c', // teal
  '#e91e63', // pink
  '#f1c40f', // yellow
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class MultiRingBasesView extends BasesView {
  readonly type = 'radial-multi';

  private containerEl: HTMLElement;
  private svgEl: SVGSVGElement | null = null;
  private currentYear: number;
  private dateProperty: string = 'date';

  constructor(controller: QueryController, parentEl: HTMLElement) {
    super(controller);
    this.containerEl = parentEl.createDiv('radial-multi-bases-view');
    this.currentYear = new Date().getFullYear();
  }

  onDataUpdated(): void {
    try {
      this.dateProperty = this.getConfigString('dateProperty', 'date');
      const yearConfig = this.config?.get('year');
      if (yearConfig && typeof yearConfig === 'number') {
        this.currentYear = yearConfig;
      }

      this.containerEl.empty();
      this.renderHeader();

      const svgContainer = this.containerEl.createDiv({ cls: 'rc-bases-svg-container' });
      this.svgEl = this.createSVG();
      svgContainer.appendChild(this.svgEl);

      this.renderCalendar();
    } catch (err) {
      console.error('Radial Calendar Multi: render error', err);
      try {
        this.containerEl.empty();
        this.containerEl.createDiv({ text: `Render error: ${err}` });
      } catch { /* container gone */ }
    }
  }

  // ---------------------------------------------------------------------------
  // SVG setup
  // ---------------------------------------------------------------------------

  private createSVG(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'rc-bases-calendar');
    return svg;
  }

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------

  private renderHeader(): void {
    const header = this.containerEl.createDiv({ cls: 'rc-bases-header' });

    const prevBtn = header.createEl('button', { cls: 'rc-bases-nav-btn', text: '←' });
    prevBtn.addEventListener('click', () => { this.currentYear--; this.onDataUpdated(); });

    header.createSpan({ cls: 'rc-bases-year', text: String(this.currentYear) });

    const nextBtn = header.createEl('button', { cls: 'rc-bases-nav-btn', text: '→' });
    nextBtn.addEventListener('click', () => { this.currentYear++; this.onDataUpdated(); });

    const todayBtn = header.createEl('button', { cls: 'rc-bases-today-btn', text: 'Today' });
    todayBtn.addEventListener('click', () => {
      this.currentYear = new Date().getFullYear();
      this.onDataUpdated();
    });
  }

  // ---------------------------------------------------------------------------
  // Calendar rendering
  // ---------------------------------------------------------------------------

  private renderCalendar(): void {
    if (!this.svgEl) return;
    const svg = this.svgEl;
    svg.innerHTML = '';

    const groups = this.data.groupedData;
    const ringCount = Math.max(groups.length, 1);

    // Compute ring radii
    const totalSpace = RING_AREA_OUTER - RING_AREA_INNER;
    const ringWidth = (totalSpace - (ringCount - 1) * RING_GAP) / ringCount;

    // Background circle
    svg.appendChild(createSvgCircle(CENTER, CENTER, RING_AREA_OUTER, 'rc-bases-background'));

    // Month separators across all rings
    this.renderMonthSeparators(svg, RING_AREA_INNER, RING_AREA_OUTER);

    // Render each group as a ring (outermost first)
    let totalEntries = 0;
    groups.forEach((group, index) => {
      const outerR = RING_AREA_OUTER - index * (ringWidth + RING_GAP);
      const innerR = outerR - ringWidth;
      const color = GROUP_COLORS[index % GROUP_COLORS.length];
      const label = group.hasKey() ? String(group.key) : undefined;

      const count = this.renderRing(svg, group.entries, outerR, innerR, color, label);
      totalEntries += count;
    });

    // Month labels
    this.renderMonthLabels(svg);

    // Today marker
    this.renderTodayMarker(svg, RING_AREA_INNER, RING_AREA_OUTER);

    // Center
    this.renderCenter(svg, totalEntries);

    // Legend (below SVG)
    if (groups.length > 1) {
      this.renderLegend(groups);
    }
  }

  // ---------------------------------------------------------------------------
  // Ring rendering
  // ---------------------------------------------------------------------------

  private renderRing(
    svg: SVGSVGElement,
    entries: BasesEntry[],
    outerR: number,
    innerR: number,
    color: string,
    _label?: string
  ): number {
    const entriesByDay = new Map<number, BasesEntry[]>();

    for (const entry of entries) {
      const date = this.getEntryDate(entry);
      if (!date || date.getFullYear() !== this.currentYear) continue;

      const day = this.getDayOfYear(date);
      if (!entriesByDay.has(day)) entriesByDay.set(day, []);
      entriesByDay.get(day)!.push(entry);
    }

    const daysInYear = this.isLeapYear(this.currentYear) ? 366 : 365;
    let count = 0;

    for (const [day, dayEntries] of entriesByDay) {
      count += dayEntries.length;
      const startAngle = ((day - 1) / daysInYear) * 2 * Math.PI;
      const endAngle = (day / daysInYear) * 2 * Math.PI;

      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arc.setAttribute('d', createArcPath(CENTER, innerR, outerR, startAngle, endAngle));
      arc.setAttribute('class', 'rc-bases-entry-indicator');
      arc.style.fill = color;
      arc.style.opacity = Math.min(0.4 + dayEntries.length * 0.2, 1).toString();
      arc.style.cursor = 'pointer';

      // Tooltip
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      const names = dayEntries.map(e => e.file?.basename || '?').join('\n');
      title.textContent = `${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'}:\n${names}`;
      arc.appendChild(title);

      // Click → open first file
      arc.addEventListener('click', () => {
        if (dayEntries[0]?.file) {
          this.app.workspace.getLeaf().openFile(dayEntries[0].file);
        }
      });

      svg.appendChild(arc);
    }

    return count;
  }

  // ---------------------------------------------------------------------------
  // Shared decorations
  // ---------------------------------------------------------------------------

  private renderMonthSeparators(svg: SVGSVGElement, innerR: number, outerR: number): void {
    for (let month = 0; month < 12; month++) {
      const angle = monthToAngle0(month) - Math.PI / 2;
      const x1 = CENTER + innerR * Math.cos(angle);
      const y1 = CENTER + innerR * Math.sin(angle);
      const x2 = CENTER + outerR * Math.cos(angle);
      const y2 = CENTER + outerR * Math.sin(angle);
      svg.appendChild(createSvgLine(x1, y1, x2, y2, 'rc-bases-month-separator'));
    }
  }

  private renderMonthLabels(svg: SVGSVGElement): void {
    for (let month = 0; month < 12; month++) {
      const midAngle = monthToAngle0(month) + (Math.PI / 12) - Math.PI / 2;
      const x = CENTER + LABEL_RADIUS * Math.cos(midAngle);
      const y = CENTER + LABEL_RADIUS * Math.sin(midAngle);
      svg.appendChild(createSvgText(x, y, MONTH_NAMES[month], 'rc-bases-month-label'));
    }
  }

  private renderTodayMarker(svg: SVGSVGElement, innerR: number, outerR: number): void {
    const today = new Date();
    if (today.getFullYear() !== this.currentYear) return;

    const day = this.getDayOfYear(today);
    const daysInYear = this.isLeapYear(this.currentYear) ? 366 : 365;
    const angle = ((day - 0.5) / daysInYear) * 2 * Math.PI - Math.PI / 2;

    const x1 = CENTER + (innerR - 5) * Math.cos(angle);
    const y1 = CENTER + (innerR - 5) * Math.sin(angle);
    const x2 = CENTER + (outerR + 5) * Math.cos(angle);
    const y2 = CENTER + (outerR + 5) * Math.sin(angle);
    svg.appendChild(createSvgLine(x1, y1, x2, y2, 'rc-bases-today-marker'));
  }

  private renderCenter(svg: SVGSVGElement, totalEntries: number): void {
    const centerR = RING_AREA_INNER - 10;
    svg.appendChild(createSvgCircle(CENTER, CENTER, centerR, 'rc-bases-center'));
    svg.appendChild(createSvgText(CENTER, CENTER, String(this.currentYear), 'rc-bases-center-text'));
    svg.appendChild(createSvgText(
      CENTER, CENTER + 25,
      `${totalEntries} entries`,
      'rc-bases-entry-count'
    ));
  }

  private renderLegend(groups: BasesEntryGroup[]): void {
    const legend = this.containerEl.createDiv({ cls: 'rc-bases-legend' });
    groups.forEach((group, i) => {
      const item = legend.createDiv({ cls: 'rc-bases-legend-item' });
      const swatch = item.createSpan({ cls: 'rc-bases-legend-swatch' });
      swatch.style.backgroundColor = GROUP_COLORS[i % GROUP_COLORS.length];
      item.createSpan({ text: group.hasKey() ? String(group.key) : 'Ungrouped' });
    });
  }

  // ---------------------------------------------------------------------------
  // Date helpers
  // ---------------------------------------------------------------------------

  private getEntryDate(entry: BasesEntry): Date | null {
    const dateValue = entry.getValue(this.dateProperty);
    if (dateValue) {
      const date = this.parseDate(dateValue);
      if (date) return date;
    }

    for (const prop of ['date', 'Date', 'created', 'birthday', 'due']) {
      const value = entry.getValue(prop);
      if (value) {
        const date = this.parseDate(value);
        if (date) return date;
      }
    }

    if (entry.file?.basename) {
      const m = entry.file.basename.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    }

    if (entry.file?.stat?.ctime) return new Date(entry.file.stat.ctime);
    return null;
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.toJSDate === 'function') return (obj.toJSDate as () => Date)();
      if (typeof obj.ts === 'number') return new Date(obj.ts);
      if ('value' in obj) return this.parseDate(obj.value);
      if ('path' in obj) return null;
    }

    if (typeof value === 'string') {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    if (typeof value === 'number') return new Date(value);
    return null;
  }

  private getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  // ---------------------------------------------------------------------------
  // Config helper
  // ---------------------------------------------------------------------------

  private getConfigString(key: string, defaultValue: string): string {
    const value = this.config.get(key);
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && 'value' in value) {
      return String((value as { value: unknown }).value);
    }
    return defaultValue;
  }
}

export function createMultiRingBasesView(
  controller: QueryController,
  containerEl: HTMLElement
): MultiRingBasesView {
  return new MultiRingBasesView(controller, containerEl);
}
