import { eligibleWorkouts } from '@dancehall/shared';
import type { WorkoutSession } from './types';

/**
 * Hides the copy of a workout that is already recorded elsewhere: an Apple Health import of a session saved in the app (either order), a repeat, a second import of
 * the same workout. Planned and skipped sessions are untouched. Everything that totals activity (progress, XP, streaks, challenges, celebrations, summaries) reads
 * the store's session list, so they all see the same once-each activity as Group Goals and the league do on the server. Which copy is hidden is recomputed on every
 * read, so an edit, a deletion or a late import simply changes the answer. Import and export ask for the full list instead (`includeDuplicates`).
 */
export function withoutDuplicateWorkouts(all: readonly WorkoutSession[]): WorkoutSession[] {
  const keep = new Set(eligibleWorkouts(all).map((x) => x.id));
  return all.filter((s) => s.status !== 'completed' || keep.has(s.id));
}
