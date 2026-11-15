import { setFixturesEnabled } from './content-state';
import { CURATED_FOODS, FOOD_BY_ID, type FoodRef } from './food-data';
import { STAGED_FOODS } from './food-staged';
import { HOME_EXERCISES } from './home-exercises';
import { DRAFT_STRENGTH_EXERCISES, DRAFT_STRENGTH_WORKOUTS, DRAFT_WORKOUTS } from './draft-packs';
import { STRENGTH_EXERCISES, STRENGTH_WORKOUTS } from './strength';
import type { StrengthExerciseDef, StrengthWorkoutDef } from './strength';
import {
  DANCE_STYLES,
  PENDING_STYLES,
  WORKOUTS,
  WORKOUT_BY_ID,
  type WorkoutBlock,
  type WorkoutDef,
} from './workouts';

/**
 * INTERNAL TEST FIXTURES. These exist only so the Dancehall, reggae, chair dance, seated and strength pipelines can be built and tested end to end before any real
 * content exists. They are NOT workouts: every title starts with "[Internal fixture]", every cue is a placeholder sentence, they contain no movement, no tempo,
 * no music, no cultural content and no health guidance, they carry no provenance or review (so they can never look reviewed), and they are never in the bundle
 * (the bundled-content gate fails CI if one is). They are inert unless `enableInternalFixtures()` is called, which only a development or review build does, and
 * production configuration refuses to start with fixtures switched on.
 */
const NOTE = 'Placeholder text for a pipeline test. Not a real movement or instruction.';
const block = (
  kind: WorkoutBlock['kind'],
  title: string,
  seconds: number,
  seated: boolean,
): WorkoutBlock => ({
  kind,
  title,
  seconds,
  cue: `[Fixture] ${NOTE}`,
  lowImpactAlt: `[Fixture] ${NOTE} (low-impact version)`,
  ...(seated ? { seatedAlt: `[Fixture] ${NOTE} (seated version)` } : {}),
});
const fixtureWorkout = (
  id: string,
  title: string,
  style: WorkoutDef['style'],
  minutes: 5 | 10 | 15,
  level: WorkoutDef['level'],
  extra: Partial<WorkoutDef> = {},
): WorkoutDef => {
  const seated = style === 'chair_dance' || extra.seatedSuitable === true;
  const edge = minutes === 5 ? 30 : minutes === 10 ? 60 : 90;
  const main = minutes * 60 - 2 * edge;
  return {
    id,
    title: `[Internal fixture] ${title}`,
    style,
    level,
    minutes,
    intensity: 'low',
    impact: 'low',
    summary: `[Fixture] Pipeline test only. ${NOTE}`,
    instructorId: null,
    equipment: 'none',
    contentOrigin: 'original_text',
    blocks: [
      block('warmup', 'Fixture warm-up', edge, seated),
      block('main', 'Fixture main block', main, seated),
      block('cooldown', 'Fixture cool-down', edge, seated),
    ],
    safety: [
      '[Fixture] Placeholder safety note for a pipeline test.',
      'Stop if you feel unwell and speak to a health professional.',
    ],
    fixture: true,
    ...extra,
  };
};

export const FIXTURE_WORKOUTS: readonly WorkoutDef[] = [
  fixtureWorkout(
    'fixture-dancehall-beginner',
    'Dancehall pipeline test',
    'dancehall',
    10,
    'beginner',
  ),
  fixtureWorkout('fixture-reggae-flow', 'Reggae pipeline test', 'reggae', 15, 'beginner'),
  fixtureWorkout(
    'fixture-chair-dance-10',
    'Chair dance pipeline test',
    'chair_dance',
    10,
    'beginner',
  ),
  fixtureWorkout('fixture-chair-dance-5', 'Chair dance short test', 'chair_dance', 5, 'beginner'),
  fixtureWorkout(
    'fixture-seated-suitable',
    'Seated-suitable attribute test',
    'afrobeats',
    10,
    'beginner',
    {
      seatedSuitable: true,
    },
  ),
];

const ex = (
  id: string,
  name: string,
  pattern: StrengthExerciseDef['pattern'],
): StrengthExerciseDef => ({
  id,
  name: `[Internal fixture] ${name}`,
  pattern,
  equipment: 'none',
  cues: [`[Fixture] ${NOTE}`],
  regression: `[Fixture] ${NOTE}`,
  progression: null,
  safety: ['[Fixture] Placeholder safety note for a pipeline test.'],
  contentOrigin: 'original_text',
  review: 'unreviewed',
  reviewer: null,
  fixture: true,
});
export const FIXTURE_STRENGTH_EXERCISES: readonly StrengthExerciseDef[] = [
  ex('fixture-ex-a', 'Exercise A', 'squat'),
  ex('fixture-ex-b', 'Exercise B', 'push'),
  ex('fixture-ex-c', 'Exercise C', 'core'),
];
export const FIXTURE_STRENGTH_WORKOUTS: readonly StrengthWorkoutDef[] = [
  {
    id: 'fixture-strength-bodyweight',
    title: '[Internal fixture] Strength pipeline test',
    level: 'beginner',
    minutes: 12,
    equipment: 'none',
    warmup: { title: 'Fixture warm-up', seconds: 60, cue: `[Fixture] ${NOTE}` },
    cooldown: { title: 'Fixture cool-down', seconds: 60, cue: `[Fixture] ${NOTE}` },
    blocks: [
      { exerciseId: 'fixture-ex-a', sets: 3, reps: 8, seconds: null, restSeconds: 45 },
      { exerciseId: 'fixture-ex-b', sets: 2, reps: null, seconds: 30, restSeconds: 30 },
      { exerciseId: 'fixture-ex-c', sets: 2, reps: 6, seconds: null, restSeconds: 30 },
    ],
    safety: ['[Fixture] Placeholder safety note for a pipeline test.'],
    contentOrigin: 'original_text',
    review: 'unreviewed',
    reviewer: null,
    fixture: true,
  },
];

let enabled = false;
export const fixturesAreEnabled = (): boolean => enabled;

/**
 * Adds the internal fixtures to the in-memory catalogues and offers the pending styles, for development and review builds only. Idempotent. The caller
 * (the app's startup) must refuse to call it in production.
 */
export function enableInternalFixtures(): void {
  if (enabled) return;
  enabled = true;
  setFixturesEnabled(true);
  const workouts = WORKOUTS as WorkoutDef[];
  for (const w of [...FIXTURE_WORKOUTS, ...DRAFT_WORKOUTS]) {
    workouts.push(w);
    (WORKOUT_BY_ID as Map<string, WorkoutDef>).set(w.id, w);
  }
  for (const s of PENDING_STYLES) if (!DANCE_STYLES.includes(s)) DANCE_STYLES.push(s);
  for (const f of STAGED_FOODS) {
    (CURATED_FOODS as FoodRef[]).push(f);
    (FOOD_BY_ID as Map<string, FoodRef>).set(f.id, f);
  }
  STRENGTH_EXERCISES.push(
    ...FIXTURE_STRENGTH_EXERCISES,
    ...DRAFT_STRENGTH_EXERCISES,
    ...HOME_EXERCISES,
  );
  STRENGTH_WORKOUTS.push(...FIXTURE_STRENGTH_WORKOUTS, ...DRAFT_STRENGTH_WORKOUTS);
}

/** Removes everything `enableInternalFixtures` added (used by tests so they cannot leak into each other). */
export function disableInternalFixtures(): void {
  if (!enabled) return;
  enabled = false;
  setFixturesEnabled(false);
  const workouts = WORKOUTS as WorkoutDef[];
  for (const w of [...FIXTURE_WORKOUTS, ...DRAFT_WORKOUTS]) {
    const i = workouts.indexOf(w);
    if (i >= 0) workouts.splice(i, 1);
    (WORKOUT_BY_ID as Map<string, WorkoutDef>).delete(w.id);
  }
  for (const s of PENDING_STYLES) {
    const i = DANCE_STYLES.indexOf(s);
    if (i >= 0) DANCE_STYLES.splice(i, 1);
  }
  for (const f of STAGED_FOODS) {
    const i = (CURATED_FOODS as FoodRef[]).indexOf(f);
    if (i >= 0) (CURATED_FOODS as FoodRef[]).splice(i, 1);
    (FOOD_BY_ID as Map<string, FoodRef>).delete(f.id);
  }
  for (const arr of [STRENGTH_EXERCISES, STRENGTH_WORKOUTS] as Array<
    Array<{ fixture?: true; draft?: unknown }>
  >) {
    for (let i = arr.length - 1; i >= 0; i--)
      if (arr[i]!.fixture || arr[i]!.draft) arr.splice(i, 1);
  }
}
