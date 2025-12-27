/**
 * RadialCalendarPlugin - Main plugin class for Obsidian
 *
 * This is the entry point for the Radial Calendar plugin.
 * It handles plugin lifecycle and integrates with Obsidian.
 */

import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { CalendarService } from '../application/services/CalendarService';
import { RadialCalendarView, VIEW_TYPE_RADIAL_CALENDAR } from '../presentation/views/RadialCalendarView';
import { RadialCalendarSettingTab } from './RadialCalendarSettingTab';
import type { RadialCalendarSettings, LinearCalendarSettings } from '../core/domain/types';
import { DEFAULT_RADIAL_SETTINGS } from '../core/domain/types';

export class RadialCalendarPlugin extends Plugin {
  private service: CalendarService | null = null;
  settings: RadialCalendarSettings = { ...DEFAULT_RADIAL_SETTINGS };

  async onload(): Promise<void> {
    // Load settings
    await this.loadSettings();

    // Initialize service with legacy settings for now
    const legacySettings: LinearCalendarSettings = {
      dateProperties: ['date', 'created', 'due'],
      endDateProperties: ['endDate', 'end', 'until'],
      datePriority: 'filename',
      dailyNoteFormat: this.settings.periodicNotesFormat.daily,
      dailyNoteFolder: '',
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
      });
      return view;
    });

    // Add settings tab
    this.addSettingTab(new RadialCalendarSettingTab(this.app, this));

    // Add ribbon icon
    this.addRibbonIcon('circle', 'Open Radial Calendar', () => {
      this.activateView();
    });

    // Add command
    this.addCommand({
      id: 'open-radial-calendar',
      name: 'Open Radial Calendar',
      callback: () => {
        this.activateView();
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
}
