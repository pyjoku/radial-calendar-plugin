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
import type { RadialCalendarSettings, RingConfig, OuterSegmentConfig, LifeActConfig, RenderedSegment, PhaseWithTrack } from '../../core/domain/types';
import {
  RING_COLORS,
  PREDEFINED_SEASONS,
  PREDEFINED_QUARTERS,
  PREDEFINED_SEMESTERS,
  generate10DayPhases,
  generateWeekSegments,
  assignTracks,
  computeSubRingRadii,
  getMaxTrackCount,
} from '../../core/domain/types';

export const VIEW_TYPE_RADIAL_CALENDAR = 'radial-calendar-plugin';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// SVG Constants
const SVG_SIZE = 800;
const CENTER = SVG_SIZE / 2;

// Nested Clock Layout (Life View)
// Outer ring: Life (birth to expected end)
// Middle ring: Life Phases (configurable from folder)
// Inner ring: Year (12 months)
const LIFE_RING_OUTER = 380;
const LIFE_RING_INNER = 340;
const LIFE_PHASES_RING_OUTER = 335;
const LIFE_PHASES_RING_INNER = 260;
const YEAR_RING_OUTER = 255;
const YEAR_RING_INNER = 150;
const CENTER_RADIUS = 140;

// Annual View Layout (single year focus)
const OUTER_RADIUS = 380;
const LABEL_RING_WIDTH = 30;     // Reserved space for month labels
const INNER_RADIUS = 145;        // Inner edge of label ring (start of center)
const DATA_RING_INNER = INNER_RADIUS + LABEL_RING_WIDTH;  // Inner edge of data rings (175)
const MONTH_LABEL_RADIUS = INNER_RADIUS + LABEL_RING_WIDTH / 2;  // Center of label ring (160)

// Shared constants
const DAY_RING_WIDTH = (OUTER_RADIUS - INNER_RADIUS) / 31;
const RING_GAP = 4;
const MIN_RING_WIDTH = 20;

// Outer segment constants
const SEGMENT_TICK_INNER = OUTER_RADIUS + 2;
const SEGMENT_TICK_OUTER = OUTER_RADIUS + 8;
const SEGMENT_LABEL_RADIUS = OUTER_RADIUS + 14;

// Anniversary ring constants (must fit within SVG viewBox)
const ANNIVERSARY_RING_RADIUS = OUTER_RADIUS + 12;  // Between ticks and labels (392)
const ANNIVERSARY_DOT_RADIUS = 4;

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

    // Refresh button
    const refreshBtn = header.createEl('button', {
      text: '\u21bb',
      cls: 'rc-nav-btn rc-refresh-btn',
      attr: { 'aria-label': 'Refresh view' },
    });
    refreshBtn.addEventListener('click', () => {
      this.render();
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
      text: 'Annual',
      cls: `rc-toggle-btn ${currentView === 'annual' ? 'rc-toggle-btn--active' : ''}`,
      attr: { 'aria-label': 'Switch to annual view' },
    });
    annualBtn.addEventListener('click', async () => {
      if (this.config && this.config.settings.currentView !== 'annual') {
        const newSettings = { ...this.config.settings, currentView: 'annual' as const };
        this.config.settings = newSettings; // Update local reference
        await this.config.onSettingsChange(newSettings);
        this.render();
      }
    });

    // Life view button
    const lifeBtn = toggleContainer.createEl('button', {
      text: 'Life',
      cls: `rc-toggle-btn ${currentView === 'life' ? 'rc-toggle-btn--active' : ''}`,
      attr: { 'aria-label': 'Switch to life view' },
    });
    lifeBtn.addEventListener('click', async () => {
      if (this.config && this.config.settings.currentView !== 'life') {
        const newSettings = { ...this.config.settings, currentView: 'life' as const };
        this.config.settings = newSettings; // Update local reference
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

    const isLifeView = this.config.settings.currentView === 'life';

    if (isLifeView) {
      // Nested Clock: Life ring outer, Year ring inner
      this.renderNestedClock(svg, year);
    } else {
      // Annual View: Full year with optional folder rings
      this.renderAnnualView(svg, year);
    }

    wrapper.appendChild(svg);
  }

  /**
   * Renders the nested clock view (Life View)
   * Outer ring: Life timeline (birth to expected end)
   * Inner ring: Current year (12 months)
   */
  private renderNestedClock(svg: SVGSVGElement, year: number): void {
    if (!this.config) return;

    const { birthYear, expectedLifespan } = this.config.settings;
    const endYear = birthYear + expectedLifespan;
    const today = getToday();
    const currentAge = today.year - birthYear;

    // Background
    this.renderBackgroundCircle(svg);

    // 1. Render Life Ring (outer - years)
    this.renderLifeRing(svg, birthYear, endYear, year);

    // 2. Render Life Phases Ring (middle - from folder)
    this.renderLifePhasesRing(svg, birthYear, expectedLifespan);

    // 3. Render Year Ring (inner - months/days)
    this.renderYearRing(svg, year);

    // 4. Life Acts (if configured - outer ticks)
    this.renderLifeActsOnRing(svg, birthYear, expectedLifespan);

    // 4. Center with info
    this.renderNestedCenter(svg, year, currentAge);

    // 5. Today marker on life ring
    this.renderLifePositionMarker(svg, birthYear, expectedLifespan, today.year, 'today');

    // 6. Viewed year marker on life ring (if different from today)
    if (year !== today.year) {
      this.renderLifePositionMarker(svg, birthYear, expectedLifespan, year, 'viewed');
    }

    // 7. Today marker on year ring
    if (year === today.year) {
      this.renderTodayMarkerOnYearRing(svg);
    }

    // 8. Birthday marker on year ring (if birthDate is set)
    this.renderBirthdayMarkerOnYearRing(svg, year);
  }

  /**
   * Renders the life ring (outer ring showing years)
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

      const path = this.createArcPath(LIFE_RING_INNER, LIFE_RING_OUTER, startAngle, endAngle);
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arc.setAttribute('d', path);

      let cls = 'rc-life-year';
      if (isPast) cls += ' rc-life-year--past';
      if (isCurrent) cls += ' rc-life-year--current';
      if (isSelected) cls += ' rc-life-year--selected';

      arc.setAttribute('class', cls);
      arc.setAttribute('data-year', String(y));

      // Click to navigate to that year
      arc.addEventListener('click', () => {
        this.config?.service.setYear(y);
      });

      // Hover tooltip
      arc.addEventListener('mouseenter', (e) => {
        this.showLifeYearTooltip(e, y, y - birthYear);
      });
      arc.addEventListener('mouseleave', () => this.hideTooltip());

      svg.appendChild(arc);
    }

    // Year labels at key positions (every 10 years)
    for (let y = birthYear; y <= endYear; y += 10) {
      const yearIndex = y - birthYear;
      const angle = (yearIndex / totalYears) * 2 * Math.PI - Math.PI / 2;
      const labelRadius = LIFE_RING_OUTER + 12;
      const x = CENTER + labelRadius * Math.cos(angle);
      const yPos = CENTER + labelRadius * Math.sin(angle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(yPos));
      label.setAttribute('class', 'rc-life-year-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.textContent = String(y);
      svg.appendChild(label);
    }
  }

  /**
   * Renders the life phases ring (middle ring with phases from folder)
   * Phases are grouped by category, each category gets its own track band
   */
  private renderLifePhasesRing(svg: SVGSVGElement, birthYear: number, lifespan: number): void {
    if (!this.config) return;

    const folder = this.config.settings.lifePhasesFolder;
    if (!folder || folder.trim() === '') return;

    // Load phases from folder
    const phases = this.config.service.loadLifePhases(folder);
    if (phases.length === 0) return;

    // Convert to rendered segments (use birthDate if available for precision)
    const birthDate = this.config.settings.birthDate;
    const segments = this.config.service.computeLifePhaseSegments(phases, birthYear, lifespan, birthDate);

    // Group segments by category
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

    // Calculate total tracks needed: one per category + uncategorized overlap tracks
    const categoryNames = Array.from(categories.keys()).sort();
    const categoryCount = categoryNames.length;

    // Uncategorized phases use track assignment for overlaps
    const uncategorizedWithTracks = assignTracks(uncategorized);
    const uncategorizedTrackCount = uncategorized.length > 0 ? getMaxTrackCount(uncategorizedWithTracks) : 0;

    // Total tracks = categories + uncategorized overlap tracks
    const totalTracks = categoryCount + uncategorizedTrackCount;
    if (totalTracks === 0) return;

    // Create SVG defs for gradients
    const defs = this.getOrCreateDefs(svg);

    // Render category-based phases (each category = one track)
    categoryNames.forEach((categoryName, categoryIndex) => {
      const categorySegments = categories.get(categoryName) || [];

      // Within category, assign tracks for overlapping phases
      const categoryWithTracks = assignTracks(categorySegments);
      const categoryTrackCount = getMaxTrackCount(categoryWithTracks);

      for (const phase of categoryWithTracks) {
        // Calculate radii: category gets a band, overlaps within that band
        const categoryBandOuter = LIFE_PHASES_RING_OUTER - (categoryIndex / totalTracks) * (LIFE_PHASES_RING_OUTER - LIFE_PHASES_RING_INNER);
        const categoryBandInner = LIFE_PHASES_RING_OUTER - ((categoryIndex + 1) / totalTracks) * (LIFE_PHASES_RING_OUTER - LIFE_PHASES_RING_INNER);

        const radii = computeSubRingRadii(
          categoryBandOuter,
          categoryBandInner,
          categoryTrackCount,
          phase.track
        );

        this.renderLifePhaseArcWithRadii(svg, defs, phase, radii);
      }
    });

    // Render uncategorized phases in remaining space
    for (const phase of uncategorizedWithTracks) {
      const uncatBandOuter = LIFE_PHASES_RING_OUTER - (categoryCount / totalTracks) * (LIFE_PHASES_RING_OUTER - LIFE_PHASES_RING_INNER);
      const uncatBandInner = LIFE_PHASES_RING_INNER;

      const radii = computeSubRingRadii(
        uncatBandOuter,
        uncatBandInner,
        uncategorizedTrackCount,
        phase.track
      );

      this.renderLifePhaseArcWithRadii(svg, defs, phase, radii);
    }
  }

  /**
   * Gets or creates the <defs> element in the SVG
   */
  private getOrCreateDefs(svg: SVGSVGElement): SVGDefsElement {
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    return defs as SVGDefsElement;
  }

  /**
   * Renders a single life phase arc with explicit radii
   */
  private renderLifePhaseArcWithRadii(
    svg: SVGSVGElement,
    _defs: SVGDefsElement,
    phase: PhaseWithTrack,
    radii: { inner: number; outer: number }
  ): void {
    // For ongoing phases, render two separate arcs: solid until today, then faded
    if (phase.isOngoing && phase.todayAngle !== undefined && phase.todayAngle > phase.startAngle) {
      // Arc 1: Start to Today (full color)
      const pathSolid = this.createArcPath(radii.inner, radii.outer, phase.startAngle, phase.todayAngle);
      const arcSolid = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arcSolid.setAttribute('d', pathSolid);
      arcSolid.setAttribute('class', 'rc-life-phase');
      arcSolid.style.fill = phase.color;
      arcSolid.style.opacity = '1';

      // Arc 2: Today to End (50% opacity)
      const pathFaded = this.createArcPath(radii.inner, radii.outer, phase.todayAngle, phase.endAngle);
      const arcFaded = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arcFaded.setAttribute('d', pathFaded);
      arcFaded.setAttribute('class', 'rc-life-phase rc-life-phase-future');
      arcFaded.style.fill = phase.color;
      arcFaded.style.opacity = '0.35';

      // Click handler for both arcs
      if (phase.filePath) {
        arcSolid.style.cursor = 'pointer';
        arcFaded.style.cursor = 'pointer';
        const openFile = () => this.config?.openFile(phase.filePath!);
        arcSolid.addEventListener('click', openFile);
        arcFaded.addEventListener('click', openFile);
      }

      // Hover tooltip for both arcs
      const showTooltip = (e: MouseEvent) => this.showPhaseTooltip(e, phase);
      const hideTooltip = () => this.hideTooltip();
      arcSolid.addEventListener('mouseenter', showTooltip);
      arcSolid.addEventListener('mouseleave', hideTooltip);
      arcFaded.addEventListener('mouseenter', showTooltip);
      arcFaded.addEventListener('mouseleave', hideTooltip);

      svg.appendChild(arcSolid);
      svg.appendChild(arcFaded);
    } else {
      // Non-ongoing phase: single arc with full color
      const path = this.createArcPath(radii.inner, radii.outer, phase.startAngle, phase.endAngle);
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arc.setAttribute('d', path);
      arc.setAttribute('class', 'rc-life-phase');
      arc.style.fill = phase.color;

      // Click handler to open phase file
      if (phase.filePath) {
        arc.style.cursor = 'pointer';
        arc.addEventListener('click', () => {
          this.config?.openFile(phase.filePath!);
        });
      }

      // Hover tooltip
      arc.addEventListener('mouseenter', (e) => {
        this.showPhaseTooltip(e, phase);
      });
      arc.addEventListener('mouseleave', () => this.hideTooltip());

      svg.appendChild(arc);
    }

    // Render label if space permits (use full arc span for positioning)
    if (phase.label && (phase.endAngle - phase.startAngle) > 0.15) {
      this.renderPhaseLabel(svg, phase, radii);
    }
  }

  /**
   * Creates an SVG gradient for an ongoing phase
   * Solid color from start to today, fading from today to end
   */
  private createPhaseGradient(
    defs: SVGDefsElement,
    gradientId: string,
    phase: PhaseWithTrack
  ): void {
    // Calculate the percentage where "today" falls in the phase arc
    const totalAngle = phase.endAngle - phase.startAngle;
    const todayOffset = (phase.todayAngle! - phase.startAngle) / totalAngle;
    const todayPercent = Math.max(0, Math.min(100, todayOffset * 100));

    // We need to use a linear gradient that follows the arc
    // For simplicity, we'll use a conic-style effect by creating stops
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', gradientId);

    // Calculate gradient direction based on arc midpoint
    const midAngle = (phase.startAngle + phase.endAngle) / 2 - Math.PI / 2;
    const x1 = 50 + 50 * Math.cos(phase.startAngle - Math.PI / 2);
    const y1 = 50 + 50 * Math.sin(phase.startAngle - Math.PI / 2);
    const x2 = 50 + 50 * Math.cos(phase.endAngle - Math.PI / 2);
    const y2 = 50 + 50 * Math.sin(phase.endAngle - Math.PI / 2);

    gradient.setAttribute('x1', `${x1}%`);
    gradient.setAttribute('y1', `${y1}%`);
    gradient.setAttribute('x2', `${x2}%`);
    gradient.setAttribute('y2', `${y2}%`);

    // Solid color until today
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', phase.color);
    stop1.setAttribute('stop-opacity', '1');
    gradient.appendChild(stop1);

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', `${todayPercent}%`);
    stop2.setAttribute('stop-color', phase.color);
    stop2.setAttribute('stop-opacity', '1');
    gradient.appendChild(stop2);

    // Fade out after today
    const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop3.setAttribute('offset', `${todayPercent + 1}%`);
    stop3.setAttribute('stop-color', phase.color);
    stop3.setAttribute('stop-opacity', '0.4');
    gradient.appendChild(stop3);

    const stop4 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop4.setAttribute('offset', '100%');
    stop4.setAttribute('stop-color', phase.color);
    stop4.setAttribute('stop-opacity', '0.15');
    gradient.appendChild(stop4);

    defs.appendChild(gradient);
  }

  /**
   * Renders a label on a phase arc
   */
  private renderPhaseLabel(
    svg: SVGSVGElement,
    phase: PhaseWithTrack,
    radii: { inner: number; outer: number }
  ): void {
    // Position at middle of arc
    const midAngle = (phase.startAngle + phase.endAngle) / 2 - Math.PI / 2;
    const labelRadius = (radii.inner + radii.outer) / 2;
    const x = CENTER + labelRadius * Math.cos(midAngle);
    const y = CENTER + labelRadius * Math.sin(midAngle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('class', 'rc-phase-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');

    // Rotate for readability
    const rotationDeg = (midAngle + Math.PI / 2) * 180 / Math.PI;
    const adjustedRotation = rotationDeg > 90 && rotationDeg < 270 ? rotationDeg + 180 : rotationDeg;
    text.setAttribute('transform', `rotate(${adjustedRotation}, ${x}, ${y})`);

    text.textContent = phase.label;
    svg.appendChild(text);
  }

  /**
   * Shows tooltip for life phase hover
   */
  private showPhaseTooltip(event: MouseEvent, phase: PhaseWithTrack): void {
    if (!this.tooltipEl) return;

    let content = `<div class="rc-tooltip-date">${phase.label}</div>`;

    if (phase.isOngoing) {
      content += '<div class="rc-tooltip-note" style="color: var(--text-accent);">Active (ongoing)</div>';
    }

    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';

    const rect = this.containerEl_?.getBoundingClientRect();
    if (rect) {
      const x = event.clientX - rect.left + 10;
      const y = event.clientY - rect.top + 10;
      this.tooltipEl.style.left = `${x}px`;
      this.tooltipEl.style.top = `${y}px`;
    }
  }

  /**
   * Renders the year ring (inner ring showing months)
   */
  private renderYearRing(svg: SVGSVGElement, year: number): void {
    if (!this.config) return;

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

        const entries = this.config.service.getEntriesForDate(date);

        const path = this.createArcPath(YEAR_RING_INNER, YEAR_RING_OUTER, dayStartAngle, dayEndAngle);
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arc.setAttribute('d', path);

        const classes = ['rc-day-arc'];
        if (isToday) classes.push('rc-day-arc--today');
        if (isWeekend) classes.push('rc-day-arc--weekend');
        if (entries.length > 0) classes.push('rc-day-arc--has-notes');

        arc.setAttribute('class', classes.join(' '));

        arc.addEventListener('click', async () => {
          await this.config?.service.openDailyNote(date);
        });

        arc.addEventListener('mouseenter', (e) => {
          this.showTooltip(e, date, entries);
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

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'rc-month-separator');
      svg.appendChild(line);
    }

    // Month labels inside year ring
    // Font size relative to year ring (10% of ring width)
    const yearRingWidth = YEAR_RING_OUTER - YEAR_RING_INNER;
    const fontSize = yearRingWidth * 0.1;

    for (let month = 0; month < 12; month++) {
      const angle = this.monthToAngle(month + 1) + (Math.PI / 12) - Math.PI / 2;
      const labelRadius = YEAR_RING_INNER - 15;
      const x = CENTER + labelRadius * Math.cos(angle);
      const y = CENTER + labelRadius * Math.sin(angle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('class', 'rc-month-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.style.fontSize = `${fontSize}px`;
      text.textContent = MONTH_NAMES[month];
      svg.appendChild(text);
    }
  }

  /**
   * Renders life acts as colored arcs on the life ring
   */
  private renderLifeActsOnRing(svg: SVGSVGElement, birthYear: number, lifespan: number): void {
    if (!this.config) return;

    const lifeActs = this.config.settings.lifeActs;
    if (lifeActs.length === 0) return;

    for (const act of lifeActs) {
      const startAngle = (act.startAge / lifespan) * 2 * Math.PI;
      const endAngle = (act.endAge / lifespan) * 2 * Math.PI - 0.01;

      // Render as a thinner arc outside the life ring
      const path = this.createArcPath(LIFE_RING_OUTER + 2, LIFE_RING_OUTER + 8, startAngle, endAngle);
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
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

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y));
      label.setAttribute('class', 'rc-life-act-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');

      // Rotate for readability
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

  /**
   * Renders position marker on life ring
   * For 'today' type: shows exact position including day-of-year progress
   * For 'viewed' type: shows position at start of the year
   */
  private renderLifePositionMarker(
    svg: SVGSVGElement,
    birthYear: number,
    lifespan: number,
    year: number,
    type: 'today' | 'viewed'
  ): void {
    let age = year - birthYear;

    // For today marker, add fractional year progress based on day-of-year
    if (type === 'today') {
      const today = getToday();
      const isLeapYear = (today.year % 4 === 0 && today.year % 100 !== 0) || (today.year % 400 === 0);
      const daysInYear = isLeapYear ? 366 : 365;

      // Calculate day of year (1-365/366)
      const monthDays = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (isLeapYear) monthDays[2] = 29;
      let dayOfYear = today.day;
      for (let m = 1; m < today.month; m++) {
        dayOfYear += monthDays[m];
      }

      // Add fractional progress through the year
      age += dayOfYear / daysInYear;
    }

    const angle = (age / lifespan) * 2 * Math.PI - Math.PI / 2;

    const innerR = LIFE_RING_INNER - 5;
    const outerR = LIFE_RING_OUTER + 5;

    const x1 = CENTER + innerR * Math.cos(angle);
    const y1 = CENTER + innerR * Math.sin(angle);
    const x2 = CENTER + outerR * Math.cos(angle);
    const y2 = CENTER + outerR * Math.sin(angle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', type === 'today' ? 'rc-life-marker--today' : 'rc-life-marker--viewed');
    svg.appendChild(line);
  }

  /**
   * Renders today marker on year ring
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

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-today-marker');
    svg.appendChild(line);
  }

  /**
   * Renders birthday marker on year ring (shows birthday position in current year)
   */
  private renderBirthdayMarkerOnYearRing(svg: SVGSVGElement, year: number): void {
    if (!this.config) return;

    const birthDate = this.config.settings.birthDate;
    if (!birthDate) return;

    // Parse birth date to get month and day
    const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return;

    const birthMonth = parseInt(match[2], 10);
    const birthDay = parseInt(match[3], 10);

    const daysInMonth = getDaysInMonth(year, birthMonth);
    const startAngle = this.monthToAngle(birthMonth);
    const monthArcSpan = Math.PI / 6;
    const dayArcSpan = monthArcSpan / daysInMonth;
    const birthdayAngle = startAngle + (birthDay - 0.5) * dayArcSpan - Math.PI / 2;

    // Draw birthday marker (slightly different style from today marker)
    const x1 = CENTER + (YEAR_RING_INNER - 3) * Math.cos(birthdayAngle);
    const y1 = CENTER + (YEAR_RING_INNER - 3) * Math.sin(birthdayAngle);
    const x2 = CENTER + (YEAR_RING_OUTER + 3) * Math.cos(birthdayAngle);
    const y2 = CENTER + (YEAR_RING_OUTER + 3) * Math.sin(birthdayAngle);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'rc-birthday-marker');
    svg.appendChild(line);

    // Add small cake/star icon at the outer edge
    const iconRadius = YEAR_RING_OUTER + 12;
    const iconX = CENTER + iconRadius * Math.cos(birthdayAngle);
    const iconY = CENTER + iconRadius * Math.sin(birthdayAngle);

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', String(iconX));
    icon.setAttribute('y', String(iconY));
    icon.setAttribute('class', 'rc-birthday-icon');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('dominant-baseline', 'central');
    icon.textContent = '🎂';
    svg.appendChild(icon);
  }

  /**
   * Renders center display for nested clock
   */
  private renderNestedCenter(svg: SVGSVGElement, year: number, currentAge: number): void {
    // Center circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(CENTER_RADIUS - 10));
    circle.setAttribute('class', 'rc-center');
    svg.appendChild(circle);

    // Year text
    const yearText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yearText.setAttribute('x', String(CENTER));
    yearText.setAttribute('y', String(CENTER - 20));
    yearText.setAttribute('class', 'rc-center-year');
    yearText.setAttribute('text-anchor', 'middle');
    yearText.setAttribute('dominant-baseline', 'central');
    yearText.textContent = String(year);
    svg.appendChild(yearText);

    // Age text
    const ageText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    ageText.setAttribute('x', String(CENTER));
    ageText.setAttribute('y', String(CENTER + 20));
    ageText.setAttribute('class', 'rc-center-age');
    ageText.setAttribute('text-anchor', 'middle');
    ageText.setAttribute('dominant-baseline', 'central');
    ageText.textContent = `${currentAge} years`;
    svg.appendChild(ageText);
  }

  /**
   * Shows tooltip for life year hover
   */
  private showLifeYearTooltip(event: MouseEvent, year: number, age: number): void {
    if (!this.tooltipEl) return;

    const content = `<div class="rc-tooltip-date">${year}</div>
      <div class="rc-tooltip-note">Age: ${age} years</div>`;

    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';

    const rect = this.containerEl_?.getBoundingClientRect();
    if (rect) {
      const x = event.clientX - rect.left + 10;
      const y = event.clientY - rect.top + 10;
      this.tooltipEl.style.left = `${x}px`;
      this.tooltipEl.style.top = `${y}px`;
    }
  }

  /**
   * Renders the annual view (original view)
   */
  private renderAnnualView(svg: SVGSVGElement, year: number): void {
    // Background circle
    this.renderBackgroundCircle(svg);

    // Get enabled rings sorted by order (0 = outermost)
    // Always includes Daily Notes ring (shows all entries if no folder configured)
    const enabledRings = this.getEnabledRingsSorted();

    // Calculate ring radii based on number of rings
    const ringRadiiMap = this.calculateRingRadii(enabledRings.length);

    // Render each ring
    for (const ring of enabledRings) {
      const radii = ringRadiiMap.get(ring.order);
      if (radii) {
        this.renderRing(svg, year, ring, radii);
      }
    }

    // Render month separators (spanning all rings including label ring)
    for (let month = 1; month <= 12; month++) {
      this.renderMonthSeparator(svg, this.monthToAngle(month));
    }

    // Render separator circle between data rings and label ring
    this.renderLabelRingSeparator(svg);

    // Render outer segments (ticks with labels)
    this.renderOuterSegments(svg, year);

    // Note: Anniversary indicators are now rendered as part of day arcs (10% outer edge)
    // See renderRingDayArc() and renderAnniversaryIndicator()

    // Render center with year
    this.renderCenter(svg, year);

    // Render month labels (in dedicated label ring)
    this.renderMonthLabels(svg);

    // Render today marker
    this.renderTodayMarker(svg, year);
  }

  /**
   * Renders a separator circle between data rings and the label ring
   */
  private renderLabelRingSeparator(svg: SVGSVGElement): void {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(CENTER));
    circle.setAttribute('cy', String(CENTER));
    circle.setAttribute('r', String(DATA_RING_INNER));
    circle.setAttribute('class', 'rc-label-ring-separator');
    svg.appendChild(circle);
  }

  /**
   * Renders the anniversary ring with red dots for recurring events
   */
  private renderAnniversaryRing(svg: SVGSVGElement, year: number): void {
    if (!this.config) return;

    // Get all anniversary entries
    const anniversaryEntries = this.config.service.getAllAnniversaryEntries();
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

      // Calculate angle for this date
      const daysInMonth = getDaysInMonth(year, month);
      const startAngle = this.monthToAngle(month);
      const monthArcSpan = Math.PI / 6;  // 30 degrees per month
      const dayOffset = (day - 0.5) / daysInMonth;
      const angle = startAngle + dayOffset * monthArcSpan;

      // Calculate position
      const x = CENTER + ANNIVERSARY_RING_RADIUS * Math.cos(angle - Math.PI / 2);
      const y = CENTER + ANNIVERSARY_RING_RADIUS * Math.sin(angle - Math.PI / 2);

      // Create dot element
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', String(ANNIVERSARY_DOT_RADIUS));
      dot.setAttribute('class', 'rc-anniversary-dot');

      // Add tooltip and click handler
      const firstEntry = entries[0];
      dot.addEventListener('mouseenter', (e) => {
        this.showAnniversaryTooltip(e as MouseEvent, entries);
      });
      dot.addEventListener('mouseleave', () => this.hideTooltip());
      dot.addEventListener('click', () => {
        if (entries.length === 1) {
          this.config?.openFile(firstEntry.filePath);
        } else {
          // For multiple entries, open the first one (could add a menu later)
          this.config?.openFile(firstEntry.filePath);
        }
      });

      svg.appendChild(dot);
    }
  }

  /**
   * Shows tooltip for anniversary dots
   */
  private showAnniversaryTooltip(event: MouseEvent, entries: readonly CalendarEntry[]): void {
    if (!this.tooltipEl || entries.length === 0) return;

    let content = '<div class="rc-tooltip-date">📅</div>';
    content += '<div class="rc-tooltip-notes">';

    for (const entry of entries.slice(0, 5)) {
      content += `<div class="rc-tooltip-note">${entry.displayName}</div>`;
    }

    if (entries.length > 5) {
      content += `<div class="rc-tooltip-more">+${entries.length - 5} more</div>`;
    }
    content += '</div>';

    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';

    const rect = this.containerEl_?.getBoundingClientRect();
    if (rect) {
      const x = event.clientX - rect.left + 10;
      const y = event.clientY - rect.top + 10;
      this.tooltipEl.style.left = `${x}px`;
      this.tooltipEl.style.top = `${y}px`;
    }
  }

  /**
   * Gets enabled rings sorted by order (0 = outermost, higher = inner)
   * Always includes Daily Notes ring as order 0 if dailyNoteFolder is configured
   * Falls back to showing all entries if no folder is configured
   */
  private getEnabledRingsSorted(): RingConfig[] {
    if (!this.config) return [];

    const rings: RingConfig[] = [];

    // Always include Daily Notes ring as the outermost ring (order 0)
    const dailyFolder = this.config.settings.dailyNoteFolder;
    // Use the configured folder, or empty string to show ALL entries as fallback
    rings.push({
      id: '__daily_notes__',
      name: 'Daily Notes',
      folder: dailyFolder?.trim() || '', // Empty string = show all entries
      color: 'blue',
      segmentType: 'daily',
      enabled: true,
      order: 0,
    });

    // Add configured rings with adjusted order (shifted by 1 since Daily Notes always exists)
    const configuredRings = this.config.settings.rings
      .filter(ring => ring.enabled)
      .sort((a, b) => a.order - b.order)
      .map((ring, index) => ({
        ...ring,
        order: index + 1, // Always shift by 1 since Daily Notes is always order 0
      }));

    rings.push(...configuredRings);

    return rings;
  }

  /**
   * Calculates radii for each ring based on total number of enabled rings
   * Order 0 = outermost ring, higher orders = inner rings
   * Data rings end at DATA_RING_INNER, leaving space for month labels
   */
  private calculateRingRadii(ringCount: number): Map<number, RingRadii> {
    const radiiMap = new Map<number, RingRadii>();

    if (ringCount === 0) return radiiMap;

    // Available space for data rings (excluding gaps and label ring)
    const totalGapSpace = (ringCount - 1) * RING_GAP;
    const availableSpace = OUTER_RADIUS - DATA_RING_INNER - totalGapSpace;
    const ringWidth = Math.max(MIN_RING_WIDTH, availableSpace / ringCount);

    // Calculate radii for each ring order
    // Order 0 = outermost, so it starts at OUTER_RADIUS
    for (let order = 0; order < ringCount; order++) {
      const outerRadius = OUTER_RADIUS - (order * (ringWidth + RING_GAP));
      const innerRadius = Math.max(DATA_RING_INNER, outerRadius - ringWidth);

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

    if (ring.showSpanningArcs) {
      // Spanning Arcs mode: render continuous arcs from startDate to endDate
      this.renderSpanningArcsRing(svg, year, ring, radii, ringColor);
    } else {
      // Default: render each month segment for this ring
      for (let month = 1; month <= 12; month++) {
        this.renderRingMonthSegment(svg, year, month, ring, radii, ringColor);
      }
    }
  }

  /**
   * Renders a ring with spanning arcs (multi-day events)
   */
  private renderSpanningArcsRing(
    svg: SVGSVGElement,
    year: number,
    ring: RingConfig,
    radii: RingRadii,
    ringColor: string
  ): void {
    if (!this.config) return;

    // Load spanning arcs from the folder
    const arcs = this.config.service.loadSpanningArcs(ring.folder, year, {
      startDateField: ring.startDateField || 'radcal-start',
      endDateField: ring.endDateField || 'radcal-end',
      colorField: ring.colorField || 'radcal-color',
      labelField: ring.labelField || 'radcal-label',
    });

    if (arcs.length === 0) {
      // Render empty ring background
      this.renderEmptyRingBackground(svg, radii);
      return;
    }

    // Assign tracks for overlapping arcs
    const arcsWithTracks = assignTracks(arcs);
    const trackCount = getMaxTrackCount(arcsWithTracks);

    // Render each spanning arc
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
   * Renders an empty ring background (for rings with no entries)
   */
  private renderEmptyRingBackground(svg: SVGSVGElement, radii: RingRadii): void {
    const path = this.createArcPath(radii.innerRadius, radii.outerRadius, 0, 2 * Math.PI - 0.001);
    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', path);
    arc.setAttribute('class', 'rc-ring-arc');
    arc.style.fill = 'var(--background-secondary)';
    arc.style.fillOpacity = '0.3';
    svg.appendChild(arc);
  }

  /**
   * Renders a single spanning arc
   */
  private renderSpanningArc(
    svg: SVGSVGElement,
    arc: PhaseWithTrack,
    radii: { inner: number; outer: number },
    ring: RingConfig,
    fallbackColor: string
  ): void {
    if (!this.config) return;

    // Create arc path
    const path = this.createArcPath(radii.inner, radii.outer, arc.startAngle, arc.endAngle);

    const arcEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arcEl.setAttribute('d', path);
    arcEl.setAttribute('class', 'rc-ring-arc');

    // Use arc color or fallback
    arcEl.style.fill = arc.color || fallbackColor;

    // Click handler to open file
    if (arc.filePath) {
      arcEl.style.cursor = 'pointer';
      arcEl.addEventListener('click', () => {
        this.config?.openFile(arc.filePath!);
      });
    }

    // Hover tooltip
    arcEl.addEventListener('mouseenter', (e) => {
      this.showSpanningArcTooltip(e, arc, ring);
    });
    arcEl.addEventListener('mouseleave', () => this.hideTooltip());

    svg.appendChild(arcEl);

    // Render label if space permits (arc spans more than ~15 degrees)
    if (arc.label && (arc.endAngle - arc.startAngle) > 0.26) {
      this.renderSpanningArcLabel(svg, arc, radii);
    }
  }

  /**
   * Renders a label on a spanning arc
   */
  private renderSpanningArcLabel(
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

    // Rotate for readability
    const rotationDeg = (midAngle + Math.PI / 2) * 180 / Math.PI;
    const adjustedRotation = rotationDeg > 90 && rotationDeg < 270 ? rotationDeg + 180 : rotationDeg;
    text.setAttribute('transform', `rotate(${adjustedRotation}, ${x}, ${y})`);

    text.textContent = arc.label;
    svg.appendChild(text);
  }

  /**
   * Shows tooltip for spanning arc hover
   */
  private showSpanningArcTooltip(event: MouseEvent, arc: PhaseWithTrack, ring: RingConfig): void {
    if (!this.tooltipEl) return;

    let content = `<div class="rc-tooltip-ring" style="color: ${arc.color}">${ring.name}</div>`;
    content += `<div class="rc-tooltip-date">${arc.label}</div>`;

    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';

    const rect = this.containerEl_?.getBoundingClientRect();
    if (rect) {
      const x = event.clientX - rect.left + 10;
      const y = event.clientY - rect.top + 10;
      this.tooltipEl.style.left = `${x}px`;
      this.tooltipEl.style.top = `${y}px`;
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

    // Calculate anniversary indicator height (10% of ring width)
    const ringWidth = radii.outerRadius - radii.innerRadius;
    const anniversaryHeight = ringWidth * 0.1;
    const mainArcOuterRadius = radii.outerRadius - anniversaryHeight;

    // Check for anniversary entries on this date
    const anniversaryEntries = this.config.service.getAnniversaryEntriesForDate(date);
    const hasAnniversary = anniversaryEntries.length > 0;

    // Create main day arc path (leaving space for anniversary indicator)
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

    // Render anniversary indicator at outer edge (10% of ring width)
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
   * Renders anniversary indicator as a thin arc at the outer edge of the day ring
   */
  private renderAnniversaryIndicator(
    svg: SVGSVGElement,
    startAngle: number,
    endAngle: number,
    innerRadius: number,
    outerRadius: number,
    entries: readonly CalendarEntry[],
    date: LocalDate
  ): void {
    if (!this.config) return;

    const path = this.createArcPath(innerRadius, outerRadius, startAngle, endAngle);
    const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    indicator.setAttribute('d', path);
    indicator.setAttribute('class', 'rc-anniversary-indicator');

    // Click handler - open first entry or show menu
    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      if (entries.length === 1) {
        this.config?.openFile(entries[0].filePath);
      } else if (entries.length > 1) {
        this.showAnniversaryMenu(e as MouseEvent, entries);
      }
    });

    // Tooltip on hover
    indicator.addEventListener('mouseenter', (e) => {
      this.showAnniversaryTooltip(e as MouseEvent, entries);
    });

    indicator.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    svg.appendChild(indicator);
  }

  /**
   * Shows menu for selecting anniversary entries
   */
  private showAnniversaryMenu(event: MouseEvent, entries: readonly CalendarEntry[]): void {
    if (!this.config) return;

    const menu = new Menu();

    for (const entry of entries.slice(0, 15)) {
      menu.addItem((item) => {
        item
          .setTitle(entry.displayName)
          .setIcon('cake')
          .onClick(() => {
            this.config?.openFile(entry.filePath);
          });
      });
    }

    if (entries.length > 15) {
      menu.addItem((item) => {
        item.setTitle(`+${entries.length - 15} more...`).setDisabled(true);
      });
    }

    menu.showAtMouseEvent(event);
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
    // Font size relative to label ring width (40% of ring width)
    const fontSize = LABEL_RING_WIDTH * 0.4;

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
      text.style.fontSize = `${fontSize}px`;
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
      // For wrap-around segments (like winter), calculate midpoint correctly
      let midAngle: number;
      if (segment.endDay > segment.startDay) {
        // Normal segment: just average the angles
        midAngle = (startAngle + endAngle) / 2;
      } else {
        // Wrap-around segment: endAngle already has +2π, use it directly
        midAngle = (startAngle + endAngle) / 2;
        // Normalize if > 2π
        if (midAngle > 2 * Math.PI) {
          midAngle -= 2 * Math.PI;
        }
      }

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
