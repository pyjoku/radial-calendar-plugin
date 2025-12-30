/**
 * TimeBlockRenderer - Unified renderer for day/week/month time blocks
 *
 * New syntax (no pipe symbol):
 *   09:00-10:00 blue: Meeting
 *   Mon 09:00-10:00 green: Standup
 *   15 red: Zahnarzt
 *   15-17 blue: Konferenz
 *
 * Color is optional, defaults to 'blue'
 */

import { MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import { RING_COLORS } from '../../core/domain/types';

// SVG Constants
const SVG_SIZE = 400;
const CENTER = SVG_SIZE / 2;
const OUTER_RADIUS = 180;
const INNER_RADIUS = 100;
const HOUR_LABEL_RADIUS = 75;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Day name mappings
const DAY_NAMES: Record<string, number> = {
  'sun': 0, 'so': 0,
  'mon': 1, 'mo': 1,
  'tue': 2, 'di': 2,
  'wed': 3, 'mi': 3,
  'thu': 4, 'do': 4,
  'fri': 5, 'fr': 5,
  'sat': 6, 'sa': 6
};

const DAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Time block types
 */
export type TimeBlockType = 'day' | 'week' | 'month';

/**
 * Configuration for time block view
 */
export interface TimeBlockConfig {
  type: TimeBlockType;
  showCurrentTime: boolean;
  startHour: number;  // For day view: which hour is at top
}

/**
 * A day time block (for daily view)
 */
export interface DayTimeBlock {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  label: string;
  color: string;
}

/**
 * A week time block
 */
export interface WeekTimeBlock {
  dayOfWeek: number;  // 0=Sunday, 1=Monday, ..., 6=Saturday
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  label: string;
  color: string;
}

/**
 * A month time block
 */
export interface MonthTimeBlock {
  dayOfMonth: number;  // 1-31
  endDay?: number;     // For ranges like 15-17
  label: string;
  color: string;
}

/**
 * Parse the unified radcal codeblock with type
 */
export function parseTimeBlock(source: string): {
  config: TimeBlockConfig;
  dayBlocks: DayTimeBlock[];
  weekBlocks: WeekTimeBlock[];
  monthBlocks: MonthTimeBlock[];
} {
  const lines = source.trim().split('\n');
  let config: TimeBlockConfig = { type: 'day', showCurrentTime: true, startHour: 0 };
  const dayBlocks: DayTimeBlock[] = [];
  const weekBlocks: WeekTimeBlock[] = [];
  const monthBlocks: MonthTimeBlock[] = [];

  let inYaml = false;
  let yamlLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '---') {
      if (!inYaml) {
        inYaml = true;
      } else {
        // Parse YAML config
        config = parseYamlConfig(yamlLines);
        inYaml = false;
        yamlLines = [];
      }
      continue;
    }

    if (inYaml) {
      yamlLines.push(trimmed);
      continue;
    }

    // Simple type detection without YAML block
    if (trimmed.startsWith('type:')) {
      const typeValue = trimmed.slice(5).trim().toLowerCase();
      if (typeValue === 'day' || typeValue === 'week' || typeValue === 'month') {
        config.type = typeValue;
      }
      continue;
    }

    // Skip empty lines
    if (!trimmed) continue;

    // Parse based on detected type
    switch (config.type) {
      case 'day':
        const dayBlock = parseDayLine(trimmed);
        if (dayBlock) dayBlocks.push(dayBlock);
        break;
      case 'week':
        const weekBlock = parseWeekLine(trimmed);
        if (weekBlock) weekBlocks.push(weekBlock);
        break;
      case 'month':
        const monthBlock = parseMonthLine(trimmed);
        if (monthBlock) monthBlocks.push(monthBlock);
        break;
    }
  }

  return { config, dayBlocks, weekBlocks, monthBlocks };
}

/**
 * Parse YAML configuration
 */
function parseYamlConfig(lines: string[]): TimeBlockConfig {
  const config: TimeBlockConfig = { type: 'day', showCurrentTime: true, startHour: 0 };

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim().toLowerCase();

    if (key === 'type') {
      if (value === 'day' || value === 'week' || value === 'month') {
        config.type = value;
      }
    } else if (key === 'showcurrenttime') {
      config.showCurrentTime = value !== 'false';
    } else if (key === 'starthour') {
      config.startHour = parseInt(value, 10) || 0;
    }
  }

  return config;
}

/**
 * Parse a day line: "09:00-10:00 blue: Meeting" or "09:00-10:00 Meeting"
 */
function parseDayLine(line: string): DayTimeBlock | null {
  // New syntax: "09:00-10:00 blue: Meeting"
  const newMatch = line.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(\w+):\s*(.+)$/);
  if (newMatch) {
    return {
      startHour: parseInt(newMatch[1], 10),
      startMinute: parseInt(newMatch[2], 10),
      endHour: parseInt(newMatch[3], 10),
      endMinute: parseInt(newMatch[4], 10),
      color: newMatch[5].toLowerCase(),
      label: newMatch[6].trim()
    };
  }

  // Syntax without color: "09:00-10:00 Meeting"
  const simpleMatch = line.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+)$/);
  if (simpleMatch) {
    return {
      startHour: parseInt(simpleMatch[1], 10),
      startMinute: parseInt(simpleMatch[2], 10),
      endHour: parseInt(simpleMatch[3], 10),
      endMinute: parseInt(simpleMatch[4], 10),
      color: 'blue',
      label: simpleMatch[5].trim()
    };
  }

  // Legacy syntax: "09:00-10:00 Meeting | blue"
  const legacyMatch = line.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+?)\s*\|\s*(\w+)$/);
  if (legacyMatch) {
    return {
      startHour: parseInt(legacyMatch[1], 10),
      startMinute: parseInt(legacyMatch[2], 10),
      endHour: parseInt(legacyMatch[3], 10),
      endMinute: parseInt(legacyMatch[4], 10),
      label: legacyMatch[5].trim(),
      color: legacyMatch[6].toLowerCase()
    };
  }

  return null;
}

/**
 * Parse a week line: "Mon 09:00-10:00 blue: Standup" or "Mo 09:00-10:00 Standup"
 */
function parseWeekLine(line: string): WeekTimeBlock | null {
  // New syntax: "Mon 09:00-10:00 blue: Standup"
  const newMatch = line.match(/^(\w{2,3})\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(\w+):\s*(.+)$/i);
  if (newMatch) {
    const dayName = newMatch[1].toLowerCase();
    const dayOfWeek = DAY_NAMES[dayName];
    if (dayOfWeek === undefined) return null;

    return {
      dayOfWeek,
      startHour: parseInt(newMatch[2], 10),
      startMinute: parseInt(newMatch[3], 10),
      endHour: parseInt(newMatch[4], 10),
      endMinute: parseInt(newMatch[5], 10),
      color: newMatch[6].toLowerCase(),
      label: newMatch[7].trim()
    };
  }

  // Syntax without color: "Mon 09:00-10:00 Standup"
  const simpleMatch = line.match(/^(\w{2,3})\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+)$/i);
  if (simpleMatch) {
    const dayName = simpleMatch[1].toLowerCase();
    const dayOfWeek = DAY_NAMES[dayName];
    if (dayOfWeek === undefined) return null;

    return {
      dayOfWeek,
      startHour: parseInt(simpleMatch[2], 10),
      startMinute: parseInt(simpleMatch[3], 10),
      endHour: parseInt(simpleMatch[4], 10),
      endMinute: parseInt(simpleMatch[5], 10),
      color: 'blue',
      label: simpleMatch[6].trim()
    };
  }

  // Legacy syntax: "Mon 09:00-10:00 Standup | blue"
  const legacyMatch = line.match(/^(\w{2,3})\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+?)\s*\|\s*(\w+)$/i);
  if (legacyMatch) {
    const dayName = legacyMatch[1].toLowerCase();
    const dayOfWeek = DAY_NAMES[dayName];
    if (dayOfWeek === undefined) return null;

    return {
      dayOfWeek,
      startHour: parseInt(legacyMatch[2], 10),
      startMinute: parseInt(legacyMatch[3], 10),
      endHour: parseInt(legacyMatch[4], 10),
      endMinute: parseInt(legacyMatch[5], 10),
      label: legacyMatch[6].trim(),
      color: legacyMatch[7].toLowerCase()
    };
  }

  return null;
}

/**
 * Parse a month line: "15 red: Zahnarzt" or "15-17 blue: Konferenz"
 */
function parseMonthLine(line: string): MonthTimeBlock | null {
  // New syntax with range: "15-17 blue: Konferenz"
  const rangeMatch = line.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+(\w+):\s*(.+)$/);
  if (rangeMatch) {
    return {
      dayOfMonth: parseInt(rangeMatch[1], 10),
      endDay: parseInt(rangeMatch[2], 10),
      color: rangeMatch[3].toLowerCase(),
      label: rangeMatch[4].trim()
    };
  }

  // New syntax single day: "15 red: Zahnarzt"
  const newMatch = line.match(/^(\d{1,2})\s+(\w+):\s*(.+)$/);
  if (newMatch) {
    return {
      dayOfMonth: parseInt(newMatch[1], 10),
      color: newMatch[2].toLowerCase(),
      label: newMatch[3].trim()
    };
  }

  // Legacy range: "15-17 Konferenz | blue"
  const legacyRangeMatch = line.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+(.+?)\s*\|\s*(\w+)$/);
  if (legacyRangeMatch) {
    return {
      dayOfMonth: parseInt(legacyRangeMatch[1], 10),
      endDay: parseInt(legacyRangeMatch[2], 10),
      label: legacyRangeMatch[3].trim(),
      color: legacyRangeMatch[4].toLowerCase()
    };
  }

  // Legacy single: "15 Zahnarzt | red"
  const legacyMatch = line.match(/^(\d{1,2})\s+(.+?)\s*\|\s*(\w+)$/);
  if (legacyMatch) {
    return {
      dayOfMonth: parseInt(legacyMatch[1], 10),
      label: legacyMatch[2].trim(),
      color: legacyMatch[3].toLowerCase()
    };
  }

  // Simple without color: "15 Zahnarzt" or "15-17 Konferenz"
  const simpleRangeMatch = line.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+(.+)$/);
  if (simpleRangeMatch) {
    return {
      dayOfMonth: parseInt(simpleRangeMatch[1], 10),
      endDay: parseInt(simpleRangeMatch[2], 10),
      color: 'blue',
      label: simpleRangeMatch[3].trim()
    };
  }

  const simpleMatch = line.match(/^(\d{1,2})\s+(.+)$/);
  if (simpleMatch) {
    return {
      dayOfMonth: parseInt(simpleMatch[1], 10),
      color: 'blue',
      label: simpleMatch[2].trim()
    };
  }

  return null;
}

/**
 * Convert time to angle (0 = top, clockwise)
 */
function timeToAngle(hour: number, minute: number, startHour: number): number {
  let totalMinutes = (hour - startHour) * 60 + minute;
  totalMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return (totalMinutes / (24 * 60)) * 2 * Math.PI - Math.PI / 2;
}

/**
 * Create an arc path for SVG
 */
function createArcPath(
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const x1 = CENTER + innerR * Math.cos(startAngle);
  const y1 = CENTER + innerR * Math.sin(startAngle);
  const x2 = CENTER + outerR * Math.cos(startAngle);
  const y2 = CENTER + outerR * Math.sin(startAngle);
  const x3 = CENTER + outerR * Math.cos(endAngle);
  const y3 = CENTER + outerR * Math.sin(endAngle);
  const x4 = CENTER + innerR * Math.cos(endAngle);
  const y4 = CENTER + innerR * Math.sin(endAngle);

  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3}`,
    `L ${x4} ${y4}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}`,
    'Z',
  ].join(' ');
}

/**
 * Render child for day view
 */
export class DayViewRenderChild extends MarkdownRenderChild {
  private updateInterval: number | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly config: TimeBlockConfig,
    private readonly blocks: DayTimeBlock[]
  ) {
    super(containerEl);
  }

  onload(): void {
    this.render();
    if (this.config.showCurrentTime) {
      this.updateInterval = window.setInterval(() => this.render(), 60 * 1000);
    }
  }

  onunload(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
    }
  }

  private render(): void {
    this.containerEl.empty();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'radcal-day-svg');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '400px';

    // Background
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', String(CENTER));
    bg.setAttribute('cy', String(CENTER));
    bg.setAttribute('r', String(OUTER_RADIUS));
    bg.setAttribute('class', 'radcal-day-bg');
    svg.appendChild(bg);

    // Inner circle
    const inner = document.createElementNS(SVG_NS, 'circle');
    inner.setAttribute('cx', String(CENTER));
    inner.setAttribute('cy', String(CENTER));
    inner.setAttribute('r', String(INNER_RADIUS));
    inner.setAttribute('class', 'radcal-day-center');
    svg.appendChild(inner);

    // Hour markers
    this.renderHourMarkers(svg);

    // Time blocks
    for (const block of this.blocks) {
      this.renderTimeBlock(svg, block);
    }

    // Current time
    if (this.config.showCurrentTime) {
      this.renderCurrentTime(svg);
    }

    // Center text
    this.renderCenterText(svg);

    const wrapper = this.containerEl.createDiv({ cls: 'radcal-day-wrapper' });
    wrapper.appendChild(svg);
    this.setupTooltips(svg);
  }

  private renderHourMarkers(svg: SVGSVGElement): void {
    for (let h = 0; h < 24; h++) {
      const angle = timeToAngle(h, 0, this.config.startHour);

      const tickInner = OUTER_RADIUS - 10;
      const x1 = CENTER + tickInner * Math.cos(angle);
      const y1 = CENTER + tickInner * Math.sin(angle);
      const x2 = CENTER + OUTER_RADIUS * Math.cos(angle);
      const y2 = CENTER + OUTER_RADIUS * Math.sin(angle);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      tick.setAttribute('class', 'radcal-day-tick');
      svg.appendChild(tick);

      if (h % 3 === 0) {
        const labelX = CENTER + HOUR_LABEL_RADIUS * Math.cos(angle);
        const labelY = CENTER + HOUR_LABEL_RADIUS * Math.sin(angle);

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(labelX));
        label.setAttribute('y', String(labelY));
        label.setAttribute('class', 'radcal-day-hour-label');
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.textContent = String(h);
        svg.appendChild(label);
      }
    }
  }

  private renderTimeBlock(svg: SVGSVGElement, block: DayTimeBlock): void {
    const startAngle = timeToAngle(block.startHour, block.startMinute, this.config.startHour);
    const endAngle = timeToAngle(block.endHour, block.endMinute, this.config.startHour);

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', createArcPath(INNER_RADIUS + 5, OUTER_RADIUS - 15, startAngle, endAngle));
    path.setAttribute('class', 'radcal-day-block');
    path.setAttribute('fill', RING_COLORS[block.color] || RING_COLORS.blue);
    path.setAttribute('data-label', block.label);
    path.setAttribute('data-time', `${block.startHour}:${String(block.startMinute).padStart(2, '0')} - ${block.endHour}:${String(block.endMinute).padStart(2, '0')}`);
    svg.appendChild(path);
  }

  private renderCurrentTime(svg: SVGSVGElement): void {
    const now = new Date();
    const angle = timeToAngle(now.getHours(), now.getMinutes(), this.config.startHour);

    const x2 = CENTER + (OUTER_RADIUS - 5) * Math.cos(angle);
    const y2 = CENTER + (OUTER_RADIUS - 5) * Math.sin(angle);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(CENTER));
    line.setAttribute('y1', String(CENTER));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'radcal-day-now');
    svg.appendChild(line);

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(x2));
    dot.setAttribute('cy', String(y2));
    dot.setAttribute('r', '6');
    dot.setAttribute('class', 'radcal-day-now-dot');
    svg.appendChild(dot);
  }

  private renderCenterText(svg: SVGSVGElement): void {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(CENTER));
    text.setAttribute('y', String(CENTER));
    text.setAttribute('class', 'radcal-day-center-time');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = timeStr;
    svg.appendChild(text);
  }

  private setupTooltips(svg: SVGSVGElement): void {
    const blocks = svg.querySelectorAll('.radcal-day-block');
    blocks.forEach((block) => {
      block.addEventListener('mouseenter', (e) => {
        const target = e.target as SVGElement;
        const label = target.getAttribute('data-label') || '';
        const time = target.getAttribute('data-time') || '';

        const tooltip = document.createElement('div');
        tooltip.className = 'radcal-day-tooltip';
        tooltip.innerHTML = `<strong>${time}</strong><br>${label}`;
        this.containerEl.appendChild(tooltip);

        const event = e as MouseEvent;
        const rect = this.containerEl.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left + 10}px`;
        tooltip.style.top = `${event.clientY - rect.top + 10}px`;
      });

      block.addEventListener('mouseleave', () => {
        const tooltip = this.containerEl.querySelector('.radcal-day-tooltip');
        if (tooltip) tooltip.remove();
      });
    });
  }
}

/**
 * Render child for week view
 */
export class WeekViewRenderChild extends MarkdownRenderChild {
  private updateInterval: number | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly config: TimeBlockConfig,
    private readonly blocks: WeekTimeBlock[]
  ) {
    super(containerEl);
  }

  onload(): void {
    this.render();
    if (this.config.showCurrentTime) {
      this.updateInterval = window.setInterval(() => this.render(), 60 * 1000);
    }
  }

  onunload(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
    }
  }

  private render(): void {
    this.containerEl.empty();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'radcal-week-svg');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '400px';

    // Background
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', String(CENTER));
    bg.setAttribute('cy', String(CENTER));
    bg.setAttribute('r', String(OUTER_RADIUS));
    bg.setAttribute('class', 'radcal-week-bg');
    svg.appendChild(bg);

    // Inner circle
    const inner = document.createElementNS(SVG_NS, 'circle');
    inner.setAttribute('cx', String(CENTER));
    inner.setAttribute('cy', String(CENTER));
    inner.setAttribute('r', String(INNER_RADIUS));
    inner.setAttribute('class', 'radcal-week-center');
    svg.appendChild(inner);

    // Day segments and labels
    this.renderDaySegments(svg);

    // Time blocks
    for (const block of this.blocks) {
      this.renderTimeBlock(svg, block);
    }

    // Current time indicator
    if (this.config.showCurrentTime) {
      this.renderCurrentTime(svg);
    }

    // Center text
    this.renderCenterText(svg);

    const wrapper = this.containerEl.createDiv({ cls: 'radcal-week-wrapper' });
    wrapper.appendChild(svg);
    this.setupTooltips(svg);
  }

  private renderDaySegments(svg: SVGSVGElement): void {
    const segmentAngle = (2 * Math.PI) / 7;

    for (let d = 0; d < 7; d++) {
      // Start from Monday (1) at top
      const dayIndex = (d + 1) % 7;  // 1,2,3,4,5,6,0 = Mo,Di,Mi,Do,Fr,Sa,So
      const startAngle = d * segmentAngle - Math.PI / 2;
      const endAngle = (d + 1) * segmentAngle - Math.PI / 2;

      // Divider line
      const x2 = CENTER + OUTER_RADIUS * Math.cos(startAngle);
      const y2 = CENTER + OUTER_RADIUS * Math.sin(startAngle);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(CENTER));
      line.setAttribute('y1', String(CENTER));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'radcal-week-divider');
      svg.appendChild(line);

      // Day label
      const labelAngle = (startAngle + endAngle) / 2;
      const labelR = INNER_RADIUS - 20;
      const labelX = CENTER + labelR * Math.cos(labelAngle);
      const labelY = CENTER + labelR * Math.sin(labelAngle);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(labelX));
      label.setAttribute('y', String(labelY));
      label.setAttribute('class', 'radcal-week-day-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.textContent = DAY_LABELS[dayIndex];
      svg.appendChild(label);
    }
  }

  private renderTimeBlock(svg: SVGSVGElement, block: WeekTimeBlock): void {
    const segmentAngle = (2 * Math.PI) / 7;

    // Map dayOfWeek to visual position (Monday=0 at top)
    const visualDay = (block.dayOfWeek + 6) % 7;  // Mon=0, Tue=1, ..., Sun=6

    const dayStartAngle = visualDay * segmentAngle - Math.PI / 2;

    // Time within day (fraction of 24h) -> map to angle within segment
    const startFraction = (block.startHour + block.startMinute / 60) / 24;
    const endFraction = (block.endHour + block.endMinute / 60) / 24;

    // Map time to angle within the day segment
    const blockStartAngle = dayStartAngle + startFraction * segmentAngle;
    const blockEndAngle = dayStartAngle + endFraction * segmentAngle;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', createArcPath(INNER_RADIUS + 5, OUTER_RADIUS - 15, blockStartAngle, blockEndAngle));
    path.setAttribute('class', 'radcal-week-block');
    path.setAttribute('fill', RING_COLORS[block.color] || RING_COLORS.blue);
    path.setAttribute('data-label', block.label);
    path.setAttribute('data-day', DAY_LABELS[block.dayOfWeek]);
    path.setAttribute('data-time', `${block.startHour}:${String(block.startMinute).padStart(2, '0')} - ${block.endHour}:${String(block.endMinute).padStart(2, '0')}`);
    svg.appendChild(path);
  }

  private renderCurrentTime(svg: SVGSVGElement): void {
    const now = new Date();
    const currentDay = now.getDay();  // 0=Sunday
    const visualDay = (currentDay + 6) % 7;

    const segmentAngle = (2 * Math.PI) / 7;
    const dayStartAngle = visualDay * segmentAngle - Math.PI / 2;
    const dayMidAngle = dayStartAngle + segmentAngle / 2;

    // Current time as fraction
    const timeFraction = (now.getHours() + now.getMinutes() / 60) / 24;
    const r = INNER_RADIUS + (OUTER_RADIUS - INNER_RADIUS) * timeFraction * 0.9;

    const x = CENTER + r * Math.cos(dayMidAngle);
    const y = CENTER + r * Math.sin(dayMidAngle);

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', '8');
    dot.setAttribute('class', 'radcal-week-now');
    svg.appendChild(dot);
  }

  private renderCenterText(svg: SVGSVGElement): void {
    const now = new Date();
    const weekNum = this.getWeekNumber(now);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(CENTER));
    text.setAttribute('y', String(CENTER));
    text.setAttribute('class', 'radcal-week-center-text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = `KW ${weekNum}`;
    svg.appendChild(text);
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private setupTooltips(svg: SVGSVGElement): void {
    const blocks = svg.querySelectorAll('.radcal-week-block');
    blocks.forEach((block) => {
      block.addEventListener('mouseenter', (e) => {
        const target = e.target as SVGElement;
        const label = target.getAttribute('data-label') || '';
        const day = target.getAttribute('data-day') || '';
        const time = target.getAttribute('data-time') || '';

        const tooltip = document.createElement('div');
        tooltip.className = 'radcal-week-tooltip';
        tooltip.innerHTML = `<strong>${day} ${time}</strong><br>${label}`;
        this.containerEl.appendChild(tooltip);

        const event = e as MouseEvent;
        const rect = this.containerEl.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left + 10}px`;
        tooltip.style.top = `${event.clientY - rect.top + 10}px`;
      });

      block.addEventListener('mouseleave', () => {
        const tooltip = this.containerEl.querySelector('.radcal-week-tooltip');
        if (tooltip) tooltip.remove();
      });
    });
  }
}

/**
 * Render child for month view
 */
export class MonthViewRenderChild extends MarkdownRenderChild {
  private updateInterval: number | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly config: TimeBlockConfig,
    private readonly blocks: MonthTimeBlock[]
  ) {
    super(containerEl);
  }

  onload(): void {
    this.render();
    // Update daily
    this.updateInterval = window.setInterval(() => this.render(), 60 * 60 * 1000);
  }

  onunload(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
    }
  }

  private render(): void {
    this.containerEl.empty();

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'radcal-month-svg');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '400px';

    // Background
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', String(CENTER));
    bg.setAttribute('cy', String(CENTER));
    bg.setAttribute('r', String(OUTER_RADIUS));
    bg.setAttribute('class', 'radcal-month-bg');
    svg.appendChild(bg);

    // Inner circle
    const inner = document.createElementNS(SVG_NS, 'circle');
    inner.setAttribute('cx', String(CENTER));
    inner.setAttribute('cy', String(CENTER));
    inner.setAttribute('r', String(INNER_RADIUS));
    inner.setAttribute('class', 'radcal-month-center');
    svg.appendChild(inner);

    // Day markers
    this.renderDayMarkers(svg, daysInMonth);

    // Time blocks
    for (const block of this.blocks) {
      this.renderTimeBlock(svg, block, daysInMonth);
    }

    // Current day indicator
    if (this.config.showCurrentTime) {
      this.renderCurrentDay(svg, now.getDate(), daysInMonth);
    }

    // Center text
    this.renderCenterText(svg, now);

    const wrapper = this.containerEl.createDiv({ cls: 'radcal-month-wrapper' });
    wrapper.appendChild(svg);
    this.setupTooltips(svg);
  }

  private renderDayMarkers(svg: SVGSVGElement, daysInMonth: number): void {
    const segmentAngle = (2 * Math.PI) / daysInMonth;

    for (let d = 1; d <= daysInMonth; d++) {
      const angle = (d - 1) * segmentAngle - Math.PI / 2;

      // Tick mark
      const x1 = CENTER + (OUTER_RADIUS - 8) * Math.cos(angle);
      const y1 = CENTER + (OUTER_RADIUS - 8) * Math.sin(angle);
      const x2 = CENTER + OUTER_RADIUS * Math.cos(angle);
      const y2 = CENTER + OUTER_RADIUS * Math.sin(angle);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      tick.setAttribute('class', 'radcal-month-tick');
      svg.appendChild(tick);

      // Label every 5 days
      if (d % 5 === 0 || d === 1) {
        const labelR = OUTER_RADIUS + 15;
        const labelX = CENTER + labelR * Math.cos(angle);
        const labelY = CENTER + labelR * Math.sin(angle);

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(labelX));
        label.setAttribute('y', String(labelY));
        label.setAttribute('class', 'radcal-month-day-label');
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.textContent = String(d);
        svg.appendChild(label);
      }
    }
  }

  private renderTimeBlock(svg: SVGSVGElement, block: MonthTimeBlock, daysInMonth: number): void {
    const segmentAngle = (2 * Math.PI) / daysInMonth;

    const startDay = block.dayOfMonth;
    const endDay = block.endDay || block.dayOfMonth;

    const startAngle = (startDay - 1) * segmentAngle - Math.PI / 2;
    const endAngle = endDay * segmentAngle - Math.PI / 2;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', createArcPath(INNER_RADIUS + 10, OUTER_RADIUS - 15, startAngle, endAngle));
    path.setAttribute('class', 'radcal-month-block');
    path.setAttribute('fill', RING_COLORS[block.color] || RING_COLORS.blue);
    path.setAttribute('data-label', block.label);
    path.setAttribute('data-days', block.endDay ? `${startDay}-${endDay}` : String(startDay));
    svg.appendChild(path);
  }

  private renderCurrentDay(svg: SVGSVGElement, currentDay: number, daysInMonth: number): void {
    const segmentAngle = (2 * Math.PI) / daysInMonth;
    const angle = (currentDay - 0.5) * segmentAngle - Math.PI / 2;

    const x = CENTER + (OUTER_RADIUS - 5) * Math.cos(angle);
    const y = CENTER + (OUTER_RADIUS - 5) * Math.sin(angle);

    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', String(y));
    dot.setAttribute('r', '6');
    dot.setAttribute('class', 'radcal-month-now');
    svg.appendChild(dot);
  }

  private renderCenterText(svg: SVGSVGElement, now: Date): void {
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(CENTER));
    text.setAttribute('y', String(CENTER));
    text.setAttribute('class', 'radcal-month-center-text');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    svg.appendChild(text);
  }

  private setupTooltips(svg: SVGSVGElement): void {
    const blocks = svg.querySelectorAll('.radcal-month-block');
    blocks.forEach((block) => {
      block.addEventListener('mouseenter', (e) => {
        const target = e.target as SVGElement;
        const label = target.getAttribute('data-label') || '';
        const days = target.getAttribute('data-days') || '';

        const tooltip = document.createElement('div');
        tooltip.className = 'radcal-month-tooltip';
        tooltip.innerHTML = `<strong>Tag ${days}</strong><br>${label}`;
        this.containerEl.appendChild(tooltip);

        const event = e as MouseEvent;
        const rect = this.containerEl.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left + 10}px`;
        tooltip.style.top = `${event.clientY - rect.top + 10}px`;
      });

      block.addEventListener('mouseleave', () => {
        const tooltip = this.containerEl.querySelector('.radcal-month-tooltip');
        if (tooltip) tooltip.remove();
      });
    });
  }
}

/**
 * Multi-Ring Render Child - renders multiple ring types in concentric circles
 */
export class MultiRingRenderChild extends MarkdownRenderChild {
  private updateInterval: number | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly config: TimeBlockConfig,
    private readonly dayBlocks: DayTimeBlock[],
    private readonly weekBlocks: WeekTimeBlock[],
    private readonly monthBlocks: MonthTimeBlock[]
  ) {
    super(containerEl);
  }

  onload(): void {
    this.render();
    if (this.config.showCurrentTime) {
      this.updateInterval = window.setInterval(() => this.render(), 60 * 1000);
    }
  }

  onunload(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
    }
  }

  private render(): void {
    this.containerEl.empty();

    // Determine which rings have data
    const hasDay = this.dayBlocks.length > 0;
    const hasWeek = this.weekBlocks.length > 0;
    const hasMonth = this.monthBlocks.length > 0;

    const ringCount = (hasDay ? 1 : 0) + (hasWeek ? 1 : 0) + (hasMonth ? 1 : 0);

    if (ringCount === 0) {
      this.containerEl.createEl('p', { text: 'Keine Zeitblöcke gefunden.' });
      return;
    }

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'radcal-multi-svg');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '500px';

    // Background
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', String(CENTER));
    bg.setAttribute('cy', String(CENTER));
    bg.setAttribute('r', String(OUTER_RADIUS + 10));
    bg.setAttribute('class', 'radcal-multi-bg');
    svg.appendChild(bg);

    // Calculate ring dimensions (outer to inner: month -> week -> day)
    const ringWidth = (OUTER_RADIUS - 50) / ringCount;
    let currentOuterR = OUTER_RADIUS;

    // Month ring (outermost)
    if (hasMonth) {
      const innerR = currentOuterR - ringWidth + 5;
      this.renderMonthRing(svg, currentOuterR, innerR);
      currentOuterR = innerR - 5;
    }

    // Week ring (middle)
    if (hasWeek) {
      const innerR = currentOuterR - ringWidth + 5;
      this.renderWeekRing(svg, currentOuterR, innerR);
      currentOuterR = innerR - 5;
    }

    // Day ring (innermost)
    if (hasDay) {
      const innerR = currentOuterR - ringWidth + 5;
      this.renderDayRing(svg, currentOuterR, innerR);
      currentOuterR = innerR - 5;
    }

    // Center circle
    const centerR = Math.max(currentOuterR, 40);
    const center = document.createElementNS(SVG_NS, 'circle');
    center.setAttribute('cx', String(CENTER));
    center.setAttribute('cy', String(CENTER));
    center.setAttribute('r', String(centerR));
    center.setAttribute('class', 'radcal-multi-center');
    svg.appendChild(center);

    // Center time
    this.renderCenterTime(svg);

    const wrapper = this.containerEl.createDiv({ cls: 'radcal-multi-wrapper' });
    wrapper.appendChild(svg);
    this.setupTooltips(svg);
  }

  private renderDayRing(svg: SVGSVGElement, outerR: number, innerR: number): void {
    const now = new Date();

    // Background ring
    const bgRing = document.createElementNS(SVG_NS, 'circle');
    bgRing.setAttribute('cx', String(CENTER));
    bgRing.setAttribute('cy', String(CENTER));
    bgRing.setAttribute('r', String((outerR + innerR) / 2));
    bgRing.setAttribute('fill', 'none');
    bgRing.setAttribute('stroke', 'var(--background-modifier-border)');
    bgRing.setAttribute('stroke-width', String(outerR - innerR));
    bgRing.setAttribute('class', 'radcal-multi-ring-bg');
    svg.appendChild(bgRing);

    // Hour markers
    for (let h = 0; h < 24; h += 3) {
      const angle = (h / 24) * 2 * Math.PI - Math.PI / 2;
      const x1 = CENTER + innerR * Math.cos(angle);
      const y1 = CENTER + innerR * Math.sin(angle);
      const x2 = CENTER + outerR * Math.cos(angle);
      const y2 = CENTER + outerR * Math.sin(angle);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      tick.setAttribute('class', 'radcal-multi-tick');
      svg.appendChild(tick);
    }

    // Time blocks
    for (const block of this.dayBlocks) {
      const startAngle = ((block.startHour + block.startMinute / 60) / 24) * 2 * Math.PI - Math.PI / 2;
      const endAngle = ((block.endHour + block.endMinute / 60) / 24) * 2 * Math.PI - Math.PI / 2;

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', createArcPath(innerR + 2, outerR - 2, startAngle, endAngle));
      path.setAttribute('class', 'radcal-multi-block');
      path.setAttribute('fill', RING_COLORS[block.color] || RING_COLORS.blue);
      path.setAttribute('data-type', 'day');
      path.setAttribute('data-label', block.label);
      path.setAttribute('data-time', `${block.startHour}:${String(block.startMinute).padStart(2, '0')} - ${block.endHour}:${String(block.endMinute).padStart(2, '0')}`);
      svg.appendChild(path);
    }

    // Current time indicator (line from inner to outer)
    if (this.config.showCurrentTime) {
      const angle = ((now.getHours() + now.getMinutes() / 60) / 24) * 2 * Math.PI - Math.PI / 2;
      const x1 = CENTER + innerR * Math.cos(angle);
      const y1 = CENTER + innerR * Math.sin(angle);
      const x2 = CENTER + outerR * Math.cos(angle);
      const y2 = CENTER + outerR * Math.sin(angle);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'radcal-multi-now-line');
      svg.appendChild(line);
    }
  }

  private renderWeekRing(svg: SVGSVGElement, outerR: number, innerR: number): void {
    const now = new Date();
    const segmentAngle = (2 * Math.PI) / 7;

    // Background ring
    const bgRing = document.createElementNS(SVG_NS, 'circle');
    bgRing.setAttribute('cx', String(CENTER));
    bgRing.setAttribute('cy', String(CENTER));
    bgRing.setAttribute('r', String((outerR + innerR) / 2));
    bgRing.setAttribute('fill', 'none');
    bgRing.setAttribute('stroke', 'var(--background-modifier-border)');
    bgRing.setAttribute('stroke-width', String(outerR - innerR));
    bgRing.setAttribute('class', 'radcal-multi-ring-bg');
    svg.appendChild(bgRing);

    // Day dividers and labels
    for (let d = 0; d < 7; d++) {
      const angle = d * segmentAngle - Math.PI / 2;
      const x1 = CENTER + innerR * Math.cos(angle);
      const y1 = CENTER + innerR * Math.sin(angle);
      const x2 = CENTER + outerR * Math.cos(angle);
      const y2 = CENTER + outerR * Math.sin(angle);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'radcal-multi-tick');
      svg.appendChild(line);
    }

    // Time blocks - map time to angle within day segment
    for (const block of this.weekBlocks) {
      const visualDay = (block.dayOfWeek + 6) % 7;
      const dayStartAngle = visualDay * segmentAngle - Math.PI / 2;

      // Calculate time fraction within the day (0-24h -> 0-1)
      const startFraction = (block.startHour + block.startMinute / 60) / 24;
      const endFraction = (block.endHour + block.endMinute / 60) / 24;

      // Map time to angle within the day segment
      const blockStartAngle = dayStartAngle + startFraction * segmentAngle;
      const blockEndAngle = dayStartAngle + endFraction * segmentAngle;

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', createArcPath(innerR + 2, outerR - 2, blockStartAngle, blockEndAngle));
      path.setAttribute('class', 'radcal-multi-block');
      path.setAttribute('fill', RING_COLORS[block.color] || RING_COLORS.blue);
      path.setAttribute('data-type', 'week');
      path.setAttribute('data-label', block.label);
      path.setAttribute('data-day', DAY_LABELS[block.dayOfWeek]);
      path.setAttribute('data-time', `${block.startHour}:${String(block.startMinute).padStart(2, '0')} - ${block.endHour}:${String(block.endMinute).padStart(2, '0')}`);
      svg.appendChild(path);
    }

    // Current day indicator (line through current day segment)
    if (this.config.showCurrentTime) {
      const visualDay = (now.getDay() + 6) % 7;
      const angle = (visualDay + 0.5) * segmentAngle - Math.PI / 2;
      const x1 = CENTER + innerR * Math.cos(angle);
      const y1 = CENTER + innerR * Math.sin(angle);
      const x2 = CENTER + outerR * Math.cos(angle);
      const y2 = CENTER + outerR * Math.sin(angle);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'radcal-multi-now-line');
      svg.appendChild(line);
    }
  }

  private renderMonthRing(svg: SVGSVGElement, outerR: number, innerR: number): void {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const segmentAngle = (2 * Math.PI) / daysInMonth;

    // Background ring
    const bgRing = document.createElementNS(SVG_NS, 'circle');
    bgRing.setAttribute('cx', String(CENTER));
    bgRing.setAttribute('cy', String(CENTER));
    bgRing.setAttribute('r', String((outerR + innerR) / 2));
    bgRing.setAttribute('fill', 'none');
    bgRing.setAttribute('stroke', 'var(--background-modifier-border)');
    bgRing.setAttribute('stroke-width', String(outerR - innerR));
    bgRing.setAttribute('class', 'radcal-multi-ring-bg');
    svg.appendChild(bgRing);

    // Day markers (every 5 days)
    for (let d = 1; d <= daysInMonth; d += 5) {
      const angle = (d - 1) * segmentAngle - Math.PI / 2;
      const x1 = CENTER + innerR * Math.cos(angle);
      const y1 = CENTER + innerR * Math.sin(angle);
      const x2 = CENTER + outerR * Math.cos(angle);
      const y2 = CENTER + outerR * Math.sin(angle);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      tick.setAttribute('class', 'radcal-multi-tick');
      svg.appendChild(tick);
    }

    // Time blocks
    for (const block of this.monthBlocks) {
      const startAngle = (block.dayOfMonth - 1) * segmentAngle - Math.PI / 2;
      const endDay = block.endDay || block.dayOfMonth;
      const endAngle = endDay * segmentAngle - Math.PI / 2;

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', createArcPath(innerR + 2, outerR - 2, startAngle, endAngle));
      path.setAttribute('class', 'radcal-multi-block');
      path.setAttribute('fill', RING_COLORS[block.color] || RING_COLORS.blue);
      path.setAttribute('data-type', 'month');
      path.setAttribute('data-label', block.label);
      path.setAttribute('data-days', block.endDay ? `${block.dayOfMonth}-${endDay}` : String(block.dayOfMonth));
      svg.appendChild(path);
    }

    // Current day indicator (line through current day)
    if (this.config.showCurrentTime) {
      const angle = (now.getDate() - 0.5) * segmentAngle - Math.PI / 2;
      const x1 = CENTER + innerR * Math.cos(angle);
      const y1 = CENTER + innerR * Math.sin(angle);
      const x2 = CENTER + outerR * Math.cos(angle);
      const y2 = CENTER + outerR * Math.sin(angle);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', 'radcal-multi-now-line');
      svg.appendChild(line);
    }
  }

  private renderCenterTime(svg: SVGSVGElement): void {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(CENTER));
    text.setAttribute('y', String(CENTER));
    text.setAttribute('class', 'radcal-multi-center-time');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = timeStr;
    svg.appendChild(text);
  }

  private setupTooltips(svg: SVGSVGElement): void {
    const blocks = svg.querySelectorAll('.radcal-multi-block');
    blocks.forEach((block) => {
      block.addEventListener('mouseenter', (e) => {
        const target = e.target as SVGElement;
        const type = target.getAttribute('data-type') || '';
        const label = target.getAttribute('data-label') || '';

        let info = '';
        if (type === 'day') {
          info = target.getAttribute('data-time') || '';
        } else if (type === 'week') {
          const day = target.getAttribute('data-day') || '';
          const time = target.getAttribute('data-time') || '';
          info = `${day} ${time}`;
        } else if (type === 'month') {
          const days = target.getAttribute('data-days') || '';
          info = `Tag ${days}`;
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'radcal-multi-tooltip';
        tooltip.innerHTML = `<strong>${info}</strong><br>${label}`;
        this.containerEl.appendChild(tooltip);

        const event = e as MouseEvent;
        const rect = this.containerEl.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left + 10}px`;
        tooltip.style.top = `${event.clientY - rect.top + 10}px`;
      });

      block.addEventListener('mouseleave', () => {
        const tooltip = this.containerEl.querySelector('.radcal-multi-tooltip');
        if (tooltip) tooltip.remove();
      });
    });
  }
}
