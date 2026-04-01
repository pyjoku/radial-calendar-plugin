/**
 * SvgArc - Pure functions for SVG arc path generation.
 *
 * Extracted from RadialCalendarView.ts (lines 3996-4026),
 * RadcalRenderer.ts (lines 297-330), and
 * RadialCalendarBasesView.ts.
 *
 * All functions are pure (no DOM, no side effects).
 */

/**
 * Creates an SVG arc path (annular sector) between two radii and two angles.
 *
 * Angle convention: 0 = 12 o'clock (top), increasing clockwise.
 * Internally converts to SVG coordinates (0 = 3 o'clock, increasing clockwise).
 *
 * @param center - Center coordinate (x and y are equal for a square viewBox)
 * @param innerR - Inner radius of the arc
 * @param outerR - Outer radius of the arc
 * @param startAngle - Start angle in radians (0 = top, clockwise)
 * @param endAngle - End angle in radians (0 = top, clockwise)
 * @returns SVG path data string
 * @warning RadialCalendarBasesView uses a different convention: its angles are
 * already in SVG space (0 = 3 o'clock) with no PI/2 offset. When migrating
 * BasesView call sites to this function (Task 6), callers must ADD Math.PI/2
 * to their angles, or remove the manual offset from angle calculations.
 */
export function createArcPath(
  center: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const startRad = startAngle - Math.PI / 2;
  const endRad = endAngle - Math.PI / 2;

  const innerStartX = center + innerR * Math.cos(startRad);
  const innerStartY = center + innerR * Math.sin(startRad);
  const innerEndX = center + innerR * Math.cos(endRad);
  const innerEndY = center + innerR * Math.sin(endRad);
  const outerStartX = center + outerR * Math.cos(startRad);
  const outerStartY = center + outerR * Math.sin(startRad);
  const outerEndX = center + outerR * Math.cos(endRad);
  const outerEndY = center + outerR * Math.sin(endRad);

  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return `
    M ${innerStartX} ${innerStartY}
    L ${outerStartX} ${outerStartY}
    A ${outerR} ${outerR} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY}
    L ${innerEndX} ${innerEndY}
    A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY}
    Z
  `;
}

/**
 * Converts month number (1-indexed) to start angle in radians.
 * January = 0 (12 o'clock), each month spans PI/6 radians (30°).
 *
 * @param month - Month number, 1-indexed (1 = January, 12 = December)
 */
export function monthToAngle(month: number): number {
  return ((month - 1) * Math.PI) / 6;
}

/**
 * Converts month number (0-indexed) to start angle in radians.
 * Used by RadialCalendarBasesView which uses 0-indexed months.
 *
 * @param month - Month number, 0-indexed (0 = January, 11 = December)
 */
export function monthToAngle0(month: number): number {
  return (month / 12) * 2 * Math.PI;
}
