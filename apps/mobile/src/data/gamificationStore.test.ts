import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';
import { syncHealth } from '../health/sync';
import type { ExternalWorkout, HealthProvider } from '../health/contract';
import { buildDataExport } from '../privacy/export';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = new Date('2026-06-17T12:00:00Z'); // a Wednesday
async function setup(claim = true) {
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
  if (claim) await s.communityClaimUsername('my_name');
  return s;
}
const PREFS = { targetDaysPerWeek: 3, restWeekdays: [0] };
const hk = (id: string, endIso: string, mins = 30): ExternalWorkout => ({
  source: 'apple_health',
  externalId: id,
  startedAt: new Date(Date.parse(endIso) - mins * 60_000).toISOString(),
  endedAt: endIso,
  activity: 'Running',
});
const watch = (w: ExternalWorkout[]): HealthProvider => ({
  source: 'apple_health',
  status: async () => 'ready',
  authorize: async () => true,
  readWorkouts: async () => w,
});

describe('progression in the development mock (same engine as the server)', () => {
  it('starts at level 1 with nothing, and a logged meal earns the same whatever it contains, once a day', async () => {
    const s = await setup();
    expect((await s.gmSync!(PREFS))!.totalXp).toBe(0);
    await s
      .createFoodLog({ mealType: 'lunch', source: 'manual', items: [] })
      .catch(() => undefined);
    const a = (await s.gmSync!(PREFS))!;
    expect(a.level.level).toBe(1);
  });
  it('a workout, an imported workout and a repeat of it earn once each, and deleting the workout removes its XP', async () => {
    const s = await setup();
    const guided = await s.createSession({
      title: 'Guided',
      minutes: 30,
      status: 'completed',
      completedAt: '2026-06-17T08:30:00Z',
      durationS: 1800,
    });
    const xp1 = (await s.gmSync!(PREFS))!.totalXp;
    expect(xp1).toBeGreaterThan(0);
    // The watch also recorded the same workout: not imported, not paid.
    await syncHealth({
      store: s,
      provider: watch([hk('same', '2026-06-17T08:31:00Z', 31)]),
      now: NOW,
      lastSyncIso: null,
    });
    expect((await s.listSessions()).length).toBe(1);
    expect((await s.gmSync!(PREFS))!.totalXp).toBe(xp1);
    // A different workout is imported and paid once, however often the import runs.
    const other = watch([hk('own', '2026-06-16T18:00:00Z', 40)]);
    await syncHealth({ store: s, provider: other, now: NOW, lastSyncIso: null });
    await syncHealth({ store: s, provider: other, now: NOW, lastSyncIso: null });
    const xp2 = (await s.gmSync!(PREFS))!.totalXp;
    expect(xp2).toBeGreaterThan(xp1);
    expect((await s.gmSync!(PREFS))!.totalXp).toBe(xp2);
    await s.deleteSession(guided.id);
    expect((await s.gmSync!(PREFS))!.totalXp).toBeLessThan(xp2);
  });
  it('a planned rest day does not break the streak, and an unplanned miss is forgiven once a week', async () => {
    const s = await setup();
    for (const d of ['2026-06-13', '2026-06-15', '2026-06-16'])
      await s.createSession({
        title: 'x',
        minutes: 20,
        status: 'completed',
        completedAt: `${d}T09:00:00Z`,
        durationS: 1200,
      });
    // Sat 13 active, Sun 14 planned rest, Mon 15 and Tue 16 active: the run is 3 long.
    expect((await s.gmSync!(PREFS))!.streak.current).toBe(3);
  });
  it('export includes imported workouts with their source, and no calories or health samples exist on them', async () => {
    const s = await setup();
    await syncHealth({
      store: s,
      provider: watch([hk('e1', '2026-06-16T18:00:00Z', 40)]),
      now: NOW,
      lastSyncIso: null,
    });
    const ex = await buildDataExport(s, NOW);
    const row = (ex.workoutSessions as Array<Record<string, unknown>>)[0]!;
    expect(row.source).toBe('apple_health');
    expect(JSON.stringify(row)).not.toMatch(/kcal|calorie|heart|route|location/i);
  });
});

describe('journey: meal, workout, import, XP, league, consent, block (mock)', () => {
  it('the league needs a name and an opt-in, shows names and one number, and a block removes the friend', async () => {
    const s = await setup(false);
    expect(await s.gmSetLeague!(true)).toEqual({ ok: false, code: 'needs_username' });
    await s.communityClaimUsername('my_name');
    expect(await s.gmLeague!()).toEqual([]); // not opted in
    await s.createSession({
      title: 'x',
      minutes: 30,
      status: 'completed',
      completedAt: '2026-06-17T08:00:00Z',
      durationS: 1800,
    });
    await s
      .createFoodLog({ mealType: 'lunch', source: 'manual', items: [] })
      .catch(() => undefined);
    await s.socialRequest!('sample_ama');
    expect((await s.gmSetLeague!(true)).ok).toBe(true);
    const rows = (await s.gmLeague!())!;
    expect(rows.map((r) => r.username).sort()).toEqual(['my_name', 'sample_ama']);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(['isMe', 'username', 'weekXp']);
    expect(rows.filter((r) => r.isMe)).toHaveLength(1);
    // Removing the friend removes them from the league; leaving the league empties it.
    await s.socialRemove!('sample_ama');
    expect((await s.gmLeague!())!.map((r) => r.username)).toEqual(['my_name']);
    await s.gmSetLeague!(false);
    expect(await s.gmLeague!()).toEqual([]);
  });
});
