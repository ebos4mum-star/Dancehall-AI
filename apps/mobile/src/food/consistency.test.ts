import { describe, expect, it } from 'vitest';
import {
  FOOD_BY_ID,
  itemFromFood,
  localDateKey,
  periodSummary,
  recipeItems,
  RECIPES,
  totals,
} from '@dancehall/shared';
import { MockStore, type KeyValue } from '../data/mockStore';
import { weeklyNutrition } from './summary';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const now = new Date('2026-06-15T20:00:00Z');

describe('nutrition totals match across every place they are shown', () => {
  it('the diary, history, weekly bars and the period summary agree to the calorie', async () => {
    const store = new MockStore(memory(), () => now);
    await store.signInDev();
    await store.setConsent('health_data_processing', true);
    await store.updateProfile({ displayName: 'Ama', country: 'GH', timeZone: 'UTC' });
    const rice = FOOD_BY_ID.get('white-rice')!;
    const egg = FOOD_BY_ID.get('boiled-egg')!;
    const jollof = RECIPES.find((r) => r.id === 'jollof-chicken-salad')!;
    // Three kinds of entry on two days: a reference food, an edited portion, a recipe.
    await store.createFoodLog({
      mealType: 'breakfast',
      source: 'manual',
      loggedAt: '2026-06-15T07:00:00Z',
      items: [itemFromFood(egg, 100), itemFromFood(rice, 90)],
    });
    await store.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      loggedAt: '2026-06-15T12:00:00Z',
      items: recipeItems(jollof, 1),
    });
    await store.createFoodLog({
      mealType: 'dinner',
      source: 'manual',
      loggedAt: '2026-06-14T18:00:00Z',
      items: [itemFromFood(rice, 250)],
    });
    const logs = await store.listFoodLogs();
    const today = logs.filter((l) => localDateKey(l.loggedAt, 'UTC') === '2026-06-15');
    const diaryKcal = totals(today.flatMap((l) => l.items)).kcal;
    // 1. the weekly bar for today
    const week = weeklyNutrition(logs, 'UTC', now);
    expect(week.days.at(-1)!.kcal).toBe(diaryKcal);
    // 2. the period summary: average over the two logged days equals the mean of the two day totals
    const yesterday = totals(
      logs.filter((l) => localDateKey(l.loggedAt, 'UTC') === '2026-06-14').flatMap((l) => l.items),
    ).kcal;
    const p = periodSummary({
      period: 'week',
      now,
      timeZone: 'UTC',
      foodLogs: logs,
      sessions: [],
      weights: [],
      weightKg: null,
    });
    expect(p.food.daysLogged).toBe(2);
    expect(p.food.avgKcal).toBe(Math.round((diaryKcal + yesterday) / 2));
    expect(week.avgKcal).toBe(p.food.avgKcal);
    // 3. what was stored equals what the recipe showed, item for item
    const stored = today.find((l) => l.mealType === 'lunch')!;
    expect(stored.items.map((i) => i.kcal)).toEqual(recipeItems(jollof, 1).map((i) => i.kcal));
  });
  it('editing or deleting an entry changes every view by the same amount', async () => {
    const store = new MockStore(memory(), () => now);
    await store.signInDev();
    await store.setConsent('health_data_processing', true);
    await store.updateProfile({ displayName: 'Ama', country: 'GH', timeZone: 'UTC' });
    const rice = FOOD_BY_ID.get('white-rice')!;
    await store.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      loggedAt: '2026-06-15T12:00:00Z',
      items: [itemFromFood(rice, 200)],
    });
    const [log] = await store.listFoodLogs();
    await store.updateFoodItem(log!.items[0]!.id, { ...itemFromFood(rice, 100), userEdited: true });
    const after = await store.listFoodLogs();
    const kcal = totals(after.flatMap((l) => l.items)).kcal;
    expect(kcal).toBe(itemFromFood(rice, 100).kcal);
    expect(weeklyNutrition(after, 'UTC', now).days.at(-1)!.kcal).toBe(kcal);
    await store.deleteFoodLog(log!.id);
    const gone = await store.listFoodLogs();
    expect(weeklyNutrition(gone, 'UTC', now).days.at(-1)!.kcal).toBe(0);
    expect(
      periodSummary({
        period: 'week',
        now,
        timeZone: 'UTC',
        foodLogs: gone,
        sessions: [],
        weights: [],
        weightKg: null,
      }).food.avgKcal,
    ).toBeNull();
  });
});
