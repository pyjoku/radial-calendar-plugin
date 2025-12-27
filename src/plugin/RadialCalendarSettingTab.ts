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

    // Ring Configuration Section
    this.createRingConfigSection(containerEl);

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
