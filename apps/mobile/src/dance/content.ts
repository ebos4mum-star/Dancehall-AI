import {
  STRENGTH_EXERCISES,
  WORKOUT_BY_ID,
  activeStrengthWorkouts,
  isSeatedSuitable,
  strengthBlocks,
  type DanceStyle,
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
  dance?: WorkoutDef;
  strength?: StrengthWorkoutDef;
  exercises?: StrengthExerciseDef[];
}

export function resolveContent(id: string): SessionContent | undefined {
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
