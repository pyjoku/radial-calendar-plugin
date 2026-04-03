/**
 * MultiRingAllPeriodsView - Life-span multi-ring view for Bases
 *
 * Shows ALL entries as spanning arcs across a full time range.
 * The circle represents earliest-start → latest-end (or birth → now).
 * Each Bases group becomes a concentric ring.
 * Overlapping entries within a group get separate sub-tracks.
 * Entries with radcal-start + radcal-end render as arcs.
 *
 * Requires Obsidian 1.10+
 */

import {
  BasesView,
  BasesEntry,
  BasesEntryGroup,
  type QueryController,
} from 'obsidian';
import { createArcPath } from '../svg/SvgArc';
import { createSvgLine, createSvgCircle, createSvgText } from '../svg/SvgHelpers';

// SVG canvas
const SVG_SIZE = 600;
const CENTER = SVG_SIZE / 2;
const LABEL_RADIUS = (SVG_SIZE / 2) - 12;

// Ring layout
const RING_AREA_OUTER = (SVG_SIZE / 2) - 30;
const RING_AREA_INNER = 80;
const GROUP_GAP = 3;
const TRACK_GAP = 1;

// Group colors
const GROUP_COLORS = [
  '#4a90d9', '#50c878', '#e74c3c', '#9b59b6',
  '#e67e22', '#1abc9c', '#e91e63', '#f1c40f',
];

// Per-entry color overrides (from radcal-color property)
const ENTRY_COLORS: Record<string, string> = {
  blue: '#4a90d9', green: '#50c878', red: '#e74c3c', purple: '#9b59b6',
  orange: '#e67e22', teal: '#1abc9c', pink: '#e91e63', yellow: '#f1c40f',
  cyan: '#00bcd4', indigo: '#3f51b5', gray: '#95a5a6', slate: '#607d8b',
};

interface ParsedEntry {
  entry: BasesEntry;
  start: Date;
  end: Date;
  color?: string;
  label?: string;
}

interface TrackedEntry extends ParsedEntry {
  track: number;
}

export class MultiRingAllPeriodsView extends BasesView {
  readonly type = 'radial-allperiods';

  private containerEl: HTMLElement;
  private svgEl: SVGSVGElement | null = null;

  constructor(controller: QueryController, parentEl: HTMLElement) {
    super(controller);
    this.containerEl = parentEl.createDiv('radial-allperiods-bases-view');
  }

  onDataUpdated(): void {
    try {
      this.containerEl.empty();

      const svgContainer = this.containerEl.createDiv({ cls: 'rc-bases-svg-container' });
      this.svgEl = this.createSVG();
      svgContainer.appendChild(this.svgEl);

      this.renderCalendar();
    } catch (err) {
      console.error('Radial Calendar AllPeriods: render error', err);
      try {
        this.containerEl.empty();
        this.containerEl.createDiv({ text: `Render error: ${err}` });
      } catch { /* */ }
    }
  }

  private createSVG(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'rc-bases-calendar');
    return svg;
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  private renderCalendar(): void {
    if (!this.svgEl) return;
    const svg = this.svgEl;
    svg.innerHTML = '';

    // Parse all entries with start+end dates, assign tracks per group
    const groups = this.data.groupedData;
    const parsedGroups: { group: BasesEntryGroup; entries: TrackedEntry[]; trackCount: number }[] = [];

    for (const group of groups) {
      const parsed: ParsedEntry[] = [];
      for (const entry of group.entries) {
        const p = this.parseEntryDates(entry);
        if (p) parsed.push(p);
      }
      if (parsed.length > 0) {
        const tracked = this.assignTracks(parsed);
        const trackCount = Math.max(...tracked.map(t => t.track)) + 1;
        parsedGroups.push({ group, entries: tracked, trackCount });
      }
    }

    if (parsedGroups.length === 0) {
      this.renderEmpty(svg);
      return;
    }

    // Compute global time range
    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (const pg of parsedGroups) {
      for (const e of pg.entries) {
        globalMin = Math.min(globalMin, e.start.getTime());
        globalMax = Math.max(globalMax, e.end.getTime());
      }
    }

    // Pad range to full years
    const startYear = new Date(globalMin).getFullYear();
    const endYear = new Date(globalMax).getFullYear() + 1;
    const rangeStart = new Date(startYear, 0, 1).getTime();
    const rangeEnd = new Date(endYear, 0, 1).getTime();
    const rangeMs = rangeEnd - rangeStart;

    // Ring sizing: distribute space proportional to track count
    const totalTracks = parsedGroups.reduce((sum, pg) => sum + pg.trackCount, 0);
    const totalSpace = RING_AREA_OUTER - RING_AREA_INNER;
    const totalGaps = (parsedGroups.length - 1) * GROUP_GAP;
    const spacePerTrack = (totalSpace - totalGaps) / totalTracks;

    // Background
    svg.appendChild(createSvgCircle(CENTER, CENTER, RING_AREA_OUTER, 'rc-bases-background'));

    // Year tick marks
    this.renderYearTicks(svg, startYear, endYear, rangeStart, rangeMs);

    // Render rings with sub-tracks
    let totalEntries = 0;
    let currentOuter = RING_AREA_OUTER;

    for (let gi = 0; gi < parsedGroups.length; gi++) {
      const pg = parsedGroups[gi];
      const groupColor = GROUP_COLORS[gi % GROUP_COLORS.length];
      const groupWidth = pg.trackCount * spacePerTrack;

      for (const te of pg.entries) {
        // Compute sub-track radii within the group's ring
        const trackOuterOffset = te.track * spacePerTrack;
        const trackOuter = currentOuter - trackOuterOffset;
        const trackInner = trackOuter - spacePerTrack + TRACK_GAP;

        const color = te.color ? (ENTRY_COLORS[te.color] || groupColor) : groupColor;
        this.renderArc(svg, te, trackInner, trackOuter, rangeStart, rangeMs, color);
        totalEntries++;
      }

      currentOuter -= groupWidth + GROUP_GAP;
    }

    // Today marker
    const now = Date.now();
    if (now >= rangeStart && now <= rangeEnd) {
      const angle = ((now - rangeStart) / rangeMs) * 2 * Math.PI - Math.PI / 2;
      const x1 = CENTER + (RING_AREA_INNER - 5) * Math.cos(angle);
      const y1 = CENTER + (RING_AREA_INNER - 5) * Math.sin(angle);
      const x2 = CENTER + (RING_AREA_OUTER + 5) * Math.cos(angle);
      const y2 = CENTER + (RING_AREA_OUTER + 5) * Math.sin(angle);
      svg.appendChild(createSvgLine(x1, y1, x2, y2, 'rc-bases-today-marker'));
    }

    // Center
    const centerR = RING_AREA_INNER - 10;
    svg.appendChild(createSvgCircle(CENTER, CENTER, centerR, 'rc-bases-center'));
    svg.appendChild(createSvgText(CENTER, CENTER - 10, `${startYear}–${endYear - 1}`, 'rc-bases-center-text'));
    svg.appendChild(createSvgText(CENTER, CENTER + 15, `${totalEntries} phases`, 'rc-bases-entry-count'));

    // Legend
    if (parsedGroups.length > 1) {
      this.renderLegend(parsedGroups);
    }
  }

  // ---------------------------------------------------------------------------
  // Track assignment for overlapping entries
  // ---------------------------------------------------------------------------

  private assignTracks(entries: ParsedEntry[]): TrackedEntry[] {
    // Sort by start date
    const sorted = [...entries].sort((a, b) => a.start.getTime() - b.start.getTime());
    const tracks: number[] = []; // each track stores the end time of its last entry

    return sorted.map(entry => {
      const startMs = entry.start.getTime();

      // Find first track whose last entry ends before this one starts
      let trackIndex = tracks.findIndex(endMs => endMs <= startMs);

      if (trackIndex === -1) {
        // No free track → create new one
        trackIndex = tracks.length;
        tracks.push(entry.end.getTime());
      } else {
        // Reuse existing track
        tracks[trackIndex] = entry.end.getTime();
      }

      return { ...entry, track: trackIndex };
    });
  }

  // ---------------------------------------------------------------------------
  // Arc rendering
  // ---------------------------------------------------------------------------

  private renderArc(
    svg: SVGSVGElement,
    pe: ParsedEntry,
    innerR: number,
    outerR: number,
    rangeStart: number,
    rangeMs: number,
    color: string
  ): void {
    const startFrac = (pe.start.getTime() - rangeStart) / rangeMs;
    const endFrac = (pe.end.getTime() - rangeStart) / rangeMs;

    // Ensure minimum arc size for visibility
    const minArc = 0.005;
    const startAngle = startFrac * 2 * Math.PI;
    const endAngle = Math.max(startAngle + minArc, endFrac * 2 * Math.PI);

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arc.setAttribute('d', createArcPath(CENTER, innerR, outerR, startAngle, endAngle));
    arc.setAttribute('class', 'rc-bases-entry-indicator');
    arc.style.fill = color;
    arc.style.opacity = '0.8';
    arc.style.cursor = 'pointer';

    // Tooltip
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    const name = pe.label || pe.entry.file?.basename || '?';
    const startStr = pe.start.toLocaleDateString();
    const endStr = pe.end.toLocaleDateString();
    title.textContent = `${name}\n${startStr} – ${endStr}`;
    arc.appendChild(title);

    // Click → open file
    arc.addEventListener('click', () => {
      if (pe.entry.file) {
        this.app.workspace.getLeaf().openFile(pe.entry.file);
      }
    });

    svg.appendChild(arc);
  }

  // ---------------------------------------------------------------------------
  // Year ticks
  // ---------------------------------------------------------------------------

  private renderYearTicks(
    svg: SVGSVGElement,
    startYear: number,
    endYear: number,
    rangeStart: number,
    rangeMs: number
  ): void {
    const totalYears = endYear - startYear;
    const labelEvery = totalYears > 40 ? 10 : totalYears > 20 ? 5 : totalYears > 10 ? 2 : 1;

    for (let year = startYear; year <= endYear; year++) {
      const yearTime = new Date(year, 0, 1).getTime();
      const frac = (yearTime - rangeStart) / rangeMs;
      const angle = frac * 2 * Math.PI - Math.PI / 2;

      const x1 = CENTER + RING_AREA_INNER * Math.cos(angle);
      const y1 = CENTER + RING_AREA_INNER * Math.sin(angle);
      const x2 = CENTER + RING_AREA_OUTER * Math.cos(angle);
      const y2 = CENTER + RING_AREA_OUTER * Math.sin(angle);
      svg.appendChild(createSvgLine(x1, y1, x2, y2, 'rc-bases-month-separator'));

      if ((year - startYear) % labelEvery === 0) {
        const labelAngle = angle + 0.02;
        const lx = CENTER + LABEL_RADIUS * Math.cos(labelAngle);
        const ly = CENTER + LABEL_RADIUS * Math.sin(labelAngle);
        svg.appendChild(createSvgText(lx, ly, String(year), 'rc-bases-month-label'));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  private renderEmpty(svg: SVGSVGElement): void {
    svg.appendChild(createSvgCircle(CENTER, CENTER, RING_AREA_OUTER, 'rc-bases-background'));
    const centerR = RING_AREA_INNER - 10;
    svg.appendChild(createSvgCircle(CENTER, CENTER, centerR, 'rc-bases-center'));
    svg.appendChild(createSvgText(CENTER, CENTER - 10, 'No phases', 'rc-bases-center-text'));
    svg.appendChild(createSvgText(CENTER, CENTER + 15, 'Need radcal-start + radcal-end', 'rc-bases-entry-count'));
  }

  // ---------------------------------------------------------------------------
  // Legend
  // ---------------------------------------------------------------------------

  private renderLegend(parsedGroups: { group: BasesEntryGroup; entries: TrackedEntry[]; trackCount: number }[]): void {
    const legend = this.containerEl.createDiv({ cls: 'rc-bases-legend' });
    parsedGroups.forEach((pg, i) => {
      const item = legend.createDiv({ cls: 'rc-bases-legend-item' });
      const swatch = item.createSpan({ cls: 'rc-bases-legend-swatch' });
      swatch.style.backgroundColor = GROUP_COLORS[i % GROUP_COLORS.length];
      item.createSpan({
        text: `${pg.group.hasKey() ? String(pg.group.key) : 'Ungrouped'} (${pg.entries.length})`,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Date parsing
  // ---------------------------------------------------------------------------

  private parseEntryDates(entry: BasesEntry): ParsedEntry | null {
    const startVal = entry.getValue('note.radcal-start') ?? entry.getValue('radcal-start');
    const endVal = entry.getValue('note.radcal-end') ?? entry.getValue('radcal-end');

    const start = this.parseDate(startVal);
    const end = this.parseDate(endVal);

    if (!start || !end) return null;

    const colorVal = entry.getValue('note.radcal-color') ?? entry.getValue('radcal-color');
    const labelVal = entry.getValue('note.radcal-label') ?? entry.getValue('radcal-label');

    const color = this.extractString(colorVal);
    const label = this.extractString(labelVal);

    return { entry, start, end, color, label };
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;

    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;

      // Bases Value with .date property (Date object or ISO string)
      if ('date' in obj && obj.date) {
        if (obj.date instanceof Date) return obj.date;
        const d = new Date(obj.date as string | number);
        if (!isNaN(d.getTime())) return d;
      }

      // Luxon DateTime
      if (typeof obj.toJSDate === 'function') return (obj.toJSDate as () => Date)();
      if (typeof obj.ts === 'number') return new Date(obj.ts);

      // Nested value
      if ('value' in obj) return this.parseDate(obj.value);
      if ('data' in obj) return this.parseDate(obj.data);
    }

    if (typeof value === 'string') {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }

    if (typeof value === 'number') return new Date(value);
    return null;
  }

  private extractString(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.data === 'string') return obj.data;
      if (typeof obj.value === 'string') return obj.value;
    }
    return undefined;
  }
}

export function createMultiRingAllPeriodsView(
  controller: QueryController,
  containerEl: HTMLElement
): MultiRingAllPeriodsView {
  return new MultiRingAllPeriodsView(controller, containerEl);
}
