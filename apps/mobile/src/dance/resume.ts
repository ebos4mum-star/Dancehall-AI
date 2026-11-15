import AsyncStorage from '@react-native-async-storage/async-storage';
import { initSession, type SessionState, type WorkoutDef } from '@dancehall/shared';

/** What is needed to continue a guided session after an interruption (the workout itself is looked up by id). */
export interface SessionSnapshot {
  v: 1;
  workoutId: string;
  sessionId: string | null;
  index: number;
  remainingS: number;
  elapsedS: number;
  skippedS: number;
  lowImpact: boolean;
  /** Seated version in use. Absent in snapshots written before this existed (treated as off). */
  seated?: boolean;
  savedAt: string;
}
export interface SnapshotStore {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
  remove(k: string): Promise<void>;
}
export const deviceSnapshotStore: SnapshotStore = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
};
const KEY = 'dh.session.inprogress';
/** A snapshot older than this is dropped rather than offered. */
export const MAX_AGE_MS = 12 * 3600 * 1000;

export const snapshotOf = (
  s: SessionState,
  sessionId: string | null,
  now = new Date(),
): SessionSnapshot => ({
  v: 1,
  workoutId: s.workoutId,
  sessionId,
  index: s.index,
  remainingS: s.remainingS,
  elapsedS: s.elapsedS,
  skippedS: s.skippedS,
  lowImpact: s.lowImpact,
  seated: s.seated,
  savedAt: now.toISOString(),
});

export async function writeSnapshot(store: SnapshotStore, snap: SessionSnapshot): Promise<void> {
  try {
    await store.set(KEY, JSON.stringify(snap));
  } catch {
    /* losing a recovery point is not worth interrupting a workout */
  }
}
export async function clearSnapshot(store: SnapshotStore): Promise<void> {
  try {
    await store.remove(KEY);
  } catch {
    /* ignore */
  }
}
export async function readSnapshot(
  store: SnapshotStore,
  now = new Date(),
): Promise<SessionSnapshot | null> {
  try {
    const raw = await store.get(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SessionSnapshot>;
    const ok =
      p.v === 1 &&
      typeof p.workoutId === 'string' &&
      Number.isInteger(p.index) &&
      Number.isFinite(p.remainingS) &&
      Number.isFinite(p.elapsedS) &&
      Number.isFinite(p.skippedS) &&
      typeof p.lowImpact === 'boolean' &&
      typeof p.savedAt === 'string';
    if (!ok) return null;
    const age = now.getTime() - new Date(p.savedAt!).getTime();
    if (!(age >= 0 && age <= MAX_AGE_MS)) return null;
    return { ...(p as SessionSnapshot), sessionId: p.sessionId ?? null };
  } catch {
    return null;
  }
}

/**
 * Rebuilds a PAUSED session from a snapshot, or null if it no longer fits the workout (for example the outline changed).
 * Always paused: the person decides when to carry on, and no time passes while the app was away.
 */
export function restoreSession(
  snap: SessionSnapshot,
  workout: Pick<WorkoutDef, 'id' | 'blocks'>,
): SessionState | null {
  if (snap.workoutId !== workout.id) return null;
  const base = initSession(workout, snap.lowImpact, snap.seated === true);
  const seg = base.segments[snap.index];
  if (!seg || snap.index < 0) return null;
  if (snap.remainingS < 0 || snap.remainingS > seg.seconds) return null;
  if (snap.elapsedS < 0 || snap.skippedS < 0) return null;
  return {
    ...base,
    index: snap.index,
    remainingS: snap.remainingS,
    elapsedS: snap.elapsedS,
    skippedS: snap.skippedS,
    status: 'paused',
  };
}
