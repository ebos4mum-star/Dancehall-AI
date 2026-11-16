import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCommunityAdapter } from './supabaseCommunity';

type Call = { url: string; body: Record<string, unknown>; auth: string };
function setup(
  replies: Record<string, unknown | ((b: Record<string, unknown>) => unknown)>,
  token: string | null = 'access-token',
) {
  const calls: Call[] = [];
  const uploads: Array<{ path: string; token: string; type: string }> = [];
  const db = {
    auth: {
      getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
    },
  } as unknown as SupabaseClient;
  const fetchImpl = (async (
    url: string,
    init: { headers: Record<string, string>; body: string },
  ) => {
    const route = url.split('/community/')[1]!;
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url: route, body, auth: init.headers.authorization! });
    const r = replies[route];
    const out = typeof r === 'function' ? (r as (b: Record<string, unknown>) => unknown)(body) : r;
    return { json: async () => out ?? { ok: true } };
  }) as unknown as typeof fetch;
  const a = createCommunityAdapter({
    db,
    url: 'https://x.supabase.co/',
    publishableKey: 'pk_public',
    fetchImpl,
    readFile: async () => Uint8Array.of(1, 2, 3),
    uploadToSignedUrl: async (path, tok, _bytes, type) =>
      void uploads.push({ path, token: tok, type }),
  });
  return { a, calls, uploads };
}
const POST = '33333333-3333-4333-8333-333333333333';

describe('Community over the Edge Function', () => {
  it('sends the member’s token when signed in, and the public key for a guest', async () => {
    const s = setup({ feed: { ok: true, posts: [], nextCursor: null } });
    await s.a.communityFeed!();
    expect(s.calls[0]!.auth).toBe('Bearer access-token');
    const g = setup({ feed: { ok: true, posts: [], nextCursor: null } }, null);
    await g.a.communityFeed!();
    expect(g.calls[0]!.auth).toBe('Bearer pk_public');
    expect(g.calls[0]!.url).toBe('feed');
  });
  it('never sends an identity in the body', async () => {
    const s = setup({ encourage: { ok: true, on: true } });
    await s.a.communityEncourage!(POST, true);
    expect(Object.keys(s.calls[0]!.body).sort()).toEqual(['on', 'postId']);
  });
  it('turns server refusals into the same failure shape as the local store, keeping help offers', async () => {
    const s = setup({
      post: {
        ok: false,
        code: 'blocked',
        message: 'x',
        reasons: ['Please leave out phone numbers.'],
        support: true,
      },
    });
    const r = await s.a.communityPost!({ type: 'text', body: 'x' }, { confirmed: true });
    expect(r).toMatchObject({
      ok: false,
      code: 'blocked',
      reasons: ['Please leave out phone numbers.'],
      support: true,
    });
  });
  it('reports a network failure plainly and does not throw', async () => {
    const db = {
      auth: { getSession: async () => ({ data: { session: null } }) },
    } as unknown as SupabaseClient;
    const a = createCommunityAdapter({
      db,
      url: 'https://x.test',
      publishableKey: 'k',
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });
    expect(await a.communityEncourage!(POST, true)).toMatchObject({ ok: false, code: 'network' });
    expect(await a.communityFeed!()).toEqual({ posts: [], next: null });
  });
  it('uploads media through a ticket, lets the server check it, then posts with the returned path only', async () => {
    const path = 'm/55555555-5555-4555-8555-555555555555.jpg';
    const s = setup({
      'upload/ticket': { ok: true, path, token: 'one-time' },
      'upload/commit': { ok: true },
      post: { ok: true, id: POST, status: 'held' },
    });
    const r = await s.a.communityPost!(
      {
        type: 'photo',
        body: 'my journey',
        media: [
          {
            kind: 'photo',
            role: 'single',
            mime: 'image/jpeg',
            bytes: 3,
            uri: 'file:///private/secret-name.jpg',
          },
        ],
      },
      { confirmed: true },
    );
    expect(r).toMatchObject({ ok: true, status: 'held' });
    expect(s.uploads).toEqual([{ path, token: 'one-time', type: 'image/jpeg' }]);
    expect(s.calls.map((c) => c.url)).toEqual(['upload/ticket', 'upload/commit', 'post']);
    const post = s.calls[2]!.body;
    expect(JSON.stringify(post)).not.toContain('secret-name');
    expect(post.media).toEqual([{ kind: 'photo', role: 'single', path }]);
    expect(post.confirmed).toBe(true);
  });
  it('does not post when the server rejects an upload', async () => {
    const s = setup({
      'upload/ticket': { ok: true, path: 'm/x', token: 't' },
      'upload/commit': {
        ok: false,
        code: 'wrong_type',
        message: 'That file is not the kind of photo or video we expected.',
      },
    });
    const r = await s.a.communityPost!(
      {
        type: 'photo',
        body: '',
        media: [
          { kind: 'photo', role: 'single', mime: 'image/jpeg', bytes: 3, uri: 'file:///a.jpg' },
        ],
      },
      { confirmed: true },
    );
    expect(r).toMatchObject({ ok: false, code: 'wrong_type' });
    expect(s.calls.some((c) => c.url === 'post')).toBe(false);
  });
  it('remembers the username for locally shown posts and changes it through the server', async () => {
    const s = setup({
      'username/claim': { ok: true, username: 'ama_dances' },
      'username/change': { ok: true, username: 'ama_moves' },
      post: { ok: true, id: POST, status: 'published' },
    });
    await s.a.communityClaimUsername!('Ama_Dances');
    expect(await s.a.communityChangeUsername!('Ama_Moves')).toMatchObject({
      ok: true,
      username: 'ama_moves',
    });
    const r = await s.a.communityPost!({ type: 'text', body: 'hi' }, { confirmed: true });
    expect(r.ok && r.post.author).toBe('ama_moves');
  });
  it('reads the status, and fails open for reading but closed for video', async () => {
    const s = setup({ status: { ok: true, mode: 'text_only', videoEnabled: false } });
    expect(await s.a.communityStatus!()).toEqual({ mode: 'text_only', videoEnabled: false });
    const down = setup({ status: { ok: false, code: 'server_error' } });
    expect(await down.a.communityStatus!()).toEqual({ mode: 'open', videoEnabled: false });
  });
  it('leaves Community through the server', async () => {
    const s = setup({ leave: { ok: true } });
    expect(await s.a.communityLeave!()).toEqual({ ok: true });
  });
});
