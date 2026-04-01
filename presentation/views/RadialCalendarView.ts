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
import type { RadialCalendarSettings, RingConfig, RenderedSegment, PhaseWithTrack, PatternName } from '../../core/domain/types';
import {
  RING_COLORS,
  SVG_PATTERN_BUILDERS,
  PREDEFINED_SEASONS,
  PREDEFINED_QUARTERS,
  PREDEFINED_SEMESTERS,
  generate10DayPhases,
  generateWeekSegments,
  assignTracks,
  computeSubRingRadii,
  getMaxTrackCount,
  parseCustomPeriod,
} from '../../core/domain/types';
import {
  SVG_SIZE,
  CENTER,
  MAX_RADIUS,
  OUTER_RADIUS,
  INNER_RADIUS,
  DATA_RING_INNER,
  LABEL_RING_WIDTH,
  MONTH_LABEL_RADIUS,
  DAY_RING_WIDTH,
  RING_GAP,
  MIN_RING_WIDTH,
  LIFE_VIEW_PROPORTIONS,
  CENTER_RADIUS,
  YEAR_RING_INNER,
  YEAR_RING_OUTER,
  LIFE_PHASES_RING_INNER,
  LIFE_PHASES_RING_OUTER,
  LIFE_RING_INNER,
  LIFE_RING_OUTER,
  SEGMENT_TICK_INNER,
  SEGMENT_TICK_OUTER,
  SEGMENT_LABEL_RADIUS,
  ANNIVERSARY_RING_RADIUS,
  ANNIVERSARY_DOT_RADIUS,
  MONTH_NAMES,
  FULL_MONTH_NAMES,
  type RingRadii,
} from '../svg/RingLayout';
import { createArcPath as sharedCreateArcPath, monthToAngle as sharedMonthToAngle } from '../svg/SvgArc';
import { OuterSegmentRenderer } from '../renderers/OuterSegmentRenderer';
import { RingHelpers } from '../renderers/RingHelpers';
import { PeriodRenderer, PeriodRenderContext } from '../renderers/PeriodRenderer';

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

  // Ring filter state: which rings are visible (empty = all visible)
  private visibleRings: Set<string> = new Set();
  private allRingNames: string[] = [];

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

    const service = this.config.service;
    const year = service.getCurrentYear();

    // Build everything OFF-DOM first to prevent layout thrashing
    // Create container structure off-DOM
    const container = document.createElement('div');
    container.className = 'rc-container';

    // Build header off-DOM
    const header = document.createElement('div');
    header.className = 'rc-header';
    header.style.position = 'relative';
    header.style.zIndex = '100';
    this.buildHeader(header, year);
    container.appendChild(header);

    // Ring filter bar (Life View only)
    const isLifeView = this.config.settings.currentView === 'life';
    if (isLifeView) {
      const filterBar = this.buildRingFilterBar();
      if (filterBar) {
        container.appendChild(filterBar);
      }
    }

    // Build SVG wrapper off-DOM
    const wrapper = document.createElement('div');
    wrapper.className = 'rc-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.zIndex = '1';
    container.appendChild(wrapper);

    // Build SVG completely off-DOM
    this.renderRadialCalendar(wrapper, year);

    // Tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'rc-tooltip';
    tooltip.style.display = 'none';
    container.appendChild(tooltip);
    this.tooltipEl = tooltip;

    // Single DOM update: clear and append everything at once
    this.containerEl_.empty();
    this.containerEl_.appendChild(container);
  }

  private buildHeader(header: HTMLElement, year: number): void {
    if (!this.config) return;

    const currentView = this.config.settings.currentView;

    // Previous period button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '\u2190';
    prevBtn.className = 'rc-nav-btn';
    prevBtn.setAttribute('aria-label', 'Previous period');
    prevBtn.addEventListener('click', () => this.navigatePrevious());
    header.appendChild(prevBtn);

    // Period title (dynamic based on view mode)
    const periodTitle = document.createElement('span');
    periodTitle.textContent = this.getPeriodTitle();
    periodTitle.className = 'rc-year-title';
    header.appendChild(periodTitle);

    // Next period button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '\u2192';
    nextBtn.className = 'rc-nav-btn';
    nextBtn.setAttribute('aria-label', 'Next period');
    nextBtn.addEventListener('click', () => this.navigateNext());
    header.appendChild(nextBtn);

    // Today button
    const todayBtn = document.createElement('button');
    todayBtn.textContent = 'Today';
    todayBtn.className = 'rc-nav-btn rc-today-btn';
    todayBtn.setAttribute('aria-label', 'Go to today');
    todayBtn.addEventListener('click', () => this.navigateToToday());
    header.appendChild(todayBtn);

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = '\u21bb';
    refreshBtn.className = 'rc-nav-btn rc-refresh-btn';
    refreshBtn.setAttribute('aria-label', 'Refresh view');
    refreshBtn.addEventListener('click', () => this.render());
    header.appendChild(refreshBtn);

    // View mode dropdown
    const viewSelect = document.createElement('select');
    viewSelect.className = 'rc-view-select';
    viewSelect.setAttribute('aria-label', 'Select view mode');

    // Get custom period label
    const customPeriod = parseCustomPeriod(this.config.settings.customPeriodString);
    const customLabel = customPeriod ? `⚙️ ${customPeriod.label}` : '⚙️ Custom';

    const viewOptions = [
      { value: 'life', label: '⏳ Life' },
      { value: 'annual', label: '📅 Year' },
      { value: 'quarter', label: '📊 Quarter' },
      { value: 'month', label: '🗓️ Month' },
      { value: 'custom', label: customLabel },
    ];

    for (const opt of viewOptions) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      option.selected = currentView === opt.value;
      viewSelect.appendChild(option);
    }

    viewSelect.addEventListener('change', async (e) => {
      if (!this.config) return;
      const newView = (e.target as HTMLSelectElement).value as 'life' | 'annual' | 'quarter' | 'month' | 'custom';
      const newSettings = { ...this.config.settings, currentView: newView };
      this.config.settings = newSettings;
      await this.config.onSettingsChange(newSettings);
      this.render();
    });

    header.appendChild(viewSelect);
  }

  /**
   * Gets the title for the current period based on view mode
   */
  private getPeriodTitle(): string {
    if (!this.config) return '';

    const { currentView, currentYear, currentMonth, currentQuarter, customPeriodString, customPeriodStart } = this.config.settings;

    switch (currentView) {
      case 'life':
        return `Life (${this.config.settings.birthYear} - ${this.config.settings.birthYear + this.config.settings.expectedLifespan})`;
      case 'annual':
        return String(currentYear);
      case 'quarter':
        return `Q${currentQuarter} ${currentYear}`;
      case 'month':
        return `${FULL_MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
      case 'custom': {
        const parsed = parseCustomPeriod(customPeriodString);
        const startDate = this.parseISODate(customPeriodStart);
        if (parsed && startDate) {
          // Format: "Jan 1 - Jan 10" or "Jan 1 - Feb 1"
          const endDate = this.addDaysToDate(startDate, parsed.days || (parsed.months || 1) * 30);
          const startStr = `${MONTH_NAMES[startDate.month - 1]} ${startDate.day}`;
          const endStr = `${MONTH_NAMES[endDate.month - 1]} ${endDate.day}`;
          return `${startStr} - ${endStr}`;
        }
        return customPeriodString;
      }
      default:
        return String(currentYear);
    }
  }

  /**
   * Parse ISO date string to LocalDate
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

  /**
   * Navigate to previous period based on view mode
   */
  private async navigatePrevious(): Promise<void> {
    if (!this.config) return;

    const { currentView, currentYear, currentMonth, currentQuarter, customPeriodString, customPeriodStart } = this.config.settings;
    let newSettings = { ...this.config.settings };

    switch (currentView) {
      case 'life':
        // Life view doesn't navigate - already shows everything
        return;
      case 'annual':
        newSettings.currentYear = currentYear - 1;
        this.config.service.setYear(currentYear - 1);
        break;
      case 'quarter':
        if (currentQuarter > 1) {
          newSettings.currentQuarter = currentQuarter - 1;
        } else {
          newSettings.currentQuarter = 4;
          newSettings.currentYear = currentYear - 1;
        }
        break;
      case 'month':
        if (currentMonth > 1) {
          newSettings.currentMonth = currentMonth - 1;
        } else {
          newSettings.currentMonth = 12;
          newSettings.currentYear = currentYear - 1;
        }
        break;
      case 'custom': {
        const parsed = parseCustomPeriod(customPeriodString);
        const startDate = this.parseISODate(customPeriodStart);
        if (parsed && startDate) {
          const days = parsed.days || (parsed.months || 1) * 30;
          const newStart = this.subtractDaysFromDate(startDate, days);
          newSettings.customPeriodStart = this.toISOString(newStart);
          newSettings.currentYear = newStart.year;
        }
        break;
      }
    }

    this.config.settings = newSettings;
    await this.config.onSettingsChange(newSettings);
    this.render();
  }

  /**
   * Navigate to next period based on view mode
   */
  private async navigateNext(): Promise<void> {
    if (!this.config) return;

    const { currentView, currentYear, currentMonth, currentQuarter, customPeriodString, customPeriodStart } = this.config.settings;
    let newSettings = { ...this.config.settings };

    switch (currentView) {
      case 'life':
        // Life view doesn't navigate - already shows everything
        return;
      case 'annual':
        newSettings.currentYear = currentYear + 1;
        this.config.service.setYear(currentYear + 1);
        break;
      case 'quarter':
        if (currentQuarter < 4) {
          newSettings.currentQuarter = currentQuarter + 1;
        } else {
          newSettings.currentQuarter = 1;
          newSettings.currentYear = currentYear + 1;
        }
        break;
      case 'month':
        if (currentMonth < 12) {
          newSettings.currentMonth = currentMonth + 1;
        } else {
          newSettings.currentMonth = 1;
          newSettings.currentYear = currentYear + 1;
        }
        break;
      case 'custom': {
        const parsed = parseCustomPeriod(customPeriodString);
        const startDate = this.parseISODate(customPeriodStart);
        if (parsed && startDate) {
          const days = parsed.days || (parsed.months || 1) * 30;
          const newStart = this.addDaysToDate(startDate, days + 1); // +1 to move to next period
          newSettings.customPeriodStart = this.toISOString(newStart);
          newSettings.currentYear = newStart.year;
        }
        break;
      }
    }

    this.config.settings = newSettings;
    await this.config.onSettingsChange(newSettings);
    this.render();
  }

  /**
   * Subtract days from a date
   */
  private subtractDaysFromDate(date: LocalDate, days: number): LocalDate {
    const d = new Date(date.year, date.month - 1, date.day);
    d.setDate(d.getDate() - days);
    return createLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  /**
   * Convert LocalDate to ISO string
   */
  private toISOString(date: LocalDate): string {
    return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  }

  /**
   * Navigate to today's period
   */
  private async navigateToToday(): Promise<void> {
    if (!this.config) return;

    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];
    const newSettings = {
      ...this.config.settings,
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth() + 1,
      currentQuarter: Math.ceil((today.getMonth() + 1) / 3),
      customPeriodStart: todayISO,
    };

    this.config.settings = newSettings;
    this.config.service.goToToday();
    await this.config.onSettingsChange(newSettings);
    this.render();
  }

  /**
   * Builds the ring filter bar with toggle chips for each ring
   */
  private buildRingFilterBar(): HTMLElement | null {
    if (!this.config) return null;

    const folder = this.config.settings.lifePhasesFolder;
    const ringMap = this.config.service.loadLifePhasesByRing(folder);

    // Get all ring names
    this.allRingNames = Array.from(ringMap.keys()).sort((a, b) => {
      if (a === '__default__') return 1;
      if (b === '__default__') return -1;
      return a.localeCompare(b);
    });

    // If only default ring or no rings, don't show filter bar
    if (this.allRingNames.length <= 1) return null;

    // Initialize visible rings if empty (show all by default)
    if (this.visibleRings.size === 0) {
      this.allRingNames.forEach(name => this.visibleRings.add(name));
    }

    const filterBar = document.createElement('div');
    filterBar.className = 'rc-ring-filter-bar';

    // "All" toggle button
    const allBtn = document.createElement('button');
    allBtn.className = 'rc-ring-chip';
    allBtn.textContent = 'Alle';
    const allActive = this.visibleRings.size === this.allRingNames.length;
    if (allActive) allBtn.classList.add('rc-ring-chip-active');
    allBtn.addEventListener('click', () => {
      if (this.visibleRings.size === this.allRingNames.length) {
        // All are visible, do nothing (can't hide all)
      } else {
        // Show all rings
        this.visibleRings.clear();
        this.allRingNames.forEach(name => this.visibleRings.add(name));
        this.render();
      }
    });
    filterBar.appendChild(allBtn);

    // Individual ring chips
    for (const ringName of this.allRingNames) {
      const displayName = ringName === '__default__' ? 'Standard' : ringName;
      const chip = document.createElement('button');
      chip.className = 'rc-ring-chip';
      chip.textContent = displayName;

      if (this.visibleRings.has(ringName)) {
        chip.classList.add('rc-ring-chip-active');
      }

      chip.addEventListener('click', () => {
        if (this.visibleRings.has(ringName)) {
          // Don't allow hiding the last visible ring
          if (this.visibleRings.size > 1) {
            this.visibleRings.delete(ringName);
            this.render();
          }
        } else {
          this.visibleRings.add(ringName);
          this.render();
        }
      });

      filterBar.appendChild(chip);
    }

    return filterBar;
  }

  private renderRadialCalendar(wrapper: HTMLElement, year: number): void {
    if (!this.config) return;

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'rc-svg');
    this.svgEl = svg;

    const { currentView, currentMonth, currentQuarter, customPeriodString, customPeriodStart } = this.config.settings;

    switch (currentView) {
      case 'life':
        // Nested Clock: Life ring outer, Year ring inner
        this.renderNestedClock(svg, year);
        break;
      case 'quarter':
        // Quarter View: 3 months (~90 days)
        this.renderQuarterView(svg, year, currentQuarter);
        break;
      case 'month':
        // Month View: Single month (28-31 days)
        this.renderMonthView(svg, year, currentMonth);
        break;
      case 'custom':
        // Custom Period View: User-defined period (e.g., 10d, 3m)
        this.renderCustomView(svg, customPeriodString, customPeriodStart);
        break;
      case 'annual':
      default:
        // Annual View: Full year with optional folder rings
        this.renderAnnualView(svg, year);
        break;
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
    new LifeRenderer({
      settings: this.config.settings,
      service: this.config.service,
      app: this.app,
      openFile: (path) => this.config!.openFile(path),
      tooltipEl: this.tooltipEl,
      containerEl: this.containerEl_,
      visibleRings: this.visibleRings,
      onRefresh: () => this.render(),
    }).render(svg, year);
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
  private getEnabledRingsSorted(): RingConfig[] {
    if (!this.config) return [];

    // Start with configured rings from settings (includes Global Ring)
    const configuredRings = this.config.settings.rings
      .filter(ring => ring.enabled)
      .map(ring => ({ ...ring })); // Clone to avoid mutation

    // Add Daily Notes ring as a virtual ring after configured rings
    const dailyFolder = this.config.settings.dailyNoteFolder;
    const maxConfiguredOrder = configuredRings.length > 0
      ? Math.max(...configuredRings.map(r => r.order))
      : -1;

    configuredRings.push({
      id: '__daily_notes__',
      name: 'Daily Notes',
      folder: dailyFolder?.trim() || '', // Empty string = show all entries
      color: 'blue',
      segmentType: 'daily',
      enabled: true,
      order: maxConfiguredOrder + 1,
    });

    // Add calendar sources with showAsRing enabled as virtual rings
    const calendarSources = this.config.settings.calendarSources || [];
    const calendarRings = calendarSources
      .filter(source => source.enabled && source.showAsRing !== false && source.folder)
      .map((source, index) => ({
        id: `__calendar_${source.id}__`,
        name: source.name,
        folder: source.folder,
        color: source.color,
        segmentType: 'daily' as const,
        enabled: true,
        order: maxConfiguredOrder + 2 + index,
        // Spanning arcs for multi-day events
        showSpanningArcs: source.showSpanningArcs !== false,
        startDateField: 'radcal-start',
        endDateField: 'radcal-end',
        colorField: 'radcal-color',
        labelField: 'radcal-label',
      }));

    configuredRings.push(...calendarRings);

    // Sort by order and re-index to ensure contiguous order values (0, 1, 2, ...)
    configuredRings.sort((a, b) => a.order - b.order);
    configuredRings.forEach((ring, index) => {
      ring.order = index;
    });

    return configuredRings;
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
    const presets = this.config.settings.presets || [];
    return this.config.service.loadShowInAnnualArcs(year, presets);
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
