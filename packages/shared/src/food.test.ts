import { describe, expect, it } from 'vitest';
import {
  BUDGET_LEVELS,
  CURATED_FOODS,
  FOOD_BY_ID,
  FOOD_CATEGORIES,
  FOOD_DATA_NOTICE,
  MEAL_TYPES,
  SWAP_MODES,
  estimateStatus,
  groundPhotoItems,
  itemFromFood,
  localDateKey,
  manualItem,
  matchReference,
  planMeals,
  rescaleItem,
  searchFoods,
  suggestSwaps,
  totals,
} from './index';

const food = (id: string) => FOOD_BY_ID.get(id)!;

describe('reference data', () => {
  it('is clearly marked synthetic and internally consistent', () => {
    expect(FOOD_DATA_NOTICE).toMatch(/SYNTHETIC/);
    expect(new Set(CURATED_FOODS.map((f) => f.id)).size).toBe(CURATED_FOODS.length);
    for (const f of CURATED_FOODS) {
      expect(FOOD_CATEGORIES).toContain(f.category);
      expect(f.per100g.kcal).toBeGreaterThanOrEqual(0);
      // Atwater sanity check: calories roughly match macros (loose, fiber/alcohol/rounding aside).
      const est = f.per100g.proteinG * 4 + f.per100g.carbsG * 4 + f.per100g.fatG * 9;
      expect(Math.abs(est - f.per100g.kcal), f.id).toBeLessThanOrEqual(
        Math.max(45, f.per100g.kcal * 0.3),
      );
      expect(f.servingG).toBeGreaterThan(0);
    }
  });
  it('covers the approved cultural cuisines', () => {
    const tags = new Set(CURATED_FOODS.flatMap((f) => f.regionTags));
    for (const t of [
      'west_african',
      'caribbean',
      'american',
      'latin_american',
      'south_asian',
      'mediterranean',
    ])
      expect(tags.has(t), t).toBe(true);
  });
});

describe('items and ranges', () => {
  it('scales from reference data with a range around the value', () => {
    const i = itemFromFood(food('white-rice'), 200, {
      source: 'ai_estimate',
      confidence: 'medium',
    });
    expect(i.kcal).toBe(260);
    expect(i.kcalLow).toBeLessThan(i.kcal);
    expect(i.kcalHigh).toBeGreaterThan(i.kcal);
    expect(i.kcalLow).toBe(195);
    expect(i.kcalHigh).toBe(325);
  });
  it('uses a portion range when the model gave one', () => {
    const i = itemFromFood(food('white-rice'), 200, {
      confidence: 'high',
      gramsLow: 150,
      gramsHigh: 250,
    });
    expect(i.kcalLow).toBe(Math.round(130 * 1.5 * 0.85));
    expect(i.kcalHigh).toBe(Math.round(130 * 2.5 * 1.15));
  });
  it('never presents a point value as exact: every item has a non-degenerate range', () => {
    for (const f of CURATED_FOODS.filter((x) => x.per100g.kcal > 0)) {
      const i = itemFromFood(f, 100);
      expect(i.kcalLow).toBeLessThan(i.kcalHigh);
    }
    const m = manualItem({ name: 'Homemade stew', grams: 250, kcal: 400 });
    expect(m.kcalLow).toBeLessThan(400);
    expect(m.kcalHigh).toBeGreaterThan(400);
  });
  it('rescales on edit, marks the item edited and tightens the range', () => {
    const est = itemFromFood(food('jollof-rice'), 200, {
      source: 'ai_estimate',
      confidence: 'low',
    });
    const edited = rescaleItem(est, 300);
    expect(edited.kcal).toBe(480);
    expect(edited.userEdited).toBe(true);
    expect(edited.confidence).toBe('high');
    expect(edited.kcalHigh - edited.kcalLow).toBeLessThan(est.kcalHigh - est.kcalLow + 300);
    const manual = rescaleItem(
      manualItem({ name: 'Custom', grams: 100, kcal: 200, proteinG: 10 }),
      50,
    );
    expect(manual).toMatchObject({ kcal: 100, proteinG: 5, grams: 50 });
  });
  it('labels estimates honestly', () => {
    const base = itemFromFood(food('banana'), 100);
    expect(estimateStatus({ ...base, source: 'ai_estimate', userEdited: false })).toBe('estimate');
    expect(estimateStatus({ ...base, source: 'ai_estimate', userEdited: true })).toBe('edited');
    expect(estimateStatus({ ...base, source: 'user_manual' })).toBe('entered');
    expect(estimateStatus(base)).toBe('reference');
  });
  it('sums totals including ranges and counts unreviewed estimates', () => {
    const a = itemFromFood(food('banana'), 118, { source: 'ai_estimate', confidence: 'medium' });
    const b = itemFromFood(food('boiled-egg'), 100);
    const t = totals([a, b]);
    expect(t.kcal).toBe(a.kcal + b.kcal);
    expect(t.kcalLow).toBe(a.kcalLow + b.kcalLow);
    expect(t.unreviewedEstimates).toBe(1);
    expect(totals([]).kcal).toBe(0);
  });
});

describe('local date keys', () => {
  it('follows the time zone, not UTC', () => {
    expect(localDateKey('2026-06-15T23:30:00Z', 'Asia/Kolkata')).toBe('2026-06-16');
    expect(localDateKey('2026-06-15T23:30:00Z', 'America/New_York')).toBe('2026-06-15');
    expect(localDateKey('2026-06-15T23:30:00Z', null)).toBe('2026-06-15');
    expect(localDateKey('2026-06-15T23:30:00Z', 'Not/AZone')).toBe('2026-06-15');
  });
});

describe('search and grounding', () => {
  it('finds foods by name, alias and word', () => {
    expect(searchFoods('jollof')[0]?.id).toBe('jollof-rice');
    expect(searchFoods('dal')[0]?.id).toBe('lentils');
    expect(searchFoods('plantain').map((f) => f.id)).toEqual(
      expect.arrayContaining(['fried-plantain', 'boiled-plantain']),
    );
    expect(searchFoods('zzzz')).toHaveLength(0);
    expect(searchFoods('')).toHaveLength(8);
  });
  it('matches references conservatively', () => {
    expect(matchReference('grilled chicken breast')?.id).toBe('grilled-chicken');
    expect(matchReference('spaceship stew xyz')).toBeNull();
  });
  it('takes numbers from reference data, never from the model', () => {
    const [item] = groundPhotoItems([
      {
        name: 'Rice (sample)',
        gramsLow: 150,
        gramsHigh: 250,
        confidence: 'medium',
        referenceQuery: 'white rice',
      },
    ]);
    expect(item).toMatchObject({
      foodId: 'white-rice',
      source: 'ai_estimate',
      userEdited: false,
      needsMatch: false,
      grams: 200,
    });
    expect(item!.kcal).toBe(260);
  });
  it('flags unmatched items instead of inventing values', () => {
    const [item] = groundPhotoItems([
      {
        name: 'Mystery dish',
        gramsLow: 100,
        gramsHigh: 200,
        confidence: 'high',
        referenceQuery: 'qwertyuiop',
      },
    ]);
    expect(item).toMatchObject({ needsMatch: true, kcal: 0, foodId: null, confidence: 'low' });
  });
});

describe('food swap', () => {
  const rice = itemFromFood(food('white-rice'), 150);
  it('suggests neutral, comparable alternatives for each mode', () => {
    const fried = itemFromFood(food('fried-chicken'), 130);
    const lighter = suggestSwaps(fried, 'lighter');
    expect(lighter.length).toBeGreaterThan(0);
    for (const s of lighter) {
      expect(s.food.per100g.kcal).toBeLessThan(food('fried-chicken').per100g.kcal);
      expect(s.reason).toMatch(/fewer kcal/);
      expect(s.reason).not.toMatch(/bad|good|cheat|guilt|clean/i);
    }
    expect(suggestSwaps(rice, 'more_fiber')[0]?.fiberDeltaG).toBeGreaterThanOrEqual(1.5);
    expect(suggestSwaps(fried, 'more_protein').every((s) => s.proteinDeltaG >= 3)).toBe(true);
    expect(
      suggestSwaps(itemFromFood(food('baked-salmon'), 140), 'lower_cost').every(
        (s) => s.food.costTier < 3,
      ),
    ).toBe(true);
  });
  it('returns nothing for unknown foods and never suggests water as a like-for-like drink swap', () => {
    expect(suggestSwaps({ foodId: null, grams: 100, kcal: 100 }, 'lighter')).toEqual([]);
    expect(
      suggestSwaps(itemFromFood(food('soda'), 330), 'lighter').some((s) => s.food.id === 'water'),
    ).toBe(false);
  });
  it('is defined for every mode', () => {
    for (const m of SWAP_MODES) expect(Array.isArray(suggestSwaps(rice, m))).toBe(true);
  });
});

describe('meal planner', () => {
  it('builds days with all meal types near the target and within the budget level', () => {
    for (const level of BUDGET_LEVELS) {
      const plan = planMeals({
        days: 3,
        targetKcal: 2000,
        floorKcal: 1400,
        budgetLevel: level,
        regions: ['west_african'],
      });
      expect(plan.days).toHaveLength(3);
      const maxTier = { low: 1, medium: 2, flexible: 3 }[level];
      for (const d of plan.days) {
        expect(d.meals.map((m) => m.mealType)).toEqual([...MEAL_TYPES]);
        expect(d.totals.kcal).toBeGreaterThan(1300);
        expect(d.totals.kcal).toBeLessThan(2700);
        for (const m of d.meals)
          for (const i of m.items)
            expect(FOOD_BY_ID.get(i.foodId!)!.costTier).toBeLessThanOrEqual(maxTier);
      }
    }
  });
  it('never plans below the personal floor and is deterministic', () => {
    const low = planMeals({ days: 2, targetKcal: 900, floorKcal: 1500, budgetLevel: 'low' });
    expect(low.targetKcal).toBe(1500);
    expect(
      planMeals({ days: 2, targetKcal: 2000, floorKcal: 1400, budgetLevel: 'medium', seed: 4 }),
    ).toEqual(
      planMeals({ days: 2, targetKcal: 2000, floorKcal: 1400, budgetLevel: 'medium', seed: 4 }),
    );
  });
  it('varies across days and keeps day count in range', () => {
    const p = planMeals({ days: 99, targetKcal: 2000, floorKcal: 1400, budgetLevel: 'flexible' });
    expect(p.days).toHaveLength(14);
    const names = new Set(
      p.days.map((d) => d.meals.flatMap((m) => m.items.map((i) => i.name)).join()),
    );
    expect(names.size).toBeGreaterThan(3);
  });
});

import { defaultMealType, energyGuideFor } from './index';
describe('meal slot and energy guide', () => {
  it('picks a default meal by local time', () => {
    expect(defaultMealType(new Date(2026, 0, 1, 8))).toBe('breakfast');
    expect(defaultMealType(new Date(2026, 0, 1, 13))).toBe('lunch');
    expect(defaultMealType(new Date(2026, 0, 1, 19))).toBe('dinner');
    expect(defaultMealType(new Date(2026, 0, 1, 22))).toBe('snack');
  });
  it("never goes below the person's own resting energy, even for an aggressive pace", () => {
    const base = {
      weightKg: 80,
      heightCm: 170,
      ageYears: 35,
      sex: 'female' as const,
      activity: 'light' as const,
    };
    const g = energyGuideFor({ ...base, weeklyChangeKg: -2 });
    expect(g.guideKcal).toBeGreaterThanOrEqual(g.floorKcal);
    expect(energyGuideFor(base).guideKcal).toBe(energyGuideFor(base).maintenanceKcal);
    expect(g.guideKcal).toBeGreaterThanOrEqual(Math.round(g.maintenanceKcal * 0.8) - 1);
  });
});
