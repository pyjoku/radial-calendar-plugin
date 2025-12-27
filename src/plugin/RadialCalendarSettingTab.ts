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
} from '../core/domain/types';
import {
  DEFAULT_RADIAL_SETTINGS,
  createDefaultRing,
  RING_COLORS,
  RING_SEGMENT_TEMPLATE,
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

  constructor(app: App, plugin: RadialCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // View Mode Section
    this.createViewModeSection(containerEl);

    // Life View Settings Section (conditional)
    if (this.plugin.settings.currentView === 'life') {
      this.createLifeViewSection(containerEl);
    }

    // Daily Notes Section
    this.createDailyNotesSection(containerEl);

    // Calendar Sync Section
    this.createCalendarSyncSection(containerEl);

    // Ring Configuration Section
    this.createRingConfigSection(containerEl);

    // Outer Segments Section
    this.createOuterSegmentsSection(containerEl);

    // Template Section
    this.createTemplateSection(containerEl);

    // Center Display Section
    this.createCenterDisplaySection(containerEl);
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
      .setName('Life Phases Folder')
      .setDesc('Folder with life phase notes (YAML: phase-start, phase-end, phase-color, phase-label)')
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
        <strong>Example YAML for a life phase:</strong><br>
        <code style="display: block; padding: 8px; background: var(--background-secondary); border-radius: 4px; margin-top: 4px;">
---<br>
phase-start: 1983-09-01<br>
phase-end: 1987-07-15<br>
phase-color: blue<br>
phase-label: Elementary School<br>
---
        </code>
        <br>
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
   * Creates settings for a single calendar source
   */
  private createCalendarSourceSettings(
    containerEl: HTMLElement,
    source: CalendarSourceConfig,
    index: number
  ): void {
    const sourceContainer = containerEl.createDiv({ cls: 'radial-calendar-source-config' });

    // Header with name and delete button
    new Setting(sourceContainer)
      .setName(`Calendar ${index + 1}: ${source.name}`)
      .setHeading()
      .addButton((button) => {
        button
          .setIcon('trash')
          .setWarning()
          .setTooltip('Delete this calendar source')
          .onClick(async () => {
            this.plugin.settings.calendarSources.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          });
      });

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
        // Make URL field wider
        text.inputEl.style.width = '100%';
        text.inputEl.type = 'password'; // Hide URL for privacy
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
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    // Color
    new Setting(sourceContainer)
      .setName('Color')
      .setDesc('Color for this calendar in the radial view')
      .addDropdown((dropdown) => {
        Object.keys(RING_COLORS).forEach((colorName) => {
          dropdown.addOption(colorName, colorName.charAt(0).toUpperCase() + colorName.slice(1));
        });
        dropdown
          .setValue(source.color)
          .onChange(async (value) => {
            source.color = value as RingColorName;
            await this.plugin.saveSettings();
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
      const lastSyncStr = lastSyncDate.toLocaleString();
      sourceContainer.createDiv({
        cls: 'setting-item-description',
        text: `Last synced: ${lastSyncStr}`,
      });
    }

    // Divider
    sourceContainer.createEl('hr');
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
   * Creates settings UI for a single ring
   */
  private createRingSettings(
    containerEl: HTMLElement,
    ring: RingConfig,
    index: number
  ): void {
    const ringContainer = containerEl.createDiv({ cls: 'radial-calendar-ring-config' });

    // Ring header with name
    const headerSetting = new Setting(ringContainer)
      .setName(`Ring ${index + 1}`)
      .setClass('radial-calendar-ring-header');

    // Name input
    new Setting(ringContainer)
      .setName('Name')
      .addText((text) => {
        text
          .setPlaceholder('Ring Name')
          .setValue(ring.name)
          .onChange(async (value) => {
            this.updateRing(index, { name: value });
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
            this.updateRing(index, { folder: value });
          });
        // Add folder autocomplete
        new FolderSuggest(this.app, text.inputEl);
      });

    // Color dropdown
    new Setting(ringContainer)
      .setName('Color')
      .addDropdown((dropdown) => {
        // Add all color options from RING_COLORS
        Object.keys(RING_COLORS).forEach((colorName) => {
          dropdown.addOption(colorName, this.formatColorName(colorName));
        });
        dropdown
          .setValue(ring.color)
          .onChange(async (value) => {
            this.updateRing(index, { color: value as RingColorName });
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
            this.display(); // Refresh to show/hide property fields
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
          .setButtonText('Delete')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.rings = this.plugin.settings.rings.filter(
              (_, i) => i !== index
            );
            // Recalculate order for remaining rings
            this.plugin.settings.rings = this.plugin.settings.rings.map((r, i) => ({
              ...r,
              order: i,
            }));
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // Add separator between rings
    ringContainer.createEl('hr');
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
    containerEl.createEl('h3', { text: 'Template' });

    new Setting(containerEl)
      .setName('Create Template')
      .setDesc('Creates a template file for ring segments in your vault')
      .addButton((button) => {
        button
          .setButtonText('Create Template')
          .onClick(async () => {
            await this.createTemplateFile();
          });
      });
  }

  /**
   * Creates a template file in the vault
   */
  private async createTemplateFile(): Promise<void> {
    const templateFolder = this.plugin.settings.templateFolder || 'Templates';
    const templatePath = `${templateFolder}/Radial Calendar Segment.md`;

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
        return;
      }

      // Create template file
      await this.app.vault.create(templatePath, RING_SEGMENT_TEMPLATE);
      new Notice(`Template created: ${templatePath}`);
    } catch (error) {
      console.error('Failed to create template file:', error);
      new Notice('Error creating template');
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
}
