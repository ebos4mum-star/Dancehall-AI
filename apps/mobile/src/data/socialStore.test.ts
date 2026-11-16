import { describe, expect, it } from 'vitest';
import { MockStore, type KeyValue } from './mockStore';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const clock = { t: new Date('2026-06-15T12:00:00Z') };
async function setup(claim = true) {
  clock.t = new Date('2026-06-15T12:00:00Z');
  const store = new MockStore(memory(), () => clock.t);
  await store.signInDev();
  await store.setConsent('health_data_processing', true);
  await store.updateProfile({ displayName: 'Ama', country: 'GH', timeZone: 'UTC' });
  await store.savePrivate({
    birthDate: '1990-01-01',
    heightCm: 170,
    sex: 'female',
    activityLevel: 'light',
  });
  await store.completeOnboarding();
  if (claim) await store.communityClaimUsername('my_name');
  return store;
}
const done = (minutesAgo: number, minutes = 30) => ({
  title: `Dancehall class ${minutesAgo}`,
  workoutId: null,
  style: 'dancehall',
  minutes,
  status: 'completed' as const,
  completedAt: new Date(clock.t.getTime() - minutesAgo * 60_000).toISOString(),
  durationS: minutes * 60,
});

describe('friends in the development mock', () => {
  it('needs a public name first, and says so', async () => {
    const store = await setup(false);
    expect(await store.socialRequest('sample_ama')).toEqual({ ok: false, code: 'needs_username' });
    expect((await store.socialOverview()).username).toBeNull();
  });
  it('a sample member answers at once; the request, the list and removal all work', async () => {
    const store = await setup();
    expect(await store.socialRequest('sample_ama')).toEqual({ ok: true, status: 'requested' });
    expect((await store.socialOverview()).friends).toEqual(['sample_ama']);
    expect(await store.socialRequest('sample_ama')).toEqual({ ok: false, code: 'already_friends' });
    expect(await store.socialRemove('sample_ama')).toEqual({ ok: true });
    expect((await store.socialOverview()).friends).toEqual([]);
    expect(await store.socialRequest('nobody_here')).toEqual({ ok: false, code: 'not_found' });
  });
  it('blocking removes the friend and hides them', async () => {
    const store = await setup();
    await store.socialRequest('sample_ama');
    expect(await store.socialBlock('sample_ama')).toEqual({ ok: true });
    const o = await store.socialOverview();
    expect(o.friends).toEqual([]);
    expect(o.blocked).toEqual(['sample_ama']);
    expect(await store.socialRequest('sample_ama')).toEqual({ ok: false, code: 'not_found' });
    await store.socialUnblock('sample_ama');
    expect(await store.socialRequest('sample_ama')).toMatchObject({ ok: true });
  });
  it('survives a restart of the store (persistence)', async () => {
    const kv = memory();
    const a = new MockStore(kv, () => clock.t);
    await a.signInDev();
    await a.setConsent('health_data_processing', true);
    await a.updateProfile({ displayName: 'Ama', country: 'GH', timeZone: 'UTC' });
    await a.communityClaimUsername('my_name');
    await a.socialRequest('sample_kofi');
    const b = new MockStore(kv, () => clock.t);
    expect((await b.socialOverview()).friends).toEqual(['sample_kofi']);
  });
});

describe('sharing through the store', () => {
  it('only the weekly activity summary can be shared, and food, weight and health cannot', async () => {
    const store = await setup();
    await store.socialRequest('sample_ama');
    for (const c of ['food', 'weight', 'food_diary', 'health', 'weight_entries'])
      expect(await store.socialSetShare('sample_ama', c, true)).toEqual({
        ok: false,
        code: 'invalid_category',
      });
    expect(await store.socialSharesWith('sample_ama')).toEqual([]);
    expect(await store.socialSetShare('sample_ama', 'activity_summary', true)).toEqual({
      ok: true,
    });
    expect(await store.socialSharesWith('sample_ama')).toEqual(['activity_summary']);
    expect(await store.socialSetShare('sample_ama', 'activity_summary', false)).toEqual({
      ok: true,
    });
    expect(await store.socialSharesWith('sample_ama')).toEqual([]);
  });
  it('a friend who has not chosen to share shows nothing', async () => {
    const store = await setup();
    await store.socialRequest('sample_ama');
    expect(await store.socialViewFriend('sample_ama')).toMatchObject({ ok: true, activity: null });
  });
  it('what leaves the device is computed from workouts only, never from food or weight', async () => {
    const store = await setup();
    await store.addWeight({ weightKg: 70 });
    await store
      .createFoodLog({ mealType: 'lunch', source: 'manual', items: [] })
      .catch(() => undefined);
    await store.createSession(done(60, 30));
    await store.createSession(done(30, 20));
    const g = await store.socialCreateGroup({
      kind: 'challenge',
      title: 'June',
      metric: 'active_minutes',
      startDay: '2026-06-01',
      endDay: '2026-06-30',
      invite: [],
    });
    if (!g.ok) throw new Error();
    await store.socialSyncGroup(g.id);
    const o = await store.socialOverview();
    expect(o.groups[0]!.total).toBe(50);
    expect(JSON.stringify(await store.socialOverview())).not.toMatch(/70|food|weight/i);
  });
});

describe('group goals through the store', () => {
  it('create with a sample friend, sync my minutes, see the totals, leave', async () => {
    const store = await setup();
    await store.socialRequest('sample_kofi');
    await store.createSession(done(90, 40));
    const g = await store.socialCreateGroup({
      kind: 'couple',
      title: 'Move together',
      metric: 'active_minutes',
      target: 200,
      startDay: '2026-06-15',
      endDay: '2026-06-21',
      invite: ['sample_kofi'],
    });
    if (!g.ok) throw new Error(JSON.stringify(g));
    await store.socialSyncGroup(g.id);
    const view = (await store.socialOverview()).groups[0]!;
    expect(view.members).toEqual(['my_name', 'sample_kofi']);
    expect(view.total).toBe(40);
    expect(view.byMember.find((m) => m.isMe)!.total).toBe(40);
    expect(await store.socialLeaveGroup(g.id)).toEqual({ ok: true });
    expect((await store.socialOverview()).groups).toEqual([]);
  });
  it('strangers cannot be invited, and syncing a group I am not in fails', async () => {
    const store = await setup();
    expect(
      await store.socialCreateGroup({
        kind: 'challenge',
        title: 'x',
        metric: 'active_days',
        startDay: '2026-06-15',
        endDay: '2026-06-21',
        invite: ['sample_ama'],
      }),
    ).toEqual({ ok: false, code: 'not_friends' });
    expect(await store.socialSyncGroup('nope')).toEqual({ ok: false, code: 'not_member' });
  });
  it('leaving Community erases the social records', async () => {
    const store = await setup();
    await store.socialRequest('sample_ama');
    await store.communityLeave();
    await store.communityClaimUsername('new_name');
    expect((await store.socialOverview()).friends).toEqual([]);
  });
});
