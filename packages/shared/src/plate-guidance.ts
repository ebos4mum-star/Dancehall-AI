import { FOOD_BY_ID, type FoodCategory } from './food-data';
import type { FoodItemValues } from './food';

/**
 * Protein, fibre and balanced-plate guidance for the Food tab. Pure and gentle: no streaks, no scolding, no calorie talk, no claim that anything is "good" or "bad".
 * It only describes what was logged today against a general, widely used plate model and the person's own protein range (from the calorie engine).
 *
 * Honest about what it can see: fibre and food groups come from the reference-food table, so items without a match (hand-entered foods, packaged products) are counted as
 * "not classified" and never guessed. Guidance is withheld entirely, except the static plate picture, when the person's numbers are hidden (an eating concern, pregnancy or
 * postpartum, or tracking turned off), because analysing what someone ate is exactly what those choices opt out of.
 *
 * PROVISIONAL: the plate model and the general fibre guide are common public-health defaults. Nothing here has been reviewed by a registered dietitian, and it is not medical advice.
 */
export type PlateGroup = 'veg_fruit' | 'protein' | 'grain' | 'dairy';
const GROUP_OF: Partial<Record<FoodCategory, PlateGroup>> = {
  vegetable: 'veg_fruit',
  fruit: 'veg_fruit',
  protein: 'protein',
  legume: 'protein',
  grain: 'grain',
  dairy: 'dairy',
};

/** A common general guide for adult fibre intake, in grams per day. Needs differ; this is a talking point, not a target. */
export const FIBRE_GUIDE_G = 25;

export const PLATE_MODEL = [
  { id: 'veg_fruit', share: 'about half', label: 'Vegetables and fruit' },
  {
    id: 'protein',
    share: 'about a quarter',
    label: 'Protein foods, such as beans, fish, eggs, poultry or tofu',
  },
  { id: 'grain', share: 'about a quarter', label: 'Whole grains or starchy foods' },
] as const;
export const PLATE_NOTE =
  'A general plate picture that works with any cuisine: use the foods you grew up with. It is a guide, not a rule, and not medical advice.';

export interface PlateGuidanceInput {
  /** Everything logged today. */
  items: ReadonlyArray<Pick<FoodItemValues, 'foodId' | 'grams' | 'proteinG'>>;
  /** The person's own protein range from the calorie engine, or null when none is available. */
  proteinRange: { low: number; high: number } | null;
  /** True when the person's numbers are hidden. */
  hidden: boolean;
}

export interface PlateGuidance {
  hidden: boolean;
  provisional: true;
  model: typeof PLATE_MODEL;
  note: string;
  protein: {
    gramsToday: number;
    low: number;
    high: number;
    /** 0..1 of the low end of the range, for a calm bar. Never a score. */
    fraction: number;
    status: 'building' | 'within' | 'above';
    message: string;
  } | null;
  fibre: {
    gramsKnown: number;
    guideG: number;
    matchedItems: number;
    totalItems: number;
    message: string;
  } | null;
  /** Which plate groups appear among the foods that could be classified today. Null when nothing could be (or numbers are hidden). */
  groups: Record<PlateGroup, boolean> | null;
  coverage: { classified: number; total: number };
  /** At most two gentle suggestions. */
  nudges: string[];
}

const r0 = (n: number) => Math.round(n);

export function plateGuidance(i: PlateGuidanceInput): PlateGuidance {
  const total = i.items.length;
  const base = { provisional: true as const, model: PLATE_MODEL, note: PLATE_NOTE };
  if (i.hidden)
    return {
      ...base,
      hidden: true,
      protein: null,
      fibre: null,
      groups: null,
      coverage: { classified: 0, total: 0 },
      nudges: [],
    };

  const refs = i.items.map((it) => (it.foodId ? FOOD_BY_ID.get(it.foodId) : undefined));
  const classified = refs.filter((r) => r && GROUP_OF[r.category]).length;
  const groups: Record<PlateGroup, boolean> = {
    veg_fruit: false,
    protein: false,
    grain: false,
    dairy: false,
  };
  for (const r of refs) {
    const g = r ? GROUP_OF[r.category] : undefined;
    if (g) groups[g] = true;
  }

  let protein: PlateGuidance['protein'] = null;
  if (i.proteinRange && total > 0) {
    const g = r0(
      i.items.reduce((n, it) => n + (Number.isFinite(it.proteinG) ? it.proteinG : 0), 0),
    );
    const { low, high } = i.proteinRange;
    const status = g > high ? 'above' : g >= low ? 'within' : 'building';
    protein = {
      gramsToday: g,
      low,
      high,
      fraction: low > 0 ? Math.min(1, g / low) : 0,
      status,
      message:
        status === 'within'
          ? `About ${g} g of protein so far today, within a general range of ${low} to ${high} g. There is no need to hit it exactly.`
          : status === 'above'
            ? `About ${g} g of protein so far today, a little above a general range of ${low} to ${high} g. That is fine for one day; it is a guide, not a limit.`
            : `About ${g} g of protein so far today. A general range for you is ${low} to ${high} g across the whole day, and the day is not over.`,
    };
  }

  let fibre: PlateGuidance['fibre'] = null;
  if (total > 0) {
    let grams = 0;
    let matched = 0;
    i.items.forEach((it, k) => {
      const f = refs[k]?.per100g.fiberG;
      if (typeof f === 'number' && Number.isFinite(f) && it.grams > 0) {
        grams += (f * it.grams) / 100;
        matched += 1;
      }
    });
    fibre = {
      gramsKnown: Math.round(grams * 10) / 10,
      guideG: FIBRE_GUIDE_G,
      matchedItems: matched,
      totalItems: total,
      message:
        matched === 0
          ? 'We cannot estimate fibre from what is logged so far. Beans, vegetables, fruit and whole grains are the main sources.'
          : `About ${Math.round(grams * 10) / 10} g of fibre from the foods we could match (${matched} of ${total}). A common general guide for adults is about ${FIBRE_GUIDE_G} g a day. Beans, vegetables, fruit and whole grains are the main sources.`,
    };
  }

  const nudges: string[] = [];
  // Suggestions only when we can actually see enough of the day to say something true.
  if (classified >= 2 && !groups.veg_fruit)
    nudges.push(
      'No vegetables or fruit logged yet today. Adding some to your next meal is an easy start.',
    );
  if (protein && protein.status === 'building' && total >= 3 && !groups.protein)
    nudges.push(
      'A little protein, like beans, eggs, fish or yoghurt, can help meals feel more filling.',
    );

  return {
    ...base,
    hidden: false,
    protein,
    fibre,
    groups: classified > 0 ? groups : null,
    coverage: { classified, total },
    nudges: nudges.slice(0, 2),
  };
}
