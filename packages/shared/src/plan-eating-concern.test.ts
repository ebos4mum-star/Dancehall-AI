import { describe, expect, it } from 'vitest';
import {
  PLAN_MODES,
  generateDailyPlan,
  parsePrefs,
  wellnessPlanContext,
  type DailyPlanInput,
} from './index';

/** With an eating concern the Daily Fit Plan makes no unsolicited food prompts. Voluntary food features are untouched (they are screens the person opens). */
const FOOD_WORDS =
  /\b(meal|meals|eat|eating|ate|food|portion|portions|protein|veg|carbs|plate|hunger|fullness|log what you)\b/i;
const base: DailyPlanInput = {
  date: '2026-06-17',
  mode: 'normal',
  localHour: 9,
  lowImpact: false,
  plannedToday: [],
  doneToday: [],
  mealsLoggedToday: 0,
  activeGoalTypes: ['lose'],
  daysSinceWeight: 10,
  seed: 0,
};
const wellness = (eatingConcern: boolean): NonNullable<DailyPlanInput['wellness']> =>
  wellnessPlanContext({
    prefs: parsePrefs({ goalIntent: 'lose', eatingConcern }),
    entries: [],
    day: '2026-06-17',
    weightKg: 70,
  });

describe('Daily Fit Plan and an eating concern', () => {
  it('the preference reaches the plan from stored preferences', () => {
    expect(wellness(true).eatingConcern).toBe(true);
    expect(wellness(false).eatingConcern).toBe(false);
  });

  it('offers no food item of any kind, in every mode, hour and seed', () => {
    for (const mode of PLAN_MODES)
      for (const localHour of [7, 11, 13, 19, 22])
        for (const mealsLoggedToday of [0, 2])
          for (let seed = 0; seed < 5; seed++) {
            const plan = generateDailyPlan({
              ...base,
              mode,
              localHour,
              mealsLoggedToday,
              seed,
              wellness: wellness(true),
            });
            const label = `${mode} ${localHour}h meals=${mealsLoggedToday} seed=${seed}`;
            expect(
              plan.items.filter((i) => i.kind === 'meal'),
              label,
            ).toEqual([]);
            for (const i of plan.items) {
              expect(`${i.title} ${i.detail}`, `${label}: ${i.title}`).not.toMatch(FOOD_WORDS);
              expect(i.ref?.action, label).not.toBe('log_hunger');
            }
          }
  });

  it('still offers movement, habits and rest, each with a reason', () => {
    const plan = generateDailyPlan({ ...base, wellness: wellness(true) });
    const kinds = new Set(plan.items.map((i) => i.kind));
    expect(kinds.has('workout')).toBe(true);
    expect(kinds.has('habit')).toBe(true);
    for (const i of plan.items) expect(i.why.length, i.title).toBeGreaterThan(10);
    expect(
      generateDailyPlan({ ...base, mode: 'busy', wellness: wellness(true) }).items.length,
    ).toBeGreaterThan(0);
  });

  it('nothing else about the plan changes: it matches the same plan with the food items removed', () => {
    for (const mode of PLAN_MODES) {
      const without = generateDailyPlan({ ...base, mode, wellness: wellness(true) });
      const withFood = generateDailyPlan({ ...base, mode, wellness: wellness(false) });
      const strip = (items: typeof withFood.items) =>
        items
          .filter((i) => i.kind !== 'meal')
          .map(({ kind, title, detail, why }) => ({ kind, title, detail, why }));
      expect(strip(without.items), mode).toEqual(strip(withFood.items));
    }
  });

  it('without an eating concern the plan is exactly as it was: food prompts are still there', () => {
    const plain = generateDailyPlan(base);
    const explicitFalse = generateDailyPlan({ ...base, wellness: wellness(false) });
    expect(plain.items.some((i) => i.kind === 'meal')).toBe(true);
    expect(explicitFalse.items.some((i) => i.kind === 'meal')).toBe(true);
    expect(
      generateDailyPlan({ ...base, mode: 'busy', wellness: wellness(false) }).items.some(
        (i) => i.title === 'Log one meal today',
      ),
    ).toBe(true);
  });

  it('is not triggered by other privacy choices: hidden numbers alone keep the plan as it was', () => {
    const w = wellnessPlanContext({
      prefs: parsePrefs({ tracking: 'none' }),
      entries: [],
      day: '2026-06-17',
      weightKg: 70,
    });
    expect(w.eatingConcern).toBe(false);
    expect(generateDailyPlan({ ...base, wellness: w }).items.some((i) => i.kind === 'meal')).toBe(
      true,
    );
  });
});
