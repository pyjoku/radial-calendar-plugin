/**
 * RingLayout - SVG layout constants and ring radii calculation.
 *
 * Single source of truth for all SVG dimensions.
 * Extracted from RadialCalendarView.ts (lines 37-84),
 * RadcalRenderer.ts (lines 13-20), and RadialCalendarBasesView.ts.
 */

export const SVG_SIZE = 800;
export const CENTER = SVG_SIZE / 2; // 400
export const MAX_RADIUS = CENTER - 20; // 380

// Annual/Period View Layout
export const OUTER_RADIUS = 380;
export const LABEL_RING_WIDTH = 30;
export const INNER_RADIUS = 145;
export const DATA_RING_INNER = INNER_RADIUS + LABEL_RING_WIDTH; // 175
export const MONTH_LABEL_RADIUS = INNER_RADIUS + LABEL_RING_WIDTH * 0.65;

// Ring sizing
export const DAY_RING_WIDTH = (OUTER_RADIUS - INNER_RADIUS) / 31;
export const RING_GAP = 1;
export const MIN_RING_WIDTH = 20;

// Outer segment constants
export const SEGMENT_TICK_INNER = OUTER_RADIUS + 2;
export const SEGMENT_TICK_OUTER = OUTER_RADIUS + 8;
export const SEGMENT_LABEL_RADIUS = OUTER_RADIUS + 14;

// Anniversary ring constants
export const ANNIVERSARY_RING_RADIUS = OUTER_RADIUS + 12;
export const ANNIVERSARY_DOT_RADIUS = 4;

// Life View Proportions
export const LIFE_VIEW_PROPORTIONS = {
  center: 0.35,
  yearRing: 0.12,
  gap1: 0.01,
  lifePhases: 0.38,
  gap2: 0.01,
  lifeRing: 0.10,
};

export const CENTER_RADIUS = MAX_RADIUS * LIFE_VIEW_PROPORTIONS.center;
export const YEAR_RING_INNER = CENTER_RADIUS + (MAX_RADIUS * LIFE_VIEW_PROPORTIONS.gap1);
export const YEAR_RING_OUTER = YEAR_RING_INNER + (MAX_RADIUS * LIFE_VIEW_PROPORTIONS.yearRing);
export const LIFE_PHASES_RING_INNER = YEAR_RING_OUTER + (MAX_RADIUS * LIFE_VIEW_PROPORTIONS.gap1);
export const LIFE_PHASES_RING_OUTER = LIFE_PHASES_RING_INNER + (MAX_RADIUS * LIFE_VIEW_PROPORTIONS.lifePhases);
export const LIFE_RING_INNER = LIFE_PHASES_RING_OUTER + (MAX_RADIUS * LIFE_VIEW_PROPORTIONS.gap2);
export const LIFE_RING_OUTER = LIFE_RING_INNER + (MAX_RADIUS * LIFE_VIEW_PROPORTIONS.lifeRing);

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const FULL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface RingRadii {
  innerRadius: number;
  outerRadius: number;
}

/**
 * Calculates radii for N concentric data rings within the data ring area.
 * Ring 0 = outermost. Data rings span from DATA_RING_INNER to OUTER_RADIUS.
 * Enforces MIN_RING_WIDTH regardless of ring count.
 */
export function calculateRingRadii(ringCount: number): Map<number, RingRadii> {
  const radiiMap = new Map<number, RingRadii>();
  if (ringCount === 0) return radiiMap;

  // Calculate ring width, enforcing MIN_RING_WIDTH
  const totalGapSpace = (ringCount - 1) * RING_GAP;
  const availableSpace = OUTER_RADIUS - DATA_RING_INNER;
  const neededSpace = ringCount * MIN_RING_WIDTH + totalGapSpace;

  let ringWidth: number;
  if (availableSpace >= neededSpace) {
    // Enough space to distribute equally
    ringWidth = (availableSpace - totalGapSpace) / ringCount;
  } else {
    // Not enough space; use MIN_RING_WIDTH and shrink total space
    ringWidth = MIN_RING_WIDTH;
  }

  for (let order = 0; order < ringCount; order++) {
    const outerRadius = OUTER_RADIUS - (order * (ringWidth + RING_GAP));
    const innerRadius = outerRadius - ringWidth;
    radiiMap.set(order, { outerRadius, innerRadius });
  }

  return radiiMap;
}
