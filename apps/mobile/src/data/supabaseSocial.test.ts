import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSocialAdapter } from './supabaseSocial';

type Call = { route: string; body: Record<string, unknown>; auth: string };
function setup(
  replies: Record<string, unknown>,
  token: string | null = 'access-token',
  fail = false,
) {
  const calls: Call[] = [];
  const db = {
    auth: {
      getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
    },
  } as unknown as SupabaseClient;
  const fetchImpl = (async (
    url: string,
    init: { headers: Record<string, string>; body: string },
  ) => {
    if (fail) throw new Error('offline');
    const route = url.split('/social/')[1]!;
    calls.push({ route, body: JSON.parse(init.body), auth: init.headers.authorization! });
    return { json: async () => replies[route] ?? { ok: true } };
  }) as unknown as typeof fetch;
  return {
    a: createSocialAdapter({
      db,
      url: 'https://x.supabase.co/',
      publishableKey: 'pk_public',
      fetchImpl,
    }),
    calls,
  };
}
const G = '33333333-3333-4333-8333-333333333333';

describe('the social adapter', () => {
  it('sends the member token, never the project key, and makes no request without a session', async () => {
    const t = setup({});
    await t.a.socialBlock!('kofi_moves');
    expect(t.calls[0]!.auth).toBe('Bearer access-token');
    const guest = setup({}, null);
    expect(await guest.a.socialBlock!('kofi_moves')).toEqual({ ok: false, code: 'unauthorized' });
    expect(guest.calls).toHaveLength(0);
    await expect(guest.a.socialOverview!()).rejects.toThrow('unauthorized');
  });
  it('maps each store call to its route with only the fields the function expects', async () => {
    const t = setup({
      'friend/request': { ok: true, status: 'accepted' },
      'share/get': { ok: true, shares: ['activity_summary'] },
      'group/create': { ok: true, id: G },
    });
    expect(await t.a.socialRequest!('kofi_moves')).toEqual({ ok: true, status: 'accepted' });
    await t.a.socialRespond!('kofi_moves', true);
    await t.a.socialSetShare!('kofi_moves', 'activity_summary', true);
    expect(await t.a.socialSharesWith!('kofi_moves')).toEqual(['activity_summary']);
    expect(
      await t.a.socialCreateGroup!({
        kind: 'couple',
        title: 'x',
        metric: 'active_days',
        target: 4,
        startDay: '2026-06-15',
        endDay: '2026-06-21',
        invite: ['kofi_moves'],
      }),
    ).toEqual({ ok: true, id: G });
    await t.a.socialRespondGroup!(G, false);
    await t.a.socialLeaveGroup!(G);
    await t.a.socialSyncGroup!(G);
    await t.a.socialRevokeAll!();
    expect(t.calls.map((c) => c.route)).toEqual([
      'friend/request',
      'friend/respond',
      'share/set',
      'share/get',
      'group/create',
      'group/respond',
      'group/leave',
      'group/sync',
      'share/revoke-all',
    ]);
    // No user id is ever sent: identity is the token.
    expect(JSON.stringify(t.calls.map((c) => c.body))).not.toMatch(/user(Id|_id)?"|p_user|actor/i);
    expect(t.calls[3]!.body).toEqual({ username: 'kofi_moves' });
  });
  it('passes the server\'s plain error code through and treats a network failure as "unreachable"', async () => {
    expect(
      await setup({ 'friend/request': { ok: false, code: 'not_found', message: 'x' } }).a
        .socialRequest!('nobody_x'),
    ).toEqual({ ok: false, code: 'not_found' });
    expect(await setup({}, 'access-token', true).a.socialBlock!('kofi_moves')).toEqual({
      ok: false,
      code: 'unreachable',
    });
    expect(await setup({ block: { nonsense: true } }).a.socialBlock!('kofi_moves')).toEqual({
      ok: false,
      code: 'server_error',
    });
  });
  it('fills in an overview from partial data and never invents a username', async () => {
    const o = await setup({ overview: { ok: true, overview: { friends: ['kofi_moves'] } } }).a
      .socialOverview!();
    expect(o).toEqual({
      username: null,
      friends: ['kofi_moves'],
      incoming: [],
      outgoing: [],
      blocked: [],
      groups: [],
    });
  });
  it('a friend view carries only the username and the weekly activity', async () => {
    const t = setup({
      'friend/view': {
        ok: true,
        username: 'kofi_moves',
        activity: { sessions: 1, minutes: 30, activeDays: 1 },
        food: 'leak',
        weight: 70,
      },
    });
    expect(await t.a.socialViewFriend!('kofi_moves')).toEqual({
      ok: true,
      username: 'kofi_moves',
      activity: { sessions: 1, minutes: 30, activeDays: 1 },
    });
  });
});
