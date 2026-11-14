import { describe, expect, it } from 'vitest';
import {
  STRENGTH_EXERCISES,
  STRENGTH_WORKOUTS,
  activeStrengthWorkouts,
  strengthWorkoutProblems,
  type StrengthExerciseDef,
  type StrengthWorkoutDef,
} from './strength';

// Fixtures for the gate only. They are test data, not content, and are never exported or shipped.
const ex = (over: Partial<StrengthExerciseDef> = {}): StrengthExerciseDef => ({
  id: 'x1',
  name: 'Test move',
  pattern: 'squat',
  equipment: 'none',
  cues: ['cue'],
  regression: 'easier',
  progression: null,
  safety: ['stop if sharp pain'],
  contentOrigin: 'original_text',
  review: 'approved',
  reviewer: {
    role: 'certified_strength_coach',
    evidenceRef: 'REV-1',
    reviewedOn: '2026-01-01',
    isAuthor: false,
  },
  ...over,
});
const wo = (over: Partial<StrengthWorkoutDef> = {}): StrengthWorkoutDef => ({
  id: 'w1',
  title: 'Test workout',
  level: 'beginner',
  minutes: 10,
  equipment: 'none',
  warmup: { title: 'w', seconds: 60, cue: 'c' },
  cooldown: { title: 'c', seconds: 60, cue: 'c' },
  blocks: [{ exerciseId: 'x1', sets: 2, reps: 8, seconds: null, restSeconds: 30 }],
  safety: ['go at your pace'],
  contentOrigin: 'original_text',
  review: 'approved',
  reviewer: {
    role: 'physiotherapist',
    evidenceRef: 'REV-2',
    reviewedOn: '2026-01-02',
    isAuthor: false,
  },
  ...over,
});

describe('strength content contract', () => {
  it('ships no exercises or workouts until qualified review exists', () => {
    expect(STRENGTH_EXERCISES).toHaveLength(0);
    expect(STRENGTH_WORKOUTS).toHaveLength(0);
    expect(activeStrengthWorkouts()).toEqual([]);
  });
  it('accepts a fully reviewed workout', () => {
    expect(strengthWorkoutProblems(wo(), [ex()])).toEqual([]);
    expect(activeStrengthWorkouts([wo()], [ex()])).toHaveLength(1);
  });
  it('rejects unreviewed, author-reviewed and record-less content', () => {
    expect(strengthWorkoutProblems(wo({ review: 'unreviewed' }), [ex()]).join()).toMatch(
      /not been approved/,
    );
    expect(strengthWorkoutProblems(wo(), [ex({ review: 'in_review' })]).join()).toMatch(
      /Exercise "Test move" has not been approved/,
    );
    const self = { ...wo().reviewer!, isAuthor: true };
    expect(strengthWorkoutProblems(wo({ reviewer: self }), [ex()]).join()).toMatch(/author/);
    expect(strengthWorkoutProblems(wo({ reviewer: null }), [ex()]).join()).toMatch(
      /no review record/,
    );
  });
  it('requires easier versions, cues, safety notes, warm-up and valid blocks', () => {
    expect(strengthWorkoutProblems(wo(), [ex({ regression: '' })]).join()).toMatch(/easier/);
    expect(strengthWorkoutProblems(wo(), [ex({ cues: [] })]).join()).toMatch(/cues/);
    expect(strengthWorkoutProblems(wo({ safety: [] }), [ex()]).join()).toMatch(/safety/);
    expect(
      strengthWorkoutProblems(wo({ warmup: { title: 'w', seconds: 0, cue: '' } }), [ex()]).join(),
    ).toMatch(/warm-up/);
    expect(
      strengthWorkoutProblems(
        wo({ blocks: [{ exerciseId: 'x1', sets: 2, reps: 8, seconds: 30, restSeconds: 30 }] }),
        [ex()],
      ).join(),
    ).toMatch(/not both/);
    expect(strengthWorkoutProblems(wo({ blocks: [] }), [ex()]).join()).toMatch(/no exercises/);
    expect(strengthWorkoutProblems(wo(), []).join()).toMatch(/does not exist/);
    expect(strengthWorkoutProblems(wo(), [ex({ equipment: 'dumbbells' })]).join()).toMatch(
      /needs dumbbells/,
    );
  });
});
