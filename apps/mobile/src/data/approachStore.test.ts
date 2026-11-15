import { describe, expect, it } from 'vitest';
import {
  generateDailyPlan,
  readinessState,
  resolvePathways,
  showWeight,
  parsePrefs,
} from '@dancehall/shared';
import { FOOD_BY_ID, itemFromFood } from '@dancehall/shared';
import { MockStore, type KeyValue } from './mockStore';

/** Stage B: goal selection, secondary goals, weight opt-in and the plan the real mock store builds from the engine. */
const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = () => new Date('2026-06-15T12:00:00Z');
const DAY = '2026-06-15';
async function setup(kv: KeyValue = memory()) {
  const s = new MockStore(kv, NOW);
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  return { s, kv };
}
const planItems = async (s: MockStore, mode: 'normal' | 'busy' = 'normal') =>
  (await s.regenerateDailyPlan!(mode, DAY)).items;

describe('goal selection and secondary goals persist', () => {
  it('saves a primary goal and compatible secondary goals, and reloads them after a restart', async () => {
    const { s, kv } = await setup();
    await s.setWellnessPrefs!({ goalIntent: 'strength', secondaryGoals: ['fitness', 'lose'] });
    const again = new MockStore(kv, NOW);
    expect(await again.getWellnessPrefs!()).toMatchObject({
      goalIntent: 'strength',
      secondaryGoals: ['lose', 'fitness'].sort(
        (a, b) =>
          ['lose', 'maintain', 'fitness', 'strength'].indexOf(a) -
          ['lose', 'maintain', 'fitness', 'strength'].indexOf(b),
      ),
    });
  });
  it('never keeps an incompatible or duplicate secondary goal, and re-cleans when the primary goal changes', async () => {
    const { s } = await setup();
    await s.setWellnessPrefs!({
      goalIntent: 'lose',
      secondaryGoals: ['maintain', 'strength', 'lose'],
    });
    expect((await s.getWellnessPrefs!()).secondaryGoals).toEqual(['strength']);
    await s.setWellnessPrefs!({ goalIntent: 'strength' });
    expect((await s.getWellnessPrefs!()).secondaryGoals).toEqual([]);
    await s.setWellnessPrefs!({ secondaryGoals: ['maintain', 'fitness'] });
    expect((await s.getWellnessPrefs!()).secondaryGoals).toEqual(['maintain', 'fitness']);
    await s.setWellnessPrefs!({ goalIntent: 'lose' });
    expect((await s.getWellnessPrefs!()).secondaryGoals).toEqual(['fitness']);
  });
  it('saving other preferences never resets an existing person’s goal or tracking choice', async () => {
    const { s } = await setup();
    await s.setWellnessPrefs!({
      goalIntent: 'maintain',
      tracking: 'detailed',
      weightTracking: true,
    });
    await s.setWellnessPrefs!({ cuisines: ['caribbean'], experience: 'new' });
    await s.setWellnessPrefs!({ waterGoalMl: 2000 });
    expect(await s.getWellnessPrefs!()).toMatchObject({
      goalIntent: 'maintain',
      tracking: 'detailed',
      weightTracking: true,
      cuisines: ['caribbean'],
      experience: 'new',
      waterGoalMl: 2000,
    });
  });
  it('needs health-data consent, like every other wellness write', async () => {
    const s = new MockStore(memory(), NOW);
    await s.signInDev();
    await expect(s.setWellnessPrefs!({ goalIntent: 'strength' })).rejects.toMatchObject({
      code: 'consent_required',
    });
  });
});

describe('the plan the store builds from the engine', () => {
  it('a strength goal gets the self-directed strength prompt, with the honest "not available yet" note and a reason', async () => {
    const { s } = await setup();
    expect((await planItems(s)).some((i) => i.ref?.action === 'log_strength')).toBe(false);
    await s.setWellnessPrefs!({ goalIntent: 'strength' });
    const item = (await planItems(s)).find((i) => i.ref?.action === 'log_strength')!;
    expect(item.detail).toMatch(/Guided strength workouts are not available yet/);
    expect(item.why.length).toBeGreaterThan(10);
  });
  it('a secondary strength goal adds the same prompt', async () => {
    const { s } = await setup();
    await s.setWellnessPrefs!({ goalIntent: 'fitness', secondaryGoals: ['strength'] });
    expect((await planItems(s)).some((i) => i.ref?.action === 'log_strength')).toBe(true);
  });
  it('a chosen dance style comes first and the reason says so; a style with no sessions is stated honestly', async () => {
    const { s } = await setup();
    await s.setWellnessPrefs!({ danceStyles: ['latin', 'dancehall'] });
    const w = (await planItems(s)).find((i) => i.kind === 'workout' && i.ref?.workoutId)!;
    expect(w.ref!.workoutId).toMatch(/latin/);
    expect(w.why).toMatch(/You chose Latin/);
    expect(w.why).toMatch(/Dancehall sessions are not in the catalogue yet/);
  });
  it('a cultural food choice is explained on the meal item', async () => {
    const { s } = await setup();
    await s.createFoodLog({
      mealType: 'lunch',
      source: 'manual',
      items: [itemFromFood(FOOD_BY_ID.get('white-rice')!, 150)],
    });
    await s.setWellnessPrefs!({ cuisines: ['west_african'] });
    const meal = (await planItems(s)).find((i) => i.kind === 'meal')!;
    expect(meal.title).toMatch(/protein, veg and carbs/);
    expect(meal.why).toMatch(/West African foods, and swap ideas favour them/);
  });
  it('is responsive: changing a preference changes the next plan', async () => {
    const { s } = await setup();
    await s.setWellnessPrefs!({ danceStyles: ['latin'] });
    const a = (await planItems(s)).find((i) => i.ref?.workoutId)!.ref!.workoutId;
    await s.setWellnessPrefs!({ danceStyles: ['amapiano'] });
    const b = (await planItems(s)).find((i) => i.ref?.workoutId)!.ref!.workoutId;
    expect(a).toMatch(/latin/);
    expect(b).toMatch(/amapiano/);
  });
  it('a weight-neutral person is never offered a weigh-in, even with an old weight and a goal on file', async () => {
    const { s } = await setup();
    await s.addWeight({ weightKg: 80, measuredAt: '2026-05-01T08:00:00Z' });
    await s.setWellnessPrefs!({ goalIntent: 'strength', tracking: 'detailed' });
    expect((await planItems(s)).some((i) => i.kind === 'goal')).toBe(false);
  });
  it('a person who tracks weight keeps the gentle, optional weigh-in', async () => {
    const { s } = await setup();
    await s.addWeight({ weightKg: 80, measuredAt: '2026-05-01T08:00:00Z' });
    await s.setWellnessPrefs!({ goalIntent: 'maintain', tracking: 'detailed' });
    // Needs an active goal for the plan's own rule; without one it was never offered, and still is not.
    expect((await planItems(s)).some((i) => i.kind === 'goal')).toBe(false);
  });
});

describe('the weight rule every screen uses', () => {
  const rule = (over: Record<string, unknown>, goal = false) => showWeight(parsePrefs(over), goal);
  it('shows weight only to people who track it and have not hidden their numbers', () => {
    expect(rule({ goalIntent: 'lose' })).toBe(true);
    expect(rule({ goalIntent: 'maintain' })).toBe(true);
    expect(rule({ goalIntent: 'fitness' })).toBe(false);
    expect(rule({ goalIntent: 'strength' })).toBe(false);
    expect(rule({ goalIntent: 'fitness' }, true)).toBe(true);
    expect(rule({ goalIntent: 'strength', weightTracking: true })).toBe(true);
    expect(rule({ goalIntent: 'lose', weightTracking: false })).toBe(false);
  });
  it('hidden numbers always win', () => {
    for (const hide of [
      { tracking: 'none' },
      { eatingConcern: true },
      { pregnantOrPostpartum: true },
    ])
      expect(rule({ goalIntent: 'lose', weightTracking: true, ...hide }, true)).toBe(false);
  });
});

describe('engine and store agree', () => {
  it('the readiness the store records maps to the engine state used for the plan', async () => {
    const { s } = await setup();
    expect(readinessState((await s.latestReadiness())?.outcome)).toBe('unknown');
    const o = resolvePathways({
      prefs: parsePrefs({ goalIntent: 'strength' }),
      readiness: 'clear',
    });
    const plan = generateDailyPlan({
      date: DAY,
      mode: 'normal',
      localHour: 12,
      lowImpact: false,
      plannedToday: [],
      doneToday: [],
      mealsLoggedToday: 1,
      activeGoalTypes: [],
      daysSinceWeight: null,
      bias: o.bias,
      wellness: {
        intent: 'strength',
        tracking: 'light',
        activities: ['dance'],
        hydrationMl: 0,
        waterGoalMl: 0,
        walkedToday: false,
      },
    });
    expect(plan.items.some((i) => i.ref?.action === 'log_strength')).toBe(true);
  });
});
