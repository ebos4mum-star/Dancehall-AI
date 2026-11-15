import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GOAL_INTENTS,
  PROVISIONAL_LIMITS,
  SELECTABLE_GOAL_INTENTS,
  calorieNeeds,
  calorieNeedsFromRecords,
  effectiveGoalIntent,
  energyGuideFromTargets,
  nutritionTargets,
  parsePrefs,
  pickActiveWeightGoal,
  resolvePathways,
  showWeight,
  weightTrackingOn,
  type CalorieNeedsInput,
  type GoalIntent,
} from './index';

/** The first calorie-needs phase: one engine, five goals, one set of safety rules, honest about what is provisional. */
const BODY = {
  weightKg: 70,
  heightCm: 170,
  ageYears: 35,
  sex: 'female' as const,
  activity: 'moderate' as const,
  targetKg: null,
};
const prefs = (over: Partial<CalorieNeedsInput['prefs']> = {}): CalorieNeedsInput['prefs'] => ({
  goalIntent: 'fitness',
  tracking: 'light',
  pregnantOrPostpartum: false,
  eatingConcern: false,
  ...over,
});
const needs = (
  intent: GoalIntent,
  over: Partial<CalorieNeedsInput> = {},
  p: Partial<CalorieNeedsInput['prefs']> = {},
) =>
  calorieNeeds({
    prefs: prefs({ goalIntent: intent, ...p }),
    readiness: 'clear',
    body: BODY,
    ...over,
  });

describe('five goals, one engine', () => {
  it('offers exactly the five goals, in order, and Gain Weight is its own stored goal', () => {
    expect([...SELECTABLE_GOAL_INTENTS]).toEqual([
      'lose',
      'maintain',
      'gain',
      'fitness',
      'strength',
    ]);
    expect([...GOAL_INTENTS].sort()).toEqual([...SELECTABLE_GOAL_INTENTS].sort());
    expect(parsePrefs({ goalIntent: 'gain' }).goalIntent).toBe('gain');
    // An older stored value still reads as stored; an unknown one falls back to the default, never to gain.
    expect(parsePrefs({ goalIntent: 'strength' }).goalIntent).toBe('strength');
    expect(parsePrefs({ goalIntent: 'banana' }).goalIntent).toBe('fitness');
  });

  it.each(['lose', 'maintain', 'gain', 'fitness', 'strength'] as const)(
    '%s: an estimated maintenance, an explained estimate and a provisional label',
    (intent) => {
      const t = needs(intent);
      expect(t.mode).toBe('estimate');
      expect(t.intent).toBe(intent);
      expect(t.provisional).toBe(true);
      expect(t.kcal!.maintenance).toBeGreaterThan(t.kcal!.floor);
      expect(t.reasons.join(' ')).toMatch(/Mifflin-St Jeor/);
      expect(t.reasons.join(' ')).toMatch(/estimate, not a target you must hit/);
      expect(t.missing).toEqual([]);
    },
  );

  it('maintain, fitness and strength estimate maintenance with no deficit and no surplus (unchanged behaviour)', () => {
    for (const intent of ['maintain', 'fitness', 'strength'] as const) {
      const k = needs(intent).kcal!;
      expect(k.guide).toBe(k.maintenance);
      expect(k.weeklyChangeKg).toBe(0);
    }
  });

  it('lose keeps its limits: deficit capped at 20% of maintenance, never below resting energy', () => {
    const k = needs('lose', {
      activeGoal: { type: 'lose', targetKg: 60, plannedWeeklyChangeKg: -2 },
    }).kcal!;
    expect(k.guide!).toBeLessThan(k.maintenance);
    expect(k.maintenance - k.guide!).toBeLessThanOrEqual(Math.round(k.maintenance * 0.2) + 1);
    expect(k.guide!).toBeGreaterThanOrEqual(k.floor);
  });
});

describe('Gain Weight: a conservative provisional surplus', () => {
  it('adds a small surplus above maintenance, never more than 10% of it', () => {
    const k = needs('gain').kcal!;
    expect(k.guide!).toBeGreaterThan(k.maintenance);
    expect(k.guide!).toBeLessThanOrEqual(Math.floor(k.maintenance * 1.1));
    expect(k.weeklyChangeKg).toBeGreaterThan(0);
  });
  it('the 10% ceiling holds even for an aggressive stored pace, and says so', () => {
    for (const w of [40, 70, 110]) {
      for (const sex of ['female', 'male', 'unspecified'] as const) {
        const t = calorieNeeds({
          prefs: prefs({ goalIntent: 'gain' }),
          readiness: 'clear',
          body: { ...BODY, weightKg: w, heightCm: 180, sex },
          activeGoal: { type: 'gain', targetKg: w + 6, plannedWeeklyChangeKg: 1.5 },
        });
        if (!t.kcal?.guide) continue; // BMI 25 and over gets no surplus at all (tested below)
        expect(t.kcal.guide).toBeLessThanOrEqual(Math.floor(t.kcal.maintenance * 1.1));
        expect(t.kcal.weeklyChangeKg).toBeLessThanOrEqual(
          w * PROVISIONAL_LIMITS.maxWeeklyGainFraction + 0.01,
        );
      }
    }
    const capped = needs('gain', {
      activeGoal: { type: 'gain', targetKg: 72, plannedWeeklyChangeKg: 1.5 },
    });
    expect(PROVISIONAL_LIMITS.maxSurplusFraction).toBe(0.1);
    expect(capped.reasons.join(' ')).toMatch(
      /surplus is capped at 10% of your estimated maintenance/,
    );
    expect(capped.kcal!.guide!).toBeLessThanOrEqual(Math.floor(capped.kcal!.maintenance * 1.1));
  });
  it('never presents the ceiling as clinically validated', () => {
    const text = needs('gain').reasons.join(' ');
    expect(text).toMatch(/not clinically validated/);
    expect(text).toMatch(/not been reviewed by a dietitian/);
    expect(text).toMatch(/10% of maintenance/);
  });
  it('withholds the surplus (maintenance still shown) for an individualized reason: BMI 25 or over, a target that high, a cautious or unanswered safety check', () => {
    const heavy = needs('gain', { body: { ...BODY, weightKg: 85 } });
    expect(heavy.kcal!.guide).toBeNull();
    expect(heavy.kcal!.maintenance).toBeGreaterThan(0);
    expect(heavy.seeProfessional).toBe(true);
    expect(heavy.reasons.join(' ')).toMatch(/do not suggest adding calories/);

    const highTarget = needs('gain', {
      activeGoal: { type: 'gain', targetKg: 80, plannedWeeklyChangeKg: 0.2 },
    });
    expect(highTarget.kcal!.guide).toBeNull();

    const cautious = needs('gain', { readiness: 'cautious' });
    expect(cautious.kcal!.guide).toBeNull();
    expect(cautious.kcal!.maintenance).toBeGreaterThan(0);
    expect(cautious.seeProfessional).toBe(true);

    const unknown = needs('gain', { readiness: 'unknown' });
    expect(unknown.kcal!.guide).toBeNull();
    expect(unknown.seeProfessional).toBe(false);
    expect(unknown.reasons.join(' ')).toMatch(/Finish the quick safety questions/);
  });
  it('is not forced into weight tracking: selecting it neither turns tracking on nor asks for weight, and an explicit choice is honoured', () => {
    const gain = { goalIntent: 'gain' as const, weightTracking: null };
    expect(weightTrackingOn(gain)).toBe(false);
    // Even with a stored weight goal, choosing Gain Weight does not switch ongoing tracking on by itself.
    expect(weightTrackingOn(gain, true)).toBe(false);
    expect(weightTrackingOn({ ...gain, weightTracking: true })).toBe(true);
    expect(weightTrackingOn({ ...gain, weightTracking: false }, true)).toBe(false);
    const visible = {
      tracking: 'light' as const,
      eatingConcern: false,
      pregnantOrPostpartum: false,
    };
    expect(showWeight({ ...gain, ...visible })).toBe(false);
    // The older behaviour for the other goals is unchanged.
    expect(weightTrackingOn({ goalIntent: 'lose', weightTracking: null })).toBe(true);
    expect(weightTrackingOn({ goalIntent: 'maintain', weightTracking: null })).toBe(true);
    expect(weightTrackingOn({ goalIntent: 'fitness', weightTracking: null }, true)).toBe(true);
    // An estimate needs only one recorded weight, supplied once; no weigh-ins over time.
    expect(needs('gain').kcal!.guide).not.toBeNull();
    const plan = resolvePathways({
      prefs: parsePrefs({ goalIntent: 'gain' }),
      readiness: 'clear',
      body: BODY,
    });
    expect(plan.bias.showWeightPrompts).toBe(false);
    expect(plan.nutrition!.intent).toBe('gain');
  });
  it('Gain Weight is its own goal in the plan, never the fitness plan under another name', () => {
    const gain = resolvePathways({ prefs: parsePrefs({ goalIntent: 'gain' }), readiness: 'clear' });
    const fit = resolvePathways({
      prefs: parsePrefs({ goalIntent: 'fitness' }),
      readiness: 'clear',
    });
    expect(gain.pathways.map((p) => p.id)).not.toEqual(fit.pathways.map((p) => p.id));
    expect(gain.summary.join(' ')).toMatch(/nourishing meals and strength work/);
  });
});

describe('safety restrictions apply to every goal, on every screen', () => {
  const ALL = ['lose', 'maintain', 'gain', 'fitness', 'strength'] as const;
  it.each(ALL)(
    '%s: no calorie or protein numbers for pregnancy, eating concern or tracking off',
    (intent) => {
      for (const p of [
        { pregnantOrPostpartum: true },
        { eatingConcern: true },
        { tracking: 'none' as const },
      ]) {
        const t = needs(intent, {}, p);
        expect(t.kcal).toBeNull();
        expect(t.proteinG).toBeNull();
      }
    },
  );
  it.each(ALL)('%s: adults only', (intent) => {
    const t = needs(intent, { body: { ...BODY, ageYears: 17 } });
    expect(t.kcal).toBeNull();
    expect(t.reasons.join(' ')).toMatch(/aged 18 and over/);
  });
  it('FIX: cautious readiness no longer bypasses the loss safeguard on any screen', () => {
    const t = needs('lose', { readiness: 'cautious' });
    expect(t.kcal).toBeNull();
    expect(t.mode).toBe('professional');
    expect(t.seeProfessional).toBe(true);
    // The Food, Today, planner and coach guide is built from the same result: there is no number to show.
    const fromRecords = calorieNeedsFromRecords({
      prefs: prefs({ goalIntent: 'lose' }),
      readinessOutcome: 'low_impact_and_check_with_professional',
      priv: { birthDate: '1990-01-01', heightCm: 170, sex: 'female', activityLevel: 'moderate' },
      latestWeightKg: 70,
      goals: [],
      now: new Date('2026-06-15T12:00:00Z'),
    });
    expect(energyGuideFromTargets(fromRecords)).toBeNull();
  });
  it('unanswered safety questions withhold a loss estimate without flagging professional support', () => {
    const t = needs('lose', { readiness: 'unknown' });
    expect(t.kcal).toBeNull();
    expect(t.seeProfessional).toBe(false);
  });
  it('a loss estimate that would be unsafe (below a healthy BMI) is withheld, not softened', () => {
    const t = needs('lose', { body: { ...BODY, weightKg: 48, heightCm: 170 } });
    expect(t.kcal).toBeNull();
    expect(t.seeProfessional).toBe(true);
  });
  it('maintain, fitness and strength are not blocked by a cautious readiness answer (they never create a deficit)', () => {
    for (const intent of ['maintain', 'fitness', 'strength'] as const)
      expect(needs(intent, { readiness: 'cautious' }).kcal!.guide).not.toBeNull();
  });
});

describe('missing inputs are explained, never invented', () => {
  it('lists exactly what is needed and produces no number', () => {
    const t = needs('gain', { body: { ...BODY, weightKg: null, heightCm: null } });
    expect(t.kcal).toBeNull();
    expect(t.missing).toEqual(['weight', 'height']);
    expect(t.reasons.join(' ')).toMatch(/we still need your weight, height/);
    expect(t.reasons.join(' ')).toMatch(/never guess/);
    expect(calorieNeeds({ prefs: prefs(), readiness: 'clear' }).missing).toEqual([
      'weight',
      'height',
      'age',
      'sex',
      'activity',
    ]);
  });
});

describe('activity is handled once, in the activity factor', () => {
  it('a more active level raises estimated maintenance, in order', () => {
    const m = (activity: 'low' | 'light' | 'moderate' | 'high') =>
      needs('maintain', { body: { ...BODY, activity } }).kcal!.maintenance;
    expect(m('low')).toBeLessThan(m('light'));
    expect(m('light')).toBeLessThan(m('moderate'));
    expect(m('moderate')).toBeLessThan(m('high'));
  });
  it('says plainly that workout calories are not added on top, and takes no workout input', () => {
    for (const intent of ['lose', 'maintain', 'gain', 'fitness', 'strength'] as const)
      expect(needs(intent).reasons.join(' ')).toMatch(/do not add workout calories on top/);
    // The inputs are body facts and the chosen goal only: there is nowhere to pass exercise.
    const keys = Object.keys(BODY);
    expect(keys.some((k) => /workout|exercise|burn|session/i.test(k))).toBe(false);
  });
});

describe('one calculation everywhere', () => {
  const priv = {
    birthDate: '1990-01-01',
    heightCm: 170,
    sex: 'female' as const,
    activityLevel: 'moderate' as const,
  };
  const now = new Date('2026-06-15T12:00:00Z');
  const rec = (
    goalIntent: GoalIntent,
    goals: Parameters<typeof calorieNeedsFromRecords>[0]['goals'] = [],
  ) =>
    calorieNeedsFromRecords({
      prefs: prefs({ goalIntent }),
      readinessOutcome: 'clear',
      priv,
      latestWeightKg: 70,
      goals,
      now,
    });

  it('Goals, Food, Today, the planner, the coach and the engine read identical numbers', () => {
    for (const intent of GOAL_INTENTS) {
      const a = rec(intent);
      const viaEngine = resolvePathways({
        prefs: parsePrefs({ goalIntent: intent }),
        readiness: 'clear',
        body: {
          weightKg: 70,
          heightCm: 170,
          ageYears: 36,
          sex: 'female',
          activity: 'moderate',
          targetKg: null,
        },
      }).nutrition!;
      expect(viaEngine.kcal).toEqual(a.kcal);
      expect(viaEngine.reasons).toEqual(a.reasons);
      const guide = energyGuideFromTargets(a)!;
      expect(guide.guideKcal).toBe(a.kcal!.guide ?? a.kcal!.maintenance);
      expect(guide.maintenanceKcal).toBe(a.kcal!.maintenance);
    }
  });
  it('there is no second calculator: the raw energy formula is called only by the canonical engine', () => {
    const dir = import.meta.dirname;
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => !['safety.ts', 'nutrition-plan.ts'].includes(f))
      .filter((f) => /dailyCalorieGuidance\(/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
    const app = join(dir, '../../../apps/mobile');
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? e.name === 'node_modules'
            ? []
            : walk(join(d, e.name))
          : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)
            ? [join(d, e.name)]
            : [],
      );
    const appOffenders = [...walk(join(app, 'src')), ...walk(join(app, 'app'))].filter((f) =>
      /dailyCalorieGuidance|estimateBmrKcal|energyGuideFor\b/.test(readFileSync(f, 'utf8')),
    );
    expect(appOffenders).toEqual([]);
  });
  it('nutritionTargets and calorieNeeds agree when no stored goal is involved', () => {
    for (const intent of GOAL_INTENTS) {
      const direct = nutritionTargets({
        intent,
        tracking: 'light',
        ...BODY,
        readinessCautious: false,
      });
      const wrapped = needs(intent, { readiness: 'clear' });
      expect(wrapped.kcal).toEqual(direct.kcal);
    }
  });
});

describe('changing goals keeps accounts working and loses nothing', () => {
  const goal = (type: 'lose' | 'maintain' | 'gain') => ({
    type,
    status: 'active',
    endDate: '2026-12-01',
    targetKg: type === 'lose' ? 65 : type === 'gain' ? 74 : 70,
    plannedWeeklyChangeKg: type === 'lose' ? -0.3 : type === 'gain' ? 0.2 : 0,
  });
  it('older accounts: the default goal follows a stored weight goal, so a stored Gain Weight choice becomes Gain Weight (nothing is rewritten)', () => {
    expect(effectiveGoalIntent('fitness', pickActiveWeightGoal([goal('gain')]))).toBe('gain');
    expect(effectiveGoalIntent('fitness', pickActiveWeightGoal([goal('lose')]))).toBe('lose');
    expect(effectiveGoalIntent('fitness', null)).toBe('fitness');
    // A person who picked Improve Fitness themselves is not overruled by an old stored goal.
    expect(effectiveGoalIntent('fitness', pickActiveWeightGoal([goal('gain')]), true)).toBe(
      'fitness',
    );
    expect(parsePrefs({}).goalChosen).toBe(false);
    expect(parsePrefs({ goalChosen: true }).goalChosen).toBe(true);
    // An explicit choice always wins, and Strength keeps its behaviour next to a stored loss goal.
    for (const chosen of ['lose', 'maintain', 'gain', 'strength'] as const)
      expect(effectiveGoalIntent(chosen, pickActiveWeightGoal([goal('lose')]))).toBe(chosen);
    const strength = calorieNeeds({
      prefs: prefs({ goalIntent: 'strength' }),
      readiness: 'clear',
      body: BODY,
      activeGoal: pickActiveWeightGoal([goal('lose')]),
    });
    expect(strength.kcal!.guide).toBe(strength.kcal!.maintenance);
  });
  it('only the active goal that ends soonest is used; ended goals are ignored', () => {
    const picked = pickActiveWeightGoal([
      { ...goal('lose'), status: 'completed', endDate: '2026-01-01' },
      { ...goal('gain'), endDate: '2026-09-01' },
      { ...goal('maintain'), endDate: '2026-10-01' },
    ]);
    expect(picked?.type).toBe('gain');
    expect(pickActiveWeightGoal([])).toBeNull();
  });
  it('switching between all five goals changes only the estimate, and back again restores it exactly', () => {
    const first = needs('maintain').kcal;
    for (const intent of GOAL_INTENTS) expect(needs(intent).intent).toBe(intent);
    expect(needs('maintain').kcal).toEqual(first);
  });
});
