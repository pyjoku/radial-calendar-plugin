/**
 * DayBlockProcessor - Processes radcal-day codeblocks
 *
 * Renders a 24-hour clock visualization with time blocks
 *
 * Syntax:
 * ```radcal-day
 * ---
 * showCurrentTime: true
 * startHour: 6
 * ---
 * 9:00-10:00 Zahnarztbesuch | blue
 * 10:30-11:30 Team Meeting | green
 * 14:00-16:00 Projektarbeit | orange
 * ```
 */

import { MarkdownRenderChild, MarkdownPostProcessorContext, App } from 'obsidian';
import { RING_COLORS } from '../../core/domain/types';

// SVG Constants
const SVG_SIZE = 400;
const CENTER = SVG_SIZE / 2;
const OUTER_RADIUS = 180;
const INNER_RADIUS = 100;
const HOUR_LABEL_RADIUS = 75;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Configuration for the day view
 */
interface DayBlockConfig {
  showCurrentTime: boolean;
  startHour: number;  // 0-23, which hour is at the top
}

/**
 * A time block entry
 */
interface TimeBlock {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  label: string;
  color: string;
}

/**
 * Parse the radcal-day codeblock source
 */
function parseDayBlock(source: string): { config: DayBlockConfig; blocks: TimeBlock[] } {
  const lines = source.trim().split('\n');
  let config: DayBlockConfig = { showCurrentTime: true, startHour: 0 };
  const blocks: TimeBlock[] = [];

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

    // Skip empty lines
    if (!trimmed) continue;

    // Parse time block: "9:00-10:00 Label | color"
    const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+?)(?:\s*\|\s*(\w+))?$/);
    if (match) {
      blocks.push({
        startHour: parseInt(match[1], 10),
        startMinute: parseInt(match[2], 10),
        endHour: parseInt(match[3], 10),
        endMinute: parseInt(match[4], 10),
        label: match[5].trim(),
        color: match[6] || 'blue'
      });
    }
  }

  return { config, blocks };
}

/**
 * Parse YAML configuration lines
 */
function parseYamlConfig(lines: string[]): DayBlockConfig {
  const config: DayBlockConfig = { showCurrentTime: true, startHour: 0 };

  for (const line of lines) {
    const [key, value] = line.split(':').map(s => s.trim());
    if (key === 'showCurrentTime') {
      config.showCurrentTime = value !== 'false';
    } else if (key === 'startHour') {
      config.startHour = parseInt(value, 10) || 0;
    }
  }

  return config;
}

/**
 * Convert time to angle (0 = top, clockwise)
 */
function timeToAngle(hour: number, minute: number, startHour: number): number {
  // Total minutes from startHour
  let totalMinutes = (hour - startHour) * 60 + minute;
  // Normalize to 0-1440 range
  totalMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  // Convert to radians (0 at top, clockwise)
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
  // Convert logical angles to SVG coordinates
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
 * Render child for day view with live updates
 */
class DayRenderChild extends MarkdownRenderChild {
  private updateInterval: number | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly config: DayBlockConfig,
    private readonly blocks: TimeBlock[]
  ) {
    super(containerEl);
  }

  onload(): void {
    this.render();

    // Update every minute if showing current time
    if (this.config.showCurrentTime) {
      this.updateInterval = window.setInterval(() => {
        this.render();
      }, 60 * 1000);
    }
  }

  onunload(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
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

    // Background circle
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', String(CENTER));
    bg.setAttribute('cy', String(CENTER));
    bg.setAttribute('r', String(OUTER_RADIUS));
    bg.setAttribute('class', 'radcal-day-bg');
    svg.appendChild(bg);

    // Inner circle (center)
    const inner = document.createElementNS(SVG_NS, 'circle');
    inner.setAttribute('cx', String(CENTER));
    inner.setAttribute('cy', String(CENTER));
    inner.setAttribute('r', String(INNER_RADIUS));
    inner.setAttribute('class', 'radcal-day-center');
    svg.appendChild(inner);

    // Hour markers and labels
    this.renderHourMarkers(svg);

    // Time blocks
    for (const block of this.blocks) {
      this.renderTimeBlock(svg, block);
    }

    // Current time indicator
    if (this.config.showCurrentTime) {
      this.renderCurrentTime(svg);
    }

    // Center text (current time)
    this.renderCenterText(svg);

    // Add tooltip element
    const wrapper = this.containerEl.createDiv({ cls: 'radcal-day-wrapper' });
    wrapper.appendChild(svg);

    // Setup tooltips
    this.setupTooltips(svg);
  }

  private renderHourMarkers(svg: SVGSVGElement): void {
    for (let h = 0; h < 24; h++) {
      const angle = timeToAngle(h, 0, this.config.startHour);

      // Tick mark
      const tickInner = OUTER_RADIUS - 10;
      const tickOuter = OUTER_RADIUS;
      const x1 = CENTER + tickInner * Math.cos(angle);
      const y1 = CENTER + tickInner * Math.sin(angle);
      const x2 = CENTER + tickOuter * Math.cos(angle);
      const y2 = CENTER + tickOuter * Math.sin(angle);

      const tick = document.createElementNS(SVG_NS, 'line');
      tick.setAttribute('x1', String(x1));
      tick.setAttribute('y1', String(y1));
      tick.setAttribute('x2', String(x2));
      tick.setAttribute('y2', String(y2));
      tick.setAttribute('class', 'radcal-day-tick');
      svg.appendChild(tick);

      // Hour label (only every 3 hours: 0, 3, 6, 9, 12, 15, 18, 21)
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

  private renderTimeBlock(svg: SVGSVGElement, block: TimeBlock): void {
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

    // Red line from center to outer edge
    const x1 = CENTER;
    const y1 = CENTER;
    const x2 = CENTER + (OUTER_RADIUS - 5) * Math.cos(angle);
    const y2 = CENTER + (OUTER_RADIUS - 5) * Math.sin(angle);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'radcal-day-now');
    svg.appendChild(line);

    // Small circle at the end
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

        // Create tooltip
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
        if (tooltip) {
          tooltip.remove();
        }
      });
    });
  }
}

/**
 * Main processor for radcal-day codeblocks
 */
export class DayBlockProcessor {
  constructor(private readonly app: App) {}

  /**
   * Process a radcal-day codeblock
   */
  process(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    try {
      const { config, blocks } = parseDayBlock(source);

      const container = el.createDiv({ cls: 'radcal-day-container' });

      const renderChild = new DayRenderChild(container, config, blocks);
      ctx.addChild(renderChild);

    } catch (error) {
      el.createDiv({
        cls: 'radcal-error',
        text: `Day View Error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
}
