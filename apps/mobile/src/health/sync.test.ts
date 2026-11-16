import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from '../data/mockStore';
import type { ExternalWorkout, HealthProvider } from './contract';
import { readHealthPrefs, writeHealthPrefs, type PrefsRaw } from './prefs';
import { sessionFromWorkout, syncHealth } from './sync';
import { prettyActivity } from './activityName';
import { computeGamification, DEFAULT_GM_PREFS } from '@dancehall/shared';

const mem = (): KeyValue & PrefsRaw => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = new Date('2026-06-17T12:00:00Z');
const hk = (id: string, start: string, mins = 30, activity = 'Running'): ExternalWorkout => ({
  source: 'apple_health',
  externalId: id,
  startedAt: start,
  endedAt: new Date(Date.parse(start) + mins * 60_000).toISOString(),
  activity,
});
const provider = (
  workouts: ExternalWorkout[],
  status: 'ready' | 'unavailable' = 'ready',
): HealthProvider => ({
  source: 'apple_health',
  status: async () => status,
  authorize: async () => true,
  readWorkouts: async () => workouts,
});
async function store() {
  const s = new MockStore(mem(), () => NOW);
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  return s;
}

describe('Apple Health import', () => {
  it('imports new workouts once, however often it runs', async () => {
    const s = await store();
    const p = provider([
      hk('a', '2026-06-16T08:00:00Z'),
      hk('b', '2026-06-15T08:00:00Z', 45, 'Walking'),
    ]);
    const first = await syncHealth({ store: s, provider: p, now: NOW, lastSyncIso: null });
    const second = await syncHealth({ store: s, provider: p, now: NOW, lastSyncIso: null });
    const third = await syncHealth({
      store: s,
      provider: p,
      now: NOW,
      lastSyncIso: NOW.toISOString(),
    });
    expect(first).toEqual({ imported: 2, skipped: 0, failed: 0 });
    expect(second.imported).toBe(0);
    expect(third.imported).toBe(0);
    const all = await s.listSessions();
    expect(all).toHaveLength(2);
    expect(all.every((x) => x.source === 'apple_health' && x.status === 'completed')).toBe(true);
    expect(new Set(all.map((x) => x.externalId)).size).toBe(2);
  });
  it('skips a workout that repeats a session recorded in the app', async () => {
    const s = await store();
    await s.createSession({
      title: 'Guided',
      minutes: 30,
      status: 'completed',
      completedAt: '2026-06-16T08:30:00Z',
      durationS: 1800,
    });
    const r = await syncHealth({
      store: s,
      provider: provider([hk('dup', '2026-06-16T08:01:00Z')]),
      now: NOW,
      lastSyncIso: null,
    });
    expect(r.imported).toBe(0);
    expect(r.skipped).toBe(1);
    expect(await s.listSessions()).toHaveLength(1);
  });
  it('does nothing and asks nothing when Apple Health is unavailable', async () => {
    const s = await store();
    const r = await syncHealth({
      store: s,
      provider: provider([hk('a', '2026-06-16T08:00:00Z')], 'unavailable'),
      now: NOW,
      lastSyncIso: null,
    });
    expect(r).toEqual({ imported: 0, skipped: 0, failed: 0 });
    expect(await s.listSessions()).toHaveLength(0);
  });
  it('a hostile feed (bad dates, end before start, huge durations, long names) never throws or writes junk', async () => {
    const s = await store();
    const feed: ExternalWorkout[] = [
      {
        source: 'apple_health',
        externalId: 'x1',
        startedAt: 'nope',
        endedAt: 'nope',
        activity: 'Run',
      },
      { ...hk('x2', '2026-06-16T10:00:00Z'), endedAt: '2026-06-16T09:00:00Z' },
      hk('x3', '2026-06-10T00:00:00Z', 60 * 24 * 3, 'A'.repeat(300)),
      { ...hk('x4', '2026-06-18T12:00:00Z'), endedAt: '2027-01-01T00:00:00Z' },
    ];
    const r = await syncHealth({ store: s, provider: provider(feed), now: NOW, lastSyncIso: null });
    expect(r.failed + r.imported + r.skipped).toBeGreaterThan(0);
    for (const x of await s.listSessions()) {
      expect(x.minutes).toBeLessThanOrEqual(180);
      expect(x.title.length).toBeLessThanOrEqual(80);
      expect(x.durationS!).toBeLessThanOrEqual(14400);
    }
  });
  it('maps a workout to a session with only type, start and duration', () => {
    const s = sessionFromWorkout(hk('z', '2026-06-16T08:00:00Z', 20, 'Dance'))!;
    expect(s).toMatchObject({
      title: 'Apple Health: Dance',
      minutes: 20,
      durationS: 1200,
      source: 'apple_health',
      externalId: 'z',
    });
    expect(Object.keys(s).sort()).toEqual([
      'completedAt',
      'durationS',
      'externalId',
      'minutes',
      'source',
      'status',
      'title',
    ]);
  });
  it('the store refuses an imported session with no id, a plain session with an id, and a repeated id', async () => {
    const s = await store();
    const base = {
      title: 'x',
      minutes: 20,
      status: 'completed' as const,
      completedAt: '2026-06-16T08:00:00Z',
    };
    await expect(s.createSession({ ...base, source: 'apple_health' })).rejects.toThrow();
    await expect(s.createSession({ ...base, externalId: 'q' })).rejects.toThrow();
    await s.createSession({ ...base, source: 'apple_health', externalId: 'q' });
    await expect(
      s.createSession({
        ...base,
        completedAt: '2026-06-15T08:00:00Z',
        source: 'apple_health',
        externalId: 'q',
      }),
    ).rejects.toThrow();
  });
  it('imported workouts earn XP once, and not twice alongside an overlapping in-app session', async () => {
    const s = await store();
    await s.createSession({
      title: 'Guided',
      minutes: 30,
      status: 'completed',
      completedAt: '2026-06-17T08:30:00Z',
      durationS: 1800,
    });
    await syncHealth({
      store: s,
      provider: provider([
        hk('dup', '2026-06-17T08:02:00Z'),
        hk('own', '2026-06-16T18:00:00Z', 40, 'Cycling'),
      ]),
      now: NOW,
      lastSyncIso: null,
    });
    const sessions = (await s.listSessions()).map((x) => ({
      id: x.id,
      status: x.status,
      completedAt: x.completedAt,
      durationS: x.durationS,
      minutes: x.minutes,
      source: x.source,
      style: x.style,
    }));
    const g = computeGamification({
      today: '2026-06-17',
      timeZone: 'UTC',
      sessions,
      mealLogDays: [],
      habitDays: [],
      activeHabitCount: 0,
      prefs: DEFAULT_GM_PREFS,
    });
    expect(g.events.filter((e) => e.kind === 'workout')).toHaveLength(2);
  });
  it('preferences are per account, default off, and tolerate junk', async () => {
    const raw = mem();
    expect(await readHealthPrefs(raw, 'u1')).toEqual({ enabled: false, lastSyncIso: null });
    await writeHealthPrefs(raw, 'u1', { enabled: true, lastSyncIso: NOW.toISOString() });
    expect((await readHealthPrefs(raw, 'u1')).enabled).toBe(true);
    expect((await readHealthPrefs(raw, 'u2')).enabled).toBe(false);
    await raw.set('dh.health.v1.u3', '{not json');
    expect((await readHealthPrefs(raw, 'u3')).enabled).toBe(false);
  });
  it('activity names read well', () => {
    expect(prettyActivity('functionalStrengthTraining')).toBe('Functional strength training');
    expect(prettyActivity(undefined)).toBe('Workout');
  });
});
