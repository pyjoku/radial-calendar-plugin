/**
 * LifeRenderer - Renders the Life View (nested clock) for the Radial Calendar.
 *
 * Extracted from RadialCalendarView.ts as part of the Phase 1 monolith split.
 *
 * Renders:
 *   - Life ring (outer): birth-year to expected end, one segment per year
 *   - Life phases ring (middle): phases loaded from a folder, grouped by ring
 *   - Year ring (inner): 12 months, each day as an arc
 *   - Life acts: colored ticks outside the life ring
 *   - Position markers: today + viewed-year lines
 *   - Center: year + age text
 *   - Birthday marker on year ring
 */

import { Menu, TFile } from 'obsidian';
import type { CalendarService } from '../../application/services/CalendarService';
import type { LocalDate } from '../../core/domain/models/LocalDate';
import { getToday, createLocalDate, getWeekday, getDaysInMonth } from '../../core/domain/models/LocalDate';
import type {
  RadialCalendarSettings,
  PhaseWithTrack,
  PatternName,
  LifeActConfig,
} from '../../core/domain/types';
import {
  RING_COLORS,
  SVG_PATTERN_BUILDERS,
  assignTracks,
  computeSubRingRadii,
  getMaxTrackCount,
} from '../../core/domain/types';
import {
  CENTER,
  CENTER_RADIUS,
  YEAR_RING_INNER,
  YEAR_RING_OUTER,
  LIFE_PHASES_RING_INNER,
  LIFE_PHASES_RING_OUTER,
  LIFE_RING_INNER,
  LIFE_RING_OUTER,
  MONTH_NAMES,
} from '../svg/RingLayout';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface LifeRendererDeps {
  settings: RadialCalendarSettings;
  service: CalendarService;
  /** Obsidian App instance (typed as any to avoid a hard dependency on the full App type) */
  app: any;
  /** Open a file in the workspace */
  openFile: (path: string) => Promise<void>;
  /** Tooltip element managed by the parent view */
  tooltipEl: HTMLElement | null;
  /** Tooltip container for centering */
  containerEl: HTMLElement | null;
  /** Set of visible ring names (empty = all visible) */
  visibleRings: Set<string>;
  /** Callback to trigger a full view re-render (e.g. after modal close) */
  onRefresh: () => void;
}

/**
 * LifeRenderer renders all life-view related rings onto the provided SVG element.
 *
 * Usage:
 *   const renderer = new LifeRenderer(deps);
 *   renderer.render(svg, year);
 */
export class LifeRenderer {
  private readonly deps: LifeRendererDeps;

  constructor(deps: LifeRendererDeps) {
    this.deps = deps;
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Renders the nested clock view (Life View) onto the given SVG element.
   * Caller is responsible for providing an empty SVG with the correct viewBox.
   */
  render(svg: SVGSVGElement, year: number): void {
    const { settings } = this.deps;
    const { birthYear, expectedLifespan } = settings;
    const endYear = birthYear + expectedLifespan;
    const today = getToday();
    const currentAge = today.year - birthYear;

    // 1. Life Ring (outer - years)
    this.renderLifeRing(svg, birthYear, endYear, year);

    // 2. Life Phases Ring (middle - from folder)
    this.renderLifePhasesRing(svg, birthYear, expectedLifespan);

    // 3. Year Ring (inner - months/days)
    this.renderYearRing(svg, year);

    // 4. Life Acts (if configured - outer ticks)
    this.renderLifeActsOnRing(svg, birthYear, expectedLifespan);

    // 5. Center with info
    this.renderNestedCenter(svg, year, currentAge);

    // 6. Today marker on life ring
    this.renderLifePositionMarker(svg, birthYear, expectedLifespan, today.year, 'today');

    // 7. Viewed year marker on life ring (if different from today)
    if (year !== today.year) {
      this.renderLifePositionMarker(svg, birthYear, expectedLifespan, year, 'viewed');
    }

    // 8. Today marker on year ring
    if (year === today.year) {
      this.renderTodayMarkerOnYearRing(svg);
    }

    // 9. Birthday marker on year ring (if birthDate is set)
    this.renderBirthdayMarkerOnYearRing(svg, year);
  }

  // ============================================================
  // Life Ring
  // ============================================================

  /**
   * Renders the life ring (outer ring showing years).
   */
  private renderLifeRing(svg: SVGSVGElement, birthYear: number, endYear: number, selectedYear: number): void {
    const totalYears = endYear - birthYear;
    const today = getToday();

    for (let y = birthYear; y < endYear; y++) {
      const yearIndex = y - birthYear;
      const startAngle = (yearIndex / totalYears) * 2 * Math.PI;
      const endAngle = ((yearIndex + 1) / totalYears) * 2 * Math.PI - 0.01;

      const isPast = y < today.year;
      const isCurrent = y === today.year;
      const isSelected = y === selectedYear;

      // Calculate decade (0-based from birth year)
      const decadeIndex = Math.floor(yearIndex / 10);
      const isEvenDecade = decadeIndex % 2 === 0;

      const path = this.createArcPath(LIFE_RING_INNER, LIFE_RING_OUTER, startAngle, endAngle);
      const arc = document.createElementNS(SVG_NS, 'path');
      arc.setAttribute('d', path);

      let cls = 'rc-life-year';
      if (isPast) cls += ' rc-life-year--past';
      if (isCurrent) cls += ' rc-life-year--current';
      if (isSelected) cls += ' rc-life-year--selected';
      cls += isEvenDecade ? ' rc-life-year--decade-even' : ' rc-life-year--decade-odd';

      arc.setAttribute('class', cls);
      arc.setAttribute('data-year', String(y));

      // Click to navigate to that year
      arc.addEventListener('click', () => {
        this.deps.service.setYear(y);
      });

      // Hover tooltip
      arc.addEventListener('mouseenter', (e) => {
        this.showLifeYearTooltip(e, y, y - birthYear);
      });
      arc.addEventListener('mouseleave', () => this.hideTooltip());

      svg.appendChild(arc);
    }

    // Decade boundary ticks (subtle markers at every 10 years)
    for (let y = birthYear + 10; y < endYear; y += 10) {
      const yearIndex = y - birthYear;
      const angle = (yearIndex / totalYears) * 2 * Math.PI - Math.PI / 2;

      const tickInner = LIFE_RING_OUTER - 2;
      const tickOuter = LIFE_RING_OUTER + 4;
      const x1 = CENTER + tickInner * Math.cos(angle);
      const y1 = CENTER + tickInner * Math.sin(angle);
      const x2 = CENTER + tickOuter * Math.cos(angle);
      const y2 = CENTER + tickOuter * Math.sin(angle);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      tick.setAttribute('class', 'rc-decade-tick');
      svg.appendChild(tick);
    }
  }

  // ============================================================
  // Life Phases Ring
  // ============================================================

  /**
   * Renders the life phases ring (middle ring with phases from folder).
   * Supports dynamic rings via radcal-ring property.
   */
  private renderLifePhasesRing(svg: SVGSVGElement, birthYear: number, lifespan: number): void {
    const { settings, service, visibleRings } = this.deps;
    const folder = '';

    const ringMap = service.loadLifePhasesByRing(folder);
    if (ringMap.size === 0) return;

    let ringNames = Array.from(ringMap.keys()).sort((a, b) => {
      if (a === '__default__') return 1;
      if (b === '__default__') return -1;
      return a.localeCompare(b);
    });

    // Filter by visible rings if filter is active
    if (visibleRings.size > 0 && visibleRings.size < ringNames.length) {
      ringNames = ringNames.filter(name => visibleRings.has(name));
    }

    const totalRings = ringNames.length;
    if (totalRings === 0) return;

    const totalRingSpace = LIFE_PHASES_RING_OUTER - LIFE_PHASES_RING_INNER;
    const ringWidth = totalRingSpace / totalRings;
    const ringGap = 2;

    const defs = this.getOrCreateDefs(svg);
    const birthDate = settings.birthDate;

    ringNames.forEach((ringName, ringIndex) => {
      const phases = ringMap.get(ringName) || [];
      if (phases.length === 0) return;

      const ringOuter = LIFE_PHASES_RING_OUTER - (ringIndex * ringWidth) - ringGap;
      const ringInner = LIFE_PHASES_RING_OUTER - ((ringIndex + 1) * ringWidth) + ringGap;

      const presets: never[] = [];
      const segments = service.computeLifePhaseSegments(phases, birthYear, lifespan, birthDate, presets);

      // Group segments by category within this ring
      const categories = new Map<string, typeof segments>();
      const uncategorized: typeof segments = [];

      for (const segment of segments) {
        if (segment.category) {
          const existing = categories.get(segment.category) || [];
          existing.push(segment);
          categories.set(segment.category, existing);
        } else {
          uncategorized.push(segment);
        }
      }

      const categoryNames = Array.from(categories.keys()).sort();
      const categoryCount = categoryNames.length;
      const uncategorizedWithTracks = assignTracks(uncategorized);
      const uncategorizedTrackCount = uncategorized.length > 0 ? getMaxTrackCount(uncategorizedWithTracks) : 0;
      const totalTracks = categoryCount + uncategorizedTrackCount;

      if (totalTracks === 0) return;

      // Render category-based phases
      categoryNames.forEach((categoryName, categoryIndex) => {
        const categorySegments = categories.get(categoryName) || [];
        const categoryWithTracks = assignTracks(categorySegments);
        const categoryTrackCount = getMaxTrackCount(categoryWithTracks);

        for (const phase of categoryWithTracks) {
          const categoryBandOuter = ringOuter - (categoryIndex / totalTracks) * (ringOuter - ringInner);
          const categoryBandInner = ringOuter - ((categoryIndex + 1) / totalTracks) * (ringOuter - ringInner);

          const radii = computeSubRingRadii(
            categoryBandOuter,
            categoryBandInner,
            categoryTrackCount,
            phase.track
          );

          this.renderLifePhaseArcWithRadii(svg, defs, phase, radii);
        }
      });

      // Render uncategorized phases
      for (const phase of uncategorizedWithTracks) {
        const uncatBandOuter = ringOuter - (categoryCount / totalTracks) * (ringOuter - ringInner);
        const uncatBandInner = ringInner;

        const radii = computeSubRingRadii(
          uncatBandOuter,
          uncatBandInner,
          uncategorizedTrackCount,
          phase.track
        );

        this.renderLifePhaseArcWithRadii(svg, defs, phase, radii);
      }

      // Render ring label (if named ring, not __default__)
      if (ringName !== '__default__') {
        this.renderRingLabel(svg, ringName, ringOuter, ringInner);
      }
    });
  }

  /**
   * Renders a label for a named ring at the left (9 o'clock) side.
   */
  private renderRingLabel(svg: SVGSVGElement, label: string, outerRadius: number, innerRadius: number): void {
    const midRadius = (outerRadius + innerRadius) / 2;
    const angle = Math.PI; // 180 degrees = left side
    const x = CENTER + midRadius * Math.cos(angle);
    const y = CENTER + midRadius * Math.sin(angle);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(x - 5));
    text.setAttribute('y', String(y));
    text.setAttribute('class', 'rc-ring-label');
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('dominant-baseline', 'middle');
    text.style.fontSize = '10px';
    text.style.fill = 'var(--text-muted)';
    text.style.fontWeight = '500';
    text.textContent = label;

    svg.appendChild(text);
  }

  // ============================================================
  // Life Phase Arc rendering
  // ============================================================

  /**
   * Renders a single life phase arc with explicit radii.
   */
  private renderLifePhaseArcWithRadii(
    svg: SVGSVGElement,
    defs: SVGDefsElement,
    phase: PhaseWithTrack,
    radii: { inner: number; outer: number }
  ): void {
    const baseOpacity = phase.opacity !== undefined ? phase.opacity / 100 : 1;

    if (phase.isOngoing && phase.todayAngle !== undefined && phase.todayAngle > phase.startAngle) {
      // Arc 1: Start to Today (full color with pattern/opacity)
      const pathSolid = this.createArcPath(radii.inner, radii.outer, phase.startAngle, phase.todayAngle);
      const arcSolid = document.createElementNS(SVG_NS, 'path');
      arcSolid.setAttribute('d', pathSolid);
      arcSolid.setAttribute('class', 'rc-life-phase');

      if (phase.pattern && phase.pattern !== 'solid') {
        const patternUrl = this.getOrCreatePattern(defs, phase.pattern, phase.color);
        arcSolid.style.fill = patternUrl;
      } else {
        arcSolid.style.fill = phase.color;
      }
      arcSolid.style.opacity = String(baseOpacity);

      // Arc 2: Today to End (50% of base opacity)
      const pathFaded = this.createArcPath(radii.inner, radii.outer, phase.todayAngle, phase.endAngle);
      const arcFaded = document.createElementNS(SVG_NS, 'path');
      arcFaded.setAttribute('d', pathFaded);
      arcFaded.setAttribute('class', 'rc-life-phase rc-life-phase-future');

      if (phase.pattern && phase.pattern !== 'solid') {
        const patternUrl = this.getOrCreatePattern(defs, phase.pattern, phase.color);
        arcFaded.style.fill = patternUrl;
      } else {
        arcFaded.style.fill = phase.color;
      }
      arcFaded.style.opacity = String(baseOpacity * 0.35);

      // Click handlers for both arcs
      if (phase.filePath) {
        arcSolid.style.cursor = 'pointer';
        arcFaded.style.cursor = 'pointer';
        arcSolid.addEventListener('click', (e) => {
          if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
            this.deps.openFile(phase.filePath!);
          }
        });
        arcFaded.addEventListener('click', (e) => {
          if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
            this.deps.openFile(phase.filePath!);
          }
        });
        arcSolid.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.showArcContextMenu(e, phase);
        });
        arcFaded.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.showArcContextMenu(e, phase);
        });
      }

      const showTooltip = (e: MouseEvent) => this.showPhaseTooltip(e, phase);
      const hideTooltip = () => this.hideTooltip();
      arcSolid.addEventListener('mouseenter', showTooltip);
      arcSolid.addEventListener('mouseleave', hideTooltip);
      arcFaded.addEventListener('mouseenter', showTooltip);
      arcFaded.addEventListener('mouseleave', hideTooltip);

      svg.appendChild(arcSolid);
      svg.appendChild(arcFaded);
    } else {
      // Non-ongoing phase: single arc with visual options
      const path = this.createArcPath(radii.inner, radii.outer, phase.startAngle, phase.endAngle);
      const arc = document.createElementNS(SVG_NS, 'path');
      arc.setAttribute('d', path);
      arc.setAttribute('class', 'rc-life-phase');

      this.applyVisualOptions(arc, defs, phase.color, {
        pattern: phase.pattern,
        opacity: phase.opacity,
        fade: phase.fade,
        startAngle: phase.startAngle,
        endAngle: phase.endAngle,
        id: phase.id,
        startDate: phase.startDate,
        endDate: phase.endDate,
      });

      if (phase.filePath) {
        arc.style.cursor = 'pointer';
        arc.addEventListener('click', (e) => {
          if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
            this.deps.openFile(phase.filePath!);
          }
        });
        arc.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.showArcContextMenu(e, phase);
        });
      }

      arc.addEventListener('mouseenter', (e) => {
        this.showPhaseTooltip(e, phase);
      });
      arc.addEventListener('mouseleave', () => this.hideTooltip());

      svg.appendChild(arc);
    }

    // Render label if space permits
    if (phase.label && (phase.endAngle - phase.startAngle) > 0.15) {
      this.renderPhaseLabel(svg, phase, radii);
    }

    // Render icon if present
    if (phase.icon) {
      this.renderPhaseIcon(svg, phase, radii);
    }
  }

  /**
   * Renders an icon/emoji at the start of a phase arc.
   */
  private renderPhaseIcon(
    svg: SVGSVGElement,
    phase: PhaseWithTrack,
    radii: { inner: number; outer: number }
  ): void {
    const midRadius = (radii.outer + radii.inner) / 2;
    const iconAngle = phase.startAngle + 0.02;

    const x = CENTER + midRadius * Math.sin(iconAngle);
    const y = CENTER - midRadius * Math.cos(iconAngle);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('class', 'rc-phase-icon');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.textContent = phase.icon!;

    if (phase.filePath) {
      text.style.cursor = 'pointer';
      text.addEventListener('click', () => {
        this.deps.openFile(phase.filePath!);
      });
    }

    svg.appendChild(text);
  }

  /**
   * Renders a label on a phase arc.
   */
  private renderPhaseLabel(
    svg: SVGSVGElement,
    phase: PhaseWithTrack,
    radii: { inner: number; outer: number }
  ): void {
    const midAngle = (phase.startAngle + phase.endAngle) / 2 - Math.PI / 2;
    const labelRadius = (radii.inner + radii.outer) / 2;
    const x = CENTER + labelRadius * Math.cos(midAngle);
    const y = CENTER + labelRadius * Math.sin(midAngle);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('class', 'rc-phase-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');

    const rotationDeg = (midAngle + Math.PI / 2) * 180 / Math.PI;
    const adjustedRotation = rotationDeg > 90 && rotationDeg < 270 ? rotationDeg + 180 : rotationDeg;
    text.setAttribute('transform', `rotate(${adjustedRotation}, ${x}, ${y})`);

    text.textContent = phase.label;
    svg.appendChild(text);
  }

  // ============================================================
  // Year Ring
  // ============================================================

  /**
   * Renders the year ring (inner ring showing months and days).
   */
  private renderYearRing(svg: SVGSVGElement, year: number): void {
    const { service } = this.deps;
    const today = getToday();

    for (let month = 1; month <= 12; month++) {
      const daysInMonth = getDaysInMonth(year, month);
      const startAngle = this.monthToAngle(month);
      const monthArcSpan = Math.PI / 6;
      const dayArcSpan = monthArcSpan / daysInMonth;

      const isCurrentMonth = today.year === year && today.month === month;

      for (let day = 1; day <= daysInMonth; day++) {
        const date = createLocalDate(year, month, day);
        const dayOfWeek = getWeekday(date);
        const isToday = isCurrentMonth && today.day === day;
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const dayStartAngle = startAngle + (day - 1) * dayArcSpan;
        const dayEndAngle = dayStartAngle + dayArcSpan - 0.002;

        const entries = service.getEntriesForDate(date);

        const path = this.createArcPath(YEAR_RING_INNER, YEAR_RING_OUTER, dayStartAngle, dayEndAngle);
        const arc = document.createElementNS(SVG_NS, 'path');
        arc.setAttribute('d', path);

        const classes = ['rc-day-arc'];
        if (isToday) classes.push('rc-day-arc--today');
        if (isWeekend) classes.push('rc-day-arc--weekend');
        if (entries.length > 0) classes.push('rc-day-arc--has-notes');

        arc.setAttribute('class', classes.join(' '));

        arc.addEventListener('click', async () => {
          await service.openDailyNote(date);
        });

        arc.addEventListener('mouseenter', (e) => {
          this.showDayTooltip(e, date, entries);
        });
        arc.addEventListener('mouseleave', () => this.hideTooltip());

        svg.appendChild(arc);
      }
    }

    // Month separators on year ring
    for (let month = 1; month <= 12; month++) {
      const angle = this.monthToAngle(month) - Math.PI / 2;
      const x1 = CENTER + YEAR_RING_INNER * Math.cos(angle);
      const y1 = CENTER + YEAR_RING_INNER * Math.sin(angle);
      const x2 = CENTER + YEAR_RING_OUTER * Math.cos(angle);
      const y2 = CENTER + YEAR_RING_OUTER * Math.sin(angle);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'rc-month-separator');
      svg.appendChild(line);
    }

    // Month labels inside year ring
    const yearRingWidth = YEAR_RING_OUTER - YEAR_RING_INNER;
    const fontSize = yearRingWidth * 0.1;

    for (let month = 0; month < 12; month++) {
      const baseAngle = this.monthToAngle(month + 1) + (Math.PI / 12);
      const positionAngle = baseAngle - Math.PI / 2;
      const labelRadius = CENTER_RADIUS + (YEAR_RING_INNER - CENTER_RADIUS) * 0.6;
      const x = CENTER + labelRadius * Math.cos(positionAngle);
      const y = CENTER + labelRadius * Math.sin(positionAngle);

      let rotationDeg = (baseAngle * 180 / Math.PI);

      const isBottomHalf = baseAngle > Math.PI / 2 && baseAngle < 3 * Math.PI / 2;
      if (isBottomHalf) {
        rotationDeg += 180;
      }

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'rc-month-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('transform', `rotate(${rotationDeg}, ${x}, ${y})`);
      text.style.fontSize = `${fontSize}px`;
      text.textContent = MONTH_NAMES[month];
      svg.appendChild(text);
    }
  }

  // ============================================================
  // Life Acts
  // ============================================================

  /**
   * Renders life acts as colored arcs on the life ring.
   */
  private renderLifeActsOnRing(svg: SVGSVGElement, birthYear: number, lifespan: number): void {
    const { settings } = this.deps;
    const lifeActs: LifeActConfig[] = [];
    if (lifeActs.length === 0) return;

    for (const act of lifeActs) {
      const startAngle = (act.startAge / lifespan) * 2 * Math.PI;
      const endAngle = (act.endAge / lifespan) * 2 * Math.PI - 0.01;

      const path = this.createArcPath(LIFE_RING_OUTER + 2, LIFE_RING_OUTER + 8, startAngle, endAngle);
      const arc = document.createElementNS(SVG_NS, 'path');
      arc.setAttribute('d', path);
      arc.setAttribute('class', 'rc-life-act');

      if (act.color) {
        arc.style.fill = RING_COLORS[act.color];
      }

      svg.appendChild(arc);

      // Label
      const midAngle = (startAngle + endAngle) / 2 - Math.PI / 2;
      const labelRadius = LIFE_RING_OUTER + 18;
      const x = CENTER + labelRadius * Math.cos(midAngle);
      const y = CENTER + labelRadius * Math.sin(midAngle);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.setAttribute('class', 'rc-life-act-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');

      const rotationDeg = (midAngle + Math.PI / 2) * 180 / Math.PI;
      const adjustedRotation = rotationDeg > 90 && rotationDeg < 270 ? rotationDeg + 180 : rotationDeg;
      label.setAttribute('transform', `rotate(${adjustedRotation}, ${x}, ${y})`);

      if (act.color) {
        label.style.fill = RING_COLORS[act.color];
      }

      label.textContent = act.label;
      svg.appendChild(label);
    }
  }

  // ============================================================
  // Position Markers
  // ============================================================

  /**
   * Renders a position marker on the life ring.
   * For 'today' type: shows exact position including day-of-year progress.
   * For 'viewed' type: shows position at start of the year.
   */
  private renderLifePositionMarker(
    svg: SVGSVGElement,
    birthYear: number,
    lifespan: number,
    year: number,
    type: 'today' | 'viewed'
  ): void {
    let age = year - birthYear;

    if (type === 'today') {
      const today = getToday();
      const isLeapYear = (today.year % 4 === 0 && today.year % 100 !== 0) || (today.year % 400 === 0);
      const daysInYear = isLeapYear ? 366 : 365;

      const monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (isLeapYear) monthDays[2] = 29;
      let dayOfYear = today.day;
      for (let m = 1; m < today.month; m++) {
        dayOfYear += monthDays[m];
      }

      age += dayOfYear / daysInYear;
    }

    const angle = (age / lifespan) * 2 * Math.PI - Math.PI / 2;

    const innerR = LIFE_RING_INNER - 5;
    const outerR = LIFE_RING_OUTER + 5;

    const x1 = CENTER + innerR * Math.cos(angle);
    const y1 = CENTER + innerR * Math.sin(angle);
    const x2 = CENTER + outerR * Math.cos(angle);
    const y2 = CENTER + outerR * Math.sin(angle);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', type === 'today' ? 'rc-life-marker--today' : 'rc-life-marker--viewed');
    svg.appendChild(line);
  }

  /**
   * Renders today marker on year ring.
   */
  private renderTodayMarkerOnYearRing(svg: SVGSVGElement): void {
    const today = getToday();
    const daysInMonth = getDaysInMonth(today.year, today.month);
    const startAngle = this.monthToAngle(today.month);
    const monthArcSpan = Math.PI / 6;
    const dayArcSpan = monthArcSpan / daysInMonth;
    const todayAngle = startAngle + (today.day - 0.5) * dayArcSpan - Math.PI / 2;

    const x1 = CENTER + (YEAR_RING_INNER - 5) * Math.cos(todayAngle);
    const y1 = CENTER + (YEAR_RING_INNER - 5) * Math.sin(todayAngle);
    const x2 = CENTER + (YEAR_RING_OUTER + 5) * Math.cos(todayAngle);
    const y2 = CENTER + (YEAR_RING_OUTER + 5) * Math.sin(todayAngle);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-today-marker');
    svg.appendChild(line);
  }

  /**
   * Renders birthday marker on year ring (shows birthday position in current year).
   */
  private renderBirthdayMarkerOnYearRing(svg: SVGSVGElement, year: number): void {
    const { settings } = this.deps;
    const birthDate = settings.birthDate;
    if (!birthDate) return;

    const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return;

    const birthMonth = parseInt(match[2], 10);
    const birthDay = parseInt(match[3], 10);

    const daysInMonth = getDaysInMonth(year, birthMonth);
    const startAngle = this.monthToAngle(birthMonth);
    const monthArcSpan = Math.PI / 6;
    const dayArcSpan = monthArcSpan / daysInMonth;
    const birthdayAngle = startAngle + (birthDay - 0.5) * dayArcSpan - Math.PI / 2;

    const x1 = CENTER + (YEAR_RING_INNER - 3) * Math.cos(birthdayAngle);
    const y1 = CENTER + (YEAR_RING_INNER - 3) * Math.sin(birthdayAngle);
    const x2 = CENTER + (YEAR_RING_OUTER + 3) * Math.cos(birthdayAngle);
    const y2 = CENTER + (YEAR_RING_OUTER + 3) * Math.sin(birthdayAngle);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-birthday-marker');
    svg.appendChild(line);

    // Small cake icon at the outer edge
    const iconRadius = YEAR_RING_OUTER + 12;
    const iconX = CENTER + iconRadius * Math.cos(birthdayAngle);
    const iconY = CENTER + iconRadius * Math.sin(birthdayAngle);

    const icon = document.createElementNS(SVG_NS, 'text');
    icon.setAttribute('x', String(iconX));
    icon.setAttribute('y', String(iconY));
    icon.setAttribute('class', 'rc-birthday-icon');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('dominant-baseline', 'central');
    icon.textContent = '🎂';
    svg.appendChild(icon);
  }

  // ============================================================
  // Center
  // ============================================================

  /**
   * Renders center display for nested clock.
   */
  private renderNestedCenter(svg: SVGSVGElement, year: number, currentAge: number): void {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(CENTER_RADIUS - 10));
    circle.setAttribute('class', 'rc-center');
    svg.appendChild(circle);

    const yearText = document.createElementNS(SVG_NS, 'text');
    yearText.setAttribute('x', String(CENTER));
    yearText.setAttribute('y', String(CENTER - 20));
    yearText.setAttribute('class', 'rc-center-year');
    yearText.setAttribute('text-anchor', 'middle');
    yearText.setAttribute('dominant-baseline', 'central');
    yearText.textContent = String(year);
    svg.appendChild(yearText);

    const ageText = document.createElementNS(SVG_NS, 'text');
    ageText.setAttribute('x', String(CENTER));
    ageText.setAttribute('y', String(CENTER + 20));
    ageText.setAttribute('class', 'rc-center-age');
    ageText.setAttribute('text-anchor', 'middle');
    ageText.setAttribute('dominant-baseline', 'central');
    ageText.textContent = `${currentAge} years`;
    svg.appendChild(ageText);
  }

  // ============================================================
  // Tooltip helpers
  // ============================================================

  private showLifeYearTooltip(event: MouseEvent, year: number, age: number): void {
    const { tooltipEl } = this.deps;
    if (!tooltipEl) return;

    const content = `<div class="rc-tooltip-date">${year}</div>
      <div class="rc-tooltip-note">Age: ${age} years</div>`;

    tooltipEl.innerHTML = content;
    tooltipEl.style.display = 'block';
    this.centerTooltip();
  }

  private showPhaseTooltip(event: MouseEvent, phase: PhaseWithTrack): void {
    const { tooltipEl } = this.deps;
    if (!tooltipEl) return;

    let content = `<div class="rc-tooltip-date">${phase.label}</div>`;

    if (phase.isOngoing) {
      content += '<div class="rc-tooltip-note" style="color: var(--text-accent);">Active (ongoing)</div>';
    }

    tooltipEl.innerHTML = content;
    tooltipEl.style.display = 'block';
    this.centerTooltip();
  }

  private showDayTooltip(event: MouseEvent, date: LocalDate, entries: readonly any[]): void {
    const { tooltipEl } = this.deps;
    if (!tooltipEl) return;

    const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
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

    tooltipEl.innerHTML = content;
    tooltipEl.style.display = 'block';
    this.centerTooltip();
  }

  private hideTooltip(): void {
    const { tooltipEl } = this.deps;
    if (tooltipEl) {
      tooltipEl.style.display = 'none';
    }
  }

  private centerTooltip(): void {
    const { tooltipEl, containerEl } = this.deps;
    if (!tooltipEl || !containerEl) return;

    tooltipEl.style.left = '50%';
    tooltipEl.style.top = '50%';
    tooltipEl.style.transform = 'translate(-50%, -50%)';
  }

  // ============================================================
  // Context menu / Phase actions
  // ============================================================

  /**
   * Shows context menu for an arc (right-click).
   */
  private showArcContextMenu(event: MouseEvent, phase: PhaseWithTrack): void {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('Open Note')
        .setIcon('file-text')
        .onClick(() => {
          if (phase.filePath) {
            this.deps.openFile(phase.filePath);
          }
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle('Create Following Phase')
        .setIcon('plus')
        .onClick(() => {
          this.createFollowingPhase(phase);
        });
    });

    menu.addSeparator();

    menu.addItem((item) => {
      item
        .setTitle('Set Appearance...')
        .setIcon('palette')
        .onClick(() => {
          this.showAppearanceModal(phase);
        });
    });

    menu.showAtMouseEvent(event);
  }

  /**
   * Creates a new phase that follows the current one.
   */
  private async createFollowingPhase(phase: PhaseWithTrack): Promise<void> {
    if (!phase.filePath) return;

    const endDate = phase.endDate;
    if (!endDate) {
      const today = getToday();
      await this.createNewPhaseNote(phase, today);
    } else {
      const nextDay = this.addOneDayToDate(endDate);
      await this.createNewPhaseNote(phase, nextDay);
    }
  }

  private addOneDayToDate(date: { year: number; month: number; day: number }): { year: number; month: number; day: number } {
    const d = new Date(date.year, date.month - 1, date.day + 1);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    };
  }

  private async createNewPhaseNote(
    sourcePhase: PhaseWithTrack,
    startDate: { year: number; month: number; day: number }
  ): Promise<void> {
    const app = this.deps.app;
    const vault = app.vault;
    const workspace = app.workspace;

    const sourceFile = vault.getAbstractFileByPath(sourcePhase.filePath);
    if (!sourceFile || !(sourceFile instanceof TFile)) return;

    const cache = app.metadataCache.getFileCache(sourceFile);
    const sourceFm = cache?.frontmatter || {};

    const startStr = `${startDate.year}-${String(startDate.month).padStart(2, '0')}-${String(startDate.day).padStart(2, '0')}`;

    const newFrontmatter = [
      '---',
      `radcal-start: ${startStr}`,
      'radcal-end: ',
      `radcal-color: ${sourceFm['radcal-color'] || 'blue'}`,
      'radcal-label: ',
      `radcal-showInLife: ${sourceFm['radcal-showInLife'] || 'true'}`,
    ];

    if (sourceFm['radcal-ring']) {
      newFrontmatter.push(`radcal-ring: ${sourceFm['radcal-ring']}`);
    }
    if (sourceFm['radcal-category']) {
      newFrontmatter.push(`radcal-category: ${sourceFm['radcal-category']}`);
    }
    if (sourceFm['radcal-pattern']) {
      newFrontmatter.push(`radcal-pattern: ${sourceFm['radcal-pattern']}`);
    }

    newFrontmatter.push('---', '', '# New Phase', '');

    const folder = sourceFile.parent?.path || '';
    const fileName = `Phase ${startStr}.md`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    const newFile = await vault.create(filePath, newFrontmatter.join('\n'));

    const leaf = workspace.getLeaf(false);
    await leaf.openFile(newFile);
  }

  private showAppearanceModal(phase: PhaseWithTrack): void {
    if (!phase.filePath) return;

    const app = this.deps.app;
    const file = app.vault.getAbstractFileByPath(phase.filePath);
    if (!file || !(file instanceof TFile)) return;

    import('../components/AppearanceModal').then(({ AppearanceModal }) => {
      new AppearanceModal(app, file, () => {
        this.deps.onRefresh();
      }).open();
    }).catch(() => {
      const { Notice } = require('obsidian');
      new Notice('Appearance modal not available');
    });
  }

  // ============================================================
  // SVG / Visual helpers
  // ============================================================

  /**
   * Gets or creates the <defs> element in the SVG.
   */
  private getOrCreateDefs(svg: SVGSVGElement): SVGDefsElement {
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    return defs as SVGDefsElement;
  }

  /**
   * Gets or creates a pattern definition for a specific color and pattern type.
   * Returns the pattern ID to use as fill reference.
   */
  private getOrCreatePattern(
    defs: SVGDefsElement,
    patternName: PatternName,
    color: string
  ): string {
    const patternId = `pattern-${patternName}-${color.replace('#', '')}`;

    if (defs.querySelector(`#${patternId}`)) {
      return `url(#${patternId})`;
    }

    const pattern = document.createElementNS(SVG_NS, 'pattern') as SVGPatternElement;
    pattern.setAttribute('id', patternId);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '10');
    pattern.setAttribute('height', '10');

    const builder = SVG_PATTERN_BUILDERS[patternName];
    if (builder) {
      builder(pattern, color);
    }

    defs.appendChild(pattern);
    return `url(#${patternId})`;
  }

  /**
   * Creates a fade gradient for an arc (solid -> transparent).
   */
  private getOrCreateFadeGradient(
    defs: SVGDefsElement,
    gradientId: string,
    color: string,
    startAngle: number,
    endAngle: number,
    todayPosition?: number
  ): string {
    if (defs.querySelector(`#${gradientId}`)) {
      return `url(#${gradientId})`;
    }

    const startAdjusted = startAngle - Math.PI / 2;
    const endAdjusted = endAngle - Math.PI / 2;

    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');

    const r = 300;
    const x1 = CENTER + r * Math.cos(startAdjusted);
    const y1 = CENTER + r * Math.sin(startAdjusted);
    const x2 = CENTER + r * Math.cos(endAdjusted);
    const y2 = CENTER + r * Math.sin(endAdjusted);

    gradient.setAttribute('x1', String(x1));
    gradient.setAttribute('y1', String(y1));
    gradient.setAttribute('x2', String(x2));
    gradient.setAttribute('y2', String(y2));

    let fadeStartPercent: number;
    if (todayPosition === undefined || todayPosition <= 0) {
      fadeStartPercent = 0;
    } else if (todayPosition >= 1) {
      fadeStartPercent = 100;
    } else {
      fadeStartPercent = Math.round(todayPosition * 100);
    }

    const stop1 = document.createElementNS(SVG_NS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', color);
    stop1.setAttribute('stop-opacity', '1');

    if (fadeStartPercent > 0 && fadeStartPercent < 100) {
      const stop2 = document.createElementNS(SVG_NS, 'stop');
      stop2.setAttribute('offset', `${fadeStartPercent}%`);
      stop2.setAttribute('stop-color', color);
      stop2.setAttribute('stop-opacity', '1');
      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
    } else {
      gradient.appendChild(stop1);
    }

    const stopEnd = document.createElementNS(SVG_NS, 'stop');
    stopEnd.setAttribute('offset', '100%');
    stopEnd.setAttribute('stop-color', color);
    stopEnd.setAttribute('stop-opacity', fadeStartPercent >= 100 ? '1' : '0.15');
    gradient.appendChild(stopEnd);

    defs.appendChild(gradient);
    return `url(#${gradientId})`;
  }

  /**
   * Calculates where today falls within a date range (0 = start, 1 = end).
   */
  private calculateTodayPosition(startDate: LocalDate, endDate: LocalDate): number {
    const today = new Date();
    const todayLocal: LocalDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };

    const startDays = this.localDateToDays(startDate);
    const endDays = this.localDateToDays(endDate);
    const todayDays = this.localDateToDays(todayLocal);

    const totalDays = endDays - startDays;
    if (totalDays <= 0) return 0;

    const daysFromStart = todayDays - startDays;
    return daysFromStart / totalDays;
  }

  private localDateToDays(date: LocalDate): number {
    return new Date(date.year, date.month - 1, date.day).getTime() / (1000 * 60 * 60 * 24);
  }

  /**
   * Applies visual options (pattern, opacity, fade) to an arc element.
   */
  private applyVisualOptions(
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
  ): void {
    const { pattern, opacity, fade, startAngle, endAngle, id, startDate, endDate } = options;

    if (pattern && pattern !== 'solid') {
      const patternUrl = this.getOrCreatePattern(defs, pattern, color);
      arcEl.style.fill = patternUrl;
    } else if (fade && startAngle !== undefined && endAngle !== undefined && id) {
      let todayPosition: number | undefined;
      if (startDate && endDate) {
        todayPosition = this.calculateTodayPosition(startDate, endDate);
      }

      const gradientId = `fade-${id.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const fadeUrl = this.getOrCreateFadeGradient(defs, gradientId, color, startAngle, endAngle, todayPosition);
      arcEl.style.fill = fadeUrl;
    } else {
      arcEl.style.fill = color;
    }

    if (opacity !== undefined && opacity !== 100) {
      arcEl.style.fillOpacity = String(opacity / 100);
    }
  }

  /**
   * Creates an SVG arc path (annular sector).
   * Angle convention: 0 = 12 o'clock (top), increasing clockwise.
   */
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

  /**
   * Converts month number (1-indexed) to start angle in radians.
   * January = 0 (12 o'clock).
   */
  private monthToAngle(month: number): number {
    return ((month - 1) * Math.PI) / 6;
  }
}
