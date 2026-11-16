import { describe, expect, it } from 'vitest';
import { FOOD_BY_ID } from './food-data';
import {
  RECIPES,
  dietTags,
  fridgeMatches,
  hasExcluded,
  planWeekFromRecipes,
  recipePlanToDraft,
  recipeItems,
  recipeNutrition,
  resolveIngredients,
  substituteIn,
  substitutesFor,
} from './recipes';

describe('recipe data', () => {
  it('uses only known reference foods, with positive amounts, steps and unique ids', () => {
    const ids = new Set<string>();
    for (const x of RECIPES) {
      expect(ids.has(x.id), x.id).toBe(false);
      ids.add(x.id);
      expect(x.steps.length, x.id).toBeGreaterThan(0);
      expect(x.mealTypes.length).toBeGreaterThan(0);
      for (const i of x.ingredients) {
        expect(FOOD_BY_ID.has(i.foodId), `${x.id}:${i.foodId}`).toBe(true);
        expect(i.grams).toBeGreaterThan(0);
      }
    }
  });
  it('covers African, Caribbean and international dishes at every meal', () => {
    const tags = new Set(RECIPES.flatMap((x) => x.regionTags));
    for (const t of [
      'west_african',
      'caribbean',
      'south_asian',
      'mediterranean',
      'asian',
      'global',
    ])
      expect(tags.has(t), t).toBe(true);
    for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as const)
      expect(
        RECIPES.some((x) => x.mealTypes.includes(m)),
        m,
      ).toBe(true);
  });
  it('every serving is a sensible meal (not a rounding error, not a banquet)', () => {
    for (const x of RECIPES) {
      const k = recipeNutrition(x, 1).kcal;
      expect(k, x.id).toBeGreaterThan(120);
      expect(k, x.id).toBeLessThan(1100);
    }
  });
});

describe('recipe nutrition', () => {
  const oats = RECIPES.find((x) => x.id === 'oats-banana-pb')!;
  it('is computed from ingredients and carries an estimate range', () => {
    const t = recipeNutrition(oats, 1);
    const sum = recipeItems(oats, 1).reduce((a, i) => a + i.kcal, 0);
    expect(Math.abs(t.kcal - sum)).toBeLessThanOrEqual(1);
    expect(t.kcalLow).toBeLessThan(t.kcal);
    expect(t.kcalHigh).toBeGreaterThan(t.kcal);
    expect(recipeItems(oats, 1).every((i) => i.confidence === 'medium')).toBe(true);
  });
  it('scales with portions, and optional ingredients are only included on request', () => {
    expect(recipeNutrition(oats, 2).kcal).toBeGreaterThan(recipeNutrition(oats, 1).kcal * 1.8);
    const roti = RECIPES.find((x) => x.id === 'roti-chickpea')!;
    expect(recipeItems(roti, 1)).toHaveLength(2);
    expect(recipeItems(roti, 1, { withOptional: true })).toHaveLength(3);
  });
});

describe('diet tags are conservative', () => {
  it('never claims vegan for dishes with meat, egg, dairy or variable prepared dishes', () => {
    for (const id of [
      'jollof-chicken-salad',
      'egg-toast-avocado',
      'yogurt-mango-nuts',
      'plantain-egg-stew',
      'greek-chickpea-bowl',
    ]) {
      expect(dietTags(RECIPES.find((x) => x.id === id)!).vegan, id).toBe(false);
    }
  });
  it('claims vegan only for plain-ingredient dishes', () => {
    expect(dietTags(RECIPES.find((x) => x.id === 'lentil-rice-greens')!)).toEqual({
      vegetarian: true,
      vegan: true,
    });
    expect(dietTags(RECIPES.find((x) => x.id === 'egg-toast-avocado')!).vegetarian).toBe(true);
  });
});

describe('fridge to meal', () => {
  it('finds recipes you can make, ranked by coverage, and lists what is missing', () => {
    const m = fridgeMatches(['white-rice', 'grilled-chicken', 'mixed-salad', 'jollof-rice']);
    expect(m[0]!.recipe.id).toBe('jollof-chicken-salad');
    expect(m[0]!.missing).toEqual([]);
    expect(m[0]!.coverage).toBe(1);
    for (let i = 1; i < m.length; i++)
      expect(m[i - 1]!.coverage).toBeGreaterThanOrEqual(m[i]!.coverage);
  });
  it('lists missing items and respects maxMissing', () => {
    const near = fridgeMatches(['jollof-rice', 'grilled-chicken'], { maxMissing: 1 });
    expect(
      near.some(
        (x) => x.recipe.id === 'jollof-chicken-salad' && x.missing.join() === 'mixed-salad',
      ),
    ).toBe(true);
    expect(
      fridgeMatches(['jollof-rice', 'grilled-chicken'], { maxMissing: 0 }).every(
        (x) => x.missing.length === 0,
      ),
    ).toBe(true);
  });
  it('returns nothing for an empty fridge or foods used by no recipe', () => {
    expect(fridgeMatches([])).toEqual([]);
    expect(fridgeMatches(['soda', 'water'])).toEqual([]);
  });
  it('filters by meal type, diet and excluded words', () => {
    const all = [
      'oatmeal',
      'banana',
      'peanut-butter',
      'boiled-egg',
      'whole-wheat-bread',
      'avocado',
      'lentils',
      'brown-rice',
      'spinach-cooked',
    ];
    expect(
      fridgeMatches(all, { mealType: 'breakfast' }).every((x) =>
        x.recipe.mealTypes.includes('breakfast'),
      ),
    ).toBe(true);
    expect(fridgeMatches(all, { diet: 'vegan' }).every((x) => dietTags(x.recipe).vegan)).toBe(true);
    const noPeanut = fridgeMatches(all, { excludeWords: ['peanut'] });
    expect(noPeanut.some((x) => x.recipe.id === 'oats-banana-pb')).toBe(false);
    expect(
      hasExcluded(
        RECIPES.find((x) => x.id === 'oats-banana-pb')!,
        ['peanut'],
      ),
    ).toBe(true);
    expect(
      hasExcluded(
        RECIPES.find((x) => x.id === 'oats-banana-pb')!,
        ['x'],
      ),
    ).toBe(false);
  });
  it('prefers the requested region on ties', () => {
    const have = ['white-rice', 'tofu', 'broccoli', 'lentils', 'brown-rice', 'spinach-cooked'];
    const asian = fridgeMatches(have, { regions: ['asian'], maxMissing: 0 });
    expect(asian[0]!.recipe.regionTags).toContain('asian');
  });
  it('resolves typed words and reports unknown ones', () => {
    const r = resolveIngredients(['rice', 'Chicken', 'dragonfruit', ' ']);
    expect(r.ids.length).toBeGreaterThanOrEqual(2);
    expect(r.unknown).toEqual(['dragonfruit']);
  });
});

describe('ingredient substitutions', () => {
  it('suggests like-for-like foods scaled to similar calories', () => {
    const s = substitutesFor('white-rice', 150);
    expect(s.length).toBeGreaterThan(0);
    for (const x of s) {
      expect(Math.abs(x.kcalDelta)).toBeLessThan(80);
      expect(x.food.id).not.toBe('white-rice');
    }
    expect(s.map((x) => x.food.id)).toContain('brown-rice');
  });
  it('honours diet and excluded words and never suggests across groups', () => {
    const vegan = substitutesFor('grilled-chicken', 120, { diet: 'vegan' });
    expect(
      vegan.every(
        (x) => !['grilled-tilapia', 'baked-salmon', 'boiled-egg', 'paneer'].includes(x.food.id),
      ),
    ).toBe(true);
    expect(vegan.map((x) => x.food.id)).toContain('tofu');
    expect(
      substitutesFor('avocado', 50, { excludeWords: ['nut'] }).every(
        (x) => !/nut/i.test(x.food.name),
      ),
    ).toBe(true);
    expect(substitutesFor('soda', 330)).toEqual([]);
    expect(substitutesFor('white-rice', 0)).toEqual([]);
  });
  it('rebuilds a recipe with the replacement and recomputes nutrition', () => {
    const base = RECIPES.find((x) => x.id === 'tofu-stirfry')!;
    const swapped = substituteIn(base, { 'white-rice': 'brown-rice', nope: 'banana' });
    expect(swapped.ingredients.some((i) => i.foodId === 'brown-rice')).toBe(true);
    expect(swapped.ingredients.some((i) => i.foodId === 'white-rice')).toBe(false);
    expect(Math.abs(recipeNutrition(swapped).kcal - recipeNutrition(base).kcal)).toBeLessThan(60);
    expect(base.ingredients.some((i) => i.foodId === 'white-rice')).toBe(true); // original untouched
  });
});

describe('weekly plan from recipes', () => {
  const plan = planWeekFromRecipes({
    targetKcal: 2000,
    floorKcal: 1400,
    regions: ['west_african'],
  });
  it('has seven days with all four meals, near the target, and uses variety', () => {
    expect(plan.days).toHaveLength(7);
    for (const d of plan.days) {
      expect(d.meals.map((m) => m.mealType)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
      expect(d.totals.kcal).toBeGreaterThan(1400);
      expect(d.totals.kcal).toBeLessThan(2700);
    }
    const dinners = plan.days.map((d) => d.meals[2]!.recipe.id);
    expect(new Set(dinners).size).toBeGreaterThanOrEqual(4);
  });
  it('never plans below the floor and clamps portions', () => {
    const low = planWeekFromRecipes({ targetKcal: 900, floorKcal: 1400 });
    expect(low.targetKcal).toBe(1400);
    for (const d of low.days)
      for (const m of d.meals) expect(m.portions).toBeGreaterThanOrEqual(0.5);
    for (const d of plan.days) for (const m of d.meals) expect(m.portions).toBeLessThanOrEqual(2);
  });
  it('respects diet and exclusions, is deterministic, and clamps day count', () => {
    const veg = planWeekFromRecipes({ targetKcal: 2000, floorKcal: 1400, diet: 'vegan', days: 3 });
    expect(veg.days).toHaveLength(3);
    for (const d of veg.days) for (const m of d.meals) expect(dietTags(m.recipe).vegan).toBe(true);
    const nuts = planWeekFromRecipes({ targetKcal: 2000, floorKcal: 1400, excludeWords: ['nut'] });
    for (const d of nuts.days)
      for (const m of d.meals) expect(hasExcluded(m.recipe, ['nut'])).toBe(false);
    expect(
      JSON.stringify(
        planWeekFromRecipes({ targetKcal: 2000, floorKcal: 1400, regions: ['west_african'] }),
      ),
    ).toBe(JSON.stringify(plan));
    expect(planWeekFromRecipes({ targetKcal: 2000, floorKcal: 1400, days: 99 }).days).toHaveLength(
      14,
    );
  });
  it('carries the not-reviewed notice', () => {
    expect(plan.note).toMatch(/not reviewed/i);
  });
});

describe('recipe plan as a saved plan', () => {
  it('converts to the shared plan shape with recipe names and consistent totals', () => {
    const plan = planWeekFromRecipes({ targetKcal: 2000, floorKcal: 1400 });
    const draft = recipePlanToDraft(plan, 'low');
    expect(draft.days).toHaveLength(7);
    expect(draft.targetKcal).toBe(2000);
    expect(draft.budgetLevel).toBe('low');
    expect(draft.avgCostTier).toBeGreaterThanOrEqual(1);
    expect(draft.avgCostTier).toBeLessThanOrEqual(3);
    for (const [i, d] of draft.days.entries()) {
      expect(d.meals.every((m) => !!m.title && m.items.length > 0)).toBe(true);
      expect(d.totals.kcal).toBe(plan.days[i]!.totals.kcal);
    }
  });
});
