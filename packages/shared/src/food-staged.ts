import data from './food-staged.json';
import type { FoodRef } from './food-data';

/**
 * STAGED FOODS. Foods whose values were read, unchanged, from a published source (see scripts/import-fdc-sr.mjs and the notice in food-staged.json), with the
 * source's identifier, edition, retrieval date, attribution and licence note, and with the source's own household serving. They are NOT reviewed: no registered
 * dietitian has checked them, and no cultural reviewer has confirmed their region tags or aliases (the owner's priority cuisines require both). So they are never
 * in the bundled catalogue, never seeded, and are added to the in-memory catalogue only in development and review builds (the same switch as the fixtures),
 * where search and plans label them as awaiting review.
 */
export const STAGED_FOOD_NOTICE: string = data._notice;
export const STAGED_FOODS: readonly FoodRef[] = data.foods as FoodRef[];
