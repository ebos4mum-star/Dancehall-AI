import type { DataStore, NewSession } from '../data/types';
import { importableWorkouts, type ExternalWorkout, type HealthProvider } from './contract';

/** First sync looks back this far; later syncs start from the last one (with a day of overlap so a late-arriving workout is not missed). */
export const FIRST_SYNC_DAYS = 30;
const DAY_MS = 86_400_000;

export interface SyncResult {
  imported: number;
  skipped: number;
  failed: number;
}

const clampMinutes = (seconds: number): number =>
  Math.min(180, Math.max(1, Math.round(seconds / 60)));

/** One imported workout as a completed session. Only type, start and duration are used; the title carries the type. */
export function sessionFromWorkout(w: ExternalWorkout): NewSession | null {
  const start = Date.parse(w.startedAt);
  const end = Date.parse(w.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.min(14400, Math.max(1, Math.round((end - start) / 1000)));
  return {
    title: `Apple Health: ${w.activity}`.slice(0, 80),
    minutes: clampMinutes(seconds),
    status: 'completed',
    completedAt: new Date(end).toISOString(),
    durationS: seconds,
    source: 'apple_health',
    externalId: w.externalId,
  };
}

/**
 * Imports new Apple Health workouts as sessions. Safe to run as often as you like: a workout already imported (same id) or overlapping something recorded in the app is skipped
 * before anything is written, and the store and database both refuse a second copy of the same id. Failures never throw; they are counted.
 */
export async function syncHealth(args: {
  store: Pick<DataStore, 'listSessions' | 'createSession'>;
  provider: HealthProvider;
  now: Date;
  lastSyncIso: string | null;
}): Promise<SyncResult> {
  const { store, provider, now } = args;
  if ((await provider.status()) !== 'ready') return { imported: 0, skipped: 0, failed: 0 };
  const since = args.lastSyncIso
    ? new Date(Math.max(Date.parse(args.lastSyncIso) - DAY_MS, now.getTime() - 90 * DAY_MS))
    : new Date(now.getTime() - FIRST_SYNC_DAYS * DAY_MS);
  const external = (await provider.readWorkouts(since.toISOString())).filter(
    (w) => Date.parse(w.endedAt) <= now.getTime() + DAY_MS,
  );
  const recorded = (await store.listSessions({ includeDuplicates: true })).map((s) => ({
    completedAt: s.completedAt,
    durationS: s.durationS ?? s.minutes * 60,
    externalId: s.externalId,
  }));
  const fresh = importableWorkouts(external, recorded);
  let imported = 0;
  let failed = 0;
  for (const w of fresh) {
    const s = sessionFromWorkout(w);
    if (!s) {
      failed += 1;
      continue;
    }
    try {
      await store.createSession(s);
      imported += 1;
    } catch {
      failed += 1;
    }
  }
  return { imported, skipped: external.length - fresh.length, failed };
}
