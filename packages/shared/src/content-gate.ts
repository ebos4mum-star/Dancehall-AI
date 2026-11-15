import { CURATED_FOODS, type FoodRef } from './food-data';
import { foodProblems } from './food-provenance';
import { structureProblems } from './licensing';
import { STRENGTH_EXERCISES, STRENGTH_WORKOUTS, strengthWorkoutProblems } from './strength';
import {
  STYLE_DEFS,
  WORKOUTS,
  isProtectedStyle,
  type WorkoutDef,
  type WorkoutProvenance,
} from './workouts';

/**
 * The bundled-content gate. The app ships its workouts, foods and strength content in the bundle, and the bundle has no database trigger to stop an unreviewed
 * item, so this is the rule, and a test runs it over everything that ships (so CI fails if anything slips through):
 *
 *  - Sample content (no provenance) is allowed only in unprotected styles, exactly as today, and stays labelled as sample.
 *  - Protected styles (Dancehall, reggae, chair dance) may be bundled only with credited authors, a rights reference, an independent fitness and safety review by a
 *    qualified role, tempo confirmed by the practitioners and, for Dancehall and reggae, a cultural review reference.
 *  - A session marked suitable for seated participation needs a seated version of every block.
 *  - Internal fixtures are never allowed in the bundle, and a fixture cannot carry provenance (it must not look reviewed).
 *  - Foods keep synthetic status unless they pass the provenance rules (food-provenance.ts); no value is ever written by this code.
 *
 * Nothing here decides that content is good. It only refuses content that cannot show who made it, under what rights and who independently reviewed it.
 */
const FITNESS_ROLES = new Set([
  'exercise_physiologist',
  'certified_strength_coach',
  'physiotherapist',
]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const filled = (s: string | undefined): boolean => typeof s === 'string' && s.trim().length >= 3;

export function provenanceProblems(w: WorkoutDef, p: WorkoutProvenance): string[] {
  const out: string[] = [];
  if (p.credits.length === 0 || p.credits.some((c) => !filled(c))) out.push('no credited author');
  if (!filled(p.rightsRef)) out.push('no rights reference');
  const r = p.review;
  if (r.status !== 'approved') out.push('fitness and safety review is not approved');
  if (!r.reviewerRole || !FITNESS_ROLES.has(r.reviewerRole))
    out.push('the reviewer must be an exercise professional, strength coach or physiotherapist');
  if (!filled(r.evidenceRef) || !r.reviewedOn || !DATE.test(r.reviewedOn))
    out.push('review record incomplete');
  if (r.isAuthor !== false) out.push('the reviewer must be independent of the author');
  if ((w.style === 'dancehall' || w.style === 'reggae') && !filled(p.culturalReviewRef))
    out.push('Dancehall and reggae sessions need a cultural review reference');
  return out;
}

/** Everything that stops a workout being bundled. Fixtures are judged by the fixture rules, real content by the full rules. */
export function workoutProblems(w: WorkoutDef): string[] {
  const out: string[] = [];
  out.push(...structureProblems(w.blocks));
  if (w.safety.length === 0) out.push('no safety notes');
  if (w.tempoBpm) {
    const [lo, hi] = w.tempoBpm;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 40 || hi > 220 || lo >= hi)
      out.push('tempo range must be whole beats per minute, 40 to 220, lowest first');
  }
  if (w.style === 'chair_dance' && w.seatedSuitable === false)
    out.push('chair dance sessions are always seated');
  if (w.seatedSuitable === true && !STYLE_DEFS[w.style].seatedOnly) {
    if (w.blocks.some((b) => !b.seatedAlt || b.seatedAlt.trim() === ''))
      out.push(
        'a session marked suitable for seated participation needs a seated version of every block',
      );
  }
  if (w.fixture) {
    if (!w.title.startsWith('[Internal fixture]'))
      out.push('fixture titles must start with "[Internal fixture]"');
    if (w.provenance) out.push('a fixture must not carry provenance (it must not look reviewed)');
    return out;
  }
  if (!w.provenance) {
    if (isProtectedStyle(w.style))
      out.push(
        `${STYLE_DEFS[w.style].label} content needs provenance: credited authors, rights, independent review${w.style === 'chair_dance' ? '' : ' and a cultural review'}`,
      );
    return out;
  }
  out.push(...provenanceProblems(w, w.provenance));
  if (isProtectedStyle(w.style) && !w.tempoBpm)
    out.push('protected styles need a tempo range confirmed by the practitioners');
  return out;
}

export interface BundleReport {
  problems: string[];
}
/**
 * The whole bundle, as shipped. Internal fixtures are rejected outright. Pass lists to check something else (tests do).
 */
export function bundledContentProblems(
  lists: {
    workouts?: readonly WorkoutDef[];
    foods?: readonly FoodRef[];
    strengthWorkouts?: typeof STRENGTH_WORKOUTS;
    strengthExercises?: typeof STRENGTH_EXERCISES;
  } = {},
): string[] {
  const out: string[] = [];
  for (const w of lists.workouts ?? WORKOUTS) {
    if (w.fixture) out.push(`${w.id}: an internal fixture is in the bundle`);
    else for (const p of workoutProblems(w)) out.push(`${w.id}: ${p}`);
  }
  for (const f of lists.foods ?? CURATED_FOODS) for (const p of foodProblems(f)) out.push(p);
  const sw = lists.strengthWorkouts ?? STRENGTH_WORKOUTS;
  const se = lists.strengthExercises ?? STRENGTH_EXERCISES;
  for (const w of sw) {
    if (w.fixture) {
      out.push(`${w.id}: an internal fixture is in the bundle`);
      continue;
    }
    // Strength content in the bundle must already pass the review gate: there is no "sample" strength content.
    for (const p of strengthWorkoutProblems(w, se)) out.push(`${w.id}: ${p}`);
  }
  for (const e of se) if (e.fixture) out.push(`${e.id}: an internal fixture is in the bundle`);
  return out;
}
