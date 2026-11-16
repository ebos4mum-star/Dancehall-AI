import { describe, expect, it } from 'vitest';
import {
  SOCIAL_ROUTES,
  createSocialServer,
  leaksIdentifier,
  type SocialDeps,
} from './social-server';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const ALLOWED_FNS = new Set([
  'social_overview',
  'community_profile',
  'community_claim_username',
  'social_request',
  'social_respond',
  'social_cancel',
  'social_remove',
  'social_block',
  'social_unblock',
  'social_set_share',
  'social_shares_with',
  'social_revoke_all',
  'social_view_friend',
  'social_create_group',
  'social_respond_group',
  'social_leave_group',
  'social_sync_group',
  'community_burst',
]);

function setup(
  handlers: Record<string, (a: Record<string, unknown>) => unknown> = {},
  opts: { burst?: () => boolean; errors?: unknown[] } = {},
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const deps: SocialDeps = {
    rpc: {
      async call(fn, args) {
        calls.push({ fn, args });
        if (fn === 'community_burst') return opts.burst ? opts.burst() : true;
        const h = handlers[fn];
        if (!h) return null;
        return h(args);
      },
    },
    auth: {
      async verify(token) {
        if (token === 'member') return { userId: ME, aal: 'aal1' };
        if (token === 'throws') throw new Error('auth down');
        return null;
      },
    },
    onError: (e) => opts.errors?.push(e),
  };
  const server = createSocialServer(deps);
  const send = (route: string, body: unknown = {}, token: string | null = 'member') =>
    server.handle({ route, token, body });
  const db = () => calls.filter((c) => c.fn !== 'community_burst');
  return { send, calls, db };
}

describe('every route needs a signed-in member', () => {
  it('refuses no token, a garbage token and an auth failure, and never touches the database', async () => {
    for (const route of SOCIAL_ROUTES) {
      for (const token of [null, 'garbage', 'throws']) {
        const t = setup();
        const r = await t.send(route, { username: 'kofi_moves' }, token);
        expect(r.status, `${route} ${token}`).toBe(401);
        expect(t.calls, `${route} ${token}`).toHaveLength(0);
      }
    }
  });
  it('there is no public route', () => {
    expect(SOCIAL_ROUTES.length).toBeGreaterThan(15);
  });
  it('an unknown route is a plain 404 and a wrong body type is a 400', async () => {
    const t = setup();
    expect((await t.send('feed')).status).toBe(404);
    expect((await t.send('overview', [1, 2])).status).toBe(400);
    expect((await t.send('overview', 'x')).status).toBe(400);
    expect(t.calls).toHaveLength(0);
  });
  it('refuses oversized bodies before doing anything', async () => {
    const t = setup();
    const r = await t.send('friend/request', { username: 'kofi_moves', junk: 'x'.repeat(9000) });
    expect(r.status).toBe(413);
    expect(t.calls).toHaveLength(0);
  });
});

describe('identity comes only from the verified token', () => {
  it('ignores any user id in the body', async () => {
    const t = setup({ social_request: () => 'requested' });
    const r = await t.send('friend/request', {
      username: 'Kofi_Moves',
      user: OTHER,
      userId: OTHER,
      p_user: OTHER,
      actor: OTHER,
    });
    expect(r.status).toBe(200);
    expect(t.db()).toEqual([{ fn: 'social_request', args: { p_user: ME, p_name: 'kofi_moves' } }]);
  });
  it('uses the token user for every database call', async () => {
    const t = setup();
    const bodies: Array<[string, Record<string, unknown>]> = [
      ['overview', {}],
      ['profile', {}],
      ['username/claim', { username: 'ama_moves' }],
      ['friend/respond', { username: 'kofi_moves', accept: true }],
      ['friend/cancel', { username: 'kofi_moves' }],
      ['friend/remove', { username: 'kofi_moves' }],
      ['block', { username: 'kofi_moves' }],
      ['unblock', { username: 'kofi_moves' }],
      ['share/set', { username: 'kofi_moves', category: 'activity_summary', on: true }],
      ['share/get', { username: 'kofi_moves' }],
      ['share/revoke-all', {}],
      ['friend/view', { username: 'kofi_moves' }],
      ['group/respond', { groupId: GROUP, accept: false }],
      ['group/leave', { groupId: GROUP }],
      ['group/sync', { groupId: GROUP }],
      [
        'group/create',
        {
          kind: 'challenge',
          title: 'June',
          metric: 'active_minutes',
          startDay: '2026-06-01',
          endDay: '2026-06-30',
          invite: ['kofi_moves'],
        },
      ],
    ];
    for (const [route, body] of bodies) {
      const r = await t.send(route, { ...body, p_user: OTHER });
      expect(r.status, route).toBe(200);
    }
    expect(t.db().length).toBe(bodies.length);
    for (const c of t.db()) {
      expect(c.args.p_user, c.fn).toBe(ME);
      expect(ALLOWED_FNS.has(c.fn), c.fn).toBe(true);
    }
  });
});

describe('validation', () => {
  const bad: Array<[string, unknown]> = [
    ['friend/request', {}],
    ['friend/request', { username: '' }],
    ['friend/request', { username: 'ab' }],
    ['friend/request', { username: 'has space' }],
    ['friend/request', { username: 'x'.repeat(21) }],
    ['friend/request', { username: 'under_' }],
    ['friend/request', { username: 'dou__ble' }],
    ['friend/request', { username: 12 }],
    ['friend/request', { username: "kofi'; drop table x;--" }],
    ['friend/respond', { username: 'kofi_moves' }],
    ['friend/respond', { username: 'kofi_moves', accept: 'yes' }],
    ['share/set', { username: 'kofi_moves', on: true }],
    ['share/set', { username: 'kofi_moves', category: 'activity_summary', on: 1 }],
    ['share/set', { username: 'kofi_moves', category: 'x'.repeat(41), on: true }],
    ['group/respond', { groupId: 'nope', accept: true }],
    ['group/leave', { groupId: 5 }],
    ['group/sync', {}],
    [
      'group/create',
      {
        kind: 'club',
        title: 'x',
        metric: 'active_days',
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: [],
      },
    ],
    [
      'group/create',
      {
        kind: 'challenge',
        title: '',
        metric: 'active_days',
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: [],
      },
    ],
    [
      'group/create',
      {
        kind: 'challenge',
        title: 'x'.repeat(61),
        metric: 'active_days',
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: [],
      },
    ],
    [
      'group/create',
      {
        kind: 'challenge',
        title: 'x',
        metric: 'steps',
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: [],
      },
    ],
    [
      'group/create',
      {
        kind: 'challenge',
        title: 'x',
        metric: 'active_days',
        startDay: '2026-02-31',
        endDay: '2026-03-02',
        invite: [],
      },
    ],
    [
      'group/create',
      {
        kind: 'challenge',
        title: 'x',
        metric: 'active_days',
        startDay: '06/01/2026',
        endDay: '2026-06-02',
        invite: [],
      },
    ],
    [
      'group/create',
      {
        kind: 'challenge',
        title: 'x',
        metric: 'active_days',
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: 'kofi_moves',
      },
    ],
    [
      'group/create',
      {
        kind: 'challenge',
        title: 'x',
        metric: 'active_days',
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: Array(13).fill('kofi_moves'),
      },
    ],
    [
      'group/create',
      {
        kind: 'challenge',
        title: 'x',
        metric: 'active_days',
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: ['BAD NAME'],
      },
    ],
    [
      'group/create',
      {
        kind: 'family',
        title: 'x',
        metric: 'active_days',
        target: 1.5,
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: [],
      },
    ],
    [
      'group/create',
      {
        kind: 'family',
        title: 'x',
        metric: 'active_days',
        target: 0,
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: [],
      },
    ],
    [
      'group/create',
      {
        kind: 'family',
        title: 'x',
        metric: 'active_days',
        target: 100001,
        startDay: '2026-06-01',
        endDay: '2026-06-02',
        invite: [],
      },
    ],
  ];
  it.each(bad)(
    '%s with %j is refused as invalid input, before the database',
    async (route, body) => {
      const t = setup();
      const r = await t.send(route, body);
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('invalid_input');
      expect(t.db()).toHaveLength(0);
    },
  );
  it('normalises names and passes a valid group through', async () => {
    const t = setup({ social_create_group: () => GROUP });
    const r = await t.send('group/create', {
      kind: 'couple',
      title: ' Move together ',
      metric: 'active_days',
      target: 4,
      startDay: '2026-06-15',
      endDay: '2026-06-21',
      invite: ['KOFI_moves'],
    });
    expect(r.body).toEqual({ ok: true, id: GROUP });
    expect(t.db()[0]!.args).toMatchObject({
      p_invite: ['kofi_moves'],
      p_target: 4,
      p_start: '2026-06-15',
    });
  });
});

describe('rate limiting', () => {
  it('stops a member who is going too fast, with a Retry-After, before any work', async () => {
    const t = setup({}, { burst: () => false });
    const r = await t.send('friend/request', { username: 'kofi_moves' });
    expect(r.status).toBe(429);
    expect(r.headers?.['Retry-After']).toBeDefined();
    expect(t.db()).toHaveLength(0);
  });
  it('limits per member (the key carries the verified user, not the network)', async () => {
    const t = setup();
    await t.send('overview');
    const burst = t.calls.find((c) => c.fn === 'community_burst')!;
    expect(burst.args.p_key).toBe(`soc:${ME}`);
  });
  it('limits name claims to a handful an hour', async () => {
    const t = setup();
    await t.send('username/claim', { username: 'ama_moves' });
    expect(t.calls.find((c) => c.fn === 'community_burst')!.args).toMatchObject({
      p_max: 6,
      p_seconds: 3600,
    });
  });
});

describe('errors and privacy of responses', () => {
  const dbError = (code: string) => () => {
    throw new Error(code);
  };
  it.each([
    ['not_found', 404],
    ['self', 400],
    ['already_friends', 409],
    ['already_requested', 409],
    ['no_request', 404],
    ['not_friends', 403],
    ['limit_reached', 409],
    ['invalid_category', 400],
    ['not_member', 403],
    ['closed', 409],
    ['taken', 409],
    ['invalid_username', 400],
    ['too_similar', 409],
    ['already_set', 409],
    ['cooldown', 429],
  ])('maps the database code %s to %i with a plain message', async (code, status) => {
    const t = setup({ social_request: dbError(code) });
    const r = await t.send('friend/request', { username: 'kofi_moves' });
    expect(r.status).toBe(status);
    expect(r.body).toMatchObject({ ok: false, code });
    expect(typeof r.body.message).toBe('string');
  });
  it('turns an unexpected error into a generic 500 and reports only the error, never the request', async () => {
    const errors: unknown[] = [];
    const t = setup(
      { social_request: dbError('relation "secret_table" does not exist') },
      { errors },
    );
    const r = await t.send('friend/request', { username: 'kofi_moves' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/secret_table/);
    expect(errors).toHaveLength(1);
  });
  it('refuses to send a response that holds an internal id outside an id field', async () => {
    const t = setup({ social_overview: () => ({ friends: [OTHER], groups: [] }) });
    const r = await t.send('overview');
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain(OTHER);
  });
  it('allows group ids in id fields, and returns a friend view as username plus activity only', async () => {
    const t = setup({
      social_overview: () => ({
        username: 'ama_moves',
        friends: ['kofi_moves'],
        groups: [{ id: GROUP, title: 'June' }],
      }),
      social_view_friend: () => ({
        username: 'kofi_moves',
        activity: { sessions: 2, minutes: 40, activeDays: 2 },
        extra: 'dropped?',
      }),
    });
    expect((await t.send('overview')).status).toBe(200);
    const v = await t.send('friend/view', { username: 'kofi_moves' });
    expect(v.body).toEqual({
      ok: true,
      username: 'kofi_moves',
      activity: { sessions: 2, minutes: 40, activeDays: 2 },
    });
  });
  it('leaksIdentifier finds ids anywhere', () => {
    expect(leaksIdentifier({ a: [{ b: OTHER }] })).toBe(true);
    expect(leaksIdentifier({ id: GROUP, n: [{ id: GROUP }] })).toBe(false);
  });
  it('a share category is forwarded as text and the database decides (food is refused there)', async () => {
    const t = setup({ social_set_share: dbError('invalid_category') });
    const r = await t.send('share/set', {
      username: 'kofi_moves',
      category: 'food_diary',
      on: true,
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_category');
  });
});
