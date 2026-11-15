import { afterEach, describe, expect, it } from 'vitest';
import {
  recommendByMood,
  ALL_STYLES,
  CUISINES,
  CUISINE_IDS,
  CURATED_FOODS,
  DANCE_STYLES,
  FOOD_SOURCES,
  LIVE_STYLES,
  PENDING_STYLES,
  PROGRESSION_RULES,
  STRENGTH_EXERCISES,
  STRENGTH_WORKOUTS,
  STYLE_DEFS,
  WORKOUTS,
  WORKOUT_BY_ID,
  activeStrengthWorkouts,
  atwaterKcal,
  bestCuisineFit,
  bundledContentProblems,
  cuisineFit,
  disableInternalFixtures,
  enableInternalFixtures,
  energyIsPlausible,
  filterWorkouts,
  foodProblems,
  generateDailyPlan,
  initRunner,
  initRunnerFromSegments,
  isProtectedStyle,
  isReviewedFood,
  isSeatedSuitable,
  levelSuggestion,
  matchTags,
  parsePrefs,
  planMeals,
  regionTagsFor,
  resolvePathways,
  runnerReduce,
  sessionSegments,
  strengthEntryLabel,
  strengthSegments,
  suggestQuickFit,
  workoutProblems,
  completionSummary,
  FIXTURE_STRENGTH_WORKOUTS,
  FIXTURE_WORKOUTS,
  type DailyPlanInput,
  type FoodRef,
  type ProgressionSession,
  type WorkoutDef,
} from './index';

afterEach(() => disableInternalFixtures());

/** Test-only numbers. They are NOT food data and must never be copied anywhere. */
const TEST_FOOD: FoodRef = {
  id: 'test-food',
  name: 'Test food',
  category: 'grain',
  regionTags: ['east_african'],
  per100g: { kcal: 100, proteinG: 5, carbsG: 15, fatG: 2, fiberG: 1 },
  servingG: 100,
  servingLabel: '1 portion',
  costTier: 1,
  aliases: [],
  provenance: {
    sourceId: 'kenya_fct',
    sourceFoodId: 'TEST-001',
    sourceVersion: 'test edition',
    retrievedOn: '2026-01-01',
    attribution: 'Test attribution',
    licenceRef: 'licence-check-001',
    reviewRef: 'dietitian-review-001',
    culturalReviewRef: 'cultural-review-001',
  },
};
const REVIEW = {
  status: 'approved' as const,
  reviewerRole: 'exercise_physiologist' as const,
  evidenceRef: 'review-001',
  reviewedOn: '2026-01-02',
  isAuthor: false,
};
const PROVENANCE = {
  credits: ['Test Author'],
  rightsRef: 'rights-001',
  review: REVIEW,
  culturalReviewRef: 'cultural-001',
};
const block = (kind: 'warmup' | 'main' | 'cooldown', seated?: boolean) => ({
  kind,
  title: kind,
  seconds: 60,
  cue: 'cue text',
  lowImpactAlt: 'low impact text',
  ...(seated ? { seatedAlt: 'seated text' } : {}),
});
const workout = (over: Partial<WorkoutDef> = {}): WorkoutDef => ({
  id: 'test-workout',
  title: 'Test workout',
  style: 'afrobeats',
  level: 'beginner',
  minutes: 5,
  intensity: 'low',
  impact: 'low',
  summary: 'x',
  instructorId: null,
  equipment: 'none',
  contentOrigin: 'original_text',
  blocks: [block('warmup'), block('main'), block('cooldown')],
  safety: ['Stop if you feel unwell.'],
  ...over,
});

describe('centralized style definitions', () => {
  it('knows every style once, and live plus pending is everything', () => {
    expect([...LIVE_STYLES, ...PENDING_STYLES]).toEqual([...ALL_STYLES]);
    expect(new Set(ALL_STYLES).size).toBe(ALL_STYLES.length);
    expect(Object.keys(STYLE_DEFS).sort()).toEqual([...ALL_STYLES].sort());
    for (const s of ALL_STYLES) expect(STYLE_DEFS[s].id).toBe(s);
  });
  it('offers only the live styles unless fixtures are on, and chair dance is its own style', () => {
    expect([...DANCE_STYLES]).toEqual([...LIVE_STYLES]);
    expect(ALL_STYLES).toContain('chair_dance');
    expect(STYLE_DEFS.chair_dance).toMatchObject({
      kind: 'accessibility',
      seatedOnly: true,
      protected: true,
    });
    expect(STYLE_DEFS.dancehall.protected).toBe(true);
    expect(STYLE_DEFS.reggae.protected).toBe(true);
    expect(isProtectedStyle('afrobeats')).toBe(false);
  });
  it('every offered style has at least one workout (a style cannot be offered without content)', () => {
    for (const s of DANCE_STYLES)
      expect(
        WORKOUTS.some((w) => w.style === s),
        s,
      ).toBe(true);
  });
});

describe('seated accessibility attribute', () => {
  it('chair dance is always seated; any other session is seated only when marked suitable', () => {
    expect(isSeatedSuitable({ style: 'chair_dance' })).toBe(true);
    expect(isSeatedSuitable({ style: 'afrobeats' })).toBe(false);
    expect(isSeatedSuitable({ style: 'afrobeats', seatedSuitable: true })).toBe(true);
    expect(isSeatedSuitable({ style: 'afrobeats', seatedSuitable: false })).toBe(false);
  });
  it('no genuine bundled session is claimed to be seated-suitable (that is a content claim for a reviewer)', () => {
    expect(WORKOUTS.some(isSeatedSuitable)).toBe(false);
  });
  it('a session marked suitable needs a seated version of every block; chair dance already is seated', () => {
    const bad = workout({ seatedSuitable: true });
    expect(workoutProblems(bad).join(' ')).toMatch(/seated version of every block/);
    const good = workout({
      seatedSuitable: true,
      blocks: [block('warmup', true), block('main', true), block('cooldown', true)],
    });
    expect(workoutProblems(good)).toEqual([]);
    expect(
      workoutProblems(
        workout({ style: 'chair_dance', tempoBpm: [70, 80], provenance: PROVENANCE }),
      ),
    ).toEqual([]);
    expect(
      workoutProblems(
        workout({
          style: 'chair_dance',
          seatedSuitable: false,
          tempoBpm: [70, 80],
          provenance: PROVENANCE,
        }),
      ).join(' '),
    ).toMatch(/always seated/);
  });
  it('the seated filter returns only suitable sessions', () => {
    enableInternalFixtures();
    const seated = filterWorkouts({ seatedOnly: true });
    expect(seated.length).toBeGreaterThan(0);
    expect(seated.every(isSeatedSuitable)).toBe(true);
    expect(seated.map((w) => w.id)).toEqual(
      expect.arrayContaining(['fixture-chair-dance-10', 'fixture-seated-suitable']),
    );
    expect(filterWorkouts({}).length).toBeGreaterThan(seated.length);
  });
  it('a seated preference picks a seated session when one exists, never relaxing the impact limit', () => {
    enableInternalFixtures();
    for (let seed = 0; seed < 8; seed++) {
      const w = suggestQuickFit({ minutes: 10, lowImpactOnly: true, seated: true, seed })!;
      expect(isSeatedSuitable(w)).toBe(true);
      expect(w.impact).toBe('low');
    }
  });
  it('with no seated sessions it falls back to low impact, and the engine says honestly that seated sessions are missing', () => {
    for (let seed = 0; seed < 8; seed++) {
      const w = suggestQuickFit({ minutes: 10, lowImpactOnly: true, seated: true, seed })!;
      expect(w.impact).toBe('low');
    }
    const o = resolvePathways({ prefs: parsePrefs({ mobility: ['seated'] }), readiness: 'clear' });
    expect(o.bias.workoutWhy).toMatch(/Seated sessions are not in the catalogue yet/);
    expect(o.pathways.find((p) => p.id === 'dance_aerobic')!.notes.join(' ')).toMatch(
      /seated are not in the catalogue yet/,
    );
  });
  it('once seated sessions exist the engine says they come first, and the plan offers one with a reason', () => {
    enableInternalFixtures();
    const o = resolvePathways({ prefs: parsePrefs({ mobility: ['seated'] }), readiness: 'clear' });
    expect(o.bias.workoutWhy).toMatch(/seated options, so sessions you can do seated come first/);
    expect(o.pathways.find((p) => p.id === 'dance_aerobic')!.actions.map((a) => a.text)).toContain(
      'Choose sessions you can do seated',
    );
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
    for (let seed = 0; seed < 6; seed++) {
      const item = generateDailyPlan({ ...base, seed, bias: o.bias }).items.find(
        (i) => i.ref?.workoutId,
      )!;
      const w = WORKOUT_BY_ID.get(item.ref!.workoutId!)!;
      expect(isSeatedSuitable(w)).toBe(true);
      expect(w.impact).toBe('low');
      expect(item.why).toMatch(/seated/);
    }
  });
  it('default users are unaffected: no seated preference means the same plan as before', () => {
    const neutral = resolvePathways({ prefs: parsePrefs({}), readiness: 'clear' }).bias;
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
      seed: 3,
    };
    expect(generateDailyPlan({ ...base, bias: neutral })).toEqual(generateDailyPlan(base));
  });
});

describe('seated cues in the session player', () => {
  const seatedWorkout = workout({
    seatedSuitable: true,
    blocks: [block('warmup', true), block('main', true), block('cooldown', true)],
  });
  it('builds the right cue for each mode and has no seated cue where the block has none', () => {
    const seg = sessionSegments(seatedWorkout, false, true)[0]!;
    expect(seg).toMatchObject({
      cue: 'seated text',
      cueSeated: 'seated text',
      cueLow: 'low impact text',
      cueNormal: 'cue text',
    });
    expect(sessionSegments(seatedWorkout, true, false)[0]!.cue).toBe('low impact text');
    expect(sessionSegments(seatedWorkout, false, false)[0]!.cue).toBe('cue text');
    const plain = sessionSegments(workout(), false, true)[0]!;
    expect(plain.cueSeated).toBeNull();
    expect(plain.cue).toBe('cue text');
    expect(sessionSegments(workout(), true, true)[0]!.cue).toBe('low impact text');
  });
  it('switching seated mid-session changes the cue without moving the clock, and survives a low-impact toggle', () => {
    let r = initRunner(seatedWorkout, false);
    r = runnerReduce(r, { type: 'begin', prepS: 0 });
    r = runnerReduce(r, { type: 'tick', seconds: 10 });
    const before = {
      index: r.session.index,
      remainingS: r.session.remainingS,
      elapsedS: r.session.elapsedS,
    };
    r = runnerReduce(r, { type: 'seated', value: true });
    expect(r.session.segments[0]!.cue).toBe('seated text');
    expect({
      index: r.session.index,
      remainingS: r.session.remainingS,
      elapsedS: r.session.elapsedS,
    }).toEqual(before);
    r = runnerReduce(r, { type: 'lowImpact', value: true });
    expect(r.session.segments[0]!.cue).toBe('seated text');
    r = runnerReduce(r, { type: 'seated', value: false });
    expect(r.session.segments[0]!.cue).toBe('low impact text');
    r = runnerReduce(r, { type: 'lowImpact', value: false });
    expect(r.session.segments[0]!.cue).toBe('cue text');
  });
  it('existing sessions are unchanged (no seated cue, same cues as before)', () => {
    for (const w of WORKOUTS) {
      const segs = sessionSegments(w, false);
      expect(segs.every((s) => s.cueSeated === null)).toBe(true);
      expect(segs.map((s) => s.cue)).toEqual(w.blocks.map((b) => b.cue));
    }
  });
});

describe('bundled-content gate', () => {
  it('passes for everything that ships today', () => {
    expect(bundledContentProblems()).toEqual([]);
  });
  it('nothing in a protected style, no fixture and no unreviewed strength content is in the bundle', () => {
    expect(WORKOUTS.filter((w) => isProtectedStyle(w.style))).toEqual([]);
    expect(WORKOUTS.filter((w) => w.fixture)).toEqual([]);
    expect(STRENGTH_WORKOUTS).toEqual([]);
    expect(STRENGTH_EXERCISES).toEqual([]);
    expect(CURATED_FOODS.filter((f) => f.provenance)).toEqual([]);
  });
  it.each(['dancehall', 'reggae', 'chair_dance'] as const)(
    '%s content without provenance is refused',
    (style) => {
      expect(workoutProblems(workout({ style })).join(' ')).toMatch(/needs provenance/);
      expect(bundledContentProblems({ workouts: [workout({ style })] }).length).toBeGreaterThan(0);
    },
  );
  it('fully documented Dancehall content passes, and each missing element is named', () => {
    const ok = workout({ style: 'dancehall', tempoBpm: [90, 100], provenance: PROVENANCE });
    expect(workoutProblems(ok)).toEqual([]);
    const cases: Array<[string, Partial<WorkoutDef>, RegExp]> = [
      ['no credits', { provenance: { ...PROVENANCE, credits: [] } }, /credited author/],
      ['no rights', { provenance: { ...PROVENANCE, rightsRef: '' } }, /rights reference/],
      [
        'unapproved',
        { provenance: { ...PROVENANCE, review: { ...REVIEW, status: 'in_review' } } },
        /not approved/,
      ],
      [
        'author reviewed',
        { provenance: { ...PROVENANCE, review: { ...REVIEW, isAuthor: true } } },
        /independent/,
      ],
      [
        'author unknown',
        { provenance: { ...PROVENANCE, review: { ...REVIEW, isAuthor: undefined } } },
        /independent/,
      ],
      [
        'wrong reviewer role',
        { provenance: { ...PROVENANCE, review: { ...REVIEW, reviewerRole: 'cultural_reviewer' } } },
        /exercise professional/,
      ],
      [
        'no review record',
        { provenance: { ...PROVENANCE, review: { ...REVIEW, evidenceRef: '' } } },
        /record incomplete/,
      ],
      [
        'no cultural review',
        { provenance: { ...PROVENANCE, culturalReviewRef: undefined } },
        /cultural review/,
      ],
      ['no tempo', { tempoBpm: undefined }, /tempo range/],
      ['bad tempo', { tempoBpm: [100, 90] }, /tempo range must be/],
      ['no safety', { safety: [] }, /no safety notes/],
      [
        'no low-impact version',
        { blocks: [block('warmup'), { ...block('main'), lowImpactAlt: '' }, block('cooldown')] },
        /low-impact version/,
      ],
      ['no cool-down', { blocks: [block('warmup'), block('main')] }, /no cool-down/],
    ];
    for (const [name, over, re] of cases)
      expect(workoutProblems({ ...ok, ...over }).join(' '), name).toMatch(re);
  });
  it('reggae needs the cultural review too; chair dance does not (it is an accessibility style) but needs everything else', () => {
    const reggae = workout({
      style: 'reggae',
      tempoBpm: [70, 80],
      provenance: { ...PROVENANCE, culturalReviewRef: undefined },
    });
    expect(workoutProblems(reggae).join(' ')).toMatch(/cultural review/);
    const chair = workout({
      style: 'chair_dance',
      tempoBpm: [70, 80],
      provenance: { ...PROVENANCE, culturalReviewRef: undefined },
    });
    expect(workoutProblems(chair)).toEqual([]);
  });
  it('sample content in unprotected styles still passes as it does today', () => {
    expect(workoutProblems(workout({ style: 'latin' }))).toEqual([]);
  });
  it('fixtures are judged separately: they need the label, cannot carry provenance, and are never allowed in the bundle', () => {
    for (const f of FIXTURE_WORKOUTS) expect(workoutProblems(f), f.id).toEqual([]);
    expect(
      workoutProblems({ ...FIXTURE_WORKOUTS[0]!, title: 'Dancehall session' }).join(' '),
    ).toMatch(/Internal fixture/);
    expect(workoutProblems({ ...FIXTURE_WORKOUTS[0]!, provenance: PROVENANCE }).join(' ')).toMatch(
      /must not carry provenance/,
    );
    expect(bundledContentProblems({ workouts: [FIXTURE_WORKOUTS[0]!] }).join(' ')).toMatch(
      /fixture is in the bundle/,
    );
    expect(
      bundledContentProblems({ strengthWorkouts: FIXTURE_STRENGTH_WORKOUTS as never }).join(' '),
    ).toMatch(/fixture is in the bundle/);
  });
  it('unreviewed real strength content is refused with the plain reasons', () => {
    const w = { ...FIXTURE_STRENGTH_WORKOUTS[0]!, fixture: undefined };
    const out = bundledContentProblems({ strengthWorkouts: [w], strengthExercises: [] });
    expect(out.join(' ')).toMatch(/does not exist|not been approved/);
  });
  it('fixtures contain no real content: placeholder text only, no tempo, no provenance, no review', () => {
    for (const w of FIXTURE_WORKOUTS) {
      expect(w.tempoBpm).toBeUndefined();
      expect(w.provenance).toBeUndefined();
      expect(w.title.startsWith('[Internal fixture]')).toBe(true);
      expect(JSON.stringify(w.blocks)).toMatch(/\[Fixture\]/);
    }
    for (const w of FIXTURE_STRENGTH_WORKOUTS) expect(w.review).toBe('unreviewed');
  });
});

describe('internal fixtures switch', () => {
  it('are off by default, add the pending styles when enabled, and leave nothing behind when disabled', () => {
    const before = {
      w: WORKOUTS.length,
      s: [...DANCE_STYLES],
      se: STRENGTH_EXERCISES.length,
      sw: STRENGTH_WORKOUTS.length,
    };
    enableInternalFixtures();
    enableInternalFixtures(); // idempotent
    expect(WORKOUTS.length).toBe(before.w + FIXTURE_WORKOUTS.length);
    for (const s of PENDING_STYLES) expect(DANCE_STYLES).toContain(s);
    for (const s of PENDING_STYLES)
      expect(WORKOUTS.some((w) => w.style === s && w.fixture)).toBe(true);
    disableInternalFixtures();
    expect(WORKOUTS.length).toBe(before.w);
    expect([...DANCE_STYLES]).toEqual(before.s);
    expect(STRENGTH_EXERCISES.length).toBe(before.se);
    expect(STRENGTH_WORKOUTS.length).toBe(before.sw);
    expect(bundledContentProblems()).toEqual([]);
  });
  it('a Dancehall preference uses the fixture only while fixtures are on, and says so honestly otherwise', () => {
    const off = resolvePathways({
      prefs: parsePrefs({ danceStyles: ['dancehall'] }),
      readiness: 'clear',
    });
    expect(off.bias.styles).toEqual([]);
    expect(off.bias.workoutWhy).toMatch(/Dancehall sessions are not in the catalogue yet/);
    enableInternalFixtures();
    const on = resolvePathways({
      prefs: parsePrefs({ danceStyles: ['dancehall'] }),
      readiness: 'clear',
    });
    expect(on.bias.styles).toEqual(['dancehall']);
  });
});

describe('next-level suggestion', () => {
  const NOW = new Date('2026-06-29T12:00:00Z');
  const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
  const beginnerIds = WORKOUTS.filter((w) => w.level === 'beginner').map((w) => w.id);
  const intermediateIds = WORKOUTS.filter((w) => w.level === 'intermediate').map((w) => w.id);
  const sess = (
    workoutId: string,
    daysAgo: number,
    ex: number | null = null,
  ): ProgressionSession => ({
    workoutId,
    status: 'completed',
    completedAt: day(daysAgo),
    perceivedExertion: ex,
  });
  const run = (sessions: ProgressionSession[], keepLowImpact = false) =>
    levelSuggestion({ sessions, now: NOW, timeZone: 'UTC', keepLowImpact });
  const steady = Array.from({ length: PROGRESSION_RULES.minSessions }, (_, i) =>
    sess(beginnerIds[i % beginnerIds.length]!, 2 + i * 4),
  );

  it('suggests nothing to someone with no history, few sessions, or an old burst', () => {
    expect(run([]).direction).toBeNull();
    expect(run(steady.slice(0, 3)).direction).toBeNull();
    const burst = Array.from({ length: 8 }, (_, i) => sess(beginnerIds[0]!, 1 + (i % 2)));
    expect(run(burst).direction).toBeNull(); // not spread over several weeks
    const old = steady.map((s, i) => sess(s.workoutId!, 60 + i));
    expect(run(old).direction).toBeNull();
  });
  it('offers the next level, as an option, after steady sessions that felt manageable', () => {
    const r = run(steady.map((s) => ({ ...s, perceivedExertion: 5 })));
    expect(r).toMatchObject({
      direction: 'up',
      from: 'beginner',
      to: 'intermediate',
      provisional: true,
    });
    expect(r.reasons.join(' ')).toMatch(/manageable/);
    expect(r.note).toMatch(/Staying where you are is just as good/);
    expect(run(steady).direction).toBe('up'); // no ratings: steady is enough
  });
  it('does not push when sessions felt very hard, or when the person is already trying the next level', () => {
    expect(
      run(steady.map((s, i) => ({ ...s, perceivedExertion: i === 0 ? 9 : 4 }))).direction,
    ).not.toBe('up');
    expect(run(steady.map((s) => ({ ...s, perceivedExertion: 8 }))).direction).not.toBe('up');
    const trying = [...steady, sess(intermediateIds[0]!, 1), sess(intermediateIds[1]!, 3)];
    expect(run(trying).direction).not.toBe('up');
  });
  it('offers something gentler, kindly, when two of the last three felt very hard', () => {
    const hard = [
      sess(intermediateIds[0]!, 9, 4),
      sess(intermediateIds[0]!, 6, 9),
      sess(intermediateIds[1]!, 3, 8),
      sess(intermediateIds[1]!, 1, 9),
    ];
    const r = run(hard);
    expect(r.direction).toBe('easier');
    expect(r.to).toBe('beginner');
    expect(r.reasons.join(' ')).toMatch(/felt very hard/);
    expect(r.note).toMatch(/just as good/);
  });
  it('never suggests above the top level or below the bottom, ignores skipped and unknown sessions, and keeps low impact when asked', () => {
    const advancedIds = WORKOUTS.filter((w) => w.level === 'advanced').map((w) => w.id);
    const top = Array.from({ length: 8 }, (_, i) =>
      sess(advancedIds[i % advancedIds.length]!, 1 + i * 3),
    );
    expect(run(top).direction).toBeNull();
    const skipped = steady.map((s) => ({ ...s, status: 'skipped' as const }));
    expect(run(skipped).direction).toBeNull();
    expect(run(steady.map((s) => ({ ...s, workoutId: 'does-not-exist' }))).direction).toBeNull();
    expect(run(steady, true).keepLowImpact).toBe(true);
  });
  it('is deterministic and its wording passes the language rules', () => {
    expect(run(steady)).toEqual(run(steady));
    const text = JSON.stringify(run(steady));
    expect(text).not.toMatch(/burn|earn|cheat|fail|lazy|behind|score|rank|beat/i);
  });
});

describe('cuisine taxonomy', () => {
  it('has the priority cuisines first: Jamaican, Caribbean, West, East and Southern African', () => {
    expect(CUISINE_IDS.slice(0, 5)).toEqual([
      'jamaican',
      'caribbean',
      'west_african',
      'east_african',
      'southern_african',
    ]);
    expect(CUISINE_IDS.filter((c) => CUISINES[c].priority === 1)).toEqual(CUISINE_IDS.slice(0, 5));
    for (const id of CUISINE_IDS) expect(CUISINES[id].id).toBe(id);
    expect(CUISINES.jamaican.parent).toBe('caribbean');
  });
  it('matches parents and children, with an exact match ranked above a related one', () => {
    expect(matchTags('jamaican')).toEqual(['jamaican', 'caribbean']);
    expect(matchTags('caribbean')).toEqual(['caribbean', 'jamaican']);
    expect(matchTags('west_african')).toEqual(['west_african']);
    expect(regionTagsFor(['jamaican', 'east_african', 'nonsense'])).toEqual([
      'jamaican',
      'caribbean',
      'east_african',
    ]);
    expect(cuisineFit(['jamaican'], 'jamaican')).toBe(2);
    expect(cuisineFit(['caribbean'], 'jamaican')).toBe(1);
    expect(cuisineFit(['jamaican'], 'caribbean')).toBe(1);
    expect(cuisineFit(['west_african'], 'jamaican')).toBe(0);
    expect(bestCuisineFit(['caribbean'], ['west_african', 'jamaican'])).toBe(1);
  });
  it('every food region tag in the reference data is a known cuisine or one of the two non-cuisine tags', () => {
    for (const f of CURATED_FOODS)
      for (const t of f.regionTags)
        expect(['global', 'american', ...CUISINE_IDS], `${f.id}: ${t}`).toContain(t);
  });
  it('preferences accept the new cuisines, keep stored order canonical, and drop unknown ones', () => {
    expect(
      parsePrefs({ cuisines: ['southern_african', 'jamaican', 'martian', 'east_african'] })
        .cuisines,
    ).toEqual(['jamaican', 'east_african', 'southern_african']);
    expect(parsePrefs({ cuisines: ['west_african', 'caribbean'] }).cuisines).toEqual([
      'caribbean',
      'west_african',
    ]);
  });
  it('the engine counts coverage honestly: East and Southern African have no examples yet, Jamaican counts Caribbean-tagged foods', () => {
    const o = resolvePathways({
      prefs: parsePrefs({
        pathways: ['cultural_eating'],
        cuisines: ['jamaican', 'east_african', 'southern_african', 'west_african'],
      }),
      readiness: 'clear',
    });
    const notes = o.pathways[0]!.notes.join(' ');
    expect(notes).toMatch(/only 0 East African examples/);
    expect(notes).toMatch(/only 0 Southern African examples/);
    expect(notes).not.toMatch(/West African examples so far/);
    expect(notes).not.toMatch(/Jamaican examples so far/); // Caribbean-tagged foods count toward Jamaican
    expect(o.pathways[0]!.actions[0]!.text).toMatch(
      /Jamaican, West African, East African and Southern African foods/,
    );
  });
  it('meal plans prefer foods tagged for the chosen cuisine, including its related tags', () => {
    const plan = (tags: string[]) =>
      planMeals({
        days: 3,
        targetKcal: 2000,
        floorKcal: 1400,
        budgetLevel: 'medium',
        regions: tags,
        seed: 1,
      });
    const names = (p: ReturnType<typeof plan>) =>
      p.days.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.foodId)));
    const jam = names(plan(regionTagsFor(['jamaican'])));
    const caribbeanFoods = new Set(
      CURATED_FOODS.filter((f) => f.regionTags.includes('caribbean')).map((f) => f.id),
    );
    expect(jam.some((id) => id && caribbeanFoods.has(id))).toBe(true);
  });
});

describe('food provenance validation', () => {
  it('shipped synthetic foods have no provenance and pass the basic checks', () => {
    for (const f of CURATED_FOODS) expect(foodProblems(f), f.id).toEqual([]);
    expect(CURATED_FOODS.some(isReviewedFood)).toBe(false);
  });
  it('a food with complete provenance and plausible values is accepted', () => {
    expect(foodProblems(TEST_FOOD)).toEqual([]);
    expect(isReviewedFood(TEST_FOOD)).toBe(true);
  });
  it('every missing element is named, and priority cuisines need a cultural review', () => {
    const p = TEST_FOOD.provenance!;
    const cases: Array<[string, Partial<typeof p>, RegExp]> = [
      ['unknown source', { sourceId: 'made_up' as never }, /unknown source/],
      ['no source food id', { sourceFoodId: '' }, /source food identifier/],
      ['no edition', { sourceVersion: '' }, /source edition/],
      ['bad date', { retrievedOn: 'last week' }, /YYYY-MM-DD/],
      ['no attribution', { attribution: '' }, /no attribution/],
      ['no licence confirmation', { licenceRef: '' }, /licence confirmation/],
      ['no dietitian review', { reviewRef: '' }, /dietitian review/],
      ['no cultural review', { culturalReviewRef: undefined }, /cultural review/],
    ];
    for (const [name, over, re] of cases)
      expect(foodProblems({ ...TEST_FOOD, provenance: { ...p, ...over } }).join(' '), name).toMatch(
        re,
      );
    // A non-priority cuisine does not need the cultural review.
    expect(
      foodProblems({
        ...TEST_FOOD,
        regionTags: ['mediterranean'],
        provenance: { ...p, culturalReviewRef: undefined },
      }),
    ).toEqual([]);
    expect(foodProblems({ ...TEST_FOOD, regionTags: ['nowhere'] }).join(' ')).toMatch(
      /unknown region tag/,
    );
  });
  it('catches impossible or mistyped values: out of range, macros over 100 g, and energy that does not match the macros', () => {
    const f = (per: Partial<FoodRef['per100g']>) => ({
      ...TEST_FOOD,
      per100g: { ...TEST_FOOD.per100g, ...per },
    });
    expect(foodProblems(f({ kcal: 1200 })).join(' ')).toMatch(/energy out of range/);
    expect(foodProblems(f({ proteinG: 120 })).join(' ')).toMatch(/protein out of range/);
    expect(foodProblems(f({ proteinG: 60, carbsG: 30, fatG: 20 })).join(' ')).toMatch(
      /exceed 100 g/,
    );
    expect(foodProblems(f({ kcal: 450 })).join(' ')).toMatch(/energy does not match/); // a typo for 145
    expect(foodProblems({ ...TEST_FOOD, servingG: 0 }).join(' ')).toMatch(/serving/);
    expect(foodProblems({ ...TEST_FOOD, id: 'Bad Id!' }).join(' ')).toMatch(/kebab-case/);
  });
  it('the energy check allows rounding and different published energy factors, and zero-energy foods', () => {
    expect(atwaterKcal({ proteinG: 5, carbsG: 15, fatG: 2 })).toBe(98);
    expect(energyIsPlausible({ kcal: 98, proteinG: 5, carbsG: 15, fatG: 2 })).toBe(true);
    expect(energyIsPlausible({ kcal: 110, proteinG: 5, carbsG: 15, fatG: 2 })).toBe(true);
    expect(energyIsPlausible({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toBe(true);
    expect(energyIsPlausible({ kcal: 300, proteinG: 5, carbsG: 15, fatG: 2 })).toBe(false);
  });
  it('lists candidate published sources only: each must be confirmed by a reviewer, and none carries values', () => {
    for (const s of Object.values(FOOD_SOURCES)) {
      expect(s.title.length).toBeGreaterThan(5);
      expect(JSON.stringify(s)).not.toMatch(/kcal|\d+\s?g\b/);
    }
    expect(FOOD_SOURCES.usda_fdc.note).toMatch(/confirms/);
  });
});

describe('strength pipeline', () => {
  const w = FIXTURE_STRENGTH_WORKOUTS[0]!;
  it('shows no guided strength content unless fixtures are on: real content must pass the review gate', () => {
    expect(activeStrengthWorkouts()).toEqual([]);
    enableInternalFixtures();
    expect(activeStrengthWorkouts().map((x) => x.id)).toEqual(['fixture-strength-bodyweight']);
    expect(activeStrengthWorkouts().every((x) => x.fixture)).toBe(true);
  });
  it('an unreviewed non-fixture workout is never active, even with fixtures on', () => {
    enableInternalFixtures();
    const real = { ...w, id: 'real-unreviewed', fixture: undefined };
    expect(
      activeStrengthWorkouts(
        [real],
        [...(FIXTURE_STRENGTH_WORKOUTS.length ? STRENGTH_EXERCISES : [])],
      ),
    ).toEqual([]);
  });
  it('builds warm-up, every set, rests between sets (none after the last), and a cool-down', () => {
    enableInternalFixtures();
    const segs = strengthSegments(w);
    const kinds = segs.map((s) => s.kind);
    expect(kinds[0]).toBe('warmup');
    expect(kinds[kinds.length - 1]).toBe('cooldown');
    const sets = segs.filter((s) => s.kind === 'main');
    expect(sets).toHaveLength(w.blocks.reduce((n, b) => n + b.sets, 0));
    expect(segs.filter((s) => s.kind === 'rest')).toHaveLength(sets.length - 1);
    expect(kinds[kinds.length - 2]).toBe('main'); // no rest straight before the cool-down
    expect(segs.map((s) => s.index)).toEqual(segs.map((_, i) => i));
    expect(sets[0]).toMatchObject({ setNumber: 1, setsTotal: 3, reps: 8, manual: true });
    expect(sets[3]).toMatchObject({
      setNumber: 1,
      setsTotal: 2,
      reps: null,
      seconds: 30,
    });
    expect(sets[3]!.manual).toBeFalsy();
    expect(segs.filter((s) => s.kind === 'rest').map((s) => s.seconds)).toEqual([
      45, 45, 45, 30, 30, 30,
    ]);
    expect(sets[0]!.cueLow).toMatch(/^Easier version:/);
  });
  it('a counted set waits for Done: time passing never ends it, and elapsed time still counts', () => {
    enableInternalFixtures();
    let r = initRunnerFromSegments(w.id, strengthSegments(w), false);
    r = runnerReduce(r, { type: 'begin', prepS: 0 });
    r = runnerReduce(r, { type: 'tick', seconds: 60 }); // warm-up ends
    expect(r.session.segments[r.session.index]!.kind).toBe('main');
    const idx = r.session.index;
    r = runnerReduce(r, { type: 'tick', seconds: 120 });
    expect(r.session.index).toBe(idx);
    expect(r.session.status).toBe('running');
    expect(r.session.elapsedS).toBe(180);
    r = runnerReduce(r, { type: 'done' });
    expect(r.session.index).toBe(idx + 1);
    expect(r.session.segments[r.session.index]!.kind).toBe('rest');
    expect(r.session.skippedS).toBe(0); // finishing a set is not skipping
  });
  it('Done does nothing on a timed segment, and skipping a counted set records no skipped time', () => {
    enableInternalFixtures();
    let r = initRunnerFromSegments(w.id, strengthSegments(w), false);
    r = runnerReduce(r, { type: 'begin', prepS: 0 });
    const before = r.session.index;
    r = runnerReduce(r, { type: 'done' }); // warm-up is timed
    expect(r.session.index).toBe(before);
    r = runnerReduce(r, { type: 'tick', seconds: 60 });
    r = runnerReduce(r, { type: 'skip' });
    expect(r.session.skippedS).toBe(0);
  });
  it('runs a whole workout to completion and reports a recordable completion', () => {
    enableInternalFixtures();
    let r = initRunnerFromSegments(w.id, strengthSegments(w), false);
    r = runnerReduce(r, { type: 'begin', prepS: 0 });
    for (let i = 0; i < 200 && r.session.status !== 'finished'; i++) {
      const seg = r.session.segments[r.session.index]!;
      r = runnerReduce(r, seg.manual ? { type: 'done' } : { type: 'tick', seconds: seg.seconds });
    }
    const c = completionSummary(r);
    expect(r.session.status).toBe('finished');
    expect(c.finishedNaturally).toBe(true);
    expect(c.segmentsCompleted).toBe(c.segmentsTotal);
    expect(c.recordable).toBe(true);
  });
  it('the easier version switches in place without moving the clock', () => {
    enableInternalFixtures();
    let r = initRunnerFromSegments(w.id, strengthSegments(w), false);
    r = runnerReduce(r, { type: 'begin', prepS: 0 });
    r = runnerReduce(r, { type: 'tick', seconds: 60 });
    const pos = { i: r.session.index, e: r.session.elapsedS };
    r = runnerReduce(r, { type: 'lowImpact', value: true });
    expect(r.session.segments[r.session.index]!.cue).toMatch(/^Easier version:/);
    expect({ i: r.session.index, e: r.session.elapsedS }).toEqual(pos);
  });
  it('is stored with the existing strength entry labels, and counts toward the existing movement model', () => {
    expect(strengthEntryLabel({ equipment: 'none' })).toBe('bodyweight');
    expect(strengthEntryLabel({ equipment: 'dumbbells' })).toBe('dumbbells');
    expect(strengthEntryLabel({ equipment: 'bands' })).toBe('bands');
  });
});

describe('fixtures never leak into generic suggestions', () => {
  it('Quick Fit and mood picks never choose a fixture unless that style or seated sessions were asked for', () => {
    enableInternalFixtures();
    for (let seed = 0; seed < 12; seed++)
      for (const minutes of [5, 10, 15] as const) {
        expect(suggestQuickFit({ minutes, seed })?.fixture).toBeUndefined();
        expect(suggestQuickFit({ minutes, lowImpactOnly: true, seed })?.fixture).toBeUndefined();
      }
    for (const mood of ['energized', 'tired', 'stressed', 'happy', 'motivation'] as const)
      for (const pick of recommendByMood(mood, { seed: 1 }))
        expect(pick.workout.fixture).toBeUndefined();
    expect(suggestQuickFit({ minutes: 10, style: 'dancehall' })?.fixture).toBe(true);
    expect(suggestQuickFit({ minutes: 10, seated: true, lowImpactOnly: true })?.fixture).toBe(true);
    // The browse list shows them (labelled), so they can be tested.
    expect(filterWorkouts({ styles: ['reggae'] }).map((w) => w.id)).toEqual([
      'fixture-reggae-flow',
    ]);
  });
});
