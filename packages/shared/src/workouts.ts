import data from './workout-data.json';
import type { ContentReview } from './evidence';

/**
 * Workout styles: ONE place defines them. `LIVE_STYLES` are the styles the catalogue and the database can store today. `PENDING_STYLES` are fully supported by the code
 * (types, filters, seated handling, validation) but cannot be stored until the style migration is approved and applied, and they must not appear to people until the first
 * genuinely reviewed, rights-cleared workout exists. `DANCE_STYLES` is what the app offers; it equals `LIVE_STYLES` unless internal test fixtures are switched on
 * (see fixtures.ts). A test pins `DANCE_STYLES` to the database's style constraint, and another requires every offered style to have a workout.
 */
export const LIVE_STYLES = [
  'afrobeats',
  'amapiano',
  'hip_hop',
  'latin',
  'bollywood',
  'low_impact',
] as const;
export const PENDING_STYLES = ['dancehall', 'reggae', 'chair_dance'] as const;
export const ALL_STYLES = [...LIVE_STYLES, ...PENDING_STYLES] as const;
export type DanceStyle = (typeof ALL_STYLES)[number];
/** The styles offered today. Mutable only so internal fixtures can add the pending ones in development; production builds never do. */
export const DANCE_STYLES: DanceStyle[] = [...LIVE_STYLES];

export interface StyleDef {
  id: DanceStyle;
  /** English label for engine text; screens use the `style.*` strings. */
  label: string;
  /** Accessibility styles are modes of moving, not genres. */
  kind: 'dance' | 'accessibility';
  /**
   * Protected styles carry cultural or accessibility responsibility: bundled content in them must have credited authors, a rights reference, an independent
   * fitness and safety review and (for Dancehall and reggae) a cultural review, or CI fails (see content-gate.ts).
   */
  protected: boolean;
  /** Every session in this style is performed seated. */
  seatedOnly: boolean;
}
export const STYLE_DEFS: Record<DanceStyle, StyleDef> = {
  afrobeats: {
    id: 'afrobeats',
    label: 'Afrobeats',
    kind: 'dance',
    protected: false,
    seatedOnly: false,
  },
  amapiano: {
    id: 'amapiano',
    label: 'Amapiano',
    kind: 'dance',
    protected: false,
    seatedOnly: false,
  },
  hip_hop: { id: 'hip_hop', label: 'Hip hop', kind: 'dance', protected: false, seatedOnly: false },
  latin: { id: 'latin', label: 'Latin', kind: 'dance', protected: false, seatedOnly: false },
  bollywood: {
    id: 'bollywood',
    label: 'Bollywood',
    kind: 'dance',
    protected: false,
    seatedOnly: false,
  },
  low_impact: {
    id: 'low_impact',
    label: 'Low impact',
    kind: 'accessibility',
    protected: false,
    seatedOnly: false,
  },
  dancehall: {
    id: 'dancehall',
    label: 'Dancehall',
    kind: 'dance',
    protected: true,
    seatedOnly: false,
  },
  reggae: { id: 'reggae', label: 'Reggae', kind: 'dance', protected: true, seatedOnly: false },
  chair_dance: {
    id: 'chair_dance',
    label: 'Chair dance',
    kind: 'accessibility',
    protected: true,
    seatedOnly: true,
  },
};
export const isProtectedStyle = (s: DanceStyle): boolean => STYLE_DEFS[s].protected;
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];
export const INTENSITIES = ['low', 'moderate', 'high'] as const;
export type Intensity = (typeof INTENSITIES)[number];
export const QUICK_FIT_MINUTES = [5, 10, 15] as const;
export type QuickFitMinutes = (typeof QUICK_FIT_MINUTES)[number];

export interface WorkoutBlock {
  /** `rest` appears only in strength workouts, between sets. */
  kind: 'warmup' | 'main' | 'cooldown' | 'rest';
  title: string;
  seconds: number;
  cue: string;
  /** The low-impact version of this block. Required for every block. */
  lowImpactAlt: string;
  /** How to do this block seated. Required on every block of a session marked `seatedSuitable` (chair dance sessions are seated throughout, so their cues already are). */
  seatedAlt?: string;
  /** Strength sets counted in reps: the person taps Done when finished, and the clock never ends the block. */
  manual?: boolean;
  setNumber?: number;
  setsTotal?: number;
  reps?: number | null;
  exerciseId?: string;
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
  /**
   * Suitable to do seated. A separate accessibility attribute: any session may be marked suitable (every block then needs `seatedAlt`); `chair_dance` sessions
   * are always suitable. Marking a session suitable is a content claim that needs the exercise professional's review.
   */
  seatedSuitable?: boolean;
  /** Beats per minute, as confirmed by the practitioners who wrote the session. */
  tempoBpm?: [number, number];
  /** Who wrote it, under what rights, and who reviewed it. Absent on sample content. Required for protected styles. */
  provenance?: WorkoutProvenance;
  /** Internal test fixture: never real content, never bundled, shown only when fixtures are switched on in development. */
  fixture?: true;
  /** Original draft content that no qualified person has reviewed: never bundled, shown only in development and review builds, labelled as a draft. */
  draft?: DraftInfo;
}
/**
 * What a draft still needs before it can be published. A draft carries no provenance, so it can never look reviewed; the gate rejects it from the bundle until a
 * reviewer-approved version replaces it (the draft marker is removed and the real provenance is added at that point).
 */
export interface DraftInfo {
  pack: string;
  needs: string[];
}
/** Content shown only in development and review builds (fixtures and unreviewed drafts). */
export const isPreviewOnly = (w: { fixture?: true; draft?: DraftInfo }): boolean =>
  w.fixture === true || w.draft !== undefined;
export interface WorkoutProvenance {
  credits: string[];
  /** Reference to the signed agreement. Never the agreement itself or personal data. */
  rightsRef: string;
  /** Independent fitness and safety review (reviewer must not be the author). */
  review: ContentReview;
  /** Reference to the cultural review record (Dancehall, reggae and chair dance). */
  culturalReviewRef?: string;
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

/** True when a session may be done seated: a chair dance session, or any session explicitly marked suitable. */
export const isSeatedSuitable = (w: Pick<WorkoutDef, 'style' | 'seatedSuitable'>): boolean =>
  STYLE_DEFS[w.style].seatedOnly || w.seatedSuitable === true;

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
  /** Only workouts that can be done seated. */
  seatedOnly?: boolean;
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
    .filter((w) => !f.seatedOnly || isSeatedSuitable(w))
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
    /** Prefer sessions that can be done seated. Never relaxes the impact limit: if none exist, the low-impact result is returned. */
    seated?: boolean;
    excludeIds?: readonly string[];
    seed?: number;
  },
  all: readonly WorkoutDef[] = WORKOUTS,
): WorkoutDef | null {
  // Internal fixtures (development builds only) are never picked for a generic request: only when the person explicitly asked for that style, or for seated sessions.
  const list = all.filter(
    (w) =>
      !isPreviewOnly(w) ||
      (args.style !== undefined && w.style === args.style) ||
      (args.seated === true && isSeatedSuitable(w)),
  );
  const seatedPool = args.seated
    ? filterWorkouts(
        {
          minutes: [args.minutes],
          quickFitOnly: true,
          lowImpactOnly: args.lowImpactOnly,
          intensities: args.intensities,
          seatedOnly: true,
        },
        list,
      ).filter((w) => !args.excludeIds?.includes(w.id))
    : [];
  if (seatedPool.length > 0) {
    const styled = args.style ? seatedPool.filter((w) => w.style === args.style) : [];
    const use = styled.length > 0 ? styled : seatedPool;
    return use[(args.seed ?? 0) % use.length] ?? null;
  }
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
    const gentle = all.filter((w) => rank(w) === lowest);
    // Among equally gentle sessions, the person's chosen style still wins.
    const styled = args.style ? gentle.filter((w) => w.style === args.style) : [];
    return styled.length > 0 ? styled : gentle;
  };
  const chosen = fallback.length === 0 && args.intensities ? gentlest() : fallback;
  return chosen.length === 0 ? null : (chosen[(args.seed ?? 0) % chosen.length] ?? null);
}

export interface SessionSegment {
  index: number;
  kind: WorkoutBlock['kind'];
  title: string;
  /** Planned length. For a `manual` segment it is only an estimate for the progress bar: the clock never ends it. */
  seconds: number;
  /** Strength sets counted in reps: the person taps Done when finished. */
  manual?: boolean;
  setNumber?: number;
  setsTotal?: number;
  reps?: number | null;
  exerciseId?: string;
  /** What to do now. In low-impact mode this is the low-impact version. */
  cue: string;
  cueNormal: string;
  cueLow: string;
  /** The seated version, or null when the block has none. */
  cueSeated: string | null;
}
/** The cue for a mode: seated wins when asked for and available, then low impact, then the normal cue. */
export const cueFor = (
  seg: Pick<SessionSegment, 'cueNormal' | 'cueLow' | 'cueSeated'>,
  lowImpact: boolean,
  seated: boolean,
): string => (seated && seg.cueSeated ? seg.cueSeated : lowImpact ? seg.cueLow : seg.cueNormal);
export function sessionSegments(
  w: Pick<WorkoutDef, 'blocks'>,
  lowImpact: boolean,
  seated = false,
): SessionSegment[] {
  return w.blocks.map((b, index) => {
    const seg = {
      cueNormal: b.cue,
      cueLow: b.lowImpactAlt,
      cueSeated: b.seatedAlt && b.seatedAlt.trim() !== '' ? b.seatedAlt : null,
    };
    return {
      index,
      kind: b.kind,
      title: b.title,
      seconds: b.seconds,
      cue: cueFor(seg, lowImpact, seated),
      ...seg,
      ...(b.manual ? { manual: true } : {}),
      ...(b.setNumber !== undefined ? { setNumber: b.setNumber, setsTotal: b.setsTotal } : {}),
      ...(b.reps !== undefined ? { reps: b.reps } : {}),
      ...(b.exerciseId ? { exerciseId: b.exerciseId } : {}),
    };
  });
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
