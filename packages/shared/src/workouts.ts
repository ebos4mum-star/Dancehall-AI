import data from './workout-data.json';

export const DANCE_STYLES = [
  'afrobeats',
  'amapiano',
  'hip_hop',
  'latin',
  'bollywood',
  'low_impact',
] as const;
export type DanceStyle = (typeof DANCE_STYLES)[number];
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];
export const INTENSITIES = ['low', 'moderate', 'high'] as const;
export type Intensity = (typeof INTENSITIES)[number];
export const QUICK_FIT_MINUTES = [5, 10, 15] as const;
export type QuickFitMinutes = (typeof QUICK_FIT_MINUTES)[number];

export interface WorkoutBlock {
  kind: 'warmup' | 'main' | 'cooldown';
  title: string;
  seconds: number;
  cue: string;
  /** The low-impact version of this block. Required for every block. */
  lowImpactAlt: string;
}
export interface WorkoutDef {
  id: string;
  title: string;
  style: DanceStyle;
  level: Level;
  minutes: number;
  intensity: Intensity;
  /** How hard the movement is on the joints (separate from how hard it feels). */
  impact: Intensity;
  summary: string;
  instructorId: string | null;
  equipment: string;
  contentOrigin: 'original_text' | 'licensed' | 'commissioned';
  blocks: WorkoutBlock[];
  safety: string[];
}
export interface InstructorDef {
  id: string;
  displayName: string;
  bio: string;
}
export interface ProgramDef {
  id: string;
  title: string;
  description: string;
  weeks: number;
  sessionsPerWeek: number;
  level: Level;
  instructorId: string | null;
  schedule: Array<{ week: number; day: number; workoutId: string }>;
}

/** SAMPLE text-only outlines (see the notice in workout-data.json). No video, music or instructor likeness. */
export const WORKOUT_DATA_NOTICE: string = data._notice;
export const WORKOUTS: readonly WorkoutDef[] = data.workouts as WorkoutDef[];
export const WORKOUT_BY_ID: ReadonlyMap<string, WorkoutDef> = new Map(
  WORKOUTS.map((w) => [w.id, w]),
);
export const INSTRUCTORS: readonly InstructorDef[] = data.instructors as InstructorDef[];
export const PROGRAMS: readonly ProgramDef[] = data.programs as ProgramDef[];

export const isQuickFit = (w: Pick<WorkoutDef, 'minutes'>): boolean =>
  (QUICK_FIT_MINUTES as readonly number[]).includes(w.minutes);
export const workoutSeconds = (w: Pick<WorkoutDef, 'blocks'>): number =>
  w.blocks.reduce((s, b) => s + b.seconds, 0);

export interface WorkoutFilter {
  styles?: readonly DanceStyle[];
  levels?: readonly Level[];
  intensities?: readonly Intensity[];
  /** Exact minute values to include (e.g. [5, 10, 15]). */
  minutes?: readonly number[];
  quickFitOnly?: boolean;
  /** Only workouts whose movement is low impact. */
  lowImpactOnly?: boolean;
}
const hasAny = <T>(list: readonly T[] | undefined, v: T) =>
  !list || list.length === 0 || list.includes(v);

export function filterWorkouts(
  f: WorkoutFilter,
  list: readonly WorkoutDef[] = WORKOUTS,
): WorkoutDef[] {
  return list
    .filter(
      (w) =>
        hasAny(f.styles, w.style) &&
        hasAny(f.levels, w.level) &&
        hasAny(f.intensities, w.intensity) &&
        hasAny(f.minutes, w.minutes),
    )
    .filter((w) => !f.quickFitOnly || isQuickFit(w))
    .filter((w) => !f.lowImpactOnly || w.impact === 'low')
    .sort((a, b) => a.minutes - b.minutes || a.title.localeCompare(b.title));
}

/**
 * Picks a Quick Fit session. Deterministic for a given seed so it is testable; `lowImpactOnly` should be set whenever the person's
 * readiness screening routed them to low-impact options.
 */
export function suggestQuickFit(
  args: {
    minutes: QuickFitMinutes;
    lowImpactOnly?: boolean;
    style?: DanceStyle;
    /** Only these intensities (a safety limit: it is kept even when the style preference cannot be met). */
    intensities?: readonly Intensity[];
    excludeIds?: readonly string[];
    seed?: number;
  },
  list: readonly WorkoutDef[] = WORKOUTS,
): WorkoutDef | null {
  const pool = filterWorkouts(
    {
      minutes: [args.minutes],
      quickFitOnly: true,
      lowImpactOnly: args.lowImpactOnly,
      intensities: args.intensities,
      styles: args.style ? [args.style] : undefined,
    },
    list,
  ).filter((w) => !args.excludeIds?.includes(w.id));
  const fallback =
    pool.length > 0
      ? pool
      : filterWorkouts(
          {
            minutes: [args.minutes],
            quickFitOnly: true,
            lowImpactOnly: args.lowImpactOnly,
            intensities: args.intensities,
          },
          list,
        );
  // An intensity ceiling is a comfort limit, impact is a joint-safety limit. If no session meets the ceiling at this length, keep the impact limit and offer the
  // gentlest session available rather than nothing.
  const gentlest = (): WorkoutDef[] => {
    const all = filterWorkouts(
      { minutes: [args.minutes], quickFitOnly: true, lowImpactOnly: args.lowImpactOnly },
      list,
    ).filter((w) => !args.excludeIds?.includes(w.id));
    const rank = (w: WorkoutDef) => INTENSITIES.indexOf(w.intensity);
    const lowest = Math.min(...all.map(rank));
    return all.filter((w) => rank(w) === lowest);
  };
  const chosen = fallback.length === 0 && args.intensities ? gentlest() : fallback;
  return chosen.length === 0 ? null : (chosen[(args.seed ?? 0) % chosen.length] ?? null);
}

export interface SessionSegment {
  index: number;
  kind: WorkoutBlock['kind'];
  title: string;
  seconds: number;
  /** What to do now. In low-impact mode this is the low-impact version. */
  cue: string;
  cueNormal: string;
  cueLow: string;
}
export function sessionSegments(
  w: Pick<WorkoutDef, 'blocks'>,
  lowImpact: boolean,
): SessionSegment[] {
  return w.blocks.map((b, index) => ({
    index,
    kind: b.kind,
    title: b.title,
    seconds: b.seconds,
    cue: lowImpact ? b.lowImpactAlt : b.cue,
    cueNormal: b.cue,
    cueLow: b.lowImpactAlt,
  }));
}

const pad = (n: number) => String(n).padStart(2, '0');
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Dates for every session of a program. Program day 1 is the start date; week w, day d falls (w-1)*7 + (d-1) days later. */
export function programSessions(
  p: ProgramDef,
  startDate: string,
): Array<{ workoutId: string; plannedFor: string; week: number; day: number }> {
  return p.schedule
    .map((s) => ({
      workoutId: s.workoutId,
      plannedFor: addDaysIso(startDate, (s.week - 1) * 7 + (s.day - 1)),
      week: s.week,
      day: s.day,
    }))
    .sort((a, b) => a.plannedFor.localeCompare(b.plannedFor));
}
