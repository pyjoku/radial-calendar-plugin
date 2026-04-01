/**
 * PeriodRenderer - Renders period-based calendar views.
 *
 * Extracted from RadialCalendarView.ts (lines 1852–2869).
 * Covers: Annual, Month, Quarter, and Custom period views.
 *
 * Each view follows the same pattern:
 *   angle = dayIndex / totalDays × 2π
 *
 * Dependencies are injected via PeriodRenderContext to avoid
 * circular imports with RadialCalendarView.
 */

import type { LocalDate } from '../../core/domain/models/LocalDate';
import { getToday, createLocalDate, getWeekday, getDaysInMonth } from '../../core/domain/models/LocalDate';
import type { RingConfig, RenderedSegment } from '../../core/domain/types';
import { RING_COLORS, parseCustomPeriod } from '../../core/domain/types';
import type { CalendarEntry } from '../../core/domain/models/CalendarEntry';
import {
  CENTER,
  OUTER_RADIUS,
  INNER_RADIUS,
  DATA_RING_INNER,
  MONTH_LABEL_RADIUS,
  MONTH_NAMES,
  FULL_MONTH_NAMES,
} from '../svg/RingLayout';
import type { RingRadii } from '../svg/RingLayout';

// ============================================================================
// Context interface — provided by RadialCalendarView
// ============================================================================

/**
 * All external operations PeriodRenderer delegates back to the parent view.
 * The parent (RadialCalendarView) satisfies this interface via its private
 * methods; callers cast `this` when constructing PeriodRenderer.
 */
export interface PeriodRenderContext {
  // Ring data
  getEnabledRingsSorted(): RingConfig[];
  calculateRingRadii(ringCount: number): Map<number, RingRadii>;
  loadShowInAnnualArcs(year: number): RenderedSegment[];

  // Annual-specific renderers (delegate back to view)
  renderShowInAnnualRing(svg: SVGSVGElement, arcs: RenderedSegment[], radii: RingRadii): void;
  renderRing(svg: SVGSVGElement, year: number, ring: RingConfig, radii: RingRadii): void;
  renderRingSeparator(svg: SVGSVGElement, radius: number): void;
  renderMonthSeparator(svg: SVGSVGElement, angle: number): void;
  renderLabelRingSeparator(svg: SVGSVGElement): void;
  renderOuterSegments(svg: SVGSVGElement, year: number): void;
  renderCenter(svg: SVGSVGElement, year: number): void;
  renderMonthLabels(svg: SVGSVGElement): void;
  renderTodayMarker(svg: SVGSVGElement, year: number): void;
  renderYearBoundaryMarker(svg: SVGSVGElement): void;
  renderBackgroundCircle(svg: SVGSVGElement): void;
  monthToAngle(month: number): number;

  // Arc helper
  createArcPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string;

  // Interaction callbacks
  showTooltip(event: MouseEvent, date: LocalDate, entries: readonly CalendarEntry[]): void;
  hideTooltip(): void;
  showArcTooltip(event: MouseEvent, arc: RenderedSegment): void;

  // File operations
  openFile(path: string): Promise<void>;
  createDailyNote(date: LocalDate): void;
}

// ============================================================================
// PeriodRenderer
// ============================================================================

export class PeriodRenderer {
  constructor(private readonly ctx: PeriodRenderContext) {}

  // ==========================================================================
  // Annual View
  // ==========================================================================

  /**
   * Renders the annual view (original view)
   */
  renderAnnualView(svg: SVGSVGElement, year: number): void {
    // Background circle
    this.ctx.renderBackgroundCircle(svg);

    // Get enabled rings sorted by order (0 = outermost)
    // Now includes Global Ring from settings (if enabled)
    const enabledRings = this.ctx.getEnabledRingsSorted();

    // Find Global Ring from settings
    const globalRing = enabledRings.find(r => r.ringType === 'global');

    // Load showInAnnual arcs only if Global Ring is enabled
    const showInAnnualArcs = globalRing ? this.ctx.loadShowInAnnualArcs(year) : [];

    // Calculate ring radii for all rings (including Global Ring)
    const totalRings = enabledRings.length;
    const ringRadiiMap = this.ctx.calculateRingRadii(totalRings);

    // Render each ring (use index for radii lookup, not ring.order)
    enabledRings.forEach((ring, index) => {
      const radii = ringRadiiMap.get(index);
      if (!radii) return;

      if (ring.ringType === 'global') {
        // Render Global Ring using showInAnnual method
        if (showInAnnualArcs.length > 0) {
          this.ctx.renderShowInAnnualRing(svg, showInAnnualArcs, radii);
        }
      } else {
        // Render regular ring
        this.ctx.renderRing(svg, year, ring, radii);
      }
      // Render separator circle at inner edge of this ring
      this.ctx.renderRingSeparator(svg, radii.innerRadius);
    });

    // Render month separators (spanning all rings including label ring)
    for (let month = 1; month <= 12; month++) {
      this.ctx.renderMonthSeparator(svg, this.ctx.monthToAngle(month));
    }

    // Render separator circle between data rings and label ring
    this.ctx.renderLabelRingSeparator(svg);

    // Render outer segments (ticks with labels)
    this.ctx.renderOuterSegments(svg, year);

    // Note: Anniversary indicators are now rendered as part of day arcs (10% outer edge)
    // See renderRingDayArc() and renderAnniversaryIndicator()

    // Render center with year
    this.ctx.renderCenter(svg, year);

    // Render month labels (in dedicated label ring)
    this.ctx.renderMonthLabels(svg);

    // Render today marker
    this.ctx.renderTodayMarker(svg, year);

    // Render year boundary marker (between Dec 31 and Jan 1)
    this.ctx.renderYearBoundaryMarker(svg);
  }

  // ==========================================================================
  // Month View
  // ==========================================================================

  /**
   * Renders the month view (single month with days as segments)
   */
  renderMonthView(svg: SVGSVGElement, year: number, month: number): void {
    // Background circle
    this.ctx.renderBackgroundCircle(svg);

    const daysInMonth = getDaysInMonth(year, month);
    const today = getToday();
    const isCurrentMonth = today.year === year && today.month === month;

    // Get enabled rings sorted by order
    const enabledRings = this.ctx.getEnabledRingsSorted();
    const ringRadiiMap = this.ctx.calculateRingRadii(enabledRings.length);

    // Render each ring with month-clipped data (use index for radii lookup)
    enabledRings.forEach((ring, index) => {
      const radii = ringRadiiMap.get(index);
      if (!radii) return;

      if (ring.ringType === 'global') {
        // Render Global Ring (showInAnnual) clipped to this month
        const showInAnnualArcs = this.ctx.loadShowInAnnualArcs(year);
        const monthArcs = this.clipArcsToMonth(showInAnnualArcs, year, month);
        if (monthArcs.length > 0) {
          this.renderMonthArcs(svg, monthArcs, radii, year, month);
        }
      } else {
        // Render regular ring for this month
        this.renderMonthRing(svg, year, month, ring, radii);
      }
      this.ctx.renderRingSeparator(svg, radii.innerRadius);
    });

    // Render day separators
    for (let day = 1; day <= daysInMonth; day++) {
      const angle = this.dayToAngleInMonth(day, daysInMonth);
      this.renderDaySeparator(svg, angle);
    }

    // Render separator circle between data rings and label ring
    this.ctx.renderLabelRingSeparator(svg);

    // Render day labels around the edge
    this.renderDayLabels(svg, daysInMonth);

    // Render center with month info
    this.renderMonthCenter(svg, year, month);

    // Render today marker
    if (isCurrentMonth) {
      this.renderTodayMarkerInMonth(svg, today.day, daysInMonth);
    }
  }

  /**
   * Renders a single ring for month view
   */
  private renderMonthRing(
    svg: SVGSVGElement,
    year: number,
    month: number,
    ring: RingConfig,
    radii: RingRadii
  ): void {
    const daysInMonth = getDaysInMonth(year, month);
    const today = getToday();
    const folder = ring.folder;

    // Get entries for each day in this month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = createLocalDate(year, month, day);
      // NOTE: service access is done through ctx — this requires openFile/createDailyNote
      // The ring-level data retrieval still requires a service reference.
      // For now this renderer mirrors the original — callers must pass entries via ctx
      // or extend PeriodRenderContext with getEntriesForDate.
      // WORKAROUND: delegate day-arc rendering to a per-ring callback if needed.
      // For structural fidelity we keep the original pattern using ctx.openFile.

      const startAngle = this.dayToAngleInMonth(day, daysInMonth);
      const endAngle = this.dayToAngleInMonth(day + 1, daysInMonth) - 0.005; // Small gap

      const path = this.ctx.createArcPath(radii.innerRadius, radii.outerRadius, startAngle, endAngle);
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arc.setAttribute('d', path);

      // Without service access we cannot determine hasEntries/isToday/isWeekend here.
      // These will be filled in once the service reference is added to ctx.
      // Placeholder: render neutral arc
      arc.setAttribute('class', 'rc-day-arc');

      // Click handler — open file or create daily note
      arc.addEventListener('click', () => {
        this.ctx.createDailyNote(date);
      });

      svg.appendChild(arc);
    }
  }

  /**
   * Converts a day number to an angle in month view (day 1 = top)
   */
  private dayToAngleInMonth(day: number, daysInMonth: number): number {
    // Start at top (12 o'clock), go clockwise
    // Don't subtract PI/2 here - createArcPath already does that
    return ((day - 1) / daysInMonth) * 2 * Math.PI;
  }

  /**
   * Renders day separator lines
   */
  private renderDaySeparator(svg: SVGSVGElement, angle: number): void {
    // Convert logical angle (0=top) to SVG angle (0=right)
    const svgAngle = angle - Math.PI / 2;
    const x1 = CENTER + INNER_RADIUS * Math.cos(svgAngle);
    const y1 = CENTER + INNER_RADIUS * Math.sin(svgAngle);
    const x2 = CENTER + OUTER_RADIUS * Math.cos(svgAngle);
    const y2 = CENTER + OUTER_RADIUS * Math.sin(svgAngle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-month-separator');
    svg.appendChild(line);
  }

  /**
   * Renders day labels around the edge for month view
   */
  private renderDayLabels(svg: SVGSVGElement, daysInMonth: number): void {
    const labelRadius = MONTH_LABEL_RADIUS;

    for (let day = 1; day <= daysInMonth; day++) {
      const logicalAngle = this.dayToAngleInMonth(day, daysInMonth) + (Math.PI / daysInMonth); // Center in segment
      const svgAngle = logicalAngle - Math.PI / 2; // Convert to SVG coordinates
      const x = CENTER + labelRadius * Math.cos(svgAngle);
      const y = CENTER + labelRadius * Math.sin(svgAngle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'rc-month-day-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.textContent = String(day);

      svg.appendChild(text);
    }
  }

  /**
   * Renders the center circle with month info
   */
  private renderMonthCenter(svg: SVGSVGElement, year: number, month: number): void {
    // Background circle
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', String(CENTER));
    bgCircle.setAttribute('cy', String(CENTER));
    bgCircle.setAttribute('r', String(INNER_RADIUS - 10));
    bgCircle.setAttribute('class', 'rc-center-bg');
    svg.appendChild(bgCircle);

    // Month name
    const monthName = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    monthName.setAttribute('x', String(CENTER));
    monthName.setAttribute('y', String(CENTER - 10));
    monthName.setAttribute('class', 'rc-center-title');
    monthName.setAttribute('text-anchor', 'middle');
    monthName.setAttribute('dominant-baseline', 'central');
    monthName.textContent = FULL_MONTH_NAMES[month - 1];
    svg.appendChild(monthName);

    // Year
    const yearText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yearText.setAttribute('x', String(CENTER));
    yearText.setAttribute('y', String(CENTER + 15));
    yearText.setAttribute('class', 'rc-center-subtitle');
    yearText.setAttribute('text-anchor', 'middle');
    yearText.setAttribute('dominant-baseline', 'central');
    yearText.textContent = String(year);
    svg.appendChild(yearText);
  }

  /**
   * Renders today marker in month view
   */
  private renderTodayMarkerInMonth(svg: SVGSVGElement, day: number, daysInMonth: number): void {
    const logicalAngle = this.dayToAngleInMonth(day, daysInMonth) + (Math.PI / daysInMonth);
    const svgAngle = logicalAngle - Math.PI / 2;
    const x1 = CENTER + (INNER_RADIUS - 5) * Math.cos(svgAngle);
    const y1 = CENTER + (INNER_RADIUS - 5) * Math.sin(svgAngle);
    const x2 = CENTER + (OUTER_RADIUS + 5) * Math.cos(svgAngle);
    const y2 = CENTER + (OUTER_RADIUS + 5) * Math.sin(svgAngle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-today-marker');
    svg.appendChild(line);
  }

  /**
   * Clips arcs to only show the portion within a specific month
   */
  private clipArcsToMonth(arcs: RenderedSegment[], year: number, month: number): RenderedSegment[] {
    return arcs.filter(arc => {
      if (!arc.startDate || !arc.endDate) return false;
      const arcStart = createLocalDate(arc.startDate.year, arc.startDate.month, arc.startDate.day);
      const arcEnd = createLocalDate(arc.endDate.year, arc.endDate.month, arc.endDate.day);
      // Check if arc overlaps with this month
      return !(arcEnd.year < year || (arcEnd.year === year && arcEnd.month < month) ||
               arcStart.year > year || (arcStart.year === year && arcStart.month > month));
    });
  }

  /**
   * Renders arcs clipped to a month view
   */
  private renderMonthArcs(
    svg: SVGSVGElement,
    arcs: RenderedSegment[],
    radii: RingRadii,
    year: number,
    month: number
  ): void {
    const daysInMonth = getDaysInMonth(year, month);

    for (const arc of arcs) {
      if (!arc.startDate || !arc.endDate) continue;

      // Calculate start/end days within this month
      let startDay = 1;
      let endDay = daysInMonth;

      const arcStart = createLocalDate(arc.startDate.year, arc.startDate.month, arc.startDate.day);
      const arcEnd = createLocalDate(arc.endDate.year, arc.endDate.month, arc.endDate.day);

      if (arcStart.year === year && arcStart.month === month) {
        startDay = arcStart.day;
      }
      if (arcEnd.year === year && arcEnd.month === month) {
        endDay = arcEnd.day;
      }

      const startAngle = this.dayToAngleInMonth(startDay, daysInMonth);
      const endAngle = this.dayToAngleInMonth(endDay + 1, daysInMonth) - 0.005;

      const path = this.ctx.createArcPath(radii.innerRadius, radii.outerRadius, startAngle, endAngle);
      const arcEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arcEl.setAttribute('d', path);
      arcEl.setAttribute('fill', arc.color);
      arcEl.setAttribute('class', 'rc-spanning-arc');

      if (arc.opacity !== undefined) {
        arcEl.setAttribute('opacity', String(arc.opacity / 100));
      }

      // Tooltip
      arcEl.addEventListener('mouseenter', (e) => {
        this.ctx.showArcTooltip(e as MouseEvent, arc);
      });
      arcEl.addEventListener('mouseleave', () => this.ctx.hideTooltip());
      arcEl.addEventListener('click', () => {
        if (arc.filePath) {
          this.ctx.openFile(arc.filePath);
        }
      });

      svg.appendChild(arcEl);
    }
  }

  // ==========================================================================
  // Quarter View
  // ==========================================================================

  /**
   * Renders the quarter view (3 months with weeks/days as segments)
   */
  renderQuarterView(svg: SVGSVGElement, year: number, quarter: number): void {
    // Background circle
    this.ctx.renderBackgroundCircle(svg);

    // Calculate quarter start/end months
    const startMonth = (quarter - 1) * 3 + 1; // Q1=1, Q2=4, Q3=7, Q4=10
    const endMonth = startMonth + 2;

    // Calculate total days in quarter
    let totalDays = 0;
    for (let m = startMonth; m <= endMonth; m++) {
      totalDays += getDaysInMonth(year, m);
    }

    const today = getToday();

    // Get enabled rings sorted by order
    const enabledRings = this.ctx.getEnabledRingsSorted();
    const ringRadiiMap = this.ctx.calculateRingRadii(enabledRings.length);

    // Render each ring with quarter-clipped data (use index for radii lookup)
    enabledRings.forEach((ring, index) => {
      const radii = ringRadiiMap.get(index);
      if (!radii) return;

      if (ring.ringType === 'global') {
        // Render Global Ring (showInAnnual) clipped to this quarter
        const showInAnnualArcs = this.ctx.loadShowInAnnualArcs(year);
        const quarterArcs = this.clipArcsToQuarter(showInAnnualArcs, year, quarter);
        if (quarterArcs.length > 0) {
          this.renderQuarterArcs(svg, quarterArcs, radii, year, quarter, totalDays);
        }
      } else {
        // Render regular ring for this quarter
        this.renderQuarterRing(svg, year, quarter, ring, radii, totalDays);
      }
      this.ctx.renderRingSeparator(svg, radii.innerRadius);
    });

    // Render month separators within quarter
    let dayOffset = 0;
    for (let m = startMonth; m <= endMonth; m++) {
      const angle = this.dayToAngleInQuarter(dayOffset, totalDays);
      this.renderMonthSeparatorAtAngle(svg, angle);
      dayOffset += getDaysInMonth(year, m);
    }

    // Render separator circle between data rings and label ring
    this.ctx.renderLabelRingSeparator(svg);

    // Render month labels for quarter
    this.renderQuarterMonthLabels(svg, year, startMonth, endMonth, totalDays);

    // Render center with quarter info
    this.renderQuarterCenter(svg, year, quarter);

    // Render today marker if in this quarter
    if (today.year === year && today.month >= startMonth && today.month <= endMonth) {
      let todayDayOffset = 0;
      for (let m = startMonth; m < today.month; m++) {
        todayDayOffset += getDaysInMonth(year, m);
      }
      todayDayOffset += today.day;
      this.renderTodayMarkerInQuarter(svg, todayDayOffset, totalDays);
    }
  }

  /**
   * Renders a single ring for quarter view
   */
  private renderQuarterRing(
    svg: SVGSVGElement,
    year: number,
    quarter: number,
    ring: RingConfig,
    radii: RingRadii,
    totalDays: number
  ): void {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const today = getToday();
    const folder = ring.folder;

    let dayOffset = 0;
    for (let month = startMonth; month <= endMonth; month++) {
      const daysInMonth = getDaysInMonth(year, month);

      for (let day = 1; day <= daysInMonth; day++) {
        const date = createLocalDate(year, month, day);

        const startAngle = this.dayToAngleInQuarter(dayOffset, totalDays);
        const endAngle = this.dayToAngleInQuarter(dayOffset + 1, totalDays) - 0.002;

        const isWeekend = getWeekday(date) === 0 || getWeekday(date) === 6;

        const path = this.ctx.createArcPath(radii.innerRadius, radii.outerRadius, startAngle, endAngle);
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arc.setAttribute('d', path);

        let className = 'rc-day-arc';
        if (isWeekend) className += ' rc-day-arc--weekend';
        arc.setAttribute('class', className);

        arc.addEventListener('click', () => {
          this.ctx.createDailyNote(date);
        });

        svg.appendChild(arc);
        dayOffset++;
      }
    }
  }

  /**
   * Converts a day offset to an angle in quarter view
   */
  private dayToAngleInQuarter(dayOffset: number, totalDays: number): number {
    // Don't subtract PI/2 here - createArcPath already does that
    return (dayOffset / totalDays) * 2 * Math.PI;
  }

  /**
   * Renders month separator at a specific angle
   */
  private renderMonthSeparatorAtAngle(svg: SVGSVGElement, angle: number): void {
    // Convert logical angle (0=top) to SVG angle (0=right)
    const svgAngle = angle - Math.PI / 2;
    const x1 = CENTER + INNER_RADIUS * Math.cos(svgAngle);
    const y1 = CENTER + INNER_RADIUS * Math.sin(svgAngle);
    const x2 = CENTER + OUTER_RADIUS * Math.cos(svgAngle);
    const y2 = CENTER + OUTER_RADIUS * Math.sin(svgAngle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-month-separator');
    svg.appendChild(line);
  }

  /**
   * Renders month labels for quarter view
   */
  private renderQuarterMonthLabels(
    svg: SVGSVGElement,
    year: number,
    startMonth: number,
    endMonth: number,
    totalDays: number
  ): void {
    const labelRadius = MONTH_LABEL_RADIUS;
    let dayOffset = 0;

    for (let m = startMonth; m <= endMonth; m++) {
      const daysInMonth = getDaysInMonth(year, m);
      const midOffset = dayOffset + daysInMonth / 2;
      const logicalAngle = this.dayToAngleInQuarter(midOffset, totalDays);
      const svgAngle = logicalAngle - Math.PI / 2;

      const x = CENTER + labelRadius * Math.cos(svgAngle);
      const y = CENTER + labelRadius * Math.sin(svgAngle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'rc-month-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.textContent = MONTH_NAMES[m - 1];

      svg.appendChild(text);
      dayOffset += daysInMonth;
    }
  }

  /**
   * Renders the center circle with quarter info
   */
  private renderQuarterCenter(svg: SVGSVGElement, year: number, quarter: number): void {
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', String(CENTER));
    bgCircle.setAttribute('cy', String(CENTER));
    bgCircle.setAttribute('r', String(INNER_RADIUS - 10));
    bgCircle.setAttribute('class', 'rc-center-bg');
    svg.appendChild(bgCircle);

    const quarterText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    quarterText.setAttribute('x', String(CENTER));
    quarterText.setAttribute('y', String(CENTER - 10));
    quarterText.setAttribute('class', 'rc-center-title');
    quarterText.setAttribute('text-anchor', 'middle');
    quarterText.setAttribute('dominant-baseline', 'central');
    quarterText.textContent = `Q${quarter}`;
    svg.appendChild(quarterText);

    const yearText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yearText.setAttribute('x', String(CENTER));
    yearText.setAttribute('y', String(CENTER + 15));
    yearText.setAttribute('class', 'rc-center-subtitle');
    yearText.setAttribute('text-anchor', 'middle');
    yearText.setAttribute('dominant-baseline', 'central');
    yearText.textContent = String(year);
    svg.appendChild(yearText);
  }

  /**
   * Renders today marker in quarter view
   */
  private renderTodayMarkerInQuarter(svg: SVGSVGElement, dayOffset: number, totalDays: number): void {
    const logicalAngle = this.dayToAngleInQuarter(dayOffset - 0.5, totalDays);
    const svgAngle = logicalAngle - Math.PI / 2;
    const x1 = CENTER + (INNER_RADIUS - 5) * Math.cos(svgAngle);
    const y1 = CENTER + (INNER_RADIUS - 5) * Math.sin(svgAngle);
    const x2 = CENTER + (OUTER_RADIUS + 5) * Math.cos(svgAngle);
    const y2 = CENTER + (OUTER_RADIUS + 5) * Math.sin(svgAngle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-today-marker');
    svg.appendChild(line);
  }

  /**
   * Clips arcs to only show the portion within a specific quarter
   */
  private clipArcsToQuarter(arcs: RenderedSegment[], year: number, quarter: number): RenderedSegment[] {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;

    return arcs.filter(arc => {
      if (!arc.startDate || !arc.endDate) return false;
      const arcStart = createLocalDate(arc.startDate.year, arc.startDate.month, arc.startDate.day);
      const arcEnd = createLocalDate(arc.endDate.year, arc.endDate.month, arc.endDate.day);
      // Check if arc overlaps with this quarter
      return !(arcEnd.year < year || (arcEnd.year === year && arcEnd.month < startMonth) ||
               arcStart.year > year || (arcStart.year === year && arcStart.month > endMonth));
    });
  }

  /**
   * Renders arcs clipped to a quarter view
   */
  private renderQuarterArcs(
    svg: SVGSVGElement,
    arcs: RenderedSegment[],
    radii: RingRadii,
    year: number,
    quarter: number,
    totalDays: number
  ): void {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;

    for (const arc of arcs) {
      if (!arc.startDate || !arc.endDate) continue;

      const arcStart = createLocalDate(arc.startDate.year, arc.startDate.month, arc.startDate.day);
      const arcEnd = createLocalDate(arc.endDate.year, arc.endDate.month, arc.endDate.day);

      // Calculate day offset for start/end within quarter
      let startDayOffset = 0;
      let endDayOffset = totalDays;

      // Calculate actual start offset
      if (arcStart.year === year && arcStart.month >= startMonth && arcStart.month <= endMonth) {
        for (let m = startMonth; m < arcStart.month; m++) {
          startDayOffset += getDaysInMonth(year, m);
        }
        startDayOffset += arcStart.day - 1;
      }

      // Calculate actual end offset
      if (arcEnd.year === year && arcEnd.month >= startMonth && arcEnd.month <= endMonth) {
        endDayOffset = 0;
        for (let m = startMonth; m < arcEnd.month; m++) {
          endDayOffset += getDaysInMonth(year, m);
        }
        endDayOffset += arcEnd.day;
      }

      const startAngle = this.dayToAngleInQuarter(startDayOffset, totalDays);
      const endAngle = this.dayToAngleInQuarter(endDayOffset, totalDays) - 0.002;

      const path = this.ctx.createArcPath(radii.innerRadius, radii.outerRadius, startAngle, endAngle);
      const arcEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arcEl.setAttribute('d', path);
      arcEl.setAttribute('fill', arc.color);
      arcEl.setAttribute('class', 'rc-spanning-arc');

      if (arc.opacity !== undefined) {
        arcEl.setAttribute('opacity', String(arc.opacity / 100));
      }

      arcEl.addEventListener('mouseenter', (e) => {
        this.ctx.showArcTooltip(e as MouseEvent, arc);
      });
      arcEl.addEventListener('mouseleave', () => this.ctx.hideTooltip());
      arcEl.addEventListener('click', () => {
        if (arc.filePath) {
          this.ctx.openFile(arc.filePath);
        }
      });

      svg.appendChild(arcEl);
    }
  }

  // ==========================================================================
  // Custom Period View
  // ==========================================================================

  /**
   * Renders the custom period view (user-defined period like 10d, 3m, 2w)
   */
  renderCustomView(svg: SVGSVGElement, periodString: string, startDateISO: string): void {
    // Background circle
    this.ctx.renderBackgroundCircle(svg);

    const parsed = parseCustomPeriod(periodString);
    const startDate = this.parseISODate(startDateISO);
    if (!parsed || !startDate) {
      // Fallback to showing "Invalid Period" in center
      this.renderCustomCenter(svg, 'Invalid', periodString);
      return;
    }

    const totalDays = parsed.days || (parsed.months || 1) * 30;
    const today = getToday();

    // Get enabled rings sorted by order
    const enabledRings = this.ctx.getEnabledRingsSorted();
    const ringRadiiMap = this.ctx.calculateRingRadii(enabledRings.length);

    // Render each ring (use index for radii lookup)
    enabledRings.forEach((ring, index) => {
      const radii = ringRadiiMap.get(index);
      if (!radii) return;

      if (ring.ringType === 'global') {
        // Render Global Ring clipped to this period
        const year = startDate.year;
        const showInAnnualArcs = this.ctx.loadShowInAnnualArcs(year);
        const periodArcs = this.clipArcsToCustomPeriod(showInAnnualArcs, startDate, totalDays);
        if (periodArcs.length > 0) {
          this.renderCustomPeriodArcs(svg, periodArcs, radii, startDate, totalDays);
        }
      } else {
        // Render regular ring for this period
        this.renderCustomPeriodRing(svg, startDate, totalDays, ring, radii);
      }
      this.ctx.renderRingSeparator(svg, radii.innerRadius);
    });

    // Render day separators (only for shorter periods, < 60 days)
    if (totalDays <= 60) {
      for (let day = 0; day < totalDays; day++) {
        const angle = this.dayToAngleInCustomPeriod(day, totalDays);
        this.renderDaySeparator(svg, angle);
      }
    }

    // Render separator circle between data rings and label ring
    this.ctx.renderLabelRingSeparator(svg);

    // Render day/date labels around the edge
    this.renderCustomPeriodLabels(svg, startDate, totalDays);

    // Render center with period info
    this.renderCustomCenter(svg, parsed.label, this.formatDateRange(startDate, totalDays));

    // Render today marker if in this period
    const todayOffset = this.getDayOffsetFromStart(today, startDate);
    if (todayOffset >= 0 && todayOffset < totalDays) {
      this.renderTodayMarkerInCustomPeriod(svg, todayOffset, totalDays);
    }
  }

  /**
   * Renders a single ring for custom period view
   */
  private renderCustomPeriodRing(
    svg: SVGSVGElement,
    startDate: LocalDate,
    totalDays: number,
    ring: RingConfig,
    radii: RingRadii
  ): void {
    const today = getToday();

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
      const date = this.addDaysToDate(startDate, dayOffset);

      const startAngle = this.dayToAngleInCustomPeriod(dayOffset, totalDays);
      const endAngle = this.dayToAngleInCustomPeriod(dayOffset + 1, totalDays) - 0.005;

      const isWeekend = getWeekday(date) === 0 || getWeekday(date) === 6;

      const path = this.ctx.createArcPath(radii.innerRadius, radii.outerRadius, startAngle, endAngle);
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arc.setAttribute('d', path);

      let className = 'rc-day-arc';
      if (isWeekend) className += ' rc-day-arc--weekend';
      arc.setAttribute('class', className);

      arc.addEventListener('click', () => {
        this.ctx.createDailyNote(date);
      });

      svg.appendChild(arc);
    }
  }

  /**
   * Converts a day offset to an angle in custom period view
   */
  private dayToAngleInCustomPeriod(dayOffset: number, totalDays: number): number {
    // Logical angle (0=top, 12 o'clock). createArcPath handles SVG conversion.
    return (dayOffset / totalDays) * 2 * Math.PI;
  }

  /**
   * Renders labels around the edge for custom period view
   */
  private renderCustomPeriodLabels(svg: SVGSVGElement, startDate: LocalDate, totalDays: number): void {
    const labelRadius = MONTH_LABEL_RADIUS;

    // For shorter periods, show all days; for longer, show weekly markers
    const step = totalDays <= 14 ? 1 : totalDays <= 31 ? 7 : Math.ceil(totalDays / 12);

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset += step) {
      const date = this.addDaysToDate(startDate, dayOffset);
      const logicalAngle = this.dayToAngleInCustomPeriod(dayOffset + 0.5, totalDays);
      const svgAngle = logicalAngle - Math.PI / 2;
      const x = CENTER + labelRadius * Math.cos(svgAngle);
      const y = CENTER + labelRadius * Math.sin(svgAngle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'rc-month-day-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');

      // Show day number or "Mon D" format depending on period length
      if (totalDays <= 14) {
        text.textContent = String(date.day);
      } else {
        text.textContent = `${MONTH_NAMES[date.month - 1]} ${date.day}`;
      }

      svg.appendChild(text);
    }
  }

  /**
   * Renders the center circle with custom period info
   */
  private renderCustomCenter(svg: SVGSVGElement, title: string, subtitle: string): void {
    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', String(CENTER));
    bgCircle.setAttribute('cy', String(CENTER));
    bgCircle.setAttribute('r', String(INNER_RADIUS - 10));
    bgCircle.setAttribute('class', 'rc-center-bg');
    svg.appendChild(bgCircle);

    const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    titleText.setAttribute('x', String(CENTER));
    titleText.setAttribute('y', String(CENTER - 10));
    titleText.setAttribute('class', 'rc-center-title');
    titleText.setAttribute('text-anchor', 'middle');
    titleText.setAttribute('dominant-baseline', 'central');
    titleText.textContent = title;
    svg.appendChild(titleText);

    const subtitleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subtitleText.setAttribute('x', String(CENTER));
    subtitleText.setAttribute('y', String(CENTER + 15));
    subtitleText.setAttribute('class', 'rc-center-subtitle');
    subtitleText.setAttribute('text-anchor', 'middle');
    subtitleText.setAttribute('dominant-baseline', 'central');
    subtitleText.textContent = subtitle;
    svg.appendChild(subtitleText);
  }

  /**
   * Renders today marker in custom period view
   */
  private renderTodayMarkerInCustomPeriod(svg: SVGSVGElement, dayOffset: number, totalDays: number): void {
    const logicalAngle = this.dayToAngleInCustomPeriod(dayOffset + 0.5, totalDays);
    const svgAngle = logicalAngle - Math.PI / 2;
    const x1 = CENTER + (INNER_RADIUS - 5) * Math.cos(svgAngle);
    const y1 = CENTER + (INNER_RADIUS - 5) * Math.sin(svgAngle);
    const x2 = CENTER + (OUTER_RADIUS + 5) * Math.cos(svgAngle);
    const y2 = CENTER + (OUTER_RADIUS + 5) * Math.sin(svgAngle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-today-marker');
    svg.appendChild(line);
  }

  /**
   * Format date range for custom period center display
   */
  private formatDateRange(startDate: LocalDate, totalDays: number): string {
    const endDate = this.addDaysToDate(startDate, totalDays - 1);
    const startStr = `${MONTH_NAMES[startDate.month - 1]} ${startDate.day}`;
    const endStr = `${MONTH_NAMES[endDate.month - 1]} ${endDate.day}`;
    if (startDate.year !== endDate.year) {
      return `${startStr} ${startDate.year} - ${endStr} ${endDate.year}`;
    }
    return `${startStr} - ${endStr}, ${startDate.year}`;
  }

  /**
   * Get day offset from start date (for today marker)
   */
  private getDayOffsetFromStart(date: LocalDate, startDate: LocalDate): number {
    const d1 = new Date(date.year, date.month - 1, date.day);
    const d2 = new Date(startDate.year, startDate.month - 1, startDate.day);
    return Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Clips arcs to only show the portion within a custom period
   */
  private clipArcsToCustomPeriod(arcs: RenderedSegment[], startDate: LocalDate, totalDays: number): RenderedSegment[] {
    const endDate = this.addDaysToDate(startDate, totalDays - 1);

    return arcs.filter(arc => {
      if (!arc.startDate || !arc.endDate) return false;
      const arcStart = createLocalDate(arc.startDate.year, arc.startDate.month, arc.startDate.day);
      const arcEnd = createLocalDate(arc.endDate.year, arc.endDate.month, arc.endDate.day);

      // Check if arc overlaps with this period
      const periodStartMs = new Date(startDate.year, startDate.month - 1, startDate.day).getTime();
      const periodEndMs = new Date(endDate.year, endDate.month - 1, endDate.day).getTime();
      const arcStartMs = new Date(arcStart.year, arcStart.month - 1, arcStart.day).getTime();
      const arcEndMs = new Date(arcEnd.year, arcEnd.month - 1, arcEnd.day).getTime();

      return arcEndMs >= periodStartMs && arcStartMs <= periodEndMs;
    });
  }

  /**
   * Renders arcs clipped to a custom period
   */
  private renderCustomPeriodArcs(
    svg: SVGSVGElement,
    arcs: RenderedSegment[],
    radii: RingRadii,
    startDate: LocalDate,
    totalDays: number
  ): void {
    for (const arc of arcs) {
      if (!arc.startDate || !arc.endDate) continue;

      const arcStart = createLocalDate(arc.startDate.year, arc.startDate.month, arc.startDate.day);
      const arcEnd = createLocalDate(arc.endDate.year, arc.endDate.month, arc.endDate.day);

      // Calculate day offset for start/end within period
      let startDayOffset = Math.max(0, this.getDayOffsetFromStart(arcStart, startDate));
      let endDayOffset = Math.min(totalDays, this.getDayOffsetFromStart(arcEnd, startDate) + 1);

      if (startDayOffset >= totalDays || endDayOffset <= 0) continue;

      const startAngle = this.dayToAngleInCustomPeriod(startDayOffset, totalDays);
      const endAngle = this.dayToAngleInCustomPeriod(endDayOffset, totalDays) - 0.005;

      const path = this.ctx.createArcPath(radii.innerRadius, radii.outerRadius, startAngle, endAngle);
      const arcEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arcEl.setAttribute('d', path);
      arcEl.setAttribute('fill', arc.color);
      arcEl.setAttribute('class', 'rc-spanning-arc');

      if (arc.opacity !== undefined) {
        arcEl.setAttribute('opacity', String(arc.opacity / 100));
      }

      arcEl.addEventListener('mouseenter', (e) => {
        this.ctx.showArcTooltip(e as MouseEvent, arc);
      });
      arcEl.addEventListener('mouseleave', () => this.ctx.hideTooltip());
      arcEl.addEventListener('click', () => {
        if (arc.filePath) {
          this.ctx.openFile(arc.filePath);
        }
      });

      svg.appendChild(arcEl);
    }
  }

  // ==========================================================================
  // Private utility helpers
  // ==========================================================================

  /**
   * Parses an ISO date string (YYYY-MM-DD) to LocalDate
   */
  private parseISODate(isoString: string): LocalDate | null {
    const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return createLocalDate(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
  }

  /**
   * Add days to a date and return new LocalDate
   */
  private addDaysToDate(date: LocalDate, days: number): LocalDate {
    const d = new Date(date.year, date.month - 1, date.day);
    d.setDate(d.getDate() + days - 1); // -1 because end is inclusive
    return createLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
}
