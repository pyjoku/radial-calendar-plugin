/**
 * RadialCalendarView - Circular Calendar View for Obsidian
 *
 * Displays the entire year as a radial/circular visualization:
 * - 12 month segments arranged in a circle (like a clock)
 * - Days shown as arcs within each month segment
 * - Notes displayed as colored indicators on day arcs
 * - Interactive hover and click for navigation
 */

import { ItemView, WorkspaceLeaf, Menu } from 'obsidian';
import type { CalendarService } from '../../application/services/CalendarService';
import type { CalendarEntry } from '../../core/domain/models/CalendarEntry';
import type { LocalDate } from '../../core/domain/models/LocalDate';
import { getToday, getWeekday, getDaysInMonth } from '../../core/domain/models/LocalDate';
import type { RadialCalendarSettings, RingConfig, RenderedSegment, PhaseWithTrack, PatternName } from '../../core/domain/types';
import { RING_COLORS, assignTracks, computeSubRingRadii, getMaxTrackCount, SVG_PATTERN_BUILDERS } from '../../core/domain/types';
import {
  SVG_SIZE,
  CENTER,
  OUTER_RADIUS,
  INNER_RADIUS,
  DATA_RING_INNER,
  LABEL_RING_WIDTH,
  MONTH_LABEL_RADIUS,
  RING_GAP,
  MIN_RING_WIDTH,
  MONTH_NAMES,
  FULL_MONTH_NAMES,
  type RingRadii,
} from '../svg/RingLayout';
import { createArcPath as sharedCreateArcPath, monthToAngle as sharedMonthToAngle } from '../svg/SvgArc';
import { OuterSegmentRenderer } from '../renderers/OuterSegmentRenderer';
import { RingHelpers } from '../renderers/RingHelpers';
import { PeriodRenderer, PeriodRenderContext } from '../renderers/PeriodRenderer';
import { parseRadcalConfig } from '../codeblock/RadcalConfigParser';
import { RadcalRenderer, EntriesByDate } from '../codeblock/RadcalRenderer';
import { parseUnifiedRadcal, UnifiedRingRenderChild, parseTimeBlock, DayViewRenderChild, WeekViewRenderChild, MonthViewRenderChild, MultiRingRenderChild } from '../codeblock/TimeBlockRenderer';
import { RadcalFilterEngine } from '../codeblock/RadcalFilterEngine';

export const VIEW_TYPE_RADIAL_CALENDAR = 'radial-calendar-plugin';

/**
 * Format duration in days to a human-readable string
 * Smart format: uses years/months/days based on length
 */
function formatDuration(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const remaining = days % 365;
    if (remaining >= 30) {
      const months = Math.floor(remaining / 30);
      return `${years}y ${months}m`;
    }
    return `${years}y`;
  }
  if (days >= 30) {
    const months = Math.floor(days / 30);
    const remaining = days % 30;
    if (remaining > 0) {
      return `${months}m ${remaining}d`;
    }
    return `${months}m`;
  }
  return `${days}d`;
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

  // View-local state (not persisted to settings)
  private currentYear: number = new Date().getFullYear();

  // Ring filter state for life view
  private visibleRings: Set<string> = new Set();
  private allRingNames: string[] = [];

  // Custom mode: filter engine for codeblock rendering
  private filterEngine: RadcalFilterEngine | null = null;

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
    this.currentYear = config.service.getCurrentYear();
    this.filterEngine = new RadcalFilterEngine(this.app);
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

    const sidebarMode = this.config.settings.sidebarMode ?? 'calendar';

    const container = document.createElement('div');
    container.className = 'rc-container';

    const header = document.createElement('div');
    header.className = 'rc-header';
    header.style.position = 'relative';
    header.style.zIndex = '100';
    this.buildHeader(header, sidebarMode);
    container.appendChild(header);

    const wrapper = document.createElement('div');
    wrapper.className = 'rc-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.zIndex = '1';
    container.appendChild(wrapper);

    const tooltip = document.createElement('div');
    tooltip.className = 'rc-tooltip';
    tooltip.style.display = 'none';
    container.appendChild(tooltip);
    this.tooltipEl = tooltip;

    if (sidebarMode === 'custom') {
      this.renderCustomCodeblock(wrapper);
    } else {
      this.renderCalendarMode(wrapper, this.currentYear);
    }

    this.containerEl_.empty();
    this.containerEl_.appendChild(container);
  }

  private buildHeader(header: HTMLElement, sidebarMode: 'calendar' | 'custom'): void {
    if (!this.config) return;

    // Mode dropdown: Calendar / Custom
    const modeSelect = document.createElement('select');
    modeSelect.className = 'rc-view-select';
    modeSelect.setAttribute('aria-label', 'Select sidebar mode');
    for (const { value, label } of [
      { value: 'calendar', label: '📅 Calendar' },
      { value: 'custom', label: '⚙️ Custom' },
    ]) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      opt.selected = sidebarMode === value;
      modeSelect.appendChild(opt);
    }
    modeSelect.addEventListener('change', async (e) => {
      if (!this.config) return;
      const newMode = (e.target as HTMLSelectElement).value as 'calendar' | 'custom';
      this.config.settings = { ...this.config.settings, sidebarMode: newMode };
      await this.config.onSettingsChange(this.config.settings);
      this.render();
    });
    header.appendChild(modeSelect);

    // Year navigation — Calendar mode only
    if (sidebarMode === 'calendar') {
      const prevBtn = document.createElement('button');
      prevBtn.textContent = '\u2190';
      prevBtn.className = 'rc-nav-btn';
      prevBtn.setAttribute('aria-label', 'Previous year');
      prevBtn.addEventListener('click', () => {
        this.currentYear--;
        this.config?.service.setYear(this.currentYear);
        this.render();
      });
      header.appendChild(prevBtn);

      const yearTitle = document.createElement('span');
      yearTitle.textContent = String(this.currentYear);
      yearTitle.className = 'rc-year-title';
      header.appendChild(yearTitle);

      const nextBtn = document.createElement('button');
      nextBtn.textContent = '\u2192';
      nextBtn.className = 'rc-nav-btn';
      nextBtn.setAttribute('aria-label', 'Next year');
      nextBtn.addEventListener('click', () => {
        this.currentYear++;
        this.config?.service.setYear(this.currentYear);
        this.render();
      });
      header.appendChild(nextBtn);

      const todayBtn = document.createElement('button');
      todayBtn.textContent = 'Today';
      todayBtn.className = 'rc-nav-btn rc-today-btn';
      todayBtn.setAttribute('aria-label', 'Go to today');
      todayBtn.addEventListener('click', () => {
        this.currentYear = new Date().getFullYear();
        this.config?.service.goToToday();
        this.render();
      });
      header.appendChild(todayBtn);
    }

    // Refresh button always visible
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '\u21bb';
    refreshBtn.className = 'rc-nav-btn rc-refresh-btn';
    refreshBtn.setAttribute('aria-label', 'Refresh view');
    refreshBtn.addEventListener('click', () => this.render());
    header.appendChild(refreshBtn);
  }


  /**
   * Calendar mode: renders the annual SVG view
   */
  private renderCalendarMode(wrapper: HTMLElement, year: number): void {
    if (!this.config) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'rc-svg');
    this.svgEl = svg;
    this.renderAnnualView(svg, year);
    wrapper.appendChild(svg);
  }

  /**
   * Custom mode: parse settings.customCodeblock and render via the codeblock pipeline
   */
  private renderCustomCodeblock(wrapper: HTMLElement): void {
    if (!this.config) return;
    const source = this.config.settings.customCodeblock?.trim() ?? '';
    if (!source) {
      const msg = document.createElement('div');
      msg.className = 'rc-custom-empty';
      msg.textContent = 'No custom codeblock defined. Add one in Settings → Sidebar → Custom Codeblock.';
      msg.style.padding = '2rem';
      msg.style.textAlign = 'center';
      msg.style.opacity = '0.6';
      wrapper.appendChild(msg);
      return;
    }

    // Detect syntax type and render accordingly
    if (/^ring:\s*(day|week|month|hour|season|year|life)/m.test(source)) {
      // Unified ring syntax
      const config = parseUnifiedRadcal(source);
      const child = new UnifiedRingRenderChild(wrapper, config);
      child.load();
    } else if (/^type:\s*(day|week|month)/m.test(source)) {
      // Time block syntax
      const parsed = parseTimeBlock(source);
      const hasDay = parsed.dayBlocks.length > 0;
      const hasWeek = parsed.weekBlocks.length > 0;
      const hasMonth = parsed.monthBlocks.length > 0;
      const typeCount = [hasDay, hasWeek, hasMonth].filter(Boolean).length;
      if (typeCount > 1) {
        const child = new MultiRingRenderChild(wrapper, parsed.config, parsed.dayBlocks, parsed.weekBlocks, parsed.monthBlocks);
        child.load();
      } else if (hasDay) {
        const child = new DayViewRenderChild(wrapper, parsed.config, parsed.dayBlocks);
        child.load();
      } else if (hasWeek) {
        const child = new WeekViewRenderChild(wrapper, parsed.config, parsed.weekBlocks);
        child.load();
      } else if (hasMonth) {
        const child = new MonthViewRenderChild(wrapper, parsed.config, parsed.monthBlocks);
        child.load();
      }
    } else {
      // Standard radcal config
      const config = parseRadcalConfig(source);
      const year = config.year ?? this.config.service.getCurrentYear();
      const entries = this.loadEntriesForCodeblock(config, year);
      const renderer = new RadcalRenderer();
      const svg = renderer.render(config, entries, year, () => {});
      wrapper.appendChild(svg);
    }
  }

  /**
   * Load entries for a codeblock config (standard radcal only)
   */
  private loadEntriesForCodeblock(config: ReturnType<typeof parseRadcalConfig>, year: number): EntriesByDate {
    if (!this.config) return new Map();
    const service = this.config.service;
    const result: EntriesByDate = new Map();

    const rings = config.rings?.length ? config.rings : [{ folder: config.folder ?? '', color: 'blue' as const }];
    for (const ring of rings) {
      const folder = ring.folder ?? '';
      for (let month = 1; month <= 12; month++) {
        const days = new Date(year, month, 0).getDate();
        for (let day = 1; day <= days; day++) {
          const entries = folder
            ? service.getEntriesForDateInFolder({ year, month, day }, folder)
            : service.getEntriesForDate({ year, month, day });
          if (entries.length > 0) {
            const key = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const existing = result.get(key) ?? [];
            result.set(key, [...existing, ...entries]);
          }
        }
      }
    }
    return result;
  }

  /**
   * Renders a label for a named ring at the left side
   */
  private renderRingLabel(svg: SVGSVGElement, label: string, outerRadius: number, innerRadius: number): void {
    const midRadius = (outerRadius + innerRadius) / 2;
    // Position label at 9 o'clock (left side)
    const angle = Math.PI; // 180 degrees = left side
    const x = CENTER + midRadius * Math.cos(angle);
    const y = CENTER + midRadius * Math.sin(angle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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
   * Gets or creates a pattern definition for a specific color and pattern type.
   * Returns the pattern ID to use as fill reference.
   */
  private getOrCreatePattern(
    defs: SVGDefsElement,
    patternName: PatternName,
    color: string
  ): string {
    // Create unique ID for this pattern+color combination
    const patternId = `pattern-${patternName}-${color.replace('#', '')}`;

    // Check if already exists
    if (defs.querySelector(`#${patternId}`)) {
      return `url(#${patternId})`;
    }

    // Create new pattern element
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern') as SVGPatternElement;
    pattern.setAttribute('id', patternId);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '10');
    pattern.setAttribute('height', '10');

    // Build pattern content using DOM methods
    const builder = SVG_PATTERN_BUILDERS[patternName];
    if (builder) {
      builder(pattern, color);
    }

    defs.appendChild(pattern);
    return `url(#${patternId})`;
  }

  /**
   * Creates a fade gradient for an arc (solid -> transparent)
   * @param defs - SVG defs element
   * @param gradientId - Unique ID for the gradient
   * @param color - Base color
   * @param startAngle - Arc start angle
   * @param endAngle - Arc end angle
   */
  private getOrCreateFadeGradient(
    defs: SVGDefsElement,
    gradientId: string,
    color: string,
    startAngle: number,
    endAngle: number,
    todayPosition?: number // 0-1 where today falls in the arc (0=start, 1=end)
  ): string {
    // Check if already exists
    if (defs.querySelector(`#${gradientId}`)) {
      return `url(#${gradientId})`;
    }

    // Calculate gradient direction (from start to end along the arc)
    const startAdjusted = startAngle - Math.PI / 2;
    const endAdjusted = endAngle - Math.PI / 2;

    // Linear gradient from arc start toward end
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');

    // Gradient from start of arc to end
    const r = 300; // Approximate radius for gradient direction
    const x1 = CENTER + r * Math.cos(startAdjusted);
    const y1 = CENTER + r * Math.sin(startAdjusted);
    const x2 = CENTER + r * Math.cos(endAdjusted);
    const y2 = CENTER + r * Math.sin(endAdjusted);

    gradient.setAttribute('x1', String(x1));
    gradient.setAttribute('y1', String(y1));
    gradient.setAttribute('x2', String(x2));
    gradient.setAttribute('y2', String(y2));

    // Determine where the fade starts based on today's position
    // todayPosition: 0 = start of arc, 1 = end of arc
    // If today is before start (undefined or <0): whole arc is future → fade from start
    // If today is after end (>1): whole arc is past → solid
    // Otherwise: solid until today, then fade

    let fadeStartPercent: number;
    if (todayPosition === undefined || todayPosition <= 0) {
      // Whole arc is in the future - fade from the very beginning
      fadeStartPercent = 0;
    } else if (todayPosition >= 1) {
      // Whole arc is in the past - no fade needed, solid color
      fadeStartPercent = 100;
    } else {
      // Today is somewhere in the arc - fade starts at today
      fadeStartPercent = Math.round(todayPosition * 100);
    }

    // Color stops: solid until today, then fade to transparent
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', color);
    stop1.setAttribute('stop-opacity', '1');

    if (fadeStartPercent > 0 && fadeStartPercent < 100) {
      // Add stop at today's position (solid until here)
      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', `${fadeStartPercent}%`);
      stop2.setAttribute('stop-color', color);
      stop2.setAttribute('stop-opacity', '1');
      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
    } else {
      gradient.appendChild(stop1);
    }

    // End stop - faded
    const stopEnd = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stopEnd.setAttribute('offset', '100%');
    stopEnd.setAttribute('stop-color', color);
    stopEnd.setAttribute('stop-opacity', fadeStartPercent >= 100 ? '1' : '0.15');
    gradient.appendChild(stopEnd);

    defs.appendChild(gradient);
    return `url(#${gradientId})`;
  }

  /**
   * Calculate where today falls within a date range (0 = start, 1 = end)
   */
  private calculateTodayPosition(startDate: LocalDate, endDate: LocalDate): number {
    const today = new Date();
    const todayLocal: LocalDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
    };

    // Convert dates to day numbers for comparison
    const startDays = this.localDateToDays(startDate);
    const endDays = this.localDateToDays(endDate);
    const todayDays = this.localDateToDays(todayLocal);

    // Calculate position (0 = at start, 1 = at end)
    const totalDays = endDays - startDays;
    if (totalDays <= 0) return 0;

    const daysFromStart = todayDays - startDays;
    return daysFromStart / totalDays;
  }

  /**
   * Convert LocalDate to days since epoch (for comparison)
   */
  private localDateToDays(date: LocalDate): number {
    return new Date(date.year, date.month - 1, date.day).getTime() / (1000 * 60 * 60 * 24);
  }

  /**
   * Applies visual options (pattern, opacity, fade) to an arc element
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

    // Apply pattern if specified (and not 'solid')
    if (pattern && pattern !== 'solid') {
      const patternUrl = this.getOrCreatePattern(defs, pattern, color);
      arcEl.style.fill = patternUrl;
    } else if (fade && startAngle !== undefined && endAngle !== undefined && id) {
      // Calculate today's position if we have dates
      let todayPosition: number | undefined;
      if (startDate && endDate) {
        todayPosition = this.calculateTodayPosition(startDate, endDate);
      }

      // Apply fade gradient if specified
      const gradientId = `fade-${id.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const fadeUrl = this.getOrCreateFadeGradient(defs, gradientId, color, startAngle, endAngle, todayPosition);
      arcEl.style.fill = fadeUrl;
    } else {
      // Default: solid color
      arcEl.style.fill = color;
    }

    // Apply opacity if specified (convert 0-100 to 0-1)
    if (opacity !== undefined && opacity !== 100) {
      arcEl.style.fillOpacity = String(opacity / 100);
    }
  }

  /**
   * Renders the annual view (original view)
   */
  private renderAnnualView(svg: SVGSVGElement, year: number): void {
    if (!this.config) return;
    new PeriodRenderer(this.createPeriodContext()).renderAnnualView(svg, year);
  }

  // ============================================================================
  // Month View
  // ============================================================================

  /**
   * Renders the month view (single month with days as segments)
   */
  private renderMonthView(svg: SVGSVGElement, year: number, month: number): void {
    if (!this.config) return;
    new PeriodRenderer(this.createPeriodContext()).renderMonthView(svg, year, month);
  }

  // ============================================================================
  // RingHelpers factory
  // ============================================================================

  /**
   * Creates a configured RingHelpers instance wired to this view's callbacks.
   * Callers must ensure this.config is non-null before calling.
   */
  private createRingHelpers(): RingHelpers {
    return new RingHelpers({
      settings: this.config!.settings,
      service: this.config!.service,
      callbacks: {
        applyVisualOptions: this.applyVisualOptions.bind(this),
        getOrCreateDefs: this.getOrCreateDefs.bind(this),
        renderRingLabel: this.renderRingLabel.bind(this),
        showAnniversaryTooltip: this.showAnniversaryTooltip.bind(this),
        hideTooltip: this.hideTooltip.bind(this),
        showSpanningArcTooltip: this.showSpanningArcTooltip.bind(this),
        showDayContextMenu: this.showDayContextMenu.bind(this),
        showRingTooltip: this.showRingTooltip.bind(this),
        showAnniversaryMenu: this.showAnniversaryMenu.bind(this),
        openFile: (path) => this.config!.openFile(path),
        openDailyNote: (date) => this.config!.service.openDailyNote(date),
      },
    });
  }

  /**
   * Creates a PeriodRenderContext wired to this view's private methods.
   * Callers must ensure this.config is non-null before calling.
   */
  private createPeriodContext(): PeriodRenderContext {
    const ringHelpers = this.createRingHelpers();
    return {
      getEnabledRingsSorted: () => this.getEnabledRingsSorted(),
      calculateRingRadii: (n) => this.calculateRingRadii(n),
      loadShowInAnnualArcs: (year) => this.loadShowInAnnualArcs(year),
      renderShowInAnnualRing: (svg, arcs, radii) => ringHelpers.renderShowInAnnualRing(svg, arcs, radii),
      renderRing: (svg, year, ring, radii) => ringHelpers.renderRing(svg, year, ring, radii),
      renderRingSeparator: (svg, r) => ringHelpers.renderRingSeparator(svg, r),
      renderMonthSeparator: (svg, angle) => this.renderMonthSeparator(svg, angle),
      renderLabelRingSeparator: (svg) => ringHelpers.renderLabelRingSeparator(svg),
      renderOuterSegments: (svg, year) => this.renderOuterSegments(svg, year),
      renderCenter: (svg, year) => this.renderCenter(svg, year),
      renderMonthLabels: (svg) => this.renderMonthLabels(svg),
      renderTodayMarker: (svg, year) => this.renderTodayMarker(svg, year),
      renderYearBoundaryMarker: (svg) => ringHelpers.renderYearBoundaryMarker(svg),
      renderBackgroundCircle: (svg) => this.renderBackgroundCircle(svg),
      monthToAngle: (month) => this.monthToAngle(month),
      createArcPath: (innerR, outerR, start, end) => this.createArcPath(innerR, outerR, start, end),
      showTooltip: (e, date, entries) => this.showTooltip(e, date, entries),
      hideTooltip: () => this.hideTooltip(),
      showArcTooltip: (e, arc) => this.showArcTooltip(e, arc),
      openFile: (path) => this.config!.openFile(path),
      createDailyNote: (date) => { void this.config!.service.openDailyNote(date); },
    };
  }

  // ============================================================================
  // Ring tooltip callbacks (stay in view; passed to RingHelpers via callbacks)
  // ============================================================================

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

    // Center tooltip in the container
    this.centerTooltip();
  }

  /**
   * Gets enabled rings sorted by order (0 = outermost, higher = inner)
   * Includes rings from settings (including Global Ring), Daily Notes, and Calendar Sources.
   * Rings are sorted by their configured order.
   */
  /**
   * Calendar mode rings: Daily Notes + Calendar Sources only.
   * Ring config is no longer in settings — it lives in codeblocks.
   */
  private getEnabledRingsSorted(): RingConfig[] {
    if (!this.config) return [];

    const rings: RingConfig[] = [];

    // Daily Notes ring
    const dailyFolder = this.config.settings.dailyNoteFolder;
    rings.push({
      id: '__daily_notes__',
      name: 'Daily Notes',
      folder: dailyFolder?.trim() || '',
      color: 'blue',
      segmentType: 'daily',
      enabled: true,
      order: 0,
    });

    // Calendar source rings
    const calendarSources = this.config.settings.calendarSources || [];
    calendarSources
      .filter(source => source.enabled && source.showAsRing !== false && source.folder)
      .forEach((source, index) => {
        rings.push({
          id: `__calendar_${source.id}__`,
          name: source.name,
          folder: source.folder,
          color: source.color,
          segmentType: 'daily' as const,
          enabled: true,
          order: index + 1,
          showSpanningArcs: source.showSpanningArcs !== false,
          startDateField: 'radcal-start',
          endDateField: 'radcal-end',
          colorField: 'radcal-color',
          labelField: 'radcal-label',
        });
      });

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
   * Loads all arcs with radcal-showInAnnual: true for the given year
   */
  private loadShowInAnnualArcs(year: number): RenderedSegment[] {
    if (!this.config) return [];
    return this.config.service.loadShowInAnnualArcs(year, []);
  }

  /**
   * Shows tooltip for spanning arc hover
   */
  private showSpanningArcTooltip(event: MouseEvent, arc: PhaseWithTrack, ring: RingConfig): void {
    if (!this.tooltipEl) return;

    let content = `<div class="rc-tooltip-ring" style="color: ${arc.color}">${ring.name}</div>`;
    content += `<div class="rc-tooltip-date">${arc.label}</div>`;

    // Add date range and duration if available
    if (arc.startDate && arc.endDate && arc.durationDays) {
      const startStr = `${arc.startDate.day}.${arc.startDate.month}.${arc.startDate.year}`;
      const endStr = `${arc.endDate.day}.${arc.endDate.month}.${arc.endDate.year}`;
      const durationStr = formatDuration(arc.durationDays);
      content += `<div class="rc-tooltip-duration">${startStr} – ${endStr}</div>`;
      content += `<div class="rc-tooltip-duration-value">${durationStr}</div>`;
    }

    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';

    // Center tooltip in the container
    this.centerTooltip();
  }

  /**
   * Shows tooltip for a RenderedSegment arc (used in month/quarter/custom views)
   */
  private showArcTooltip(event: MouseEvent, arc: RenderedSegment): void {
    if (!this.tooltipEl) return;
    const label = arc.label || '';
    let content = '<div class="rc-tooltip-date">';
    if (arc.startDate && arc.endDate) {
      content += `${arc.startDate.year}-${String(arc.startDate.month).padStart(2, '0')}-${String(arc.startDate.day).padStart(2, '0')} → ${arc.endDate.year}-${String(arc.endDate.month).padStart(2, '0')}-${String(arc.endDate.day).padStart(2, '0')}`;
    }
    content += '</div>';
    if (label) {
      content += `<div class="rc-tooltip-notes"><div class="rc-tooltip-note">${label}</div></div>`;
    }
    this.tooltipEl.innerHTML = content;
    this.tooltipEl.style.display = 'block';
    this.centerTooltip();
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

    // Center tooltip in the container
    this.centerTooltip();
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

      // Calculate rotation to point text towards center
      // Angle is measured from 12 o'clock, going clockwise
      let rotationDeg = (angle * 180 / Math.PI);

      // Flip text 180° for the bottom half of the circle (Apr-Sep)
      // This is when angle is between π/2 (90°) and 3π/2 (270°)
      // Keeps text readable - baseline always faces outward
      const isBottomHalf = angle > Math.PI / 2 && angle < 3 * Math.PI / 2;
      if (isBottomHalf) {
        rotationDeg += 180;
      }

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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
    return sharedCreateArcPath(CENTER, innerR, outerR, startAngle, endAngle);
  }

  private monthToAngle(month: number): number {
    return sharedMonthToAngle(month);
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

    // Center tooltip in the container
    this.centerTooltip();
  }

  private hideTooltip(): void {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  /**
   * Centers the tooltip in the container
   */
  private centerTooltip(): void {
    if (!this.tooltipEl || !this.containerEl_) return;

    const containerRect = this.containerEl_.getBoundingClientRect();

    // Position at center of container
    this.tooltipEl.style.left = '50%';
    this.tooltipEl.style.top = '50%';
    this.tooltipEl.style.transform = 'translate(-50%, -50%)';
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
    new OuterSegmentRenderer(this.config.settings).renderOuterSegments(svg, year);
  }

}
