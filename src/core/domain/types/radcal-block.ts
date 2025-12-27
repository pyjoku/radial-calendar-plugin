/**
 * Types for radcal codeblock configuration
 */

import type { RingColorName } from './index';

/**
 * YAML filter structure (recursive)
 */
export interface YamlFilter {
  and?: (string | YamlFilter)[];
  or?: (string | YamlFilter)[];
  not?: (string | YamlFilter)[];
}

/**
 * Filter expression - string or YAML structure
 */
export type FilterExpression = string | YamlFilter;

/**
 * Configuration for a radcal codeblock
 */
export interface RadcalBlockConfig {
  // Basis
  year?: number;
  style: 'annual' | 'life';

  // Date property to use for positioning entries
  // Examples: "created", "date", "published", "Birthday"
  // Default: uses the entry's existing date (from CalendarService)
  dateProperty?: string;

  // Filter (Bases-compatible)
  filter?: FilterExpression;

  // Legacy filter (deprecated, use filter instead)
  folder?: string;
  folders?: string[];

  // Ringe
  rings?: RadcalRingConfig[];

  // Anzeige
  showLabels: boolean;
  showToday: boolean;
  showAnniversaries: boolean;
  segments: 'none' | 'seasons' | 'quarters' | 'weeks';

  // Life-View
  birthYear?: number;
  lifespan?: number;
}

/**
 * Ring configuration for radcal codeblock
 */
export interface RadcalRingConfig {
  folder: string;
  color: RingColorName;
  label?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_RADCAL_CONFIG: RadcalBlockConfig = {
  style: 'annual',
  showLabels: true,
  showToday: true,
  showAnniversaries: false,
  segments: 'none',
};
