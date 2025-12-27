/**
 * RadialCalendarPlugin - Main plugin class for Obsidian
 *
 * This is the entry point for the Radial Calendar plugin.
 * It handles plugin lifecycle and integrates with Obsidian.
 */

import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import { CalendarService } from '../application/services/CalendarService';
import { RadialCalendarView, VIEW_TYPE_RADIAL_CALENDAR } from '../presentation/views/RadialCalendarView';
import type { LinearCalendarSettings } from '../core/domain/types';

const DEFAULT_SETTINGS: LinearCalendarSettings = {
  dateProperties: ['date', 'created', 'due'],
  endDateProperties: ['endDate', 'end', 'until'],
  datePriority: 'filename',
  dailyNoteFormat: 'YYYY-MM-DD',
  dailyNoteFolder: '',
};

export class RadialCalendarPlugin extends Plugin {
  private service: CalendarService | null = null;
  private settings: LinearCalendarSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    // Load settings
    await this.loadSettings();

    // Initialize service
    this.service = new CalendarService(this.app, this.settings);
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

  private async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
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
