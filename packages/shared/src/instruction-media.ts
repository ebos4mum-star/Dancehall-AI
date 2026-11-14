import { licenceAllows, type Licence } from './licensing';
import { sessionSegments, type WorkoutDef } from './workouts';

/**
 * Instructional media contract. A workout's SEQUENCE AND TIMING always come from the workout definition (its blocks). A media track only
 * says "I demonstrate that same sequence"; it never changes it. Switching presentation therefore cannot reorder or retime a session.
 *
 * No real or 3D tracks exist yet (see docs/INSTRUCTIONAL_MEDIA.md). This module decides what may be offered once they do, and guarantees
 * the mode selector never advertises something that is not actually available.
 */
export type PresentationKind = 'real_dancer' | 'dancer_3d';
export type Presentation = 'guided_text' | PresentationKind;
export type ReviewStatus = 'unreviewed' | 'in_review' | 'approved' | 'changes_requested';

export interface TrackMovement {
  /** Canonical id: see `movementId`. */
  movementId: string;
  /** Seconds this movement is shown for. Must equal the workout block it demonstrates. */
  seconds: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  impact: 'low' | 'moderate' | 'high';
  /** The track shows an authored low-impact version of this movement. */
  hasLowImpactVersion: boolean;
}
export interface InstructionalTrack {
  id: string;
  workoutId: string;
  presentation: PresentationKind;
  /** Licence covering this track (and any likeness or music baked into it). */
  licenceId: string;
  review: ReviewStatus;
  /** Instructor (real) or character/animator credit (3D). Required so attribution can always be shown. */
  attribution: { creditLine: string; instructorId: string | null };
  /** Where the renderer loads it from. Opaque to this module. */
  uri: string;
  /** In workout order, one per block. */
  movements: TrackMovement[];
  /** 3D only: rig/animation set identifier, so a character change cannot silently swap choreography. */
  rigId?: string;
}

/** The canonical id of the movement shown in block `index` of a workout. */
export const movementId = (workoutId: string, index: number): string => `${workoutId}:${index}`;

export type UnavailableReason =
  | 'no_asset'
  | 'not_licensed'
  | 'not_reviewed'
  | 'sequence_mismatch'
  | 'no_low_impact_version'
  | 'media_missing';

export interface PresentationOption {
  kind: PresentationKind;
  available: boolean;
  reason?: UnavailableReason;
  track?: InstructionalTrack;
}
export interface PresentationResolution {
  options: PresentationOption[];
  /** What the player shows now. Always something real: guided text when no track qualifies. */
  active: Presentation;
  /** Set when the requested presentation could not be honoured. */
  fallback?: UnavailableReason;
}

/** Whether a track demonstrates exactly this workout, in this order, for these durations. */
export function sequenceMatches(
  workout: Pick<WorkoutDef, 'id' | 'blocks'>,
  track: InstructionalTrack,
): boolean {
  const segs = sessionSegments(workout, false);
  return (
    track.workoutId === workout.id &&
    track.movements.length === segs.length &&
    segs.every((s, i) => {
      const m = track.movements[i]!;
      return m.movementId === movementId(workout.id, i) && m.seconds === s.seconds;
    })
  );
}

const ORDER: PresentationKind[] = ['real_dancer', 'dancer_3d'];

/**
 * Which presentations can be offered. A track qualifies only if it is licensed for the country and date, approved by a reviewer, matches the
 * workout sequence exactly, loads (not in `missing`), and, when low impact is on, has a low-impact version of every movement.
 * `requested` is honoured only when available; otherwise the first available is used, otherwise guided text.
 */
export function resolvePresentation(args: {
  workout: Pick<WorkoutDef, 'id' | 'blocks'>;
  tracks: readonly InstructionalTrack[];
  licences: readonly Licence[];
  country: string | null | undefined;
  today: string;
  lowImpact: boolean;
  requested?: Presentation;
  /** Track ids whose media failed to load at runtime. */
  missing?: ReadonlySet<string>;
}): PresentationResolution {
  const byLicence = new Map(args.licences.map((l) => [l.id, l]));
  const options: PresentationOption[] = ORDER.map((kind) => {
    const mine = args.tracks.filter(
      (t) => t.workoutId === args.workout.id && t.presentation === kind,
    );
    if (mine.length === 0) return { kind, available: false, reason: 'no_asset' as const };
    let reason: UnavailableReason = 'no_asset';
    for (const t of mine) {
      if (!licenceAllows(byLicence.get(t.licenceId), args.country, args.today))
        reason = 'not_licensed';
      else if (t.review !== 'approved') reason = 'not_reviewed';
      else if (!sequenceMatches(args.workout, t)) reason = 'sequence_mismatch';
      else if (args.missing?.has(t.id)) reason = 'media_missing';
      else if (args.lowImpact && !t.movements.every((m) => m.hasLowImpactVersion))
        reason = 'no_low_impact_version';
      else return { kind, available: true, track: t };
    }
    return { kind, available: false, reason };
  });
  const usable = (p: Presentation | undefined) =>
    p && p !== 'guided_text' ? options.find((o) => o.kind === p && o.available) : undefined;
  const asked = usable(args.requested);
  if (asked) return { options, active: asked.kind };
  const first = options.find((o) => o.available);
  const wanted = args.requested && args.requested !== 'guided_text' ? args.requested : undefined;
  const why = wanted ? options.find((o) => o.kind === wanted)?.reason : undefined;
  return {
    options,
    active: first?.kind ?? 'guided_text',
    ...(why ? { fallback: why } : {}),
  };
}
