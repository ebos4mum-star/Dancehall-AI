import { afterEach, describe, expect, it } from 'vitest';
import {
  DRAFT_STRENGTH_EXERCISES,
  DRAFT_STRENGTH_WORKOUTS,
  DRAFT_WORKOUTS,
  STRENGTH_EXERCISES,
  STRENGTH_WORKOUTS,
  WORKOUTS,
  activeStrengthWorkouts,
  bundledContentProblems,
  disableInternalFixtures,
  enableInternalFixtures,
  initRunner,
  isSeatedSuitable,
  runnerReduce,
  sessionSegments,
  strengthSegments,
  strengthWorkoutProblems,
  suggestQuickFit,
  workoutProblems,
  workoutSeconds,
  type WorkoutDef,
} from './index';

afterEach(() => disableInternalFixtures());

describe('draft workout packs', () => {
  it('covers the five requested packs', () => {
    const styles = new Set(DRAFT_WORKOUTS.map((w) => w.style));
    for (const s of ['dancehall', 'reggae', 'chair_dance', 'low_impact'])
      expect(styles.has(s as never), s).toBe(true);
    expect(DRAFT_STRENGTH_WORKOUTS.length).toBeGreaterThanOrEqual(2);
  });

  it('every draft is structurally valid and its blocks add up to its length', () => {
    for (const w of DRAFT_WORKOUTS) {
      expect(workoutProblems(w), w.id).toEqual([]);
      expect(workoutSeconds(w), w.id).toBe(w.minutes * 60);
      expect(w.tempoBpm, w.id).toBeTruthy();
    }
  });

  it('every block has an easier version, and seated sessions have a seated way to do every block', () => {
    for (const w of DRAFT_WORKOUTS) {
      for (const bl of w.blocks) expect(bl.lowImpactAlt.trim().length, w.id).toBeGreaterThan(10);
      if (w.style === 'low_impact')
        for (const bl of w.blocks) expect(bl.seatedAlt, `${w.id} ${bl.title}`).toBeTruthy();
    }
    expect(DRAFT_WORKOUTS.filter((w) => w.style === 'chair_dance').every(isSeatedSuitable)).toBe(
      true,
    );
  });

  it('every draft says it is a draft, lists what it needs and never carries provenance', () => {
    for (const w of DRAFT_WORKOUTS) {
      expect(w.draft?.needs.length, w.id).toBeGreaterThanOrEqual(3);
      expect(w.provenance, w.id).toBeUndefined();
      expect(w.fixture, w.id).toBeUndefined();
      expect(w.summary, w.id).toMatch(/Draft, not reviewed/);
      expect(w.draft?.needs.join(' '), w.id).toMatch(/track/i);
    }
    for (const w of DRAFT_STRENGTH_WORKOUTS) {
      expect(w.draft?.needs.length).toBeGreaterThanOrEqual(2);
      expect(w.reviewer).toBeNull();
      expect(w.review).toBe('unreviewed');
    }
  });

  it('makes no claim of review, rights, licensed music or authenticity', () => {
    const text = JSON.stringify([
      DRAFT_WORKOUTS.map((w) => [w.title, w.summary, w.blocks, w.safety]),
      DRAFT_STRENGTH_EXERCISES,
      DRAFT_STRENGTH_WORKOUTS,
    ]).toLowerCase();
    for (const claim of [
      'authentic',
      'rights-cleared',
      'professionally reviewed',
      'approved by',
      'certified',
      'licensed music',
      'official',
      'jamaican dancers',
    ])
      expect(text, claim).not.toContain(claim);
  });

  it('is rejected from the bundle by the gate (in the workout and strength lists)', () => {
    const problems = bundledContentProblems({
      workouts: DRAFT_WORKOUTS,
      strengthWorkouts: [...DRAFT_STRENGTH_WORKOUTS],
      strengthExercises: [...DRAFT_STRENGTH_EXERCISES],
    });
    expect(problems.filter((p) => /unreviewed draft is in the bundle/.test(p)).length).toBe(
      DRAFT_WORKOUTS.length + DRAFT_STRENGTH_WORKOUTS.length + DRAFT_STRENGTH_EXERCISES.length,
    );
  });

  it('is not in the shipped lists, and a draft that gains provenance is refused', () => {
    expect(WORKOUTS.some((w) => w.draft)).toBe(false);
    expect(STRENGTH_WORKOUTS.some((w) => w.draft)).toBe(false);
    expect(bundledContentProblems()).toEqual([]);
    const sneaky: WorkoutDef = {
      ...DRAFT_WORKOUTS[0]!,
      provenance: {
        credits: ['x author'],
        rightsRef: 'rights-1',
        review: {
          status: 'approved',
          reviewerRole: 'exercise_physiologist',
          evidenceRef: 'rev-1',
          reviewedOn: '2026-01-01',
          isAuthor: false,
        },
        culturalReviewRef: 'cul-1',
      } as never,
    };
    expect(workoutProblems(sneaky).join(' ')).toMatch(/must not carry provenance/);
  });

  it('appears only when the preview switch is on and is left out of automatic suggestions', () => {
    expect(WORKOUTS.some((w) => w.id.startsWith('draft-'))).toBe(false);
    expect(activeStrengthWorkouts().some((w) => w.draft)).toBe(false);
    enableInternalFixtures();
    expect(WORKOUTS.filter((w) => w.draft).length).toBe(DRAFT_WORKOUTS.length);
    expect(activeStrengthWorkouts().filter((w) => w.draft).length).toBe(
      DRAFT_STRENGTH_WORKOUTS.length,
    );
    for (const m of [5, 10, 15] as const)
      for (let seed = 0; seed < 8; seed++) {
        const pick = suggestQuickFit({ minutes: m, seed });
        expect(pick?.draft, `${m}/${seed}`).toBeUndefined();
      }
    disableInternalFixtures();
    expect(WORKOUTS.some((w) => w.draft)).toBe(false);
    expect(STRENGTH_EXERCISES.some((e) => e.draft)).toBe(false);
    expect(STRENGTH_WORKOUTS.some((w) => w.draft)).toBe(false);
  });

  it('runs end to end in the existing player, seated and low-impact', () => {
    for (const w of DRAFT_WORKOUTS) {
      for (const [low, seated] of [
        [false, false],
        [true, false],
        [false, isSeatedSuitable(w)],
      ] as const) {
        const segs = sessionSegments(w, low, seated);
        expect(segs.length, w.id).toBe(w.blocks.length);
        let r = initRunner(w, low, seated);
        r = runnerReduce(r, { type: 'begin', prepS: 0 });
        let guard = 0;
        while (r.session.status !== 'finished' && guard++ < 400)
          r = runnerReduce(r, { type: 'tick', seconds: 15 });
        expect(r.session.status, w.id).toBe('finished');
        expect(r.session.elapsedS, w.id).toBeGreaterThanOrEqual(w.minutes * 60 - 1);
      }
    }
    const seated = sessionSegments(
      DRAFT_WORKOUTS.find((w) => w.style === 'low_impact')!,
      false,
      true,
    );
    expect(seated[0]!.cueSeated).toBeTruthy();
  });
});

describe('draft strength pack', () => {
  const all = [...STRENGTH_EXERCISES, ...DRAFT_STRENGTH_EXERCISES];

  it('every exercise has cues, an easier version and safety notes, and every workout passes the structure rules', () => {
    for (const e of DRAFT_STRENGTH_EXERCISES) {
      expect(e.cues.length, e.id).toBeGreaterThan(0);
      expect(e.regression.length, e.id).toBeGreaterThan(10);
      expect(e.safety.length, e.id).toBeGreaterThan(0);
    }
    for (const w of DRAFT_STRENGTH_WORKOUTS)
      expect(strengthWorkoutProblems(w, all), w.id).toEqual([]);
  });

  it('counts sets in reps through the existing player and gives every set an easier version and a rest', () => {
    for (const w of DRAFT_STRENGTH_WORKOUTS) {
      const segs = strengthSegments(w, all);
      const sets = w.blocks.reduce((n, b) => n + b.sets, 0);
      expect(segs.filter((s) => s.manual).length, w.id).toBe(sets);
      expect(segs.filter((s) => s.kind === 'rest').length, w.id).toBe(sets - 1);
      for (const s of segs.filter((s) => s.manual))
        expect(s.cueLow ?? '', w.id).toMatch(/^Easier version:/);
    }
  });

  it('keeps the stated length within a quarter of the real total (rest included)', () => {
    for (const w of DRAFT_STRENGTH_WORKOUTS) {
      const total = strengthSegments(w, all).reduce((n, s) => n + s.seconds, 0) / 60;
      expect(Math.abs(total - w.minutes) / w.minutes, `${w.id} ${total.toFixed(1)}`).toBeLessThan(
        0.25,
      );
    }
  });

  it('uses conservative beginner volume (no more than three sets, no more than twelve reps)', () => {
    for (const w of DRAFT_STRENGTH_WORKOUTS)
      for (const b of w.blocks) {
        expect(b.sets).toBeLessThanOrEqual(3);
        expect(b.reps ?? 0).toBeLessThanOrEqual(12);
        expect(b.restSeconds).toBeGreaterThanOrEqual(30);
      }
  });

  it('a reviewed workout cannot use a draft exercise', () => {
    const w = {
      ...DRAFT_STRENGTH_WORKOUTS[0]!,
      draft: undefined,
      review: 'approved' as const,
      reviewer: {
        role: 'physiotherapist' as const,
        evidenceRef: 'rev-1',
        reviewedOn: '2026-01-01',
        isAuthor: false,
      },
    };
    expect(strengthWorkoutProblems(w, all).join(' ')).toMatch(/unreviewed draft/);
  });
});
