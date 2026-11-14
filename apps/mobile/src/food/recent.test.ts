import { describe, expect, it } from 'vitest';
import { CURATED_FOODS, itemFromFood } from '@dancehall/shared';
import type { FoodLog } from '@/data/types';
import { recentFoods } from './recent';

const f = CURATED_FOODS[0]!;
const item = (grams: number, over: object = {}) => ({
  ...itemFromFood(f, grams, { source: 'curated', confidence: 'high', userEdited: false }),
  id: `i${grams}`,
  logId: 'l',
  ...over,
});
const log = (at: string, items: ReturnType<typeof item>[]): FoodLog => ({
  id: at,
  loggedAt: at,
  mealType: 'lunch',
  source: 'manual',
  photoAnalysisId: null,
  items,
});

describe('recentFoods', () => {
  it('returns newest first, de-duplicated by food and portion, without ids', () => {
    const r = recentFoods([
      log('2026-06-01T10:00:00Z', [item(100)]),
      log('2026-06-03T10:00:00Z', [item(150)]),
      log('2026-06-02T10:00:00Z', [item(100)]),
    ]);
    expect(r.map((x) => x.grams)).toEqual([150, 100]);
    expect(r[0]).not.toHaveProperty('id');
    expect(r[0]).not.toHaveProperty('logId');
  });
  it('leaves out simulated or AI estimates and respects the limit', () => {
    expect(
      recentFoods([log('2026-06-01T10:00:00Z', [item(100, { source: 'ai_estimate' })])]),
    ).toEqual([]);
    const many = Array.from({ length: 10 }, (_, k) =>
      log(`2026-06-0${(k % 9) + 1}T10:00:00Z`, [item(50 + k * 10)]),
    );
    expect(recentFoods(many, 3)).toHaveLength(3);
  });
});
