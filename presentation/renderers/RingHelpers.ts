/**
 * RingHelpers - Common Rendering Helpers for the Annual Ring View.
 *
 * Extracted from RadialCalendarView.ts (lines 2870-4109).
 * Contains all methods for rendering individual rings, arcs, and indicators
 * within the radial annual calendar view.
 *
 * Dependencies are injected via RingHelpersConfig to allow reuse outside
 * the RadialCalendarView class.
 */

import { Menu } from 'obsidian';
import type { CalendarEntry } from '../../core/domain/models/CalendarEntry';
import type { LocalDate } from '../../core/domain/models/LocalDate';
import { getToday, createLocalDate, getWeekday, getDaysInMonth } from '../../core/domain/models/LocalDate';
import type {
  RadialCalendarSettings,
  RingConfig,
  RenderedSegment,
  PhaseWithTrack,
  PatternName,
} from '../../core/domain/types';
import {
  RING_COLORS,
  assignTracks,
  computeSubRingRadii,
  getMaxTrackCount,
} from '../../core/domain/types';
import type { CalendarService } from '../../application/services/CalendarService';
import { createArcPath as sharedCreateArcPath, monthToAngle as sharedMonthToAngle } from '../svg/SvgArc';
import {
  CENTER,
  OUTER_RADIUS,
  INNER_RADIUS,
  DATA_RING_INNER,
  ANNIVERSARY_RING_RADIUS,
  ANNIVERSARY_DOT_RADIUS,
  FULL_MONTH_NAMES,
} from '../svg/RingLayout';

// Re-export RingRadii from RingLayout for callers that use it alongside RingHelpers
export type { RingRadii } from '../svg/RingLayout';

/**
 * Callbacks into the host view that the extracted helpers depend on.
 * These correspond to private methods on RadialCalendarView that are NOT part
 * of the "Common Rendering Helpers" section and therefore stay in the view.
 */
export interface RingHelpersCallbacks {
  /** Applies pattern/opacity/fade visual options to an arc element. */
  applyVisualOptions: (
    arcEl: SVGPathElement,
    defs: SVGDefsElement,
    color: string,
    options: {
      pattern?: PatternName;
      opacity?: number;
      fade?: boolean;
      startAngle?: number;
      endAngle?: number;
      id?: string;
      startDate?: LocalDate;
      endDate?: LocalDate | null;
    }
  ) => void;

  /** Gets or creates the <defs> element within an SVG. */
  getOrCreateDefs: (svg: SVGSVGElement) => SVGDefsElement;

  /** Renders a ring label at the 9 o'clock position. */
  renderRingLabel: (
    svg: SVGSVGElement,
    label: string,
    outerRadius: number,
    innerRadius: number
  ) => void;

  /** Shows a tooltip for anniversary dots. */
  showAnniversaryTooltip: (event: MouseEvent, entries: readonly CalendarEntry[]) => void;

  /** Hides the tooltip. */
  hideTooltip: () => void;

  /** Shows a tooltip for spanning arc hover. */
  showSpanningArcTooltip: (event: MouseEvent, arc: PhaseWithTrack, ring: RingConfig) => void;

  /** Shows the day context menu (right-click / click with entries). */
  showDayContextMenu: (event: MouseEvent, date: LocalDate, entries: readonly CalendarEntry[]) => void;

  /** Shows a ring-specific tooltip for a day arc. */
  showRingTooltip: (
    event: MouseEvent,
    date: LocalDate,
    entries: readonly CalendarEntry[],
    ring: RingConfig
  ) => void;

  /** Shows a menu for selecting among multiple anniversary entries. */
  showAnniversaryMenu: (event: MouseEvent, entries: readonly CalendarEntry[]) => void;

  /** Opens a file by its vault path. */
  openFile: (path: string) => Promise<void>;

  /** Opens (or creates) the daily note for the given date. */
  openDailyNote: (date: LocalDate) => Promise<void>;
}

export interface RingHelpersConfig {
  settings: RadialCalendarSettings;
  service: CalendarService;
  callbacks: RingHelpersCallbacks;
}

/** Calculated radii for a ring (outer/inner bounds). */
export interface RingRadiiLocal {
  innerRadius: number;
  outerRadius: number;
}

/**
 * RingHelpers provides all common rendering helpers for the annual ring view.
 *
 * Usage:
 * ```ts
 * const helpers = new RingHelpers({ settings, service, callbacks });
 * helpers.renderYearBoundaryMarker(svg);
 * helpers.renderRing(svg, year, ring, radii);
 * ```
 */
export class RingHelpers {
  private readonly settings: RadialCalendarSettings;
  private readonly service: CalendarService;
  private readonly cb: RingHelpersCallbacks;

  constructor(config: RingHelpersConfig) {
    this.settings = config.settings;
    this.service = config.service;
    this.cb = config.callbacks;
  }

  // --------------------------------------------------------------------------
  // Geometry helpers (wrappers around shared SvgArc functions)
  // --------------------------------------------------------------------------

  private createArcPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string {
    return sharedCreateArcPath(CENTER, innerR, outerR, startAngle, endAngle);
  }

  private monthToAngle(month: number): number {
    return sharedMonthToAngle(month);
  }

  // --------------------------------------------------------------------------
  // Ring separator / boundary markers
  // --------------------------------------------------------------------------

  /**
   * Renders a marker at the year boundary (top of circle, between Dec 31 and Jan 1).
   */
  renderYearBoundaryMarker(svg: SVGSVGElement): void {
    const angle = -Math.PI / 2; // 0 degrees in SVG coordinates

    const x1 = CENTER + (INNER_RADIUS - 5) * Math.cos(angle);
    const y1 = CENTER + (INNER_RADIUS - 5) * Math.sin(angle);
    const x2 = CENTER + (OUTER_RADIUS + 5) * Math.cos(angle);
    const y2 = CENTER + (OUTER_RADIUS + 5) * Math.sin(angle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-year-boundary-marker');
    svg.appendChild(line);

    // Add small label
    const labelY = CENTER - OUTER_RADIUS - 12;
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(CENTER));
    label.setAttribute('y', String(labelY));
    label.setAttribute('class', 'rc-year-boundary-label');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.textContent = '▼';
    svg.appendChild(label);
  }

  /**
   * Renders a separator circle between data rings and the label ring.
   */
  renderLabelRingSeparator(svg: SVGSVGElement): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(DATA_RING_INNER));
    circle.setAttribute('class', 'rc-label-ring-separator');
    svg.appendChild(circle);
  }

  /**
   * Renders a separator circle at a given radius to delineate rings.
   */
  renderRingSeparator(svg: SVGSVGElement, radius: number): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(radius));
    circle.setAttribute('class', 'rc-ring-separator');
    svg.appendChild(circle);
  }

  // --------------------------------------------------------------------------
  // Anniversary ring
  // --------------------------------------------------------------------------

  /**
   * Renders the anniversary ring with dots for recurring events.
   */
  renderAnniversaryRing(svg: SVGSVGElement, year: number): void {
    const anniversaryEntries = this.service.getAllAnniversaryEntries();
    if (anniversaryEntries.length === 0) return;

    // Group entries by month-day
    const entriesByMonthDay = new Map<string, typeof anniversaryEntries[number][]>();
    for (const entry of anniversaryEntries) {
      const key = `${String(entry.startDate.month).padStart(2, '0')}-${String(entry.startDate.day).padStart(2, '0')}`;
      const existing = entriesByMonthDay.get(key) ?? [];
      existing.push(entry);
      entriesByMonthDay.set(key, existing);
    }

    // Render a dot for each unique month-day
    for (const [monthDay, entries] of entriesByMonthDay) {
      const [monthStr, dayStr] = monthDay.split('-');
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);

      const daysInMonth = getDaysInMonth(year, month);
      const startAngle = this.monthToAngle(month);
      const monthArcSpan = Math.PI / 6;  // 30 degrees per month
      const dayOffset = (day - 0.5) / daysInMonth;
      const angle = startAngle + dayOffset * monthArcSpan;

      const x = CENTER + ANNIVERSARY_RING_RADIUS * Math.cos(angle - Math.PI / 2);
      const y = CENTER + ANNIVERSARY_RING_RADIUS * Math.sin(angle - Math.PI / 2);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', String(ANNIVERSARY_DOT_RADIUS));
      dot.setAttribute('class', 'rc-anniversary-dot');

      const firstEntry = entries[0];
      dot.addEventListener('mouseenter', (e) => {
        this.cb.showAnniversaryTooltip(e as MouseEvent, entries);
      });
      dot.addEventListener('mouseleave', () => this.cb.hideTooltip());
      dot.addEventListener('click', () => {
        this.cb.openFile(firstEntry.filePath);
      });

      svg.appendChild(dot);
    }
  }

  // --------------------------------------------------------------------------
  // Ring rendering
  // --------------------------------------------------------------------------

  /**
   * Renders a single ring with its entries.
   * If showSpanningArcs is enabled, renders BOTH:
   * - Daily notes at the bottom portion of the ring
   * - Spanning arcs stacked on top (10% each)
   */
  renderRing(
    svg: SVGSVGElement,
    year: number,
    ring: RingConfig,
    radii: RingRadiiLocal
  ): void {
    const ringColor = RING_COLORS[ring.color] || RING_COLORS.blue;
    const ringHeight = radii.outerRadius - radii.innerRadius;

    if (ring.showSpanningArcs) {
      const presets: never[] = [];
      const arcs = this.service.loadSpanningArcs(ring.folder, year, {
        startDateField: ring.startDateField || 'radcal-start',
        endDateField: ring.endDateField || 'radcal-end',
        colorField: ring.colorField || 'radcal-color',
        labelField: ring.labelField || 'radcal-label',
      }, presets);

      const arcsWithTracks = arcs.length > 0 ? assignTracks(arcs) : [];
      const trackCount = arcsWithTracks.length > 0 ? getMaxTrackCount(arcsWithTracks) : 0;
      const hasSpanningArcs = trackCount > 0;

      const hasDailyNotes = this.ringHasDailyNotes(ring, year);

      if (hasDailyNotes && !hasSpanningArcs) {
        // Only daily notes: 100%
        for (let month = 1; month <= 12; month++) {
          this.renderRingMonthSegment(svg, year, month, ring, radii, ringColor);
        }
      } else if (hasSpanningArcs && !hasDailyNotes) {
        // Only spanning arcs: 100%
        for (const arc of arcsWithTracks) {
          const arcRadii = computeSubRingRadii(
            radii.outerRadius,
            radii.innerRadius,
            trackCount,
            arc.track
          );
          this.renderSpanningArc(svg, arc, arcRadii, ring, ringColor);
        }
      } else if (hasSpanningArcs && hasDailyNotes) {
        // Both: dynamic allocation based on track count
        const TRACK_HEIGHT_PERCENT = 0.15;
        const ARCS_MAX_PERCENT = 0.60;
        const DAILY_MIN_PERCENT = 0.40;

        const desiredArcsPercent = trackCount * TRACK_HEIGHT_PERCENT;
        const arcsHeight = Math.min(ARCS_MAX_PERCENT, desiredArcsPercent);
        const dailyNotesHeight = Math.max(DAILY_MIN_PERCENT, 1 - arcsHeight);

        const dailyNotesRadii: RingRadiiLocal = {
          innerRadius: radii.innerRadius,
          outerRadius: radii.innerRadius + (ringHeight * dailyNotesHeight),
        };

        for (let month = 1; month <= 12; month++) {
          this.renderRingMonthSegment(svg, year, month, ring, dailyNotesRadii, ringColor);
        }

        const arcsOuterRadius = radii.outerRadius;
        const arcsInnerRadius = dailyNotesRadii.outerRadius;

        for (const arc of arcsWithTracks) {
          const arcRadii = computeSubRingRadii(
            arcsOuterRadius,
            arcsInnerRadius,
            trackCount,
            arc.track
          );
          this.renderSpanningArc(svg, arc, arcRadii, ring, ringColor);
        }
      } else {
        // Neither: render empty ring background
        this.renderEmptyRingBackground(svg, radii);
      }
    } else {
      // Spanning arcs disabled: render only daily notes (full ring height)
      for (let month = 1; month <= 12; month++) {
        this.renderRingMonthSegment(svg, year, month, ring, radii, ringColor);
      }
    }
  }

  /**
   * Renders the showInAnnual ring with global arcs (radcal-showInAnnual: true).
   */
  renderShowInAnnualRing(
    svg: SVGSVGElement,
    arcs: RenderedSegment[],
    radii: RingRadiiLocal
  ): void {
    if (arcs.length === 0) return;

    const arcsWithTracks = assignTracks(arcs);
    const trackCount = getMaxTrackCount(arcsWithTracks);

    const ringColor = RING_COLORS.gray;

    const virtualRing: RingConfig = {
      id: 'global-spanning',
      name: 'Global',
      folder: '',
      color: 'gray',
      segmentType: 'daily',
      enabled: true,
      order: 999,
      showSpanningArcs: true,
    };

    for (const arc of arcsWithTracks) {
      const arcRadii = computeSubRingRadii(
        radii.outerRadius,
        radii.innerRadius,
        trackCount,
        arc.track
      );
      this.renderSpanningArc(svg, arc, arcRadii, virtualRing, ringColor);
    }

    this.cb.renderRingLabel(svg, 'Global', radii.outerRadius, radii.innerRadius);
  }

  /**
   * Renders a ring with spanning arcs (multi-day events).
   */
  renderSpanningArcsRing(
    svg: SVGSVGElement,
    year: number,
    ring: RingConfig,
    radii: RingRadiiLocal,
    ringColor: string
  ): void {
    const presets: never[] = [];
    const arcs = this.service.loadSpanningArcs(ring.folder, year, {
      startDateField: ring.startDateField || 'radcal-start',
      endDateField: ring.endDateField || 'radcal-end',
      colorField: ring.colorField || 'radcal-color',
      labelField: ring.labelField || 'radcal-label',
    }, presets);

    if (arcs.length === 0) {
      this.renderEmptyRingBackground(svg, radii);
      return;
    }

    const arcsWithTracks = assignTracks(arcs);
    const trackCount = getMaxTrackCount(arcsWithTracks);

    for (const arc of arcsWithTracks) {
      const arcRadii = computeSubRingRadii(
        radii.outerRadius,
        radii.innerRadius,
        trackCount,
        arc.track
      );
      this.renderSpanningArc(svg, arc, arcRadii, ring, ringColor);
    }
  }

  /**
   * Renders an empty ring background (for rings with no entries).
   */
  renderEmptyRingBackground(svg: SVGSVGElement, radii: RingRadiiLocal): void {
    const path = this.createArcPath(radii.innerRadius, radii.outerRadius, 0, 2 * Math.PI - 0.001);
    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', path);
    arc.setAttribute('class', 'rc-ring-arc');
    arc.style.fill = 'var(--background-secondary)';
    arc.style.fillOpacity = '0.3';
    svg.appendChild(arc);
  }

  /**
   * Renders a single spanning arc.
   */
  renderSpanningArc(
    svg: SVGSVGElement,
    arc: PhaseWithTrack,
    radii: { inner: number; outer: number },
    ring: RingConfig,
    fallbackColor: string
  ): void {
    const defs = this.cb.getOrCreateDefs(svg);

    const path = this.createArcPath(radii.inner, radii.outer, arc.startAngle, arc.endAngle);

    const arcEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arcEl.setAttribute('d', path);
    arcEl.setAttribute('class', 'rc-ring-arc');

    const arcColor = arc.color || fallbackColor;

    this.cb.applyVisualOptions(arcEl, defs, arcColor, {
      pattern: arc.pattern,
      opacity: arc.opacity,
      fade: arc.fade,
      startAngle: arc.startAngle,
      endAngle: arc.endAngle,
      id: arc.id,
      startDate: arc.startDate,
      endDate: arc.endDate,
    });

    if (arc.filePath) {
      arcEl.style.cursor = 'pointer';
      arcEl.addEventListener('click', () => {
        this.cb.openFile(arc.filePath!);
      });
    }

    arcEl.addEventListener('mouseenter', (e) => {
      this.cb.showSpanningArcTooltip(e, arc, ring);
    });
    arcEl.addEventListener('mouseleave', () => this.cb.hideTooltip());

    svg.appendChild(arcEl);

    if (arc.continuesFromPreviousYear) {
      this.renderCrossYearIndicator(svg, radii, 0, arcColor, 'start');
    }
    if (arc.continuesIntoNextYear) {
      this.renderCrossYearIndicator(svg, radii, 2 * Math.PI - 0.001, arcColor, 'end');
    }

    if (arc.label && (arc.endAngle - arc.startAngle) > 0.26) {
      this.renderSpanningArcLabel(svg, arc, radii);
    }
  }

  /**
   * Renders an indicator showing an arc continues from/into another year.
   */
  renderCrossYearIndicator(
    svg: SVGSVGElement,
    radii: { inner: number; outer: number },
    angle: number,
    color: string,
    type: 'start' | 'end'
  ): void {
    const adjustedAngle = angle - Math.PI / 2;
    const ringWidth = radii.outer - radii.inner;
    const triSize = ringWidth * 0.6;

    const radius = type === 'end' ? radii.outer : radii.inner;
    const cx = CENTER + radius * Math.cos(adjustedAngle);
    const cy = CENTER + radius * Math.sin(adjustedAngle);

    const tangentAngle = adjustedAngle + Math.PI / 2;
    const direction = type === 'end' ? 1 : -1;
    const radialDir = type === 'end' ? -1 : 1;

    const tipX = cx + direction * triSize * 0.6 * Math.cos(tangentAngle);
    const tipY = cy + direction * triSize * 0.6 * Math.sin(tangentAngle);

    const baseOffset = direction * triSize * 0.3;
    const baseCx = cx - baseOffset * Math.cos(tangentAngle);
    const baseCy = cy - baseOffset * Math.sin(tangentAngle);

    const radialOffset = triSize * 0.4;
    const base1X = baseCx + radialDir * radialOffset * Math.cos(adjustedAngle);
    const base1Y = baseCy + radialDir * radialOffset * Math.sin(adjustedAngle);
    const base2X = baseCx - radialDir * radialOffset * Math.cos(adjustedAngle);
    const base2Y = baseCy - radialDir * radialOffset * Math.sin(adjustedAngle);

    const points = `${tipX},${tipY} ${base1X},${base1Y} ${base2X},${base2Y}`;

    const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    triangle.setAttribute('points', points);
    triangle.setAttribute('class', 'rc-cross-year-indicator');
    triangle.style.fill = color;
    svg.appendChild(triangle);
  }

  /**
   * Renders a label on a spanning arc.
   */
  renderSpanningArcLabel(
    svg: SVGSVGElement,
    arc: PhaseWithTrack,
    radii: { inner: number; outer: number }
  ): void {
    const midAngle = (arc.startAngle + arc.endAngle) / 2 - Math.PI / 2;
    const labelRadius = (radii.inner + radii.outer) / 2;
    const x = CENTER + labelRadius * Math.cos(midAngle);
    const y = CENTER + labelRadius * Math.sin(midAngle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('class', 'rc-phase-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');

    const rotationDeg = (midAngle + Math.PI / 2) * 180 / Math.PI;
    const adjustedRotation = rotationDeg > 90 && rotationDeg < 270 ? rotationDeg + 180 : rotationDeg;
    text.setAttribute('transform', `rotate(${adjustedRotation}, ${x}, ${y})`);

    text.textContent = arc.label;
    svg.appendChild(text);
  }

  // --------------------------------------------------------------------------
  // Month segment and day arc rendering
  // --------------------------------------------------------------------------

  /**
   * Renders a month segment for a specific ring.
   */
  renderRingMonthSegment(
    svg: SVGSVGElement,
    year: number,
    month: number,
    ring: RingConfig,
    radii: RingRadiiLocal,
    ringColor: string
  ): void {
    const daysInMonth = getDaysInMonth(year, month);
    const startAngle = this.monthToAngle(month);
    const monthArcSpan = Math.PI / 6;
    const dayArcSpan = monthArcSpan / daysInMonth;

    const today = getToday();
    const isCurrentMonth = today.year === year && today.month === month;

    // Pre-fetch entries for the month (used by getEntriesForRing internally)
    // Keep this call to match original behavior (result is unused here but
    // mirrors the original for side-effect consistency).
    void this.service.getEntriesForDate(createLocalDate(year, month, 1));

    for (let day = 1; day <= daysInMonth; day++) {
      const date = createLocalDate(year, month, day);
      const dayOfWeek = getWeekday(date);
      const isToday = isCurrentMonth && today.day === day;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const dayStartAngle = startAngle + (day - 1) * dayArcSpan;
      const dayEndAngle = dayStartAngle + dayArcSpan - 0.002;

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
   * Gets entries for a specific date filtered by ring folder.
   */
  private getEntriesForRing(date: LocalDate, ring: RingConfig): readonly CalendarEntry[] {
    const allEntries = this.service.getEntriesForDate(date);

    if (!ring.folder || ring.folder.trim() === '') {
      return allEntries;
    }

    const normalizedRingFolder = ring.folder.replace(/^\/+|\/+$/g, '');

    return allEntries.filter(entry => {
      const entryFolder = entry.metadata.folder || '';
      const normalizedEntryFolder = entryFolder.replace(/^\/+|\/+$/g, '');
      return normalizedEntryFolder === normalizedRingFolder ||
             normalizedEntryFolder.startsWith(normalizedRingFolder + '/');
    });
  }

  /**
   * Renders a day arc for a specific ring.
   */
  renderRingDayArc(
    svg: SVGSVGElement,
    date: LocalDate,
    startAngle: number,
    endAngle: number,
    isToday: boolean,
    isWeekend: boolean,
    entries: readonly CalendarEntry[],
    radii: RingRadiiLocal,
    ringColor: string,
    ring: RingConfig
  ): void {
    const ringWidth = radii.outerRadius - radii.innerRadius;
    const anniversaryHeight = ringWidth * 0.1;
    const mainArcOuterRadius = radii.outerRadius - anniversaryHeight;

    const anniversaryEntries = this.service.getAnniversaryEntriesForDate(date);
    const hasAnniversary = anniversaryEntries.length > 0;

    const path = this.createArcPath(radii.innerRadius, mainArcOuterRadius, startAngle, endAngle);

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

    if (entries.length > 0) {
      arc.style.fill = ringColor;
      arc.style.fillOpacity = '0.6';
    }

    arc.addEventListener('click', async (e) => {
      e.preventDefault();
      if (entries.length > 0) {
        this.cb.showDayContextMenu(e, date, entries);
      } else {
        await this.cb.openDailyNote(date);
      }
    });

    arc.addEventListener('mouseenter', (e) => {
      this.cb.showRingTooltip(e, date, entries, ring);
    });

    arc.addEventListener('mouseleave', () => {
      this.cb.hideTooltip();
    });

    arc.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.cb.showDayContextMenu(e, date, entries);
    });

    svg.appendChild(arc);

    if (hasAnniversary) {
      this.renderAnniversaryIndicator(
        svg,
        startAngle,
        endAngle,
        mainArcOuterRadius,
        radii.outerRadius,
        anniversaryEntries,
        date
      );
    }
  }

  /**
   * Renders anniversary indicator as a thin arc at the outer edge of the day ring.
   */
  renderAnniversaryIndicator(
    svg: SVGSVGElement,
    startAngle: number,
    endAngle: number,
    innerRadius: number,
    outerRadius: number,
    entries: readonly CalendarEntry[],
    date: LocalDate
  ): void {
    const path = this.createArcPath(innerRadius, outerRadius, startAngle, endAngle);
    const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    indicator.setAttribute('d', path);
    indicator.setAttribute('class', 'rc-anniversary-indicator');

    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      if (entries.length === 1) {
        this.cb.openFile(entries[0].filePath);
      } else if (entries.length > 1) {
        this.cb.showAnniversaryMenu(e as MouseEvent, entries);
      }
    });

    indicator.addEventListener('mouseenter', (e) => {
      this.cb.showAnniversaryTooltip(e as MouseEvent, entries);
    });

    indicator.addEventListener('mouseleave', () => {
      this.cb.hideTooltip();
    });

    svg.appendChild(indicator);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Checks if a ring has any daily notes (single-day entries without spanning dates).
   * Samples first and mid-month days for performance.
   */
  private ringHasDailyNotes(ring: RingConfig, year: number): boolean {
    for (let month = 1; month <= 12; month++) {
      const date = createLocalDate(year, month, 1);
      const entries = this.getEntriesForRing(date, ring);
      if (entries.length > 0) return true;

      const midDate = createLocalDate(year, month, 15);
      const midEntries = this.getEntriesForRing(midDate, ring);
      if (midEntries.length > 0) return true;
    }

    return false;
  }
}
