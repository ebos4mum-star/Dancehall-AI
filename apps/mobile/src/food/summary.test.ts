import { describe, expect, it } from 'vitest';
import type { FoodLog } from '../data/types';
import { weeklyNutrition } from './summary';

const item = (kcal: number) => ({
  kcal,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  kcalLow: kcal,
  kcalHigh: kcal,
  source: 'manual',
  confidence: 'high',
  userEdited: false,
  grams: 100,
  name: 'x',
  foodId: null,
});
const log = (day: string, kcals: number[], h = 12): FoodLog =>
  ({
    id: day + h,
    loggedAt: `${day}T${String(h).padStart(2, '0')}:00:00Z`,
    mealType: 'lunch',
    source: 'manual',
    photoAnalysisId: null,
    items: kcals.map(item),
  }) as unknown as FoodLog;
const now = new Date('2026-06-10T15:00:00Z');

describe('weeklyNutrition', () => {
  it('covers seven days ending today and sums items per day', () => {
    const w = weeklyNutrition(
      [log('2026-06-10', [300, 200]), log('2026-06-10', [100], 18), log('2026-06-08', [500])],
      'UTC',
      now,
    );
    expect(w.days).toHaveLength(7);
    expect(w.days[0]!.date).toBe('2026-06-04');
    expect(w.days[6]).toEqual({ date: '2026-06-10', kcal: 600, meals: 2 });
    expect(w.days[4]).toEqual({ date: '2026-06-08', kcal: 500, meals: 1 });
  });
  it('averages only the days that were logged (empty days are not zeros)', () => {
    const w = weeklyNutrition([log('2026-06-10', [600]), log('2026-06-08', [400])], 'UTC', now);
    expect(w.daysLogged).toBe(2);
    expect(w.avgKcal).toBe(500);
  });
  it('has no average and zero days for an empty week, and ignores older entries', () => {
    const w = weeklyNutrition([log('2026-05-01', [900])], 'UTC', now);
    expect(w.daysLogged).toBe(0);
    expect(w.avgKcal).toBeNull();
    expect(w.days.every((d) => d.kcal === 0 && d.meals === 0)).toBe(true);
  });
  it('uses the person’s time zone for day boundaries', () => {
    const tokyoNow = new Date('2026-06-10T12:00:00Z'); // 21:00 on 10 June in Tokyo
    const w = weeklyNutrition([log('2026-06-09', [250], 23)], 'Asia/Tokyo', tokyoNow); // 08:00 on 10 June in Tokyo
    expect(w.days[6]!.kcal).toBe(250);
  });
});
