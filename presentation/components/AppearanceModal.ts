/**
 * AppearanceModal - Combined modal for setting color, pattern, and opacity
 *
 * Shows all three appearance options in one dialog for quick editing.
 */

import { Modal, App, Setting, TFile, Notice } from 'obsidian';
import { RING_COLORS, PATTERN_NAMES, type RingColorName, type PatternName } from '../../core/domain/types';

export class AppearanceModal extends Modal {
  private file: TFile;
  private onSave: () => void;

  private selectedColor: RingColorName | undefined;
  private selectedPattern: PatternName | undefined;
  private selectedOpacity: number;

  constructor(app: App, file: TFile, onSave: () => void) {
    super(app);
    this.file = file;
    this.onSave = onSave;

    // Load current values from frontmatter
    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};

    this.selectedColor = this.isValidColor(fm['radcal-color']) ? fm['radcal-color'] : undefined;
    this.selectedPattern = this.isValidPattern(fm['radcal-pattern']) ? fm['radcal-pattern'] : undefined;
    this.selectedOpacity = typeof fm['radcal-opacity'] === 'number' ? fm['radcal-opacity'] : 100;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('radcal-appearance-modal');

    contentEl.createEl('h2', { text: 'Set Appearance' });

    // Color section
    this.renderColorSection(contentEl);

    // Pattern section
    this.renderPatternSection(contentEl);

    // Opacity section
    this.renderOpacitySection(contentEl);

    // Buttons
    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText('Cancel')
          .onClick(() => this.close());
      })
      .addButton((btn) => {
        btn
          .setButtonText('Apply')
          .setCta()
          .onClick(() => this.applyChanges());
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private renderColorSection(el: HTMLElement): void {
    el.createEl('h3', { text: 'Color' });
    const grid = el.createDiv({ cls: 'radcal-color-grid radcal-color-grid--compact' });

    for (const [colorName, colorHex] of Object.entries(RING_COLORS)) {
      const swatch = grid.createDiv({
        cls: `radcal-color-swatch ${this.selectedColor === colorName ? 'is-selected' : ''}`,
      });
      swatch.style.backgroundColor = colorHex;
      swatch.setAttribute('title', colorName);

      swatch.addEventListener('click', () => {
        // Deselect all
        grid.querySelectorAll('.radcal-color-swatch').forEach((s) => s.removeClass('is-selected'));
        // Select this one
        swatch.addClass('is-selected');
        this.selectedColor = colorName as RingColorName;
      });
    }
  }

  private renderPatternSection(el: HTMLElement): void {
    el.createEl('h3', { text: 'Pattern' });
    const grid = el.createDiv({ cls: 'radcal-pattern-grid radcal-pattern-grid--compact' });

    for (const patternName of PATTERN_NAMES) {
      const option = grid.createDiv({
        cls: `radcal-pattern-option ${this.selectedPattern === patternName ? 'is-selected' : ''}`,
      });

      const label = option.createDiv({ cls: 'radcal-pattern-label' });
      label.textContent = patternName;

      option.addEventListener('click', () => {
        // Deselect all
        grid.querySelectorAll('.radcal-pattern-option').forEach((o) => o.removeClass('is-selected'));
        // Select this one
        option.addClass('is-selected');
        this.selectedPattern = patternName;
      });
    }
  }

  private renderOpacitySection(el: HTMLElement): void {
    el.createEl('h3', { text: 'Opacity' });
    const container = el.createDiv({ cls: 'radcal-opacity-section' });

    // Value display
    const valueDisplay = container.createDiv({ cls: 'radcal-opacity-value' });
    valueDisplay.textContent = `${this.selectedOpacity}%`;

    // Slider
    const slider = container.createEl('input', {
      type: 'range',
      cls: 'radcal-opacity-slider',
    });
    slider.setAttribute('min', '0');
    slider.setAttribute('max', '100');
    slider.setAttribute('step', '5');
    slider.value = String(this.selectedOpacity);

    slider.addEventListener('input', () => {
      this.selectedOpacity = parseInt(slider.value, 10);
      valueDisplay.textContent = `${this.selectedOpacity}%`;
    });

    // Preset buttons
    const presets = container.createDiv({ cls: 'radcal-opacity-presets' });
    for (const preset of [25, 50, 75, 100]) {
      const btn = presets.createEl('button', {
        text: `${preset}%`,
        cls: `radcal-opacity-preset ${this.selectedOpacity === preset ? 'is-selected' : ''}`,
      });
      btn.addEventListener('click', () => {
        this.selectedOpacity = preset;
        slider.value = String(preset);
        valueDisplay.textContent = `${preset}%`;
        // Update preset button states
        presets.querySelectorAll('.radcal-opacity-preset').forEach((b) => b.removeClass('is-selected'));
        btn.addClass('is-selected');
      });
    }
  }

  private async applyChanges(): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(this.file, (fm) => {
        if (this.selectedColor) {
          fm['radcal-color'] = this.selectedColor;
        }
        if (this.selectedPattern) {
          fm['radcal-pattern'] = this.selectedPattern;
        }
        if (this.selectedOpacity !== 100) {
          fm['radcal-opacity'] = this.selectedOpacity;
        } else {
          // Remove opacity if it's 100 (default)
          delete fm['radcal-opacity'];
        }
      });

      new Notice('Appearance updated');
      this.onSave();
      this.close();
    } catch (error) {
      console.error('Failed to update appearance:', error);
      new Notice('Failed to update appearance');
    }
  }

  private isValidColor(value: unknown): value is RingColorName {
    return typeof value === 'string' && value in RING_COLORS;
  }

  private isValidPattern(value: unknown): value is PatternName {
    return typeof value === 'string' && PATTERN_NAMES.includes(value as PatternName);
  }
}
