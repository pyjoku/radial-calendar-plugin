/**
 * OuterSegmentRenderer - Renders outer segment tick marks and labels.
 *
 * Extracted from RadialCalendarView.ts (lines 4110-4274),
 * "Outer Segment Rendering" section.
 *
 * Handles rendering of configurable segments (seasons, quarters, semesters,
 * weeks, 10-day phases, custom) around the outer edge of the radial calendar.
 */

import type { OuterSegmentConfig, LifeActConfig, RadialCalendarSettings } from '../../core/domain/types';
import {
  RING_COLORS,
  PREDEFINED_SEASONS,
  PREDEFINED_QUARTERS,
  PREDEFINED_SEMESTERS,
  generate10DayPhases,
  generateWeekSegments,
} from '../../core/domain/types';
import {
  CENTER,
  SEGMENT_TICK_INNER,
  SEGMENT_TICK_OUTER,
  SEGMENT_LABEL_RADIUS,
} from '../svg/RingLayout';

export class OuterSegmentRenderer {
  private settings: RadialCalendarSettings;

  constructor(settings: RadialCalendarSettings) {
    this.settings = settings;
  }

  /**
   * Renders outer segment tick marks and labels onto the given SVG element.
   */
  renderOuterSegments(svg: SVGSVGElement, year: number): void {
    const segments = this.getSegmentsForCurrentView();
    if (segments.length === 0) return;

    for (const segment of segments) {
      this.renderSegmentTick(svg, segment, year);
    }
  }

  /**
   * Gets the segments based on current view and settings.
   */
  private getSegmentsForCurrentView(): OuterSegmentConfig[] {
    const settings = this.settings;

    // For now, only support annual view segments
    if (settings.currentView === 'life') {
      // Convert life acts to segment format
      return this.lifeActsToSegments(settings.lifeActs);
    }

    switch (settings.annualSegmentType) {
      case 'seasons':
        return PREDEFINED_SEASONS;
      case 'quarters':
        return PREDEFINED_QUARTERS;
      case 'semester':
        return PREDEFINED_SEMESTERS;
      case 'ten-days':
        return generate10DayPhases();
      case 'weeks':
        return generateWeekSegments();
      case 'custom':
        return settings.customSegments;
      case 'none':
      default:
        return [];
    }
  }

  /**
   * Converts life acts to outer segment format.
   */
  private lifeActsToSegments(lifeActs: readonly LifeActConfig[]): OuterSegmentConfig[] {
    const { expectedLifespan } = this.settings;
    const totalYears = expectedLifespan;

    // Convert age-based life acts to day-of-year equivalent for positioning
    return lifeActs.map(act => {
      // Map age to "day of life" (treating life like a year)
      const startDay = Math.floor((act.startAge / totalYears) * 365) + 1;
      const endDay = Math.floor((act.endAge / totalYears) * 365);

      return {
        id: act.id,
        label: act.label,
        startDay,
        endDay,
        color: act.color,
      };
    });
  }

  /**
   * Renders a single segment tick and label.
   */
  private renderSegmentTick(svg: SVGSVGElement, segment: OuterSegmentConfig, year: number): void {
    const showLabels = this.settings.showSegmentLabels;

    // Calculate angle for start position
    const startAngle = this.dayOfYearToAngle(segment.startDay);
    const endAngle = segment.endDay > segment.startDay
      ? this.dayOfYearToAngle(segment.endDay)
      : this.dayOfYearToAngle(segment.endDay) + 2 * Math.PI; // Handle wrap-around

    // Calculate tick position
    const tickAngle = startAngle - Math.PI / 2; // SVG coordinate adjustment
    const x1 = CENTER + SEGMENT_TICK_INNER * Math.cos(tickAngle);
    const y1 = CENTER + SEGMENT_TICK_INNER * Math.sin(tickAngle);
    const x2 = CENTER + SEGMENT_TICK_OUTER * Math.cos(tickAngle);
    const y2 = CENTER + SEGMENT_TICK_OUTER * Math.sin(tickAngle);

    // Render tick line
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tick.setAttribute('x1', String(x1));
    tick.setAttribute('y1', String(y1));
    tick.setAttribute('x2', String(x2));
    tick.setAttribute('y2', String(y2));
    tick.setAttribute('class', 'rc-segment-tick');

    // Apply custom color if specified
    if (segment.color) {
      tick.style.stroke = RING_COLORS[segment.color];
    }

    svg.appendChild(tick);

    // Render label if enabled
    if (showLabels) {
      // Position label in the middle of the segment
      // For wrap-around segments (like winter), calculate midpoint correctly
      let midAngle: number;
      if (segment.endDay > segment.startDay) {
        // Normal segment: just average the angles
        midAngle = (startAngle + endAngle) / 2;
      } else {
        // Wrap-around segment: endAngle already has +2π, use it directly
        midAngle = (startAngle + endAngle) / 2;
        // Normalize if > 2π
        if (midAngle > 2 * Math.PI) {
          midAngle -= 2 * Math.PI;
        }
      }

      const labelAngle = midAngle - Math.PI / 2;
      const labelX = CENTER + SEGMENT_LABEL_RADIUS * Math.cos(labelAngle);
      const labelY = CENTER + SEGMENT_LABEL_RADIUS * Math.sin(labelAngle);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(labelX));
      label.setAttribute('y', String(labelY));
      label.setAttribute('class', 'rc-segment-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');

      // Rotate text to follow the circle (radial orientation)
      const rotationAngle = (midAngle * 180) / Math.PI;
      // Flip text if on bottom half to keep it readable
      const adjustedRotation = rotationAngle > 90 && rotationAngle < 270
        ? rotationAngle + 180
        : rotationAngle;
      label.setAttribute('transform', `rotate(${adjustedRotation}, ${labelX}, ${labelY})`);

      if (segment.color) {
        label.style.fill = RING_COLORS[segment.color];
      }

      label.textContent = segment.label;
      svg.appendChild(label);
    }
  }

  /**
   * Converts day of year (1-366) to angle in radians.
   * January 1 = 0 radians (top), December 31 = 2π.
   */
  private dayOfYearToAngle(dayOfYear: number): number {
    // Map day 1-365 to angle 0-2π
    return ((dayOfYear - 1) / 365) * 2 * Math.PI;
  }
}
