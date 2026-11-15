import { describe, expect, it } from 'vitest';
import { WORKOUTS, initSession, sessionReduce } from '@dancehall/shared';
import {
  MAX_AGE_MS,
  clearSnapshot,
  readSnapshot,
  restoreSession,
  snapshotOf,
  writeSnapshot,
  type SnapshotStore,
} from './resume';
import { once } from './once';

const mem = (): SnapshotStore => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const w = WORKOUTS[0]!;
const now = new Date('2026-06-15T12:00:00Z');

describe('session recovery', () => {
  it('round-trips a running session and restores it paused, without adding time', async () => {
    let s = initSession(w, false);
    s = sessionReduce(s, { type: 'start' }).state;
    s = sessionReduce(s, { type: 'tick', seconds: 50 }).state;
    const store = mem();
    await writeSnapshot(store, snapshotOf(s, 'sess-1', now));
    const snap = await readSnapshot(store, new Date(now.getTime() + 60_000));
    expect(snap?.sessionId).toBe('sess-1');
    const r = restoreSession(snap!, w)!;
    expect(r.status).toBe('paused');
    expect(r.elapsedS).toBe(s.elapsedS);
    expect(r.remainingS).toBe(s.remainingS);
    expect(r.index).toBe(s.index);
  });
  it('drops stale, corrupt, or mismatched snapshots', async () => {
    const store = mem();
    const snap = snapshotOf(initSession(w, false), null, now);
    await writeSnapshot(store, snap);
    expect(await readSnapshot(store, new Date(now.getTime() + MAX_AGE_MS + 1))).toBeNull();
    expect(await readSnapshot(store, new Date(now.getTime() - 1000))).toBeNull();
    await store.set('dh.session.inprogress', '{not json');
    expect(await readSnapshot(store, now)).toBeNull();
    expect(restoreSession({ ...snap, workoutId: 'other' }, w)).toBeNull();
    expect(restoreSession({ ...snap, index: 999 }, w)).toBeNull();
    expect(restoreSession({ ...snap, remainingS: 99999 }, w)).toBeNull();
    await clearSnapshot(store);
    expect(await readSnapshot(store, now)).toBeNull();
  });
});

describe('session recovery with the seated and easier versions', () => {
  const seatedWorkout = {
    id: 'seated-test',
    blocks: [
      {
        kind: 'warmup' as const,
        title: 'a',
        seconds: 30,
        cue: 'c1',
        lowImpactAlt: 'l1',
        seatedAlt: 's1',
      },
      {
        kind: 'main' as const,
        title: 'b',
        seconds: 30,
        cue: 'c2',
        lowImpactAlt: 'l2',
        seatedAlt: 's2',
      },
    ],
  };
  it('remembers the seated version and restores it paused with the seated cue', async () => {
    let s = initSession(seatedWorkout, false, true);
    s = sessionReduce(s, { type: 'start' }).state;
    s = sessionReduce(s, { type: 'tick', seconds: 10 }).state;
    const store = mem();
    await writeSnapshot(store, snapshotOf(s, null, now));
    const snap = (await readSnapshot(store, now))!;
    expect(snap.seated).toBe(true);
    const back = restoreSession(snap, seatedWorkout)!;
    expect(back.status).toBe('paused');
    expect(back.seated).toBe(true);
    expect(back.segments[0]!.cue).toBe('s1');
    expect(back.elapsedS).toBe(10);
  });
  it('a snapshot written before seated existed still restores, with seated off', async () => {
    const s = initSession(w, false);
    const old = { ...snapshotOf(s, null, now) } as Record<string, unknown>;
    delete old.seated;
    const store = mem();
    await store.set('dh.session.inprogress', JSON.stringify(old));
    const snap = (await readSnapshot(store, now))!;
    expect(snap).not.toBeNull();
    expect(restoreSession(snap, w)!.seated).toBe(false);
  });
});

describe('once (duplicate completion guard)', () => {
  it('ignores concurrent and repeated calls after success', async () => {
    let calls = 0;
    const g = once(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
    });
    const [a, b] = await Promise.all([g.run(), g.run()]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await g.run()).toBe(false);
    expect(calls).toBe(1);
    expect(g.done).toBe(true);
  });
  it('allows a retry after a failure', async () => {
    let n = 0;
    const g = once(async () => {
      n += 1;
      if (n === 1) throw new Error('offline');
    });
    await expect(g.run()).rejects.toThrow('offline');
    expect(g.done).toBe(false);
    expect(await g.run()).toBe(true);
    expect(n).toBe(2);
  });
});
