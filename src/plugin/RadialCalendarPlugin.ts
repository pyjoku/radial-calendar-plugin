/**
 * RadialCalendarPlugin - Main plugin class for Obsidian
 *
 * This is the entry point for the Radial Calendar plugin.
 * It handles plugin lifecycle and integrates with Obsidian.
 */

import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { CalendarService } from '../application/services/CalendarService';
import { RadialCalendarView, VIEW_TYPE_RADIAL_CALENDAR } from '../presentation/views/RadialCalendarView';
import { LocalCalendarView, VIEW_TYPE_LOCAL_CALENDAR } from '../presentation/views/LocalCalendarView';
import { RadialCalendarSettingTab } from './RadialCalendarSettingTab';
import type { RadialCalendarSettings, LinearCalendarSettings, LocalDate } from '../core/domain/types';
import { DEFAULT_RADIAL_SETTINGS, createLocalDate } from '../core/domain/types';

export class RadialCalendarPlugin extends Plugin {
  private service: CalendarService | null = null;
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
  }

  async onunload(): Promise<void> {
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
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_LOCAL_CALENDAR)[0];

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
}
