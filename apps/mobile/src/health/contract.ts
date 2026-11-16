/**
 * Platform-neutral contract for optional health-app workout import (Apple Health). Read-only: only the workout's type, start, end and id cross this
 * boundary. No calories, heart rate, route or other health sample is ever read, stored or sent. Nothing is asked until the person turns it on in Settings.
 */
export type HealthSource = 'apple_health';

export interface ExternalWorkout {
  source: HealthSource;
  /** Stable id from the source system. */
  externalId: string;
  startedAt: string;
  endedAt: string;
  /** The source's activity label, kept as plain text. No calories are imported or shown. */
  activity: string;
}

export interface HealthProvider {
  readonly source: HealthSource;
  /** 'unavailable' on devices or builds without Apple Health (the web, an iPad without Health, a build without the entitlement). Never prompts. */
  status(): Promise<'unavailable' | 'ready'>;
  /** Shows the system permission sheet for READING workouts only. Resolves false if the sheet could not be shown. Apple never tells an app whether read access was granted. */
  authorize(): Promise<boolean>;
  readWorkouts(sinceIso: string): Promise<ExternalWorkout[]>;
}

/** What the screens use when no real provider exists (web, tests, builds with the flag off): nothing is read and nothing is asked. */
export const disabledHealthProvider: HealthProvider = {
  source: 'apple_health',
  status: async () => 'unavailable',
  authorize: async () => false,
  readWorkouts: async () => [],
};

export interface RecordedSession {
  completedAt: string | null;
  durationS: number | null;
  externalId?: string | null;
}

/** Two workouts are the same if the ids match, or if they start within this many minutes of each other. */
export const DUPLICATE_WINDOW_MIN = 10;

/**
 * Which external workouts are safe to import: not already imported by id, and not a probable duplicate of a session the person already
 * recorded in DanceHall (a guided session saved while a watch also recorded it). Pure; used before any future import.
 */
export function importableWorkouts(
  external: readonly ExternalWorkout[],
  recorded: readonly RecordedSession[],
): ExternalWorkout[] {
  const knownIds = new Set(recorded.map((r) => r.externalId).filter((x): x is string => !!x));
  const seen = new Set<string>();
  const windowMs = DUPLICATE_WINDOW_MIN * 60_000;
  return external.filter((e) => {
    const key = `${e.source}:${e.externalId}`;
    if (seen.has(key) || knownIds.has(e.externalId)) return false;
    seen.add(key);
    const start = Date.parse(e.startedAt);
    if (!Number.isFinite(start)) return false;
    return !recorded.some((r) => {
      if (!r.completedAt) return false;
      const end = Date.parse(r.completedAt);
      const began = end - (r.durationS ?? 0) * 1000;
      return Math.abs(began - start) <= windowMs || (start >= began - windowMs && start <= end);
    });
  });
}
