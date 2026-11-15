import { licenceAllows, type Licence } from './licensing';
import type { ReviewStatus } from './instruction-media';

/**
 * Short instructional demonstrations of single exercises. The WRITTEN instructions are always the instructions: a demonstration only illustrates them, and it is
 * offered only if it is licensed for the country and date, approved by a reviewer, has captions (a text transcript, so it is usable without sound) and loads. No
 * demonstration exists yet (`EXERCISE_DEMOS` is empty on purpose), so the player says plainly that there is none and shows the written steps. This module never
 * creates, invents or implies media.
 */
export interface ExerciseDemo {
  id: string;
  exerciseId: string;
  kind: 'video' | 'audio';
  /** Where the renderer loads it from. Opaque to this module. */
  uri: string;
  /** The captions or transcript. Required: a demonstration without one is never offered. */
  captions: string;
  /** Optional spoken description of what is shown, for people who cannot see the video. */
  audioDescription?: string;
  licenceId: string;
  review: ReviewStatus;
  attribution: { creditLine: string };
}

export const EXERCISE_DEMOS: readonly ExerciseDemo[] = [];

export type DemoUnavailableReason =
  'no_demo' | 'not_licensed' | 'not_reviewed' | 'no_captions' | 'media_missing';
export interface DemoResolution {
  available: boolean;
  reason?: DemoUnavailableReason;
  demo?: ExerciseDemo;
}

export function resolveExerciseDemo(args: {
  exerciseId: string;
  demos?: readonly ExerciseDemo[];
  licences: readonly Licence[];
  country: string | null | undefined;
  today: string;
  /** Demonstration ids whose media failed to load at runtime. */
  missing?: ReadonlySet<string>;
}): DemoResolution {
  const mine = (args.demos ?? EXERCISE_DEMOS).filter((d) => d.exerciseId === args.exerciseId);
  if (mine.length === 0) return { available: false, reason: 'no_demo' };
  const byLicence = new Map(args.licences.map((l) => [l.id, l]));
  let reason: DemoUnavailableReason = 'no_demo';
  for (const d of mine) {
    if (!licenceAllows(byLicence.get(d.licenceId), args.country, args.today))
      reason = 'not_licensed';
    else if (d.review !== 'approved') reason = 'not_reviewed';
    else if (d.captions.trim().length < 10) reason = 'no_captions';
    else if (args.missing?.has(d.id)) reason = 'media_missing';
    else return { available: true, demo: d };
  }
  return { available: false, reason };
}
