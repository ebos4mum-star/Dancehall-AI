/** Nutrition data interfaces. Estimates are never exact: every value carries its source and uncertainty. */
export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
}

export type NutritionSource =
  'usda_fdc' | 'open_food_facts' | 'curated' | 'user_manual' | 'ai_estimate';

export interface FoodReference {
  id: string;
  name: string;
  source: NutritionSource;
  /** Reference nutrition per 100 g. */
  per100g: Macros;
  regionTags?: string[];
}

export type Confidence = 'low' | 'medium' | 'high';

export interface FoodLogItem {
  id: string;
  name: string;
  referenceId?: string;
  grams: number;
  /** Calorie range for the portion; the single number shown to users is `macros.kcal`. */
  kcalLow: number;
  kcalHigh: number;
  macros: Macros;
  source: NutritionSource;
  confidence: Confidence;
  /** True once the user has reviewed or changed any field. */
  userEdited: boolean;
}

export function macrosForGrams(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  const scale = (v: number | undefined) => (v === undefined ? undefined : v * f);
  const out: Macros = {
    kcal: per100g.kcal * f,
    proteinG: per100g.proteinG * f,
    carbsG: per100g.carbsG * f,
    fatG: per100g.fatG * f,
  };
  for (const k of ['fiberG', 'sugarG', 'sodiumMg'] as const) {
    const v = scale(per100g[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function sumMacros(items: readonly Macros[]): Macros {
  return items.reduce<Macros>(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      proteinG: a.proteinG + m.proteinG,
      carbsG: a.carbsG + m.carbsG,
      fatG: a.fatG + m.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** Honest label for an item. AI estimates are always worded as estimates, never as exact values. */
export function estimateLabel(
  item: Pick<FoodLogItem, 'source' | 'confidence' | 'userEdited'>,
): string {
  if (item.source === 'ai_estimate' && !item.userEdited) {
    return `Estimate (${item.confidence} confidence). Tap to adjust.`;
  }
  if (item.userEdited) return 'Edited by you';
  return 'From nutrition reference data';
}

/** A symmetric uncertainty band around a point estimate. Wider for lower confidence. */
export function kcalRange(kcal: number, confidence: Confidence): { low: number; high: number } {
  const spread = confidence === 'high' ? 0.15 : confidence === 'medium' ? 0.25 : 0.4;
  return { low: Math.round(kcal * (1 - spread)), high: Math.round(kcal * (1 + spread)) };
}
