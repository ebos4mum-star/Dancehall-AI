import { describe, expect, it } from 'vitest';
import { unsafeOutputProblems } from './coach-safety';
import { generateDailyPlan, type DailyPlanInput } from './daily-plan';
import { CONTENT_ITEMS, contentProblems, renderableContent, type ContentItem } from './evidence';
import {
  NEVER_OFFERED,
  PATHWAYS_RULES_STATUS,
  resolvePathways,
  type EngineInput,
  type EngineOutput,
} from './pathways';
import { nutritionTargets } from './nutrition-plan';
import { WORKOUT_BY_ID } from './workouts';
import {
  DEFAULT_PREFS,
  GOAL_INTENTS,
  PATHWAY_IDS,
  SELECTABLE_GOAL_INTENTS,
  numbersHidden,
  parsePrefs,
  type WellnessPrefs,
} from './wellness';

const prefs = (over: Record<string, unknown> = {}): WellnessPrefs => parsePrefs(over);
const run = (over: Record<string, unknown> = {}, extra: Partial<EngineInput> = {}): EngineOutput =>
  resolvePathways({ prefs: prefs(over), readiness: 'clear', ...extra });
const BODY = {
  weightKg: 80,
  heightCm: 170,
  ageYears: 35,
  sex: 'female' as const,
  activity: 'light' as const,
  targetKg: null,
};
const ids = (o: EngineOutput) => o.pathways.map((p) => p.id);
const everyText = (o: EngineOutput): string[] => [
  ...o.summary,
  ...o.missing.map((m) => m.why),
  ...o.exclusions.map((e) => e.reason),
  ...o.habitSuggestions.flatMap((h) => [h.name, h.why]),
  ...o.pathways.flatMap((p) => [
    p.title,
    ...p.reasons,
    ...p.notes,
    ...p.actions.flatMap((a) => [a.text, a.why]),
  ]),
  ...(o.bias.workoutWhy ? [o.bias.workoutWhy] : []),
  ...(o.bias.mealWhy ? [o.bias.mealWhy] : []),
];

describe('each goal intent', () => {
  it('knows five intents, all selectable; the stored four are unchanged and in their original order, and Gain Weight is its own goal', () => {
    expect([...GOAL_INTENTS]).toEqual(['lose', 'maintain', 'fitness', 'strength', 'gain']);
    expect([...SELECTABLE_GOAL_INTENTS]).toEqual([
      'lose',
      'maintain',
      'gain',
      'fitness',
      'strength',
    ]);
  });
  it('lose: a gentle weight-loss focus with a dance-led plan', () => {
    const o = run({ goalIntent: 'lose' });
    expect(o.focus).toBe('weight_loss');
    expect(o.pathways[0]).toMatchObject({
      id: 'dance_aerobic',
      role: 'primary',
      source: 'from_goal',
    });
    expect(ids(o)).toEqual([
      'dance_aerobic',
      'balanced_nutrition',
      'healthy_habits',
      'everyday_movement',
    ]);
    expect(o.summary.join(' ')).toMatch(/Nothing here promises a result/);
    expect(o.bias.showWeightPrompts).toBe(true);
  });
  it('maintain: keeping steady is the primary pathway', () => {
    const o = run({ goalIntent: 'maintain' });
    expect(o.focus).toBe('maintenance');
    expect(o.pathways[0]).toMatchObject({ id: 'weight_maintenance', role: 'primary' });
    expect(o.bias.showWeightPrompts).toBe(true);
  });
  it('fitness: weight-neutral, no weight prompts, no weight target', () => {
    const o = run({ goalIntent: 'fitness' });
    expect(o.focus).toBe('weight_neutral');
    expect(o.bias.showWeightPrompts).toBe(false);
    expect(ids(o)).toEqual(['dance_aerobic', 'everyday_movement', 'healthy_habits']);
    expect(o.exclusions).toEqual([]);
  });
  it('strength: strength training leads, weight-neutral, fuelled not restricted', () => {
    const o = run({ goalIntent: 'strength' });
    expect(o.focus).toBe('weight_neutral');
    expect(o.pathways[0]).toMatchObject({ id: 'strength_training', role: 'primary' });
    expect(ids(o)).toContain('balanced_nutrition');
    expect(o.bias.includeStrengthPrompt).toBe(true);
    expect(o.bias.showWeightPrompts).toBe(false);
    const fuel = o.pathways.find((p) => p.id === 'balanced_nutrition')!;
    expect(fuel.actions.map((a) => a.id)).toContain('nutrition.fuel');
  });
  it('strength never creates a deficit or a weight change in the nutrition numbers', () => {
    const o = run({ goalIntent: 'strength' }, { body: BODY });
    expect(o.nutrition?.mode).toBe('estimate');
    expect(o.nutrition?.kcal?.weeklyChangeKg).toBe(0);
    expect(o.nutrition?.kcal?.guide).toBe(o.nutrition?.kcal?.maintenance);
    expect(o.nutrition?.reasons.join(' ')).toMatch(/no deficit and no weight target/);
  });
  it('all eight pathways can be chosen and each is explained', () => {
    const o = run({ pathways: [...PATHWAY_IDS] });
    expect(ids(o).sort()).toEqual([...PATHWAY_IDS].sort());
    for (const p of o.pathways) expect(p.source).toBe('chosen');
  });
});

describe('explanations', () => {
  const personas: Array<[string, Record<string, unknown>, Partial<EngineInput>]> = [
    ['default', {}, {}],
    ['lose', { goalIntent: 'lose' }, { body: BODY }],
    [
      'strength + cultural',
      { goalIntent: 'strength', cuisines: ['west_african', 'caribbean'], equipment: ['dumbbells'] },
      {},
    ],
    [
      'all pathways',
      { pathways: [...PATHWAY_IDS], danceStyles: ['dancehall', 'afrobeats'], mobility: ['seated'] },
      {},
    ],
    [
      'eating concern',
      { goalIntent: 'lose', eatingConcern: true, pathways: ['mindful_eating'] },
      {},
    ],
    ['pregnant', { goalIntent: 'lose', pregnantOrPostpartum: true }, { body: BODY }],
  ];
  it.each(personas)(
    '%s: every pathway, action and exclusion has a plain reason',
    (_n, over, extra) => {
      const o = run(over, extra);
      expect(o.summary.length).toBeGreaterThan(0);
      for (const p of o.pathways) {
        expect(p.reasons.length).toBeGreaterThan(0);
        expect(p.editable).toBe(true);
        for (const a of p.actions) {
          expect(a.text.trim()).not.toBe('');
          expect(a.why.trim()).not.toBe('');
        }
      }
      for (const e of o.exclusions) expect(e.reason.length).toBeGreaterThan(20);
      for (const h of o.habitSuggestions) expect(h.why.length).toBeGreaterThan(10);
    },
  );
  it.each(personas)(
    '%s: no guilt, hype, streak, diagnosis or very-low-calorie language, and nothing from the never-offered list',
    (_n, over, extra) => {
      const o = run(over, extra);
      const text = everyText(o).join('\n');
      expect(unsafeOutputProblems(text)).toEqual([]);
      expect(text).not.toMatch(
        /\bfast(?:ing)?\b|intermittent|OMAD|detox|cleanse|burn|cheat|earn your|make up for|medication|dose|prescri/i,
      );
      expect(text).not.toMatch(/\d\s*kcal|\d\s*calories/i);
      expect(text).not.toMatch(/\bgood food|bad food|clean eating/i);
    },
  );
  it('the never-offered list is stated and the rules are marked provisional', () => {
    expect(NEVER_OFFERED).toContain('fasting');
    expect(NEVER_OFFERED).toContain('medication_advice');
    expect(PATHWAYS_RULES_STATUS.reviewedByProfessional).toBe(false);
    expect(run().provisional).toBe(true);
  });
  it('states honest limits: guided strength and missing styles are said plainly', () => {
    const o = run({
      goalIntent: 'strength',
      danceStyles: ['dancehall'],
      pathways: ['strength_training', 'dance_aerobic'],
    });
    expect(o.pathways.find((p) => p.id === 'strength_training')!.notes.join(' ')).toMatch(
      /not available yet/,
    );
    expect(o.pathways.find((p) => p.id === 'dance_aerobic')!.notes.join(' ')).toMatch(
      /Dancehall sessions are not in the catalogue yet/,
    );
    expect(o.bias.styles).toEqual([]);
  });
  it('flags thin cuisine coverage and stays quiet where the food list is adequate', () => {
    const asian = run({ cuisines: ['asian'], pathways: ['cultural_eating'] });
    expect(asian.pathways[0]!.notes.join(' ')).toMatch(/only 2 Asian examples/);
    const west = run({ cuisines: ['west_african'], pathways: ['cultural_eating'] });
    expect(west.pathways[0]!.notes).toEqual([]);
    expect(west.pathways[0]!.actions[0]!.why).toMatch(/No food is labelled good or bad/);
  });
});

describe('preference changes', () => {
  it('chosen pathways replace the goal-derived ones, and clearing them goes back', () => {
    const base = run({ goalIntent: 'lose' });
    const chosen = run({ goalIntent: 'lose', pathways: ['strength_training', 'mindful_eating'] });
    expect(ids(chosen).sort()).toEqual(['mindful_eating', 'strength_training']);
    expect(chosen.pathways.every((p) => p.source === 'chosen')).toBe(true);
    expect(run({ goalIntent: 'lose', pathways: [] })).toEqual(base);
  });
  it('changing the goal changes the primary pathway and focus', () => {
    expect(run({ goalIntent: 'lose' }).pathways[0]!.id).toBe('dance_aerobic');
    expect(run({ goalIntent: 'strength' }).pathways[0]!.id).toBe('strength_training');
    expect(run({ goalIntent: 'maintain' }).pathways[0]!.id).toBe('weight_maintenance');
  });
  it('chosen styles, mobility and experience change the plan bias', () => {
    const o = run({ danceStyles: ['afrobeats', 'latin'], mobility: ['seated'], experience: 'new' });
    expect(o.bias.styles).toEqual(['afrobeats', 'latin']);
    expect(o.bias.impact).toBe('low');
    expect(o.bias.seated).toBe(true);
    expect(o.bias.intensityCeiling).toBe('low');
    expect(o.bias.workoutWhy).toMatch(/Afrobeats and Latin/);
  });
  it('a suggestion never changes the plan until it is chosen', () => {
    const o = run({ cuisines: ['caribbean'], activities: ['dance', 'strength'] });
    const sug = o.pathways.filter((p) => p.source === 'suggested');
    expect(sug.map((p) => p.id).sort()).toEqual(['cultural_eating', 'strength_training']);
    expect(
      sug.every(
        (p) =>
          p.needsConfirmation &&
          p.reasons.join(' ').includes('Nothing changes until you choose it'),
      ),
    ).toBe(true);
    expect(o.bias.includeStrengthPrompt).toBe(false);
    const chosen = run({
      cuisines: ['caribbean'],
      activities: ['dance', 'strength'],
      pathways: ['strength_training'],
    });
    expect(chosen.bias.includeStrengthPrompt).toBe(true);
  });
  it('suggestions only ever come from what the person said', () => {
    expect(run().pathways.filter((p) => p.source === 'suggested')).toEqual([]);
    expect(run({ tracking: 'none' }).pathways.find((p) => p.id === 'mindful_eating')?.source).toBe(
      'suggested',
    );
    expect(
      run({ tracking: 'none', eatingConcern: true }).pathways.find(
        (p) => p.id === 'mindful_eating',
      ),
    ).toBeUndefined();
    expect(
      run({ goalIntent: 'lose' }, { recent: { goalReached: true } }).pathways.find(
        (p) => p.id === 'weight_maintenance',
      )?.source,
    ).toBe('suggested');
  });
  it('habit suggestions respect the five-habit limit and never repeat the person’s own', () => {
    expect(run({}, { habits: { active: 5 } }).habitSuggestions).toEqual([]);
    expect(run({ goalIntent: 'lose' }, { habits: { active: 4 } }).habitSuggestions).toHaveLength(1);
    expect(
      run({ pathways: [...PATHWAY_IDS] }, { habits: { active: 0 } }).habitSuggestions,
    ).toHaveLength(3); // a few ideas, never a long list
    const names = run(
      { goalIntent: 'lose' },
      { habits: { active: 0, names: ['drink a glass of water'] } },
    ).habitSuggestions.map((h) => h.name);
    expect(names).not.toContain('Drink a glass of water');
    expect(
      run({ goalIntent: 'lose' }, { habits: { active: 5 } }).pathways.find(
        (p) => p.id === 'healthy_habits',
      )!.actions[0]!.text,
    ).toMatch(/already have five habits/);
  });
  it('an evening schedule puts the wind-down habit first', () => {
    const o = run({ pathways: ['healthy_habits', 'everyday_movement'], schedule: 'evening' });
    expect(o.habitSuggestions[0]!.name).toBe('Wind down before bed');
  });
  it('the weekly goal and daily goal the person set are echoed, never invented', () => {
    const none = run({ pathways: ['dance_aerobic', 'everyday_movement'] });
    expect(JSON.stringify(none.pathways)).not.toMatch(/minutes a week|-minute daily/);
    const set = run({
      pathways: ['dance_aerobic', 'everyday_movement'],
      exerciseMinutesPerWeek: 120,
      dailyMovementMinutes: 20,
    });
    expect(JSON.stringify(set.pathways)).toMatch(/120 minutes a week/);
    expect(JSON.stringify(set.pathways)).toMatch(/20-minute daily movement goal/);
  });
});

describe('missing or incomplete information', () => {
  it('never throws on empty or garbage stored preferences', () => {
    for (const raw of [
      undefined,
      null,
      {},
      [],
      'x',
      5,
      { goalIntent: 'nope', pathways: 'dance', danceStyles: [1, 2], mobility: {} },
    ]) {
      expect(() => resolvePathways({ prefs: parsePrefs(raw) })).not.toThrow();
    }
  });
  it('lists what it does not know instead of guessing', () => {
    const o = resolvePathways({ prefs: prefs() });
    expect(o.missing.map((m) => m.key).sort()).toEqual(['experience', 'pathways', 'readiness']);
    expect(run().bias.intensityCeiling).toBeNull(); // experience not told, readiness clear: no limit and no guess
    expect(o.bias.intensityCeiling).toBe('low'); // readiness not told: start gently
    expect(o.nutrition).toBeNull();
    const told = run({ experience: 'some', pathways: ['dance_aerobic'] });
    expect(told.missing).toEqual([]);
  });
  it('unknown readiness is treated cautiously: low impact, low intensity, no weight-loss targets', () => {
    const o = resolvePathways({ prefs: prefs({ goalIntent: 'lose' }) });
    expect(o.bias.impact).toBe('low');
    expect(o.bias.intensityCeiling).toBe('low');
    expect(o.focus).toBe('weight_neutral');
    expect(o.exclusions[0]!.reason).toMatch(/not seen your quick safety answers/);
    expect(o.summary.join(' ')).toMatch(/quick safety answers/);
  });
  it('without body details there are no numbers, and with them the numbers come only from nutritionTargets', () => {
    expect(run({ goalIntent: 'lose' }).nutrition).toBeNull();
    const o = run({ goalIntent: 'lose' }, { body: BODY });
    expect(o.nutrition).toEqual(
      nutritionTargets({
        intent: 'lose',
        tracking: 'light',
        ...BODY,
        pregnantOrPostpartum: false,
        eatingConcern: false,
        readinessCautious: false,
      }),
    );
  });
});

describe('safety exclusions', () => {
  const cases: Array<[string, Record<string, unknown>, 'clear' | 'cautious' | 'unknown', RegExp]> =
    [
      ['eating concern', { eatingConcern: true }, 'clear', /food can feel difficult/],
      [
        'pregnancy or postpartum',
        { pregnantOrPostpartum: true },
        'clear',
        /pregnancy and after birth/,
      ],
      ['cautious readiness', {}, 'cautious', /health professional/],
      ['unknown readiness', {}, 'unknown', /not seen your quick safety answers/],
    ];
  it.each(cases)(
    '%s withholds weight-loss targets for a lose goal, explains why, and offers no weigh-in prompt',
    (_n, over, readiness, why) => {
      const o = resolvePathways({
        prefs: prefs({ goalIntent: 'lose', ...over }),
        readiness,
        body: BODY,
      });
      expect(o.focus).toBe('weight_neutral');
      expect(o.exclusions).toEqual([
        { id: 'weight_loss_targets', reason: expect.stringMatching(why) },
      ]);
      expect(o.bias.showWeightPrompts).toBe(false);
      expect(o.nutrition?.kcal).toBeNull();
      expect(o.nutrition?.mode).toBe(readiness === 'unknown' ? 'general' : 'professional');
      expect(o.summary.join(' ')).toMatch(why);
    },
  );
  it('a clear lose goal keeps the existing safety limits (deficit capped, never below resting energy)', () => {
    const k = run({ goalIntent: 'lose' }, { body: BODY }).nutrition!.kcal!;
    expect(k.guide!).toBeLessThan(k.maintenance);
    expect(k.maintenance - k.guide!).toBeLessThanOrEqual(Math.round(k.maintenance * 0.2) + 1);
    expect(k.guide!).toBeGreaterThanOrEqual(k.floor);
  });
  it('missing safety answers are never treated as a finding: no "your answers suggest" and no professional-support flag', () => {
    const o = resolvePathways({
      prefs: prefs({ goalIntent: 'lose' }),
      readiness: 'unknown',
      body: BODY,
    });
    expect(o.seeProfessional).toBe(false);
    expect(o.nutrition?.reasons).toEqual(['Finish the quick safety questions to see an estimate.']);
    expect(JSON.stringify(o)).not.toMatch(/answers suggest/);
    const cautious = resolvePathways({
      prefs: prefs({ goalIntent: 'lose' }),
      readiness: 'cautious',
      body: BODY,
    });
    expect(cautious.seeProfessional).toBe(true);
    expect(cautious.nutrition?.reasons.join(' ')).toMatch(/Your answers suggest/);
  });
  it('professional support is flagged for eating concern, pregnancy and cautious readiness', () => {
    expect(run({ eatingConcern: true }).seeProfessional).toBe(true);
    expect(run({ pregnantOrPostpartum: true }).seeProfessional).toBe(true);
    expect(resolvePathways({ prefs: prefs(), readiness: 'cautious' }).seeProfessional).toBe(true);
    expect(run().seeProfessional).toBe(false);
    expect(resolvePathways({ prefs: prefs() }).seeProfessional).toBe(false);
  });
  it('pregnancy or postpartum caps intensity at moderate and keeps low impact', () => {
    const o = run({ pregnantOrPostpartum: true, experience: 'regular' });
    expect(o.bias.intensityCeiling).toBe('moderate');
    expect(o.bias.impact).toBe('low');
  });
  it('cautious readiness forces low intensity even for an experienced person', () => {
    const o = resolvePathways({ prefs: prefs({ experience: 'regular' }), readiness: 'cautious' });
    expect(o.bias.intensityCeiling).toBe('low');
    expect(o.bias.impact).toBe('low');
  });
  it('with an eating concern, mindful eating is reflection only and never suggested on its own', () => {
    const o = run({ eatingConcern: true, pathways: ['mindful_eating'] });
    const m = o.pathways[0]!;
    expect(m.actions.map((a) => a.id)).toEqual(['mindful.reflect']);
    expect(m.actions[0]!.text).toMatch(/no scoring/);
    expect(m.notes.join(' ')).toMatch(/doctor or a dietitian/);
  });
  it('strength training carries a professional-check note when there is any caution', () => {
    const o = run({ pathways: ['strength_training'], pregnantOrPostpartum: true });
    expect(o.pathways[0]!.notes.join(' ')).toMatch(/Check with a health professional/);
    expect(run({ pathways: ['strength_training'] }).pathways[0]!.notes.join(' ')).not.toMatch(
      /Check with a health professional/,
    );
  });
  it('nothing in any output names fasting, rapid loss, detox, supplements or medication, for every combination of intent and flag', () => {
    for (const goalIntent of GOAL_INTENTS)
      for (const flags of [{}, { eatingConcern: true }, { pregnantOrPostpartum: true }])
        for (const readiness of ['clear', 'cautious', 'unknown'] as const) {
          const o = resolvePathways({
            prefs: prefs({ goalIntent, pathways: [...PATHWAY_IDS], ...flags }),
            readiness,
            body: BODY,
          });
          const text = JSON.stringify(o);
          expect(text).not.toMatch(
            /fasting|intermittent|OMAD|detox|cleanse|supplement|medication|prescri|rapid|crash/i,
          );
        }
  });
});

describe('hidden calorie and weight numbers', () => {
  const hiddenCases: Array<[string, Record<string, unknown>]> = [
    ['tracking turned off', { tracking: 'none' }],
    ['eating concern', { eatingConcern: true, tracking: 'detailed' }],
    ['pregnancy or postpartum', { pregnantOrPostpartum: true, tracking: 'detailed' }],
  ];
  it.each(hiddenCases)(
    '%s: no calorie, protein or weight numbers anywhere in the output',
    (_n, over) => {
      expect(numbersHidden(prefs(over))).toBe(true);
      for (const goalIntent of GOAL_INTENTS) {
        const o = run({ goalIntent, ...over }, { body: BODY });
        expect(o.numbersHidden).toBe(true);
        expect(o.nutrition?.kcal).toBeNull();
        expect(o.nutrition?.proteinG).toBeNull();
        expect(o.bias.showWeightPrompts).toBe(false);
        const hidden = o.lens.hidden.map((h) => h.id);
        expect(hidden).toEqual(
          expect.arrayContaining(['weight_trend', 'calories', 'measurements']),
        );
        expect(o.lens.show).not.toEqual(expect.arrayContaining(['weight_trend']));
        const all = o.pathways.flatMap((p) => p.actions.map((a) => a.id));
        expect(all).not.toContain('nutrition.protein_range');
        expect(JSON.stringify(o.pathways)).not.toMatch(/\d+\s*(kg|lb|g a day|kcal)/);
      }
    },
  );
  it('visible numbers appear only when allowed, and only the reviewed protein range', () => {
    const o = run({ goalIntent: 'fitness', tracking: 'detailed' }, { body: BODY });
    const n = o.pathways.flatMap((p) => p.actions).find((a) => a.id === 'nutrition.protein_range');
    expect(n).toBeUndefined(); // fitness has no nutrition pathway by default
    const o2 = run({ pathways: ['balanced_nutrition'], tracking: 'detailed' }, { body: BODY });
    const a = o2.pathways[0]!.actions.find((x) => x.id === 'nutrition.protein_range')!;
    expect(a.text).toBe(
      `A general protein range is about ${o2.nutrition!.proteinG!.low} to ${o2.nutrition!.proteinG!.high} g a day`,
    );
    expect(a.why).toMatch(/not a target you must hit/);
  });
  it('weight-neutral goals do not show the weight trend until the person opts in, and detailed tracking alone does not opt in', () => {
    expect(run({ goalIntent: 'strength' }).lens.hidden.map((h) => h.id)).toContain('weight_trend');
    expect(run({ goalIntent: 'strength', tracking: 'detailed' }).lens.show).not.toContain(
      'weight_trend',
    );
    expect(run({ goalIntent: 'strength', weightTracking: true }).lens.show).toContain(
      'weight_trend',
    );
    expect(run({ goalIntent: 'lose' }).lens.show).toContain('weight_trend');
  });
  it('consistency and non-scale wins are always shown, and no lens rewards fast loss or fasting', () => {
    for (const over of [
      {},
      { tracking: 'none' },
      { eatingConcern: true },
      { goalIntent: 'strength' },
    ]) {
      const o = run(over);
      expect(o.lens.show).toEqual(expect.arrayContaining(['consistency', 'non_scale_wins']));
      expect(JSON.stringify(o.lens)).not.toMatch(/rapid|fast|streak|fasting/i);
    }
  });
});

describe('backward compatibility', () => {
  const OLD_DOCS = [
    {
      goalIntent: 'lose',
      tracking: 'detailed',
      waterGoalMl: 2500,
      activities: ['dance', 'walking'],
      eatingConcern: false,
    },
    { goalIntent: 'maintain', celebrations: 'gentle', dailyMovementMinutes: 30 },
    { goalIntent: 'fitness', diet: ['vegetarian'], pregnantOrPostpartum: true },
  ];
  it('existing stored documents parse to exactly the same old fields, with safe defaults for the new ones', () => {
    for (const old of OLD_DOCS) {
      const p = parsePrefs(old);
      expect(p.goalIntent).toBe(old.goalIntent);
      expect(p.pathways).toEqual([]);
      expect(p.danceStyles).toEqual([]);
      expect(p.cuisines).toEqual([]);
      expect(p.mobility).toEqual([]);
      expect(p.experience).toBeNull();
      expect(p.schedule).toBeNull();
    }
    expect(parsePrefs(OLD_DOCS[0])).toMatchObject({
      tracking: 'detailed',
      waterGoalMl: 2500,
      activities: ['dance', 'walking'],
    });
    expect(parsePrefs({})).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.goalIntent).toBe('fitness');
  });
  it('the stores’ read-merge-write cycle keeps the new fields and never resets existing goals', () => {
    // Both adapters write parsePrefs({ ...parsePrefs(stored), ...patch }), so any field parsePrefs does not return would be erased.
    let stored: unknown = OLD_DOCS[0];
    const save = (patch: Partial<WellnessPrefs>) =>
      (stored = parsePrefs({ ...parsePrefs(stored), ...patch }));
    save({
      goalIntent: 'strength',
      pathways: ['strength_training'],
      danceStyles: ['dancehall'],
      cuisines: ['caribbean'],
      mobility: ['seated'],
      experience: 'some',
      schedule: 'morning',
    });
    save({ waterGoalMl: 2000 });
    expect(parsePrefs(stored)).toMatchObject({
      goalIntent: 'strength',
      pathways: ['strength_training'],
      danceStyles: ['dancehall'],
      cuisines: ['caribbean'],
      mobility: ['seated'],
      experience: 'some',
      schedule: 'morning',
      waterGoalMl: 2000,
      tracking: 'detailed',
    });
    // An unrelated patch on an old document leaves its goal alone.
    expect(parsePrefs({ ...parsePrefs(OLD_DOCS[1]), waterGoalMl: 1800 }).goalIntent).toBe(
      'maintain',
    );
  });
  it('unknown or future values fall back instead of failing, and the worst-case document stays well under the 2 KB cap', () => {
    expect(parsePrefs({ goalIntent: 'bulk' }).goalIntent).toBe('fitness');
    expect(parsePrefs({ goalIntent: 'strength' }).goalIntent).toBe('strength');
    expect(
      parsePrefs({ experience: 'pro', schedule: 'night', pathways: ['fasting', 'dance_aerobic'] }),
    ).toMatchObject({ experience: null, schedule: null, pathways: ['dance_aerobic'] });
    const worst = parsePrefs({
      goalIntent: 'strength',
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
      pregnantOrPostpartum: false,
      eatingConcern: false,
      pathways: [...PATHWAY_IDS],
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
    expect(JSON.stringify(worst).length).toBeLessThan(1500);
  });
  it('the weight-neutral strength intent does not trigger the weigh-in prompt, and the existing intents behave as before', () => {
    const base: DailyPlanInput = {
      date: '2026-06-15',
      mode: 'normal',
      localHour: 12,
      lowImpact: false,
      plannedToday: [],
      doneToday: [],
      mealsLoggedToday: 1,
      activeGoalTypes: ['lose'],
      daysSinceWeight: 30,
      seed: 1,
    };
    const w = (intent: 'lose' | 'maintain' | 'fitness' | 'strength') => ({
      intent,
      tracking: 'detailed' as const,
      activities: ['dance' as const],
      hydrationMl: 0,
      waterGoalMl: 0,
      walkedToday: false,
    });
    const weighs = (intent: 'lose' | 'maintain' | 'fitness' | 'strength') =>
      generateDailyPlan({ ...base, wellness: w(intent) }).items.some((x) => x.kind === 'goal');
    expect(weighs('lose')).toBe(true);
    expect(weighs('maintain')).toBe(true);
    expect(weighs('fitness')).toBe(false);
    expect(weighs('strength')).toBe(false);
  });
  it('a plan built without the engine is byte-for-byte the plan built with a neutral engine bias', () => {
    const neutral = run({ goalIntent: 'fitness' }).bias; // default prefs, readiness clear
    expect(neutral).toEqual({
      impact: 'any',
      seated: false,
      intensityCeiling: null,
      styles: [],
      includeStrengthPrompt: false,
      showWeightPrompts: false,
      workoutWhy: null,
      mealWhy: null,
    });
    for (const mode of ['normal', 'busy', 'travel', 'comeback'] as const)
      for (const seed of [0, 1, 2, 3, 4, 5, 6])
        for (const lowImpact of [false, true]) {
          const i: DailyPlanInput = {
            date: '2026-06-15',
            mode,
            localHour: 14,
            lowImpact,
            plannedToday: [],
            doneToday: [],
            mealsLoggedToday: 0,
            activeGoalTypes: ['maintain'],
            daysSinceWeight: 10,
            seed,
            wellness: {
              intent: 'fitness',
              tracking: 'light',
              activities: ['dance', 'walking'],
              hydrationMl: 100,
              waterGoalMl: 2000,
              walkedToday: false,
            },
          };
          expect(generateDailyPlan({ ...i, bias: neutral })).toEqual(generateDailyPlan(i));
        }
  });
});

describe('daily plan with the engine bias', () => {
  const base: DailyPlanInput = {
    date: '2026-06-15',
    mode: 'normal',
    localHour: 12,
    lowImpact: false,
    plannedToday: [],
    doneToday: [],
    mealsLoggedToday: 1,
    activeGoalTypes: [],
    daysSinceWeight: null,
  };
  const workout = (o: ReturnType<typeof generateDailyPlan>) => {
    const item = o.items.find((x) => x.kind === 'workout' && x.ref?.workoutId);
    return item ? { item, def: WORKOUT_BY_ID.get(item.ref!.workoutId!)! } : null;
  };
  it('a chosen style that exists is preferred, and the reason says so', () => {
    for (let seed = 0; seed < 6; seed++) {
      const bias = run({ danceStyles: ['latin'] }).bias;
      const r = workout(generateDailyPlan({ ...base, mode: 'travel', seed, bias }));
      expect(r?.def.style).toBe('latin');
      expect(r?.item.why).toMatch(/You chose Latin/);
    }
  });
  it('low impact is always honoured, the intensity ceiling is met when a session exists, and otherwise the gentlest session is offered rather than none', () => {
    const bias = run({
      experience: 'new',
      mobility: ['low_impact'],
      danceStyles: ['bollywood', 'dancehall'],
    }).bias;
    for (let seed = 0; seed < 12; seed++) {
      // Five minutes: a low-intensity, low-impact session exists, so the ceiling is met.
      const busy = workout(generateDailyPlan({ ...base, mode: 'busy', seed, bias }));
      expect(busy?.def.impact).toBe('low');
      expect(busy?.def.intensity).toBe('low');
      // Ten minutes: no session is both low impact and low intensity in the catalogue, so impact stays low and the gentlest available is offered.
      const normal = workout(generateDailyPlan({ ...base, mode: 'normal', seed, bias }));
      expect(normal).not.toBeNull();
      expect(normal?.def.impact).toBe('low');
      expect(normal?.def.intensity).toBe('moderate');
    }
  });
  it('the engine can only add safety to a plan, never remove it', () => {
    const bias = run({ experience: 'regular' }).bias;
    for (let seed = 0; seed < 8; seed++) {
      const r = workout(generateDailyPlan({ ...base, lowImpact: true, seed, bias }));
      expect(r?.def.impact).toBe('low');
    }
  });
  it('a strength-goal plan offers the self-directed strength prompt even without the strength activity', () => {
    const w = {
      intent: 'strength' as const,
      tracking: 'light' as const,
      activities: ['dance' as const],
      hydrationMl: 0,
      waterGoalMl: 0,
      walkedToday: false,
    };
    const without = generateDailyPlan({ ...base, wellness: w });
    expect(without.items.some((x) => x.ref?.action === 'log_strength')).toBe(false);
    const withBias = generateDailyPlan({
      ...base,
      wellness: w,
      bias: run({ goalIntent: 'strength' }).bias,
    });
    const s = withBias.items.find((x) => x.ref?.action === 'log_strength')!;
    expect(s.detail).toMatch(/Guided strength workouts are not available yet/);
  });
  it('the cultural choice is explained on the meal item, and withheld weight-loss targets suppress the weigh-in', () => {
    const bias = run({ cuisines: ['west_african'], pathways: ['cultural_eating'] }).bias;
    const meal = generateDailyPlan({ ...base, bias }).items.find((x) => x.kind === 'meal')!;
    expect(meal.why).toMatch(/West African foods, and swap ideas favour them/);
    const lose = {
      ...base,
      activeGoalTypes: ['lose' as const],
      daysSinceWeight: 30,
      wellness: {
        intent: 'lose' as const,
        tracking: 'detailed' as const,
        activities: ['dance' as const],
        hydrationMl: 0,
        waterGoalMl: 0,
        walkedToday: false,
      },
    };
    expect(generateDailyPlan(lose).items.some((x) => x.kind === 'goal')).toBe(true);
    const cautious = resolvePathways({
      prefs: prefs({ goalIntent: 'lose' }),
      readiness: 'cautious',
    }).bias;
    expect(
      generateDailyPlan({ ...lose, bias: cautious }).items.some((x) => x.kind === 'goal'),
    ).toBe(false);
  });
});

describe('deterministic output', () => {
  it('the same input always gives the same output, and the input is never changed', () => {
    const p = prefs({
      goalIntent: 'strength',
      cuisines: ['caribbean', 'west_african'],
      danceStyles: ['dancehall', 'afrobeats'],
      mobility: ['seated'],
      experience: 'some',
      schedule: 'evening',
      pathways: ['strength_training', 'cultural_eating'],
    });
    const frozen = Object.freeze({
      ...p,
      pathways: Object.freeze([...p.pathways]) as never,
    }) as WellnessPrefs;
    const input: EngineInput = {
      prefs: frozen,
      readiness: 'clear',
      body: BODY,
      habits: { active: 2, names: ['x'] },
    };
    const a = resolvePathways(input);
    for (let k = 0; k < 5; k++) expect(resolvePathways(input)).toEqual(a);
    expect(JSON.stringify(resolvePathways(input))).toBe(JSON.stringify(a));
  });
  it('order of stored arrays does not matter: parsing canonicalises them', () => {
    const a = run({
      pathways: ['mindful_eating', 'dance_aerobic'],
      cuisines: ['caribbean', 'asian'],
      danceStyles: ['latin', 'afrobeats'],
    });
    const b = run({
      pathways: ['dance_aerobic', 'mindful_eating'],
      cuisines: ['asian', 'caribbean'],
      danceStyles: ['afrobeats', 'latin'],
    });
    expect(a).toEqual(b);
  });
  it('the output is plain data: it round-trips through JSON unchanged', () => {
    const o = run({ goalIntent: 'lose', cuisines: ['caribbean'] }, { body: BODY });
    expect(JSON.parse(JSON.stringify(o))).toEqual(o);
  });
});

describe('evidence and content gate', () => {
  const good: ContentItem = {
    id: 'plate-basics',
    pathway: 'balanced_nutrition',
    title: 'Plate basics',
    body: 'A balanced plate has protein, vegetables and a starchy food.',
    evidence: 'strong',
    kind: 'education',
    sources: [{ title: 'Healthy diet', publisher: 'WHO', year: 2020 }],
    review: {
      status: 'approved',
      reviewerRole: 'registered_dietitian',
      evidenceRef: 'review-001',
      reviewedOn: '2026-11-20',
      isAuthor: false,
    },
  };
  it('ships no content in Stage A', () => {
    expect(CONTENT_ITEMS).toEqual([]);
    expect(renderableContent(CONTENT_ITEMS)).toEqual([]);
  });
  it('an approved, independently reviewed, sourced item may be shown', () => {
    expect(contentProblems(good)).toEqual([]);
    expect(renderableContent([good], ['balanced_nutrition'])).toEqual([good]);
    expect(renderableContent([good], ['mindful_eating'])).toEqual([]);
  });
  it.each<[string, ContentItem, RegExp]>([
    ['unreviewed', { ...good, review: { status: 'unreviewed' } }, /not approved/],
    ['in review', { ...good, review: { ...good.review, status: 'in_review' } }, /not approved/],
    [
      'changes requested',
      { ...good, review: { ...good.review, status: 'changes_requested' } },
      /not approved/,
    ],
    [
      'reviewed by its author',
      { ...good, review: { ...good.review, isAuthor: true } },
      /independent/,
    ],
    ['author unknown', { ...good, review: { ...good.review, isAuthor: undefined } }, /independent/],
    [
      'no reviewer record',
      { ...good, review: { status: 'approved', isAuthor: false } },
      /incomplete/,
    ],
    ['strong without sources', { ...good, sources: [] }, /named sources/],
    ['moderate without sources', { ...good, evidence: 'moderate', sources: [] }, /named sources/],
    [
      'unsupported shown as education',
      { ...good, evidence: 'unsupported', kind: 'education' },
      /only be shown as an explanation/,
    ],
    [
      'explain_why_not for a supported claim',
      { ...good, kind: 'explain_why_not' },
      /only for unsupported/,
    ],
    ['hype language', { ...good, body: 'Detox your body and burn fat fast.' }, /language/],
    ['empty body', { ...good, body: ' ' }, /empty/],
  ])('%s is never shown', (_n, item, why) => {
    expect(contentProblems(item).join(' ')).toMatch(why);
    expect(renderableContent([item])).toEqual([]);
  });
  it('an unsupported claim can be shown only as an explanation of why not', () => {
    const myth: ContentItem = {
      ...good,
      id: 'detox-myth',
      evidence: 'unsupported',
      kind: 'explain_why_not',
      sources: [],
      body: 'Cleanses are not needed: your body already clears waste.',
    };
    expect(contentProblems(myth).filter((p) => !p.startsWith('language'))).toEqual([]);
  });
  it('a traditional practice needs no clinical sources but still needs review', () => {
    const t: ContentItem = {
      ...good,
      evidence: 'traditional',
      sources: [],
      review: { ...good.review, reviewerRole: 'cultural_reviewer' },
    };
    expect(contentProblems(t)).toEqual([]);
    expect(contentProblems({ ...t, review: { status: 'unreviewed' } }).length).toBeGreaterThan(0);
  });
});
