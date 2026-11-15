import { describe, expect, it } from 'vitest';
import { generateDailyPlan, type DailyPlanInput } from './daily-plan';
import { readinessState } from './calorie-needs';
import { resolvePathways, type EngineInput, type EngineOutput } from './pathways';
import {
  GOAL_COMPATIBILITY,
  GOAL_INTENTS,
  compatibleSecondaryGoals,
  numbersHidden,
  parsePrefs,
  sanitizeSecondaryGoals,
  showWeight,
  weightTrackingOn,
  type GoalIntent,
} from './wellness';

const run = (over: Record<string, unknown> = {}, extra: Partial<EngineInput> = {}): EngineOutput =>
  resolvePathways({ prefs: parsePrefs(over), readiness: 'clear', ...extra });

describe('primary and secondary goals', () => {
  it('offers lose and maintain only together with goals that do not pull against them', () => {
    expect(compatibleSecondaryGoals('lose')).toEqual(['fitness', 'strength']);
    expect(compatibleSecondaryGoals('maintain')).toEqual(['fitness', 'strength']);
    expect(compatibleSecondaryGoals('gain')).toEqual(['fitness', 'strength']);
    expect(compatibleSecondaryGoals('fitness')).toEqual(['lose', 'maintain', 'strength', 'gain']);
    expect(compatibleSecondaryGoals('strength')).toEqual(['lose', 'maintain', 'fitness', 'gain']);
  });
  it('compatibility is symmetric and never pairs lose, maintain or gain with each other', () => {
    for (const a of GOAL_INTENTS)
      for (const b of GOAL_INTENTS) {
        if (a === b) continue;
        expect(GOAL_COMPATIBILITY[a].includes(b)).toBe(GOAL_COMPATIBILITY[b].includes(a));
      }
    expect(GOAL_COMPATIBILITY.lose).not.toContain('maintain');
    expect(GOAL_COMPATIBILITY.lose).not.toContain('gain');
    expect(GOAL_COMPATIBILITY.maintain).not.toContain('gain');
  });
  it('stored secondary goals are cleaned: no repeats, no primary, no incompatible, no lose with maintain, fixed order', () => {
    const clean = (primary: GoalIntent, raw: GoalIntent[]) => sanitizeSecondaryGoals(primary, raw);
    expect(clean('lose', ['strength', 'fitness', 'strength', 'lose', 'maintain'])).toEqual([
      'fitness',
      'strength',
    ]);
    expect(clean('fitness', ['maintain', 'lose', 'strength'])).toEqual(['lose', 'strength']);
    expect(clean('strength', ['strength'])).toEqual([]);
    expect(
      parsePrefs({ goalIntent: 'lose', secondaryGoals: ['maintain', 'fitness', 'bogus', 5] })
        .secondaryGoals,
    ).toEqual(['fitness']);
  });
  it('changing the primary goal re-cleans the secondary goals instead of keeping an invalid pair', () => {
    const p = parsePrefs({ goalIntent: 'lose', secondaryGoals: ['strength', 'fitness'] });
    expect(p.secondaryGoals).toEqual(['fitness', 'strength']);
    const next = parsePrefs({ ...p, goalIntent: 'strength' });
    expect(next.secondaryGoals).toEqual(['fitness']);
  });
  it('a secondary goal adds its pathways as supporting, and names the goal that brought each one', () => {
    const o = run({ goalIntent: 'fitness', secondaryGoals: ['strength'] });
    const ids = o.pathways.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'dance_aerobic',
        'everyday_movement',
        'healthy_habits',
        'strength_training',
        'balanced_nutrition',
      ]),
    );
    const strength = o.pathways.find((p) => p.id === 'strength_training')!;
    expect(strength.role).toBe('supporting');
    expect(strength.reasons[0]).toBe('You chose this as a second goal: to build strength.');
    expect(o.pathways[0]!.id).toBe('dance_aerobic'); // the primary goal still leads
    expect(o.bias.includeStrengthPrompt).toBe(true);
    expect(o.summary.join(' ')).toMatch(/also working on: build strength/);
  });
  it('without secondary goals the Stage A output is unchanged', () => {
    const a = run({ goalIntent: 'lose' });
    const b = run({ goalIntent: 'lose', secondaryGoals: [] });
    expect(a).toEqual(b);
    expect(a.pathways.map((p) => p.id)).toEqual([
      'dance_aerobic',
      'balanced_nutrition',
      'healthy_habits',
      'everyday_movement',
    ]);
  });
  it('secondary goals never change the safety rules: weight-loss targets still follow the primary goal only', () => {
    const body = {
      weightKg: 80,
      heightCm: 170,
      ageYears: 35,
      sex: 'female' as const,
      activity: 'light' as const,
      targetKg: null,
    };
    const o = run({ goalIntent: 'strength', secondaryGoals: ['lose'] }, { body });
    expect(o.focus).toBe('weight_neutral');
    expect(o.nutrition?.kcal?.weeklyChangeKg).toBe(0); // no deficit from a secondary goal
    expect(o.summary.join(' ')).toMatch(/Weight-loss targets follow your main goal only/);
    // And a primary lose goal with a secondary strength goal keeps every existing limit.
    const lose = run({ goalIntent: 'lose', secondaryGoals: ['strength'] }, { body });
    expect(lose.focus).toBe('weight_loss');
    const k = lose.nutrition!.kcal!;
    expect(k.maintenance - k.guide!).toBeLessThanOrEqual(Math.round(k.maintenance * 0.2) + 1);
    expect(k.guide!).toBeGreaterThanOrEqual(k.floor);
    const withheld = resolvePathways({
      prefs: parsePrefs({ goalIntent: 'lose', secondaryGoals: ['strength'], eatingConcern: true }),
      readiness: 'clear',
      body,
    });
    expect(withheld.focus).toBe('weight_neutral');
    expect(withheld.exclusions).toHaveLength(1);
  });
  it('an explicit pathway choice overrides secondary goals', () => {
    const o = run({
      goalIntent: 'fitness',
      secondaryGoals: ['strength'],
      pathways: ['mindful_eating'],
    });
    expect(o.pathways.map((p) => p.id)).toEqual(['mindful_eating']);
  });
  it('the output stays deterministic with secondary goals', () => {
    const input: EngineInput = {
      prefs: parsePrefs({ goalIntent: 'maintain', secondaryGoals: ['strength', 'fitness'] }),
      readiness: 'clear',
    };
    expect(resolvePathways(input)).toEqual(resolvePathways(input));
  });
});

describe('weight tracking is opt-in', () => {
  it('existing people keep what they had: lose and maintain track weight, fitness and strength do not', () => {
    expect(weightTrackingOn(parsePrefs({ goalIntent: 'lose' }))).toBe(true);
    expect(weightTrackingOn(parsePrefs({ goalIntent: 'maintain' }))).toBe(true);
    expect(weightTrackingOn(parsePrefs({ goalIntent: 'fitness' }))).toBe(false);
    expect(weightTrackingOn(parsePrefs({ goalIntent: 'strength' }))).toBe(false);
    expect(weightTrackingOn(parsePrefs({}))).toBe(false);
  });
  it('an active weight goal keeps tracking on for someone who never chose either way', () => {
    expect(weightTrackingOn(parsePrefs({ goalIntent: 'fitness' }), true)).toBe(true);
  });
  it('an explicit choice always wins, in both directions', () => {
    expect(weightTrackingOn(parsePrefs({ goalIntent: 'fitness', weightTracking: true }))).toBe(
      true,
    );
    expect(weightTrackingOn(parsePrefs({ goalIntent: 'lose', weightTracking: false }))).toBe(false);
    expect(weightTrackingOn(parsePrefs({ goalIntent: 'lose', weightTracking: false }), true)).toBe(
      false,
    );
  });
  it('showWeight needs both the opt-in and numbers not hidden', () => {
    expect(showWeight(parsePrefs({ goalIntent: 'lose' }))).toBe(true);
    expect(showWeight(parsePrefs({ goalIntent: 'fitness' }))).toBe(false);
    expect(showWeight(parsePrefs({ goalIntent: 'fitness', weightTracking: true }))).toBe(true);
    for (const hide of [
      { tracking: 'none' },
      { eatingConcern: true },
      { pregnantOrPostpartum: true },
    ]) {
      const p = parsePrefs({ goalIntent: 'lose', weightTracking: true, ...hide });
      expect(numbersHidden(p)).toBe(true);
      expect(showWeight(p, true)).toBe(false);
    }
  });
  it('a weight-neutral person gets a complete non-scale experience and no weight prompts', () => {
    const o = run({ goalIntent: 'strength', secondaryGoals: ['fitness'] });
    expect(o.bias.showWeightPrompts).toBe(false);
    expect(o.lens.show).toEqual(
      expect.arrayContaining(['consistency', 'non_scale_wins', 'strength', 'dance_stamina']),
    );
    expect(o.lens.hidden.map((h) => h.id)).toContain('weight_trend');
    expect(JSON.stringify(o)).not.toMatch(/weigh in|log your weight/i);
  });
  it('opting in turns on the lens and the gentle optional weigh-in, but never when targets are withheld or numbers hidden', () => {
    const on = run({ goalIntent: 'fitness', weightTracking: true });
    expect(on.bias.showWeightPrompts).toBe(true);
    expect(on.lens.show).toContain('weight_trend');
    const off = run({ goalIntent: 'lose', weightTracking: false });
    expect(off.bias.showWeightPrompts).toBe(false);
    expect(off.lens.hidden.map((h) => h.id)).toContain('weight_trend');
    const withheld = resolvePathways({
      prefs: parsePrefs({ goalIntent: 'lose', weightTracking: true }),
      readiness: 'cautious',
    });
    expect(withheld.bias.showWeightPrompts).toBe(false);
    const hidden = run({ goalIntent: 'lose', weightTracking: true, eatingConcern: true });
    expect(hidden.bias.showWeightPrompts).toBe(false);
    expect(hidden.lens.show).not.toContain('weight_trend');
  });
  it('a weight goal alone (nothing chosen) keeps the lens for a fitness person', () => {
    expect(run({ goalIntent: 'fitness' }, { hasActiveWeightGoal: true }).lens.show).toContain(
      'weight_trend',
    );
    expect(run({ goalIntent: 'fitness' }).lens.show).not.toContain('weight_trend');
  });
  it('the daily plan offers no weigh-in to a weight-neutral person, and only a gentle optional one to someone who opted in', () => {
    const base: DailyPlanInput = {
      date: '2026-06-15',
      mode: 'normal',
      localHour: 12,
      lowImpact: false,
      plannedToday: [],
      doneToday: [],
      mealsLoggedToday: 1,
      activeGoalTypes: ['maintain'],
      daysSinceWeight: 30,
      wellness: {
        intent: 'fitness',
        tracking: 'light',
        activities: ['dance'],
        hydrationMl: 0,
        waterGoalMl: 0,
        walkedToday: false,
      },
    };
    const weighs = (over: Record<string, unknown>) =>
      generateDailyPlan({ ...base, bias: run(over).bias }).items.some((i) => i.kind === 'goal');
    expect(weighs({ goalIntent: 'fitness' })).toBe(false);
    expect(weighs({ goalIntent: 'strength' })).toBe(false);
    expect(weighs({ goalIntent: 'fitness', weightTracking: true })).toBe(false); // the plan's own rule for fitness still applies
  });
});

describe('readiness mapper', () => {
  it('maps stored outcomes and treats no screening as unknown', () => {
    expect(readinessState('clear')).toBe('clear');
    expect(readinessState('low_impact_and_check_with_professional')).toBe('cautious');
    expect(readinessState(null)).toBe('unknown');
    expect(readinessState(undefined)).toBe('unknown');
  });
});

describe('backward compatibility of the new fields', () => {
  it('old documents parse with the old values untouched and empty new fields', () => {
    for (const old of [
      { goalIntent: 'lose', tracking: 'detailed' },
      { goalIntent: 'maintain' },
      { goalIntent: 'fitness', eatingConcern: true },
      {},
    ]) {
      const p = parsePrefs(old);
      expect(p.secondaryGoals).toEqual([]);
      expect(p.weightTracking).toBeNull();
      expect(p.goalIntent).toBe((old as { goalIntent?: string }).goalIntent ?? 'fitness');
    }
  });
  it('survives the stores’ read-merge-write cycle, and an unrelated save never resets goals', () => {
    let stored: unknown = { goalIntent: 'lose', tracking: 'detailed' };
    const save = (patch: Record<string, unknown>) =>
      (stored = parsePrefs({ ...parsePrefs(stored), ...patch }));
    save({ secondaryGoals: ['strength'], weightTracking: false });
    save({ waterGoalMl: 2000 });
    expect(parsePrefs(stored)).toMatchObject({
      goalIntent: 'lose',
      secondaryGoals: ['strength'],
      weightTracking: false,
      tracking: 'detailed',
      waterGoalMl: 2000,
    });
  });
  it('the worst-case stored document stays well under the 2 KB cap', () => {
    const worst = parsePrefs({
      goalIntent: 'fitness',
      secondaryGoals: ['lose', 'strength'],
      weightTracking: true,
      exerciseMinutesPerWeek: 300,
      activities: ['dance', 'walking', 'strength'],
      equipment: ['none', 'dumbbells', 'bands'],
      diet: ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free', 'dairy_free'],
      tracking: 'detailed',
      waterGoalMl: 2500,
      bedtimeRoutine: 'x'.repeat(80),
      dailyMovementMinutes: 45,
      monthlyGoalWeeks: 4,
      yearlyGoalWeeks: 40,
      celebrations: 'gentle',
      pathways: [
        'dance_aerobic',
        'balanced_nutrition',
        'strength_training',
        'everyday_movement',
        'cultural_eating',
        'mindful_eating',
        'healthy_habits',
        'weight_maintenance',
      ],
      danceStyles: [
        'dancehall',
        'reggae',
        'afrobeats',
        'amapiano',
        'hip_hop',
        'latin',
        'bollywood',
        'soca',
      ],
      cuisines: [
        'west_african',
        'caribbean',
        'mediterranean',
        'south_asian',
        'asian',
        'latin_american',
      ],
      mobility: ['low_impact', 'seated', 'balance_support'],
      experience: 'regular',
      schedule: 'varies',
    });
    expect(JSON.stringify(worst).length).toBeLessThan(1600);
  });
});

describe('quick-fit fallback keeps the chosen style among the gentlest sessions', () => {
  it('prefers the chosen style when the intensity limit cannot be met at that length', async () => {
    const { suggestQuickFit } = await import('./workouts');
    for (let seed = 0; seed < 8; seed++) {
      const w = suggestQuickFit({
        minutes: 10,
        lowImpactOnly: true,
        intensities: ['low'],
        style: 'amapiano',
        seed,
      });
      expect(w?.style).toBe('amapiano');
      expect(w?.impact).toBe('low');
    }
    // A style with no gentlest session at this length falls back to the gentlest available.
    const other = suggestQuickFit({
      minutes: 10,
      lowImpactOnly: true,
      intensities: ['low'],
      style: 'hip_hop',
      seed: 0,
    });
    expect(other?.impact).toBe('low');
  });
});
