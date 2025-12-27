/**
 * RadialCalendarPlugin - Main plugin class for Obsidian
 *
 * This is the entry point for the Radial Calendar plugin.
 * It handles plugin lifecycle and integrates with Obsidian.
 */

import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { CalendarService } from '../application/services/CalendarService';
import { RadialCalendarView, VIEW_TYPE_RADIAL_CALENDAR } from '../presentation/views/RadialCalendarView';
import { LocalCalendarView, VIEW_TYPE_LOCAL_CALENDAR } from '../presentation/views/LocalCalendarView';
import { RadcalBlockProcessor } from '../presentation/codeblock/RadcalBlockProcessor';
import { RadialCalendarSettingTab } from './RadialCalendarSettingTab';
import { GoogleCalendarSync, SyncResult } from '../infrastructure/sync/GoogleCalendarSync';
import type { RadialCalendarSettings, LinearCalendarSettings, LocalDate } from '../core/domain/types';
import { DEFAULT_RADIAL_SETTINGS, createLocalDate } from '../core/domain/types';

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
}
