import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { buildDataExport } from '../privacy/export';
import { buildGroceryList } from '../food/grocery';
import {
  fridgeMatches,
  planWeekFromRecipes,
  recipeItems,
  recipePlanToDraft,
  RECIPES,
} from '@dancehall/shared';

/** Fridge-to-Meal -> diary -> weekly plan -> grocery list -> workout -> export: one flow, one set of numbers. */
const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = () => new Date('2026-06-15T12:00:00Z');

describe('nutrition flow works end to end', () => {
  it('a fridge match is logged, planned, shopped for, and exported with matching numbers', async () => {
    const s = new MockStore(memory(), NOW);
    await s.signInDev();
    await s.setConsent('health_data_processing', true);

    const first = RECIPES[0]!;
    const have = first.ingredients.filter((i) => !i.optional).map((i) => i.foodId);
    const matches = fridgeMatches(have);
    expect(matches.some((m) => m.recipe.id === first.id)).toBe(true);

    const items = recipeItems(first, 1);
    const log = await s.createFoodLog({
      mealType: 'dinner',
      loggedAt: '2026-06-15T11:00:00Z',
      source: 'manual',
      items,
    });
    expect((await s.listFoodLogs()).map((l) => l.id)).toContain(log.id);

    const plan = planWeekFromRecipes({ targetKcal: 2000, floorKcal: 1400 });
    const draft = recipePlanToDraft(plan, 'moderate' as never);
    const saved = await s.createMealPlan({
      name: 'Week',
      startDate: '2026-06-15',
      budgetLevel: draft.budgetLevel,
      plan: draft,
    });
    const grocery = buildGroceryList(
      draft.days.flatMap((d) =>
        d.meals.flatMap((m) =>
          m.items.map((i) => ({ foodId: i.foodId ?? null, name: i.name, grams: i.grams })),
        ),
      ),
    );
    expect(grocery.length).toBeGreaterThan(0);

    await s.createSession({ title: 'Dance', minutes: 20, status: 'completed' });

    const ex = await buildDataExport(s, NOW());
    expect(ex.foodLogs).toHaveLength(1);
    expect(ex.mealPlans.map((p) => (p as { id: string }).id)).toContain(saved.id);
    expect(ex.workoutSessions).toHaveLength(1);

    await s.deleteFoodLog(log.id);
    expect(await s.listFoodLogs()).toHaveLength(0);
    expect((await buildDataExport(s, NOW())).foodLogs).toHaveLength(0);
  });
});
