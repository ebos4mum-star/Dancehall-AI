import { bestCuisineFit } from './cuisines';
import { CURATED_FOODS, FOOD_BY_ID, type FoodCategory, type FoodRef } from './food-data';
import type { Confidence, Macros, NutritionSource } from './nutrition';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** A food entry as stored in the diary. Values are always estimates with a range; nothing here is exact. */
export interface FoodItemValues {
  name: string;
  foodId: string | null;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  kcalLow: number;
  kcalHigh: number;
  source: NutritionSource;
  confidence: Confidence;
  userEdited: boolean;
}

const SPREAD: Record<Confidence, number> = { high: 0.15, medium: 0.25, low: 0.4 };
const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

/** Nutrition for `grams` of a reference food, with a calorie range that widens as confidence drops. */
export function itemFromFood(
  food: FoodRef,
  grams: number,
  opts: {
    source?: NutritionSource;
    confidence?: Confidence;
    userEdited?: boolean;
    gramsLow?: number;
    gramsHigh?: number;
  } = {},
): FoodItemValues {
  const confidence = opts.confidence ?? 'high';
  const per = food.per100g;
  const f = grams / 100;
  const kcal = per.kcal * f;
  const lowG = opts.gramsLow ?? grams;
  const highG = opts.gramsHigh ?? grams;
  const s = SPREAD[confidence];
  return {
    name: food.name,
    foodId: food.id,
    grams: r1(grams),
    kcal: r0(kcal),
    proteinG: r1(per.proteinG * f),
    carbsG: r1(per.carbsG * f),
    fatG: r1(per.fatG * f),
    kcalLow: r0(per.kcal * (lowG / 100) * (1 - s)),
    kcalHigh: r0(per.kcal * (highG / 100) * (1 + s)),
    source: opts.source ?? 'curated',
    confidence,
    userEdited: opts.userEdited ?? false,
  };
}

/** A food the user typed in by hand (no reference match). Values are the user's own, still shown as approximate. */
export function manualItem(input: {
  name: string;
  grams: number;
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}): FoodItemValues {
  const s = SPREAD.high;
  return {
    name: input.name.trim(),
    foodId: null,
    grams: r1(input.grams),
    kcal: r0(input.kcal),
    proteinG: r1(input.proteinG ?? 0),
    carbsG: r1(input.carbsG ?? 0),
    fatG: r1(input.fatG ?? 0),
    kcalLow: r0(input.kcal * (1 - s)),
    kcalHigh: r0(input.kcal * (1 + s)),
    source: 'user_manual',
    confidence: 'high',
    userEdited: true,
  };
}

/** The user changed the portion. Values rescale from the reference food (or proportionally); the user's portion tightens the range. */
export function rescaleItem(
  item: FoodItemValues,
  newGrams: number,
  food?: FoodRef | null,
): FoodItemValues {
  const ref = food ?? (item.foodId ? FOOD_BY_ID.get(item.foodId) : undefined);
  if (ref)
    return itemFromFood(ref, newGrams, {
      source: item.source,
      confidence: 'high',
      userEdited: true,
    });
  const k = item.grams > 0 ? newGrams / item.grams : 1;
  const s = SPREAD.high;
  const kcal = item.kcal * k;
  return {
    ...item,
    grams: r1(newGrams),
    kcal: r0(kcal),
    proteinG: r1(item.proteinG * k),
    carbsG: r1(item.carbsG * k),
    fatG: r1(item.fatG * k),
    kcalLow: r0(kcal * (1 - s)),
    kcalHigh: r0(kcal * (1 + s)),
    confidence: 'high',
    userEdited: true,
  };
}

export type EstimateStatus = 'estimate' | 'edited' | 'reference' | 'entered';
/** How the value should be labeled: an unreviewed AI estimate is never shown as confirmed. */
export function estimateStatus(
  item: Pick<FoodItemValues, 'source' | 'userEdited'>,
): EstimateStatus {
  if (item.source === 'ai_estimate') return item.userEdited ? 'edited' : 'estimate';
  if (item.source === 'user_manual') return 'entered';
  return 'reference';
}

export interface Totals extends Macros {
  kcalLow: number;
  kcalHigh: number;
  items: number;
  /** Items whose values are still unreviewed AI estimates. */
  unreviewedEstimates: number;
}
export function totals(items: readonly FoodItemValues[]): Totals {
  const t: Totals = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    kcalLow: 0,
    kcalHigh: 0,
    items: items.length,
    unreviewedEstimates: 0,
  };
  for (const i of items) {
    t.kcal += i.kcal;
    t.proteinG += i.proteinG;
    t.carbsG += i.carbsG;
    t.fatG += i.fatG;
    t.kcalLow += i.kcalLow;
    t.kcalHigh += i.kcalHigh;
    if (estimateStatus(i) === 'estimate') t.unreviewedEstimates += 1;
  }
  return {
    ...t,
    kcal: r0(t.kcal),
    proteinG: r1(t.proteinG),
    carbsG: r1(t.carbsG),
    fatG: r1(t.fatG),
    kcalLow: r0(t.kcalLow),
    kcalHigh: r0(t.kcalHigh),
  };
}

/** YYYY-MM-DD for an instant in the person's time zone (day boundaries follow where they live, not UTC). */
export function localDateKey(iso: string | Date, timeZone: string | null | undefined): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => p.find((x) => x.type === t)!.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// ---------- search and grounding ----------

function score(f: FoodRef, q: string): number {
  const names = [f.name, ...f.aliases].map((n) => n.toLowerCase());
  let best = 0;
  for (const n of names) {
    if (n === q) best = Math.max(best, 100);
    else if (n.startsWith(q)) best = Math.max(best, 80);
    else if (n.split(/[\s,/()-]+/).some((w) => w.startsWith(q))) best = Math.max(best, 60);
    else if (n.includes(q)) best = Math.max(best, 40);
  }
  if (best === 0) {
    const toks = q.split(/\s+/).filter((t) => t.length > 2);
    const hay = names.join(' ');
    const hit = toks.filter((t) => hay.includes(t)).length;
    if (toks.length > 0 && hit > 0) best = 20 + (hit / toks.length) * 35;
  }
  return best;
}
export function searchFoods(
  query: string,
  foods: readonly FoodRef[] = CURATED_FOODS,
  limit = 8,
): FoodRef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...foods].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  return foods
    .map((f) => ({ f, s: score(f, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.f.name.localeCompare(b.f.name))
    .slice(0, limit)
    .map((x) => x.f);
}
export function matchReference(
  query: string,
  foods: readonly FoodRef[] = CURATED_FOODS,
): FoodRef | null {
  const q = query.trim().toLowerCase();
  const best = foods.map((f) => ({ f, s: score(f, q) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s >= 40 ? best.f : null;
}

export interface PhotoModelItem {
  name: string;
  gramsLow: number;
  gramsHigh: number;
  confidence: Confidence;
  referenceQuery: string;
  likelyIngredients?: string[];
}
export interface GroundedItem extends FoodItemValues {
  /** True when no reference food matched: the person must pick one (or enter it) before saving. */
  needsMatch: boolean;
  likelyIngredients: string[];
}

/**
 * Turns model output into diary items. The model supplies names and portion RANGES only; calories and macros come from
 * reference data, so a made-up number from a model can never reach the diary.
 */
export function groundPhotoItems(
  items: readonly PhotoModelItem[],
  foods: readonly FoodRef[] = CURATED_FOODS,
): GroundedItem[] {
  return items.map((m) => {
    const ref = matchReference(m.referenceQuery || m.name, foods);
    const grams = (m.gramsLow + m.gramsHigh) / 2;
    if (!ref) {
      return {
        name: m.name,
        foodId: null,
        grams: r1(grams),
        kcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        kcalLow: 0,
        kcalHigh: 0,
        source: 'ai_estimate',
        confidence: 'low',
        userEdited: false,
        needsMatch: true,
        likelyIngredients: m.likelyIngredients ?? [],
      };
    }
    const base = itemFromFood(ref, grams, {
      source: 'ai_estimate',
      confidence: m.confidence,
      gramsLow: m.gramsLow,
      gramsHigh: m.gramsHigh,
    });
    return {
      ...base,
      name: m.name || ref.name,
      needsMatch: false,
      likelyIngredients: m.likelyIngredients ?? [],
    };
  });
}

// ---------- Food Swap ----------

export const SWAP_MODES = ['lighter', 'more_protein', 'more_fiber', 'lower_cost'] as const;
export type SwapMode = (typeof SWAP_MODES)[number];
export interface SwapSuggestion {
  food: FoodRef;
  grams: number;
  item: FoodItemValues;
  kcalDelta: number;
  proteinDeltaG: number;
  fiberDeltaG: number;
  reason: string;
}

const COMPATIBLE: Record<FoodCategory, FoodCategory[]> = {
  grain: ['grain', 'legume', 'vegetable'],
  protein: ['protein', 'legume'],
  legume: ['legume', 'protein'],
  vegetable: ['vegetable', 'grain'],
  fruit: ['fruit'],
  dairy: ['dairy'],
  fat: ['fat', 'snack'],
  snack: ['snack', 'fruit'],
  drink: ['drink'],
  mixed_dish: ['mixed_dish'],
};

/**
 * Rule-based swap ideas from reference data (no AI). Suggestions keep the same portion weight so the comparison is easy to read.
 * Wording is neutral: no food is called good or bad, and nothing suggests eating less than a person needs.
 */
export function suggestSwaps(
  item: Pick<FoodItemValues, 'foodId' | 'grams' | 'kcal'>,
  mode: SwapMode,
  foods: readonly FoodRef[] = CURATED_FOODS,
  limit = 3,
  /** The person's chosen cuisines (cuisines.ts). Foods that fit them rank higher; nothing is ever excluded for not fitting. */
  cuisines: readonly string[] = [],
): SwapSuggestion[] {
  const cur = item.foodId ? FOOD_BY_ID.get(item.foodId) : undefined;
  if (!cur) return [];
  const per = (f: FoodRef) => f.per100g;
  const out: SwapSuggestion[] = [];
  for (const f of foods) {
    if (f.id === cur.id || !COMPATIBLE[cur.category].includes(f.category)) continue;
    if (cur.category === 'drink' && f.id === 'water') continue; // not a like-for-like swap
    const g = item.grams;
    const alt = itemFromFood(f, g, { confidence: 'high' });
    const kcalDelta = alt.kcal - item.kcal;
    const pDelta = r1((per(f).proteinG - per(cur).proteinG) * (g / 100));
    const fDelta = r1(((per(f).fiberG ?? 0) - (per(cur).fiberG ?? 0)) * (g / 100));
    let ok = false;
    let reason = '';
    if (mode === 'lighter') {
      ok = f.per100g.kcal <= cur.per100g.kcal * 0.85 && f.per100g.kcal > 0;
      reason = `about ${Math.abs(kcalDelta)} fewer kcal for the same weight`;
    } else if (mode === 'more_protein') {
      ok = pDelta >= 3 && f.per100g.kcal <= cur.per100g.kcal * 1.5;
      reason = `about ${pDelta} g more protein`;
    } else if (mode === 'more_fiber') {
      ok = fDelta >= 1.5;
      reason = `about ${fDelta} g more fiber`;
    } else {
      ok = f.costTier < cur.costTier && Math.abs(kcalDelta) <= Math.max(60, item.kcal * 0.25);
      reason = 'usually a lower-cost option with similar energy';
    }
    if (!ok) continue;
    out.push({
      food: f,
      grams: g,
      item: alt,
      kcalDelta,
      proteinDeltaG: pDelta,
      fiberDeltaG: fDelta,
      reason,
    });
  }
  const rank = (s: SwapSuggestion) => {
    const sameRegion = s.food.regionTags.some((t) => t !== 'global' && cur.regionTags.includes(t))
      ? 1000
      : 0;
    const sameCat = s.food.category === cur.category ? 500 : 0;
    const cuisine = bestCuisineFit(s.food.regionTags, cuisines) * 400;
    const gain =
      mode === 'lighter'
        ? -s.kcalDelta
        : mode === 'more_protein'
          ? s.proteinDeltaG * 10
          : mode === 'more_fiber'
            ? s.fiberDeltaG * 10
            : (cur.costTier - s.food.costTier) * 100 - Math.abs(s.kcalDelta);
    return sameRegion + sameCat + cuisine + gain;
  };
  return out.sort((a, b) => rank(b) - rank(a)).slice(0, limit);
}

// ---------- Budget meal planning (rule-based foundation) ----------

export const BUDGET_LEVELS = ['low', 'medium', 'flexible'] as const;
export type BudgetLevel = (typeof BUDGET_LEVELS)[number];
const MAX_TIER: Record<BudgetLevel, 1 | 2 | 3> = { low: 1, medium: 2, flexible: 3 };
export interface PlannedMeal {
  mealType: MealType;
  items: FoodItemValues[];
  /** Recipe name when the meal comes from a recipe (see recipes.ts). */
  title?: string;
}
export interface PlannedDay {
  dayIndex: number;
  meals: PlannedMeal[];
  totals: Totals;
}
export interface MealPlanDraft {
  days: PlannedDay[];
  budgetLevel: BudgetLevel;
  avgCostTier: number;
  targetKcal: number;
}

const SHARE: Record<MealType, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 };
const RECIPES: Record<MealType, FoodCategory[][]> = {
  breakfast: [['grain'], ['fruit'], ['dairy', 'protein']],
  lunch: [['mixed_dish', 'grain'], ['protein', 'legume'], ['vegetable']],
  dinner: [['grain', 'vegetable'], ['protein', 'legume', 'mixed_dish'], ['vegetable']],
  snack: [['fruit'], ['dairy', 'snack']],
};

/**
 * Builds a simple multi-day plan from the reference foods within a relative budget level. It is a starting point to edit, not a
 * prescription: the daily target comes from the caller and is never taken below `floorKcal` (the person's own estimated resting energy).
 */
export function planMeals(args: {
  days: number;
  targetKcal: number;
  floorKcal: number;
  budgetLevel: BudgetLevel;
  regions?: readonly string[];
  seed?: number;
  foods?: readonly FoodRef[];
}): MealPlanDraft {
  const foods = args.foods ?? CURATED_FOODS;
  const target = Math.max(args.targetKcal, args.floorKcal);
  const maxTier = MAX_TIER[args.budgetLevel];
  const regions = new Set(args.regions ?? []);
  const seed = args.seed ?? 0;
  const days: PlannedDay[] = [];
  let tierSum = 0;
  let tierN = 0;
  for (let d = 0; d < Math.max(1, Math.min(14, args.days)); d++) {
    const meals: PlannedMeal[] = [];
    for (const mealType of MEAL_TYPES) {
      const picks: FoodRef[] = [];
      RECIPES[mealType].forEach((cats, slot) => {
        const pool = foods
          .filter(
            (f) =>
              cats.includes(f.category) &&
              f.costTier <= maxTier &&
              f.id !== 'soda' &&
              f.id !== 'water',
          )
          .sort(
            (a, b) =>
              (regions.has(b.regionTags[0] ?? '') || b.regionTags.some((t) => regions.has(t))
                ? 1
                : 0) - (a.regionTags.some((t) => regions.has(t)) ? 1 : 0) ||
              a.id.localeCompare(b.id),
          );
        const preferred = pool.filter((f) =>
          f.regionTags.some((t) => regions.has(t) || t === 'global'),
        );
        const use = preferred.length >= 3 ? preferred : pool;
        const f =
          use[(seed + d * 3 + slot * 2 + MEAL_TYPES.indexOf(mealType)) % Math.max(1, use.length)];
        if (f && !picks.some((p) => p.id === f.id)) picks.push(f);
      });
      const budgetKcal = target * SHARE[mealType];
      const base = picks.map((f) => f.servingG * (f.per100g.kcal / 100));
      const baseTotal = base.reduce((a, b) => a + b, 0) || 1;
      const k = Math.min(2, Math.max(0.5, budgetKcal / baseTotal));
      const items = picks.map((f) =>
        itemFromFood(f, Math.round((f.servingG * k) / 5) * 5 || 5, { confidence: 'medium' }),
      );
      for (const f of picks) {
        tierSum += f.costTier;
        tierN += 1;
      }
      meals.push({ mealType, items });
    }
    days.push({ dayIndex: d, meals, totals: totals(meals.flatMap((m) => m.items)) });
  }
  return {
    days,
    budgetLevel: args.budgetLevel,
    avgCostTier: tierN ? Math.round((tierSum / tierN) * 10) / 10 : 1,
    targetKcal: target,
  };
}

/** A sensible default meal slot for a local clock time. */
export function defaultMealType(d: Date = new Date()): MealType {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}
