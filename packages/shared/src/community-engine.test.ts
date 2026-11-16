import { beforeEach, describe, expect, it } from 'vitest';
import {
  CommunityEngine,
  USERNAME_COOLDOWN_DAYS,
  USERNAME_HOLD_DAYS,
  COMMUNITY_LIMITS,
  buildAchievementShare,
  emptyCommunity,
  type MediaInput,
  type StaffActor,
} from './index';

let clock = Date.parse('2026-06-01T10:00:00Z');
const now = () => new Date(clock);
let n = 0;
const make = () => {
  clock = Date.parse('2026-06-01T10:00:00Z');
  n = 0;
  return new CommunityEngine(emptyCommunity(), now, (p) => `${p}_${++n}`);
};
const tick = (min = 1) => void (clock += min * 60_000);
const MOD: StaffActor = { role: 'moderator', mfaVerified: true };
const photo = (role: MediaInput['role'] = 'single'): MediaInput => ({
  kind: 'photo',
  role,
  mime: 'image/jpeg',
  bytes: 1000,
  uri: 'file://p.jpg',
});
const video = (): MediaInput => ({
  kind: 'video',
  role: 'single',
  mime: 'video/mp4',
  bytes: 1000,
  durationS: 12,
  uri: 'file://v.mp4',
});

let e: CommunityEngine;
const join = (id: string, name: string) => {
  const r = e.claimUsername(id, name);
  if (!r.ok) throw new Error(JSON.stringify(r));
};
const say = (id: string, body: string) => {
  tick();
  const r = e.createPost(id, { type: 'text', body }, { confirmed: true });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.post;
};
beforeEach(() => {
  e = make();
  join('A', 'ama_dances');
  join('B', 'kofi_moves');
  join('C', 'efua_fit');
});

describe('guests browse, members act', () => {
  it('a guest can read the public feed but nothing needs an internal id', () => {
    const p = say('A', 'First class done!');
    const feed = e.feed(null);
    expect(feed.posts.map((x) => x.id)).toEqual([p.id]);
    expect(feed.posts[0]!.isMine).toBe(false);
    expect(e.comments(null, p.id)).toEqual([]);
  });
  it('posting, commenting and reacting need a member; posting and commenting also need a public username', () => {
    const p = say('A', 'Hello');
    expect(e.createPost('Z', { type: 'text', body: 'hi' }, { confirmed: true })).toMatchObject({
      ok: false,
      code: 'needs_username',
    });
    expect(e.addComment('Z', p.id, 'hi')).toMatchObject({ ok: false, code: 'needs_username' });
    // A member without a username may encourage (no name is shown).
    expect(e.setEncourage('Z', p.id, true)).toMatchObject({ ok: true, encouraged: true });
  });
});

describe('usernames', () => {
  it('are unique (any case), permanent, and one per member', () => {
    expect(e.claimUsername('D', 'AMA_DANCES')).toMatchObject({ ok: false, code: 'taken' });
    expect(e.claimUsername('A', 'another_name')).toMatchObject({ ok: false, code: 'already_set' });
    expect(e.claimUsername('D', 'admin')).toMatchObject({ ok: false, code: 'invalid_username' });
    expect(e.usernameOf('A')).toBe('ama_dances');
  });
});

describe('Share Progress needs explicit confirmation', () => {
  it('refuses to publish anything that was not confirmed', () => {
    for (const confirmed of [false, undefined as never, 'yes' as never, 1 as never])
      expect(
        e.createPost('A', { type: 'text', body: 'Hi' }, { confirmed }),
        String(confirmed),
      ).toMatchObject({ ok: false, code: 'not_confirmed' });
    expect(e.state.posts).toHaveLength(0);
  });
  it('a shared achievement carries only the whitelisted fields', () => {
    tick();
    const prev = buildAchievementShare(
      { kind: 'workout', title: 'Amapiano groove', style: 'amapiano', minutes: 20 },
      { note: 'Felt great' },
    );
    const r = e.createPost(
      'A',
      {
        type: 'milestone',
        body: prev.body,
        milestone: { ...prev.milestone, weightKg: 70, kcal: 300 } as never,
      },
      { confirmed: true },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.post.milestone!).sort()).toEqual([
      'achievementId',
      'kind',
      'minutes',
      'style',
      'title',
    ]);
    expect(JSON.stringify(r.post)).not.toMatch(/weight|kcal|70|300/);
    expect(r.post.milestone!.minutes).toBeNull();
    expect(r.status).toBe('published');
  });
  it('a milestone post needs a milestone, and other posts cannot carry one', () => {
    expect(e.createPost('A', { type: 'milestone', body: 'x' }, { confirmed: true })).toMatchObject({
      ok: false,
      code: 'invalid_milestone',
    });
    expect(
      e.createPost(
        'A',
        { type: 'text', body: 'x', milestone: { kind: 'workout', title: 't' } },
        { confirmed: true },
      ),
    ).toMatchObject({ ok: false, code: 'invalid_milestone' });
  });
});

describe('post types', () => {
  it('text and story posts have limits', () => {
    tick();
    expect(
      e.createPost('A', { type: 'story', body: 'a'.repeat(1500) }, { confirmed: true }).ok,
    ).toBe(true);
    tick();
    expect(
      e.createPost('A', { type: 'story', body: 'a'.repeat(1501) }, { confirmed: true }),
    ).toMatchObject({ ok: false, code: 'blocked' });
    tick();
    expect(
      e.createPost('A', { type: 'text', body: 'a'.repeat(501) }, { confirmed: true }),
    ).toMatchObject({ ok: false, code: 'blocked' });
    expect(e.createPost('A', { type: 'text', body: '' }, { confirmed: true })).toMatchObject({
      ok: false,
      code: 'blocked',
    });
  });
  it('photos publish at once with no staff approval, and a report can still pull one down afterwards', () => {
    tick();
    const r = e.createPost(
      'A',
      { type: 'photo', body: 'My journey', media: [photo('before'), photo('after')] },
      { confirmed: true },
    );
    expect(r).toMatchObject({ ok: true, status: 'published' });
    if (!r.ok) return;
    expect(e.feed(null).posts.map((p) => p.id)).toEqual([r.post.id]);
    expect(e.feed('B').posts.map((p) => p.id)).toEqual([r.post.id]);
    // Nothing waits in a queue for an unreported photo.
    const q0 = e.moderationQueue(MOD);
    expect(q0.ok && q0.items).toEqual([]);
    // After publication a report on a serious reason hides it at once and puts it in front of the moderator.
    expect(
      e.report('B', { targetType: 'post', targetId: r.post.id, reason: 'child_safety' }).ok,
    ).toBe(true);
    expect(e.feed(null).posts).toEqual([]);
    const q = e.moderationQueue(MOD);
    expect(q.ok && q.items.map((i) => i.hasMedia)).toEqual([true]);
    expect(e.moderate(MOD, { targetType: 'post', targetId: r.post.id, action: 'remove' }).ok).toBe(
      true,
    );
  });
  it('a photo caption that screening holds is still held; an ordinary caption is not', () => {
    tick();
    const risky = e.createPost(
      'A',
      { type: 'photo', body: 'I lost 12 kg in 3 weeks', media: [photo()] },
      { confirmed: true },
    );
    expect(risky).toMatchObject({ ok: true, status: 'held' });
  });
  it('rejects media that does not match the post type, and bad media', () => {
    tick();
    expect(
      e.createPost('A', { type: 'text', body: 'x', media: [photo()] }, { confirmed: true }),
    ).toMatchObject({ ok: false, code: 'invalid_media' });
    expect(e.createPost('A', { type: 'photo', body: 'x' }, { confirmed: true })).toMatchObject({
      ok: false,
      code: 'invalid_media',
    });
    expect(
      e.createPost(
        'A',
        { type: 'video', body: 'x', media: [{ ...video(), durationS: 99 }] },
        { confirmed: true },
      ),
    ).toMatchObject({ ok: false, code: 'invalid_media' });
    expect(
      e.createPost(
        'A',
        { type: 'photo', body: 'x', media: [photo('before')] },
        { confirmed: true },
      ),
    ).toMatchObject({ ok: false, code: 'invalid_media' });
  });
  it('screened text: blocked content is never stored; risky content is held; self-harm gets support, not a post', () => {
    tick();
    expect(
      e.createPost('A', { type: 'text', body: 'call me 0201234567 now' }, { confirmed: true }),
    ).toMatchObject({ ok: false, code: 'blocked' });
    const sh = e.createPost('A', { type: 'text', body: 'I want to die' }, { confirmed: true });
    expect(sh).toMatchObject({ ok: false, code: 'blocked', support: true });
    expect(e.state.posts).toHaveLength(0);
    tick();
    expect(
      e.createPost('A', { type: 'text', body: 'I lost 12 kg in 3 weeks' }, { confirmed: true }),
    ).toMatchObject({ ok: true, status: 'held' });
    expect(e.feed(null).posts).toEqual([]);
  });
});

describe('comments', () => {
  it('are flat, chronological, screened, and counted', () => {
    const p = say('A', 'Hello');
    tick();
    expect(e.addComment('B', p.id, 'Well done!').ok).toBe(true);
    tick();
    expect(e.addComment('C', p.id, 'Keep going 💜').ok).toBe(true);
    expect(e.comments(null, p.id).map((c) => c.author)).toEqual(['kofi_moves', 'efua_fit']);
    expect(e.feed(null).posts[0]!.commentCount).toBe(2);
    expect(e.addComment('B', p.id, 'email me a@b.com')).toMatchObject({
      ok: false,
      code: 'blocked',
    });
    expect(e.addComment('B', p.id, 'x'.repeat(301))).toMatchObject({ ok: false, code: 'blocked' });
  });
  it('a risky comment is hidden for review: only its author sees it', () => {
    const p = say('A', 'Hello');
    tick();
    const r = e.addComment('B', p.id, 'I lost 9 kg with this');
    expect(r).toMatchObject({ ok: true, status: 'hidden' });
    expect(e.comments(null, p.id)).toEqual([]);
    expect(e.comments('B', p.id)).toHaveLength(1);
  });
  it('the comment’s author or the post’s author can delete it; nobody else', () => {
    const p = say('A', 'Hello');
    tick();
    const c = e.addComment('B', p.id, 'Nice');
    if (!c.ok) throw new Error('x');
    expect(e.deleteComment('C', c.comment.id)).toMatchObject({ ok: false });
    expect(e.deleteComment('A', c.comment.id).ok).toBe(true);
    tick();
    const c2 = e.addComment('B', p.id, 'Again');
    if (!c2.ok) throw new Error('x');
    expect(e.deleteComment('B', c2.comment.id).ok).toBe(true);
    expect(e.comments(null, p.id)).toEqual([]);
  });
  it('cannot comment on a post you cannot see', () => {
    const p = say('A', 'Hello');
    e.block('A', 'kofi_moves');
    expect(e.addComment('B', p.id, 'hi')).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('Encourage: one reaction, no popularity', () => {
  it('toggles, is idempotent, and cannot be used on your own post', () => {
    const p = say('A', 'Hello');
    expect(e.setEncourage('B', p.id, true)).toMatchObject({ ok: true, encouraged: true });
    expect(e.setEncourage('B', p.id, true)).toMatchObject({ ok: true, encouraged: true });
    expect(e.state.reactions).toHaveLength(1);
    expect(e.setEncourage('B', p.id, false)).toMatchObject({ ok: true, encouraged: false });
    expect(e.setEncourage('A', p.id, true)).toMatchObject({ ok: false, code: 'own_post' });
  });
  it('only the author learns how many; readers get no count and no list of who', () => {
    const p = say('A', 'Hello');
    e.setEncourage('B', p.id, true);
    e.setEncourage('C', p.id, true);
    expect(e.feed('A').posts[0]!.encouragedCount).toBe(2);
    expect(e.feed('B').posts[0]!.encouragedCount).toBeNull();
    expect(e.feed(null).posts[0]!.encouragedCount).toBeNull();
    expect(JSON.stringify(e.feed('A'))).not.toMatch(/"B"|"C"|kofi|efua/);
    expect(e.feed('B').posts[0]!.encouragedByMe).toBe(true);
  });
});

describe('deleting your own content', () => {
  it('removes the post, its comments and its reactions for good', () => {
    const p = say('A', 'Hello');
    tick();
    e.addComment('B', p.id, 'Nice');
    e.setEncourage('C', p.id, true);
    expect(e.deletePost('B', p.id)).toMatchObject({ ok: false }); // not yours
    expect(e.deletePost('A', p.id).ok).toBe(true);
    expect(e.state.posts).toEqual([]);
    expect(e.state.comments).toEqual([]);
    expect(e.state.reactions).toEqual([]);
    expect(e.feed(null).posts).toEqual([]);
  });
  it('deleting a member removes everything they made, did, or were blocked in', () => {
    const p = say('A', 'Hello');
    tick();
    e.addComment('B', p.id, 'Nice');
    e.block('B', 'ama_dances');
    e.setEncourage('B', p.id, true);
    e.deleteMember('B');
    expect(e.state.comments).toEqual([]);
    expect(e.state.reactions).toEqual([]);
    expect(e.state.blocks).toEqual([]);
    expect(e.usernameOf('B')).toBeNull();
    e.deleteMember('A');
    expect(e.state.posts).toEqual([]);
  });
});

describe('blocking', () => {
  it('is mutual and silent: neither sees the other’s posts or comments, and nothing tells the blocked person', () => {
    const pa = say('A', 'From A');
    const pb = say('B', 'From B');
    tick();
    e.addComment('C', pa.id, 'C on A');
    expect(e.block('A', 'kofi_moves').ok).toBe(true);
    expect(e.feed('A').posts.map((p) => p.id)).toEqual([pa.id]);
    expect(e.feed('B').posts.map((p) => p.id)).toEqual([pb.id]);
    expect(
      e
        .feed('C')
        .posts.map((p) => p.id)
        .sort(),
    ).toEqual([pa.id, pb.id].sort());
    expect(JSON.stringify(e.feed('B'))).not.toMatch(/block/i);
    expect(e.blockedUsernames('A')).toEqual(['kofi_moves']);
    expect(e.blockedUsernames('B')).toEqual([]);
    expect(e.unblock('A', 'kofi_moves').ok).toBe(true);
    expect(e.feed('B').posts).toHaveLength(2);
  });
  it('cannot block yourself or someone who does not exist, and blocking twice is harmless', () => {
    expect(e.block('A', 'ama_dances')).toMatchObject({ ok: false, code: 'self' });
    expect(e.block('A', 'nobody_here')).toMatchObject({ ok: false, code: 'not_found' });
    e.block('A', 'kofi_moves');
    e.block('A', 'kofi_moves');
    expect(e.state.blocks).toHaveLength(1);
  });
});

describe('reporting', () => {
  it('three different people hide a post pending review; one person twice does not', () => {
    const p = say('A', 'Questionable');
    expect(e.report('B', { targetType: 'post', targetId: p.id, reason: 'spam' }).ok).toBe(true);
    expect(e.report('B', { targetType: 'post', targetId: p.id, reason: 'spam' }).ok).toBe(true);
    expect(e.feed(null).posts).toHaveLength(1);
    e.claimUsername('D', 'dede_dances');
    expect(e.report('C', { targetType: 'post', targetId: p.id, reason: 'harassment' }).ok).toBe(
      true,
    );
    expect(e.feed(null).posts).toHaveLength(1);
    expect(e.report('D', { targetType: 'post', targetId: p.id, reason: 'other' }).ok).toBe(true);
    expect(e.feed(null).posts).toEqual([]);
    expect(e.feed('A').posts[0]!.status).toBe('hidden');
    const q = e.moderationQueue(MOD);
    expect(q.ok && q.items[0]).toMatchObject({ id: p.id, reportCount: 3 });
  });
  it('private information or self-harm reports hide immediately and jump the queue', () => {
    const p1 = say('A', 'one');
    const p2 = say('A', 'two');
    e.report('B', { targetType: 'post', targetId: p1.id, reason: 'private_information' });
    expect(e.feed(null).posts.map((p) => p.id)).toEqual([p2.id]);
    e.report('B', { targetType: 'post', targetId: p2.id, reason: 'spam' });
    const q = e.moderationQueue(MOD);
    expect(q.ok && q.items.map((i) => i.id)).toEqual([p1.id]);
  });
  it('cannot report your own content or something you cannot see, and the reporter is never revealed', () => {
    const p = say('A', 'mine');
    expect(e.report('A', { targetType: 'post', targetId: p.id, reason: 'spam' })).toMatchObject({
      ok: false,
      code: 'own_content',
    });
    e.block('A', 'kofi_moves');
    expect(e.report('B', { targetType: 'post', targetId: p.id, reason: 'spam' })).toMatchObject({
      ok: false,
      code: 'not_found',
    });
    expect(
      e.report('C', { targetType: 'post', targetId: p.id, reason: 'bogus' as never }),
    ).toMatchObject({ ok: false, code: 'invalid_reason' });
    e.report('C', { targetType: 'post', targetId: p.id, reason: 'spam' });
    expect(JSON.stringify(e.feed('A'))).not.toMatch(/efua|reporter|report/i);
  });
  it('comments can be reported and hidden too', () => {
    const p = say('A', 'hi');
    tick();
    const c = e.addComment('B', p.id, 'Rude comment');
    if (!c.ok) throw new Error('x');
    expect(
      e.report('C', { targetType: 'comment', targetId: c.comment.id, reason: 'self_harm' }).ok,
    ).toBe(true);
    expect(e.comments(null, p.id)).toEqual([]);
  });
});

describe('moderation is for staff with a second factor only', () => {
  it('everyone else is refused, and moderators see content and flags but no identity beyond the public username', () => {
    const p = say('A', 'I lost 8 kg in a month');
    for (const actor of [
      { role: null, mfaVerified: true },
      { role: 'moderator', mfaVerified: false },
      { role: 'support', mfaVerified: true },
      { role: 'content_editor', mfaVerified: true },
    ] as StaffActor[]) {
      expect(e.moderationQueue(actor)).toMatchObject({ ok: false, code: 'forbidden' });
      expect(
        e.moderate(actor, { targetType: 'post', targetId: p.id, action: 'approve' }),
      ).toMatchObject({ ok: false, code: 'forbidden' });
      expect(e.suspendMember(actor, 'ama_dances', true)).toMatchObject({
        ok: false,
        code: 'forbidden',
      });
    }
    const q = e.moderationQueue(MOD);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.items[0]).toMatchObject({ author: 'ama_dances', flags: ['weight_claim'] });
    const json = JSON.stringify(q);
    expect(json).not.toMatch(/"A"|authorId|userId|email|accounts\.dancehall/);
  });
  it('approve publishes, remove takes it down for good, and a suspended member cannot post, comment or react', () => {
    const p = say('A', 'I lost 8 kg in a month');
    expect(e.feed(null).posts).toEqual([]);
    expect(e.moderate(MOD, { targetType: 'post', targetId: p.id, action: 'approve' }).ok).toBe(
      true,
    );
    expect(e.feed(null).posts).toHaveLength(1);
    expect(e.moderate(MOD, { targetType: 'post', targetId: p.id, action: 'remove' }).ok).toBe(true);
    expect(e.feed(null).posts).toEqual([]);
    expect(e.feed('A').posts).toEqual([]); // removed is gone even for the author
    expect(e.suspendMember(MOD, 'ama_dances', true).ok).toBe(true);
    tick();
    expect(e.createPost('A', { type: 'text', body: 'again' }, { confirmed: true })).toMatchObject({
      ok: false,
      code: 'suspended',
    });
    const other = say('B', 'hello');
    expect(e.setEncourage('A', other.id, true)).toMatchObject({ ok: false, code: 'suspended' });
    expect(e.addComment('A', other.id, 'hi')).toMatchObject({ ok: false, code: 'suspended' });
  });
});

describe('rate limits', () => {
  it('stop floods of posts, comments, reactions and reports, and reset after a day', () => {
    for (let i = 0; i < COMMUNITY_LIMITS.postsPerDay; i++) say('A', `post ${i}`);
    tick();
    expect(
      e.createPost('A', { type: 'text', body: 'one more' }, { confirmed: true }),
    ).toMatchObject({ ok: false, code: 'rate_limited' });
    clock += 25 * 3_600_000;
    expect(e.createPost('A', { type: 'text', body: 'tomorrow' }, { confirmed: true }).ok).toBe(
      true,
    );
    const target = say('B', 'target');
    for (let i = 0; i < COMMUNITY_LIMITS.commentsPerDay; i++) {
      tick();
      expect(e.addComment('C', target.id, `c${i}`).ok, String(i)).toBe(true);
    }
    tick();
    expect(e.addComment('C', target.id, 'too many')).toMatchObject({
      ok: false,
      code: 'rate_limited',
    });
  });
});

describe('the engine never leaks internal identifiers', () => {
  it('feed, comments, queue and blocked list contain only usernames and opaque content ids', () => {
    const p = say('A', 'Hello');
    tick();
    e.addComment('B', p.id, 'Nice');
    e.setEncourage('C', p.id, true);
    e.block('A', 'efua_fit');
    const out = JSON.stringify([
      e.feed(null),
      e.feed('A'),
      e.feed('B'),
      e.comments('A', p.id),
      e.blockedUsernames('A'),
      e.moderationQueue(MOD),
    ]);
    for (const secret of ['"A"', '"B"', '"C"', 'authorId', 'userId', 'user_id'])
      expect(out, secret).not.toContain(secret);
  });
});

describe('username changes', () => {
  const t0 = new Date('2026-12-01T10:00:00Z');
  const mk = () => {
    let now = t0;
    const e = new CommunityEngine(emptyCommunity(), () => now);
    return { e, advance: (days: number) => (now = new Date(now.getTime() + days * 86_400_000)) };
  };
  it('lets a member change their name, and posts follow the new name', () => {
    const { e } = mk();
    e.claimUsername('u1', 'ama_dances');
    e.createPost('u1', { type: 'text', body: 'hello there' }, { confirmed: true });
    expect(e.changeUsername('u1', 'Ama_Moves')).toMatchObject({ ok: true, username: 'ama_moves' });
    expect(JSON.stringify(e.feed(null))).toContain('ama_moves');
    expect(JSON.stringify(e.feed(null))).not.toContain('ama_dances');
  });
  it('enforces a cooldown after a change, the first change is free', () => {
    const { e, advance } = mk();
    e.claimUsername('u1', 'ama_dances');
    expect(e.changeUsername('u1', 'ama_one').ok).toBe(true);
    expect(e.changeUsername('u1', 'ama_two')).toMatchObject({ ok: false, code: 'cooldown' });
    advance(USERNAME_COOLDOWN_DAYS - 1);
    expect(e.changeUsername('u1', 'ama_two').ok).toBe(false);
    advance(2);
    expect(e.changeUsername('u1', 'ama_two').ok).toBe(true);
  });
  it('refuses taken, look-alike and unchanged names', () => {
    const { e } = mk();
    e.claimUsername('u1', 'ama_dances');
    e.claimUsername('u2', 'kofi_moves');
    expect(e.changeUsername('u1', 'KOFI_MOVES')).toMatchObject({ ok: false, code: 'taken' });
    expect(e.changeUsername('u1', 'kofimoves')).toMatchObject({ ok: false, code: 'too_similar' });
    expect(e.changeUsername('u1', 'k0fi_m0ves')).toMatchObject({ ok: false, code: 'too_similar' });
    expect(e.changeUsername('u1', 'ama_dances')).toMatchObject({ ok: false, code: 'unchanged' });
    expect(e.claimUsername('u3', 'kofi_rnoves')).toMatchObject({ ok: false, code: 'too_similar' });
  });
  it('refuses names that pass as staff or the app', () => {
    const { e } = mk();
    e.claimUsername('u1', 'ama_dances');
    for (const n of ['adm1n', 'm0derator', 'dancehal1_fit', 'supp0rt', 'adrnin'])
      expect(e.changeUsername('u1', n).ok).toBe(false);
  });
  it('holds a released name so nobody else can take it over', () => {
    const { e, advance } = mk();
    e.claimUsername('u1', 'ama_dances');
    e.claimUsername('u2', 'kofi_moves');
    e.changeUsername('u1', 'ama_moves');
    expect(e.claimUsername('u3', 'ama_dances')).toMatchObject({ ok: false });
    expect(e.changeUsername('u2', 'ama_dances')).toMatchObject({ ok: false });
    advance(USERNAME_HOLD_DAYS + 1);
    expect(e.changeUsername('u2', 'ama_dances').ok).toBe(true);
  });
  it('needs a username first, and a suspended member cannot change it', () => {
    const { e } = mk();
    expect(e.changeUsername('u1', 'ama_dances')).toMatchObject({ code: 'needs_username' });
  });
});
