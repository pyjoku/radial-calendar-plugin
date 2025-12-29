/**
 * Parser for radcal codeblock configuration
 */

import type { RadcalBlockConfig, RadcalRingConfig, YamlFilter, FilterExpression } from '../../core/domain/types/radcal-block';
import { DEFAULT_RADCAL_CONFIG } from '../../core/domain/types/radcal-block';
import type { RingColorName } from '../../core/domain/types';

/**
 * Parse radcal codeblock source into configuration
 */
export function parseRadcalConfig(source: string): RadcalBlockConfig {
  const config: RadcalBlockConfig = { ...DEFAULT_RADCAL_CONFIG };
  const lines = source.trim().split('\n');

  let inRingsBlock = false;
  let inFoldersBlock = false;
  let inFilterBlock = false;
  let filterIndent = 0;
  const filterLines: string[] = [];
  const rings: RadcalRingConfig[] = [];
  const folders: string[] = [];
  let currentRing: Partial<RadcalRingConfig> | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // Handle filter block (YAML structure)
    if (inFilterBlock) {
      const currentIndent = line.length - line.trimStart().length;
      if (currentIndent > filterIndent || trimmedLine.startsWith('-')) {
        filterLines.push(line);
        continue;
      } else {
        // End of filter block
        inFilterBlock = false;
        config.filter = parseFilterYaml(filterLines);
      }
    }

    // Check for list items in rings/folders blocks
    if (trimmedLine.startsWith('- ')) {
      if (inRingsBlock) {
        // Save previous ring if exists
        if (currentRing && currentRing.folder) {
          rings.push({
            folder: currentRing.folder,
            color: currentRing.color || 'blue',
            label: currentRing.label,
          });
        }
        // Start new ring - check if it's inline format
        const inlineMatch = trimmedLine.match(/^-\s*folder:\s*["']?([^"'\n]+)["']?/);
        if (inlineMatch) {
          currentRing = { folder: inlineMatch[1].trim() };
        } else {
          currentRing = {};
        }
        continue;
      }
      if (inFoldersBlock) {
        const folderValue = trimmedLine.slice(2).trim().replace(/["']/g, '');
        folders.push(folderValue);
        continue;
      }
    }

    // Check for nested ring properties (indented)
    if (inRingsBlock && currentRing && (line.startsWith('    ') || line.startsWith('\t'))) {
      const [key, ...rest] = trimmedLine.split(':');
      const value = rest.join(':').trim().replace(/["']/g, '');

      switch (key.trim()) {
        case 'folder':
          currentRing.folder = value;
          break;
        case 'color':
          currentRing.color = value as RingColorName;
          break;
        case 'label':
          currentRing.label = value;
          break;
      }
      continue;
    }

    // Parse key-value pairs
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmedLine.slice(0, colonIndex).trim();
    const value = trimmedLine.slice(colonIndex + 1).trim();

    // Check for block starts
    if (key === 'rings' && (!value || value === '')) {
      // Save any pending ring
      if (currentRing && currentRing.folder) {
        rings.push({
          folder: currentRing.folder,
          color: currentRing.color || 'blue',
          label: currentRing.label,
        });
      }
      inRingsBlock = true;
      inFoldersBlock = false;
      currentRing = null;
      continue;
    }

    if (key === 'folders' && (!value || value === '')) {
      inFoldersBlock = true;
      inRingsBlock = false;
      continue;
    }

    // End blocks when encountering non-indented key
    if (!line.startsWith(' ') && !line.startsWith('\t') && !trimmedLine.startsWith('-')) {
      if (inRingsBlock && currentRing && currentRing.folder) {
        rings.push({
          folder: currentRing.folder,
          color: currentRing.color || 'blue',
          label: currentRing.label,
        });
        currentRing = null;
      }
      inRingsBlock = false;
      inFoldersBlock = false;
    }

    // Parse simple values
    const cleanValue = value.replace(/["']/g, '');

    switch (key) {
      case 'year':
        config.year = parseInt(cleanValue, 10);
        break;
      case 'style':
        if (cleanValue === 'annual' || cleanValue === 'life') {
          config.style = cleanValue;
        }
        break;
      case 'dateProperty':
        config.dateProperty = cleanValue;
        break;
      case 'folder':
        config.folder = cleanValue;
        break;
      case 'filter':
      case 'filters': // Bases compatibility
        if (cleanValue) {
          // Inline filter string
          config.filter = cleanValue;
        } else {
          // Start YAML filter block
          inFilterBlock = true;
          filterIndent = line.indexOf(key); // Use actual key position
        }
        break;
      case 'showLabels':
        config.showLabels = cleanValue === 'true';
        break;
      case 'showToday':
        config.showToday = cleanValue === 'true';
        break;
      case 'showAnniversaries':
        config.showAnniversaries = cleanValue === 'true';
        break;
      case 'segments':
        if (['none', 'seasons', 'quarters', 'weeks'].includes(cleanValue)) {
          config.segments = cleanValue as 'none' | 'seasons' | 'quarters' | 'weeks';
        }
        break;
      case 'birthYear':
        config.birthYear = parseInt(cleanValue, 10);
        break;
      case 'lifespan':
        config.lifespan = parseInt(cleanValue, 10);
        break;
    }
  }

  // Save final ring if exists
  if (currentRing && currentRing.folder) {
    rings.push({
      folder: currentRing.folder,
      color: currentRing.color || 'blue',
      label: currentRing.label,
    });
  }

  // Finalize filter block if still open
  if (inFilterBlock && filterLines.length > 0) {
    config.filter = parseFilterYaml(filterLines);
  }

  // Apply collected arrays
  if (rings.length > 0) {
    config.rings = rings;
  }
  if (folders.length > 0) {
    config.folders = folders;
  }

  return config;
}

/**
 * Parse YAML filter structure into FilterExpression
 */
function parseFilterYaml(lines: string[]): YamlFilter {
  const result: YamlFilter = {};

  let currentKey: 'and' | 'or' | 'not' | null = null;
  const items: (string | YamlFilter)[] = [];
  let nestedLines: string[] = [];
  let nestedIndent = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = line.length - line.trimStart().length;

    // Check if we're collecting nested lines
    if (nestedIndent >= 0) {
      if (indent > nestedIndent) {
        nestedLines.push(line);
        continue;
      } else {
        // End of nested block
        if (nestedLines.length > 0) {
          items.push(parseFilterYaml(nestedLines));
          nestedLines = [];
        }
        nestedIndent = -1;
      }
    }

    // Check for key (and:, or:, not:)
    if (trimmed === 'and:' || trimmed === 'or:' || trimmed === 'not:') {
      // Save previous items
      if (currentKey && items.length > 0) {
        result[currentKey] = [...items];
        items.length = 0;
      }
      currentKey = trimmed.slice(0, -1) as 'and' | 'or' | 'not';
      continue;
    }

    // Check for list item
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();

      // Check if it's a nested structure (and:, or:, not:)
      if (value === 'and:' || value === 'or:' || value === 'not:') {
        nestedIndent = indent;
        nestedLines = [line];
      } else {
        // It's a filter string
        items.push(value);
      }
    }
  }

  // Handle remaining nested lines
  if (nestedLines.length > 0) {
    items.push(parseFilterYaml(nestedLines));
  }

  // Save final items
  if (currentKey && items.length > 0) {
    result[currentKey] = items;
  }

  return result;
}
