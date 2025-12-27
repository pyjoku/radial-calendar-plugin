/**
 * Types for radcal codeblock configuration
 */

import type { RingColorName } from './index';

/**
 * Configuration for a radcal codeblock
 */
export interface RadcalBlockConfig {
  // Basis
  year?: number;
  style: 'annual' | 'life';

  // Filter
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
