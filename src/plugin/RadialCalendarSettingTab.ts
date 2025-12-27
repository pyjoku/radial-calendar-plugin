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
      .setName('Ansichtsmodus')
      .setDesc('Wechseln zwischen Jahres- und Lebensansicht')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('annual', 'Jahresansicht')
          .addOption('life', 'Lebensansicht')
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
    containerEl.createEl('h3', { text: 'Lebensansicht Einstellungen' });

    new Setting(containerEl)
      .setName('Geburtsjahr')
      .setDesc('Dein Geburtsjahr')
      .addText((text) => {
        text
          .setPlaceholder('z.B. 1990')
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
      .setName('Erwartete Lebensspanne')
      .setDesc('Erwartete Lebensdauer in Jahren')
      .addText((text) => {
        text
          .setPlaceholder('z.B. 85')
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
    containerEl.createEl('h4', { text: 'Lebensphasen' });

    new Setting(containerEl)
      .setName('Lebensphasen-Ordner')
      .setDesc('Ordner mit Lebensphasen-Notizen (YAML: phase-start, phase-end, phase-color, phase-label)')
      .addText((text) => {
        text
          .setPlaceholder('z.B. Life/Phases')
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
        <strong>Beispiel YAML für eine Lebensphase:</strong><br>
        <code style="display: block; padding: 8px; background: var(--background-secondary); border-radius: 4px; margin-top: 4px;">
---<br>
phase-start: 1983-09-01<br>
phase-end: 1987-07-15<br>
phase-color: blue<br>
phase-label: Grundschule<br>
---
        </code>
        <br>
        <em>Leer lassen für "ongoing" (aktuelle Phasen zeigen Gradient bis Lebensende)</em>
      </p>
    `;
  }

  /**
   * Creates the daily notes section
   */
  private createDailyNotesSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Tägliche Notizen' });

    new Setting(containerEl)
      .setName('Notizen-Ordner')
      .setDesc('Ordner, in dem neue Notizen erstellt werden (leer = Root)')
      .addText((text) => {
        text
          .setPlaceholder('z.B. Daily Notes')
          .setValue(this.plugin.settings.dailyNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNoteFolder = value;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    new Setting(containerEl)
      .setName('Filter-Ordner')
      .setDesc('Nur Notizen aus diesem Ordner anzeigen (leer = alle)')
      .addText((text) => {
        text
          .setPlaceholder('z.B. Journal')
          .setValue(this.plugin.settings.calendarFilterFolder)
          .onChange(async (value) => {
            this.plugin.settings.calendarFilterFolder = value;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    new Setting(containerEl)
      .setName('Dateiname-Format')
      .setDesc('Format für neue Notizen (YYYY-MM-DD)')
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
      .setName('Jährlich wiederkehrend')
      .setDesc('Ordner für Geburtstage, Jahrestage (z.B. 27.03.1977 wird jedes Jahr am 27.03. angezeigt)')
      .addText((text) => {
        text
          .setPlaceholder('z.B. Geburtstage')
          .setValue(this.plugin.settings.annualRecurringFolder)
          .onChange(async (value) => {
            this.plugin.settings.annualRecurringFolder = value;
            await this.plugin.saveSettings();
          });
        new FolderSuggest(this.app, text.inputEl);
      });
  }

  /**
   * Creates the ring configuration section
   */
  private createRingConfigSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Ringe konfigurieren' });

    // Render existing rings
    const rings = this.plugin.settings.rings;
    rings.forEach((ring, index) => {
      this.createRingSettings(containerEl, ring, index);
    });

    // Add ring button
    new Setting(containerEl)
      .addButton((button) => {
        button
          .setButtonText('Ring hinzufugen')
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
      .setName('Ordner')
      .setDesc('Ordnerpfad im Vault')
      .addText((text) => {
        text
          .setPlaceholder('z.B. Projects/2024')
          .setValue(ring.folder)
          .onChange(async (value) => {
            this.updateRing(index, { folder: value });
          });
        // Add folder autocomplete
        new FolderSuggest(this.app, text.inputEl);
      });

    // Color dropdown
    new Setting(ringContainer)
      .setName('Farbe')
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

    // Delete button
    new Setting(ringContainer)
      .addButton((button) => {
        button
          .setButtonText('Loschen')
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
    containerEl.createEl('h3', { text: 'Äußere Segmente' });

    // Segment type dropdown
    new Setting(containerEl)
      .setName('Segment-Typ')
      .setDesc('Markierungen am äußeren Rand des Kalenders')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('none', 'Keine')
          .addOption('seasons', 'Jahreszeiten (4)')
          .addOption('quarters', 'Quartale (4)')
          .addOption('semester', 'Semester (2)')
          .addOption('ten-days', '10-Tages-Phasen (36)')
          .addOption('weeks', 'Wochen (52)')
          .addOption('custom', 'Benutzerdefiniert')
          .setValue(this.plugin.settings.annualSegmentType)
          .onChange(async (value) => {
            this.plugin.settings.annualSegmentType = value as AnnualSegmentType;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    // Show labels toggle
    new Setting(containerEl)
      .setName('Labels anzeigen')
      .setDesc('Segment-Beschriftungen anzeigen')
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
    containerEl.createEl('h4', { text: 'Benutzerdefinierte Segmente' });

    const segments = this.plugin.settings.customSegments;

    segments.forEach((segment, index) => {
      this.createSegmentSettings(containerEl, segment, index);
    });

    // Add segment button
    new Setting(containerEl)
      .addButton((button) => {
        button
          .setButtonText('Segment hinzufügen')
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
      .setName('Start-Tag')
      .setDesc('Tag des Jahres (1-365)')
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
      .setName('End-Tag')
      .setDesc('Tag des Jahres (1-365)')
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
          .setButtonText('Löschen')
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
    containerEl.createEl('h4', { text: 'Lebensakte' });

    const lifeActs = this.plugin.settings.lifeActs;

    lifeActs.forEach((act, index) => {
      this.createLifeActSettings(containerEl, act, index);
    });

    // Add life act button
    new Setting(containerEl)
      .addButton((button) => {
        button
          .setButtonText('Lebensakt hinzufügen')
          .onClick(async () => {
            const newAct: LifeActConfig = {
              id: `act-${Date.now()}`,
              label: `Akt ${lifeActs.length + 1}`,
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
      .setName('Bezeichnung')
      .addText((text) => {
        text
          .setPlaceholder('z.B. Kindheit')
          .setValue(act.label)
          .onChange(async (value) => {
            this.updateLifeAct(index, { label: value });
          });
      });

    new Setting(actContainer)
      .setName('Start-Alter')
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
      .setName('End-Alter')
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
      .setName('Farbe')
      .addDropdown((dropdown) => {
        dropdown.addOption('', '(Standard)');
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
          .setButtonText('Löschen')
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
      .setName('Template erstellen')
      .setDesc('Erstellt eine Template-Datei fur Ring-Segmente im Vault')
      .addButton((button) => {
        button
          .setButtonText('Template erstellen')
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
        new Notice(`Template existiert bereits: ${templatePath}`);
        return;
      }

      // Create template file
      await this.app.vault.create(templatePath, RING_SEGMENT_TEMPLATE);
      new Notice(`Template erstellt: ${templatePath}`);
    } catch (error) {
      console.error('Failed to create template file:', error);
      new Notice('Fehler beim Erstellen des Templates');
    }
  }

  /**
   * Creates the center display section
   */
  private createCenterDisplaySection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Zentrum Anzeige' });

    new Setting(containerEl)
      .setName('Anzeigemodus')
      .setDesc('Was im Zentrum des Kalenders angezeigt wird')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('countdown', 'Countdown')
          .addOption('stats', 'Statistiken')
          .addOption('navigation', 'Navigation')
          .setValue(this.plugin.settings.centerDisplay)
          .onChange(async (value) => {
            this.plugin.settings.centerDisplay = value as 'countdown' | 'stats' | 'navigation';
            await this.plugin.saveSettings();
          });
      });
  }
}
