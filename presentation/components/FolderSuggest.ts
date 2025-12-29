/**
 * FolderSuggest - Folder Autocomplete Component for Obsidian
 *
 * Provides folder autocomplete functionality using Obsidian's AbstractInputSuggest.
 * Shows all folders in the vault as the user types and filters based on input text.
 */

import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private textInputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.textInputEl = inputEl;
  }

  /**
   * Get all folders from the vault that match the input query.
   * Filters folders case-insensitively based on the input text.
   */
  getSuggestions(inputStr: string): TFolder[] {
    const allFolders = this.getAllFolders();
    const lowerInput = inputStr.toLowerCase().trim();

    if (lowerInput === '') {
      // Return all folders when input is empty
      return allFolders;
    }

    // Filter folders by path (case-insensitive)
    return allFolders.filter((folder) =>
      folder.path.toLowerCase().includes(lowerInput)
    );
  }

  /**
   * Render a folder suggestion in the dropdown.
   */
  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.addClass('folder-suggest-item');

    // Create folder icon
    const iconEl = el.createSpan({ cls: 'folder-suggest-icon' });
    iconEl.innerHTML = this.getFolderIcon();

    // Create folder path text
    const textEl = el.createSpan({ cls: 'folder-suggest-text' });
    textEl.setText(folder.path || '/');
  }

  /**
   * Handle selection of a folder suggestion.
   * Updates the input field with the selected folder path.
   */
  selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    this.textInputEl.value = folder.path;
    this.textInputEl.trigger('input');
    this.close();
  }

  /**
   * Get all folders in the vault, sorted alphabetically by path.
   */
  private getAllFolders(): TFolder[] {
    const folders: TFolder[] = [];

    const collectFolders = (folder: TFolder): void => {
      folders.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) {
          collectFolders(child);
        }
      }
    };

    // Start from vault root
    const root = this.app.vault.getRoot();
    collectFolders(root);

    // Sort folders alphabetically by path (root first)
    return folders.sort((a, b) => {
      // Root folder should always be first
      if (a.isRoot()) return -1;
      if (b.isRoot()) return 1;
      return a.path.localeCompare(b.path);
    });
  }

  /**
   * Get SVG icon for folder.
   */
  private getFolderIcon(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  }
}
