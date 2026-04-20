/**
 * RadialCalendarSettingTab - Settings UI for the Radial Calendar Plugin
 *
 * Flat settings page with four sections:
 * - Sidebar (mode + custom codeblock)
 * - Daily Notes (folder + date format)
 * - Life View (birth date + expected lifespan)
 * - Calendar Sync (Google Calendar / iCal sources)
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import type { Plugin } from 'obsidian';
import type {
  RadialCalendarSettings,
  CalendarSourceConfig,
  RingColorName,
} from '../core/domain/types';
import { RING_COLORS } from '../core/domain/types';
import { FolderSuggest } from '../presentation/components/FolderSuggest';

/**
 * Plugin interface expected by the settings tab
 */
interface RadialCalendarPlugin extends Plugin {
  settings: RadialCalendarSettings;
  saveSettings(): Promise<void>;
}

export class RadialCalendarSettingTab extends PluginSettingTab {
  plugin: RadialCalendarPlugin;

  constructor(app: App, plugin: RadialCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.createSidebarSection(containerEl);
    this.createDailyNotesSection(containerEl);
    this.createLifeViewSection(containerEl);
    this.createCalendarSyncSection(containerEl);
  }

  // ---------------------------------------------------------------------------
  // Section 1: Sidebar
  // ---------------------------------------------------------------------------

  private createSidebarSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Sidebar' });

    // Custom codeblock setting — created first so the dropdown can reference it
    const codeblockSetting = new Setting(containerEl)
      .setName('Custom Codeblock')
      .setDesc('Paste any radcal codeblock here. Test it first in a note or Bases view.');

    const codeblockWrapper = codeblockSetting.controlEl.createDiv();
    const textarea = codeblockWrapper.createEl('textarea', {
      attr: {
        rows: '8',
        style: 'width:100%;font-family:monospace;font-size:12px',
      },
    });
    textarea.value = this.plugin.settings.customCodeblock ?? '';
    textarea.addEventListener('input', async () => {
      this.plugin.settings.customCodeblock = textarea.value;
      await this.plugin.saveSettings();
    });

    // Set initial visibility
    codeblockSetting.settingEl.style.display =
      this.plugin.settings.sidebarMode === 'custom' ? '' : 'none';

    // Mode dropdown (declared after codeblockSetting so onChange can reference it)
    new Setting(containerEl)
      .setName('Mode')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('calendar', 'Calendar')
          .addOption('custom', 'Custom')
          .setValue(this.plugin.settings.sidebarMode ?? 'calendar')
          .onChange(async (value) => {
            this.plugin.settings.sidebarMode = value as 'calendar' | 'custom';
            await this.plugin.saveSettings();
            codeblockSetting.settingEl.style.display = value === 'custom' ? '' : 'none';
          });
      });

    // Move the mode dropdown before the codeblock setting in the DOM
    containerEl.insertBefore(
      containerEl.lastElementChild as HTMLElement,
      codeblockSetting.settingEl
    );
  }

  // ---------------------------------------------------------------------------
  // Section 2: Daily Notes
  // ---------------------------------------------------------------------------

  private createDailyNotesSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Daily Notes' });

    new Setting(containerEl)
      .setName('Folder')
      .setDesc('Folder where daily notes are created')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Journal/Daily')
          .setValue(this.plugin.settings.dailyNoteFolder ?? '')
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFolder = value;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    new Setting(containerEl)
      .setName('Date Format')
      .setDesc('Filename format for daily notes (e.g. YYYY-MM-DD)')
      .addText((text) => {
        text
          .setPlaceholder('YYYY-MM-DD')
          .setValue(this.plugin.settings.periodicNotesFormat?.daily ?? '')
          .onChange(async (value) => {
            this.plugin.settings.periodicNotesFormat = {
              ...this.plugin.settings.periodicNotesFormat,
              daily: value,
            };
            await this.plugin.saveSettings();
          });
      });
  }

  // ---------------------------------------------------------------------------
  // Section 3: Life View
  // ---------------------------------------------------------------------------

  private createLifeViewSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Life View' });

    new Setting(containerEl)
      .setName('Birth Date')
      .setDesc('Your birth date (YYYY-MM-DD). Used for Life View and Memento Mori.')
      .addText((text) => {
        text
          .setPlaceholder('YYYY-MM-DD')
          .setValue(this.plugin.settings.birthDate ?? '')
          .onChange(async (value) => {
            this.plugin.settings.birthDate = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Expected Lifespan')
      .setDesc('Expected lifespan in years')
      .addText((text) => {
        text
          .setPlaceholder('85')
          .setValue(String(this.plugin.settings.expectedLifespan ?? 85))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.expectedLifespan = parsed;
              await this.plugin.saveSettings();
            }
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text.inputEl.max = '150';
      });
  }

  // ---------------------------------------------------------------------------
  // Section 4: Calendar Sync
  // ---------------------------------------------------------------------------

  private createCalendarSyncSection(containerEl: HTMLElement): void {
    containerEl.createEl('h2', { text: 'Calendar Sync' });

    const sources = this.plugin.settings.calendarSources || [];

    // Render existing calendar sources
    sources.forEach((source, index) => {
      this.createCalendarSourceSettings(containerEl, source, index);
    });

    // Add calendar source button
    new Setting(containerEl)
      .setName('Add Calendar Source')
      .setDesc('Add a new Google Calendar or iCal source')
      .addButton((button) => {
        button
          .setButtonText('+ Add Calendar')
          .setCta()
          .onClick(async () => {
            const newSource: CalendarSourceConfig = {
              id: `gcal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: 'New Calendar',
              url: '',
              folder: 'Calendar/Google',
              color: 'blue',
              syncOnStart: true,
              syncIntervalMinutes: 0,
              enabled: true,
              showAsRing: true,
              showSpanningArcs: true,
            };
            if (!this.plugin.settings.calendarSources) {
              this.plugin.settings.calendarSources = [];
            }
            this.plugin.settings.calendarSources.push(newSource);
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // Help text
    const helpDiv = containerEl.createDiv({ cls: 'setting-item-description' });
    helpDiv.innerHTML = `
      <p style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
        <strong>How to get your Google Calendar URL:</strong><br>
        1. Open Google Calendar → Settings → Calendar Settings<br>
        2. Select your calendar → Integrate calendar<br>
        3. Copy "Secret address in iCal format"<br><br>
        <em>Note: This URL is private and contains a secret key. Never share it publicly.</em>
      </p>
    `;

    // Security notice about secrets.json
    const securityDiv = containerEl.createDiv({ cls: 'setting-item-description' });
    const p = securityDiv.createEl('p');
    p.style.fontSize = '11px';
    p.style.color = 'var(--text-warning)';
    p.style.marginTop = '4px';
    p.setText('⚠️ URLs werden in secrets.json gespeichert (nicht in data.json). Für Git: .obsidian/plugins/radial-calendar-plugin/secrets.json in .gitignore eintragen.');
  }

  /**
   * Creates settings for a single calendar source (collapsible)
   */
  private createCalendarSourceSettings(
    containerEl: HTMLElement,
    source: CalendarSourceConfig,
    index: number
  ): void {
    // Use native <details> for collapsible behavior
    const details = containerEl.createEl('details', { cls: 'radcal-calendar-details' });

    // Summary (clickable header)
    const summary = details.createEl('summary', { cls: 'radcal-calendar-summary' });

    // Color swatch
    const colorSwatch = summary.createSpan({ cls: 'radcal-calendar-swatch' });
    colorSwatch.style.backgroundColor = RING_COLORS[source.color];

    // Calendar name
    const titleEl = summary.createSpan({
      text: source.name || `Calendar ${index + 1}`,
      cls: 'radcal-calendar-title',
    });

    // Folder info
    if (source.folder) {
      summary.createSpan({ text: ` — ${source.folder}`, cls: 'radcal-calendar-folder' });
    }

    // Status indicator
    const statusEl = summary.createSpan({ cls: 'radcal-calendar-status' });
    statusEl.textContent = source.enabled ? '●' : '○';
    statusEl.style.color = source.enabled ? 'var(--text-success)' : 'var(--text-muted)';
    statusEl.setAttribute('title', source.enabled ? 'Enabled' : 'Disabled');

    // Content container
    const sourceContainer = details.createDiv({ cls: 'radcal-calendar-content' });

    // Name
    new Setting(sourceContainer)
      .setName('Name')
      .setDesc('Display name for this calendar')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Work Calendar')
          .setValue(source.name)
          .onChange(async (value) => {
            source.name = value;
            await this.plugin.saveSettings();
            titleEl.textContent = value || `Calendar ${index + 1}`;
          });
      });

    // URL (with hidden text)
    new Setting(sourceContainer)
      .setName('iCal URL')
      .setDesc('Private iCal/ICS URL (from Google Calendar settings)')
      .addText((text) => {
        text
          .setPlaceholder('https://calendar.google.com/calendar/ical/...')
          .setValue(source.url)
          .onChange(async (value) => {
            source.url = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = '100%';
        text.inputEl.type = 'password';
      });

    // Target folder
    new Setting(sourceContainer)
      .setName('Target Folder')
      .setDesc('Where synced events will be saved')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Calendar/Google/Work')
          .setValue(source.folder)
          .onChange(async (value) => {
            source.folder = value;
            await this.plugin.saveSettings();
            const folderEl = summary.querySelector('.radcal-calendar-folder');
            if (folderEl) {
              folderEl.textContent = value ? ` — ${value}` : '';
            }
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    // Color
    new Setting(sourceContainer)
      .setName('Color')
      .addDropdown((dropdown) => {
        Object.keys(RING_COLORS).forEach((colorName) => {
          dropdown.addOption(colorName, this.formatColorName(colorName));
        });
        dropdown
          .setValue(source.color)
          .onChange(async (value) => {
            source.color = value as RingColorName;
            await this.plugin.saveSettings();
            colorSwatch.style.backgroundColor = RING_COLORS[value as RingColorName];
          });
      });

    // Enabled toggle
    new Setting(sourceContainer)
      .setName('Enabled')
      .setDesc('Enable or disable this calendar source')
      .addToggle((toggle) => {
        toggle
          .setValue(source.enabled)
          .onChange(async (value) => {
            source.enabled = value;
            await this.plugin.saveSettings();
            statusEl.textContent = value ? '●' : '○';
            statusEl.style.color = value ? 'var(--text-success)' : 'var(--text-muted)';
          });
      });

    // Sync on start
    new Setting(sourceContainer)
      .setName('Sync on Start')
      .setDesc('Automatically sync when Obsidian starts')
      .addToggle((toggle) => {
        toggle
          .setValue(source.syncOnStart)
          .onChange(async (value) => {
            source.syncOnStart = value;
            await this.plugin.saveSettings();
          });
      });

    // Sync interval
    new Setting(sourceContainer)
      .setName('Auto-sync Interval')
      .setDesc('How often to sync (0 = manual only)')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('0', 'Manual only')
          .addOption('15', 'Every 15 minutes')
          .addOption('30', 'Every 30 minutes')
          .addOption('60', 'Every hour')
          .addOption('360', 'Every 6 hours')
          .addOption('1440', 'Daily')
          .setValue(String(source.syncIntervalMinutes))
          .onChange(async (value) => {
            source.syncIntervalMinutes = parseInt(value, 10);
            await this.plugin.saveSettings();
          });
      });

    // Show as Ring toggle
    new Setting(sourceContainer)
      .setName('Show as Ring')
      .setDesc('Display this calendar as a ring in the annual view')
      .addToggle((toggle) => {
        toggle
          .setValue(source.showAsRing ?? true)
          .onChange(async (value) => {
            source.showAsRing = value;
            await this.plugin.saveSettings();
          });
      });

    // Spanning Arcs toggle
    new Setting(sourceContainer)
      .setName('Spanning Arcs')
      .setDesc('Show multi-day events as continuous arcs')
      .addToggle((toggle) => {
        toggle
          .setValue(source.showSpanningArcs ?? true)
          .onChange(async (value) => {
            source.showSpanningArcs = value;
            await this.plugin.saveSettings();
          });
      });

    // Last sync info
    if (source.lastSync) {
      const lastSyncDate = new Date(source.lastSync);
      sourceContainer.createDiv({
        cls: 'setting-item-description',
        text: `Last synced: ${lastSyncDate.toLocaleString()}`,
      });
    }

    // Delete button
    new Setting(sourceContainer)
      .addButton((button) => {
        button
          .setButtonText('Delete Calendar')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.calendarSources.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private formatColorName(colorName: string): string {
    return colorName.charAt(0).toUpperCase() + colorName.slice(1).replace(/-/g, ' ');
  }
}
