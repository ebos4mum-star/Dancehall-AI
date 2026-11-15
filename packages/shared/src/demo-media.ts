import { licenceAllows, type Licence } from './licensing';
import { fixturesEnabled } from './content-state';
import type { ReviewStatus } from './instruction-media';
import type { ContentReviewer } from './strength';

/**
 * Demonstration clips: ONE model for every place a movement is shown (dance blocks, chair dance, strength exercises, "Use what you have"). A clip illustrates the
 * written instructions and never replaces them. The subject is either an exercise id or, for a dance block, `workoutId:blockIndex` (`movementId` in
 * instruction-media.ts). Three states are kept strictly apart:
 *
 *  - APPROVED: reviewed and approved by a qualified reviewer who is not the author, with a cleared licence for the country and date, captions, and attribution.
 *    Only these may ever ship in the bundle (the bundled-content gate enforces it).
 *  - DRAFT: anything not approved. Resolved only in development and review builds, always labelled, never counted as approved.
 *  - NONE: no clip, or one that fails a rule (reason given). The player then shows the written instructions and says plainly that there is no demonstration.
 *
 * No real demonstration exists, so `DEMO_CLIPS` is empty on purpose. Nothing here creates, implies or publishes media.
 */
export interface CaptionCue {
  startS: number;
  endS: number;
  text: string;
}
export interface DemoClip {
  id: string;
  subjectId: string;
  kind: 'video' | 'audio';
  /** Where the renderer loads it from. `fixture:placeholder` means the built-in placeholder surface (no file). */
  uri: string;
  posterUri?: string;
  durationS: number;
  /** The full transcript: required, so a clip is always usable without sound. */
  captions: string;
  /** Optional timed captions; when present the player shows the cue for the current moment, otherwise the transcript. */
  captionCues?: CaptionCue[];
  /** Optional spoken description of what is shown, for people who cannot see the video. */
  audioDescription?: string;
  /** The licence record covering the clip and any likeness or music in it. */
  licence?: Licence;
  review: ReviewStatus;
  reviewer?: ContentReviewer;
  attribution: { creditLine: string };
  /** Internal test fixture (placeholder, never a demonstration). */
  fixture?: true;
}

/** The registry. Empty on purpose; mutable only so internal fixtures can be added in development and review builds. */
export const DEMO_CLIPS: DemoClip[] = [];

export type DemoUnavailableReason =
  'no_demo' | 'not_licensed' | 'not_reviewed' | 'no_captions' | 'media_missing';
export type DemoResolution =
  | { state: 'approved'; clip: DemoClip }
  | { state: 'draft'; clip: DemoClip }
  | { state: 'none'; reason: DemoUnavailableReason };

const captioned = (c: DemoClip): boolean => c.captions.trim().length >= 10;

/**
 * What to show for a subject. Draft clips are returned only when `allowDraft` is true (development and review builds); otherwise an unapproved clip is "not
 * reviewed". `missing` holds clip ids whose media failed to load at runtime, so the player falls back to the written steps.
 */
export function resolveDemo(args: {
  subjectId: string;
  clips?: readonly DemoClip[];
  country: string | null | undefined;
  today: string;
  allowDraft?: boolean;
  missing?: ReadonlySet<string>;
}): DemoResolution {
  const mine = (args.clips ?? DEMO_CLIPS).filter((c) => c.subjectId === args.subjectId);
  if (mine.length === 0) return { state: 'none', reason: 'no_demo' };
  let reason: DemoUnavailableReason = 'no_demo';
  let draft: DemoClip | null = null;
  for (const c of mine) {
    if (!captioned(c)) reason = 'no_captions';
    else if (args.missing?.has(c.id)) reason = 'media_missing';
    else if (c.review === 'approved') {
      if (licenceAllows(c.licence, args.country, args.today) && !c.fixture)
        return { state: 'approved', clip: c };
      reason = 'not_licensed';
    } else if (args.allowDraft) draft ??= c;
    else reason = 'not_reviewed';
  }
  return draft ? { state: 'draft', clip: draft } : { state: 'none', reason };
}

/** The same, using the build's own switch for drafts. */
export const demoFor = (
  subjectId: string,
  country: string | null | undefined,
  today: string,
  missing?: ReadonlySet<string>,
): DemoResolution =>
  resolveDemo({ subjectId, country, today, allowDraft: fixturesEnabled(), missing });

const FITNESS_ROLES = new Set([
  'exercise_physiologist',
  'certified_strength_coach',
  'physiotherapist',
]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What stops a clip being bundled. Only an approved, licensed, captioned, attributed, independently reviewed clip passes. */
export function demoClipProblems(c: DemoClip): string[] {
  const p: string[] = [];
  if (c.fixture) return [`${c.id}: an internal fixture clip is in the bundle`];
  if (c.review !== 'approved') p.push(`${c.id}: not approved`);
  if (!captioned(c)) p.push(`${c.id}: no captions`);
  if (!c.attribution.creditLine.trim()) p.push(`${c.id}: no attribution`);
  if (!c.licence || c.licence.status !== 'cleared') p.push(`${c.id}: no cleared licence`);
  const r = c.reviewer;
  if (!r || !FITNESS_ROLES.has(r.role) || !r.evidenceRef.trim() || !DATE.test(r.reviewedOn))
    p.push(`${c.id}: no complete review record from an exercise professional`);
  else if (r.isAuthor) p.push(`${c.id}: reviewed by its author`);
  if (!(c.durationS > 0)) p.push(`${c.id}: no duration`);
  return p;
}
