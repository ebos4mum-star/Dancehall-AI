import { describe, expect, it } from 'vitest';
import { generateDailyPlan, type DailyPlanInput } from './daily-plan';
import { nutritionTargets, waterGuideMl, type TargetInput } from './nutrition-plan';
import {
  DEFAULT_PREFS,
  activeDaysAll,
  entryProblem,
  hydrationOn,
  measurementChange,
  movementTotals,
  numbersHidden,
  parsePrefs,
  sleepSummary,
  type WellnessEntry,
} from './wellness';

const adult: TargetInput = {
  intent: 'lose',
  tracking: 'light',
  weightKg: 80,
  heightCm: 170,
  ageYears: 35,
  sex: 'female',
  activity: 'light',
};

describe('nutrition targets: the three goals', () => {
  it('lose: a capped, explained estimate that never goes below resting energy', () => {
    const t = nutritionTargets(adult);
    expect(t.mode).toBe('estimate');
    expect(t.kcal!.guide!).toBeLessThan(t.kcal!.maintenance);
    expect(t.kcal!.guide!).toBeGreaterThanOrEqual(t.kcal!.floor);
    expect(t.kcal!.maintenance - t.kcal!.guide!).toBeLessThanOrEqual(
      Math.round(t.kcal!.maintenance * 0.2) + 1,
    );
    expect(t.reasons.join(' ')).toMatch(/Mifflin-St Jeor/);
    expect(t.provisional).toBe(true);
  });
  it('maintain and fitness: no deficit, guide equals estimated maintenance', () => {
    for (const intent of ['maintain', 'fitness'] as const) {
      const t = nutritionTargets({ ...adult, intent });
      expect(t.kcal!.guide).toBe(t.kcal!.maintenance);
      expect(t.kcal!.weeklyChangeKg).toBe(0);
    }
  });
  it('protein is a range from 0.8 to 1.2 g per kg', () => {
    expect(nutritionTargets(adult).proteinG).toEqual({ low: 64, high: 96 });
  });
});

describe('nutrition safety boundaries', () => {
  it('withholds all numbers when information is missing', () => {
    for (const k of ['weightKg', 'heightCm', 'ageYears', 'sex', 'activity'] as const) {
      const t = nutritionTargets({ ...adult, [k]: null });
      expect(t.kcal).toBeNull();
      expect(t.proteinG).toBeNull();
      expect(t.mode).toBe('general');
    }
  });
  it('gives no calorie or weight-loss numbers during pregnancy or after birth', () => {
    const t = nutritionTargets({ ...adult, pregnantOrPostpartum: true });
    expect(t.kcal).toBeNull();
    expect(t.mode).toBe('professional');
    expect(t.seeProfessional).toBe(true);
  });
  it('gives no numbers when the person shares an eating concern', () => {
    const t = nutritionTargets({ ...adult, eatingConcern: true });
    expect(t.kcal).toBeNull();
    expect(t.reasons.join(' ')).toMatch(/dietitian/);
  });
  it('respects a choice to track nothing', () => {
    const t = nutritionTargets({ ...adult, tracking: 'none' });
    expect(t.kcal).toBeNull();
    expect(t.proteinG).toBeNull();
    expect(t.mode).toBe('general');
  });
  it('withholds loss numbers when readiness screening was cautious', () => {
    const t = nutritionTargets({ ...adult, readinessCautious: true });
    expect(t.kcal).toBeNull();
    expect(t.seeProfessional).toBe(true);
    // maintain is still offered
    expect(
      nutritionTargets({ ...adult, intent: 'maintain', readinessCautious: true }).kcal,
    ).not.toBeNull();
  });
  it('blocks loss when already underweight, and rejects under-18s', () => {
    expect(nutritionTargets({ ...adult, weightKg: 48 }).kcal).toBeNull();
    expect(nutritionTargets({ ...adult, ageYears: 16 }).kcal).toBeNull();
  });
  it('a too-low target weight is adjusted or blocked, never turned into an extreme deficit', () => {
    const t = nutritionTargets({ ...adult, targetKg: 40 });
    expect(t.kcal).toBeNull();
    const ok = nutritionTargets({ ...adult, targetKg: 70 });
    expect(ok.kcal!.guide).toBeGreaterThanOrEqual(ok.kcal!.floor);
  });
  it('water guide is general, bounded and defaults sensibly', () => {
    expect(waterGuideMl(null)).toBe(2000);
    expect(waterGuideMl(40)).toBe(1500);
    expect(waterGuideMl(150)).toBe(3000);
  });
});

describe('preferences', () => {
  it('parses tolerantly and never throws', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('x')).toEqual(DEFAULT_PREFS);
    const p = parsePrefs({
      goalIntent: 'lose',
      activities: ['walking', 'bogus'],
      diet: ['vegan', 'nope'],
      waterGoalMl: 99999,
      tracking: 'weird',
      exerciseMinutesPerWeek: 150,
    });
    expect(p.goalIntent).toBe('lose');
    expect(p.activities).toEqual(['walking']);
    expect(p.diet).toEqual(['vegan']);
    expect(p.waterGoalMl).toBeNull();
    expect(p.tracking).toBe(DEFAULT_PREFS.tracking);
    expect(p.exerciseMinutesPerWeek).toBe(150);
  });
  it('weight loss is never the default', () => {
    expect(DEFAULT_PREFS.goalIntent).toBe('fitness');
    expect(DEFAULT_PREFS.pregnantOrPostpartum).toBe(false);
  });
});

const e = (over: Partial<WellnessEntry>): WellnessEntry => ({
  id: Math.random().toString(),
  kind: 'hydration',
  day: '2026-11-14',
  amount: 250,
  amount2: null,
  label: null,
  createdAt: '2026-11-14T10:00:00Z',
  ...over,
});

describe('entry validation', () => {
  const today = '2026-11-14';
  const ok = (x: Parameters<typeof entryProblem>[0]) => entryProblem(x, today);
  it('accepts valid entries of every kind', () => {
    expect(ok({ kind: 'hydration', day: today, amount: 250 })).toBeNull();
    expect(ok({ kind: 'sleep', day: today, amount: 7.5, label: 'rested' })).toBeNull();
    expect(ok({ kind: 'sleep', day: today, amount: 7 })).toBeNull();
    expect(ok({ kind: 'walk', day: today, amount: 20, amount2: 1.8 })).toBeNull();
    expect(ok({ kind: 'strength', day: today, amount: 25, label: 'bodyweight' })).toBeNull();
    expect(ok({ kind: 'measurement', day: today, amount: 82, label: 'waist' })).toBeNull();
    expect(ok({ kind: 'hunger', day: today, amount: 0, label: 'comfortable' })).toBeNull();
    expect(ok({ kind: 'recovery', day: today, amount: 0, label: 'ok' })).toBeNull();
  });
  it('rejects out-of-range, future, mislabeled and malformed entries', () => {
    expect(ok({ kind: 'hydration', day: today, amount: 0 })).not.toBeNull();
    expect(ok({ kind: 'hydration', day: today, amount: 9000 })).not.toBeNull();
    expect(ok({ kind: 'sleep', day: today, amount: 30 })).not.toBeNull();
    expect(ok({ kind: 'walk', day: today, amount: 20, amount2: 500 })).not.toBeNull();
    expect(ok({ kind: 'hydration', day: today, amount: 250, amount2: 1 })).not.toBeNull();
    expect(ok({ kind: 'hydration', day: '2026-12-31', amount: 250 })).not.toBeNull();
    expect(ok({ kind: 'measurement', day: today, amount: 80 })).not.toBeNull();
    expect(ok({ kind: 'hunger', day: today, amount: 0, label: 'starving' })).not.toBeNull();
    expect(ok({ kind: 'walk', day: 'tomorrow', amount: 5 })).not.toBeNull();
  });
});

describe('summaries', () => {
  it('hydration totals the day and caps the fraction', () => {
    const list = [e({ amount: 500 }), e({ amount: 750 }), e({ day: '2026-11-13', amount: 2000 })];
    const h = hydrationOn(list, '2026-11-14', 2000);
    expect(h.ml).toBe(1250);
    expect(h.fraction).toBeCloseTo(0.625);
    expect(h.glasses).toBe(5);
    expect(hydrationOn([e({ amount: 4000 })], '2026-11-14', 2000).fraction).toBe(1);
  });
  it('sleep needs three nights for an average and never scores', () => {
    const night = (day: string, h: number) => e({ kind: 'sleep', day, amount: h });
    expect(
      sleepSummary([night('2026-11-14', 7), night('2026-11-13', 6)], '2026-11-14').averageHours,
    ).toBeNull();
    const s = sleepSummary(
      [
        night('2026-11-14', 7),
        night('2026-11-13', 6),
        night('2026-11-12', 8),
        night('2026-11-01', 2),
      ],
      '2026-11-14',
    );
    expect(s.nights).toBe(3);
    expect(s.averageHours).toBe(7);
    expect(s.lastNight?.hours).toBe(7);
  });
  it('movement totals count distance only where entered', () => {
    const list = [
      e({ kind: 'walk', amount: 30, amount2: 2.5 }),
      e({ kind: 'walk', amount: 15 }),
      e({ kind: 'strength', amount: 20, label: 'bodyweight' }),
      e({ kind: 'walk', day: '2026-10-01', amount: 99 }),
    ];
    const m = movementTotals(list, '2026-11-10', '2026-11-16');
    expect(m).toEqual({
      walkMinutes: 45,
      walkKm: 2.5,
      strengthMinutes: 20,
      walks: 2,
      strengthSessions: 1,
    });
  });
  it('the shared activity model counts a day once however many things happened on it', () => {
    const sessions = [{ status: 'completed', completedAt: '2026-11-14T10:00:00Z' }];
    const list = [
      e({ kind: 'walk', amount: 10 }),
      e({ kind: 'strength', day: '2026-11-13', amount: 10, label: 'bands' }),
    ];
    expect(activeDaysAll(sessions, list, '2026-11-10', '2026-11-16', 'UTC')).toEqual([
      '2026-11-13',
      '2026-11-14',
    ]);
    expect(
      activeDaysAll(
        [{ status: 'planned', completedAt: null }],
        [],
        '2026-11-10',
        '2026-11-16',
        'UTC',
      ),
    ).toEqual([]);
  });
  it('measurement change needs two entries and is neutral', () => {
    const m = (day: string, cm: number) =>
      e({ kind: 'measurement', label: 'waist', day, amount: cm });
    expect(measurementChange([m('2026-10-01', 85)], 'waist')).toEqual({
      latestCm: 85,
      changeCm: null,
      count: 1,
    });
    expect(measurementChange([m('2026-10-01', 85), m('2026-11-01', 83.5)], 'waist')).toEqual({
      latestCm: 83.5,
      changeCm: -1.5,
      count: 2,
    });
    expect(measurementChange([], 'hips')).toBeNull();
  });
});

describe('daily plan with wellness context', () => {
  const base: DailyPlanInput = {
    date: '2026-11-14',
    mode: 'normal',
    localHour: 14,
    lowImpact: false,
    plannedToday: [],
    doneToday: [],
    mealsLoggedToday: 1,
    activeGoalTypes: ['lose'],
    daysSinceWeight: 10,
  };
  const wellness = {
    intent: 'lose' as const,
    tracking: 'light' as const,
    activities: ['dance', 'walking'] as const,
    hydrationMl: 500,
    waterGoalMl: 2000,
    walkedToday: false,
  };
  it('is unchanged without wellness context', () => {
    const a = generateDailyPlan(base);
    expect(a.items.some((x) => x.ref?.action)).toBe(false);
  });
  it('adds water and a walk, with reasons and logging shortcuts', () => {
    const p = generateDailyPlan({ ...base, wellness });
    const water = p.items.find((x) => x.ref?.action === 'log_water');
    const walk = p.items.find((x) => x.ref?.action === 'log_walk');
    expect(water?.why).toBeTruthy();
    expect(walk?.detail).toMatch(/no step counting/i);
    p.items.forEach((x) => expect(x.why.length).toBeGreaterThan(0));
  });
  it('skips water once the goal is met, and walks once walked or when walking is not preferred', () => {
    const met = generateDailyPlan({
      ...base,
      wellness: { ...wellness, hydrationMl: 2000, walkedToday: true },
    });
    expect(
      met.items.some((x) => x.ref?.action === 'log_water' || x.ref?.action === 'log_walk'),
    ).toBe(false);
    const noWalk = generateDailyPlan({ ...base, wellness: { ...wellness, activities: ['dance'] } });
    expect(noWalk.items.some((x) => x.ref?.action === 'log_walk')).toBe(false);
  });
  it('uses recorded movement: done items from logs, strength offered only when preferred and not sore', () => {
    const w = { ...wellness, activities: ['dance', 'walking', 'strength'] as const };
    const offered = generateDailyPlan({ ...base, wellness: { ...w, strengthSessionsWeek: 0 } });
    expect(offered.items.find((x) => x.ref?.action === 'log_strength')?.detail).toMatch(
      /not available yet/i,
    );
    const logged = generateDailyPlan({
      ...base,
      wellness: { ...w, strengthToday: true, walkedToday: true, walkMinutesToday: 20 },
    });
    expect(logged.items.some((x) => x.ref?.action === 'log_strength')).toBe(false);
    expect(logged.items.filter((x) => x.done).map((x) => x.title)).toEqual(
      expect.arrayContaining(['You walked today: 20 min', 'You did strength work today']),
    );
    const sore = generateDailyPlan({ ...base, wellness: { ...w, recovery: 'sore' } });
    expect(sore.items.some((x) => x.ref?.action === 'log_strength')).toBe(false);
    expect(sore.items.some((x) => x.title === 'Go easy on your body today')).toBe(true);
    const none = generateDailyPlan({ ...base, wellness: { ...w, activities: ['dance'] } });
    expect(none.items.some((x) => x.ref?.action === 'log_strength')).toBe(false);
  });
  it('offers no hunger prompt to people with an eating concern or tracking off', () => {
    const has = (c: object) =>
      generateDailyPlan({ ...base, wellness: { ...wellness, ...c } }).items.some(
        (x) => x.ref?.action === 'log_hunger',
      );
    expect(has({})).toBe(true);
    expect(has({ eatingConcern: true })).toBe(false);
    expect(has({ tracking: 'none' })).toBe(false);
    expect(has({ hungerCheckinsToday: 1 })).toBe(false);
  });
  it('offers no weigh-in to people who chose fitness or no numbers', () => {
    expect(generateDailyPlan({ ...base, wellness }).items.some((x) => x.kind === 'goal')).toBe(
      true,
    );
    expect(
      generateDailyPlan({ ...base, wellness: { ...wellness, intent: 'fitness' } }).items.some(
        (x) => x.kind === 'goal',
      ),
    ).toBe(false);
    expect(
      generateDailyPlan({ ...base, wellness: { ...wellness, tracking: 'none' } }).items.some(
        (x) => x.kind === 'goal',
      ),
    ).toBe(false);
  });
  it('responds gently to a short night without alarm or advice about health', () => {
    const p = generateDailyPlan({ ...base, wellness: { ...wellness, sleepHours: 4.5 } });
    const g = p.items.find((x) => x.title === 'Go gently today');
    expect(g?.why).toMatch(/not advice about your health/);
  });
});

describe('numbersHidden', () => {
  it('is true for an eating concern, pregnancy or postpartum, or tracking off, and false otherwise', () => {
    expect(numbersHidden(parsePrefs({}))).toBe(false);
    expect(numbersHidden(parsePrefs({ tracking: 'light' }))).toBe(false);
    expect(numbersHidden(parsePrefs({ eatingConcern: true }))).toBe(true);
    expect(numbersHidden(parsePrefs({ pregnantOrPostpartum: true }))).toBe(true);
    expect(numbersHidden(parsePrefs({ tracking: 'none' }))).toBe(true);
  });
});

describe('celebration preferences', () => {
  it('default to full celebrations with no goals configured, and accept only valid values', () => {
    const d = parsePrefs({});
    expect(d.celebrations).toBe('full');
    expect([d.dailyMovementMinutes, d.monthlyGoalWeeks, d.yearlyGoalWeeks]).toEqual([
      null,
      null,
      null,
    ]);
    expect(parsePrefs({ celebrations: 'off' }).celebrations).toBe('off');
    expect(parsePrefs({ celebrations: 'gentle' }).celebrations).toBe('gentle');
    expect(parsePrefs({ celebrations: 'deafening' }).celebrations).toBe('full');
    const p = parsePrefs({ dailyMovementMinutes: 20, monthlyGoalWeeks: 3, yearlyGoalWeeks: 30 });
    expect([p.dailyMovementMinutes, p.monthlyGoalWeeks, p.yearlyGoalWeeks]).toEqual([20, 3, 30]);
    const bad = parsePrefs({
      dailyMovementMinutes: 0,
      monthlyGoalWeeks: 9,
      yearlyGoalWeeks: 99,
      celebrations: 3,
    });
    expect([bad.dailyMovementMinutes, bad.monthlyGoalWeeks, bad.yearlyGoalWeeks]).toEqual([
      null,
      null,
      null,
    ]);
    expect(bad.celebrations).toBe('full');
  });
});
