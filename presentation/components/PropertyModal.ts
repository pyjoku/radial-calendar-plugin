/**
 * PropertyModal - Modal for setting radcal properties (color, pattern, opacity)
 *
 * Provides a visual picker for:
 * - Color selection (grid of color swatches)
 * - Pattern selection (grid of pattern options)
 * - Opacity selection (slider)
 */

import { Modal, App, Setting } from 'obsidian';
import { RING_COLORS, PATTERN_NAMES, type RingColorName, type PatternName } from '../../core/domain/types';

export type PropertyType = 'color' | 'pattern' | 'opacity';

export class RadcalPropertyModal extends Modal {
  private propertyType: PropertyType;
  private onSubmit: (value: string | number) => void;
  private currentValue?: string | number;

  constructor(
    app: App,
    type: PropertyType,
    onSubmit: (value: string | number) => void,
    currentValue?: string | number
  ) {
    super(app);
    this.propertyType = type;
    this.onSubmit = onSubmit;
    this.currentValue = currentValue;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('radcal-property-modal');

    const title = {
      color: 'Select Color',
      pattern: 'Select Pattern',
      opacity: 'Set Opacity',
    }[this.propertyType];

    contentEl.createEl('h2', { text: title });

    switch (this.propertyType) {
      case 'color':
        this.renderColorPicker(contentEl);
        break;
      case 'pattern':
        this.renderPatternPicker(contentEl);
        break;
      case 'opacity':
        this.renderOpacitySlider(contentEl);
        break;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * Renders a grid of color swatches
   */
  private renderColorPicker(el: HTMLElement): void {
    const grid = el.createDiv({ cls: 'radcal-color-grid' });

    for (const [colorName, colorHex] of Object.entries(RING_COLORS)) {
      const swatch = grid.createDiv({
        cls: `radcal-color-swatch ${this.currentValue === colorName ? 'is-selected' : ''}`,
      });
      swatch.style.backgroundColor = colorHex;
      swatch.setAttribute('data-color', colorName);
      swatch.setAttribute('title', colorName);

      // Add color name below swatch
      const label = swatch.createDiv({ cls: 'radcal-color-label' });
      label.textContent = colorName;

      swatch.addEventListener('click', () => {
        this.onSubmit(colorName);
        this.close();
      });
    }
  }

  /**
   * Renders a grid of pattern options
   */
  private renderPatternPicker(el: HTMLElement): void {
    const grid = el.createDiv({ cls: 'radcal-pattern-grid' });

    const patternDescriptions: Record<PatternName, string> = {
      solid: 'Solid fill',
      striped: 'Diagonal stripes',
      horizontal: 'Horizontal lines',
      vertical: 'Vertical lines',
      dotted: 'Dot pattern',
      crosshatch: 'Crossed diagonals',
      grid: 'Grid pattern',
      wavy: 'Wavy lines',
    };

    for (const patternName of PATTERN_NAMES) {
      const option = grid.createDiv({
        cls: `radcal-pattern-option ${this.currentValue === patternName ? 'is-selected' : ''}`,
      });

      // Create mini SVG preview of pattern
      const preview = this.createPatternPreview(patternName);
      option.appendChild(preview);

      const label = option.createDiv({ cls: 'radcal-pattern-label' });
      label.textContent = patternName;

      option.setAttribute('title', patternDescriptions[patternName]);

      option.addEventListener('click', () => {
        this.onSubmit(patternName);
        this.close();
      });
    }
  }

  /**
   * Creates a mini SVG preview of a pattern
   */
  private createPatternPreview(patternName: PatternName): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '40');
    svg.setAttribute('height', '40');
    svg.setAttribute('viewBox', '0 0 40 40');
    svg.classList.add('radcal-pattern-preview');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '40');
    rect.setAttribute('height', '40');
    rect.setAttribute('fill', 'var(--interactive-accent)');

    svg.appendChild(rect);

    // Add pattern overlay
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    overlay.setAttribute('stroke', 'var(--text-on-accent)');
    overlay.setAttribute('stroke-width', '2');
    overlay.setAttribute('fill', 'none');

    switch (patternName) {
      case 'striped':
        for (let i = -40; i < 80; i += 8) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', String(i));
          line.setAttribute('y1', '0');
          line.setAttribute('x2', String(i + 40));
          line.setAttribute('y2', '40');
          overlay.appendChild(line);
        }
        break;

      case 'horizontal':
        for (let y = 5; y < 40; y += 10) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', '0');
          line.setAttribute('y1', String(y));
          line.setAttribute('x2', '40');
          line.setAttribute('y2', String(y));
          overlay.appendChild(line);
        }
        break;

      case 'vertical':
        for (let x = 5; x < 40; x += 10) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', String(x));
          line.setAttribute('y1', '0');
          line.setAttribute('x2', String(x));
          line.setAttribute('y2', '40');
          overlay.appendChild(line);
        }
        break;

      case 'dotted':
        overlay.setAttribute('fill', 'var(--text-on-accent)');
        for (let x = 10; x < 40; x += 15) {
          for (let y = 10; y < 40; y += 15) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', String(x));
            circle.setAttribute('cy', String(y));
            circle.setAttribute('r', '3');
            overlay.appendChild(circle);
          }
        }
        break;

      case 'crosshatch':
        for (let i = -40; i < 80; i += 10) {
          const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line1.setAttribute('x1', String(i));
          line1.setAttribute('y1', '0');
          line1.setAttribute('x2', String(i + 40));
          line1.setAttribute('y2', '40');
          overlay.appendChild(line1);

          const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line2.setAttribute('x1', String(i + 40));
          line2.setAttribute('y1', '0');
          line2.setAttribute('x2', String(i));
          line2.setAttribute('y2', '40');
          overlay.appendChild(line2);
        }
        break;

      case 'grid':
        for (let x = 10; x < 40; x += 10) {
          const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          vLine.setAttribute('x1', String(x));
          vLine.setAttribute('y1', '0');
          vLine.setAttribute('x2', String(x));
          vLine.setAttribute('y2', '40');
          overlay.appendChild(vLine);
        }
        for (let y = 10; y < 40; y += 10) {
          const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          hLine.setAttribute('x1', '0');
          hLine.setAttribute('y1', String(y));
          hLine.setAttribute('x2', '40');
          hLine.setAttribute('y2', String(y));
          overlay.appendChild(hLine);
        }
        break;

      case 'wavy':
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M0,10 Q10,5 20,10 T40,10 M0,25 Q10,20 20,25 T40,25');
        overlay.appendChild(path);
        break;

      case 'solid':
      default:
        // No overlay for solid
        break;
    }

    svg.appendChild(overlay);
    return svg;
  }

  /**
   * Renders an opacity slider
   */
  private renderOpacitySlider(el: HTMLElement): void {
    const currentOpacity = typeof this.currentValue === 'number' ? this.currentValue : 100;

    const container = el.createDiv({ cls: 'radcal-opacity-container' });

    // Value display
    const valueDisplay = container.createDiv({ cls: 'radcal-opacity-value' });
    valueDisplay.textContent = `${currentOpacity}%`;

    // Slider
    const slider = container.createEl('input', {
      type: 'range',
      cls: 'radcal-opacity-slider',
    });
    slider.setAttribute('min', '0');
    slider.setAttribute('max', '100');
    slider.setAttribute('step', '5');
    slider.value = String(currentOpacity);

    slider.addEventListener('input', () => {
      valueDisplay.textContent = `${slider.value}%`;
    });

    // Preset buttons
    const presets = container.createDiv({ cls: 'radcal-opacity-presets' });
    for (const preset of [25, 50, 75, 100]) {
      const btn = presets.createEl('button', {
        text: `${preset}%`,
        cls: `radcal-opacity-preset ${currentOpacity === preset ? 'is-selected' : ''}`,
      });
      btn.addEventListener('click', () => {
        this.onSubmit(preset);
        this.close();
      });
    }

    // Apply button
    new Setting(container)
      .addButton((button) => {
        button
          .setButtonText('Apply')
          .setCta()
          .onClick(() => {
            this.onSubmit(parseInt(slider.value, 10));
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Cancel')
          .onClick(() => {
            this.close();
          });
      });
  }
}
