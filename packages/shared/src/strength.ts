import type { ReviewStatus } from './instruction-media';

/**
 * Strength-training CONTENT CONTRACT. This module defines what an exercise and a strength workout must contain before the app may offer it as
 * guided content, and the gate that enforces it. It deliberately ships NO exercises and NO workouts: strength routines must be written or
 * reviewed by a qualified professional (see docs/FITNESS_SAFETY.md, gate F1). Until then the app offers self-directed logging only
 * (walk/strength entries in wellness.ts) and says so.
 */
export const STRENGTH_PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'push',
  'pull',
  'carry',
  'core',
] as const;
export type StrengthPattern = (typeof STRENGTH_PATTERNS)[number];
export const STRENGTH_EQUIPMENT = ['none', 'dumbbells', 'bands'] as const;
export type StrengthEquipment = (typeof STRENGTH_EQUIPMENT)[number];

/** Who signed the content off. A reference to the record of the review, never personal data. */
export interface ContentReviewer {
  role: 'certified_strength_coach' | 'physiotherapist' | 'exercise_physiologist';
  /** Reference to the review record or credential check. */
  evidenceRef: string;
  reviewedOn: string;
  /** The reviewer must not be the author. */
  isAuthor: boolean;
}

export interface StrengthExerciseDef {
  id: string;
  name: string;
  pattern: StrengthPattern;
  equipment: StrengthEquipment;
  /** Short form cues, in the order they should be read. */
  cues: string[];
  /** An easier version (required: every exercise must have one). */
  regression: string;
  /** A harder version, optional. */
  progression: string | null;
  /** Stop-and-seek-advice notes for this exercise. */
  safety: string[];
  contentOrigin: 'original_text' | 'licensed' | 'commissioned';
  review: ReviewStatus;
  reviewer: ContentReviewer | null;
}

export interface StrengthBlock {
  exerciseId: string;
  sets: number;
  /** Either reps or seconds. */
  reps: number | null;
  seconds: number | null;
  restSeconds: number;
}
export interface StrengthWorkoutDef {
  id: string;
  title: string;
  level: 'beginner' | 'intermediate';
  minutes: number;
  equipment: StrengthEquipment;
  warmup: { title: string; seconds: number; cue: string };
  cooldown: { title: string; seconds: number; cue: string };
  blocks: StrengthBlock[];
  safety: string[];
  contentOrigin: StrengthExerciseDef['contentOrigin'];
  review: ReviewStatus;
  reviewer: ContentReviewer | null;
}

/** The catalogue. Empty on purpose: nothing may be added without qualified review. */
export const STRENGTH_EXERCISES: readonly StrengthExerciseDef[] = [];
export const STRENGTH_WORKOUTS: readonly StrengthWorkoutDef[] = [];

const reviewProblem = (
  who: string,
  review: ReviewStatus,
  r: ContentReviewer | null,
): string | null => {
  if (review !== 'approved') return `${who} has not been approved by a qualified reviewer.`;
  if (!r || !r.evidenceRef.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedOn))
    return `${who} is marked approved but has no review record.`;
  if (r.isAuthor) return `${who} was reviewed by its author; an independent reviewer is required.`;
  return null;
};

export function exerciseProblems(e: StrengthExerciseDef): string[] {
  const p: string[] = [];
  const rp = reviewProblem(`Exercise "${e.name}"`, e.review, e.reviewer);
  if (rp) p.push(rp);
  if (e.cues.length === 0) p.push(`Exercise "${e.name}" has no form cues.`);
  if (!e.regression.trim()) p.push(`Exercise "${e.name}" has no easier version.`);
  if (e.safety.length === 0) p.push(`Exercise "${e.name}" has no safety notes.`);
  return p;
}

/**
 * Whether a strength workout may be offered as guided content. Every reason it cannot is returned in plain language, so the admin checklist and the
 * screen can both say exactly what is missing. A workout is active only when it AND every exercise in it pass.
 */
export function strengthWorkoutProblems(
  w: StrengthWorkoutDef,
  exercises: readonly StrengthExerciseDef[] = STRENGTH_EXERCISES,
): string[] {
  const p: string[] = [];
  const rp = reviewProblem(`Workout "${w.title}"`, w.review, w.reviewer);
  if (rp) p.push(rp);
  if (w.blocks.length === 0) p.push(`Workout "${w.title}" has no exercises.`);
  if (w.safety.length === 0) p.push(`Workout "${w.title}" has no safety notes.`);
  if (w.warmup.seconds <= 0 || w.cooldown.seconds <= 0)
    p.push(`Workout "${w.title}" needs a warm-up and a cool-down.`);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (const b of w.blocks) {
    const e = byId.get(b.exerciseId);
    if (!e) {
      p.push(`Workout "${w.title}" uses an exercise that does not exist (${b.exerciseId}).`);
      continue;
    }
    p.push(...exerciseProblems(e));
    if ((b.reps === null) === (b.seconds === null))
      p.push(`"${e.name}" must be timed or counted in reps, not both or neither.`);
    if (b.sets < 1 || b.sets > 6 || b.restSeconds < 0)
      p.push(`"${e.name}" has an unusual set or rest value.`);
    if (e.equipment !== 'none' && e.equipment !== w.equipment)
      p.push(`"${e.name}" needs ${e.equipment}, which the workout does not declare.`);
  }
  return [...new Set(p)];
}

/** Workouts the app may show as guided content right now. Today this is always empty. */
export function activeStrengthWorkouts(
  workouts: readonly StrengthWorkoutDef[] = STRENGTH_WORKOUTS,
  exercises: readonly StrengthExerciseDef[] = STRENGTH_EXERCISES,
): StrengthWorkoutDef[] {
  return workouts.filter((w) => strengthWorkoutProblems(w, exercises).length === 0);
}

/** What a reviewer must confirm, shown on screen and in the admin checklist. */
export const STRENGTH_REVIEW_REQUIREMENTS: readonly string[] = [
  'Each exercise has form cues, an easier version and safety notes.',
  'Reviewed by a qualified professional who is not the author, with a review record.',
  'Warm-up, cool-down, sets and rest are appropriate for the stated level.',
  'Any video, music or likeness is separately licensed for the region.',
];
