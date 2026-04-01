/**
 * RadcalRenderer - SVG Renderer for radcal codeblocks
 *
 * Renders a simplified, responsive radial calendar view
 */

import type { RadcalBlockConfig } from '../../core/domain/types/radcal-block';
import type { CalendarEntry } from '../../core/domain/models/CalendarEntry';
import type { LocalDate } from '../../core/domain/models/LocalDate';
import { getToday, getDaysInMonth, createLocalDate } from '../../core/domain/models/LocalDate';
import { RING_COLORS } from '../../core/domain/types';
import { createArcPath, monthToAngle } from '../svg/SvgArc';
import { createSvgCircle, createSvgLine, createSvgText, createSvgPath } from '../svg/SvgHelpers';
import {
  SVG_SIZE, CENTER, OUTER_RADIUS, INNER_RADIUS,
  DATA_RING_INNER, LABEL_RING_WIDTH, MONTH_NAMES,
  type RingRadii,
} from '../svg/RingLayout';

// Codeblock renderer uses a wider ring gap than the main view
const CODEBLOCK_RING_GAP = 4;

/**
 * Entries grouped by date key (YYYY-MM-DD)
 */
export type EntriesByDate = Map<string, CalendarEntry[]>;

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
    onDayClick?: (event: MouseEvent, date: LocalDate, entries: CalendarEntry[]) => void
  ): SVGSVGElement {
    const svg = this.createSVG();

    // Background
    svg.appendChild(createSvgCircle(CENTER, CENTER, OUTER_RADIUS, 'rc-background'));

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
   * Calculate radii for multiple rings.
   * Uses CODEBLOCK_RING_GAP (4px) — intentionally wider than the main view (1px).
   */
  private calculateRingRadii(ringCount: number): Map<number, RingRadii> {
    const radii = new Map<number, RingRadii>();
    const totalDataHeight = OUTER_RADIUS - DATA_RING_INNER;
    const totalGaps = (ringCount - 1) * CODEBLOCK_RING_GAP;
    const ringHeight = (totalDataHeight - totalGaps) / ringCount;

    for (let i = 0; i < ringCount; i++) {
      const outerRadius = OUTER_RADIUS - i * (ringHeight + CODEBLOCK_RING_GAP);
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
    onDayClick?: (event: MouseEvent, date: LocalDate, entries: CalendarEntry[]) => void
  ): void {
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = getDaysInMonth(year, month);
      const monthAngle = monthToAngle(month);
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

        const arc = createSvgPath(
          createArcPath(CENTER, radii.innerRadius, radii.outerRadius, startAngle, endAngle),
          'rc-day-arc'
        );

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
            arc.addEventListener('click', (e) => onDayClick(e as MouseEvent, clickDate, clickEntries));
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
      const angle = monthToAngle(month) - Math.PI / 2;
      const x1 = CENTER + INNER_RADIUS * Math.cos(angle);
      const y1 = CENTER + INNER_RADIUS * Math.sin(angle);
      const x2 = CENTER + OUTER_RADIUS * Math.cos(angle);
      const y2 = CENTER + OUTER_RADIUS * Math.sin(angle);
      svg.appendChild(createSvgLine(x1, y1, x2, y2, 'rc-month-separator'));
    }
  }

  /**
   * Render month labels
   */
  private renderMonthLabels(svg: SVGSVGElement): void {
    const labelRadius = INNER_RADIUS + LABEL_RING_WIDTH / 2;

    for (let month = 1; month <= 12; month++) {
      const angle = monthToAngle(month) + Math.PI / 12 - Math.PI / 2; // Center of month
      const x = CENTER + labelRadius * Math.cos(angle);
      const y = CENTER + labelRadius * Math.sin(angle);
      svg.appendChild(createSvgText(x, y, MONTH_NAMES[month - 1], 'rc-month-label', {
        textAnchor: 'middle',
        dominantBaseline: 'central',
      }));
    }
  }

  /**
   * Render today marker
   */
  private renderTodayMarker(svg: SVGSVGElement, year: number): void {
    const today = getToday();
    if (today.year !== year) return;

    const daysInMonth = getDaysInMonth(year, today.month);
    const monthAngle = monthToAngle(today.month);
    const dayArcLength = (Math.PI / 6) / daysInMonth;
    const startAngle = monthAngle + (today.day - 0.5) * dayArcLength;
    const angleRad = startAngle - Math.PI / 2;

    const x1 = CENTER + INNER_RADIUS * Math.cos(angleRad);
    const y1 = CENTER + INNER_RADIUS * Math.sin(angleRad);
    const x2 = CENTER + OUTER_RADIUS * Math.cos(angleRad);
    const y2 = CENTER + OUTER_RADIUS * Math.sin(angleRad);
    svg.appendChild(createSvgLine(x1, y1, x2, y2, 'rc-today-marker'));
  }

  /**
   * Render center year display
   */
  private renderCenter(svg: SVGSVGElement, year: number): void {
    svg.appendChild(createSvgCircle(CENTER, CENTER, INNER_RADIUS - 5, 'rc-center'));
    svg.appendChild(createSvgText(CENTER, CENTER, String(year), 'rc-center-text', {
      textAnchor: 'middle',
      dominantBaseline: 'central',
    }));
  }
}
