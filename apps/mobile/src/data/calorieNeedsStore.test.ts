import { describe, expect, it } from 'vitest';
import {
  READINESS_QUESTIONS,
  calorieNeedsFromRecords,
  energyGuideFromTargets,
  showWeight,
  type GoalIntent,
} from '@dancehall/shared';
import { MockStore, type KeyValue } from './mockStore';

/** The calorie-needs phase against the real mock store: goal changes keep history, activity is not double counted, safety holds on the coach path too. */
const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = () => new Date('2026-06-15T12:00:00Z');
const answers = (v: boolean) =>
  Object.fromEntries(READINESS_QUESTIONS.map((q) => [q, v])) as Record<
    (typeof READINESS_QUESTIONS)[number],
    boolean
  >;

async function setup(opts: { ready?: boolean; goal?: 'gain' | 'lose' | null } = {}) {
  const s = new MockStore(memory(), NOW);
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  await s.savePrivate({
    birthDate: '1990-01-01',
    heightCm: 170,
    sex: 'female',
    activityLevel: 'moderate',
  });
  await s.addWeight({ weightKg: 70, measuredAt: '2026-06-01T08:00:00Z' });
  await s.saveReadiness(answers(false));
  if (opts.goal === 'gain')
    await s.createGoal({
      type: 'gain',
      period: 'monthly',
      startDate: '2026-06-15',
      endDate: '2026-07-15',
      startKg: 70,
      targetKg: 70.9,
    });
  if (opts.goal === 'lose')
    await s.createGoal({
      type: 'lose',
      period: 'monthly',
      startDate: '2026-06-15',
      endDate: '2026-07-15',
      startKg: 70,
      targetKg: 69,
    });
  return s;
}
/** What every screen computes from the stored records. */
async function needsOf(s: MockStore) {
  const [prefs, priv, weights, goals, readiness] = await Promise.all([
    s.getWellnessPrefs!(),
    s.getPrivate(),
    s.listWeights(),
    s.listGoals(),
    s.latestReadiness(),
  ]);
  const latest = [...weights].sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  return calorieNeedsFromRecords({
    prefs,
    readinessOutcome: readiness?.outcome ?? null,
    priv,
    latestWeightKg: latest?.weightKg ?? null,
    goals,
    now: NOW(),
  });
}
const coachGuide = async (s: MockStore) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (await (s as any).coachContext(await (s as any).authed(), true)).guideKcal as number | undefined;

describe('goal changes lose no history', () => {
  it('moving through all five goals and back leaves weights, goals and consent untouched, and each goal gets its own estimate', async () => {
    const s = await setup({ goal: 'gain' });
    const weights = await s.listWeights();
    const goals = await s.listGoals();
    const seen: Partial<Record<GoalIntent, number | null>> = {};
    for (const intent of ['lose', 'maintain', 'gain', 'fitness', 'strength', 'maintain'] as const) {
      await s.setWellnessPrefs!({ goalIntent: intent, goalChosen: true });
      expect((await s.getWellnessPrefs!()).goalIntent).toBe(intent);
      const t = await needsOf(s);
      expect(t.intent).toBe(intent);
      seen[intent] = t.kcal?.guide ?? null;
    }
    expect(await s.listWeights()).toEqual(weights);
    expect(await s.listGoals()).toEqual(goals);
    expect(seen.maintain).toBe((await needsOf(s)).kcal!.maintenance);
    expect(seen.gain!).toBeGreaterThan(seen.maintain!);
    expect(seen.gain!).toBeLessThanOrEqual(Math.floor(seen.maintain! * 1.1));
    expect(seen.lose!).toBeLessThan(seen.maintain!);
    expect(seen.fitness).toBe(seen.maintain);
    expect(seen.strength).toBe(seen.maintain);
  });
  it('choosing Gain Weight stores gain (never fitness) and does not switch weight tracking on', async () => {
    const s = await setup();
    await s.setWellnessPrefs!({ goalIntent: 'gain', goalChosen: true });
    const prefs = await s.getWellnessPrefs!();
    expect(prefs.goalIntent).toBe('gain');
    expect(prefs.weightTracking).toBeNull();
    expect(showWeight(prefs)).toBe(false);
    expect((await needsOf(s)).kcal!.guide).not.toBeNull();
    // Opting in is a separate, explicit choice.
    await s.setWellnessPrefs!({ weightTracking: true });
    expect(showWeight(await s.getWellnessPrefs!())).toBe(true);
  });
  it('an older account (default goal next to a stored Gain Weight goal) gets the Gain Weight estimate without any stored value changing', async () => {
    const s = await setup({ goal: 'gain' });
    const before = await s.getWellnessPrefs!();
    expect(before.goalIntent).toBe('fitness');
    const t = await needsOf(s);
    expect(t.intent).toBe('gain');
    expect(t.kcal!.guide!).toBeGreaterThan(t.kcal!.maintenance);
    expect(await s.getWellnessPrefs!()).toEqual(before);
  });
  it('a recovered account that never recorded a weight is asked for it (once), not guessed', async () => {
    const s = new MockStore(memory(), NOW);
    await s.signInDev();
    await s.setConsent('health_data_processing', true);
    await s.savePrivate({
      birthDate: '1990-01-01',
      heightCm: 170,
      sex: 'female',
      activityLevel: 'moderate',
    });
    await s.setWellnessPrefs!({ goalIntent: 'gain' });
    const t = await needsOf(s);
    expect(t.kcal).toBeNull();
    expect(t.missing).toEqual(['weight']);
  });
});

describe('activity is not double counted', () => {
  it('logging workouts never changes the calorie estimate or the coach guide', async () => {
    const s = await setup();
    await s.setWellnessPrefs!({ goalIntent: 'maintain' });
    const before = await needsOf(s);
    const guide = await coachGuide(s);
    for (let i = 0; i < 3; i++)
      await s.createSession({
        title: 'Dance',
        minutes: 45,
        status: 'completed',
        completedAt: '2026-06-15T10:00:00Z',
        durationS: 2700,
        perceivedExertion: 8,
      });
    expect(await needsOf(s)).toEqual(before);
    expect(await coachGuide(s)).toBe(guide);
    expect(before.reasons.join(' ')).toMatch(/do not add workout calories on top/);
  });
});

describe('every consumer follows the same safety rules', () => {
  it('cautious readiness: no deficit number reaches Food, Today, the planner or the coach', async () => {
    const s = await setup();
    await s.setWellnessPrefs!({ goalIntent: 'lose' });
    expect((await needsOf(s)).kcal).not.toBeNull();
    const cautious = { ...answers(false), chest_pain_during_activity: true };
    await s.saveReadiness(cautious);
    const t = await needsOf(s);
    expect(t.kcal).toBeNull();
    expect(energyGuideFromTargets(t)).toBeNull();
    expect(await coachGuide(s)).toBeUndefined();
  });
  it('hidden numbers, pregnancy and eating concern withhold the number for all five goals, including on the coach path', async () => {
    for (const flag of ['pregnantOrPostpartum', 'eatingConcern'] as const) {
      for (const intent of ['lose', 'maintain', 'gain', 'fitness', 'strength'] as const) {
        const s = await setup();
        await s.setWellnessPrefs!({ goalIntent: intent, [flag]: true });
        expect((await needsOf(s)).kcal, `${flag} ${intent}`).toBeNull();
        expect(await coachGuide(s), `${flag} ${intent}`).toBeUndefined();
      }
    }
  });
  it('the coach guide matches the Goals estimate (rounded for the coach)', async () => {
    const s = await setup();
    for (const intent of ['maintain', 'gain', 'strength'] as const) {
      await s.setWellnessPrefs!({ goalIntent: intent });
      const t = await needsOf(s);
      const g = await coachGuide(s);
      expect(Math.abs(g! - (t.kcal!.guide ?? t.kcal!.maintenance))).toBeLessThanOrEqual(25);
    }
  });
});

describe('existing accounts keep every stored preference', () => {
  // A preferences object exactly as an older app version stored it: no `goalChosen`, an older goal, many choices made.
  const LEGACY = {
    goalIntent: 'lose',
    exerciseMinutesPerWeek: 150,
    activities: ['dance', 'walking'],
    equipment: ['bands'],
    homeItems: [],
    diet: ['vegetarian'],
    tracking: 'detailed',
    waterGoalMl: 2250,
    bedtimeRoutine: 'Stretch and read',
    dailyMovementMinutes: 30,
    monthlyGoalWeeks: 3,
    yearlyGoalWeeks: 40,
    celebrations: 'gentle',
    pregnantOrPostpartum: false,
    eatingConcern: false,
    pathways: ['dance_aerobic'],
    danceStyles: ['dancehall'],
    cuisines: ['caribbean'],
    mobility: [],
    experience: 'some',
    schedule: 'evening',
    secondaryGoals: ['strength'],
    weightTracking: true,
  };
  async function legacyStore() {
    const kv = memory();
    const s = new MockStore(kv, NOW);
    await s.signInDev();
    await s.setConsent('health_data_processing', true);
    const state = JSON.parse((await kv.get('dh.mock.v1'))!);
    state.wellnessPrefs = LEGACY;
    await kv.set('dh.mock.v1', JSON.stringify(state));
    return { kv, s: new MockStore(kv, NOW) };
  }

  it('reading old preferences changes nothing and records no choice that was never made', async () => {
    const { s } = await legacyStore();
    const prefs = await s.getWellnessPrefs!();
    expect(prefs).toMatchObject({ ...LEGACY, goalChosen: false });
  });
  it('saving an unrelated preference keeps every other value, and does not mark a goal as chosen', async () => {
    const { s } = await legacyStore();
    const before = await s.getWellnessPrefs!();
    await s.setWellnessPrefs!({ waterGoalMl: 2500 });
    const after = await s.getWellnessPrefs!();
    expect(after).toEqual({ ...before, waterGoalMl: 2500 });
    expect(after.goalChosen).toBe(false);
  });
  it('picking a goal records the choice and keeps the rest; the stored value survives a restart', async () => {
    const { s, kv } = await legacyStore();
    const before = await s.getWellnessPrefs!();
    await s.setWellnessPrefs!({ goalIntent: 'gain', goalChosen: true });
    const again = await new MockStore(kv, NOW).getWellnessPrefs!();
    expect(again).toEqual({
      ...before,
      goalIntent: 'gain',
      goalChosen: true,
      secondaryGoals: ['strength'],
    });
  });
  it('a goal value this app does not know (from a newer version) falls back to the default, never to gain', async () => {
    const { kv } = await legacyStore();
    const state = JSON.parse((await kv.get('dh.mock.v1'))!);
    state.wellnessPrefs = { ...LEGACY, goalIntent: 'something-newer' };
    await kv.set('dh.mock.v1', JSON.stringify(state));
    expect((await new MockStore(kv, NOW).getWellnessPrefs!()).goalIntent).toBe('fitness');
  });
});

describe('older weights', () => {
  it('the device coach is told when the guide rests on an old weight, and the weight is never replaced', async () => {
    const s = await setup(); // the weight was recorded 14 days before NOW
    await s.setWellnessPrefs!({ goalIntent: 'maintain', goalChosen: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = async () => (s as any).coachContext(await (s as any).authed(), true);
    expect((await ctx()).guideWeightDaysOld).toBeUndefined();
    const later = new MockStore(
      (s as unknown as { kv: KeyValue }).kv,
      () => new Date('2026-09-15T12:00:00Z'),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = await (later as any).coachContext(await (later as any).authed(), true);
    expect(c.guideWeightDaysOld).toBe(106);
    expect(c.guideKcal).toBeDefined();
    expect((await later.listWeights()).map((w) => w.weightKg)).toEqual([70]);
  });
});
