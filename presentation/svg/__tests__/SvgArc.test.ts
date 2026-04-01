import { describe, it, expect } from 'vitest';
import { createArcPath, monthToAngle, monthToAngle0 } from '../SvgArc';

describe('createArcPath', () => {
  const CENTER = 400;

  it('returns a valid SVG path string with M, L, A, Z commands', () => {
    const path = createArcPath(CENTER, 100, 200, 0, Math.PI / 6);
    expect(path).toContain('M');
    expect(path).toContain('L');
    expect(path).toContain('A');
    expect(path).toContain('Z');
  });

  it('handles zero-width arc gracefully', () => {
    const path = createArcPath(CENTER, 100, 200, 0, 0);
    expect(path).toContain('M');
  });

  it('sets large arc flag for arcs > PI', () => {
    const path = createArcPath(CENTER, 100, 200, 0, Math.PI + 0.1);
    expect(path).toMatch(/A \d+\.?\d* \d+\.?\d* 0 1 1/);
  });

  it('clears large arc flag for arcs <= PI', () => {
    const path = createArcPath(CENTER, 100, 200, 0, Math.PI / 6);
    expect(path).toMatch(/A \d+\.?\d* \d+\.?\d* 0 0 1/);
  });

  it('produces a string for known radcal inputs', () => {
    const path = createArcPath(400, 145, 380, 0, Math.PI / 6);
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
  });
});

describe('monthToAngle', () => {
  it('returns 0 for January (month 1)', () => {
    expect(monthToAngle(1)).toBe(0);
  });

  it('returns PI/6 for February (month 2)', () => {
    expect(monthToAngle(2)).toBeCloseTo(Math.PI / 6);
  });

  it('returns PI for July (month 7)', () => {
    expect(monthToAngle(7)).toBeCloseTo(Math.PI);
  });

  it('returns 11*PI/6 for December (month 12)', () => {
    expect(monthToAngle(12)).toBeCloseTo((11 * Math.PI) / 6);
  });
});

describe('monthToAngle0', () => {
  it('returns 0 for January (month 0)', () => {
    expect(monthToAngle0(0)).toBe(0);
  });

  it('returns PI for July (month 6)', () => {
    expect(monthToAngle0(6)).toBeCloseTo(Math.PI);
  });

  it('returns 11*PI/6 for December (month 11)', () => {
    expect(monthToAngle0(11)).toBeCloseTo((11 * Math.PI) / 6);
  });

  it('returns 2*PI for December+1 (month 12)', () => {
    expect(monthToAngle0(12)).toBeCloseTo(2 * Math.PI);
  });
});
