import { describe, expect, it } from 'vitest';
import {
  RECIPES,
  fridgeMatches,
  resolveIngredients,
  planWeekFromRecipes,
  recipeNutrition,
  recipeItems,
  recipePlanToDraft,
} from '@dancehall/shared';
import { buildGroceryList, scaleGroceryList } from './grocery';

/** Hostile and odd inputs to the pure food logic: must not throw, produce NaN, or invent food. */
const finite = (n: number) => Number.isFinite(n) && n >= 0;

describe('Fridge-to-Meal', () => {
  it('empty and duplicate input', () => {
    expect(fridgeMatches([])).toEqual([]);
    const a = fridgeMatches(RECIPES[0]!.ingredients.map((i) => i.foodId));
    const b = fridgeMatches([
      ...RECIPES[0]!.ingredients.map((i) => i.foodId),
      ...RECIPES[0]!.ingredients.map((i) => i.foodId),
    ]);
    expect(b.map((m) => m.recipe.id)).toEqual(a.map((m) => m.recipe.id));
  });
  it('unknown ids never match or throw', () => {
    expect(() => fridgeMatches(['nope', '', '__proto__', 'constructor'])).not.toThrow();
    expect(fridgeMatches(['nope', '__proto__'])).toEqual([]);
  });
  it('free text: junk, huge, and injection-like input is parsed safely', () => {
    for (const t of [
      '',
      '   ',
      ',,,,',
      '<script>alert(1)</script>',
      'a'.repeat(20000),
      '🍎🍌',
      'chicken, chicken, CHICKEN',
    ]) {
      const r = resolveIngredients(t.split(/[,\n]/));
      expect(Array.isArray(r.ids)).toBe(true);
      expect(new Set(r.ids).size).toBe(r.ids.length);
    }
  });
  it('vegan and vegetarian filters never return meat or fish', () => {
    for (const diet of ['vegan', 'vegetarian'] as const) {
      const every = RECIPES.flatMap((r) => r.ingredients.map((i) => i.foodId));
      for (const m of fridgeMatches(every, { diet, maxMissing: 99 })) {
        const names = m.recipe.ingredients.map((i) => i.foodId).join(' ');
        expect(names, `${diet}: ${m.recipe.id}`).not.toMatch(
          /chicken|beef|goat|salmon|tilapia|fish|pork|lamb/,
        );
      }
    }
  });
  it('excluded words (allergies) are honoured', () => {
    const every = RECIPES.flatMap((r) => r.ingredients.map((i) => i.foodId));
    for (const m of fridgeMatches(every, { excludeWords: ['peanut'], maxMissing: 99 })) {
      expect(JSON.stringify(m.recipe).toLowerCase()).not.toContain('peanut');
    }
  });
});

describe('recipe nutrition and plans', () => {
  it('every recipe has finite, positive nutrition for odd portion counts', () => {
    for (const r of RECIPES)
      for (const p of [0.5, 1, 2, 10]) {
        const n = recipeNutrition(r, p);
        expect(finite(n.kcal), `${r.id} x${p}`).toBe(true);
        expect(n.kcal).toBeGreaterThan(0);
        expect(finite(n.proteinG) && finite(n.carbsG) && finite(n.fatG)).toBe(true);
      }
  });
  it('portions of zero or NaN do not produce NaN items', () => {
    for (const p of [0, -1, Number.NaN])
      for (const i of recipeItems(RECIPES[0]!, p)) {
        expect(Number.isFinite(i.grams) && Number.isFinite(i.kcal), `portions ${p}`).toBe(true);
        expect(i.grams).toBeGreaterThan(0);
      }
  });
  it('3-day and 7-day plans cover every day and meal and respect the calorie floor', () => {
    for (const days of [3, 7]) {
      const plan = planWeekFromRecipes({ days, targetKcal: 1200, floorKcal: 1500 });
      expect(plan.days).toHaveLength(days);
      expect(plan.targetKcal).toBe(1500); // never below the floor
      for (const d of plan.days) {
        expect(d.meals.length).toBeGreaterThanOrEqual(3);
        expect(finite(d.totals.kcal)).toBe(true);
      }
    }
  });
  it('odd plan arguments are clamped, not crashed', () => {
    for (const days of [0, -3, 99, Number.NaN])
      expect(() => planWeekFromRecipes({ days, targetKcal: 2000, floorKcal: 1400 })).not.toThrow();
    const p = planWeekFromRecipes({ days: 99, targetKcal: 2000, floorKcal: 1400 });
    expect(p.days.length).toBeLessThanOrEqual(14);
    const q = planWeekFromRecipes({ targetKcal: Number.NaN, floorKcal: 1400 });
    expect(finite(q.targetKcal)).toBe(true);
  });
  it('a vegan plan contains no meat, fish, dairy or eggs recipes', () => {
    const p = planWeekFromRecipes({ days: 7, targetKcal: 2000, floorKcal: 1400, diet: 'vegan' });
    for (const d of p.days)
      for (const m of d.meals)
        expect(m.recipe.ingredients.map((i) => i.foodId).join(' ')).not.toMatch(
          /chicken|beef|goat|salmon|tilapia|egg|milk|cheese|yogurt/,
        );
  });
});

describe('grocery list consistency', () => {
  it('the list totals equal the plan totals (rounded up to 10 g) and ignore invalid grams', () => {
    const plan = planWeekFromRecipes({ days: 7, targetKcal: 2000, floorKcal: 1400 });
    const draft = recipePlanToDraft(plan, 'moderate' as never);
    const items = draft.days.flatMap((d) =>
      d.meals.flatMap((m) =>
        m.items.map((i) => ({ foodId: i.foodId ?? null, name: i.name, grams: i.grams })),
      ),
    );
    const list = buildGroceryList([
      ...items,
      { foodId: null, name: 'bad', grams: Number.NaN },
      { foodId: null, name: 'neg', grams: -5 },
    ]);
    expect(list.find((l) => l.name === 'bad' || l.name === 'neg')).toBeUndefined();
    const planned = items.reduce((n, i) => n + i.grams, 0);
    const listed = list.reduce((n, l) => n + l.grams, 0);
    expect(listed).toBeGreaterThanOrEqual(planned);
    expect(listed - planned).toBeLessThan(10 * list.length + 1);
    for (const l of scaleGroceryList(list, 4)) expect(l.grams).toBeGreaterThan(0);
  });
});
