import { FOOD_BY_ID } from './food-data';

/**
 * Simple nutrition and fitness habits. Ideas the person can add with one tap (inside the existing five-habit cap), and a gentle "your logs show this today" hint.
 * A hint NEVER checks a habit off for them: the person taps it, so nothing is ever recorded on their behalf. No streaks, no penalties.
 *
 * Food-based hints read what was logged, so they are not produced when the person's food numbers are hidden or they have an eating concern, and nutrition ideas are not
 * offered at all with an eating concern. PROVISIONAL and not medical advice.
 */
export type HabitSignalId =
  | 'meal_logged'
  | 'veg_fruit_logged'
  | 'water_logged'
  | 'move_done'
  | 'walk_logged'
  | 'strength_logged';
export type HabitKind = 'nutrition' | 'fitness' | 'general';

export interface StarterHabit {
  name: string;
  kind: HabitKind;
  /** What in today's logs shows it was done, when something can. */
  signal?: HabitSignalId;
  why: string;
}

/** Names are at most 40 characters (the habit name limit). */
export const STARTER_HABITS: readonly StarterHabit[] = [
  {
    name: 'Move for 10 minutes',
    kind: 'fitness',
    signal: 'move_done',
    why: 'Ten minutes of dancing, walking or strength counts, and is easy to start.',
  },
  {
    name: 'Take a short walk outside',
    kind: 'fitness',
    signal: 'walk_logged',
    why: 'Short walks add up and are easy to fit into a day.',
  },
  {
    name: 'Do a short strength session',
    kind: 'fitness',
    signal: 'strength_logged',
    why: 'Easy, regular sessions build strength better than rare hard ones.',
  },
  {
    name: 'Log one meal',
    kind: 'nutrition',
    signal: 'meal_logged',
    why: 'Noticing what you eat, without judging it, is a calm way to start.',
  },
  {
    name: 'Add a vegetable or fruit to a meal',
    kind: 'nutrition',
    signal: 'veg_fruit_logged',
    why: 'A gentle way to add fibre and variety without changing everything.',
  },
  {
    name: 'Drink a glass of water',
    kind: 'nutrition',
    signal: 'water_logged',
    why: 'Small habits add up, and water is an easy one.',
  },
  {
    name: 'Wind down before bed',
    kind: 'general',
    why: 'A regular wind-down can make it easier to settle to sleep.',
  },
];

const norm = (s: string) => s.trim().toLowerCase();

/** The starter habit a person's habit is (matched by its name), if it is one. */
export function starterFor(name: string): StarterHabit | undefined {
  return STARTER_HABITS.find((h) => norm(h.name) === norm(name));
}

export function starterIdeas(a: {
  existingNames: readonly string[];
  eatingConcern: boolean;
  /** How many habits the person has room for. */
  room: number;
  max?: number;
}): StarterHabit[] {
  if (a.room <= 0) return [];
  const have = new Set(a.existingNames.map(norm));
  return STARTER_HABITS.filter(
    (h) => !have.has(norm(h.name)) && !(a.eatingConcern && h.kind === 'nutrition'),
  ).slice(0, Math.min(a.room, a.max ?? 3));
}

export interface HabitSignalInput {
  /** What was logged today (local day). */
  foodItemsToday: ReadonlyArray<{ foodId: string | null }>;
  mealsToday: number;
  sessionsCompletedToday: number;
  /** Today's wellness entries: kind and amount (minutes or ml). */
  wellnessToday: ReadonlyArray<{ kind: string; amount: number }>;
  /** True when food-based hints must not be produced (hidden numbers or an eating concern). */
  hideFoodSignals: boolean;
}

export function habitSignals(i: HabitSignalInput): Set<HabitSignalId> {
  const out = new Set<HabitSignalId>();
  if (!i.hideFoodSignals) {
    if (i.mealsToday > 0) out.add('meal_logged');
    if (
      i.foodItemsToday.some((it) => {
        const c = it.foodId ? FOOD_BY_ID.get(it.foodId)?.category : undefined;
        return c === 'vegetable' || c === 'fruit';
      })
    )
      out.add('veg_fruit_logged');
  }
  const minutes = (k: string) =>
    i.wellnessToday
      .filter((e) => e.kind === k)
      .reduce((n, e) => n + (Number.isFinite(e.amount) ? e.amount : 0), 0);
  if (i.wellnessToday.some((e) => e.kind === 'hydration' && e.amount > 0)) out.add('water_logged');
  if (minutes('walk') > 0) out.add('walk_logged');
  if (i.wellnessToday.some((e) => e.kind === 'strength' && e.amount > 0))
    out.add('strength_logged');
  if (i.sessionsCompletedToday > 0 || minutes('walk') + minutes('strength') >= 10)
    out.add('move_done');
  return out;
}
