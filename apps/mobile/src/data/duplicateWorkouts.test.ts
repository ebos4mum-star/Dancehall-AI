import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { syncHealth } from '../health/sync';
import type { ExternalWorkout, HealthProvider } from '../health/contract';
import { buildDataExport } from '../privacy/export';

/** One physical workout, recorded twice (in the app and by Apple Health), in either order: every total sees it once. Mock-store level; the real database is covered by gamification.test.sql. */
const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = new Date('2026-06-17T12:00:00Z');
const PREFS = { targetDaysPerWeek: 3, restWeekdays: [0] };
async function setup() {
  const s = new MockStore(memory(), () => NOW);
  await s.signInDev();
  await s.setConsent('health_data_processing', true);
  await s.updateProfile({ displayName: 'Ama', country: 'GH', timeZone: 'UTC' });
  await s.savePrivate({
    birthDate: '1990-01-01',
    heightCm: 170,
    sex: 'female',
    activityLevel: 'light',
  });
  await s.completeOnboarding();
  await s.communityClaimUsername('my_name');
  await s.socialRequest!('sample_ama');
  const g = await s.socialCreateGroup!({
    kind: 'challenge',
    title: 'Shared',
    metric: 'active_minutes',
    startDay: '2026-06-14',
    endDay: '2026-06-20',
    invite: ['sample_ama'],
  });
  if (!g.ok) throw new Error('group');
  return { s, groupId: g.id };
}
const hk = (id: string, endIso: string, mins: number): ExternalWorkout => ({
  source: 'apple_health',
  externalId: id,
  startedAt: new Date(Date.parse(endIso) - mins * 60_000).toISOString(),
  endedAt: endIso,
  activity: 'Dance',
});
const feed = (w: ExternalWorkout[]): HealthProvider => ({
  source: 'apple_health',
  status: async () => 'ready',
  authorize: async () => true,
  readWorkouts: async () => w,
});
const guided = {
  title: 'Guided class',
  minutes: 30,
  status: 'completed' as const,
  completedAt: '2026-06-17T08:30:00Z',
  durationS: 1800,
};
const imported = (id: string, end: string, mins: number) => ({
  title: 'Apple Health: Dance',
  minutes: mins,
  status: 'completed' as const,
  completedAt: end,
  durationS: mins * 60,
  source: 'apple_health' as const,
  externalId: id,
});
const groupTotal = async (s: MockStore, groupId: string) => {
  await s.socialSyncGroup!(groupId);
  const o = await s.socialOverview!();
  return o.groups.find((x) => x.id === groupId)!.byMember.find((m) => m.isMe)!.total;
};
const progressMinutes = async (s: MockStore) =>
  (await s.listSessions())
    .filter((x) => x.status === 'completed')
    .reduce((n, x) => n + (x.durationS ? x.durationS / 60 : x.minutes), 0);

describe('one physical workout counts once, in either order', () => {
  it('guided session saved first, Apple Health import afterwards (the import skips it, nothing double counts)', async () => {
    const { s, groupId } = await setup();
    await s.createSession(guided);
    const before = (await s.gmSync!(PREFS))!.totalXp;
    await syncHealth({
      store: s,
      provider: feed([hk('w', '2026-06-17T08:31:00Z', 31)]),
      now: NOW,
      lastSyncIso: null,
    });
    expect((await s.listSessions({ includeDuplicates: true })).length).toBe(1);
    expect((await s.gmSync!(PREFS))!.totalXp).toBe(before);
    expect(await progressMinutes(s)).toBe(30);
    expect(await groupTotal(s, groupId)).toBe(30);
  });
  it('Apple Health import first, guided session saved afterwards: stored twice, counted once everywhere', async () => {
    const { s, groupId } = await setup();
    await s.createSession(imported('hk-first', '2026-06-17T08:31:00Z', 31));
    const alone = (await s.gmSync!(PREFS))!.totalXp;
    expect(await progressMinutes(s)).toBe(31);
    await s.createSession(guided);
    expect((await s.listSessions({ includeDuplicates: true })).length).toBe(2); // the export and the import still see both records
    expect((await s.listSessions()).filter((x) => x.status === 'completed')).toHaveLength(1); // history, progress and streaks see one
    const both = await s.gmSync!(PREFS);
    expect(both!.totalXp).toBeLessThan(alone + 30); // never two workouts' worth
    const ref = await setup();
    await ref.s.createSession(guided);
    expect(both!.totalXp).toBe((await ref.s.gmSync!(PREFS))!.totalXp); // exactly what the guided session alone earns
    expect(await progressMinutes(s)).toBe(30);
    expect(await groupTotal(s, groupId)).toBe(30); // not 61
    await s.deleteSession((await s.listSessions()).find((x) => x.source !== 'apple_health')!.id);
    expect(await groupTotal(s, groupId)).toBe(31); // the guided copy is gone, so the import counts alone
  });
  it('a retry of the same import, and a second device importing the same workout, add nothing', async () => {
    const { s } = await setup();
    const p = feed([hk('r', '2026-06-17T08:31:00Z', 31)]);
    await syncHealth({ store: s, provider: p, now: NOW, lastSyncIso: null });
    await syncHealth({ store: s, provider: p, now: NOW, lastSyncIso: null });
    await syncHealth({
      store: s,
      provider: feed([hk('r2', '2026-06-17T08:32:00Z', 30)]),
      now: NOW,
      lastSyncIso: null,
    });
    expect((await s.listSessions({ includeDuplicates: true })).length).toBe(1);
  });
  it('separate workouts the same day are all kept', async () => {
    const { s } = await setup();
    await s.createSession(guided);
    await s.createSession(imported('evening', '2026-06-17T18:30:00Z', 40));
    await s.createSession({
      ...guided,
      title: 'Second class',
      completedAt: '2026-06-17T11:00:00Z',
    });
    expect((await s.listSessions()).filter((x) => x.status === 'completed')).toHaveLength(3);
    expect(await progressMinutes(s)).toBe(100);
  });
  it('a delayed import after the guided session was edited or deleted behaves correctly', async () => {
    const { s } = await setup();
    const g = await s.createSession(guided);
    await s.createSession(imported('late', '2026-06-17T08:31:00Z', 31));
    expect(await progressMinutes(s)).toBe(30);
    // Edit: the guided session is changed to a different length so it no longer overlaps the import's start... it still overlaps by time, so still one.
    await s.updateSession(g.id, { durationS: 1500 });
    expect((await s.listSessions()).filter((x) => x.status === 'completed')).toHaveLength(1);
    // Delete the guided session: the imported workout counts again and earns XP.
    await s.deleteSession(g.id);
    const left = (await s.listSessions()).filter((x) => x.status === 'completed');
    expect(left.map((x) => x.source)).toEqual(['apple_health']);
    expect((await s.gmSync!(PREFS))!.totalXp).toBeGreaterThan(0);
  });
  it('export keeps every record (the person owns all of them)', async () => {
    const { s } = await setup();
    await s.createSession(imported('x', '2026-06-17T08:31:00Z', 31));
    await s.createSession(guided);
    const ex = await buildDataExport(s, NOW);
    expect(ex.workoutSessions).toHaveLength(2);
  });
});
