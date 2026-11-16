import { describe, expect, it } from 'vitest';
import type { Alerter } from './community-alerts';
import {
  createCommunityServer,
  type CommunityDeps,
  type CommunityRequest,
} from './community-server';

const ME = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';
const POST = '33333333-3333-4333-8333-333333333333';
const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const cat = (...p: Uint8Array[]) => {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) {
    o.set(x, i);
    i += x.length;
  }
  return o;
};
const be16 = (n: number) => Uint8Array.of((n >> 8) & 255, n & 255);
const exifData = enc('Exif\0\0GPS-12.34,56.78!');
const jpeg = cat(
  Uint8Array.of(0xff, 0xd8),
  Uint8Array.of(0xff, 0xe1),
  be16(2 + exifData.length),
  exifData,
  Uint8Array.of(0xff, 0xc0),
  be16(11),
  Uint8Array.of(8),
  be16(6),
  be16(8),
  Uint8Array.of(1, 1, 0x11, 0),
  Uint8Array.of(0xff, 0xda),
  be16(4),
  Uint8Array.of(0, 0, 1, 2, 3, 4, 0xff, 0xd9),
);

function slowSetup(max: number) {
  const gates: Array<() => void> = [];
  let active = 0;
  let peak = 0;
  const deps: CommunityDeps = {
    rpc: {
      call: async (fn) =>
        fn === 'community_burst'
          ? true
          : fn === 'community_upload_ticket'
            ? 'image/jpeg'
            : undefined,
    },
    storage: {
      signedUploadUrl: async () => null,
      size: async () => 100,
      download: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((r) => gates.push(r));
        active--;
        return new Uint8Array([1, 2, 3]); // not an image: rejected after the hold, which is all this test needs
      },
      upload: async () => undefined,
      remove: async () => undefined,
      signedUrl: async () => null,
    },
    auth: { verify: async () => ({ userId: ME, aal: 'aal1' }) },
    maintenanceKeyOk: () => false,
    maxConcurrentMedia: max,
  };
  return { server: createCommunityServer(deps), gates, peak: () => peak };
}

function setup(
  handlers: Record<string, (a: Record<string, unknown>) => unknown> = {},
  opts: {
    burstOk?: boolean;
    files?: Record<string, Uint8Array>;
    alerts?: Alerter;
    floorMode?: 'open' | 'text_only' | 'read_only';
    burst?: () => boolean;
  } = {},
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const uploaded: Array<{ path: string; bytes: Uint8Array }> = [];
  const removed: string[] = [];
  let downloads = 0;
  const deps: CommunityDeps = {
    rpc: {
      async call(fn, args) {
        calls.push({ fn, args });
        if (fn === 'community_burst') return opts.burst ? opts.burst() : (opts.burstOk ?? true);
        const h = handlers[fn];
        if (!h) throw new Error(`unexpected rpc ${fn}`);
        return h(args);
      },
    },
    storage: {
      async signedUploadUrl(path) {
        return { url: `https://storage.test/upload/${path}`, token: 'tok' };
      },
      async size(path) {
        const f = opts.files?.[path];
        return f ? f.length : null;
      },
      async download(path) {
        downloads++;
        return opts.files?.[path] ?? null;
      },
      async upload(path, bytes) {
        uploaded.push({ path, bytes });
      },
      async remove(paths) {
        removed.push(...paths);
      },
      async signedUrl(path) {
        return `https://storage.test/sign/${path}?t=1`;
      },
    },
    auth: {
      async verify(token) {
        if (token === 'member') return { userId: ME, aal: 'aal1' };
        if (token === 'staff2') return { userId: STAFF, aal: 'aal2' };
        if (token === 'staff1') return { userId: STAFF, aal: 'aal1' };
        return null;
      },
    },
    maintenanceKeyOk: (k) => k === 'secret-key',
    alerts: opts.alerts,
    floorMode: opts.floorMode,
  };
  const server = createCommunityServer(deps);
  const send = (
    route: string,
    body: unknown = {},
    token: string | null = 'member',
    extra: Partial<CommunityRequest> = {},
  ) => server.handle({ route, token, networkKey: 'net-hash', body, ...extra });
  return { send, calls, uploaded, removed, downloads: () => downloads };
}
const dbCalls = <T extends { fn: string }>(calls: T[]) =>
  calls.filter((c) => c.fn !== 'community_burst');

describe('identity and access', () => {
  it('lets a guest browse and treats a bad token as a guest', async () => {
    const t = setup({ community_feed: () => [] });
    expect((await t.send('feed', {}, null)).status).toBe(200);
    expect((await t.send('feed', {}, 'garbage')).status).toBe(200);
    expect(dbCalls(t.calls).every((c) => c.args.p_viewer === null)).toBe(true);
  });
  it('requires a verified member for every member action', async () => {
    const t = setup();
    for (const r of [
      'post',
      'comment',
      'encourage',
      'report',
      'block',
      'profile',
      'username/claim',
      'upload/ticket',
      'leave',
    ])
      expect((await t.send(r, {}, null)).status).toBe(401);
    expect((await t.send('post', {}, 'garbage')).status).toBe(401);
    expect(dbCalls(t.calls)).toHaveLength(0);
  });
  it('takes the identity only from the token, never from the body', async () => {
    const t = setup({ community_create_post: () => ({ id: POST, status: 'published' }) });
    await t.send('post', {
      type: 'text',
      body: 'hello',
      confirmed: true,
      userId: STAFF,
      p_user: STAFF,
      user_id: STAFF,
    });
    expect(dbCalls(t.calls)[0]!.args.p_user).toBe(ME);
  });
  it('unknown routes are 404 and reveal nothing', async () => {
    const t = setup();
    expect(await t.send('admin/dump', {}, 'staff2')).toMatchObject({ status: 404 });
  });
});

describe('feed output', () => {
  it('returns usernames and signed links only, and counts only for the author', async () => {
    const row = (id: string, mine: boolean) => ({
      id,
      author: 'ama_dances',
      type: 'photo',
      body: 'hi',
      milestone: null,
      created_at: '2026-12-01T10:00:00Z',
      is_mine: mine,
      status: 'published',
      comment_count: 2,
      encouraged_by_me: false,
      encouraged_count: mine ? 7 : null,
      media: [
        {
          kind: 'photo',
          role: 'single',
          path: `m/66666666-6666-4666-8666-666666666666.jpg`,
          durationS: null,
        },
      ],
    });
    const t = setup({
      community_feed: () => [row(POST, true), row('44444444-4444-4444-8444-444444444444', false)],
    });
    const r = await t.send('feed', { limit: 2 });
    const text = JSON.stringify(r.body);
    expect(text).not.toContain(ME);
    expect(text).not.toMatch(/user_id|email|author_id/);
    const posts = r.body.posts as Array<{
      encouragedCount: number | null;
      media: Array<{ uri: string }>;
    }>;
    expect(posts[0]!.encouragedCount).toBe(7);
    expect(posts[1]!.encouragedCount).toBeNull();
    expect(posts[0]!.media[0]!.uri).toMatch(/^https:\/\/storage\.test\/sign\//);
    expect(r.body.nextCursor).toMatch(/^2026-12-01T10:00:00.000Z\|/);
  });
  it('rejects a malformed cursor', async () => {
    const t = setup({ community_feed: () => [] });
    expect((await t.send('feed', { cursor: 'nonsense' }, null)).status).toBe(400);
  });
});

describe('validation', () => {
  const ok = { community_create_post: () => ({ id: POST, status: 'published' }) };
  it('needs explicit confirmation', async () => {
    const t = setup(ok);
    expect(await t.send('post', { type: 'text', body: 'hi' })).toMatchObject({
      status: 400,
      body: { code: 'not_confirmed' },
    });
    expect(await t.send('post', { type: 'text', body: 'hi', confirmed: 'yes' })).toMatchObject({
      body: { code: 'not_confirmed' },
    });
    expect(dbCalls(t.calls)).toHaveLength(0);
  });
  it('refuses bad shapes before touching the database', async () => {
    const t = setup(ok);
    const bad: unknown[] = [
      { type: 'video-chat', body: 'x', confirmed: true },
      { type: 'text', body: 'x'.repeat(3000), confirmed: true },
      { type: 'text', body: 5, confirmed: true },
      { type: 'milestone', milestone: ['x'], confirmed: true },
      { type: 'photo', media: 'nope', confirmed: true },
      {
        type: 'photo',
        media: [{ kind: 'photo', role: 'single', path: 'u/other/aaaa.jpg' }],
        confirmed: true,
      },
      {
        type: 'photo',
        media: [
          {
            kind: 'photo',
            role: 'single',
            path: 'm/../x.jpg',
          },
        ],
        confirmed: true,
      },
      {
        type: 'photo',
        media: [
          {
            kind: 'photo',
            role: 'single',
            path: 'm/11111111-1111-4111-8111-111111111111.jpg/../../x.jpg',
          },
        ],
        confirmed: true,
      },
      {
        type: 'photo',
        media: Array(3).fill({ kind: 'photo', role: 'single', path: 'x' }),
        confirmed: true,
      },
    ];
    for (const b of bad)
      expect((await t.send('post', b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
    expect(dbCalls(t.calls)).toHaveLength(0);
  });
  it('bounds the size of a request', async () => {
    const t = setup(ok);
    expect(
      (await t.send('post', { type: 'text', body: 'x', confirmed: true, junk: 'y'.repeat(30000) }))
        .status,
    ).toBe(413);
    expect((await t.send('post', 'a string')).status).toBe(400);
  });
  it('validates ids, enums and usernames on the other routes', async () => {
    const t = setup({
      community_set_encourage: () => true,
      community_report: () => undefined,
      community_block: () => undefined,
    });
    expect((await t.send('encourage', { postId: 'not-a-uuid', on: true })).status).toBe(400);
    expect((await t.send('encourage', { postId: POST, on: 'yes' })).status).toBe(400);
    expect(
      (await t.send('report', { type: 'post', targetId: POST, reason: 'because' })).status,
    ).toBe(400);
    expect(
      (
        await t.send('report', {
          type: 'post',
          targetId: POST,
          reason: 'spam',
          note: 'x'.repeat(500),
        })
      ).status,
    ).toBe(400);
    expect((await t.send('block', { username: "x'; drop table" })).status).toBe(400);
    expect((await t.send('encourage', { postId: POST, on: true })).status).toBe(200);
  });
  it('explains a refused post without repeating it, and offers support', async () => {
    const t = setup({
      community_create_post: () => {
        throw new Error('blocked');
      },
    });
    const r = await t.send('post', {
      type: 'text',
      body: 'call me on 0201234567',
      confirmed: true,
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('blocked');
    expect(JSON.stringify(r.body)).not.toContain('0201234567');
    const s = await t.send('post', { type: 'text', body: 'I want to die', confirmed: true });
    expect(s.body.support).toBe(true);
  });
  it('validates usernames before the database and returns the rule', async () => {
    const t = setup();
    const r = await t.send('username/claim', { username: 'admin' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_username');
    expect(dbCalls(t.calls)).toHaveLength(0);
  });
  it('maps username errors to useful statuses', async () => {
    for (const [code, status] of [
      ['taken', 409],
      ['cooldown', 409],
      ['too_similar', 409],
      ['needs_username', 409],
    ] as const) {
      const t = setup({
        community_change_username: () => {
          throw new Error(code);
        },
      });
      expect((await t.send('username/change', { username: 'new_name' })).status).toBe(status);
    }
  });
  it('never leaks unexpected database errors', async () => {
    const t = setup({
      community_comments: () => {
        throw new Error('relation "public.community_posts" does not exist at character 14');
      },
    });
    const r = await t.send('comments', { postId: POST }, null);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/relation|community_posts|character/);
  });
  it('reports look the same whether or not they were new', async () => {
    const t = setup({ community_report: () => undefined });
    const a = await t.send('report', { type: 'post', targetId: POST, reason: 'spam' });
    const b = await t.send('report', { type: 'post', targetId: POST, reason: 'spam' });
    expect(a).toEqual(b);
  });
});

describe('rate limits', () => {
  it('refuses before doing any work, and says when to retry', async () => {
    const t = setup({ community_create_post: () => ({}) }, { burstOk: false });
    const r = await t.send('post', { type: 'text', body: 'x', confirmed: true });
    expect(r.status).toBe(429);
    expect(r.headers?.['Retry-After']).toBeDefined();
    expect(dbCalls(t.calls)).toHaveLength(0);
  });
  it('limits guests by hashed network address and members by account', async () => {
    const t = setup({ community_feed: () => [] });
    await t.send('feed', {}, null);
    await t.send('feed', {}, 'member');
    const keys = t.calls.filter((c) => c.fn === 'community_burst').map((c) => c.args.p_key);
    expect(keys).toEqual(['n:net-hash', `u:${ME}`]);
  });
});

describe('staff routes', () => {
  const queue = [
    {
      id: POST,
      target_type: 'post',
      author: 'ama_dances',
      body: 'x',
      status: 'held',
      flags: ['media_review'],
      reasons: [],
      report_count: 0,
      urgent: false,
      age_hours: 3,
      created_at: '2026-12-01T10:00:00Z',
      media: [{ kind: 'photo', role: 'single', path: 'u/x/y.jpg' }],
    },
  ];
  it('needs a second factor before the database is even asked', async () => {
    const t = setup({ community_moderation_queue: () => queue });
    expect((await t.send('mod/queue', {}, 'staff1')).status).toBe(403);
    expect((await t.send('mod/queue', {}, 'member')).status).toBe(403);
    expect((await t.send('mod/queue', {}, null)).status).toBe(401);
    expect(dbCalls(t.calls)).toHaveLength(0);
  });
  it('passes the verified actor and factor level, signs media and shows no ids or emails', async () => {
    const t = setup({ community_moderation_queue: () => queue });
    const r = await t.send('mod/queue', {}, 'staff2');
    expect(dbCalls(t.calls)[0]!.args).toEqual({ p_actor: STAFF, p_aal2: true });
    const text = JSON.stringify(r.body);
    expect(text).toContain('https://storage.test/sign/');
    expect(text).not.toMatch(/user_id|email|"path"/);
  });
  it('lets the database refuse someone without the permission', async () => {
    const t = setup({
      community_moderation_queue: () => {
        throw new Error('forbidden');
      },
    });
    expect((await t.send('mod/queue', {}, 'staff2')).status).toBe(403);
  });
  it('validates actions and deletes files of removed posts', async () => {
    const t = setup({
      community_moderate: () => ['m/77777777-7777-4777-8777-777777777777.jpg'],
      community_restrict: () => undefined,
    });
    expect(
      (await t.send('mod/act', { type: 'post', targetId: POST, action: 'banish' }, 'staff2'))
        .status,
    ).toBe(400);
    expect(
      (
        await t.send(
          'mod/act',
          { type: 'post', targetId: POST, action: 'remove', note: 'unsafe' },
          'staff2',
        )
      ).status,
    ).toBe(200);
    expect(t.removed).toEqual(['m/77777777-7777-4777-8777-777777777777.jpg']);
    expect(
      (
        await t.send(
          'mod/restrict',
          { username: 'ama_dances', restriction: 'muted', hours: 0, reason: 'spam' },
          'staff2',
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await t.send(
          'mod/restrict',
          { username: 'ama_dances', restriction: 'muted', hours: 24, reason: 'spam' },
          'staff2',
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await t.send(
          'mod/restrict',
          { username: 'ama_dances', restriction: 'muted', hours: 24 },
          'staff2',
        )
      ).status,
    ).toBe(400);
  });
});

describe('uploads', () => {
  const path = 'm/55555555-5555-4555-8555-555555555555.jpg';
  it('issues a ticket with a private upload link', async () => {
    const t = setup({ community_issue_upload: () => ({ id: 'x', path }) });
    const r = await t.send('upload/ticket', { kind: 'photo', mime: 'image/jpeg' });
    expect(r.body).toMatchObject({ ok: true, path, token: 'tok' });
    expect(
      (await t.send('upload/ticket', { kind: 'photo', mime: 'application/x-msdownload' })).status,
    ).toBe(400);
  });
  it('checks the real file, strips metadata and records what it found', async () => {
    const t = setup(
      { community_upload_ticket: () => 'image/jpeg', community_verify_upload: () => undefined },
      { files: { [path]: jpeg } },
    );
    const r = await t.send('upload/commit', { path });
    expect(r.body).toMatchObject({ ok: true, kind: 'photo' });
    const text = Array.from(t.uploaded[0]!.bytes, (c) => String.fromCharCode(c)).join('');
    expect(text).not.toContain('GPS');
    const v = dbCalls(t.calls).find((c) => c.fn === 'community_verify_upload')!;
    expect(v.args.p_bytes).toBe(t.uploaded[0]!.bytes.length);
  });
  it('refuses an oversized file from its stored size, without downloading it', async () => {
    const big = { length: 9 * 1024 * 1024 } as unknown as Uint8Array;
    const t = setup(
      { community_upload_ticket: () => 'image/jpeg', community_reject_upload: () => undefined },
      { files: { [path]: big } },
    );
    const r = await t.send('upload/commit', { path });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('too_large');
    expect(t.removed).toEqual([path]);
    expect(t.downloads()).toBe(0);
    expect(dbCalls(t.calls).some((c) => c.fn === 'community_reject_upload')).toBe(true);
  });
  it('rejects a file that is not what it claims, and deletes it', async () => {
    const t = setup(
      { community_upload_ticket: () => 'image/jpeg', community_reject_upload: () => undefined },
      { files: { [path]: enc('<html><script>alert(1)</script>') } },
    );
    const r = await t.send('upload/commit', { path });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('wrong_type');
    expect(t.removed).toEqual([path]);
    expect(dbCalls(t.calls).some((c) => c.fn === 'community_reject_upload')).toBe(true);
  });
  it('refuses a path that is not an upload ticket, someone else’s ticket, and a missing file', async () => {
    const t = setup({ community_upload_ticket: () => 'image/jpeg' }, { files: {} });
    expect((await t.send('upload/commit', { path: 'u/other/x.jpg' })).status).toBe(400);
    expect((await t.send('upload/commit', { path })).status).toBe(404);
    const t2 = setup(
      {
        community_upload_ticket: () => {
          throw new Error('not_found');
        },
      },
      { files: { [path]: jpeg } },
    );
    expect((await t2.send('upload/commit', { path })).status).toBe(404);
    expect(t2.uploaded).toHaveLength(0);
  });
});

describe('modes', () => {
  it('tells anyone, even a guest, whether media or posting is paused', async () => {
    const t = setup({ community_status: () => ({ mode: 'text_only' }) });
    expect((await t.send('status', {}, null)).body).toMatchObject({ ok: true, mode: 'text_only' });
    const u = setup({ community_status: () => ({ mode: 'weird' }) });
    expect((await u.send('status', {}, null)).body.mode).toBe('open');
  });
  it('maps a pause to a clear, temporary refusal', async () => {
    const t = setup({
      community_create_post: () => {
        throw new Error('media_paused');
      },
    });
    const r = await t.send('post', { type: 'text', body: 'x', confirmed: true });
    expect(r.status).toBe(503);
    expect(r.body.message).toMatch(/paused/i);
  });
  it('only staff with a second factor can change the mode', async () => {
    const t = setup({ community_set_mode: (a) => a.p_mode });
    expect((await t.send('mod/mode', { mode: 'read_only' }, 'member')).status).toBe(403);
    expect((await t.send('mod/mode', { mode: 'read_only' }, 'staff1')).status).toBe(403);
    expect((await t.send('mod/mode', { mode: 'frozen' }, 'staff2')).status).toBe(400);
    expect(
      (await t.send('mod/mode', { mode: 'read_only', note: 'flood' }, 'staff2')).body,
    ).toMatchObject({ ok: true, mode: 'read_only' });
    expect(dbCalls(t.calls)[0]!.args).toMatchObject({ p_actor: STAFF, p_aal2: true });
  });
});

describe('urgent alerts', () => {
  const alerter = () => {
    const sent: Array<{ kind: string; summary: unknown }> = [];
    const a: Alerter = {
      enabled: true,
      reason: 'on',
      notify: async (kind, summary) => {
        sent.push({ kind, summary });
        return true;
      },
    };
    return { a, sent };
  };
  const summary = {
    community_alert_summary: () => ({ open: 3, urgent: 1, urgentOverTarget: 0, overTarget: 0 }),
  };
  const report = { type: 'post', targetId: POST, reason: 'self_harm' };
  it('alerts the moderator when an urgent report is made, with counts only', async () => {
    const { a, sent } = alerter();
    const t = setup({ community_report: () => ({ urgent: true }), ...summary }, { alerts: a });
    expect((await t.send('report', report)).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.kind).toBe('new_urgent_report');
    expect(JSON.stringify(sent[0])).not.toMatch(new RegExp(`${POST}|${ME}`));
  });
  it('does not alert for an ordinary report', async () => {
    const { a, sent } = alerter();
    const t = setup({ community_report: () => ({ urgent: false }), ...summary }, { alerts: a });
    await t.send('report', { ...report, reason: 'spam' });
    expect(sent).toHaveLength(0);
    expect(dbCalls(t.calls).some((c) => c.fn === 'community_alert_summary')).toBe(false);
  });
  it('sends nothing, and asks nothing extra of the database, while alerts are disabled', async () => {
    const t = setup(
      { community_report: () => ({ urgent: true }), ...summary },
      { alerts: { enabled: false, reason: 'off', notify: async () => true } },
    );
    expect((await t.send('report', report)).status).toBe(200);
    expect(dbCalls(t.calls).map((c) => c.fn)).toEqual(['community_report']);
    const none = setup({ community_report: () => ({ urgent: true }) });
    expect((await none.send('report', report)).status).toBe(200);
  });
  it('throttles: a second urgent report in the window sends no second email', async () => {
    const { a, sent } = alerter();
    let n = 0;
    const t = setup(
      { community_report: () => ({ urgent: true }), ...summary },
      { alerts: a, burst: () => n++ !== 1 },
    );
    await t.send('report', report); // burst call 0 is the request limit, call 1 is the alert throttle
    await t.send('report', report);
    expect(sent.length).toBeLessThanOrEqual(1);
  });
  it('a failing alert never changes what the reporter sees', async () => {
    const a: Alerter = {
      enabled: true,
      reason: 'on',
      notify: async () => {
        throw new Error('provider down');
      },
    };
    const t = setup({ community_report: () => ({ urgent: true }), ...summary }, { alerts: a });
    const r = await t.send('report', report);
    expect(r).toEqual({ status: 200, body: { ok: true } });
  });
  it('the scheduled reminder needs the maintenance key and only mails while urgent items remain', async () => {
    const { a, sent } = alerter();
    const t = setup(summary, { alerts: a });
    expect((await t.send('maintenance/alerts', {}, null)).status).toBe(403);
    const r = await t.send('maintenance/alerts', {}, null, { maintenanceKey: 'secret-key' });
    expect(r.body).toMatchObject({ ok: true, alertsEnabled: true, urgent: 1, sent: true });
    expect(sent[0]!.kind).toBe('urgent_reminder');
    const quiet = setup(
      { community_alert_summary: () => ({ open: 2, urgent: 0 }) },
      { alerts: alerter().a },
    );
    expect(
      (await quiet.send('maintenance/alerts', {}, null, { maintenanceKey: 'secret-key' })).body,
    ).toMatchObject({ sent: false });
  });
  it('reports plainly that alerts are off, without any secret', async () => {
    const t = setup(summary, {
      alerts: {
        enabled: false,
        reason: 'no approved email provider is configured',
        notify: async () => false,
      },
    });
    const r = await t.send('maintenance/alerts', {}, null, { maintenanceKey: 'secret-key' });
    expect(r.body).toMatchObject({
      alertsEnabled: false,
      alertsStatus: 'no approved email provider is configured',
      sent: false,
    });
  });
});

describe('Community-only Read only floor', () => {
  it('refuses new posts, comments and uploads with no database at all, but leaves reading, reporting, blocking and deleting alone', async () => {
    const t = setup(
      {
        community_feed: () => [],
        community_report: () => ({ urgent: false }),
        community_delete_post: () => [],
        community_block: () => undefined,
        community_blocked: () => [],
      },
      { floorMode: 'read_only' },
    );
    for (const [route, body] of [
      ['post', { type: 'text', body: 'x', confirmed: true }],
      ['comment', { postId: POST, body: 'x' }],
      ['upload/ticket', { kind: 'photo', mime: 'image/jpeg' }],
    ] as const) {
      const r = await t.send(route, body);
      expect(r.status, route).toBe(503);
    }
    expect(t.calls).toHaveLength(0);
    expect((await t.send('feed', {}, null)).status).toBe(200);
    expect((await t.send('report', { type: 'post', targetId: POST, reason: 'spam' })).status).toBe(
      200,
    );
    expect((await t.send('block', { username: 'ama_dances' })).status).toBe(200);
    expect((await t.send('post/delete', { postId: POST })).status).toBe(200);
  });
  it('text only pauses media but not text', async () => {
    const t = setup(
      { community_create_post: () => ({ id: POST, status: 'published' }) },
      { floorMode: 'text_only' },
    );
    expect((await t.send('post', { type: 'photo', body: 'x', confirmed: true })).status).toBe(503);
    expect((await t.send('upload/ticket', { kind: 'photo', mime: 'image/jpeg' })).status).toBe(503);
    expect((await t.send('post', { type: 'text', body: 'x', confirmed: true })).status).toBe(200);
  });
  it('can only make Community stricter than the database setting, and the status says so', async () => {
    const t = setup(
      { community_status: () => ({ mode: 'text_only', videoEnabled: false }) },
      { floorMode: 'read_only' },
    );
    expect((await t.send('status', {}, null)).body).toMatchObject({
      mode: 'read_only',
      videoEnabled: false,
    });
    const loose = setup(
      { community_status: () => ({ mode: 'read_only', videoEnabled: true }) },
      { floorMode: 'open' },
    );
    expect((await loose.send('status', {}, null)).body).toMatchObject({
      mode: 'read_only',
      videoEnabled: true,
    });
  });
});

describe('memory safety for photo checks', () => {
  const p = 'm/55555555-5555-4555-8555-555555555555.jpg';
  it('never holds more than the allowed number of files in memory at once, and asks others to retry', async () => {
    const t = slowSetup(2);
    const req = () =>
      t.server.handle({ route: 'upload/commit', token: 't', networkKey: 'n', body: { path: p } });
    const a = req();
    const b = req();
    await new Promise((r) => setTimeout(r, 5));
    const c = await req();
    expect(c.status).toBe(503);
    expect(c.body.code).toBe('busy');
    expect(c.headers?.['Retry-After']).toBe('5');
    t.gates.forEach((g) => g());
    await Promise.all([a, b]);
    expect(t.peak()).toBe(2);
    const d = req();
    await new Promise((r) => setTimeout(r, 5));
    t.gates.forEach((g) => g());
    expect((await d).status).not.toBe(503); // the slot was released
  });
});

describe('maintenance and leaving', () => {
  it('prunes only with the maintenance key', async () => {
    const t = setup({ community_prune: () => ['u/a/old.jpg'] });
    expect((await t.send('maintenance/prune', {}, null)).status).toBe(403);
    expect(
      (await t.send('maintenance/prune', {}, 'staff2', { maintenanceKey: 'wrong' })).status,
    ).toBe(403);
    expect(
      (await t.send('maintenance/prune', {}, null, { maintenanceKey: 'secret-key' })).status,
    ).toBe(200);
    expect(t.removed).toEqual(['u/a/old.jpg']);
  });
  it('leaving removes the member’s files', async () => {
    const t = setup({ community_leave: () => ['u/a/1.jpg', 'u/a/2.mp4'] });
    expect((await t.send('leave', {})).status).toBe(200);
    expect(t.removed).toHaveLength(2);
  });
});
