import { afterEach, describe, expect, it } from 'vitest';
import {
  CURATED_FOODS,
  FOOD_BY_ID,
  STAGED_FOODS,
  STAGED_FOOD_NOTICE,
  bundledContentProblems,
  disableInternalFixtures,
  enableInternalFixtures,
  foodProblems,
  isReviewedFood,
  planMeals,
  regionTagsFor,
  searchFoods,
  stagedFoodProblems,
} from './index';

afterEach(() => disableInternalFixtures());

describe('staged foods from a published source', () => {
  it('has a meaningful first set for Jamaican, Caribbean and West African eating', () => {
    const count = (tag: string) => STAGED_FOODS.filter((f) => f.regionTags.includes(tag)).length;
    expect(count('jamaican')).toBeGreaterThanOrEqual(15);
    expect(count('caribbean')).toBeGreaterThanOrEqual(15);
    expect(count('west_african')).toBeGreaterThanOrEqual(15);
    const cats = new Set(STAGED_FOODS.map((f) => f.category));
    for (const c of ['grain', 'protein', 'legume', 'vegetable', 'fruit', 'fat'])
      expect(cats.has(c as never), c).toBe(true);
  });

  it('every food is traceable to its source row, with edition, date, attribution and licence note', () => {
    for (const f of STAGED_FOODS) {
      expect(stagedFoodProblems(f), f.id).toEqual([]);
      expect(f.staged?.sourceId).toBe('usda_fdc');
      expect(f.staged?.sourceFoodId, f.id).toMatch(/^FDC \d{5,7}: \S/);
      expect(f.staged?.sourceVersion, f.id).toMatch(/SR Legacy/);
      expect(f.staged?.attribution, f.id).toMatch(/U\.S\. Department of Agriculture/);
      expect(f.staged?.licenceNote, f.id).toMatch(/reviewer must still confirm/);
    }
    expect(new Set(STAGED_FOODS.map((f) => f.id)).size).toBe(STAGED_FOODS.length);
    expect(new Set(STAGED_FOODS.map((f) => f.staged!.sourceFoodId)).size).toBeGreaterThan(30);
  });

  it('never looks reviewed, and a food that gained a review marker beside its staged data is refused', () => {
    for (const f of STAGED_FOODS) {
      expect(f.provenance, f.id).toBeUndefined();
      expect(isReviewedFood(f), f.id).toBe(false);
    }
    const bad = {
      ...STAGED_FOODS[0]!,
      provenance: {
        sourceId: 'usda_fdc',
        sourceFoodId: 'x',
        sourceVersion: 'y',
        retrievedOn: '2026-01-01',
        attribution: 'z',
        licenceRef: 'l',
        reviewRef: 'r',
      },
    } as never;
    expect(stagedFoodProblems(bad).join(' ')).toMatch(/must not carry provenance/);
  });

  it('keeps the source energy consistent with the source macros, and catches a typing error', () => {
    for (const f of STAGED_FOODS) {
      const n = f.per100g;
      expect(n.proteinG + n.carbsG + n.fatG, f.id).toBeLessThanOrEqual(100.5);
    }
    const typo = { ...STAGED_FOODS[0]!, per100g: { ...STAGED_FOODS[0]!.per100g, kcal: 900 } };
    expect(stagedFoodProblems(typo).join(' ')).toMatch(/energy does not match/);
  });

  it('serving sizes are the source’s own household portions, with a positive weight', () => {
    for (const f of STAGED_FOODS) {
      expect(f.servingG, f.id).toBeGreaterThan(0);
      expect(f.servingLabel, f.id).toMatch(/\d/);
    }
  });

  it('says plainly that it is unreviewed and omits foods the source lacks', () => {
    expect(STAGED_FOOD_NOTICE).toMatch(/UNREVIEWED/);
    expect(STAGED_FOOD_NOTICE).toMatch(/none was typed in/);
    expect(STAGED_FOODS.some((f) => /ackee/i.test(f.name + f.aliases.join()))).toBe(false);
  });

  it('is not in the bundled catalogue, and the gate refuses it if it ever is', () => {
    expect(CURATED_FOODS.some((f) => f.staged)).toBe(false);
    expect(bundledContentProblems()).toEqual([]);
    const problems = bundledContentProblems({ foods: [...STAGED_FOODS] });
    expect(problems.filter((p) => /staged, unreviewed food is in the bundle/.test(p))).toHaveLength(
      STAGED_FOODS.length,
    );
    for (const f of CURATED_FOODS) expect(foodProblems(f), f.id).toEqual([]);
  });

  it('is added only when the preview switch is on, can be searched, and leaves nothing behind', () => {
    const before = CURATED_FOODS.length;
    expect(searchFoods('callaloo', CURATED_FOODS, 5)).toEqual([]);
    enableInternalFixtures();
    expect(CURATED_FOODS.length).toBe(before + STAGED_FOODS.length);
    expect(searchFoods('callaloo', CURATED_FOODS, 5).map((f) => f.id)).toContain(
      'amaranth-leaves-boiled',
    );
    expect(searchFoods('saltfish', CURATED_FOODS, 5).map((f) => f.id)).toContain('salt-cod-dried');
    expect(FOOD_BY_ID.get('yam-boiled')?.staged).toBeTruthy();
    disableInternalFixtures();
    expect(CURATED_FOODS.length).toBe(before);
    expect(FOOD_BY_ID.has('yam-boiled')).toBe(false);
  });

  it('a Jamaican meal plan draws on the staged foods when they are available, and never fails without them', () => {
    const args = {
      days: 3,
      targetKcal: 2000,
      floorKcal: 1500,
      budgetLevel: 'medium' as const,
      regions: regionTagsFor(['jamaican']),
      seed: 3,
    };
    expect(planMeals(args).days.length).toBe(3);
    enableInternalFixtures();
    const plan = planMeals(args);
    const ids = plan.days.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.foodId)));
    expect(ids.some((id) => id && FOOD_BY_ID.get(id)?.staged)).toBe(true);
  });
});
