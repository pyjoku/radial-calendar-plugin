/**
 * RadcalRenderer - SVG Renderer for radcal codeblocks
 *
 * Renders a simplified, responsive radial calendar view
 */

import type { RadcalBlockConfig } from '../../core/domain/types/radcal-block';
import type { CalendarEntry } from '../../core/domain/models/CalendarEntry';
import type { LocalDate } from '../../core/domain/models/LocalDate';
import { getToday, getDaysInMonth, isLeapYear, createLocalDate } from '../../core/domain/models/LocalDate';
import { RING_COLORS } from '../../core/domain/types';

// SVG Constants (same as RadialCalendarView for consistency)
const SVG_SIZE = 800;
const CENTER = SVG_SIZE / 2;
const OUTER_RADIUS = 380;
const LABEL_RING_WIDTH = 30;
const INNER_RADIUS = 145;
const DATA_RING_INNER = INNER_RADIUS + LABEL_RING_WIDTH; // 175
const RING_GAP = 4;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Entries grouped by date key (YYYY-MM-DD)
 */
export type EntriesByDate = Map<string, CalendarEntry[]>;

/**
 * Ring radii for rendering
 */
interface RingRadii {
  innerRadius: number;
  outerRadius: number;
}

/**
 * Renderer for radcal codeblocks
 */
export class RadcalRenderer {
  /**
   * Render the calendar SVG
   */
  render(
    config: RadcalBlockConfig,
    entries: EntriesByDate,
    year: number,
    onDayClick?: (date: LocalDate, entries: CalendarEntry[]) => void
  ): SVGSVGElement {
    const svg = this.createSVG();

    // Background
    this.renderBackground(svg);

    // Data ring(s)
    const ringCount = config.rings?.length || 1;
    const radii = this.calculateRingRadii(ringCount);

    if (config.rings && config.rings.length > 0) {
      // Multiple rings from config
      config.rings.forEach((ringConfig, index) => {
        const ringRadii = radii.get(index);
        if (ringRadii) {
          const color = RING_COLORS[ringConfig.color] || RING_COLORS.blue;
          this.renderDataRing(svg, year, entries, ringRadii, color, ringConfig.folder, onDayClick);
        }
      });
    } else {
      // Single ring with all entries
      const ringRadii = radii.get(0);
      if (ringRadii) {
        const color = RING_COLORS.blue;
        this.renderDataRing(svg, year, entries, ringRadii, color, config.folder, onDayClick);
      }
    }

    // Month separators
    this.renderMonthSeparators(svg);

    // Month labels
    if (config.showLabels) {
      this.renderMonthLabels(svg);
    }

    // Today marker
    if (config.showToday) {
      this.renderTodayMarker(svg, year);
    }

    // Center year display
    this.renderCenter(svg, year);

    return svg;
  }

  /**
   * Create base SVG element
   */
  private createSVG(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'radcal-svg');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '800px';
    return svg;
  }

  /**
   * Render background circle
   */
  private renderBackground(svg: SVGSVGElement): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(OUTER_RADIUS));
    circle.setAttribute('class', 'rc-background');
    svg.appendChild(circle);
  }

  /**
   * Calculate radii for multiple rings
   */
  private calculateRingRadii(ringCount: number): Map<number, RingRadii> {
    const radii = new Map<number, RingRadii>();
    const totalDataHeight = OUTER_RADIUS - DATA_RING_INNER;
    const totalGaps = (ringCount - 1) * RING_GAP;
    const ringHeight = (totalDataHeight - totalGaps) / ringCount;

    for (let i = 0; i < ringCount; i++) {
      const outerRadius = OUTER_RADIUS - i * (ringHeight + RING_GAP);
      const innerRadius = outerRadius - ringHeight;
      radii.set(i, { innerRadius, outerRadius });
    }

    return radii;
  }

  /**
   * Render a single data ring
   */
  private renderDataRing(
    svg: SVGSVGElement,
    year: number,
    allEntries: EntriesByDate,
    radii: RingRadii,
    color: string,
    folderFilter?: string,
    onDayClick?: (date: LocalDate, entries: CalendarEntry[]) => void
  ): void {
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = getDaysInMonth(year, month);
      const monthAngle = this.monthToAngle(month);
      const monthArcLength = Math.PI / 6; // 30 degrees per month
      const dayArcLength = monthArcLength / daysInMonth;

      for (let day = 1; day <= daysInMonth; day++) {
        const date = createLocalDate(year, month, day);
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Get and filter entries
        let dayEntries = allEntries.get(dateKey) || [];
        if (folderFilter) {
          dayEntries = dayEntries.filter(e =>
            e.metadata.folder.startsWith(folderFilter)
          );
        }

        const startAngle = monthAngle + (day - 1) * dayArcLength;
        const endAngle = startAngle + dayArcLength;

        // Render day arc
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const path = this.createArcPath(radii.innerRadius, radii.outerRadius, startAngle, endAngle);
        arc.setAttribute('d', path);
        arc.setAttribute('class', 'rc-day-arc');

        if (dayEntries.length > 0) {
          arc.style.fill = color;
          arc.style.opacity = String(Math.min(0.3 + dayEntries.length * 0.15, 1));
          arc.style.cursor = 'pointer';

          // Add data attributes for tooltip
          arc.setAttribute('data-date', dateKey);
          arc.setAttribute('data-count', String(dayEntries.length));
          arc.setAttribute('data-names', dayEntries.map(e => e.displayName).join('|'));

          if (onDayClick) {
            const clickDate = date;
            const clickEntries = dayEntries;
            arc.addEventListener('click', () => onDayClick(clickDate, clickEntries));
          }
        }

        svg.appendChild(arc);
      }
    }
  }

  /**
   * Render month separator lines
   */
  private renderMonthSeparators(svg: SVGSVGElement): void {
    for (let month = 1; month <= 12; month++) {
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
      line.setAttribute('class', 'rc-month-separator');
      svg.appendChild(line);
    }
  }

  /**
   * Render month labels
   */
  private renderMonthLabels(svg: SVGSVGElement): void {
    const labelRadius = INNER_RADIUS + LABEL_RING_WIDTH / 2;

    for (let month = 1; month <= 12; month++) {
      const angle = this.monthToAngle(month) + Math.PI / 12 - Math.PI / 2; // Center of month
      const x = CENTER + labelRadius * Math.cos(angle);
      const y = CENTER + labelRadius * Math.sin(angle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('class', 'rc-month-label');
      text.textContent = MONTH_NAMES[month - 1];
      svg.appendChild(text);
    }
  }

  /**
   * Render today marker
   */
  private renderTodayMarker(svg: SVGSVGElement, year: number): void {
    const today = getToday();
    if (today.year !== year) return;

    const daysInMonth = getDaysInMonth(year, today.month);
    const monthAngle = this.monthToAngle(today.month);
    const dayArcLength = (Math.PI / 6) / daysInMonth;
    const startAngle = monthAngle + (today.day - 0.5) * dayArcLength;
    const angleRad = startAngle - Math.PI / 2;

    // Draw marker line from inner to outer
    const x1 = CENTER + INNER_RADIUS * Math.cos(angleRad);
    const y1 = CENTER + INNER_RADIUS * Math.sin(angleRad);
    const x2 = CENTER + OUTER_RADIUS * Math.cos(angleRad);
    const y2 = CENTER + OUTER_RADIUS * Math.sin(angleRad);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-today-marker');
    svg.appendChild(line);
  }

  /**
   * Render center year display
   */
  private renderCenter(svg: SVGSVGElement, year: number): void {
    // Center circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(INNER_RADIUS - 5));
    circle.setAttribute('class', 'rc-center');
    svg.appendChild(circle);

    // Year text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(CENTER));
    text.setAttribute('y', String(CENTER));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('class', 'rc-center-text');
    text.textContent = String(year);
    svg.appendChild(text);
  }

  /**
   * Create SVG arc path
   */
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

  /**
   * Convert month (1-12) to angle in radians
   */
  private monthToAngle(month: number): number {
    // January starts at top (12 o'clock position)
    // Each month is 30 degrees (PI/6 radians)
    return ((month - 1) * Math.PI) / 6;
  }
}
