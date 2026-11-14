import { describe, expect, it } from 'vitest';
import { CURATED_FOODS } from '@dancehall/shared';
import { portionText } from './portion';

const f = CURATED_FOODS[0]!;
describe('portionText', () => {
  it('describes whole and fractional servings', () => {
    expect(portionText(f.id, f.servingG)).toBe(`about 1 × ${f.servingLabel}`);
    expect(portionText(f.id, f.servingG * 1.5)).toBe(`about 1½ × ${f.servingLabel}`);
    expect(portionText(f.id, f.servingG * 0.5)).toBe(`about ½ × ${f.servingLabel}`);
  });
  it('returns null without a reference food or a positive amount', () => {
    expect(portionText(null, 100)).toBeNull();
    expect(portionText('nope', 100)).toBeNull();
    expect(portionText(f.id, 0)).toBeNull();
    expect(portionText(f.id, 1)).toBeNull();
  });
});
