import { describe, expect, it } from 'vitest';
import {
  fridgeMatches,
  planWeekFromRecipes,
  recipeItems,
  recipeNutrition,
  recipePlanToDraft,
  resolveIngredients,
  substituteIn,
  totals,
} from '@dancehall/shared';
import { MockStore, type KeyValue } from '../data/mockStore';
import { buildGroceryList } from './grocery';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
async function setup() {
  const store = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
  await store.signInDev();
  await store.setConsent('health_data_processing', true);
  await store.updateProfile({ displayName: 'Ama', country: 'GH', timeZone: 'UTC' });
  await store.savePrivate({
    birthDate: '1990-01-01',
    heightCm: 170,
    sex: 'female',
    activityLevel: 'light',
  });
  await store.completeOnboarding();
  return store;
}

describe('fridge to meal, end to end', () => {
  it('typed foods become a recipe, which logs with the same nutrition the recipe showed', async () => {
    const store = await setup();
    const { ids, unknown } = resolveIngredients([
      'jollof rice',
      'grilled chicken',
      'salad',
      'unobtainium',
    ]);
    expect(unknown).toEqual(['unobtainium']);
    const best = fridgeMatches(ids, { maxMissing: 1 })[0]!;
    const shown = recipeNutrition(best.recipe, 1);
    await store.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      loggedAt: '2026-06-15T12:30:00Z',
      items: recipeItems(best.recipe, 1),
    });
    const day = await store.listFoodLogs();
    expect(totals(day.flatMap((l) => l.items)).kcal).toBe(shown.kcal);
  });
  it('a swap changes both the logged items and the totals consistently', async () => {
    const store = await setup();
    const base = fridgeMatches(['tofu', 'broccoli', 'white-rice'], { maxMissing: 0 })[0]!.recipe;
    const swapped = substituteIn(base, { 'white-rice': 'brown-rice' });
    await store.createFoodLog({
      mealType: 'dinner',
      source: 'manual',
      items: recipeItems(swapped, 1),
    });
    const [log] = await store.listFoodLogs();
    expect(log!.items.some((i) => i.foodId === 'brown-rice')).toBe(true);
    expect(totals(log!.items).kcal).toBe(recipeNutrition(swapped, 1).kcal);
  });
});

describe('recipe plan saved and shopped for', () => {
  it('saves through the same path as the basic plan, and the shopping list adds up', async () => {
    const store = await setup();
    const plan = planWeekFromRecipes({ targetKcal: 2000, floorKcal: 1400, regions: ['caribbean'] });
    const draft = recipePlanToDraft(plan, 'low');
    const saved = await store.createMealPlan({
      name: 'Recipe week',
      startDate: '2026-06-15',
      budgetLevel: 'low',
      budgetCents: null,
      currency: null,
      plan: draft,
    });
    expect(saved.days).toBe(7);
    expect(saved.items.length).toBe(
      plan.days.flatMap((d) => d.meals.flatMap((m) => m.items)).length,
    );
    const list = buildGroceryList(
      saved.items.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams })),
    );
    const planned = saved.items.reduce((a, i) => a + i.grams, 0);
    // Each line is rounded up to 10 g, so the list never holds less than the plan needs and is never more than 10 g per line over.
    const listed = list.reduce((a, l) => a + l.grams, 0);
    expect(listed).toBeGreaterThanOrEqual(planned);
    expect(listed).toBeLessThanOrEqual(planned + list.length * 10);
    // Nutrition on the saved plan matches what the planner reported, per day, to the calorie.
    for (const d of plan.days) {
      const k = saved.items
        .filter((i) => i.dayIndex === d.dayIndex)
        .reduce((a, i) => a + i.kcal, 0);
      expect(Math.abs(k - d.totals.kcal)).toBeLessThanOrEqual(
        d.meals.reduce((a, m) => a + m.items.length, 0),
      );
    }
  });
});
