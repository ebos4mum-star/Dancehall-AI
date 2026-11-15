import { afterEach, describe, expect, it } from 'vitest';
import {
  EXERCISE_DEMOS,
  HOME_EXERCISES,
  HOME_ITEMS,
  HOME_ITEM_IDS,
  HOME_LEVELS,
  HOME_MINUTES,
  STRENGTH_EXERCISES,
  UNSAFE_IMPROVISED,
  buildHomeWorkout,
  bundledContentProblems,
  decodeHomeId,
  disableInternalFixtures,
  enableInternalFixtures,
  encodeHomeId,
  homeExerciseProblems,
  homePool,
  homeWorkoutsAvailable,
  isEligible,
  isHomeId,
  makeRequest,
  parsePrefs,
  requestFromPrefs,
  resolveExerciseDemo,
  resolvePathways,
  runnerReduce,
  initRunnerFromSegments,
  safeSubstitutes,
  strengthSegments,
  whyNot,
  type HomeItemId,
  type HomeRequest,
  type Licence,
} from './index';

afterEach(() => disableInternalFixtures());

const subsets = <T>(xs: readonly T[]): T[][] =>
  xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);

describe('household items and exercises', () => {
  it('supports the requested items, each with safety checks, plus a list of things never to use', () => {
    expect([...HOME_ITEM_IDS].sort()).toEqual(
      ['backpack', 'chair', 'stairs', 'towel', 'wall', 'water_bottles'].sort(),
    );
    for (const id of HOME_ITEM_IDS) {
      expect(HOME_ITEMS[id].checks.length, id).toBeGreaterThanOrEqual(2);
      expect(HOME_ITEMS[id].hint.length).toBeGreaterThan(5);
    }
    expect(HOME_ITEMS.chair.checks.join(' ')).toMatch(/never stand on it/);
    expect(HOME_ITEMS.water_bottles.checks.join(' ')).toMatch(/never glass/);
    expect(HOME_ITEMS.water_bottles.checks.join(' ')).toMatch(/two-litre/);
    expect(HOME_ITEMS.backpack.checks.join(' ')).toMatch(/soft items/);
    expect(HOME_ITEMS.stairs.checks.join(' ')).toMatch(/handrail/);
    expect(HOME_ITEMS.towel.checks.join(' ')).toMatch(/Never tie or anchor/);
    expect(UNSAFE_IMPROVISED.join(' ')).toMatch(/stools/);
  });

  it('every exercise follows the safety rules and is an unreviewed draft', () => {
    for (const e of HOME_EXERCISES) {
      expect(homeExerciseProblems(e), e.id).toEqual([]);
      expect(e.draft?.needs.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.review).toBe('unreviewed');
      expect(e.reviewer).toBeNull();
    }
    expect(new Set(HOME_EXERCISES.map((e) => e.id)).size).toBe(HOME_EXERCISES.length);
  });

  it('covers every item, every level, and the seated pool has a push, a pull and a core exercise', () => {
    for (const i of HOME_ITEM_IDS)
      expect(
        HOME_EXERCISES.some((e) => e.household?.includes(i)),
        i,
      ).toBe(true);
    for (const l of HOME_LEVELS) expect(HOME_EXERCISES.some((e) => e.level === l)).toBe(true);
    expect(HOME_EXERCISES.some((e) => e.household?.length === 0)).toBe(true);
    const seated = HOME_EXERCISES.filter((e) => e.seated);
    for (const pat of ['push', 'pull', 'core', 'squat'])
      expect(
        seated.some((e) => e.pattern === pat),
        pat,
      ).toBe(true);
  });

  it('never has anything stood on, anchored, jumped or carried on stairs, and gives bottles and bags a load note', () => {
    for (const e of HOME_EXERCISES) {
      const text = [...e.cues, e.regression, e.progression ?? ''].join(' ');
      expect(text, e.id).not.toMatch(/\b(stand on|stool|table|sofa|dips?|jump|hop|anchor)\b/i);
      if (e.household?.some((i) => i === 'water_bottles' || i === 'backpack'))
        expect(e.loadNote, e.id).toBeTruthy();
      if (e.household?.includes('stairs'))
        expect(
          e.household.some((i) => i === 'water_bottles' || i === 'backpack'),
          e.id,
        ).toBe(false);
    }
    expect(
      HOME_EXERCISES.filter((e) => e.household?.includes('backpack')).every((e) =>
        /soft/.test(e.loadNote ?? ''),
      ),
    ).toBe(true);
  });

  it('the safety rules catch an unsafe exercise', () => {
    const bad = {
      ...HOME_EXERCISES.find((e) => e.household?.includes('chair'))!,
      id: 'bad-dip',
      cues: ['Do dips off the chair.'],
    };
    expect(homeExerciseProblems(bad).join(' ')).toMatch(/dips/);
    const heavy = {
      ...HOME_EXERCISES.find((e) => e.household?.includes('stairs'))!,
      id: 'bad-stairs',
      household: ['stairs', 'water_bottles'] as HomeItemId[],
    };
    expect(homeExerciseProblems(heavy).join(' ')).toMatch(/never carry a load on the stairs/);
    const noNote = {
      ...HOME_EXERCISES.find((e) => e.household?.includes('backpack'))!,
      id: 'bad-bag',
      loadNote: undefined,
    };
    expect(homeExerciseProblems(noNote).join(' ')).toMatch(/load note/);
  });
});

describe('visibility', () => {
  it('is hidden in a normal build and the gate rejects the drafts if they ever ship', () => {
    expect(STRENGTH_EXERCISES.some((e) => e.household)).toBe(false);
    expect(homePool()).toEqual([]);
    expect(homeWorkoutsAvailable()).toBe(false);
    expect(buildHomeWorkout({ items: ['chair'] }).ok).toBe(false);
    expect(bundledContentProblems()).toEqual([]);
    const problems = bundledContentProblems({ strengthExercises: [...HOME_EXERCISES] });
    expect(problems.filter((p) => /unreviewed draft is in the bundle/.test(p))).toHaveLength(
      HOME_EXERCISES.length,
    );
  });

  it('appears only with the preview switch, and leaves nothing behind', () => {
    enableInternalFixtures();
    expect(homeWorkoutsAvailable()).toBe(true);
    expect(homePool().length).toBe(HOME_EXERCISES.length);
    disableInternalFixtures();
    expect(STRENGTH_EXERCISES.some((e) => e.household)).toBe(false);
    expect(homeWorkoutsAvailable()).toBe(false);
  });
});

describe('matching', () => {
  const build = (r: Partial<HomeRequest>) => {
    const res = buildHomeWorkout(r);
    if (!res.ok) throw new Error(res.reason);
    return res.build;
  };

  it('with no items it builds from bodyweight exercises only', () => {
    enableInternalFixtures();
    const b = build({ items: [], level: 'intermediate' });
    expect(b.exercises.length).toBeGreaterThanOrEqual(3);
    for (const e of b.exercises) expect(e.household).toEqual([]);
    expect(b.itemsUsed).toEqual([]);
    expect(b.checks).toEqual([]);
  });

  it('never uses an item the person did not choose, across every combination of items, level, seated, balance and length', () => {
    enableInternalFixtures();
    let built = 0;
    for (const items of subsets(HOME_ITEM_IDS))
      for (const level of HOME_LEVELS)
        for (const seated of [false, true])
          for (const balanceSupport of [false, true])
            for (const minutes of HOME_MINUTES) {
              const req = makeRequest({ items, level, seated, balanceSupport, minutes });
              const res = buildHomeWorkout(req);
              if (!res.ok) continue;
              built++;
              const allowed = new Set<string>([...items, ...(seated ? ['chair'] : [])]);
              for (const e of res.build.exercises) {
                expect(
                  e.household!.every((i) => allowed.has(i)),
                  `${e.id} for ${encodeHomeId(req)}`,
                ).toBe(true);
                expect(whyNot(e, req)).toBeNull();
                if (seated) expect(e.seated).toBe(true);
                if (balanceSupport) expect(e.needsBalance).toBeFalsy();
                expect(HOME_LEVELS.indexOf(e.level!)).toBeLessThanOrEqual(
                  HOME_LEVELS.indexOf(level),
                );
              }
              expect(res.build.workout.blocks.every((b) => b.sets === req.sets)).toBe(true);
              expect(new Set(res.build.exercises.map((e) => e.id)).size).toBe(
                res.build.exercises.length,
              );
              // The checks cover exactly the items the session uses.
              for (const i of res.build.itemsUsed)
                for (const c of HOME_ITEMS[i].checks) expect(res.build.checks).toContain(c);
              if (res.build.itemsUsed.length > 0)
                expect(res.build.workout.safety.join(' ')).toMatch(/Check your equipment/);
            }
    expect(built).toBeGreaterThan(300);
  });

  it('a seated session counts the chair as the seat and uses only seated exercises', () => {
    enableInternalFixtures();
    const b = build({ items: [], seated: true });
    expect(b.exercises.length).toBeGreaterThanOrEqual(2);
    expect(b.exercises.every((e) => e.seated)).toBe(true);
    expect(b.workout.warmup.cue).toMatch(/Sit tall/);
    expect(b.workout.cooldown.cue).toMatch(/Stay seated/);
  });

  it('balance support removes exercises that need standing balance, and stairs only appear when chosen', () => {
    enableInternalFixtures();
    const withStairs = build({ items: ['stairs'], level: 'advanced', minutes: 20 });
    expect(withStairs.itemsUsed).toContain('stairs');
    const supported = build({
      items: ['stairs', 'chair'],
      level: 'advanced',
      minutes: 20,
      balanceSupport: true,
    });
    expect(supported.exercises.some((e) => e.needsBalance)).toBe(false);
    expect(build({ items: ['chair'], level: 'advanced' }).itemsUsed).not.toContain('stairs');
  });

  it('matches the level: beginners never get harder exercises, and advanced people get the harder ones their items allow', () => {
    enableInternalFixtures();
    const beginner = build({
      items: ['chair', 'wall', 'water_bottles', 'backpack', 'towel', 'stairs'],
      level: 'beginner',
      minutes: 20,
    });
    expect(beginner.exercises.every((e) => e.level === 'beginner')).toBe(true);
    const advanced = build({
      items: ['chair', 'wall', 'backpack'],
      level: 'advanced',
      minutes: 15,
    });
    expect(advanced.exercises.some((e) => e.level === 'advanced')).toBe(true);
    expect(build({ items: [], level: 'beginner' }).workout.blocks[0]!.reps).toBe(8);
    expect(build({ items: [], level: 'advanced' }).workout.blocks.find((b) => b.reps)?.reps).toBe(
      12,
    );
  });

  it('gives sets, repetitions, holds and rest, and longer sessions have more exercises', () => {
    enableInternalFixtures();
    const short = build({ items: ['chair', 'wall'], minutes: 10 });
    const long = build({ items: ['chair', 'wall'], level: 'intermediate', minutes: 20 });
    expect(long.exercises.length).toBeGreaterThan(short.exercises.length);
    for (const b of long.workout.blocks) {
      expect((b.reps === null) !== (b.seconds === null)).toBe(true);
      expect(b.restSeconds).toBeGreaterThanOrEqual(30);
      expect(b.sets).toBeGreaterThanOrEqual(2);
      expect(b.sets).toBeLessThanOrEqual(3);
    }
    expect(
      build({ items: [], level: 'beginner', minutes: 20 }).workout.blocks.some(
        (b) => b.seconds !== null,
      ),
    ).toBe(true);
  });

  it('explains plainly when nothing can be built', () => {
    enableInternalFixtures();
    const none = buildHomeWorkout({
      items: ['towel'],
      seated: false,
      level: 'beginner',
      exclude: HOME_EXERCISES.map((e) => e.id),
    });
    expect(none).toMatchObject({ ok: false });
    expect((none as { reason: string }).reason).toMatch(/Nothing suitable/);
  });
});

describe('safer substitutions', () => {
  it('only offers substitutes that fit the items and are never harder', () => {
    enableInternalFixtures();
    const req = makeRequest({
      items: ['chair', 'wall', 'water_bottles', 'backpack', 'stairs'],
      level: 'advanced',
    });
    for (const e of homePool()) {
      for (const s of safeSubstitutes(e, req)) {
        expect(s.pattern).toBe(e.pattern);
        expect(s.id).not.toBe(e.id);
        expect(HOME_LEVELS.indexOf(s.level!)).toBeLessThanOrEqual(HOME_LEVELS.indexOf(e.level!));
        expect(isEligible(s, req)).toBe(true);
      }
    }
  });

  it('prefers seated and easier ones, respects missing items, and a swapped exercise is not rebuilt', () => {
    enableInternalFixtures();
    const stepUp = HOME_EXERCISES.find((e) => e.id === 'home-step-up')!;
    const subs = safeSubstitutes(
      stepUp,
      makeRequest({ items: ['stairs', 'chair'], level: 'intermediate' }),
    );
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.some((s) => s.household?.some((i) => !['stairs', 'chair'].includes(i)))).toBe(
      false,
    );
    const none = safeSubstitutes(
      stepUp,
      makeRequest({ items: ['stairs'], level: 'intermediate', balanceSupport: true }),
    );
    expect(none.every((s) => !s.needsBalance)).toBe(true);
    const r = makeRequest({ items: ['chair'], level: 'beginner' });
    const first = buildHomeWorkout(r);
    if (!first.ok) throw new Error('should build');
    const swapped = first.build.exercises[0]!;
    const again = buildHomeWorkout({ ...r, exclude: [swapped.id] });
    if (!again.ok) throw new Error('should build');
    expect(again.build.exercises.map((e) => e.id)).not.toContain(swapped.id);
  });
});

describe('session id', () => {
  it('round-trips the whole request and rejects anything else', () => {
    const r = makeRequest({
      items: ['wall', 'chair'],
      level: 'intermediate',
      minutes: 20,
      seated: true,
      balanceSupport: true,
      sets: 3,
      exclude: ['home-wall-sit'],
    });
    const id = encodeHomeId(r);
    expect(isHomeId(id)).toBe(true);
    expect(decodeHomeId(id)).toEqual(r);
    expect(decodeHomeId(encodeHomeId(makeRequest()))).toEqual(makeRequest());
    for (const bad of [
      '',
      'home',
      'home~x~beginner~15~f~n~2~-',
      'home~chair~expert~15~f~n~2~-',
      'home~chair~beginner~99~f~n~2~-',
      'home~wall,chair~beginner~15~f~n~2~-',
      'home~chair~beginner~15~f~n~9~-',
      'home~chair~beginner~15~f~n~2~Bad Id',
      'strength-1',
    ])
      expect(decodeHomeId(bad), bad).toBeNull();
  });

  it('beginners are always on two sets', () => {
    expect(makeRequest({ level: 'beginner', sets: 3 }).sets).toBe(2);
  });
});

describe('player integration', () => {
  it('runs through the existing strength segments and runner: counted sets wait for Done, holds are timed, rests between sets', () => {
    enableInternalFixtures();
    const res = buildHomeWorkout({ items: ['chair'], level: 'beginner', minutes: 20 });
    if (!res.ok) throw new Error(res.reason);
    const segs = strengthSegments(res.build.workout, res.build.exercises);
    const sets = res.build.workout.blocks.reduce((n, b) => n + b.sets, 0);
    expect(segs.filter((s) => s.kind === 'main').length).toBe(sets);
    expect(segs.filter((s) => s.kind === 'rest').length).toBe(sets - 1);
    expect(segs.filter((s) => s.manual).length).toBe(
      res.build.workout.blocks.filter((b) => b.reps !== null).reduce((n, b) => n + b.sets, 0),
    );
    for (const s of segs.filter((x) => x.kind === 'main')) expect(s.cue.length).toBeGreaterThan(30);
    let r = initRunnerFromSegments(res.build.workout.id, segs, false);
    r = runnerReduce(r, { type: 'begin', prepS: 0 });
    let guard = 0;
    while (r.session.status !== 'finished' && guard++ < 1000) {
      const seg = r.session.segments[r.session.index]!;
      r = runnerReduce(r, seg.manual ? { type: 'done' } : { type: 'tick', seconds: seg.seconds });
    }
    expect(r.session.status).toBe('finished');
  });

  it('puts the load note in the instructions of bottle and backpack exercises', () => {
    enableInternalFixtures();
    const res = buildHomeWorkout({
      items: ['water_bottles', 'backpack', 'chair'],
      level: 'intermediate',
      minutes: 20,
    });
    if (!res.ok) throw new Error(res.reason);
    const segs = strengthSegments(res.build.workout, res.build.exercises);
    const loaded = res.build.exercises.filter((e) => e.loadNote);
    expect(loaded.length).toBeGreaterThan(0);
    for (const e of loaded)
      expect(segs.find((s) => s.title === e.name)?.cue).toContain(e.loadNote!);
  });
});

describe('preferences and the engine', () => {
  it('stores the items, drops anything unknown, and defaults to none', () => {
    expect(parsePrefs({}).homeItems).toEqual([]);
    expect(parsePrefs({ homeItems: ['chair', 'sofa', 'wall', 7] }).homeItems).toEqual([
      'chair',
      'wall',
    ]);
    expect(parsePrefs({ homeItems: 'chair' }).homeItems).toEqual([]);
  });

  it('turns saved preferences into a request: level from experience, seated and balance from mobility, three sets for the strength goal', () => {
    const base = parsePrefs({ homeItems: ['chair'] });
    expect(requestFromPrefs(base)).toMatchObject({
      items: ['chair'],
      level: 'beginner',
      seated: false,
      sets: 2,
    });
    const p = parsePrefs({
      homeItems: ['wall'],
      experience: 'regular',
      mobility: ['seated', 'balance_support'],
      goalIntent: 'strength',
    });
    expect(requestFromPrefs(p)).toMatchObject({
      level: 'advanced',
      seated: true,
      balanceSupport: true,
      sets: 3,
    });
    expect(requestFromPrefs(parsePrefs({ experience: 'some' })).level).toBe('intermediate');
    // A beginner never gets three sets even with the strength goal.
    expect(requestFromPrefs(parsePrefs({ goalIntent: 'strength' })).sets).toBe(2);
  });

  it('changing the items changes the next session only: a request is just data, so nothing already done is touched', () => {
    enableInternalFixtures();
    const a = buildHomeWorkout(requestFromPrefs(parsePrefs({ homeItems: ['chair'] })));
    const b = buildHomeWorkout(requestFromPrefs(parsePrefs({ homeItems: ['chair', 'wall'] })));
    if (!a.ok || !b.ok) throw new Error('should build');
    expect(a.build.workout.id).not.toBe(b.build.workout.id);
    expect(decodeHomeId(a.build.workout.id)?.items).toEqual(['chair']);
  });

  it('the strength pathway offers the home session only when it exists, naming the person’s items', () => {
    const prefs = parsePrefs({ pathways: ['strength_training'], homeItems: ['chair', 'wall'] });
    const find = () =>
      resolvePathways({ prefs, readiness: 'clear' }).pathways.find(
        (p) => p.id === 'strength_training',
      )!;
    const off = find();
    expect(off.actions.some((a) => a.id === 'strength.home')).toBe(false);
    expect(off.notes.join(' ')).toMatch(/not available yet/);
    enableInternalFixtures();
    const on = find();
    const act = on.actions.find((a) => a.id === 'strength.home');
    expect(act?.text).toMatch(/sturdy chair and wall|sturdy chair, wall/);
    expect(act?.why).toMatch(/your history stays/);
    expect(on.notes.join(' ')).not.toMatch(/not available yet/);
  });
});

describe('exercise demonstrations', () => {
  const licence: Licence = {
    id: 'lic-test',
    status: 'cleared',
    territories: ['*'],
    startsOn: '2026-01-01',
    endsOn: null,
  } as never;
  const demo = {
    id: 'demo-test',
    exerciseId: 'home-wall-push-up',
    kind: 'video' as const,
    uri: 'test://none',
    captions: 'Test captions describing the movement.',
    licenceId: 'lic-test',
    review: 'approved' as const,
    attribution: { creditLine: 'Test credit' },
  };
  const args = {
    exerciseId: 'home-wall-push-up',
    licences: [licence],
    country: 'AU',
    today: '2026-06-01',
  };

  it('none exist today, so none is ever offered or implied', () => {
    expect(EXERCISE_DEMOS).toEqual([]);
    expect(resolveExerciseDemo(args)).toEqual({ available: false, reason: 'no_demo' });
    for (const e of HOME_EXERCISES)
      expect(resolveExerciseDemo({ ...args, exerciseId: e.id }).available).toBe(false);
  });

  it('is offered only when licensed, approved, captioned and loading', () => {
    expect(resolveExerciseDemo({ ...args, demos: [demo] }).available).toBe(true);
    expect(resolveExerciseDemo({ ...args, demos: [demo], licences: [] }).reason).toBe(
      'not_licensed',
    );
    expect(
      resolveExerciseDemo({ ...args, demos: [{ ...demo, review: 'unreviewed' }] }).reason,
    ).toBe('not_reviewed');
    expect(resolveExerciseDemo({ ...args, demos: [{ ...demo, captions: '' }] }).reason).toBe(
      'no_captions',
    );
    expect(
      resolveExerciseDemo({ ...args, demos: [demo], missing: new Set(['demo-test']) }).reason,
    ).toBe('media_missing');
    expect(resolveExerciseDemo({ ...args, exerciseId: 'other', demos: [demo] }).reason).toBe(
      'no_demo',
    );
  });
});
