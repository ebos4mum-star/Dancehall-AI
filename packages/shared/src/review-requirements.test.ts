import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DRAFT_STRENGTH_EXERCISES,
  DRAFT_STRENGTH_WORKOUTS,
  DRAFT_WORKOUTS,
  HOME_EXERCISES,
  STAGED_FOODS,
  composedReview,
  exerciseReview,
  foodReview,
  renderReviewQueue,
  reviewQueue,
  strengthWorkoutReview,
  workoutReview,
  buildHomeWorkout,
  enableInternalFixtures,
  disableInternalFixtures,
  TRAINER_CLIPS,
  type WorkoutDef,
} from './index';

const QUEUE_FILE = join(__dirname, '..', '..', '..', 'docs', 'review', 'REVIEW_QUEUE.md');

describe('review requirements', () => {
  it('every draft workout names its safety, choreography and media-rights requirements, plus cultural review for Dancehall and reggae', () => {
    for (const w of DRAFT_WORKOUTS) {
      const r = workoutReview(w);
      const by = Object.fromEntries(r.requirements.map((x) => [x.id, x]));
      expect(by.exercise_safety?.status, w.id).toBe('outstanding');
      expect(by.choreography?.status, w.id).toBe('outstanding');
      expect(by.media_rights?.status, w.id).toBe('outstanding');
      expect(by.cultural?.status, w.id).toBe(
        w.style === 'dancehall' || w.style === 'reggae' ? 'outstanding' : 'not_applicable',
      );
      expect(by.exercise_safety?.by).toMatch(/not the author/);
      expect(by.media_rights?.detail).toMatch(/no music is included/);
      expect(r.outstanding).toBe(w.style === 'dancehall' || w.style === 'reggae' ? 4 : 3);
    }
  });

  it('never claims anything is reviewed: every draft requirement is outstanding or not applicable', () => {
    for (const i of reviewQueue())
      for (const r of i.requirements) expect(r.status, `${i.id} ${r.id}`).not.toBe('done');
    const text = renderReviewQueue();
    expect(text).toMatch(/Nothing below has been reviewed/);
    expect(text.toLowerCase()).not.toMatch(/\b(approved by|reviewed by [a-z]+ on|passed review)\b/);
  });

  it('covers every draft item in the content, once each', () => {
    const q = reviewQueue();
    const ids = q.map((i) => `${i.kind}:${i.id}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(q.filter((i) => i.kind === 'workout')).toHaveLength(DRAFT_WORKOUTS.length);
    expect(q.filter((i) => i.kind === 'strength_workout')).toHaveLength(
      DRAFT_STRENGTH_WORKOUTS.length,
    );
    expect(q.filter((i) => i.kind === 'exercise')).toHaveLength(
      DRAFT_STRENGTH_EXERCISES.length + HOME_EXERCISES.length,
    );
    expect(q.filter((i) => i.kind === 'food')).toHaveLength(STAGED_FOODS.length);
  });

  it('strength sessions and exercises need the safety review; household exercises name the item limits', () => {
    for (const w of DRAFT_STRENGTH_WORKOUTS) {
      const r = strengthWorkoutReview(w);
      expect(r.requirements.find((x) => x.id === 'exercise_safety')?.status).toBe('outstanding');
      expect(r.requirements.find((x) => x.id === 'choreography')?.status).toBe('not_applicable');
    }
    const e = exerciseReview(HOME_EXERCISES[0]!);
    expect(e.requirements.find((x) => x.id === 'exercise_safety')?.detail).toMatch(
      /household-item limits/,
    );
  });

  it('foods need a dietitian, and the priority cuisines also a cultural review', () => {
    for (const f of STAGED_FOODS) {
      const r = foodReview(f);
      expect(r.requirements.find((x) => x.id === 'dietitian')?.status).toBe('outstanding');
      expect(r.requirements.find((x) => x.id === 'cultural')?.status).toBe(
        f.regionTags.some((t) => ['jamaican', 'caribbean', 'west_african'].includes(t))
          ? 'outstanding'
          : 'not_applicable',
      );
    }
  });

  it('a clip for a movement adds a media-rights requirement to the exercise that uses it', () => {
    const none = exerciseReview(
      HOME_EXERCISES.find((e) => e.id === 'home-wall-push-up')!,
      [],
    );
    expect(none.requirements.find((x) => x.id === 'media_rights')?.status).toBe('not_applicable');
    const withClip = exerciseReview(
      HOME_EXERCISES.find((e) => e.id === 'home-wall-push-up')!,
      TRAINER_CLIPS,
    );
    expect(withClip.requirements.find((x) => x.id === 'media_rights')?.status).toBe('outstanding');
  });

  it('an item with a complete real record is shown as done, so the workflow can close', () => {
    const w: WorkoutDef = {
      ...DRAFT_WORKOUTS[0]!,
      draft: undefined,
      provenance: {
        credits: ['A. Author'],
        rightsRef: 'rights-1',
        review: {
          status: 'approved',
          reviewerRole: 'exercise_physiologist',
          evidenceRef: 'rev-1',
          reviewedOn: '2026-06-01',
          isAuthor: false,
        },
        culturalReviewRef: 'cul-1',
      } as never,
    };
    const r = workoutReview(w);
    expect(r.outstanding).toBe(0);
    expect(r.requirements.filter((x) => x.status === 'done')).toHaveLength(4);
  });

  it('a composed session (Use what you have) is outstanding until every exercise in it is reviewed', () => {
    enableInternalFixtures();
    try {
      const b = buildHomeWorkout({ items: ['chair'] });
      if (!b.ok) throw new Error('should build');
      const r = composedReview(
        b.build.workout.title,
        b.build.workout.id,
        'use-what-you-have',
        b.build.exercises,
      );
      expect(r.requirements.find((x) => x.id === 'exercise_safety')?.status).toBe('outstanding');
    } finally {
      disableInternalFixtures();
    }
  });
});

describe('technical readiness', () => {
  it('every draft is technically complete, or says exactly what is missing (and none is missing anything today)', () => {
    const q = reviewQueue();
    const notReady = q.filter((i) => !i.technical.ready);
    expect(notReady.map((i) => `${i.id}: ${i.technical.problems.join('; ')}`)).toEqual([]);
    expect(q.length).toBeGreaterThan(80);
  });

  it('technical completeness is never approval: every technically complete draft still has outstanding external requirements', () => {
    for (const i of reviewQueue()) {
      expect(i.technical.ready, i.id).toBe(true);
      expect(i.outstanding, i.id).toBeGreaterThan(0);
    }
  });

  it('catches an incomplete workout, exercise and food', () => {
    const w: WorkoutDef = {
      ...DRAFT_WORKOUTS[0]!,
      blocks: DRAFT_WORKOUTS[0]!.blocks.slice(0, 3),
      safety: ['Be careful.'],
      tempoBpm: undefined,
    };
    const r = workoutReview(w);
    expect(r.technical.ready).toBe(false);
    expect(r.technical.problems.join(' ')).toMatch(/add up|cool-down|safety|tempo/);
    const e = exerciseReview({ ...HOME_EXERCISES[0]!, cues: ['One step only.'], regression: '' });
    expect(e.technical.ready).toBe(false);
    const f = foodReview({ ...STAGED_FOODS[0]!, servingG: 0 });
    expect(f.technical.ready).toBe(false);
  });

  it('a seated-suitable session without a seated version of every block is not technically complete', () => {
    const low = DRAFT_WORKOUTS.find((x) => x.style === 'low_impact')!;
    const broken = {
      ...low,
      blocks: low.blocks.map((b, i) => (i === 0 ? { ...b, seatedAlt: undefined } : b)),
    };
    expect(workoutReview(broken).technical.problems.join(' ')).toMatch(
      /seated version of every block/,
    );
  });
});

describe('generated review queue', () => {
  it('is in step with the content (run UPDATE_REVIEW_QUEUE=1 to regenerate it)', () => {
    const expected = renderReviewQueue();
    if (process.env.UPDATE_REVIEW_QUEUE === '1') writeFileSync(QUEUE_FILE, expected);
    expect(existsSync(QUEUE_FILE), 'docs/review/REVIEW_QUEUE.md must exist').toBe(true);
    expect(readFileSync(QUEUE_FILE, 'utf8')).toBe(expected);
  });
});
