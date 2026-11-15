import type { FoodRef } from './food-data';
import { CUISINES, isCuisineId } from './cuisines';

/**
 * Food provenance. A food may leave "synthetic" status only with a documented source, a licence confirmation, an independent dietitian review (and, for the owner's
 * priority cuisines, a cultural review), and numbers that are physically and energetically plausible. This module writes and ships NO nutrition values: it only checks
 * values that a licensed, published source and a dietitian supplied. The source list names CANDIDATE published tables; a reviewer must confirm each edition and
 * its licence before any value is taken from it (`licenceRef` records that confirmation).
 */
export const FOOD_SOURCE_IDS = [
  'usda_fdc',
  'fao_infoods_west_africa',
  'kenya_fct',
  'safoods',
  'cofid_uk',
  'caribbean_fct',
  'national_table_other',
  'dietitian_curated',
] as const;
export type FoodSourceId = (typeof FOOD_SOURCE_IDS)[number];

export const FOOD_SOURCES: Record<FoodSourceId, { title: string; note: string }> = {
  usda_fdc: {
    title: 'USDA FoodData Central',
    note: 'Candidate source. Reviewer confirms the dataset, release and licence terms.',
  },
  fao_infoods_west_africa: {
    title: 'West African Food Composition Table (FAO/INFOODS)',
    note: 'Candidate source for West African foods. Reviewer confirms edition and licence.',
  },
  kenya_fct: {
    title: 'Kenya Food Composition Tables',
    note: 'Candidate source for East African foods. Reviewer confirms edition and licence.',
  },
  safoods: {
    title: 'South African Food Composition Database (SAFOODS)',
    note: 'Candidate source for Southern African foods. Reviewer confirms edition and licence.',
  },
  cofid_uk: {
    title: 'UK Composition of Foods Integrated Dataset (CoFID)',
    note: 'Candidate source. Reviewer confirms edition and licence.',
  },
  caribbean_fct: {
    title: 'Food composition tables for the English-speaking Caribbean',
    note: 'Candidate source for Jamaican and Caribbean foods. Reviewer confirms edition and licence.',
  },
  national_table_other: {
    title: 'Another published national or regional composition table',
    note: 'The attribution must name the table, publisher and year.',
  },
  dietitian_curated: {
    title: 'Entry curated by a registered dietitian',
    note: 'The attribution must name the dietitian’s review record and the sources they used.',
  },
};

export interface FoodProvenance {
  sourceId: FoodSourceId;
  /** The food's own identifier or name in that source (so every number can be traced back). */
  sourceFoodId: string;
  /** Edition, release or year of the source. */
  sourceVersion: string;
  /** YYYY-MM-DD the values were taken from the source. */
  retrievedOn: string;
  attribution: string;
  /** Reference to the reviewer's confirmation that the source's licence allows this use. */
  licenceRef: string;
  /** Reference to the registered dietitian's review record. */
  reviewRef: string;
  /** Required when the food carries one of the priority cuisines' tags. */
  culturalReviewRef?: string;
}

const ID = /^[a-z0-9-]{2,60}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITY_TAGS = new Set(
  Object.values(CUISINES)
    .filter((c) => c.priority === 1)
    .map((c) => c.id as string),
);
const filled = (s: string | undefined): boolean => typeof s === 'string' && s.trim().length >= 3;

/** Energy implied by the macros (4 kcal per g protein and carbohydrate, 9 per g fat). A published value should be close to it. */
export const atwaterKcal = (n: { proteinG: number; carbsG: number; fatG: number }): number =>
  4 * n.proteinG + 4 * n.carbsG + 9 * n.fatG;

/** Is the stated energy plausible against the macros? Allows for rounding, fibre and different published energy factors. */
export function energyIsPlausible(n: {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): boolean {
  const implied = atwaterKcal(n);
  return Math.abs(n.kcal - implied) <= Math.max(25, 0.2 * Math.max(n.kcal, implied));
}

/** Everything wrong with a food's values or provenance. Synthetic foods (no provenance) are allowed but must not claim to be anything else. */
export function foodProblems(f: FoodRef): string[] {
  const p: string[] = [];
  const n = f.per100g;
  if (!ID.test(f.id)) p.push(`${f.id}: id must be kebab-case, 2 to 60 characters`);
  if (!(f.servingG > 0)) p.push(`${f.id}: serving size must be positive`);
  if (![1, 2, 3].includes(f.costTier)) p.push(`${f.id}: cost tier must be 1, 2 or 3`);
  if (n.kcal < 0 || n.kcal > 950) p.push(`${f.id}: energy out of range`);
  for (const [k, v] of [
    ['protein', n.proteinG],
    ['carbohydrate', n.carbsG],
    ['fat', n.fatG],
  ] as const)
    if (v < 0 || v > 100) p.push(`${f.id}: ${k} out of range`);
  if (n.proteinG + n.carbsG + n.fatG > 100.5) p.push(`${f.id}: macros exceed 100 g per 100 g`);
  const pr = f.provenance;
  if (!pr) return p; // synthetic sample: allowed, labelled, and never counted as reviewed
  if (!(pr.sourceId in FOOD_SOURCES)) p.push(`${f.id}: unknown source`);
  if (!filled(pr.sourceFoodId)) p.push(`${f.id}: no source food identifier`);
  if (!filled(pr.sourceVersion)) p.push(`${f.id}: no source edition`);
  if (!DATE.test(pr.retrievedOn)) p.push(`${f.id}: retrieval date must be YYYY-MM-DD`);
  if (!filled(pr.attribution)) p.push(`${f.id}: no attribution`);
  if (!filled(pr.licenceRef)) p.push(`${f.id}: no licence confirmation`);
  if (!filled(pr.reviewRef)) p.push(`${f.id}: no dietitian review record`);
  if (f.regionTags.some((t) => PRIORITY_TAGS.has(t)) && !filled(pr.culturalReviewRef))
    p.push(`${f.id}: priority-cuisine foods need a cultural review record`);
  for (const t of f.regionTags)
    if (t !== 'global' && t !== 'american' && !isCuisineId(t))
      p.push(`${f.id}: unknown region tag "${t}"`);
  if (!energyIsPlausible({ kcal: n.kcal, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG }))
    p.push(`${f.id}: energy does not match the macros (check for a typing error)`);
  return p;
}

/** A food is reviewed only when it has provenance and no problems. */
export const isReviewedFood = (f: FoodRef): boolean =>
  !!f.provenance && foodProblems(f).length === 0;
