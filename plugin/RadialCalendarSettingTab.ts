/**
 * RadialCalendarSettingTab - Settings UI for the Radial Calendar Plugin
 *
 * Provides a settings interface with sections for:
 * - View mode selection (annual/life)
 * - Life view settings (birth year, expected lifespan)
 * - Ring configuration (add, edit, delete rings)
 * - Template creation
 * - Center display mode selection
 */

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { Plugin } from 'obsidian';
import type {
  RadialCalendarSettings,
  RingConfig,
  RingColorName,
  AnnualSegmentType,
  OuterSegmentConfig,
  LifeActConfig,
  CalendarSourceConfig,
  PresetConfig,
  PatternName,
} from '../core/domain/types';
import {
  DEFAULT_RADIAL_SETTINGS,
  createDefaultRing,
  RING_COLORS,
  LIFE_PHASE_TEMPLATE,
  SPANNING_ARC_TEMPLATE,
  ANNIVERSARY_TEMPLATE,
  PATTERN_NAMES,
  DEFAULT_PRESETS,
} from '../core/domain/types';
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
  private activeTab: string = 'general';

  constructor(app: App, plugin: RadialCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Version Header
    this.createVersionHeader(containerEl);

    // Tab Navigation
    this.createTabNavigation(containerEl);

    // Tab Content Container
    const contentEl = containerEl.createDiv({ cls: 'radcal-settings-content' });
    this.renderActiveTab(contentEl);
  }

  /**
   * Creates the tab navigation bar
   */
  private createTabNavigation(containerEl: HTMLElement): void {
    const tabs = [
      { id: 'general', label: 'Allgemein' },
      { id: 'lifeview', label: 'Life View' },
      { id: 'rings', label: 'Ringe' },
      { id: 'sync', label: 'Sync' },
      { id: 'advanced', label: 'Erweitert' },
      { id: 'help', label: 'Hilfe' },
    ];

    const tabBar = containerEl.createDiv({ cls: 'radcal-settings-tabs' });

    for (const tab of tabs) {
      const tabBtn = tabBar.createEl('button', {
        text: tab.label,
        cls: `radcal-settings-tab ${this.activeTab === tab.id ? 'is-active' : ''}`,
      });
      tabBtn.addEventListener('click', () => {
        this.activeTab = tab.id;
        this.display();
      });
    }
  }

  /**
   * Renders the content for the active tab
   */
  private renderActiveTab(containerEl: HTMLElement): void {
    switch (this.activeTab) {
      case 'general':
        this.renderGeneralTab(containerEl);
        break;
      case 'lifeview':
        this.renderLifeViewTab(containerEl);
        break;
      case 'rings':
        this.renderRingsTab(containerEl);
        break;
      case 'sync':
        this.renderSyncTab(containerEl);
        break;
      case 'advanced':
        this.renderAdvancedTab(containerEl);
        break;
      case 'help':
        this.renderHelpTab(containerEl);
        break;
    }
  }

  /**
   * Sync Tab: Google Calendar and external calendar sources
   */
  private renderSyncTab(containerEl: HTMLElement): void {
    this.createCalendarSyncSection(containerEl);
  }

  /**
   * General Tab: View Mode, Daily Notes, Templates
   */
  private renderGeneralTab(containerEl: HTMLElement): void {
    this.createViewModeSection(containerEl);
    this.createDailyNotesSection(containerEl);
    this.createTemplateSection(containerEl);
  }

  /**
   * Life View Tab: Birth settings, Life Phases folder
   */
  private renderLifeViewTab(containerEl: HTMLElement): void {
    this.createLifeViewSection(containerEl);
  }

  /**
   * Rings Tab: Ring Configuration
   */
  private renderRingsTab(containerEl: HTMLElement): void {
    this.createRingConfigSection(containerEl);
  }

  /**
   * Advanced Tab: Presets, Outer Segments, Center Display, Migration
   */
  private renderAdvancedTab(containerEl: HTMLElement): void {
    this.createPresetsSection(containerEl);
    this.createOuterSegmentsSection(containerEl);
    this.createCenterDisplaySection(containerEl);
    this.createMigrationSection(containerEl);
  }

  /**
   * Creates the version header with plugin info
   */
  private createVersionHeader(containerEl: HTMLElement): void {
    const headerEl = containerEl.createDiv({ cls: 'radcal-settings-header' });

    // Title and version
    const titleEl = headerEl.createEl('div', { cls: 'radcal-settings-title' });
    titleEl.createEl('span', { text: 'Radial Calendar', cls: 'radcal-settings-name' });

    const version = (this.plugin as any).manifest?.version || 'unknown';
    titleEl.createEl('span', { text: `v${version}`, cls: 'radcal-settings-version' });

    // Separator
    containerEl.createEl('hr', { cls: 'radcal-settings-separator' });
  }

  /**
   * Creates the view mode selection section
   */
  private createViewModeSection(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('View Mode')
      .setDesc('Switch between Annual and Life view')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('annual', 'Annual View')
          .addOption('life', 'Life View')
          .setValue(this.plugin.settings.currentView)
          .onChange(async (value) => {
            this.plugin.settings.currentView = value as 'annual' | 'life';
            await this.plugin.saveSettings();
            // Redisplay to show/hide life view settings
            this.display();
          });
      });
  }

  /**
   * Creates the life view settings section
   */
  private createLifeViewSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Life View Settings' });

    new Setting(containerEl)
      .setName('Birth Date')
      .setDesc('Your birth date (YYYY-MM-DD) for precise calculation')
      .addText((text) => {
        text
          .setPlaceholder('e.g. 1977-03-27')
          .setValue(this.plugin.settings.birthDate || '')
          .onChange(async (value) => {
            // Validate date format
            const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (match) {
              const year = parseInt(match[1], 10);
              const month = parseInt(match[2], 10);
              const day = parseInt(match[3], 10);
              if (year > 1900 && year <= new Date().getFullYear() &&
                  month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                this.plugin.settings.birthDate = value;
                this.plugin.settings.birthYear = year; // Keep in sync
                await this.plugin.saveSettings();
              }
            } else if (value === '') {
              // Allow clearing the date
              this.plugin.settings.birthDate = undefined;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName('Birth Year (Fallback)')
      .setDesc('Used when no full date is provided')
      .addText((text) => {
        text
          .setPlaceholder('e.g. 1990')
          .setValue(String(this.plugin.settings.birthYear))
          .onChange(async (value) => {
            const year = parseInt(value, 10);
            if (!isNaN(year) && year > 1900 && year <= new Date().getFullYear()) {
              this.plugin.settings.birthYear = year;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName('Expected Lifespan')
      .setDesc('Expected lifespan in years')
      .addText((text) => {
        text
          .setPlaceholder('e.g. 85')
          .setValue(String(this.plugin.settings.expectedLifespan))
          .onChange(async (value) => {
            const lifespan = parseInt(value, 10);
            if (!isNaN(lifespan) && lifespan > 0 && lifespan <= 150) {
              this.plugin.settings.expectedLifespan = lifespan;
              await this.plugin.saveSettings();
            }
          });
      });

    // Life Phases Section
    containerEl.createEl('h4', { text: 'Life Phases' });

    new Setting(containerEl)
      .setName('Life Phases Folder (Legacy)')
      .setDesc('Folder for phase-* properties. Or use radcal-showInLife: true anywhere.')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Life/Phases')
          .setValue(this.plugin.settings.lifePhasesFolder)
          .onChange(async (value) => {
            this.plugin.settings.lifePhasesFolder = value;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    // Help text for life phases
    const helpDiv = containerEl.createDiv({ cls: 'setting-item-description' });
    helpDiv.innerHTML = `
      <p style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
        <strong>Option 1: Unified Properties (recommended)</strong><br>
        <code style="display: block; padding: 8px; background: var(--background-secondary); border-radius: 4px; margin-top: 4px;">
---<br>
radcal-start: 1983-09-01<br>
radcal-end: 1987-07-15<br>
radcal-color: blue<br>
radcal-label: Elementary School<br>
radcal-showInLife: true<br>
---
        </code>
        <br>
        <strong>Option 2: Legacy (folder-based)</strong><br>
        Files in the folder above with <code>phase-start</code>, <code>phase-end</code>, etc.<br><br>
        <em>Leave end empty for "ongoing" phases (shows faded arc until life expectancy)</em>
      </p>
    `;
  }

  /**
   * Creates the daily notes section
   */
  private createDailyNotesSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Daily Notes' });

    new Setting(containerEl)
      .setName('Notes Folder')
      .setDesc('Folder where new notes are created (empty = vault root)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Daily Notes')
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFolder = value;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    new Setting(containerEl)
      .setName('Filter Folder')
      .setDesc('Only show notes from this folder (empty = all)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Journal')
          .setValue(this.plugin.settings.calendarFilterFolder)
          .onChange(async (value) => {
            this.plugin.settings.calendarFilterFolder = value;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    new Setting(containerEl)
      .setName('Filename Format')
      .setDesc('Format for new notes (YYYY-MM-DD)')
      .addText((text) => {
        text
          .setPlaceholder('YYYY-MM-DD')
          .setValue(this.plugin.settings.periodicNotesFormat.daily)
          .onChange(async (value) => {
            this.plugin.settings.periodicNotesFormat = {
              ...this.plugin.settings.periodicNotesFormat,
              daily: value || 'YYYY-MM-DD',
            };
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Annual Recurring')
      .setDesc('Folder for birthdays, anniversaries (use XXXX-MM-DD format, shown every year on that date)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Birthdays')
          .setValue(this.plugin.settings.annualRecurringFolder)
          .onChange(async (value) => {
            this.plugin.settings.annualRecurringFolder = value;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    // Anniversary Date Properties
    containerEl.createEl('h4', { text: 'Anniversary Properties' });

    new Setting(containerEl)
      .setName('Additional Date Properties')
      .setDesc('Comma-separated list of YAML properties to use for anniversary dates (in addition to radcal-start/radcal-end)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Birthday, Todestag, Hochzeitstag')
          .setValue(this.plugin.settings.anniversaryDateProperties?.join(', ') || '')
          .onChange(async (value) => {
            // Parse comma-separated list and trim whitespace
            const props = value
              .split(',')
              .map(p => p.trim())
              .filter(p => p.length > 0);
            this.plugin.settings.anniversaryDateProperties = props;
            await this.plugin.saveSettings();
          });
      });

    // Help text for anniversaries
    const anniversaryHelpDiv = containerEl.createDiv({ cls: 'setting-item-description' });
    anniversaryHelpDiv.innerHTML = `
      <p style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
        <strong>Anniversary Properties:</strong><br>
        Use <code>radcal-annual: true</code> to mark a note as anniversary.<br><br>
        <strong>Date sources (checked in order):</strong><br>
        1. <code>radcal-annual-fix</code> - Single fixed date (overrides all)<br>
        2. <code>radcal-start</code> / <code>radcal-end</code> - Birth + death dates<br>
        3. Properties from list above (e.g., <code>Birthday</code>)<br><br>
        <strong>Example:</strong>
        <code style="display: block; padding: 8px; background: var(--background-secondary); border-radius: 4px; margin-top: 4px;">
---<br>
radcal-annual: true<br>
Birthday: 1982-09-24<br>
---
        </code>
      </p>
    `;
  }

  /**
   * Creates the calendar sync section
   */
  private createCalendarSyncSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Calendar Sync (Google Calendar)' });

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
      cls: 'radcal-calendar-title'
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

  /**
   * Creates the ring configuration section
   */
  private createRingConfigSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Configure Rings' });

    // Render existing rings
    const rings = this.plugin.settings.rings;
    rings.forEach((ring, index) => {
      this.createRingSettings(containerEl, ring, index);
    });

    // Add ring button
    new Setting(containerEl)
      .addButton((button) => {
        button
          .setButtonText('Add Ring')
          .setCta()
          .onClick(async () => {
            const newRing = createDefaultRing(rings.length);
            this.plugin.settings.rings = [...rings, newRing];
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  /**
   * Creates settings UI for a single ring (collapsible)
   */
  private createRingSettings(
    containerEl: HTMLElement,
    ring: RingConfig,
    index: number
  ): void {
    // Use native <details> for collapsible behavior
    const details = containerEl.createEl('details', { cls: 'radcal-ring-details' });

    // Summary (clickable header)
    const summary = details.createEl('summary', { cls: 'radcal-ring-summary' });

    // Color swatch in header
    const colorSwatch = summary.createSpan({ cls: 'radcal-ring-swatch' });
    colorSwatch.style.backgroundColor = RING_COLORS[ring.color];

    // Ring title
    summary.createSpan({ text: ring.name || `Ring ${index + 1}`, cls: 'radcal-ring-title' });

    // Folder info (subtle)
    if (ring.folder) {
      summary.createSpan({ text: ` — ${ring.folder}`, cls: 'radcal-ring-folder' });
    }

    // Content container
    const ringContainer = details.createDiv({ cls: 'radcal-ring-content' });

    // Name input
    new Setting(ringContainer)
      .setName('Name')
      .addText((text) => {
        text
          .setPlaceholder('Ring Name')
          .setValue(ring.name)
          .onChange(async (value) => {
            await this.updateRing(index, { name: value });
            // Update summary title
            const titleEl = summary.querySelector('.radcal-ring-title');
            if (titleEl) titleEl.textContent = value || `Ring ${index + 1}`;
          });
      });

    // Folder input with autocomplete
    new Setting(ringContainer)
      .setName('Folder')
      .setDesc('Folder path in vault')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Projects/2024')
          .setValue(ring.folder)
          .onChange(async (value) => {
            await this.updateRing(index, { folder: value });
            // Update summary folder info
            const folderEl = summary.querySelector('.radcal-ring-folder');
            if (folderEl) {
              folderEl.textContent = value ? ` — ${value}` : '';
            }
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    // Color dropdown
    new Setting(ringContainer)
      .setName('Color')
      .addDropdown((dropdown) => {
        Object.keys(RING_COLORS).forEach((colorName) => {
          dropdown.addOption(colorName, this.formatColorName(colorName));
        });
        dropdown
          .setValue(ring.color)
          .onChange(async (value) => {
            await this.updateRing(index, { color: value as RingColorName });
            // Update swatch color
            colorSwatch.style.backgroundColor = RING_COLORS[value as RingColorName];
          });
      });

    // Spanning Arcs toggle
    new Setting(ringContainer)
      .setName('Spanning Arcs')
      .setDesc('Show multi-day events as continuous arcs')
      .addToggle((toggle) => {
        toggle
          .setValue(ring.showSpanningArcs ?? false)
          .onChange(async (value) => {
            await this.updateRing(index, { showSpanningArcs: value });
            this.display();
          });
      });

    // Spanning Arcs property fields (conditional)
    if (ring.showSpanningArcs) {
      this.createSpanningArcsPropertySettings(ringContainer, ring, index);
    }

    // Delete button
    new Setting(ringContainer)
      .addButton((button) => {
        button
          .setButtonText('Delete Ring')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.rings = this.plugin.settings.rings.filter(
              (_, i) => i !== index
            );
            this.plugin.settings.rings = this.plugin.settings.rings.map((r, i) => ({
              ...r,
              order: i,
            }));
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  /**
   * Updates a ring configuration
   */
  private async updateRing(index: number, updates: Partial<RingConfig>): Promise<void> {
    const rings = [...this.plugin.settings.rings];
    rings[index] = { ...rings[index], ...updates };
    this.plugin.settings.rings = rings;
    await this.plugin.saveSettings();
  }

  /**
   * Creates property settings for spanning arcs mode
   */
  private createSpanningArcsPropertySettings(
    containerEl: HTMLElement,
    ring: RingConfig,
    index: number
  ): void {
    const propsContainer = containerEl.createDiv({ cls: 'radial-calendar-segment-config' });

    // Start Date Property
    new Setting(propsContainer)
      .setName('Start Date Property')
      .setDesc('YAML frontmatter field for start date')
      .addText((text) => {
        text
          .setPlaceholder('radcal-start')
          .setValue(ring.startDateField || 'radcal-start')
          .onChange(async (value) => {
            this.updateRing(index, { startDateField: value || 'radcal-start' });
          });
      });

    // End Date Property
    new Setting(propsContainer)
      .setName('End Date Property')
      .setDesc('YAML frontmatter field for end date')
      .addText((text) => {
        text
          .setPlaceholder('radcal-end')
          .setValue(ring.endDateField || 'radcal-end')
          .onChange(async (value) => {
            this.updateRing(index, { endDateField: value || 'radcal-end' });
          });
      });

    // Color Property
    new Setting(propsContainer)
      .setName('Color Property')
      .setDesc('YAML frontmatter field for color')
      .addText((text) => {
        text
          .setPlaceholder('radcal-color')
          .setValue(ring.colorField || 'radcal-color')
          .onChange(async (value) => {
            this.updateRing(index, { colorField: value || 'radcal-color' });
          });
      });

    // Label Property
    new Setting(propsContainer)
      .setName('Label Property')
      .setDesc('YAML frontmatter field for label')
      .addText((text) => {
        text
          .setPlaceholder('radcal-label')
          .setValue(ring.labelField || 'radcal-label')
          .onChange(async (value) => {
            this.updateRing(index, { labelField: value || 'radcal-label' });
          });
      });
  }

  /**
   * Formats a color name for display
   */
  private formatColorName(colorName: string): string {
    // Capitalize first letter
    return colorName.charAt(0).toUpperCase() + colorName.slice(1);
  }

  /**
   * Creates the outer segments section
   */
  private createOuterSegmentsSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Outer Segments' });

    // Segment type dropdown
    new Setting(containerEl)
      .setName('Segment Type')
      .setDesc('Markers on the outer edge of the calendar')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('none', 'None')
          .addOption('seasons', 'Seasons (4)')
          .addOption('quarters', 'Quarters (4)')
          .addOption('semester', 'Semesters (2)')
          .addOption('ten-days', '10-Day Phases (36)')
          .addOption('weeks', 'Weeks (52)')
          .addOption('custom', 'Custom')
          .setValue(this.plugin.settings.annualSegmentType)
          .onChange(async (value) => {
            this.plugin.settings.annualSegmentType = value as AnnualSegmentType;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // Show labels toggle
    new Setting(containerEl)
      .setName('Show Labels')
      .setDesc('Display segment labels')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showSegmentLabels)
          .onChange(async (value) => {
            this.plugin.settings.showSegmentLabels = value;
            await this.plugin.saveSettings();
          });
      });

    // Custom segments editor (only if custom is selected)
    if (this.plugin.settings.annualSegmentType === 'custom') {
      this.createCustomSegmentsEditor(containerEl);
    }

    // Life acts editor (only if life view is active)
    if (this.plugin.settings.currentView === 'life') {
      this.createLifeActsEditor(containerEl);
    }
  }

  /**
   * Creates the custom segments editor
   */
  private createCustomSegmentsEditor(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: 'Custom Segments' });

    const segments = this.plugin.settings.customSegments;

    segments.forEach((segment, index) => {
      this.createSegmentSettings(containerEl, segment, index);
    });

    // Add segment button
    new Setting(containerEl)
      .addButton((button) => {
        button
          .setButtonText('Add Segment')
          .onClick(async () => {
            const newSegment: OuterSegmentConfig = {
              id: `seg-${Date.now()}`,
              label: `Segment ${segments.length + 1}`,
              startDay: 1,
              endDay: 30,
            };
            this.plugin.settings.customSegments = [...segments, newSegment];
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  /**
   * Creates settings for a single custom segment
   */
  private createSegmentSettings(
    containerEl: HTMLElement,
    segment: OuterSegmentConfig,
    index: number
  ): void {
    const segmentContainer = containerEl.createDiv({ cls: 'radial-calendar-segment-config' });

    new Setting(segmentContainer)
      .setName('Label')
      .addText((text) => {
        text
          .setValue(segment.label)
          .onChange(async (value) => {
            this.updateSegment(index, { label: value });
          });
      });

    new Setting(segmentContainer)
      .setName('Start Day')
      .setDesc('Day of year (1-365)')
      .addText((text) => {
        text
          .setValue(String(segment.startDay))
          .onChange(async (value) => {
            const day = parseInt(value, 10);
            if (!isNaN(day) && day >= 1 && day <= 365) {
              this.updateSegment(index, { startDay: day });
            }
          });
      });

    new Setting(segmentContainer)
      .setName('End Day')
      .setDesc('Day of year (1-365)')
      .addText((text) => {
        text
          .setValue(String(segment.endDay))
          .onChange(async (value) => {
            const day = parseInt(value, 10);
            if (!isNaN(day) && day >= 1 && day <= 365) {
              this.updateSegment(index, { endDay: day });
            }
          });
      });

    new Setting(segmentContainer)
      .addButton((button) => {
        button
          .setButtonText('Delete')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.customSegments = this.plugin.settings.customSegments.filter(
              (_, i) => i !== index
            );
            await this.plugin.saveSettings();
            this.display();
          });
      });

    segmentContainer.createEl('hr');
  }

  /**
   * Updates a custom segment
   */
  private async updateSegment(index: number, updates: Partial<OuterSegmentConfig>): Promise<void> {
    const segments = [...this.plugin.settings.customSegments];
    segments[index] = { ...segments[index], ...updates };
    this.plugin.settings.customSegments = segments;
    await this.plugin.saveSettings();
  }

  /**
   * Creates the life acts editor
   */
  private createLifeActsEditor(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: 'Life Acts' });

    const lifeActs = this.plugin.settings.lifeActs;

    lifeActs.forEach((act, index) => {
      this.createLifeActSettings(containerEl, act, index);
    });

    // Add life act button
    new Setting(containerEl)
      .addButton((button) => {
        button
          .setButtonText('Add Life Act')
          .onClick(async () => {
            const newAct: LifeActConfig = {
              id: `act-${Date.now()}`,
              label: `Act ${lifeActs.length + 1}`,
              startAge: 0,
              endAge: 10,
            };
            this.plugin.settings.lifeActs = [...lifeActs, newAct];
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  /**
   * Creates settings for a single life act
   */
  private createLifeActSettings(
    containerEl: HTMLElement,
    act: LifeActConfig,
    index: number
  ): void {
    const actContainer = containerEl.createDiv({ cls: 'radial-calendar-life-act-config' });

    new Setting(actContainer)
      .setName('Label')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Childhood')
          .setValue(act.label)
          .onChange(async (value) => {
            this.updateLifeAct(index, { label: value });
          });
      });

    new Setting(actContainer)
      .setName('Start Age')
      .addText((text) => {
        text
          .setValue(String(act.startAge))
          .onChange(async (value) => {
            const age = parseInt(value, 10);
            if (!isNaN(age) && age >= 0) {
              this.updateLifeAct(index, { startAge: age });
            }
          });
      });

    new Setting(actContainer)
      .setName('End Age')
      .addText((text) => {
        text
          .setValue(String(act.endAge))
          .onChange(async (value) => {
            const age = parseInt(value, 10);
            if (!isNaN(age) && age >= 0) {
              this.updateLifeAct(index, { endAge: age });
            }
          });
      });

    // Color dropdown (optional)
    new Setting(actContainer)
      .setName('Color')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '(Default)');
        Object.keys(RING_COLORS).forEach((colorName) => {
          dropdown.addOption(colorName, this.formatColorName(colorName));
        });
        dropdown
          .setValue(act.color || '')
          .onChange(async (value) => {
            this.updateLifeAct(index, { color: value as RingColorName || undefined });
          });
      });

    new Setting(actContainer)
      .addButton((button) => {
        button
          .setButtonText('Delete')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.lifeActs = this.plugin.settings.lifeActs.filter(
              (_, i) => i !== index
            );
            await this.plugin.saveSettings();
            this.display();
          });
      });

    actContainer.createEl('hr');
  }

  /**
   * Updates a life act
   */
  private async updateLifeAct(index: number, updates: Partial<LifeActConfig>): Promise<void> {
    const acts = [...this.plugin.settings.lifeActs];
    acts[index] = { ...acts[index], ...updates };
    this.plugin.settings.lifeActs = acts;
    await this.plugin.saveSettings();
  }

  /**
   * Creates the template section
   */
  private createTemplateSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Templates' });

    // Template Folder Setting
    new Setting(containerEl)
      .setName('Template Folder')
      .setDesc('Folder where templates are created')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Templates')
          .setValue(this.plugin.settings.templateFolder || 'Templates')
          .onChange(async (value) => {
            this.plugin.settings.templateFolder = value || 'Templates';
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    // Life Phase Template
    new Setting(containerEl)
      .setName('Life Phase Template')
      .setDesc('For life timeline phases (birth to death)')
      .addButton((button) => {
        button
          .setButtonText('Create')
          .onClick(async () => {
            await this.createTemplate('Radial Calendar - Life Phase.md', LIFE_PHASE_TEMPLATE);
          });
      });

    // Spanning Arc Template
    new Setting(containerEl)
      .setName('Spanning Arc Template')
      .setDesc('For date ranges (projects, events)')
      .addButton((button) => {
        button
          .setButtonText('Create')
          .onClick(async () => {
            await this.createTemplate('Radial Calendar - Spanning Arc.md', SPANNING_ARC_TEMPLATE);
          });
      });

    // Anniversary Template
    new Setting(containerEl)
      .setName('Anniversary Template')
      .setDesc('For yearly recurring events (birthdays, etc.)')
      .addButton((button) => {
        button
          .setButtonText('Create')
          .onClick(async () => {
            await this.createTemplate('Radial Calendar - Anniversary.md', ANNIVERSARY_TEMPLATE);
          });
      });

    // Create All Templates Button
    new Setting(containerEl)
      .setName('Create All Templates')
      .setDesc('Creates all templates at once')
      .addButton((button) => {
        button
          .setButtonText('Create All')
          .setCta()
          .onClick(async () => {
            await this.createAllTemplates();
          });
      });
  }

  /**
   * Creates a template file in the vault
   */
  private async createTemplate(filename: string, content: string): Promise<boolean> {
    const templateFolder = this.plugin.settings.templateFolder || 'Templates';
    const templatePath = `${templateFolder}/${filename}`;

    try {
      // Ensure template folder exists
      const folderExists = this.app.vault.getAbstractFileByPath(templateFolder);
      if (!folderExists) {
        await this.app.vault.createFolder(templateFolder);
      }

      // Check if template already exists
      const existingFile = this.app.vault.getAbstractFileByPath(templatePath);
      if (existingFile) {
        new Notice(`Template already exists: ${templatePath}`);
        return false;
      }

      // Create template file
      await this.app.vault.create(templatePath, content);
      new Notice(`Template created: ${templatePath}`);
      return true;
    } catch (error) {
      console.error('Failed to create template file:', error);
      new Notice(`Error creating template: ${filename}`);
      return false;
    }
  }

  /**
   * Creates all templates at once
   */
  private async createAllTemplates(): Promise<void> {
    const templates = [
      { filename: 'Radial Calendar - Life Phase.md', content: LIFE_PHASE_TEMPLATE },
      { filename: 'Radial Calendar - Spanning Arc.md', content: SPANNING_ARC_TEMPLATE },
      { filename: 'Radial Calendar - Anniversary.md', content: ANNIVERSARY_TEMPLATE },
    ];

    let created = 0;
    for (const template of templates) {
      const success = await this.createTemplate(template.filename, template.content);
      if (success) created++;
    }

    if (created > 0) {
      new Notice(`Created ${created} template(s)`);
    }
  }

  /**
   * Creates the center display section
   */
  private createCenterDisplaySection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Center Display' });

    new Setting(containerEl)
      .setName('Display Mode')
      .setDesc('What is shown in the center of the calendar')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('countdown', 'Countdown')
          .addOption('stats', 'Statistics')
          .addOption('navigation', 'Navigation')
          .setValue(this.plugin.settings.centerDisplay)
          .onChange(async (value) => {
            this.plugin.settings.centerDisplay = value as 'countdown' | 'stats' | 'navigation';
            await this.plugin.saveSettings();
          });
      });
  }

  /**
   * Creates the migration section for legacy properties
   */
  private createMigrationSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Migration' });

    new Setting(containerEl)
      .setName('Migrate Legacy Properties')
      .setDesc('Converts phase-* properties to radcal-* properties in all notes')
      .addButton((button) => {
        button
          .setButtonText('Scan for Legacy Properties')
          .onClick(async () => {
            const result = await this.scanLegacyProperties();
            if (result.count === 0) {
              new Notice('No legacy properties found');
            } else {
              new Notice(`Found ${result.count} files with legacy properties`);
              // Show confirmation dialog
              this.showMigrationConfirmation(containerEl, result);
            }
          });
      });
  }

  /**
   * Scans all files for legacy phase-* properties
   */
  private async scanLegacyProperties(): Promise<{ count: number; files: string[] }> {
    const files = this.app.vault.getMarkdownFiles();
    const legacyFiles: string[] = [];

    const legacyProps = ['phase-start', 'phase-end', 'phase-color', 'phase-label', 'phase-category'];

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter;

      if (frontmatter) {
        const hasLegacy = legacyProps.some(prop => prop in frontmatter);
        if (hasLegacy) {
          legacyFiles.push(file.path);
        }
      }
    }

    return { count: legacyFiles.length, files: legacyFiles };
  }

  /**
   * Shows migration confirmation with file list
   */
  private showMigrationConfirmation(
    containerEl: HTMLElement,
    result: { count: number; files: string[] }
  ): void {
    // Remove any existing confirmation
    const existing = containerEl.querySelector('.radcal-migration-confirm');
    if (existing) existing.remove();

    const confirmEl = containerEl.createDiv({ cls: 'radcal-migration-confirm' });
    confirmEl.createEl('p', { text: `Files to migrate (${result.count}):` });

    const listEl = confirmEl.createEl('ul', { cls: 'radcal-migration-list' });
    for (const file of result.files.slice(0, 10)) {
      listEl.createEl('li', { text: file });
    }
    if (result.files.length > 10) {
      listEl.createEl('li', { text: `... and ${result.files.length - 10} more` });
    }

    new Setting(confirmEl)
      .addButton((button) => {
        button
          .setButtonText('Migrate All')
          .setCta()
          .onClick(async () => {
            const migrated = await this.migrateAllFiles(result.files);
            new Notice(`Migrated ${migrated} files`);
            confirmEl.remove();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Cancel')
          .onClick(() => {
            confirmEl.remove();
          });
      });
  }

  /**
   * Migrates all legacy properties to radcal-* format
   */
  private async migrateAllFiles(filePaths: string[]): Promise<number> {
    let migrated = 0;

    const propertyMap: Record<string, string> = {
      'phase-start': 'radcal-start',
      'phase-end': 'radcal-end',
      'phase-color': 'radcal-color',
      'phase-label': 'radcal-label',
      'phase-category': 'radcal-category',
    };

    for (const filePath of filePaths) {
      const tfile = this.app.vault.getFileByPath(filePath);
      if (!tfile) continue;

      try {
        let content = await this.app.vault.read(tfile);
        let modified = false;

        // Replace each legacy property
        for (const [oldProp, newProp] of Object.entries(propertyMap)) {
          const regex = new RegExp(`^${oldProp}:`, 'gm');
          if (content.match(regex)) {
            content = content.replace(regex, `${newProp}:`);
            modified = true;
          }
        }

        // Add radcal-showInLife: true if it has radcal-start
        if (modified && content.includes('radcal-start:') && !content.includes('radcal-showInLife:')) {
          // Insert after radcal-start line
          content = content.replace(
            /(radcal-start:[^\n]*\n)/,
            '$1radcal-showInLife: true\n'
          );
        }

        if (modified) {
          await this.app.vault.modify(tfile, content);
          migrated++;
        }
      } catch (error) {
        console.error(`Failed to migrate ${filePath}:`, error);
      }
    }

    return migrated;
  }

  // ============================================================================
  // Presets Section
  // ============================================================================

  /**
   * Creates the presets management section
   */
  private createPresetsSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Appearance Presets' });

    const descEl = containerEl.createEl('p', {
      cls: 'setting-item-description',
    });
    descEl.innerHTML = `
      Presets let you define reusable appearance combinations.
      Use <code>radcal-preset: name</code> in your notes to apply a preset.
      Explicit properties (radcal-color, etc.) override preset values.
    `;

    // Render existing presets
    const presets = this.plugin.settings.presets || [];
    presets.forEach((preset, index) => {
      this.createPresetSettings(containerEl, preset, index);
    });

    // Add preset button
    new Setting(containerEl)
      .setName('Add Preset')
      .setDesc('Create a new appearance preset')
      .addButton((button) => {
        button
          .setButtonText('+ Add Preset')
          .setCta()
          .onClick(async () => {
            const newPreset: PresetConfig = {
              name: `preset-${Date.now().toString(36)}`,
              label: 'New Preset',
              color: 'blue',
            };
            if (!this.plugin.settings.presets) {
              this.plugin.settings.presets = [];
            }
            this.plugin.settings.presets.push(newPreset);
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  /**
   * Creates settings for a single preset (collapsible)
   */
  private createPresetSettings(
    containerEl: HTMLElement,
    preset: PresetConfig,
    index: number
  ): void {
    // Use native <details> for collapsible behavior
    const details = containerEl.createEl('details', { cls: 'radcal-preset-details' });

    // Summary (clickable header)
    const summary = details.createEl('summary', { cls: 'radcal-preset-summary' });

    // Color swatch with icon
    const colorSwatch = summary.createSpan({ cls: 'radcal-preset-swatch' });
    colorSwatch.style.backgroundColor = RING_COLORS[preset.color];
    if (preset.icon) {
      colorSwatch.textContent = preset.icon;
    }

    // Preset title
    const titleEl = summary.createSpan({
      text: preset.label || preset.name,
      cls: 'radcal-preset-title'
    });

    // Name badge (the actual key used in YAML)
    summary.createSpan({
      text: preset.name,
      cls: 'radcal-preset-name-badge'
    });

    // Content container
    const presetContainer = details.createDiv({ cls: 'radcal-preset-content' });

    // Name (unique identifier used in radcal-preset)
    new Setting(presetContainer)
      .setName('Name')
      .setDesc('Unique identifier (used in radcal-preset property)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. family')
          .setValue(preset.name)
          .onChange(async (value) => {
            const sanitized = value.toLowerCase().replace(/\s+/g, '-');
            preset.name = sanitized;
            await this.plugin.saveSettings();
            // Update badge
            const badge = summary.querySelector('.radcal-preset-name-badge');
            if (badge) badge.textContent = sanitized;
          });
      });

    // Label (display name)
    new Setting(presetContainer)
      .setName('Label')
      .setDesc('Display name for this preset')
      .addText((text) => {
        text
          .setPlaceholder('e.g. Family')
          .setValue(preset.label || '')
          .onChange(async (value) => {
            preset.label = value || undefined;
            await this.plugin.saveSettings();
            // Update title
            titleEl.textContent = value || preset.name;
          });
      });

    // Color
    new Setting(presetContainer)
      .setName('Color')
      .addDropdown((dropdown) => {
        Object.keys(RING_COLORS).forEach((colorName) => {
          dropdown.addOption(colorName, this.formatColorName(colorName));
        });
        dropdown
          .setValue(preset.color)
          .onChange(async (value) => {
            preset.color = value as RingColorName;
            await this.plugin.saveSettings();
            colorSwatch.style.backgroundColor = RING_COLORS[value as RingColorName];
          });
      });

    // Pattern
    new Setting(presetContainer)
      .setName('Pattern')
      .setDesc('Fill pattern (optional)')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '(None)');
        PATTERN_NAMES.forEach((patternName) => {
          dropdown.addOption(patternName, this.formatColorName(patternName));
        });
        dropdown
          .setValue(preset.pattern || '')
          .onChange(async (value) => {
            preset.pattern = value ? (value as PatternName) : undefined;
            await this.plugin.saveSettings();
          });
      });

    // Opacity
    new Setting(presetContainer)
      .setName('Opacity')
      .setDesc('Opacity 0-100 (leave empty for default 100)')
      .addText((text) => {
        text
          .setPlaceholder('100')
          .setValue(preset.opacity !== undefined ? String(preset.opacity) : '')
          .onChange(async (value) => {
            if (value === '') {
              preset.opacity = undefined;
            } else {
              const num = parseInt(value, 10);
              if (!isNaN(num) && num >= 0 && num <= 100) {
                preset.opacity = num;
              }
            }
            await this.plugin.saveSettings();
          });
      });

    // Icon
    new Setting(presetContainer)
      .setName('Icon')
      .setDesc('Emoji or symbol to display (optional)')
      .addText((text) => {
        text
          .setPlaceholder('e.g. 🎂')
          .setValue(preset.icon || '')
          .onChange(async (value) => {
            preset.icon = value.trim() || undefined;
            await this.plugin.saveSettings();
            colorSwatch.textContent = preset.icon || '';
          });
      });

    // Delete button
    new Setting(presetContainer)
      .addButton((button) => {
        button
          .setButtonText('Delete Preset')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.presets.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          });
      });
  }

  /**
   * Help Tab: YAML Reference
   */
  private renderHelpTab(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'YAML Property Reference' });

    const yamlReference = `---
# ══════════════════════════════════════════════
# RADIAL CALENDAR - Complete YAML Reference
# ══════════════════════════════════════════════

# ─────────────────────────────────────────────
# BASIC PROPERTIES (required for spanning arcs)
# ─────────────────────────────────────────────
radcal-start: 2025-01-15        # Start date (YYYY-MM-DD)
radcal-end: 2025-06-30          # End date (YYYY-MM-DD, optional for ongoing)
radcal-label: My Event          # Display label (optional, defaults to filename)

# ─────────────────────────────────────────────
# APPEARANCE
# ─────────────────────────────────────────────
radcal-color: blue              # Color name (see list below)
radcal-pattern: solid           # Pattern: solid, striped, dotted, crosshatch, grid
radcal-opacity: 80              # Opacity 0-100 (default: 100)
radcal-fade: true               # Fade from today to end (default: false)
radcal-icon: 🎂                 # Emoji/icon at arc start (optional)
radcal-preset: family           # Apply preset (color, pattern, opacity, icon)

# ─────────────────────────────────────────────
# ORGANIZATION
# ─────────────────────────────────────────────
radcal-ring: Wohnorte           # Ring name for grouping in Life View
radcal-category: Deutschland    # Category within a ring (for sub-grouping)
radcal-showInLife: true         # Show in Life View (required for files outside lifePhasesFolder)

# ─────────────────────────────────────────────
# ANNIVERSARIES (yearly recurring)
# ─────────────────────────────────────────────
radcal-annual: true             # Mark as annual event
radcal-annual-fix: 2000-03-15   # Fixed date (uses month-day each year)

# ─────────────────────────────────────────────
# AVAILABLE COLORS
# ─────────────────────────────────────────────
# red, orange, yellow, green, blue, purple, pink,
# teal, cyan, magenta, lime, amber, indigo, violet,
# rose, gray, slate, stone

# ─────────────────────────────────────────────
# AVAILABLE PATTERNS
# ─────────────────────────────────────────────
# solid      - Solid fill (default)
# striped    - Diagonal stripes
# horizontal - Horizontal lines
# vertical   - Vertical lines
# dotted     - Dot pattern
# crosshatch - Crossed diagonal lines
# grid       - Grid pattern
# wavy       - Wavy lines

---`;

    // Code block container
    const codeContainer = containerEl.createDiv({ cls: 'radcal-yaml-reference' });

    const pre = codeContainer.createEl('pre');
    const code = pre.createEl('code');
    code.textContent = yamlReference;

    // Copy button
    new Setting(containerEl)
      .addButton((button) => {
        button
          .setButtonText('Copy to Clipboard')
          .setCta()
          .onClick(async () => {
            await navigator.clipboard.writeText(yamlReference);
            new Notice('YAML reference copied to clipboard');
          });
      });

    // Quick examples section
    containerEl.createEl('h3', { text: 'Quick Examples' });

    const examples = [
      {
        title: 'Life Phase (e.g., Job, Living Place)',
        yaml: `---
radcal-start: 2020-01-01
radcal-end: 2023-12-31
radcal-label: Software Developer
radcal-color: blue
radcal-ring: Karriere
radcal-showInLife: true
---`,
      },
      {
        title: 'Ongoing Phase (no end date)',
        yaml: `---
radcal-start: 2024-01-01
radcal-label: Current Project
radcal-color: green
radcal-fade: true
radcal-showInLife: true
---`,
      },
      {
        title: 'Anniversary with fixed date',
        yaml: `---
radcal-annual: true
radcal-annual-fix: 1990-05-20
radcal-label: Birthday
radcal-color: pink
radcal-icon: 🎂
---`,
        desc: 'Uses month-day from radcal-annual-fix each year',
      },
      {
        title: 'Anniversary with date range',
        yaml: `---
radcal-annual: true
radcal-start: 1932-03-15
radcal-end: 2005-11-28
radcal-label: Opa Hans
radcal-color: gray
---`,
        desc: 'Shows BOTH dates annually (birth + death)',
      },
      {
        title: 'Using a Preset',
        yaml: `---
radcal-start: 2024-01-01
radcal-end: 2024-12-31
radcal-label: Family Vacation
radcal-preset: family
radcal-showInLife: true
---`,
        desc: 'Applies preset appearance (color, pattern, icon). Define presets in Settings → Advanced.',
      },
    ];

    for (const example of examples) {
      const exampleEl = containerEl.createDiv({ cls: 'radcal-example' });
      exampleEl.createEl('h4', { text: example.title });

      // Optional description
      if ((example as any).desc) {
        exampleEl.createEl('p', {
          text: (example as any).desc,
          cls: 'radcal-example-desc'
        });
      }

      // Code wrapper with copy button
      const codeWrapper = exampleEl.createDiv({ cls: 'radcal-code-wrapper' });

      const copyBtn = codeWrapper.createEl('button', {
        cls: 'radcal-copy-btn',
        attr: { 'aria-label': 'Copy to clipboard' }
      });
      copyBtn.textContent = '📋';
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(example.yaml);
        copyBtn.textContent = '✓';
        copyBtn.classList.add('radcal-copy-btn--success');
        setTimeout(() => {
          copyBtn.textContent = '📋';
          copyBtn.classList.remove('radcal-copy-btn--success');
        }, 1500);
      });

      const exPre = codeWrapper.createEl('pre');
      const exCode = exPre.createEl('code');
      exCode.textContent = example.yaml;
    }

    // Reset Presets section
    containerEl.createEl('h3', { text: 'Reset' });

    new Setting(containerEl)
      .setName('Reset Presets to Defaults')
      .setDesc('Restore the default presets (family, work, education, health, travel, project, completed, cancelled)')
      .addButton((button) => {
        button
          .setButtonText('Reset Presets')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.presets = [...DEFAULT_PRESETS];
            await this.plugin.saveSettings();
            new Notice('Presets reset to defaults');
          });
      });
  }
}
