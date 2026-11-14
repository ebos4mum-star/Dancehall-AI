import { describe, expect, it } from 'vitest';
import { goalFraction } from './goalDisplay';

const goal = { type: 'lose', startKg: 80, targetKg: 76 } as Parameters<typeof goalFraction>[0];
describe('goalFraction', () => {
  it('is null (not zero) without a recorded weight', () => {
    expect(goalFraction(goal, null)).toBeNull();
    expect(goalFraction(goal, undefined)).toBeNull();
    expect(goalFraction(goal, Number.NaN)).toBeNull();
  });
  it('reports progress between 0 and 1 from a recorded weight', () => {
    expect(goalFraction(goal, 78)).toBeCloseTo(0.5, 2);
    expect(goalFraction(goal, 70)).toBe(1);
    expect(goalFraction(goal, 85)).toBe(0);
  });
});
