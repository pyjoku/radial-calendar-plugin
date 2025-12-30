/**
 * MementoMoriView - Multi-ring time visualization
 *
 * Displays concentric rings showing time passing at different scales:
 * - Hour (60 minutes)
 * - Day (24 hours)
 * - Custom cycle (e.g., 10 days)
 * - Month (~30 days)
 * - Season (quarter/custom)
 * - Year (365 days)
 * - Life (expected lifespan)
 */

import { ItemView, WorkspaceLeaf, App, TFile, Menu } from 'obsidian';
import type { MementoMoriSettings, MementoRingConfig, MementoRingType } from '../../core/domain/types';
import { RING_COLORS, DEFAULT_MEMENTO_MORI_SETTINGS } from '../../core/domain/types';

export const VIEW_TYPE_MEMENTO_MORI = 'memento-mori-view';

/**
 * Time block from daily note
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
 * Weekly time block (day + time range)
 */
interface WeeklyTimeBlock {
  dayOfWeek: number;  // 0=Sunday, 1=Monday, ..., 6=Saturday
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  label: string;
  color: string;
}

/**
 * Monthly time block (day of month)
 */
interface MonthlyTimeBlock {
  dayOfMonth: number;  // 1-31
  endDay?: number;     // For ranges like 15-17
  label: string;
  color: string;
}

/**
 * Periodic Notes plugin settings structure
 */
interface PeriodicNotesSettings {
  daily?: { enabled: boolean; folder: string; format: string };
  weekly?: { enabled: boolean; folder: string; format: string };
  monthly?: { enabled: boolean; folder: string; format: string };
  quarterly?: { enabled: boolean; folder: string; format: string };
  yearly?: { enabled: boolean; folder: string; format: string };
}

// SVG Constants
const SVG_SIZE = 600;
const CENTER = SVG_SIZE / 2;
const MAX_RADIUS = 280;
const MIN_RADIUS = 40;
const RING_GAP = 3;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Ring to Periodic Notes command mapping
 */
const RING_COMMANDS: Record<MementoRingType, string | null> = {
  'hour': null,
  'day': 'periodic-notes:open-daily-note',
  'custom-short': null,  // Special case: 7 days = weekly
  'month': 'periodic-notes:open-monthly-note',
  'season': 'periodic-notes:open-quarterly-note',
  'year': 'periodic-notes:open-yearly-note',
  'life': null
};

/**
 * Memento Mori View
 */
export class MementoMoriView extends ItemView {
  private settings: MementoMoriSettings;
  private birthDate: Date;
  private lifeExpectancy: number;
  private updateInterval: number | null = null;
  private dailyNoteFolder: string;
  private dailyNoteFormat: string;
  private todayTimeBlocks: TimeBlock[] = [];
  private weeklyTimeBlocks: WeeklyTimeBlock[] = [];
  private monthlyTimeBlocks: MonthlyTimeBlock[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    settings: MementoMoriSettings | undefined,
    birthDate: string,
    lifeExpectancy: number,
    dailyNoteFolder: string = '',
    dailyNoteFormat: string = 'YYYY-MM-DD'
  ) {
    super(leaf);
    // Use defaults if settings are undefined (migration case)
    this.settings = settings || DEFAULT_MEMENTO_MORI_SETTINGS;
    this.birthDate = new Date(birthDate || '1990-01-01');
    this.lifeExpectancy = lifeExpectancy || 85;
    this.dailyNoteFolder = dailyNoteFolder;
    this.dailyNoteFormat = dailyNoteFormat;
  }

  getViewType(): string {
    return VIEW_TYPE_MEMENTO_MORI;
  }

  getDisplayText(): string {
    return 'Memento Mori';
  }

  getIcon(): string {
    return 'clock';
  }

  async onOpen(): Promise<void> {
    await this.loadAllTimeBlocks();
    this.render();
    this.startUpdates();
  }

  /**
   * Load all time blocks from periodic notes
   */
  private async loadAllTimeBlocks(): Promise<void> {
    await Promise.all([
      this.loadTodayTimeBlocks(),
      this.loadWeeklyTimeBlocks(),
      this.loadMonthlyTimeBlocks()
    ]);
  }

  async onClose(): Promise<void> {
    this.stopUpdates();
  }

  updateSettings(settings: MementoMoriSettings, birthDate: string, lifeExpectancy: number): void {
    this.settings = settings;
    this.birthDate = new Date(birthDate || '1990-01-01');
    this.lifeExpectancy = lifeExpectancy || 85;
    this.render();
  }

  /**
   * Load time blocks from today's daily note
   */
  private async loadTodayTimeBlocks(): Promise<void> {
    this.todayTimeBlocks = [];

    try {
      // Format today's date according to daily note format
      const today = new Date();
      const dateStr = this.formatDate(today, this.dailyNoteFormat);

      // Find the daily note file
      const folder = this.dailyNoteFolder ? `${this.dailyNoteFolder}/` : '';
      const filePath = `${folder}${dateStr}.md`;

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      // Read file content
      const content = await this.app.vault.read(file);

      // Find radcal-day codeblocks
      const codeblockRegex = /```radcal-day\n([\s\S]*?)```/g;
      let match;

      while ((match = codeblockRegex.exec(content)) !== null) {
        const blockContent = match[1];
        const blocks = this.parseTimeBlocks(blockContent);
        this.todayTimeBlocks.push(...blocks);
      }
    } catch (e) {
      // Silent fail - daily note may not exist
    }
  }

  /**
   * Format date according to format string
   */
  private formatDate(date: Date, format: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day);
  }

  /**
   * Parse time blocks from codeblock content
   */
  private parseTimeBlocks(content: string): TimeBlock[] {
    const blocks: TimeBlock[] = [];
    const lines = content.trim().split('\n');

    let inYaml = false;
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '---') {
        inYaml = !inYaml;
        continue;
      }
      if (inYaml || !trimmed) continue;

      // Parse: "9:00-10:00 Label | color"
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

    return blocks;
  }

  /**
   * Get Periodic Notes plugin settings
   */
  private getPeriodicNotesSettings(): PeriodicNotesSettings | null {
    const periodicNotes = (this.app as any).plugins?.plugins?.['periodic-notes'];
    if (!periodicNotes?.settings) return null;
    return periodicNotes.settings;
  }

  /**
   * Load time blocks from current weekly note
   */
  private async loadWeeklyTimeBlocks(): Promise<void> {
    this.weeklyTimeBlocks = [];

    try {
      const pnSettings = this.getPeriodicNotesSettings();
      if (!pnSettings?.weekly?.enabled) return;

      const folder = pnSettings.weekly.folder || '';
      const format = pnSettings.weekly.format || 'gggg-[W]ww';

      // Calculate current week filename
      const now = new Date();
      const weekFilename = this.formatWeekDate(now, format);
      const filePath = folder ? `${folder}/${weekFilename}.md` : `${weekFilename}.md`;

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      const content = await this.app.vault.read(file);

      // Find radcal codeblocks with type: week (new syntax)
      const newSyntaxRegex = /```radcal\n(type:\s*week[\s\S]*?)```/g;
      let match;

      while ((match = newSyntaxRegex.exec(content)) !== null) {
        const blockContent = match[1];
        const blocks = this.parseWeeklyTimeBlocks(blockContent);
        this.weeklyTimeBlocks.push(...blocks);
      }

      // Legacy: Find radcal-week codeblocks (deprecated)
      const legacyRegex = /```radcal-week\n([\s\S]*?)```/g;
      while ((match = legacyRegex.exec(content)) !== null) {
        const blockContent = match[1];
        const blocks = this.parseWeeklyTimeBlocks(blockContent);
        this.weeklyTimeBlocks.push(...blocks);
      }
    } catch (e) {
      // Silent fail - weekly note may not exist
    }
  }

  /**
   * Format date for weekly note filename
   */
  private formatWeekDate(date: Date, format: string): string {
    // Get ISO week number
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

    const year = d.getUTCFullYear();
    const week = String(weekNo).padStart(2, '0');

    // Handle common formats
    return format
      .replace('gggg', String(year))
      .replace('YYYY', String(year))
      .replace('[W]', 'W')
      .replace('ww', week)
      .replace('WW', week);
  }

  /**
   * Parse weekly time blocks from codeblock content
   * Format: "Mon 9:00-17:00 Label | color" or "1 9:00-17:00 Label | color"
   */
  private parseWeeklyTimeBlocks(content: string): WeeklyTimeBlock[] {
    const blocks: WeeklyTimeBlock[] = [];
    const lines = content.trim().split('\n');
    const dayNames: Record<string, number> = {
      'sun': 0, 'sunday': 0,
      'mon': 1, 'monday': 1,
      'tue': 2, 'tuesday': 2,
      'wed': 3, 'wednesday': 3,
      'thu': 4, 'thursday': 4,
      'fri': 5, 'friday': 5,
      'sat': 6, 'saturday': 6
    };

    let inYaml = false;
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '---') {
        inYaml = !inYaml;
        continue;
      }
      if (inYaml || !trimmed) continue;

      // New syntax: "Mon 9:00-17:00 color: Label"
      const newMatch = trimmed.match(/^(\w+)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(\w+):\s*(.+)$/);
      if (newMatch) {
        const dayStr = newMatch[1].toLowerCase();
        let dayOfWeek = dayNames[dayStr];
        if (dayOfWeek === undefined) {
          dayOfWeek = parseInt(dayStr, 10);
          if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
        }

        blocks.push({
          dayOfWeek,
          startHour: parseInt(newMatch[2], 10),
          startMinute: parseInt(newMatch[3], 10),
          endHour: parseInt(newMatch[4], 10),
          endMinute: parseInt(newMatch[5], 10),
          color: newMatch[6].toLowerCase(),
          label: newMatch[7].trim()
        });
        continue;
      }

      // Legacy syntax: "Mon 9:00-17:00 Label | color"
      const legacyMatch = trimmed.match(/^(\w+)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+?)(?:\s*\|\s*(\w+))?$/);
      if (legacyMatch) {
        const dayStr = legacyMatch[1].toLowerCase();
        let dayOfWeek = dayNames[dayStr];
        if (dayOfWeek === undefined) {
          dayOfWeek = parseInt(dayStr, 10);
          if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
        }

        blocks.push({
          dayOfWeek,
          startHour: parseInt(legacyMatch[2], 10),
          startMinute: parseInt(legacyMatch[3], 10),
          endHour: parseInt(legacyMatch[4], 10),
          endMinute: parseInt(legacyMatch[5], 10),
          label: legacyMatch[6].trim(),
          color: legacyMatch[7] || 'blue'
        });
      }
    }

    return blocks;
  }

  /**
   * Load time blocks from current monthly note
   */
  private async loadMonthlyTimeBlocks(): Promise<void> {
    this.monthlyTimeBlocks = [];

    try {
      const pnSettings = this.getPeriodicNotesSettings();
      if (!pnSettings?.monthly?.enabled) return;

      const folder = pnSettings.monthly.folder || '';
      const format = pnSettings.monthly.format || 'YYYY-MM';

      // Calculate current month filename
      const now = new Date();
      const monthFilename = this.formatDate(now, format);
      const filePath = folder ? `${folder}/${monthFilename}.md` : `${monthFilename}.md`;

      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) return;

      const content = await this.app.vault.read(file);

      // Find radcal codeblocks with type: month (new syntax)
      const newSyntaxRegex = /```radcal\n(type:\s*month[\s\S]*?)```/g;
      let match;

      while ((match = newSyntaxRegex.exec(content)) !== null) {
        const blockContent = match[1];
        const blocks = this.parseMonthlyTimeBlocks(blockContent);
        this.monthlyTimeBlocks.push(...blocks);
      }

      // Legacy: Find radcal-month codeblocks (deprecated)
      const legacyRegex = /```radcal-month\n([\s\S]*?)```/g;
      while ((match = legacyRegex.exec(content)) !== null) {
        const blockContent = match[1];
        const blocks = this.parseMonthlyTimeBlocks(blockContent);
        this.monthlyTimeBlocks.push(...blocks);
      }
    } catch (e) {
      // Silent fail - monthly note may not exist
    }
  }

  /**
   * Parse monthly time blocks from codeblock content
   * New format: "15 color: Event" or "15-17 color: Event"
   * Legacy format: "15 Event | color" or "15-17 Event | color"
   */
  private parseMonthlyTimeBlocks(content: string): MonthlyTimeBlock[] {
    const blocks: MonthlyTimeBlock[] = [];
    const lines = content.trim().split('\n');

    let inYaml = false;
    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '---') {
        inYaml = !inYaml;
        continue;
      }
      if (inYaml || !trimmed) continue;
      if (trimmed.startsWith('type:')) continue;

      // New syntax with range: "15-17 color: Event"
      const newRangeMatch = trimmed.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+(\w+):\s*(.+)$/);
      if (newRangeMatch) {
        const dayOfMonth = parseInt(newRangeMatch[1], 10);
        if (dayOfMonth < 1 || dayOfMonth > 31) continue;

        blocks.push({
          dayOfMonth,
          endDay: parseInt(newRangeMatch[2], 10),
          color: newRangeMatch[3].toLowerCase(),
          label: newRangeMatch[4].trim()
        });
        continue;
      }

      // New syntax single day: "15 color: Event"
      const newMatch = trimmed.match(/^(\d{1,2})\s+(\w+):\s*(.+)$/);
      if (newMatch) {
        const dayOfMonth = parseInt(newMatch[1], 10);
        if (dayOfMonth < 1 || dayOfMonth > 31) continue;

        blocks.push({
          dayOfMonth,
          color: newMatch[2].toLowerCase(),
          label: newMatch[3].trim()
        });
        continue;
      }

      // Legacy syntax: "15 Event | color" or "15-17 Event | color"
      const legacyMatch = trimmed.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s+(.+?)(?:\s*\|\s*(\w+))?$/);
      if (legacyMatch) {
        const dayOfMonth = parseInt(legacyMatch[1], 10);
        if (dayOfMonth < 1 || dayOfMonth > 31) continue;

        const endDay = legacyMatch[2] ? parseInt(legacyMatch[2], 10) : undefined;

        blocks.push({
          dayOfMonth,
          endDay,
          label: legacyMatch[3].trim(),
          color: legacyMatch[4] || 'blue'
        });
      }
    }

    return blocks;
  }

  private startUpdates(): void {
    // Update every minute
    this.updateInterval = window.setInterval(() => {
      this.render();
    }, 60 * 1000);
  }

  private stopUpdates(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('memento-mori-container');

    // Header with refresh button
    const header = container.createDiv({ cls: 'memento-mori-header' });
    const refreshBtn = header.createEl('button', {
      cls: 'memento-refresh-btn',
      attr: { 'aria-label': 'Refresh' }
    });
    refreshBtn.innerHTML = '↻';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.addClass('memento-refresh-spinning');
      await this.loadAllTimeBlocks();
      this.render();
    });

    const wrapper = container.createDiv({ cls: 'memento-mori-wrapper' });

    // Get enabled rings sorted by order
    const enabledRings = this.settings.rings
      .filter(r => r.enabled)
      .sort((a, b) => a.order - b.order);

    if (enabledRings.length === 0) {
      wrapper.createEl('p', { text: 'Keine Ringe aktiviert. Aktiviere Ringe in den Einstellungen.' });
      return;
    }

    // Create SVG
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('class', 'memento-mori-svg');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = '600px';

    // Background
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', String(CENTER));
    bg.setAttribute('cy', String(CENTER));
    bg.setAttribute('r', String(MAX_RADIUS + 10));
    bg.setAttribute('class', 'memento-bg');
    svg.appendChild(bg);

    // Calculate ring dimensions
    const ringCount = enabledRings.length;
    const totalSpace = MAX_RADIUS - MIN_RADIUS;
    const totalGaps = (ringCount - 1) * RING_GAP;
    const ringWidth = (totalSpace - totalGaps) / ringCount;

    // Render each ring (innermost first)
    enabledRings.forEach((ring, index) => {
      const innerRadius = MIN_RADIUS + index * (ringWidth + RING_GAP);
      const outerRadius = innerRadius + ringWidth;
      this.renderRing(svg, ring, innerRadius, outerRadius);
    });

    // Center text
    this.renderCenter(svg);

    wrapper.appendChild(svg);
  }

  private renderRing(
    svg: SVGSVGElement,
    ring: MementoRingConfig,
    innerRadius: number,
    outerRadius: number
  ): void {
    const now = new Date();

    switch (ring.id) {
      case 'hour':
        this.renderHourRing(svg, innerRadius, outerRadius, now);
        break;
      case 'day':
        this.renderDayRing(svg, innerRadius, outerRadius, now);
        break;
      case 'custom-short':
        this.renderCustomShortRing(svg, innerRadius, outerRadius, now, ring.customDays || 10);
        break;
      case 'month':
        this.renderMonthRing(svg, innerRadius, outerRadius, now);
        break;
      case 'season':
        this.renderSeasonRing(svg, innerRadius, outerRadius, now, ring.customMonths || 3);
        break;
      case 'year':
        this.renderYearRing(svg, innerRadius, outerRadius, now);
        break;
      case 'life':
        this.renderLifeRing(svg, innerRadius, outerRadius, now);
        break;
    }
  }

  private renderHourRing(svg: SVGSVGElement, innerR: number, outerR: number, now: Date): void {
    const currentMinute = now.getMinutes();
    const totalSegments = 60;

    // Past (gray)
    if (currentMinute > 0) {
      const pastArc = this.createArc(innerR, outerR, 0, currentMinute, totalSegments);
      pastArc.setAttribute('class', 'memento-past');
      svg.appendChild(pastArc);
    }

    // Present (red) - current minute
    const presentArc = this.createArc(innerR, outerR, currentMinute, currentMinute + 1, totalSegments);
    presentArc.setAttribute('class', 'memento-present');
    svg.appendChild(presentArc);

    // Future
    if (currentMinute < 59) {
      const futureArc = this.createArc(innerR, outerR, currentMinute + 1, totalSegments, totalSegments);
      futureArc.setAttribute('class', 'memento-future');
      svg.appendChild(futureArc);
    }

    // Ring label
    this.addRingLabel(svg, outerR, 'H');
  }

  private renderDayRing(svg: SVGSVGElement, innerR: number, outerR: number, now: Date): void {
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const progress = currentHour + currentMinute / 60;
    const totalSegments = 24;

    // Create ring group for event handling
    const ringGroup = document.createElementNS(SVG_NS, 'g');
    ringGroup.setAttribute('class', 'memento-ring-day');
    ringGroup.style.cursor = 'context-menu';

    // Past
    if (progress > 0) {
      const pastEnd = Math.floor(progress);
      if (pastEnd > 0) {
        const pastArc = this.createArc(innerR, outerR, 0, pastEnd, totalSegments);
        pastArc.setAttribute('class', 'memento-past');
        ringGroup.appendChild(pastArc);
      }
    }

    // Present
    const presentStart = Math.floor(progress);
    const presentArc = this.createArc(innerR, outerR, presentStart, presentStart + 1, totalSegments);
    presentArc.setAttribute('class', 'memento-present');
    ringGroup.appendChild(presentArc);

    // Future
    if (presentStart < 23) {
      const futureArc = this.createArc(innerR, outerR, presentStart + 1, totalSegments, totalSegments);
      futureArc.setAttribute('class', 'memento-future');
      ringGroup.appendChild(futureArc);
    }

    // Add context menu event listener
    ringGroup.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showRingContextMenu(e, 'day');
    });

    svg.appendChild(ringGroup);

    // Render time blocks from daily note (overlay)
    this.renderTimeBlocks(svg, innerR, outerR);

    // Current time indicator (red line)
    this.renderCurrentTimeIndicator(svg, innerR, outerR, progress, totalSegments);

    this.addRingLabel(svg, outerR, 'D');
  }

  /**
   * Render time blocks from daily note as colored arcs
   */
  private renderTimeBlocks(svg: SVGSVGElement, innerR: number, outerR: number): void {
    const totalMinutes = 24 * 60;

    for (const block of this.todayTimeBlocks) {
      const startMinutes = block.startHour * 60 + block.startMinute;
      const endMinutes = block.endHour * 60 + block.endMinute;

      // Create arc for time block
      const arc = this.createArcByMinutes(innerR, outerR, startMinutes, endMinutes, totalMinutes);
      arc.setAttribute('class', `memento-block memento-block-${block.color}`);
      arc.setAttribute('fill', this.getBlockColor(block.color));
      arc.setAttribute('opacity', '0.7');

      // Add tooltip
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${block.startHour}:${String(block.startMinute).padStart(2, '0')} - ${block.endHour}:${String(block.endMinute).padStart(2, '0')}\n${block.label}`;
      arc.appendChild(title);

      svg.appendChild(arc);
    }
  }

  /**
   * Create arc using minute-based positions for precise time blocks
   */
  private createArcByMinutes(
    innerR: number,
    outerR: number,
    startMinutes: number,
    endMinutes: number,
    totalMinutes: number
  ): SVGPathElement {
    const startAngle = (startMinutes / totalMinutes) * 2 * Math.PI - Math.PI / 2;
    const endAngle = (endMinutes / totalMinutes) * 2 * Math.PI - Math.PI / 2;

    const x1 = CENTER + innerR * Math.cos(startAngle);
    const y1 = CENTER + innerR * Math.sin(startAngle);
    const x2 = CENTER + outerR * Math.cos(startAngle);
    const y2 = CENTER + outerR * Math.sin(startAngle);
    const x3 = CENTER + outerR * Math.cos(endAngle);
    const y3 = CENTER + outerR * Math.sin(endAngle);
    const x4 = CENTER + innerR * Math.cos(endAngle);
    const y4 = CENTER + innerR * Math.sin(endAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3}`,
      `L ${x4} ${y4}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}`,
      'Z',
    ].join(' ');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    return path;
  }

  /**
   * Get CSS color for block color name
   */
  private getBlockColor(colorName: string): string {
    const colors: Record<string, string> = {
      blue: 'var(--color-blue)',
      green: 'var(--color-green)',
      red: 'var(--color-red)',
      orange: 'var(--color-orange)',
      yellow: 'var(--color-yellow)',
      purple: 'var(--color-purple)',
      pink: 'var(--color-pink)',
      teal: 'var(--color-cyan)',
      cyan: 'var(--color-cyan)',
      gray: 'var(--text-muted)',
      grey: 'var(--text-muted)',
    };
    return colors[colorName.toLowerCase()] || colors.blue;
  }

  /**
   * Render current time indicator as a thin red line
   */
  private renderCurrentTimeIndicator(
    svg: SVGSVGElement,
    innerR: number,
    outerR: number,
    progress: number,
    totalSegments: number
  ): void {
    const angle = (progress / totalSegments) * 2 * Math.PI - Math.PI / 2;
    const x1 = CENTER + innerR * Math.cos(angle);
    const y1 = CENTER + innerR * Math.sin(angle);
    const x2 = CENTER + (outerR + 2) * Math.cos(angle);
    const y2 = CENTER + (outerR + 2) * Math.sin(angle);

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('class', 'memento-time-indicator');
    line.setAttribute('stroke', 'var(--color-red)');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);
  }

  private renderCustomShortRing(
    svg: SVGSVGElement,
    innerR: number,
    outerR: number,
    now: Date,
    cycleDays: number
  ): void {
    // Calculate day within cycle
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const dayInCycle = dayOfYear % cycleDays;

    const totalSegments = cycleDays;

    // Create ring group for event handling
    const ringGroup = document.createElementNS(SVG_NS, 'g');
    ringGroup.setAttribute('class', 'memento-ring-custom');
    ringGroup.style.cursor = 'context-menu';

    // Past
    if (dayInCycle > 0) {
      const pastArc = this.createArc(innerR, outerR, 0, dayInCycle, totalSegments);
      pastArc.setAttribute('class', 'memento-past');
      ringGroup.appendChild(pastArc);
    }

    // Present
    const presentArc = this.createArc(innerR, outerR, dayInCycle, dayInCycle + 1, totalSegments);
    presentArc.setAttribute('class', 'memento-present');
    ringGroup.appendChild(presentArc);

    // Future
    if (dayInCycle < cycleDays - 1) {
      const futureArc = this.createArc(innerR, outerR, dayInCycle + 1, totalSegments, totalSegments);
      futureArc.setAttribute('class', 'memento-future');
      ringGroup.appendChild(futureArc);
    }

    // Add context menu event listener (7 days = weekly)
    ringGroup.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showRingContextMenu(e, 'custom-short', cycleDays);
    });

    svg.appendChild(ringGroup);

    // Render weekly time blocks if 7-day cycle
    if (cycleDays === 7) {
      this.renderWeeklyTimeBlocks(svg, innerR, outerR, now);
    }

    this.addRingLabel(svg, outerR, `${cycleDays}d`);
  }

  /**
   * Render weekly time blocks on the custom-short ring (7 days)
   */
  private renderWeeklyTimeBlocks(svg: SVGSVGElement, innerR: number, outerR: number, now: Date): void {
    if (this.weeklyTimeBlocks.length === 0) return;

    const totalDays = 7;
    const currentDayOfWeek = now.getDay(); // 0=Sunday

    for (const block of this.weeklyTimeBlocks) {
      // Calculate position on the ring
      // Each day is 1/7 of the ring, with time blocks as sub-arcs
      const dayStart = block.dayOfWeek / totalDays;
      const dayEnd = (block.dayOfWeek + 1) / totalDays;

      // Time within the day (as fraction of 24h)
      const startTimeFraction = (block.startHour * 60 + block.startMinute) / (24 * 60);
      const endTimeFraction = (block.endHour * 60 + block.endMinute) / (24 * 60);

      // Calculate arc start/end within the day segment
      const arcStart = dayStart + (dayEnd - dayStart) * startTimeFraction;
      const arcEnd = dayStart + (dayEnd - dayStart) * endTimeFraction;

      const arc = this.createArcByFraction(innerR, outerR, arcStart, arcEnd);
      arc.setAttribute('class', `memento-block memento-block-${block.color}`);
      arc.setAttribute('fill', this.getBlockColor(block.color));
      arc.setAttribute('opacity', '0.7');

      // Add tooltip
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${dayNames[block.dayOfWeek]} ${block.startHour}:${String(block.startMinute).padStart(2, '0')} - ${block.endHour}:${String(block.endMinute).padStart(2, '0')}\n${block.label}`;
      arc.appendChild(title);

      svg.appendChild(arc);
    }
  }

  /**
   * Create arc using fraction-based positions (0-1)
   */
  private createArcByFraction(
    innerR: number,
    outerR: number,
    startFraction: number,
    endFraction: number
  ): SVGPathElement {
    const startAngle = startFraction * 2 * Math.PI - Math.PI / 2;
    const endAngle = endFraction * 2 * Math.PI - Math.PI / 2;

    const x1 = CENTER + innerR * Math.cos(startAngle);
    const y1 = CENTER + innerR * Math.sin(startAngle);
    const x2 = CENTER + outerR * Math.cos(startAngle);
    const y2 = CENTER + outerR * Math.sin(startAngle);
    const x3 = CENTER + outerR * Math.cos(endAngle);
    const y3 = CENTER + outerR * Math.sin(endAngle);
    const x4 = CENTER + innerR * Math.cos(endAngle);
    const y4 = CENTER + innerR * Math.sin(endAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3}`,
      `L ${x4} ${y4}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}`,
      'Z',
    ].join(' ');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    return path;
  }

  private renderMonthRing(svg: SVGSVGElement, innerR: number, outerR: number, now: Date): void {
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // Create ring group for event handling
    const ringGroup = document.createElementNS(SVG_NS, 'g');
    ringGroup.setAttribute('class', 'memento-ring-month');
    ringGroup.style.cursor = 'context-menu';

    // Past
    if (currentDay > 1) {
      const pastArc = this.createArc(innerR, outerR, 0, currentDay - 1, daysInMonth);
      pastArc.setAttribute('class', 'memento-past');
      ringGroup.appendChild(pastArc);
    }

    // Present
    const presentArc = this.createArc(innerR, outerR, currentDay - 1, currentDay, daysInMonth);
    presentArc.setAttribute('class', 'memento-present');
    ringGroup.appendChild(presentArc);

    // Future
    if (currentDay < daysInMonth) {
      const futureArc = this.createArc(innerR, outerR, currentDay, daysInMonth, daysInMonth);
      futureArc.setAttribute('class', 'memento-future');
      ringGroup.appendChild(futureArc);
    }

    // Add context menu event listener
    ringGroup.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showRingContextMenu(e, 'month');
    });

    svg.appendChild(ringGroup);

    // Render monthly time blocks
    this.renderMonthlyTimeBlocks(svg, innerR, outerR, daysInMonth);

    this.addRingLabel(svg, outerR, 'M');
  }

  /**
   * Render monthly time blocks on the month ring
   */
  private renderMonthlyTimeBlocks(svg: SVGSVGElement, innerR: number, outerR: number, daysInMonth: number): void {
    if (this.monthlyTimeBlocks.length === 0) return;

    for (const block of this.monthlyTimeBlocks) {
      const startDay = block.dayOfMonth;
      const endDay = block.endDay || block.dayOfMonth;

      // Skip if out of range for this month
      if (startDay > daysInMonth) continue;

      const actualEndDay = Math.min(endDay, daysInMonth);

      // Create arc (days are 1-indexed, ring is 0-indexed)
      const arc = this.createArc(innerR, outerR, startDay - 1, actualEndDay, daysInMonth);
      arc.setAttribute('class', `memento-block memento-block-${block.color}`);
      arc.setAttribute('fill', this.getBlockColor(block.color));
      arc.setAttribute('opacity', '0.7');

      // Add tooltip
      const title = document.createElementNS(SVG_NS, 'title');
      if (block.endDay && block.endDay !== block.dayOfMonth) {
        title.textContent = `${block.dayOfMonth}-${actualEndDay}: ${block.label}`;
      } else {
        title.textContent = `${block.dayOfMonth}: ${block.label}`;
      }
      arc.appendChild(title);

      svg.appendChild(arc);
    }
  }

  private renderSeasonRing(
    svg: SVGSVGElement,
    innerR: number,
    outerR: number,
    now: Date,
    monthsPerSeason: number
  ): void {
    const currentMonth = now.getMonth(); // 0-11
    const monthInSeason = currentMonth % monthsPerSeason;
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // Calculate total days in season and current position
    let totalDays = 0;
    let daysElapsed = 0;
    const seasonStartMonth = currentMonth - monthInSeason;

    for (let i = 0; i < monthsPerSeason; i++) {
      const month = seasonStartMonth + i;
      const days = new Date(now.getFullYear(), month + 1, 0).getDate();
      totalDays += days;
      if (i < monthInSeason) {
        daysElapsed += days;
      } else if (i === monthInSeason) {
        daysElapsed += currentDay - 1;
      }
    }

    // Create ring group for event handling
    const ringGroup = document.createElementNS(SVG_NS, 'g');
    ringGroup.setAttribute('class', 'memento-ring-season');
    ringGroup.style.cursor = 'context-menu';

    // Past
    if (daysElapsed > 0) {
      const pastArc = this.createArc(innerR, outerR, 0, daysElapsed, totalDays);
      pastArc.setAttribute('class', 'memento-past');
      ringGroup.appendChild(pastArc);
    }

    // Present
    const presentArc = this.createArc(innerR, outerR, daysElapsed, daysElapsed + 1, totalDays);
    presentArc.setAttribute('class', 'memento-present');
    ringGroup.appendChild(presentArc);

    // Future
    if (daysElapsed + 1 < totalDays) {
      const futureArc = this.createArc(innerR, outerR, daysElapsed + 1, totalDays, totalDays);
      futureArc.setAttribute('class', 'memento-future');
      ringGroup.appendChild(futureArc);
    }

    // Add context menu event listener
    ringGroup.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showRingContextMenu(e, 'season');
    });

    svg.appendChild(ringGroup);

    this.addRingLabel(svg, outerR, 'Q');
  }

  private renderYearRing(svg: SVGSVGElement, innerR: number, outerR: number, now: Date): void {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
    const totalDays = Math.floor((endOfYear.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));

    // Create ring group for event handling
    const ringGroup = document.createElementNS(SVG_NS, 'g');
    ringGroup.setAttribute('class', 'memento-ring-year');
    ringGroup.style.cursor = 'context-menu';

    // Past
    if (dayOfYear > 0) {
      const pastArc = this.createArc(innerR, outerR, 0, dayOfYear, totalDays);
      pastArc.setAttribute('class', 'memento-past');
      ringGroup.appendChild(pastArc);
    }

    // Present
    const presentArc = this.createArc(innerR, outerR, dayOfYear, dayOfYear + 1, totalDays);
    presentArc.setAttribute('class', 'memento-present');
    ringGroup.appendChild(presentArc);

    // Future
    if (dayOfYear + 1 < totalDays) {
      const futureArc = this.createArc(innerR, outerR, dayOfYear + 1, totalDays, totalDays);
      futureArc.setAttribute('class', 'memento-future');
      ringGroup.appendChild(futureArc);
    }

    // Add context menu event listener
    ringGroup.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showRingContextMenu(e, 'year');
    });

    svg.appendChild(ringGroup);

    this.addRingLabel(svg, outerR, 'Y');
  }

  private renderLifeRing(svg: SVGSVGElement, innerR: number, outerR: number, now: Date): void {
    const ageMs = now.getTime() - this.birthDate.getTime();
    const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    const totalYears = this.lifeExpectancy;

    const currentYear = Math.floor(ageYears);
    const yearsLived = Math.min(currentYear, totalYears);

    // Past
    if (yearsLived > 0) {
      const pastArc = this.createArc(innerR, outerR, 0, yearsLived, totalYears);
      pastArc.setAttribute('class', 'memento-past');
      svg.appendChild(pastArc);
    }

    // Present (current year)
    if (currentYear < totalYears) {
      const presentArc = this.createArc(innerR, outerR, currentYear, currentYear + 1, totalYears);
      presentArc.setAttribute('class', 'memento-present');
      svg.appendChild(presentArc);
    }

    // Future
    if (currentYear + 1 < totalYears) {
      const futureArc = this.createArc(innerR, outerR, currentYear + 1, totalYears, totalYears);
      futureArc.setAttribute('class', 'memento-future');
      svg.appendChild(futureArc);
    }

    this.addRingLabel(svg, outerR, 'L');
  }

  private createArc(
    innerR: number,
    outerR: number,
    start: number,
    end: number,
    total: number
  ): SVGPathElement {
    const startAngle = (start / total) * 2 * Math.PI - Math.PI / 2;
    const endAngle = (end / total) * 2 * Math.PI - Math.PI / 2;

    const x1 = CENTER + innerR * Math.cos(startAngle);
    const y1 = CENTER + innerR * Math.sin(startAngle);
    const x2 = CENTER + outerR * Math.cos(startAngle);
    const y2 = CENTER + outerR * Math.sin(startAngle);
    const x3 = CENTER + outerR * Math.cos(endAngle);
    const y3 = CENTER + outerR * Math.sin(endAngle);
    const x4 = CENTER + innerR * Math.cos(endAngle);
    const y4 = CENTER + innerR * Math.sin(endAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3}`,
      `L ${x4} ${y4}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1}`,
      'Z',
    ].join(' ');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    return path;
  }

  private addRingLabel(svg: SVGSVGElement, outerR: number, label: string): void {
    // Add label at top of ring
    const angle = -Math.PI / 2; // Top
    const labelR = outerR + 12;
    const x = CENTER + labelR * Math.cos(angle);
    const y = CENTER + labelR * Math.sin(angle);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('class', 'memento-ring-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = label;
    svg.appendChild(text);
  }

  private renderCenter(svg: SVGSVGElement): void {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Background circle
    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', String(CENTER));
    bg.setAttribute('cy', String(CENTER));
    bg.setAttribute('r', String(MIN_RADIUS - 5));
    bg.setAttribute('class', 'memento-center-bg');
    svg.appendChild(bg);

    // Time
    const time = document.createElementNS(SVG_NS, 'text');
    time.setAttribute('x', String(CENTER));
    time.setAttribute('y', String(CENTER - 5));
    time.setAttribute('class', 'memento-center-time');
    time.setAttribute('text-anchor', 'middle');
    time.setAttribute('dominant-baseline', 'central');
    time.textContent = timeStr;
    svg.appendChild(time);

    // Date
    const dateStr = `${now.getDate()}.${now.getMonth() + 1}.`;
    const date = document.createElementNS(SVG_NS, 'text');
    date.setAttribute('x', String(CENTER));
    date.setAttribute('y', String(CENTER + 15));
    date.setAttribute('class', 'memento-center-date');
    date.setAttribute('text-anchor', 'middle');
    date.setAttribute('dominant-baseline', 'central');
    date.textContent = dateStr;
    svg.appendChild(date);
  }

  /**
   * Show context menu for a ring
   */
  private showRingContextMenu(event: MouseEvent, ringId: MementoRingType, customDays?: number): void {
    const menu = new Menu();

    // Determine the command for this ring
    let command = RING_COMMANDS[ringId];

    // Special case: custom-short with 7 days = weekly
    if (ringId === 'custom-short' && customDays === 7) {
      command = 'periodic-notes:open-weekly-note';
    }

    if (!command) {
      // No periodic note for this ring type
      return;
    }

    // Check if the Periodic Notes plugin command exists
    const commandExists = (this.app as any).commands?.commands?.[command];

    if (!commandExists) {
      menu.addItem((item) => {
        item
          .setTitle('Periodic Notes Plugin required')
          .setIcon('alert-circle')
          .setDisabled(true);
      });
      menu.addItem((item) => {
        item
          .setTitle('Install from Community Plugins')
          .setIcon('download')
          .onClick(() => {
            // Open Obsidian settings to community plugins
            (this.app as any).setting?.open();
            (this.app as any).setting?.openTabById?.('community-plugins');
          });
      });
    } else {
      const label = this.getCommandLabel(ringId, customDays);
      menu.addItem((item) => {
        item
          .setTitle(label)
          .setIcon('calendar')
          .onClick(() => {
            (this.app as any).commands.executeCommandById(command);
          });
      });
    }

    menu.showAtMouseEvent(event);
  }

  /**
   * Get human-readable label for ring context menu
   */
  private getCommandLabel(ringId: MementoRingType, customDays?: number): string {
    const labels: Record<string, string> = {
      'day': 'Open Daily Note',
      'custom-short-7': 'Open Weekly Note',
      'month': 'Open Monthly Note',
      'season': 'Open Quarterly Note',
      'year': 'Open Yearly Note'
    };

    if (ringId === 'custom-short' && customDays === 7) {
      return labels['custom-short-7'];
    }

    return labels[ringId] || 'Open Note';
  }
}
