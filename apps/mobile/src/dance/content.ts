import {
  STRENGTH_EXERCISES,
  WORKOUT_BY_ID,
  activeStrengthWorkouts,
  buildHomeWorkout,
  decodeHomeId,
  isHomeId,
  isSeatedSuitable,
  strengthBlocks,
  type DanceStyle,
  type HomeBuild,
  type Intensity,
  type Level,
  type StrengthExerciseDef,
  type StrengthWorkoutDef,
  type WorkoutBlock,
  type WorkoutDef,
} from '@dancehall/shared';

/**
 * What the detail and session screens show, whether the id names a dance workout or a strength workout. Strength workouts reuse the same screens and the same
 * player (blocks, clock, resume, audio cues), so there is one session experience, not two. Strength is returned only while it passes the review gate (or is an
 * internal fixture in a development build): `activeStrengthWorkouts` decides, never this file.
 */
export interface SessionContent {
  kind: 'dance' | 'strength';
  id: string;
  title: string;
  summary: string;
  minutes: number;
  level: Level;
  style: DanceStyle | null;
  intensity: Intensity | null;
  impact: Intensity | null;
  equipment: string;
  safety: string[];
  blocks: WorkoutBlock[];
  instructorId: string | null;
  /** Can be done seated (chair dance, or a session marked suitable). */
  seatedSuitable: boolean;
  /** Every session in this style is seated, so there is nothing to switch. */
  seatedOnly: boolean;
  /** Placeholder content for pipeline tests in development builds. */
  fixture: boolean;
  /** Original draft content that no qualified person has reviewed (development and review builds only). */
  draft: boolean;
  /** A "Use what you have" session: its items, safety checks and what never to use. */
  home?: HomeBuild;
  dance?: WorkoutDef;
  strength?: StrengthWorkoutDef;
  exercises?: StrengthExerciseDef[];
}

/** A "Use what you have" session is rebuilt from its id alone (the id carries the whole request), so resume and logging need nothing else. */
function resolveHome(id: string): SessionContent | undefined {
  const req = decodeHomeId(id);
  if (!req) return undefined;
  const res = buildHomeWorkout(req);
  if (!res.ok) return undefined;
  const { workout, exercises } = res.build;
  return {
    kind: 'strength',
    id: workout.id,
    title: workout.title,
    summary: `${exercises.length} exercises, ${workout.blocks.reduce((n, b) => n + b.sets, 0)} sets, with rests between.`,
    minutes: workout.minutes,
    level: workout.level,
    style: null,
    intensity: null,
    impact: null,
    equipment: workout.equipment,
    safety: workout.safety,
    blocks: strengthBlocks(workout, exercises),
    instructorId: null,
    seatedSuitable: false,
    seatedOnly: false,
    fixture: false,
    draft: workout.draft !== undefined,
    strength: workout,
    exercises,
    home: res.build,
  };
}

export function resolveContent(id: string): SessionContent | undefined {
  if (isHomeId(id)) return resolveHome(id);
  const w = WORKOUT_BY_ID.get(id);
  if (w)
    return {
      kind: 'dance',
      id: w.id,
      title: w.title,
      summary: w.summary,
      minutes: w.minutes,
      level: w.level,
      style: w.style,
      intensity: w.intensity,
      impact: w.impact,
      equipment: w.equipment,
      safety: w.safety,
      blocks: w.blocks,
      instructorId: w.instructorId,
      seatedSuitable: isSeatedSuitable(w),
      seatedOnly: w.style === 'chair_dance',
      fixture: w.fixture === true,
      draft: w.draft !== undefined,
      dance: w,
    };
  const s = activeStrengthWorkouts().find((x) => x.id === id);
  if (!s) return undefined;
  const exercises = s.blocks
    .map((b) => STRENGTH_EXERCISES.find((e) => e.id === b.exerciseId))
    .filter((e, i, a): e is StrengthExerciseDef => !!e && a.indexOf(e) === i);
  return {
    kind: 'strength',
    id: s.id,
    title: s.title,
    summary: `${s.blocks.reduce((n, b) => n + b.sets, 0)} sets across ${exercises.length} exercises, with rests between.`,
    minutes: s.minutes,
    level: s.level,
    style: null,
    intensity: null,
    impact: null,
    equipment: s.equipment,
    safety: s.safety,
    blocks: strengthBlocks(s),
    instructorId: null,
    seatedSuitable: false,
    seatedOnly: false,
    fixture: s.fixture === true,
    draft: s.draft !== undefined,
    strength: s,
    exercises,
  };
}

/** Strength sessions offered right now (empty until real content passes the gate, or fixtures are on in development). */
export const strengthSessions = (): SessionContent[] =>
  activeStrengthWorkouts()
    .map((s) => resolveContent(s.id))
    .filter((c): c is SessionContent => !!c);

/** A neutral look for strength sessions (they are not a dance style). */
export const STRENGTH_META = { from: '#1F1633', to: '#4338CA', icon: 'barbell' } as const;
