/**
 * ColorSuggesterModal - Color Selection Modal for Radial Calendar
 *
 * Provides a fuzzy-searchable list of all available Radial Calendar colors.
 * Shows color name with hex preview for easy selection.
 */

import { App, FuzzySuggestModal } from 'obsidian';
import { RING_COLORS, RingColorName } from '../../core/domain/types';

interface ColorItem {
  name: RingColorName;
  hex: string;
}

export class ColorSuggesterModal extends FuzzySuggestModal<ColorItem> {
  private onSelect: (color: RingColorName) => void;

  constructor(app: App, onSelect: (color: RingColorName) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder('Search for a color...');
  }

  getItems(): ColorItem[] {
    return Object.entries(RING_COLORS).map(([name, hex]) => ({
      name: name as RingColorName,
      hex,
    }));
  }

  getItemText(item: ColorItem): string {
    return item.name;
  }

  renderSuggestion(item: ColorItem, el: HTMLElement): void {
    el.addClass('radial-calendar-color-suggestion');

    // Color preview circle
    const previewEl = el.createSpan({ cls: 'radial-calendar-color-preview' });
    previewEl.style.backgroundColor = item.hex;
    previewEl.style.width = '16px';
    previewEl.style.height = '16px';
    previewEl.style.borderRadius = '50%';
    previewEl.style.display = 'inline-block';
    previewEl.style.marginRight = '8px';
    previewEl.style.verticalAlign = 'middle';

    // Color name
    const nameEl = el.createSpan({ cls: 'radial-calendar-color-name' });
    nameEl.setText(item.name.charAt(0).toUpperCase() + item.name.slice(1));
    nameEl.style.verticalAlign = 'middle';

    // Hex value (muted)
    const hexEl = el.createSpan({ cls: 'radial-calendar-color-hex' });
    hexEl.setText(` (${item.hex})`);
    hexEl.style.color = 'var(--text-muted)';
    hexEl.style.fontSize = '12px';
    hexEl.style.verticalAlign = 'middle';
  }

  onChooseItem(item: ColorItem, _evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item.name);
  }
}
