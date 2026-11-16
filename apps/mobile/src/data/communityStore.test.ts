import { describe, expect, it } from 'vitest';
import { buildAchievementShare } from '@dancehall/shared';
import { MockStore, type KeyValue } from './mockStore';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const NOW = () => new Date('2026-06-15T12:00:00Z');

async function member(kv: KeyValue = memory()) {
  const s = new MockStore(kv, NOW);
  await s.signInDev();
  const r = await s.communityClaimUsername!('dev_dancer');
  expect(r.ok).toBe(true);
  return { s, kv };
}

describe('Community in the local store', () => {
  it('a guest can browse the public feed and comments, and the samples are labelled as samples', async () => {
    const s = new MockStore(memory(), NOW); // never signed in
    const feed = await s.communityFeed!();
    expect(feed.posts.length).toBeGreaterThan(0);
    expect(feed.posts.every((p) => p.isSample)).toBe(true);
    expect(feed.posts.every((p) => p.author.startsWith('sample_'))).toBe(true);
    const withComments = feed.posts.find((p) => p.commentCount > 0)!;
    expect((await s.communityComments!(withComments.id)).length).toBeGreaterThan(0);
    expect(feed.posts.map((p) => p.createdAt)).toEqual(
      [...feed.posts.map((p) => p.createdAt)].sort().reverse(),
    );
  });
  it('every member action needs an account: a guest is refused', async () => {
    const s = new MockStore(memory(), NOW);
    const first = (await s.communityFeed!()).posts[0]!;
    const calls: Array<[string, () => Promise<unknown>]> = [
      ['claim', () => s.communityClaimUsername!('someone')],
      ['post', () => s.communityPost!({ type: 'text', body: 'hi' }, { confirmed: true })],
      ['comment', () => s.communityComment!(first.id, 'hi')],
      ['encourage', () => s.communityEncourage!(first.id, true)],
      [
        'report',
        () => s.communityReport!({ targetType: 'post', targetId: first.id, reason: 'spam' }),
      ],
      ['block', () => s.communityBlock!('sample_ama')],
      ['blocked', () => s.communityBlocked!()],
      ['delete', () => s.communityDeletePost!(first.id)],
    ];
    for (const [name, fn] of calls)
      await expect(fn(), name).rejects.toMatchObject({ code: 'not_authenticated' });
  });
  it('a member shares a confirmed post, which appears in the feed and survives a restart', async () => {
    const { s, kv } = await member();
    expect(
      await s.communityPost!({ type: 'text', body: 'Hello everyone' }, { confirmed: false }),
    ).toMatchObject({ ok: false, code: 'not_confirmed' });
    const r = await s.communityPost!({ type: 'text', body: 'Hello everyone' }, { confirmed: true });
    expect(r).toMatchObject({ ok: true, status: 'published' });
    const again = new MockStore(kv, NOW);
    const feed = await again.communityFeed!();
    expect(feed.posts.some((p) => p.author === 'dev_dancer' && p.isMine)).toBe(true);
    expect(await again.communityProfile!()).toMatchObject({ username: 'dev_dancer' });
  });
  it('nothing public contains the internal member id or any private field', async () => {
    const { s } = await member();
    await s.setConsent('health_data_processing', true);
    await s.addWeight({ weightKg: 71.5 });
    await s.communityPost!({ type: 'text', body: 'Dancing today' }, { confirmed: true });
    const first = (await s.communityFeed!()).posts[0]!;
    await s.communityEncourage!(first.id, true);
    await s.communityComment!(first.id, 'Lovely');
    const everything = JSON.stringify([
      await s.communityFeed!(),
      await s.communityComments!(first.id),
      await s.communityProfile!(),
    ]);
    expect(everything).not.toMatch(
      /dev-user-synthetic|71\.5|accounts\.dancehall\.invalid|userId|authorId|email/i,
    );
  });
  it('sharing an achievement works end to end, with only the whitelist, and is held or published by the same rules', async () => {
    const { s } = await member();
    const prev = buildAchievementShare({
      kind: 'workout',
      title: 'Amapiano groove',
      style: 'amapiano',
      minutes: 20,
    });
    const r = await s.communityPost!(
      { type: 'milestone', body: prev.body, milestone: prev.milestone },
      { confirmed: true },
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.post.milestone).toEqual({
        kind: 'workout',
        title: 'Amapiano groove',
        style: 'amapiano',
        minutes: null,
        achievementId: null,
      });
  });
  it('encourage, comment, report, block and delete work through the store', async () => {
    const { s } = await member();
    const post = (await s.communityFeed!()).posts.find((p) => p.author === 'sample_kofi')!;
    expect(await s.communityEncourage!(post.id, true)).toMatchObject({
      ok: true,
      encouraged: true,
    });
    expect(await s.communityComment!(post.id, 'Great idea')).toMatchObject({ ok: true });
    expect(
      await s.communityReport!({ targetType: 'post', targetId: post.id, reason: 'spam' }),
    ).toMatchObject({ ok: true });
    expect(await s.communityBlock!('sample_kofi')).toMatchObject({ ok: true });
    expect((await s.communityFeed!()).posts.some((p) => p.author === 'sample_kofi')).toBe(false);
    expect(await s.communityBlocked!()).toEqual(['sample_kofi']);
    expect(await s.communityUnblock!('sample_kofi')).toMatchObject({ ok: true });
    const mine = await s.communityPost!(
      { type: 'text', body: 'To be deleted' },
      { confirmed: true },
    );
    if (!mine.ok) throw new Error('x');
    expect(await s.communityDeletePost!(mine.post.id)).toMatchObject({ ok: true });
    expect((await s.communityFeed!()).posts.some((p) => p.id === mine.post.id)).toBe(false);
  });
  it('posting and commenting need a public username; reacting does not', async () => {
    const s = new MockStore(memory(), NOW);
    await s.signInDev();
    const post = (await s.communityFeed!()).posts[0]!;
    expect(await s.communityPost!({ type: 'text', body: 'hi' }, { confirmed: true })).toMatchObject(
      { ok: false, code: 'needs_username' },
    );
    expect(await s.communityComment!(post.id, 'hi')).toMatchObject({
      ok: false,
      code: 'needs_username',
    });
    expect(await s.communityEncourage!(post.id, true)).toMatchObject({ ok: true });
  });

  it('changes a username, shows the cooldown, and posts follow the new name', async () => {
    const { s } = await member();
    await s.communityPost!({ type: 'text', body: 'hello there' }, { confirmed: true });
    expect((await s.communityProfile!())?.canChangeAt).toBeNull();
    expect(await s.communityChangeUsername!('dev_mover')).toMatchObject({
      ok: true,
      username: 'dev_mover',
    });
    const p = await s.communityProfile!();
    expect(p?.username).toBe('dev_mover');
    expect(p?.canChangeAt).toBeTruthy();
    expect(await s.communityChangeUsername!('dev_again')).toMatchObject({
      ok: false,
      code: 'cooldown',
    });
    const mine = (await s.communityFeed!()).posts.filter((x) => x.isMine);
    expect(mine.every((x) => x.author === 'dev_mover')).toBe(true);
  });
  it('refuses look-alike names of staff and members', async () => {
    const { s } = await member();
    for (const n of ['adm1n', 'sample_arna', 'sample_k0fi'])
      expect((await s.communityChangeUsername!(n)).ok).toBe(false);
  });
  it('leaving Community removes the member’s posts and name but not the account', async () => {
    const { s } = await member();
    await s.communityPost!({ type: 'text', body: 'bye soon' }, { confirmed: true });
    expect(await s.communityLeave!()).toEqual({ ok: true });
    expect(await s.communityProfile!()).toBeNull();
    expect((await s.communityFeed!()).posts.some((x) => x.isMine)).toBe(false);
    expect((await s.communityClaimUsername!('dev_return')).ok).toBe(true);
  });
});
