/**
 * RadcalBlockProcessor - Processes radcal codeblocks
 *
 * Handles parsing, rendering, and live updates for radcal codeblocks
 */

import { MarkdownRenderChild, MarkdownPostProcessorContext, App, TFile } from 'obsidian';
import type { CalendarService } from '../../application/services/CalendarService';
import type { CalendarEntry } from '../../core/domain/models/CalendarEntry';
import type { LocalDate } from '../../core/domain/models/LocalDate';
import { createLocalDate, getDaysInMonth, isLeapYear } from '../../core/domain/models/LocalDate';
import { parseRadcalConfig } from './RadcalConfigParser';
import { RadcalRenderer, EntriesByDate } from './RadcalRenderer';
import { RadcalFilterEngine } from './RadcalFilterEngine';
import type { RadcalBlockConfig } from '../../core/domain/types/radcal-block';

/**
 * Render child for radcal codeblocks with live updates
 */
class RadcalRenderChild extends MarkdownRenderChild {
  private unsubscribe: (() => void) | null = null;
  private readonly filterEngine: RadcalFilterEngine;

  constructor(
    containerEl: HTMLElement,
    private readonly app: App,
    private readonly service: CalendarService,
    private readonly config: RadcalBlockConfig,
    private readonly openFile: (path: string) => Promise<void>
  ) {
    super(containerEl);
    this.filterEngine = new RadcalFilterEngine(app);
  }

  onload(): void {
    // Initial render
    this.render();

    // Subscribe to entry updates for live refresh
    this.unsubscribe = this.service.subscribeToUpdates(() => {
      this.render();
    });
  }

  onunload(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private render(): void {
    // Clear container
    this.containerEl.empty();

    const year = this.config.year ?? this.service.getCurrentYear();

    // Load entries
    const entries = this.loadFilteredEntries(year);

    // Create renderer and render
    const renderer = new RadcalRenderer();
    const svg = renderer.render(
      this.config,
      entries,
      year,
      (date, dayEntries) => this.handleDayClick(date, dayEntries)
    );

    // Add tooltip element
    const tooltipEl = this.containerEl.createDiv({ cls: 'radcal-tooltip' });

    // Wrap SVG in container
    const wrapper = this.containerEl.createDiv({ cls: 'radcal-block-content' });
    wrapper.appendChild(svg);

    // Add hover handlers for tooltips
    this.setupTooltips(svg, tooltipEl, year);
  }

  private loadFilteredEntries(year: number): EntriesByDate {
    const result = new Map<string, CalendarEntry[]>();

    // If dateProperty is set, load files directly and use that property
    if (this.config.dateProperty) {
      return this.loadEntriesByProperty(year);
    }

    // Standard mode: use CalendarService entries
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = getDaysInMonth(year, month);
      for (let day = 1; day <= daysInMonth; day++) {
        const date = createLocalDate(year, month, day);
        const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        let entries = [...this.service.getEntriesForDate(date)];

        // Apply Bases-compatible filter if specified
        if (this.config.filter) {
          entries = entries.filter(entry => {
            const file = this.app.vault.getAbstractFileByPath(entry.filePath);
            if (!(file instanceof TFile)) return false;

            const context = this.filterEngine.createContext(file);
            return this.filterEngine.evaluate(this.config.filter!, context);
          });
        }

        // Legacy: Apply folder filter if specified (deprecated)
        if (!this.config.filter && this.config.folder) {
          const folderFilter = this.config.folder;
          entries = entries.filter(e =>
            e.metadata.folder === folderFilter ||
            e.metadata.folder.startsWith(folderFilter + '/')
          );
        }

        // Legacy: Apply folders filter if specified (deprecated)
        if (!this.config.filter && this.config.folders && this.config.folders.length > 0) {
          const foldersFilter = this.config.folders;
          entries = entries.filter(e =>
            foldersFilter.some(f =>
              e.metadata.folder === f ||
              e.metadata.folder.startsWith(f + '/')
            )
          );
        }

        if (entries.length > 0) {
          result.set(dateKey, entries);
        }
      }
    }

    return result;
  }

  /**
   * Load entries using a specific dateProperty from frontmatter
   */
  private loadEntriesByProperty(year: number): EntriesByDate {
    const result = new Map<string, CalendarEntry[]>();
    const propName = this.config.dateProperty!;

    // Get all markdown files
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      // Apply filter if specified
      if (this.config.filter) {
        const context = this.filterEngine.createContext(file);
        if (!this.filterEngine.evaluate(this.config.filter, context)) {
          continue;
        }
      }

      // Get frontmatter
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;
      if (!frontmatter) continue;

      // Get date from property
      const dateValue = frontmatter[propName];
      if (!dateValue) continue;

      // Parse date
      const parsedDate = this.parseDate(dateValue);
      if (!parsedDate) continue;

      // Check if in target year
      if (parsedDate.year !== year) continue;

      // Create date key
      const dateKey = `${parsedDate.year}-${String(parsedDate.month).padStart(2, '0')}-${String(parsedDate.day).padStart(2, '0')}`;

      // Create a simple entry object
      const entry: CalendarEntry = {
        id: file.path,
        filePath: file.path,
        fileName: file.name,
        displayName: file.basename,
        startDate: parsedDate,
        endDate: null,
        isMultiDay: false,
        isAnniversary: false,
        metadata: {
          tags: [],
          folder: file.parent?.path ?? '',
          properties: {},
        },
      };

      // Add to result
      if (!result.has(dateKey)) {
        result.set(dateKey, []);
      }
      result.get(dateKey)!.push(entry);
    }

    return result;
  }

  /**
   * Parse a date value from frontmatter
   */
  private parseDate(value: unknown): LocalDate | null {
    if (!value) return null;

    // Handle Date object
    if (value instanceof Date) {
      return createLocalDate(
        value.getFullYear(),
        value.getMonth() + 1,
        value.getDate()
      );
    }

    // Handle string (YYYY-MM-DD or similar)
    if (typeof value === 'string') {
      const match = value.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return createLocalDate(
          parseInt(match[1], 10),
          parseInt(match[2], 10),
          parseInt(match[3], 10)
        );
      }
    }

    return null;
  }

  private handleDayClick(date: LocalDate, entries: CalendarEntry[]): void {
    if (entries.length === 1) {
      // Open single entry directly
      this.openFile(entries[0].filePath);
    } else if (entries.length > 1) {
      // Open first entry (could add menu later)
      this.openFile(entries[0].filePath);
    }
  }

  private setupTooltips(svg: SVGSVGElement, tooltipEl: HTMLElement, year: number): void {
    const arcs = svg.querySelectorAll('.rc-day-arc[data-date]');

    arcs.forEach((arc) => {
      arc.addEventListener('mouseenter', (e) => {
        const event = e as MouseEvent;
        const target = e.target as SVGElement;

        // Get data from attributes
        const dateStr = target.getAttribute('data-date') || '';
        const count = target.getAttribute('data-count') || '0';
        const names = target.getAttribute('data-names')?.split('|') || [];

        // Format date
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateFormatted = `${d}.${m}.${y}`;

        // Build tooltip content
        let content = `<div class="radcal-tooltip-date">${dateFormatted}</div>`;
        if (names.length > 0) {
          content += '<div class="radcal-tooltip-entries">';
          for (const name of names.slice(0, 5)) {
            content += `<div class="radcal-tooltip-entry">${name}</div>`;
          }
          if (names.length > 5) {
            content += `<div class="radcal-tooltip-more">+${names.length - 5} more</div>`;
          }
          content += '</div>';
        }

        tooltipEl.innerHTML = content;
        tooltipEl.style.display = 'block';

        // Position relative to container
        const rect = this.containerEl.getBoundingClientRect();
        tooltipEl.style.left = `${event.clientX - rect.left + 15}px`;
        tooltipEl.style.top = `${event.clientY - rect.top + 15}px`;
      });

      arc.addEventListener('mouseleave', () => {
        tooltipEl.style.display = 'none';
      });
    });
  }
}

/**
 * Main processor for radcal codeblocks
 */
export class RadcalBlockProcessor {
  constructor(
    private readonly app: App,
    private readonly service: CalendarService,
    private readonly openFile: (path: string) => Promise<void>
  ) {}

  /**
   * Process a radcal codeblock
   */
  process(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    try {
      // Parse configuration
      const config = parseRadcalConfig(source);

      // Create container
      const container = el.createDiv({ cls: 'radcal-block' });

      // Create render child for lifecycle management and live updates
      const renderChild = new RadcalRenderChild(
        container,
        this.app,
        this.service,
        config,
        this.openFile
      );

      // Register with context for cleanup
      ctx.addChild(renderChild);

    } catch (error) {
      // Show error message
      el.createDiv({
        cls: 'radcal-error',
        text: `Radcal Error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
}
