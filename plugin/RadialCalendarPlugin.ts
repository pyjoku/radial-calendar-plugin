/**
 * RadialCalendarPlugin - Main plugin class for Obsidian
 *
 * This is the entry point for the Radial Calendar plugin.
 * It handles plugin lifecycle and integrates with Obsidian.
 */

import { Plugin, WorkspaceLeaf, TFile, Notice, Menu } from 'obsidian';
import { CalendarService } from '../application/services/CalendarService';
import { RadialCalendarView, VIEW_TYPE_RADIAL_CALENDAR } from '../presentation/views/RadialCalendarView';
import { LocalCalendarView, VIEW_TYPE_LOCAL_CALENDAR } from '../presentation/views/LocalCalendarView';
import { MementoMoriView, VIEW_TYPE_MEMENTO_MORI } from '../presentation/views/MementoMoriView';
import { RadcalBlockProcessor } from '../presentation/codeblock/RadcalBlockProcessor';
import { DayBlockProcessor } from '../presentation/codeblock/DayBlockProcessor';
import { RadialCalendarSettingTab } from './RadialCalendarSettingTab';
import { GoogleCalendarSync, SyncResult } from '../infrastructure/sync/GoogleCalendarSync';
import { createRadialCalendarBasesView } from '../presentation/bases/RadialCalendarBasesView';
import { ColorSuggesterModal } from '../presentation/components/ColorSuggesterModal';
import { RadcalPropertyModal } from '../presentation/components/PropertyModal';
import type { RadialCalendarSettings, LinearCalendarSettings, LocalDate } from '../core/domain/types';
import { DEFAULT_RADIAL_SETTINGS, createLocalDate, createGlobalRing } from '../core/domain/types';

export class RadialCalendarPlugin extends Plugin {
  private service: CalendarService | null = null;
  private calendarSync: GoogleCalendarSync | null = null;
  settings: RadialCalendarSettings = { ...DEFAULT_RADIAL_SETTINGS };

  async onload(): Promise<void> {
    // Load settings
    await this.loadSettings();

    // Initialize service with settings
    const legacySettings: LinearCalendarSettings = {
      calendarWidth: 'fit',
      dateProperties: ['date', 'created', 'due'],
      endDateProperties: ['endDate', 'end', 'until'],
      datePriority: 'filename',
      dailyNoteFormat: this.settings.periodicNotesFormat.daily,
      dailyNoteFolder: this.settings.dailyNoteFolder,
      showMultiDayBars: true,
      showWeekendHighlight: true,
      anniversaryDateProperties: this.settings.anniversaryDateProperties || [],
    };
    this.service = new CalendarService(this.app, legacySettings);
    await this.service.initialize();

    // Register view
    this.registerView(VIEW_TYPE_RADIAL_CALENDAR, (leaf) => {
      const view = new RadialCalendarView(leaf);
      view.initialize({
        service: this.service!,
        openFile: async (path: string) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(file);
          }
        },
        settings: this.settings,
        onSettingsChange: async (settings: RadialCalendarSettings) => {
          this.settings = settings;
          await this.saveSettings();
        },
      });
      return view;
    });

    // Register local calendar view
    this.registerView(VIEW_TYPE_LOCAL_CALENDAR, (leaf) => {
      const view = new LocalCalendarView(leaf);
      view.initialize({
        service: this.service!,
        settings: this.settings,
        getActiveFileDate: () => this.getActiveFileDate(),
        openFile: async (path: string) => {
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            await this.app.workspace.getLeaf().openFile(file);
          }
        },
      });
      return view;
    });

    // Register Memento Mori view
    this.registerView(VIEW_TYPE_MEMENTO_MORI, (leaf) => {
      return new MementoMoriView(
        leaf,
        this.settings.mementoMori,
        this.settings.birthDate || `${this.settings.birthYear}-01-01`,
        this.settings.expectedLifespan,
        this.settings.dailyNoteFolder || '',
        this.settings.periodicNotesFormat?.daily || 'YYYY-MM-DD'
      );
    });

    // Register radcal codeblock processor
    const blockProcessor = new RadcalBlockProcessor(
      this.app,
      this.service!,
      async (path: string) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          await this.app.workspace.getLeaf().openFile(file);
        }
      }
    );
    this.registerMarkdownCodeBlockProcessor(
      'radcal',
      (source, el, ctx) => blockProcessor.process(source, el, ctx)
    );

    // Register day view codeblock processor
    const dayBlockProcessor = new DayBlockProcessor(this.app);
    this.registerMarkdownCodeBlockProcessor(
      'radcal-day',
      (source, el, ctx) => dayBlockProcessor.process(source, el, ctx)
    );

    // Register Bases view (Obsidian 1.10+)
    this.registerBasesViewIfAvailable();

    // Add settings tab
    this.addSettingTab(new RadialCalendarSettingTab(this.app, this));

    // Add ribbon icon
    this.addRibbonIcon('circle', 'Open Radial Calendar', () => {
      this.activateView();
    });

    // Add ribbon icon for local calendar
    this.addRibbonIcon('clock', 'Open Local Calendar', () => {
      this.activateLocalCalendarView();
    });

    // Add ribbon icon for Memento Mori
    this.addRibbonIcon('hourglass', 'Open Memento Mori', () => {
      this.activateMementoMoriView();
    });

    // Add command
    this.addCommand({
      id: 'open-radial-calendar',
      name: 'Open Radial Calendar',
      callback: () => {
        this.activateView();
      },
    });

    // Add command for local calendar
    this.addCommand({
      id: 'open-local-calendar',
      name: 'Open Local Calendar (Sidebar)',
      callback: () => {
        this.activateLocalCalendarView();
      },
    });

    // Add command for Memento Mori
    this.addCommand({
      id: 'open-memento-mori',
      name: 'Open Memento Mori View',
      callback: () => {
        this.activateMementoMoriView();
      },
    });

    // Initialize Google Calendar sync
    this.calendarSync = new GoogleCalendarSync(this.app);

    // Add sync command
    this.addCommand({
      id: 'sync-google-calendars',
      name: 'Sync Google Calendars',
      callback: () => {
        this.syncAllCalendars();
      },
    });

    // Add Insert Color command
    this.addCommand({
      id: 'insert-color',
      name: 'Insert Color',
      editorCallback: (editor) => {
        new ColorSuggesterModal(this.app, (color) => {
          editor.replaceSelection(color);
        }).open();
      },
    });

    // Add Set Color command (updates frontmatter)
    this.addCommand({
      id: 'set-color',
      name: 'Set Color',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') return false;
        if (checking) return true;

        const currentColor = this.getCurrentProperty(file, 'radcal-color');
        new RadcalPropertyModal(this.app, 'color', (color) => {
          this.updateFrontmatter(file, 'radcal-color', color as string);
        }, currentColor).open();
      },
    });

    // Add Set Pattern command
    this.addCommand({
      id: 'set-pattern',
      name: 'Set Pattern',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') return false;
        if (checking) return true;

        const currentPattern = this.getCurrentProperty(file, 'radcal-pattern');
        new RadcalPropertyModal(this.app, 'pattern', (pattern) => {
          this.updateFrontmatter(file, 'radcal-pattern', pattern as string);
        }, currentPattern).open();
      },
    });

    // Add Set Opacity command
    this.addCommand({
      id: 'set-opacity',
      name: 'Set Opacity',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') return false;
        if (checking) return true;

        const currentOpacity = this.getCurrentProperty(file, 'radcal-opacity');
        new RadcalPropertyModal(this.app, 'opacity', (opacity) => {
          this.updateFrontmatter(file, 'radcal-opacity', opacity as number);
        }, currentOpacity).open();
      },
    });

    // Add File Menu entries for radcal properties
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;

        menu.addSeparator();

        menu.addItem((item) => {
          item
            .setTitle('Radcal: Set Color')
            .setIcon('palette')
            .onClick(() => {
              const currentColor = this.getCurrentProperty(file, 'radcal-color');
              new RadcalPropertyModal(this.app, 'color', (color) => {
                this.updateFrontmatter(file, 'radcal-color', color as string);
              }, currentColor).open();
            });
        });

        menu.addItem((item) => {
          item
            .setTitle('Radcal: Set Pattern')
            .setIcon('shapes')
            .onClick(() => {
              const currentPattern = this.getCurrentProperty(file, 'radcal-pattern');
              new RadcalPropertyModal(this.app, 'pattern', (pattern) => {
                this.updateFrontmatter(file, 'radcal-pattern', pattern as string);
              }, currentPattern).open();
            });
        });

        menu.addItem((item) => {
          item
            .setTitle('Radcal: Set Opacity')
            .setIcon('blend')
            .onClick(() => {
              const currentOpacity = this.getCurrentProperty(file, 'radcal-opacity');
              new RadcalPropertyModal(this.app, 'opacity', (opacity) => {
                this.updateFrontmatter(file, 'radcal-opacity', opacity as number);
              }, currentOpacity).open();
            });
        });
      })
    );

    // Auto-sync on start for calendars with syncOnStart enabled
    this.syncOnStart();

    // Start auto-sync intervals
    this.startAutoSync();
  }

  async onunload(): Promise<void> {
    this.calendarSync?.stopAutoSync();
    this.calendarSync = null;
    this.service?.destroy();
    this.service = null;
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_RADIAL_SETTINGS, data);

    // Migration: Add Global Ring if it doesn't exist
    const hasGlobalRing = this.settings.rings.some(r => r.ringType === 'global');
    if (!hasGlobalRing) {
      // Insert Global Ring at position 0 (outermost), shift other rings
      const globalRing = createGlobalRing(0);
      this.settings.rings = this.settings.rings.map(r => ({ ...r, order: r.order + 1 }));
      this.settings.rings.unshift(globalRing);
      await this.saveData(this.settings);
    }

    // Migration: Add Memento Mori settings if they don't exist
    if (!this.settings.mementoMori) {
      const { DEFAULT_MEMENTO_MORI_SETTINGS } = await import('../core/domain/types');
      this.settings.mementoMori = DEFAULT_MEMENTO_MORI_SETTINGS;
      await this.saveData(this.settings);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_RADIAL_CALENDAR);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      // Open in main area (center), not sidebar
      leaf = workspace.getLeaf('tab');
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_RADIAL_CALENDAR,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private getActiveFileDate(): LocalDate | null {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) return null;

    // Try to parse date from filename (YYYY-MM-DD)
    const match = activeFile.basename.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return createLocalDate(
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3], 10)
      );
    }
    return null;
  }

  private async activateLocalCalendarView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_LOCAL_CALENDAR)[0] ?? null;

    if (!leaf) {
      // Open in right sidebar
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_LOCAL_CALENDAR,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private async activateMementoMoriView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_MEMENTO_MORI)[0] ?? null;

    if (!leaf) {
      // Open in right sidebar
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_MEMENTO_MORI,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * Sync all enabled calendars manually
   */
  async syncAllCalendars(): Promise<void> {
    if (!this.calendarSync) return;

    const enabledSources = this.settings.calendarSources.filter(s => s.enabled && s.url);
    if (enabledSources.length === 0) {
      new Notice('No calendar sources configured');
      return;
    }

    new Notice(`Syncing ${enabledSources.length} calendar(s)...`);

    const results = await this.calendarSync.syncAllCalendars(enabledSources);
    this.showSyncResults(results);

    // Update lastSync timestamps
    for (const result of results) {
      if (result.success) {
        const source = this.settings.calendarSources.find(s => s.id === result.calendarId);
        if (source) {
          source.lastSync = Date.now();
        }
      }
    }
    await this.saveSettings();

    // Refresh calendar data
    await this.service?.initialize();
  }

  /**
   * Sync calendars that have syncOnStart enabled
   */
  private async syncOnStart(): Promise<void> {
    if (!this.calendarSync) return;

    const onStartSources = this.settings.calendarSources.filter(
      s => s.enabled && s.url && s.syncOnStart
    );

    if (onStartSources.length === 0) return;

    // Delay slightly to let Obsidian fully initialize
    setTimeout(async () => {
      const results = await this.calendarSync!.syncAllCalendars(onStartSources);

      // Update lastSync timestamps
      for (const result of results) {
        if (result.success) {
          const source = this.settings.calendarSources.find(s => s.id === result.calendarId);
          if (source) {
            source.lastSync = Date.now();
          }
        }
      }
      await this.saveSettings();

      // Show summary
      const successCount = results.filter(r => r.success).length;
      const totalEvents = results.reduce((sum, r) => sum + r.eventsCreated + r.eventsUpdated, 0);
      if (totalEvents > 0) {
        new Notice(`Calendar sync: ${totalEvents} events updated from ${successCount} calendar(s)`);
      }

      // Refresh calendar data
      await this.service?.initialize();
    }, 2000);
  }

  /**
   * Start auto-sync intervals for calendars
   */
  private startAutoSync(): void {
    if (!this.calendarSync) return;

    const intervalSources = this.settings.calendarSources.filter(
      s => s.enabled && s.url && s.syncIntervalMinutes > 0
    );

    if (intervalSources.length === 0) return;

    this.calendarSync.startAutoSync(intervalSources, async (result) => {
      // Update lastSync timestamp
      if (result.success) {
        const source = this.settings.calendarSources.find(s => s.id === result.calendarId);
        if (source) {
          source.lastSync = Date.now();
          await this.saveSettings();
        }
      }

      // Show notification if events were updated
      const totalUpdated = result.eventsCreated + result.eventsUpdated;
      if (totalUpdated > 0) {
        new Notice(`${result.calendarName}: ${totalUpdated} events synced`);
      }

      // Refresh calendar data
      await this.service?.initialize();
    });
  }

  /**
   * Show sync results notification
   */
  private showSyncResults(results: SyncResult[]): void {
    const successCount = results.filter(r => r.success).length;
    const totalCreated = results.reduce((sum, r) => sum + r.eventsCreated, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.eventsUpdated, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    let message = `Sync complete: ${successCount}/${results.length} calendars`;
    if (totalCreated > 0) message += `, ${totalCreated} created`;
    if (totalUpdated > 0) message += `, ${totalUpdated} updated`;
    if (totalErrors > 0) message += `, ${totalErrors} errors`;

    new Notice(message);

    // Log errors to console
    for (const result of results) {
      if (result.errors.length > 0) {
        console.warn(`Calendar sync errors (${result.calendarName}):`, result.errors);
      }
    }
  }

  /**
   * Gets the current value of a frontmatter property
   */
  private getCurrentProperty(file: TFile, key: string): string | number | undefined {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) return undefined;

    const value = frontmatter[key];
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    return undefined;
  }

  /**
   * Updates a frontmatter property in a file
   */
  private async updateFrontmatter(file: TFile, key: string, value: string | number): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm[key] = value;
      });
      new Notice(`Set ${key} to ${value}`);
    } catch (error) {
      console.error('Failed to update frontmatter:', error);
      new Notice(`Failed to update ${key}`);
    }
  }

  /**
   * Register Bases view if the API is available (Obsidian 1.10+)
   */
  private registerBasesViewIfAvailable(): void {
    // Check if registerBasesView API exists
    if (typeof this.registerBasesView !== 'function') {
      console.log('Radial Calendar: Bases API not available (requires Obsidian 1.10+)');
      return;
    }

    try {
      const registered = this.registerBasesView('radial-calendar', {
        name: 'Radial Calendar',
        icon: 'circle',
        factory: createRadialCalendarBasesView,
        options: () => [
          {
            type: 'text',
            key: 'dateProperty',
            displayName: 'Date property',
            placeholder: 'e.g. date, birthday, due',
            default: 'date',
          },
          {
            type: 'dropdown',
            key: 'color',
            displayName: 'Color',
            default: 'blue',
            options: {
              'blue': 'Blue',
              'green': 'Green',
              'red': 'Red',
              'purple': 'Purple',
              'orange': 'Orange',
              'teal': 'Teal',
              'pink': 'Pink',
              'yellow': 'Yellow',
            },
          },
        ],
      });

      if (registered) {
        console.log('Radial Calendar: Bases view registered successfully');
      }
    } catch (error) {
      console.warn('Radial Calendar: Failed to register Bases view:', error);
    }
  }
}
