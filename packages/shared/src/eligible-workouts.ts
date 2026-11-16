/**
 * Which completed workouts count, once each: the single rule used for progress, XP, league scores, Group Goals and a friend's weekly summary. The database mirrors it in
 * `app.eligible_workouts` (supabase/proposed/social.up.sql and social.patch2_eligible_workouts.sql); both are driven by the same cases
 * (supabase/tests/eligible-workout-cases.json), so they cannot drift.
 *
 * One physical workout can be recorded twice: a guided session in the app and the same session recorded by a watch and imported from Apple Health, in either order and
 * possibly days apart. Nothing is stored to link them; the rule is applied whenever totals are computed, so edits, deletions and delayed imports are handled by
 * recomputing, never by remembering:
 *  1. Recorded in the app: one record per workout id; a repeat of the same workout (same workout id, or same title) completed within ten minutes counts once.
 *  2. Apple Health: dropped if it starts within ten minutes of an in-app workout's start, or during one (a ten-minute lead-in is allowed), whichever order they arrived in.
 *  3. Apple Health records that overlap each other the same way (a watch and a phone both recording) count once: the earliest start wins, ties by id.
 * Separate workouts, including several on the same day, are never merged: only overlap in time can merge two records.
 */
export const WORKOUT_DUPLICATE_MS = 10 * 60_000;
const IMPORT_SOURCE = 'apple_health';

export interface WorkoutLike {
  id: string;
  status: string;
  completedAt: string | null;
  durationS: number | null;
  minutes: number;
  source?: string | null;
  workoutId?: string | null;
  title?: string | null;
}

const seconds = (s: Pick<WorkoutLike, 'durationS' | 'minutes'>): number =>
  s.durationS && s.durationS > 0 ? s.durationS : Math.max(0, s.minutes) * 60;

interface Span<T> {
  s: T;
  start: number;
  end: number;
}

/** True when a starts within the window of b's start, or inside b (allowing the lead-in). The same predicate is used in SQL. */
const overlaps = (a: { start: number }, b: { start: number; end: number }): boolean =>
  Math.abs(a.start - b.start) <= WORKOUT_DUPLICATE_MS ||
  (a.start >= b.start - WORKOUT_DUPLICATE_MS && a.start <= b.end);

/** Completed workouts that count, once each, oldest first. Planned and skipped sessions are not workouts and are never returned. */
export function eligibleWorkouts<T extends WorkoutLike>(sessions: readonly T[]): T[] {
  const spans: Span<T>[] = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    if (s.status !== 'completed' || !s.completedAt || seen.has(s.id)) continue;
    const end = Date.parse(s.completedAt);
    if (!Number.isFinite(end)) continue;
    seen.add(s.id);
    spans.push({ s, end, start: end - seconds(s) * 1000 });
  }
  spans.sort((a, b) => a.end - b.end || a.s.id.localeCompare(b.s.id));
  const native = spans.filter((x) => x.s.source !== IMPORT_SOURCE);
  const imported = spans.filter((x) => x.s.source === IMPORT_SOURCE);

  const keyOf = (s: T) => s.workoutId ?? (s.title ? s.title.toLowerCase() : s.id);
  const keptNative: Span<T>[] = [];
  for (const x of native) {
    const repeat = keptNative.some(
      (o) => keyOf(o.s) === keyOf(x.s) && Math.abs(o.end - x.end) < WORKOUT_DUPLICATE_MS,
    );
    if (!repeat) keptNative.push(x);
  }
  // An import that overlaps ANY in-app workout is that workout (even one dropped above as a repeat of another).
  const free = imported.filter((a) => !native.some((n) => overlaps(a, n)));
  const keptImported = free.filter(
    (a) =>
      !free.some(
        (b) =>
          b !== a &&
          overlaps(a, b) &&
          (b.start < a.start || (b.start === a.start && b.s.id < a.s.id)),
      ),
  );
  return [...keptNative, ...keptImported]
    .sort((a, b) => a.end - b.end || a.s.id.localeCompare(b.s.id))
    .map((x) => x.s);
}
