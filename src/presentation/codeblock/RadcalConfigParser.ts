/**
 * Parser for radcal codeblock configuration
 */

import type { RadcalBlockConfig, RadcalRingConfig } from '../../core/domain/types/radcal-block';
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
  const rings: RadcalRingConfig[] = [];
  const folders: string[] = [];
  let currentRing: Partial<RadcalRingConfig> | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
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
      case 'folder':
        config.folder = cleanValue;
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

  // Apply collected arrays
  if (rings.length > 0) {
    config.rings = rings;
  }
  if (folders.length > 0) {
    config.folders = folders;
  }

  return config;
}
