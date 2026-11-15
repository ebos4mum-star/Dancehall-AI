import data from './food-data.json';
import type { Macros } from './nutrition';
import type { FoodProvenance, StagedFoodSource } from './food-provenance';

export const FOOD_CATEGORIES = [
  'grain',
  'protein',
  'legume',
  'vegetable',
  'fruit',
  'dairy',
  'fat',
  'snack',
  'drink',
  'mixed_dish',
] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export interface FoodRef {
  id: string;
  name: string;
  category: FoodCategory;
  regionTags: string[];
  /** Reference nutrition per 100 g. */
  per100g: Macros;
  servingG: number;
  servingLabel: string;
  /** Relative cost: 1 lower, 2 medium, 3 higher. A rough planning aid, not a price. */
  costTier: 1 | 2 | 3;
  aliases: string[];
  /** Where the numbers came from and who reviewed them. Absent on synthetic sample foods. See food-provenance.ts. */
  provenance?: FoodProvenance;
  /**
   * Values taken from a published source but not yet reviewed by a dietitian or a cultural reviewer. Such a food is never bundled or seeded and appears only in
   * development and review builds (see food-staged.ts). When a dietitian approves it, `staged` is replaced by `provenance`.
   */
  staged?: StagedFoodSource;
}

/** SYNTHETIC development data (see the notice inside food-data.json). Never present these values as authoritative. */
export const FOOD_DATA_NOTICE: string = data._notice;
export const CURATED_FOODS: readonly FoodRef[] = data.foods as FoodRef[];
export const FOOD_BY_ID: ReadonlyMap<string, FoodRef> = new Map(
  CURATED_FOODS.map((f) => [f.id, f]),
);
