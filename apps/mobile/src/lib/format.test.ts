import { describe, expect, it } from 'vitest';
import { chartGeometry } from './chart';
import { formatChange, formatHeight, formatWeight, parseDecimal, todayIso } from './format';

describe('format', () => {
  it('formats weight and change in both systems', () => {
    expect(formatWeight(70, 'metric')).toBe('70 kg');
    expect(formatWeight(70, 'imperial')).toBe('154.3 lb');
    expect(formatChange(-1.24, 'metric')).toBe('−1.2 kg');
    expect(formatChange(0.4, 'imperial')).toBe('+0.9 lb');
    expect(formatChange(0.01, 'metric')).toBe('no change');
    expect(formatChange(null, 'metric')).toBeNull();
    expect(formatHeight(175.26, 'imperial')).toBe('5 ft 9 in');
    expect(formatHeight(175.4, 'metric')).toBe('175 cm');
  });
  it('parses decimals strictly', () => {
    expect(parseDecimal('72,5')).toBe(72.5);
    expect(parseDecimal(' 80 ')).toBe(80);
    for (const bad of ['', 'abc', '-5', '1e3', '7 2', '1.2.3'])
      expect(parseDecimal(bad)).toBeNull();
  });
  it('formats a local date', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('chartGeometry', () => {
  const p = (d: number, kg: number) => ({
    weightKg: kg,
    measuredAt: new Date(Date.UTC(2026, 2, d)).toISOString(),
  });
  it('returns null for no data and centers a single point', () => {
    expect(chartGeometry([], 300, 150)).toBeNull();
    const g = chartGeometry([p(1, 70)], 300, 150)!;
    expect(g.dots).toHaveLength(1);
    expect(g.dots[0]!.x).toBe(150);
  });
  it('maps time to x ascending and heavier to higher on screen (smaller y)', () => {
    const g = chartGeometry([p(10, 70), p(1, 80), p(5, 75)], 300, 150, 16)!;
    expect(g.dots.map((d) => Math.round(d.x))).toEqual([16, 135, 284]);
    expect(g.dots[0]!.y).toBeLessThan(g.dots[1]!.y);
    expect(g.dots[1]!.y).toBeLessThan(g.dots[2]!.y);
    for (const d of g.dots) expect(d.y).toBeGreaterThanOrEqual(16);
  });
  it('keeps a goal target in range', () => {
    const g = chartGeometry([p(1, 80), p(8, 79)], 300, 150, 16, 70)!;
    expect(g.targetY).not.toBeNull();
    expect(g.targetY!).toBeLessThanOrEqual(150 - 16 + 0.01);
    expect(g.yMin).toBeLessThan(70);
  });
});
