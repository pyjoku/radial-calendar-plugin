import { describe, it, expect } from 'vitest';
import {
  SVG_SIZE, CENTER, OUTER_RADIUS, INNER_RADIUS,
  DATA_RING_INNER, RING_GAP, MIN_RING_WIDTH,
  calculateRingRadii,
} from '../RingLayout';

describe('RingLayout constants', () => {
  it('SVG_SIZE is 800', () => {
    expect(SVG_SIZE).toBe(800);
  });

  it('CENTER is half of SVG_SIZE', () => {
    expect(CENTER).toBe(400);
  });

  it('OUTER_RADIUS is 380', () => {
    expect(OUTER_RADIUS).toBe(380);
  });

  it('INNER_RADIUS is 145', () => {
    expect(INNER_RADIUS).toBe(145);
  });

  it('DATA_RING_INNER is INNER_RADIUS + 30', () => {
    expect(DATA_RING_INNER).toBe(175);
  });
});

describe('calculateRingRadii', () => {
  it('returns empty map for 0 rings', () => {
    const radii = calculateRingRadii(0);
    expect(radii.size).toBe(0);
  });

  it('returns single ring for 1 ring with outer at OUTER_RADIUS', () => {
    const radii = calculateRingRadii(1);
    expect(radii.size).toBe(1);
    const r = radii.get(0)!;
    expect(r.outerRadius).toBe(OUTER_RADIUS);
    expect(r.innerRadius).toBeGreaterThanOrEqual(DATA_RING_INNER);
  });

  it('ring 0 outer is always OUTER_RADIUS', () => {
    const radii = calculateRingRadii(3);
    expect(radii.get(0)!.outerRadius).toBe(OUTER_RADIUS);
  });

  it('rings are ordered outermost first (ring 0 outer > ring 1 outer)', () => {
    const radii = calculateRingRadii(3);
    expect(radii.get(0)!.outerRadius).toBeGreaterThan(radii.get(1)!.outerRadius);
    expect(radii.get(1)!.outerRadius).toBeGreaterThan(radii.get(2)!.outerRadius);
  });

  it('each ring outer > inner', () => {
    const radii = calculateRingRadii(3);
    for (let i = 0; i < 3; i++) {
      const r = radii.get(i)!;
      expect(r.outerRadius).toBeGreaterThan(r.innerRadius);
    }
  });

  it('respects MIN_RING_WIDTH for many rings', () => {
    const radii = calculateRingRadii(20);
    for (const [, r] of radii) {
      expect(r.outerRadius - r.innerRadius).toBeGreaterThanOrEqual(MIN_RING_WIDTH);
    }
  });
});
