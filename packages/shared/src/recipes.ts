import type { BudgetLevel, MealPlanDraft } from './food';
import { FOOD_BY_ID, type FoodRef } from './food-data';
import {
  MEAL_TYPES,
  itemFromFood,
  matchReference,
  totals,
  type FoodItemValues,
  type MealType,
  type Totals,
} from './food';

/**
 * Sample recipes built ONLY from the reference foods in food-data.json. Like those foods they are SYNTHETIC development content: not reviewed by a dietitian or a
 * cultural reviewer, and not a claim about how any dish is traditionally made. Nutrition is always computed from the ingredients (never typed in), shown as an
 * estimate, and tagged "check labels". Nothing here is a statement that a recipe is free of any allergen.
 */
export const RECIPES_NOTICE =
  'Sample recipes for development. Amounts are estimates from reference foods, not reviewed by a dietitian. Always check labels and your own allergies.';

export interface RecipeIngredient {
  foodId: string;
  grams: number;
  /** Not needed to make the dish; never counted as missing. */
  optional?: boolean;
}
export interface Recipe {
  id: string;
  name: string;
  mealTypes: MealType[];
  regionTags: string[];
  /** How many portions the ingredient amounts make. */
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  prepMinutes: number;
}

const r = (
  id: string,
  name: string,
  mealTypes: MealType[],
  regionTags: string[],
  servings: number,
  prepMinutes: number,
  ingredients: Array<[string, number] | [string, number, 'optional']>,
  steps: string[],
): Recipe => ({
  id,
  name,
  mealTypes,
  regionTags,
  servings,
  prepMinutes,
  steps,
  ingredients: ingredients.map(([foodId, grams, o]) => ({
    foodId,
    grams,
    ...(o ? { optional: true } : {}),
  })),
});

export const RECIPES: readonly Recipe[] = [
  r(
    'oats-banana-pb',
    'Banana peanut-butter oats',
    ['breakfast'],
    ['global'],
    1,
    5,
    [
      ['oatmeal', 240],
      ['banana', 118],
      ['peanut-butter', 16],
    ],
    ['Warm the oatmeal.', 'Slice the banana on top.', 'Stir in the peanut butter.'],
  ),
  r(
    'egg-toast-avocado',
    'Egg and avocado toast',
    ['breakfast'],
    ['global'],
    1,
    10,
    [
      ['whole-wheat-bread', 80],
      ['boiled-egg', 100],
      ['avocado', 50],
    ],
    ['Toast the bread.', 'Mash the avocado onto it.', 'Slice the eggs on top.'],
  ),
  r(
    'yogurt-mango-nuts',
    'Yogurt, mango and nuts',
    ['breakfast', 'snack'],
    ['global'],
    1,
    3,
    [
      ['plain-yogurt', 170],
      ['mango', 100],
      ['mixed-nuts', 20],
    ],
    ['Spoon the yogurt into a bowl.', 'Add the mango and nuts.'],
  ),
  r(
    'pancakes-banana',
    'Pancakes with banana',
    ['breakfast'],
    ['american', 'global'],
    1,
    10,
    [
      ['pancakes', 130],
      ['banana', 118],
    ],
    ['Warm the pancakes.', 'Top with sliced banana.'],
  ),
  r(
    'plantain-egg-stew',
    'Boiled plantain, egg and tomato stew',
    ['breakfast', 'lunch'],
    ['west_african', 'caribbean'],
    1,
    20,
    [
      ['boiled-plantain', 150],
      ['boiled-egg', 100],
      ['tomato-stew', 100],
    ],
    ['Boil the plantain until soft.', 'Warm the tomato stew.', 'Serve with the sliced eggs.'],
  ),
  r(
    'roti-chickpea',
    'Roti with spiced chickpeas',
    ['breakfast', 'lunch'],
    ['south_asian', 'caribbean'],
    1,
    15,
    [
      ['roti', 90],
      ['chickpeas', 160],
      ['spinach-cooked', 60, 'optional'],
    ],
    ['Warm the chickpeas with your spices.', 'Fold in the spinach.', 'Serve with the roti.'],
  ),
  r(
    'jollof-chicken-salad',
    'Jollof rice, grilled chicken and salad',
    ['lunch', 'dinner'],
    ['west_african'],
    1,
    25,
    [
      ['jollof-rice', 200],
      ['grilled-chicken', 120],
      ['mixed-salad', 80],
    ],
    ['Warm the jollof rice.', 'Grill or reheat the chicken.', 'Serve with the salad.'],
  ),
  r(
    'rice-peas-jerk',
    'Rice and peas with jerk chicken',
    ['lunch', 'dinner'],
    ['caribbean'],
    1,
    30,
    [
      ['rice-and-peas', 200],
      ['jerk-chicken', 130],
      ['mixed-salad', 80, 'optional'],
    ],
    ['Warm the rice and peas.', 'Heat the jerk chicken through.', 'Serve with salad.'],
  ),
  r(
    'goat-curry-roti',
    'Goat curry with roti and greens',
    ['dinner'],
    ['caribbean', 'south_asian'],
    1,
    40,
    [
      ['goat-curry', 180],
      ['roti', 90],
      ['spinach-cooked', 90],
    ],
    ['Simmer the curry until hot.', 'Warm the roti.', 'Serve with the greens.'],
  ),
  r(
    'egusi-yam',
    'Egusi soup with boiled yam',
    ['lunch', 'dinner'],
    ['west_african'],
    1,
    35,
    [
      ['egusi-soup', 200],
      ['yam-boiled', 150],
      ['spinach-cooked', 60, 'optional'],
    ],
    ['Boil the yam.', 'Warm the egusi soup.', 'Serve together.'],
  ),
  r(
    'tilapia-yam-stew',
    'Grilled tilapia, yam and tomato stew',
    ['lunch', 'dinner'],
    ['west_african'],
    1,
    30,
    [
      ['grilled-tilapia', 140],
      ['yam-boiled', 150],
      ['tomato-stew', 100],
    ],
    ['Grill the tilapia.', 'Boil the yam.', 'Serve with the stew.'],
  ),
  r(
    'beef-stew-rice',
    'Beef stew with rice',
    ['dinner'],
    ['west_african', 'caribbean'],
    1,
    35,
    [
      ['beef-stew', 200],
      ['white-rice', 150],
      ['broccoli', 90, 'optional'],
    ],
    ['Cook the rice.', 'Warm the stew.', 'Serve with the broccoli.'],
  ),
  r(
    'lentil-rice-greens',
    'Lentils, brown rice and greens',
    ['lunch', 'dinner'],
    ['south_asian', 'global'],
    1,
    30,
    [
      ['lentils', 180],
      ['brown-rice', 150],
      ['spinach-cooked', 90],
    ],
    ['Cook the rice.', 'Warm the lentils with your spices.', 'Add the greens.'],
  ),
  r(
    'black-bean-bowl',
    'Black bean rice bowl',
    ['lunch', 'dinner'],
    ['latin_american', 'global'],
    1,
    20,
    [
      ['black-beans', 170],
      ['white-rice', 150],
      ['avocado', 50],
      ['mixed-salad', 60, 'optional'],
    ],
    ['Cook the rice.', 'Warm the beans.', 'Top with avocado and salad.'],
  ),
  r(
    'tikka-rice',
    'Chicken tikka masala with rice',
    ['dinner'],
    ['south_asian'],
    1,
    30,
    [
      ['chicken-tikka-masala', 200],
      ['white-rice', 150],
      ['mixed-salad', 60, 'optional'],
    ],
    ['Cook the rice.', 'Warm the tikka masala.', 'Serve with salad.'],
  ),
  r(
    'tofu-stirfry',
    'Tofu and broccoli with rice',
    ['lunch', 'dinner'],
    ['asian', 'global'],
    1,
    20,
    [
      ['tofu', 150],
      ['broccoli', 120],
      ['white-rice', 150],
    ],
    ['Cook the rice.', 'Pan-fry the tofu.', 'Add the broccoli and stir until just tender.'],
  ),
  r(
    'salmon-sweet-potato',
    'Baked salmon, sweet potato and broccoli',
    ['dinner'],
    ['global'],
    1,
    30,
    [
      ['baked-salmon', 140],
      ['sweet-potato', 150],
      ['broccoli', 90],
    ],
    ['Bake the salmon and the sweet potato.', 'Steam the broccoli.'],
  ),
  r(
    'chicken-pasta-veg',
    'Chicken pasta with greens',
    ['lunch', 'dinner'],
    ['mediterranean', 'global'],
    1,
    25,
    [
      ['pasta', 180],
      ['grilled-chicken', 120],
      ['spinach-cooked', 60],
    ],
    ['Cook the pasta.', 'Slice the chicken.', 'Toss everything together.'],
  ),
  r(
    'falafel-pita',
    'Falafel pita with hummus and salad',
    ['lunch'],
    ['mediterranean'],
    1,
    10,
    [
      ['pita-bread', 60],
      ['falafel', 80],
      ['hummus', 60],
      ['greek-salad', 150, 'optional'],
    ],
    ['Warm the pita.', 'Fill with falafel and hummus.', 'Serve with salad.'],
  ),
  r(
    'greek-chickpea-bowl',
    'Greek salad with chickpeas and pita',
    ['lunch'],
    ['mediterranean'],
    1,
    10,
    [
      ['greek-salad', 150],
      ['chickpeas', 120],
      ['pita-bread', 60],
    ],
    ['Combine the salad and chickpeas.', 'Serve with the pita.'],
  ),
  r(
    'paneer-spinach',
    'Paneer, spinach and roti',
    ['lunch', 'dinner'],
    ['south_asian'],
    1,
    20,
    [
      ['paneer', 80],
      ['spinach-cooked', 120],
      ['roti', 90],
    ],
    ['Pan-fry the paneer.', 'Add the spinach.', 'Serve with the roti.'],
  ),
  r(
    'fried-rice-egg',
    'Egg fried rice with broccoli',
    ['lunch', 'dinner'],
    ['asian', 'global'],
    1,
    15,
    [
      ['fried-rice', 200],
      ['boiled-egg', 50],
      ['broccoli', 90],
    ],
    ['Warm the fried rice.', 'Add the chopped egg and broccoli.'],
  ),
  r(
    'fruit-nut-snack',
    'Apple with peanut butter',
    ['snack'],
    ['global'],
    1,
    2,
    [
      ['apple', 180],
      ['peanut-butter', 16],
    ],
    ['Slice the apple.', 'Dip in the peanut butter.'],
  ),
  r(
    'plantain-bean-plate',
    'Plantain and black bean plate',
    ['lunch', 'dinner'],
    ['caribbean', 'latin_american'],
    1,
    20,
    [
      ['fried-plantain', 100],
      ['black-beans', 170],
      ['white-rice', 100, 'optional'],
    ],
    ['Warm the beans.', 'Fry or warm the plantain.', 'Serve with the rice if using.'],
  ),
];
export const RECIPE_BY_ID: ReadonlyMap<string, Recipe> = new Map(RECIPES.map((x) => [x.id, x]));

// ---------- nutrition ----------
const food = (id: string): FoodRef => {
  const f = FOOD_BY_ID.get(id);
  if (!f) throw new Error(`unknown food ${id}`);
  return f;
};
const round5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);

/** Ingredient lines as diary items for `portions` servings (default one). Medium confidence: a recipe is an estimate. */
export function recipeItems(
  recipe: Recipe,
  portions = 1,
  opts: { withOptional?: boolean } = {},
): FoodItemValues[] {
  const k =
    (Number.isFinite(portions) && portions > 0 ? portions : 1) / Math.max(1, recipe.servings);
  return recipe.ingredients
    .filter((i) => !i.optional || opts.withOptional)
    .map((i) => itemFromFood(food(i.foodId), round5(i.grams * k), { confidence: 'medium' }));
}
/** Nutrition for `portions` servings. Totals carry a calorie range, so it is shown as an estimate. */
export function recipeNutrition(
  recipe: Recipe,
  portions = 1,
  opts: { withOptional?: boolean } = {},
): Totals {
  return totals(recipeItems(recipe, portions, opts));
}

// ---------- diet tags (conservative, ingredient-based) ----------
const MEAT_FISH = new Set([
  'grilled-chicken',
  'jerk-chicken',
  'fried-chicken',
  'grilled-tilapia',
  'baked-salmon',
  'beef-stew',
  'goat-curry',
  'chicken-tikka-masala',
  'egusi-soup',
  'fried-rice',
  'jollof-rice',
  'rice-and-peas',
]);
const ANIMAL_OTHER = new Set([
  'boiled-egg',
  'plain-yogurt',
  'milk',
  'paneer',
  'pancakes',
  'greek-salad',
  'tomato-stew',
]);
export interface DietTags {
  vegetarian: boolean;
  vegan: boolean;
}
/**
 * "Vegetarian" and "vegan" are only claimed when every ingredient is a plain food known to contain no meat, fish, egg or dairy. Prepared dishes (stews, jollof,
 * fried rice, greek salad...) vary by cook and are NOT claimed. A missing tag means "not sure", never "contains". Always check labels.
 */
export function dietTags(recipe: Recipe): DietTags {
  const ids = recipe.ingredients.map((i) => i.foodId);
  const vegetarian = ids.every(
    (id) => !MEAT_FISH.has(id) && id !== 'tomato-stew' && id !== 'greek-salad',
  );
  const vegan = vegetarian && ids.every((id) => !ANIMAL_OTHER.has(id) && !MEAT_FISH.has(id));
  return { vegetarian, vegan };
}

export type Diet = 'vegetarian' | 'vegan' | null;
export interface FridgeOptions {
  mealType?: MealType;
  regions?: readonly string[];
  diet?: Diet;
  /** Words to avoid (for example "peanut"). A recipe with an ingredient whose name or alias contains one is left out. This is a convenience filter, NOT allergy protection. */
  excludeWords?: readonly string[];
  /** Most required ingredients that may be missing. */
  maxMissing?: number;
  limit?: number;
  recipes?: readonly Recipe[];
}
export interface FridgeMatch {
  recipe: Recipe;
  have: string[];
  missing: string[];
  coverage: number;
  perServing: Totals;
}

const names = (id: string) => {
  const f = food(id);
  return [f.name, ...f.aliases].map((n) => n.toLowerCase());
};
export const hasExcluded = (recipe: Recipe, words: readonly string[]): boolean => {
  const w = words.map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2);
  return (
    w.length > 0 &&
    recipe.ingredients.some((i) =>
      names(i.foodId).some((n) => w.some((x) => n.includes(x) || i.foodId.includes(x))),
    )
  );
};

/** Turns typed words ("rice", "chicken") into reference food ids. Unknown words are returned separately so the screen can say so. */
export function resolveIngredients(words: readonly string[]): { ids: string[]; unknown: string[] } {
  const ids = new Set<string>();
  const unknown: string[] = [];
  for (const w of words) {
    const m = matchReference(w);
    if (m) ids.add(m.id);
    else if (w.trim()) unknown.push(w.trim());
  }
  return { ids: [...ids], unknown };
}

/**
 * Fridge-to-meal: recipes you can make (or nearly make) from the foods you have. Pure and rule-based: no AI, nothing leaves the device.
 * Ranked by how much of the required list you already have, then by fewest missing, then by region match.
 */
export function fridgeMatches(
  haveFoodIds: readonly string[],
  opts: FridgeOptions = {},
): FridgeMatch[] {
  const have = new Set(haveFoodIds);
  const maxMissing = opts.maxMissing ?? 2;
  const regions = new Set(opts.regions ?? []);
  const out: Array<FridgeMatch & { regionHit: number }> = [];
  for (const recipe of opts.recipes ?? RECIPES) {
    if (opts.mealType && !recipe.mealTypes.includes(opts.mealType)) continue;
    const tags = dietTags(recipe);
    if (opts.diet === 'vegetarian' && !tags.vegetarian) continue;
    if (opts.diet === 'vegan' && !tags.vegan) continue;
    if (opts.excludeWords && hasExcluded(recipe, opts.excludeWords)) continue;
    const required = recipe.ingredients.filter((i) => !i.optional);
    const haveIds = required.filter((i) => have.has(i.foodId)).map((i) => i.foodId);
    const missing = required.filter((i) => !have.has(i.foodId)).map((i) => i.foodId);
    if (haveIds.length === 0 || missing.length > maxMissing) continue;
    out.push({
      recipe,
      have: haveIds,
      missing,
      coverage: Math.round((haveIds.length / required.length) * 100) / 100,
      perServing: recipeNutrition(recipe, 1),
      regionHit: recipe.regionTags.some((t) => regions.has(t)) ? 1 : 0,
    });
  }
  return out
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        a.missing.length - b.missing.length ||
        b.regionHit - a.regionHit ||
        a.recipe.name.localeCompare(b.recipe.name),
    )
    .slice(0, opts.limit ?? 8)
    .map(({ regionHit: _r, ...m }) => m);
}

// ---------- ingredient substitutions ----------
const SUB_GROUPS: string[][] = [
  ['white-rice', 'brown-rice', 'pasta', 'yam-boiled', 'boiled-plantain', 'sweet-potato', 'roti'],
  [
    'grilled-chicken',
    'grilled-tilapia',
    'baked-salmon',
    'tofu',
    'boiled-egg',
    'lentils',
    'black-beans',
    'chickpeas',
    'paneer',
  ],
  ['spinach-cooked', 'broccoli', 'mixed-salad'],
  ['banana', 'mango', 'orange', 'apple', 'pineapple'],
  ['plain-yogurt', 'milk'],
  ['avocado', 'peanut-butter', 'mixed-nuts'],
];
export interface Substitute {
  food: FoodRef;
  /** Amount that keeps the calories close to the original. */
  grams: number;
  kcalDelta: number;
  proteinDeltaG: number;
  note: string;
}
/** Swap ideas for one ingredient, scaled so calories stay near the original (between half and double the weight). Never suggests something unrelated. */
export function substitutesFor(
  foodId: string,
  grams: number,
  opts: { diet?: Diet; excludeWords?: readonly string[]; limit?: number } = {},
): Substitute[] {
  const from = FOOD_BY_ID.get(foodId);
  const group = SUB_GROUPS.find((g) => g.includes(foodId));
  if (!from || !group || !(grams > 0)) return [];
  const words = (opts.excludeWords ?? [])
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 2);
  const out: Substitute[] = [];
  for (const id of group) {
    if (id === foodId) continue;
    if (opts.diet && (MEAT_FISH.has(id) || (opts.diet === 'vegan' && ANIMAL_OTHER.has(id))))
      continue;
    const f = food(id);
    if (words.some((w) => [f.name, ...f.aliases].some((n) => n.toLowerCase().includes(w))))
      continue;
    const kcalFrom = from.per100g.kcal * (grams / 100);
    const scale =
      f.per100g.kcal > 0 ? Math.min(2, Math.max(0.5, from.per100g.kcal / f.per100g.kcal)) : 1;
    const g = round5(grams * scale);
    const kcalTo = f.per100g.kcal * (g / 100);
    const proteinDelta =
      Math.round((f.per100g.proteinG * (g / 100) - from.per100g.proteinG * (grams / 100)) * 10) /
      10;
    out.push({
      food: f,
      grams: g,
      kcalDelta: Math.round(kcalTo - kcalFrom),
      proteinDeltaG: proteinDelta,
      note: `${g} g keeps calories within about ${Math.abs(Math.round(kcalTo - kcalFrom))} kcal of the original; taste and texture will differ.`,
    });
  }
  return out
    .sort(
      (a, b) =>
        Math.abs(a.kcalDelta) - Math.abs(b.kcalDelta) || a.food.name.localeCompare(b.food.name),
    )
    .slice(0, opts.limit ?? 4);
}

/** The recipe with some ingredients replaced (and their amounts rescaled), so its nutrition is recomputed honestly. Unknown replacements are ignored. */
export function substituteIn(recipe: Recipe, replace: Readonly<Record<string, string>>): Recipe {
  return {
    ...recipe,
    id: `${recipe.id}+sub`,
    ingredients: recipe.ingredients.map((i) => {
      const to = replace[i.foodId];
      if (!to || !FOOD_BY_ID.has(to)) return i;
      const subs = substitutesFor(i.foodId, i.grams, { limit: 20 }).find((s) => s.food.id === to);
      return { ...i, foodId: to, grams: subs ? subs.grams : i.grams };
    }),
  };
}

// ---------- weekly plan from recipes ----------
export interface RecipePlanMeal {
  mealType: MealType;
  recipe: Recipe;
  portions: number;
  items: FoodItemValues[];
  totals: Totals;
}
export interface RecipePlanDay {
  dayIndex: number;
  meals: RecipePlanMeal[];
  totals: Totals;
}
export interface RecipePlan {
  days: RecipePlanDay[];
  targetKcal: number;
  note: string;
}
const SHARE: Record<MealType, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.3, snack: 0.15 };

/**
 * A week of meals built from the sample recipes. Portions are scaled in quarter steps (between 0.5 and 2) to land near each meal's share of the daily target,
 * which is never taken below `floorKcal`. Recipes repeat as little as the pool allows. It is a starting point to edit, not a prescription.
 */
export function planWeekFromRecipes(args: {
  days?: number;
  targetKcal: number;
  floorKcal: number;
  regions?: readonly string[];
  diet?: Diet;
  excludeWords?: readonly string[];
  seed?: number;
  recipes?: readonly Recipe[];
}): RecipePlan {
  const target = Math.max(Number.isFinite(args.targetKcal) ? args.targetKcal : 0, args.floorKcal);
  const n = Math.max(1, Math.min(14, Number.isFinite(args.days ?? 7) ? (args.days ?? 7) : 7));
  const regions = new Set(args.regions ?? []);
  const pool = (args.recipes ?? RECIPES).filter((x) => {
    const tags = dietTags(x);
    if (args.diet === 'vegetarian' && !tags.vegetarian) return false;
    if (args.diet === 'vegan' && !tags.vegan) return false;
    return !(args.excludeWords && hasExcluded(x, args.excludeWords));
  });
  const used = new Map<string, number>();
  const days: RecipePlanDay[] = [];
  for (let d = 0; d < n; d++) {
    const meals: RecipePlanMeal[] = [];
    for (const mealType of MEAL_TYPES) {
      const cands = pool
        .filter((x) => x.mealTypes.includes(mealType))
        .sort(
          (a, b) =>
            (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) ||
            (b.regionTags.some((t) => regions.has(t)) ? 1 : 0) -
              (a.regionTags.some((t) => regions.has(t)) ? 1 : 0) ||
            a.id.localeCompare(b.id),
        );
      if (cands.length === 0) continue;
      const lowest = used.get(cands[0]!.id) ?? 0;
      const tied = cands.filter((x) => (used.get(x.id) ?? 0) === lowest);
      const recipe = tied[((args.seed ?? 0) + d) % tied.length]!;
      used.set(recipe.id, (used.get(recipe.id) ?? 0) + 1);
      const one = recipeNutrition(recipe, 1).kcal || 1;
      const portions = Math.min(
        2,
        Math.max(0.5, Math.round(((target * SHARE[mealType]) / one) * 4) / 4),
      );
      const items = recipeItems(recipe, portions);
      meals.push({ mealType, recipe, portions, items, totals: totals(items) });
    }
    days.push({ dayIndex: d, meals, totals: totals(meals.flatMap((m) => m.items)) });
  }
  return { days, targetKcal: target, note: RECIPES_NOTICE };
}

/** The recipe plan in the same shape as the basic-foods plan, so saving, shopping lists and household sharing work unchanged. Meals keep their recipe name. */
export function recipePlanToDraft(plan: RecipePlan, budgetLevel: BudgetLevel): MealPlanDraft {
  const tiers = plan.days.flatMap((d) =>
    d.meals.flatMap((m) =>
      m.items.map((i) => (i.foodId ? (FOOD_BY_ID.get(i.foodId)?.costTier ?? 2) : 2)),
    ),
  );
  return {
    days: plan.days.map((d) => ({
      dayIndex: d.dayIndex,
      meals: d.meals.map((m) => ({ mealType: m.mealType, title: m.recipe.name, items: m.items })),
      totals: d.totals,
    })),
    budgetLevel,
    avgCostTier: tiers.length
      ? Math.round((tiers.reduce((a, b) => a + b, 0) / tiers.length) * 10) / 10
      : 1,
    targetKcal: plan.targetKcal,
  };
}
