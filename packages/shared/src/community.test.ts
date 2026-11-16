import { describe, expect, it } from 'vitest';
import {
  MODERATION_TARGETS,
  COMMUNITY_LIMITS,
  GUEST,
  PRIVATE_BY_DEFAULT,
  buildAchievementShare,
  buildFeed,
  canSeeComment,
  canSeePost,
  moderationQueue,
  screenText,
  shouldHideAfterReports,
  toPublicComment,
  toPublicPost,
  validateMedia,
  validateUsername,
  withinDailyLimit,
  type MediaInput,
  type StoredComment,
  type StoredPost,
  type Viewer,
} from './index';

const post = (over: Partial<StoredPost> = {}): StoredPost => ({
  id: 'p1',
  authorId: 'internal-user-AAA',
  authorUsername: 'ama_dances',
  type: 'text',
  body: 'Danced today!',
  milestone: null,
  media: [],
  status: 'published',
  createdAt: '2026-06-01T10:00:00.000Z',
  ...over,
});
const viewer = (id: string | null, blocked: string[] = [], blockedBy: string[] = []): Viewer => ({
  id,
  blocked: new Set(blocked),
  blockedBy: new Set(blockedBy),
});
const screen = (t: string, n = 500) => screenText(t, { maxChars: n });

describe('usernames', () => {
  it('accepts simple public names, lowercases them, and trims', () => {
    expect(validateUsername('  Ama_Dances ')).toEqual({ ok: true, username: 'ama_dances' });
    expect(validateUsername('kofi2026')).toEqual({ ok: true, username: 'kofi2026' });
  });
  it('rejects bad shapes: length, first character, symbols, doubled or trailing underscores', () => {
    for (const bad of [
      'ab',
      'a'.repeat(21),
      '1abc',
      '_abc',
      'ama dances',
      'ama-dances',
      'ama.d',
      'ama__d',
      'ama_',
      'ama@x.com',
      'ama😀',
    ])
      expect(validateUsername(bad).ok, bad).toBe(false);
  });
  it('rejects names that look like phone numbers, internal ids or the synthetic sign-in address', () => {
    for (const bad of [
      'call0201234567',
      'u0123456789abcdef0123456789abcdef',
      'user_0123456789abcdef',
      'x1234567',
    ])
      expect(validateUsername(bad).ok, bad).toBe(false);
  });
  it('rejects reserved, impersonating, abusive and pro-eating-disorder names, with one non-revealing message', () => {
    const bad = [
      'admin',
      'Moderator',
      'support',
      'dancehallfit',
      'the_dancehall_fit',
      'dh_fit',
      'DanceHallAI',
      'big_idiot',
      'thinspo_girl',
      'pro_ana_life',
    ];
    for (const b of bad) {
      const r = validateUsername(b);
      expect(r.ok, b).toBe(false);
    }
    expect(validateUsername('admin')).toEqual({
      ok: false,
      reason: 'That name is not available. Try a different one.',
    });
  });
});

describe('text screening', () => {
  it('allows ordinary encouraging text', () => {
    for (const t of [
      'Finished my first dancehall session today!',
      'Third class this week, feeling stronger.',
      'Thank you all for the encouragement 💜',
    ]) {
      const r = screen(t);
      expect(r.decision, t).toBe('allow');
    }
  });
  it('blocks empty, too-long text', () => {
    expect(screen('   ').decision).toBe('block');
    expect(screen('x'.repeat(501)).decision).toBe('block');
    expect(screen('x'.repeat(300), 300).decision).toBe('allow');
  });
  it('blocks personal contact details, links, mentions and contact solicitation, without repeating them', () => {
    const cases: Array<[string, string]> = [
      ['write to me at ama@example.com', 'email'],
      ['call me on +233 24 123 4567', 'phone'],
      ['visit www.myshop.com for more', 'link'],
      ['see https://x.example/abc', 'link'],
      ['shop at myshop.shop', 'link'],
      ['thanks @kofi for the tips', 'mention'],
      ['DM me for the plan', 'contact_solicit'],
      ['add me on whatsapp', 'contact_solicit'],
    ];
    for (const [t, flag] of cases) {
      const r = screen(t);
      expect(r.decision, t).toBe('block');
      expect(r.flags, t).toContain(flag);
      for (const reason of r.reasons) expect(reason).not.toContain(t);
    }
  });
  it('self-harm language is blocked with a supportive message and flags support; it is not posted', () => {
    const r = screen('I want to die');
    expect(r.decision).toBe('block');
    expect(r.support).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/crisis line/);
  });
  it('pro-eating-disorder content is blocked with a supportive message', () => {
    const r = screen('Best thinspo tips');
    expect(r.decision).toBe('block');
    expect(r.flags).toContain('ed_content');
    expect(r.support).toBe(true);
    expect(screen('t h i n s p o').decision).toBe('block');
  });
  it('never holds: ordinary weight, calorie and health-number talk and capitals are simply allowed', () => {
    for (const t of [
      'I lost 5 kg',
      'dropped 3 dress sizes',
      'I now weigh 62 kg',
      'eating 1200 calories a day',
      'AMAZINGAMAZINGAMAZING',
      'Lost 2 kg in 4 weeks, feeling strong',
    ])
      expect(screen(t), t).toMatchObject({ decision: 'allow', flags: [] });
  });
  it('rejects, never holds: dangerous health claims, very fast loss claims and harassment', () => {
    const rejected: Array<[string, string]> = [
      ['I lost 10 kg in a month', 'weight_claim'],
      ['I lost 12 kg in 3 weeks', 'weight_claim'],
      ['this detox is a miracle', 'health_claim'],
      ['semaglutide changed everything', 'health_claim'],
      ["you're so fat", 'harassment'],
    ];
    for (const [t, flag] of rejected) {
      const r = screen(t);
      expect(r.decision, t).toBe('block');
      expect(r.flags, t).toContain(flag);
      expect(r.reasons.join(' '), t).not.toContain(t);
    }
    for (const t of ['x', 'y']) expect(screen(t).decision).not.toBe('hold');
  });
  it('is deterministic', () => {
    expect(screen('I lost 5 kg')).toEqual(screen('I lost 5 kg'));
  });
});

describe('media', () => {
  const photo = (role: MediaInput['role'], over: Partial<MediaInput> = {}): MediaInput => ({
    kind: 'photo',
    role,
    mime: 'image/jpeg',
    bytes: 1_000_000,
    uri: 'file://a.jpg',
    ...over,
  });
  const video = (over: Partial<MediaInput> = {}): MediaInput => ({
    kind: 'video',
    role: 'single',
    mime: 'video/mp4',
    bytes: 5_000_000,
    durationS: 20,
    uri: 'file://a.mp4',
    ...over,
  });
  it('accepts no media, one photo, a before-and-after pair, or one short video', () => {
    expect(validateMedia([]).ok).toBe(true);
    expect(validateMedia([photo('single')]).ok).toBe(true);
    expect(validateMedia([photo('before'), photo('after')]).ok).toBe(true);
    expect(validateMedia([video()]).ok).toBe(true);
  });
  it('rejects mixing, too many, bad pairs, wrong types, oversize and over-long video', () => {
    const bad: Array<[string, MediaInput[]]> = [
      ['mixed', [photo('single'), video()]],
      ['two videos', [video(), video()]],
      ['three photos', [photo('before'), photo('after'), photo('single')]],
      ['two befores', [photo('before'), photo('before')]],
      ['lone before', [photo('before')]],
      ['gif', [photo('single', { mime: 'image/gif' })]],
      ['big photo', [photo('single', { bytes: 9 * 1_048_576 })]],
      ['exe', [video({ mime: 'application/x-msdownload' })]],
      ['long video', [video({ durationS: 31 })]],
      ['no duration', [video({ durationS: null })]],
      ['big video', [video({ bytes: 26 * 1_048_576 })]],
      ['no file', [photo('single', { uri: '' })]],
    ];
    for (const [name, list] of bad) expect(validateMedia(list).ok, name).toBe(false);
  });
});

describe('visibility, blocking and held content', () => {
  it('guests see only published posts', () => {
    expect(canSeePost(post(), GUEST)).toBe(true);
    for (const status of ['held', 'hidden', 'removed'] as const)
      expect(canSeePost(post({ status }), GUEST), status).toBe(false);
  });
  it('authors see their own held and hidden posts (so they can understand and delete them) but never removed ones', () => {
    const me = viewer('internal-user-AAA');
    expect(canSeePost(post({ status: 'held' }), me)).toBe(true);
    expect(canSeePost(post({ status: 'hidden' }), me)).toBe(true);
    expect(canSeePost(post({ status: 'removed' }), me)).toBe(false);
  });
  it('blocking is mutual and silent: neither side sees the other', () => {
    const p = post();
    expect(canSeePost(p, viewer('b', ['internal-user-AAA']))).toBe(false);
    expect(canSeePost(p, viewer('b', [], ['internal-user-AAA']))).toBe(false);
    expect(canSeePost(p, viewer('b'))).toBe(true);
  });
  it('comments follow their post and their author’s blocks', () => {
    const c: StoredComment = {
      id: 'c1',
      postId: 'p1',
      authorId: 'x',
      authorUsername: 'kofi',
      body: 'Nice!',
      status: 'published',
      createdAt: '2026-06-01T11:00:00.000Z',
    };
    expect(canSeeComment(c, post(), GUEST)).toBe(true);
    expect(canSeeComment(c, post(), viewer('v', ['x']))).toBe(false);
    expect(canSeeComment(c, post({ status: 'hidden' }), GUEST)).toBe(false);
    expect(canSeeComment({ ...c, status: 'hidden' }, post(), GUEST)).toBe(false);
    expect(canSeeComment({ ...c, status: 'hidden' }, post(), viewer('x'))).toBe(true);
  });
});

describe('public projection: privacy', () => {
  it('never contains internal ids, emails or private health fields, and shows only the username', () => {
    const p = post({
      milestone: {
        kind: 'workout',
        title: 'Groove',
        style: 'dancehall',
        minutes: null,
        achievementId: null,
      },
    });
    const pub = toPublicPost(p, viewer('someone-else'), {
      commentCount: 2,
      encouragedBy: new Set(['u1', 'u2']),
    });
    const json = JSON.stringify(pub);
    expect(json).not.toContain('internal-user-AAA');
    expect(json).not.toMatch(
      /authorId|userId|user_id|email|@|accounts\.dancehall\.invalid|weight|kcal|calorie/i,
    );
    expect(pub.author).toBe('ama_dances');
    const c: StoredComment = {
      id: 'c1',
      postId: 'p1',
      authorId: 'secret-id-9',
      authorUsername: 'kofi',
      body: 'Nice!',
      status: 'published',
      createdAt: 'x',
    };
    expect(JSON.stringify(toPublicComment(c, GUEST))).not.toContain('secret-id-9');
  });
  it('everyone sees how many people liked a post, and nobody sees who', () => {
    const enc = new Set(['u1', 'u2', 'u3']);
    expect(
      toPublicPost(post(), viewer('u9'), { commentCount: 0, encouragedBy: enc }).encouragedCount,
    ).toBe(3);
    const guest = toPublicPost(post(), GUEST, { commentCount: 0, encouragedBy: enc });
    expect(guest.encouragedCount).toBe(3);
    expect(JSON.stringify(guest)).not.toMatch(/u1|u2|u3/);
    const mine = toPublicPost(post(), viewer('internal-user-AAA'), {
      commentCount: 0,
      encouragedBy: enc,
    });
    expect(mine.encouragedCount).toBe(3);
    expect(JSON.stringify(mine)).not.toMatch(/u1|u2|u3/);
    expect(
      toPublicPost(post(), viewer('u2'), { commentCount: 0, encouragedBy: enc }).encouragedByMe,
    ).toBe(true);
    expect(toPublicPost(post(), GUEST, { commentCount: 0, encouragedBy: enc }).encouragedByMe).toBe(
      false,
    );
  });
});

describe('the feed is one chronological list', () => {
  const mk = (n: number, over: Partial<StoredPost> = {}) =>
    post({
      id: `p${String(n).padStart(3, '0')}`,
      createdAt: new Date(Date.UTC(2026, 5, 1, 0, n)).toISOString(),
      ...over,
    });
  const all = Array.from({ length: 45 }, (_, i) => mk(i));
  it('is newest first, regardless of anything else about a post', () => {
    const r = buildFeed(all, GUEST, { limit: 10 });
    expect(r.posts.map((p) => p.id)).toEqual(
      all
        .slice(35)
        .reverse()
        .map((p) => p.id),
    );
    expect(
      buildFeed([mk(1, { authorUsername: 'popular' }), mk(2)], GUEST).posts.map((p) => p.id),
    ).toEqual(['p002', 'p001']);
  });
  it('pages without gaps or repeats using the cursor, and ends cleanly', () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const r = buildFeed(all, GUEST, { cursor, limit: 20 });
      seen.push(...r.posts.map((p) => p.id));
      if (!r.next) break;
      cursor = r.next;
    }
    expect(seen.length).toBe(45);
    expect(new Set(seen).size).toBe(45);
  });
  it('breaks ties by id, caps the page size, and leaves out what the viewer must not see', () => {
    const same = [post({ id: 'a' }), post({ id: 'b' }), post({ id: 'c' })];
    expect(buildFeed(same, GUEST).posts.map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(buildFeed(all, GUEST, { limit: 999 }).posts).toHaveLength(COMMUNITY_LIMITS.feedPageMax);
    const mixed = [
      mk(1),
      mk(2, { status: 'held' }),
      mk(3, { status: 'removed' }),
      mk(4, { authorId: 'blocked-one' }),
    ];
    expect(buildFeed(mixed, viewer('v', ['blocked-one'])).posts.map((p) => p.id)).toEqual(['p001']);
  });
  it('has no popularity, follow or algorithmic input: the function takes only posts, the viewer and a cursor', () => {
    expect(buildFeed.length).toBeLessThanOrEqual(3);
  });
});

describe('limits and reports', () => {
  it('daily limits stop abuse and reset by the caller’s day', () => {
    expect(withinDailyLimit('post', 4)).toBe(true);
    expect(withinDailyLimit('post', 5)).toBe(false);
    expect(withinDailyLimit('comment', 29)).toBe(true);
    expect(withinDailyLimit('comment', 30)).toBe(false);
    expect(withinDailyLimit('reaction', 100)).toBe(false);
    expect(withinDailyLimit('report', 10)).toBe(false);
  });
  it('content is hidden after three different people report it, or at once for private information or self-harm', () => {
    expect(shouldHideAfterReports(['spam'], 2)).toBe(false);
    expect(shouldHideAfterReports(['spam', 'harassment', 'other'], 3)).toBe(true);
    expect(shouldHideAfterReports(['private_information'], 1)).toBe(true);
    expect(shouldHideAfterReports(['child_safety'], 1)).toBe(true);
    expect(shouldHideAfterReports(['self_harm'], 1)).toBe(true);
    expect(shouldHideAfterReports(['harassment'], 1)).toBe(false);
  });
});

describe('Share My Achievement: private by default, whitelist only', () => {
  it('shares the title and style, not the minutes, unless the person opts in', () => {
    const p = buildAchievementShare({
      kind: 'workout',
      title: 'Amapiano groove',
      style: 'amapiano',
      minutes: 20,
    });
    expect(p.milestone.minutes).toBeNull();
    expect(p.publicLines).toEqual(['Finished a workout: Amapiano groove', 'Style: amapiano']);
    const on = buildAchievementShare(
      { kind: 'workout', title: 'Amapiano groove', style: 'amapiano', minutes: 20 },
      { includeMinutes: true },
    );
    expect(on.milestone.minutes).toBe(20);
    expect(on.publicLines).toContain('20 minutes');
  });
  it('lists plainly what stays private', () => {
    const p = buildAchievementShare({ kind: 'achievement', title: 'First week' });
    expect(p.privateByDefault).toEqual([...PRIVATE_BY_DEFAULT]);
    expect(p.privateByDefault.join(' ')).toMatch(/weight/);
    expect(p.privateByDefault.join(' ')).toMatch(/Calories/);
  });
  it('health data cannot be smuggled in: extra properties are ignored, and the output has only whitelisted keys', () => {
    const sneaky = {
      kind: 'workout',
      title: 'Groove',
      style: 'reggae',
      minutes: 30,
      weightKg: 71.2,
      kcal: 400,
      perceivedExertion: 9,
      readiness: ['chest_pain'],
      email: 'u0123@accounts.dancehall.invalid',
      userId: 'secret',
    } as never;
    const p = buildAchievementShare(sneaky, { includeMinutes: true });
    expect(Object.keys(p.milestone).sort()).toEqual([
      'achievementId',
      'kind',
      'minutes',
      'style',
      'title',
    ]);
    const json = JSON.stringify(p);
    expect(json).not.toMatch(
      /71\.2|400|perceived|readiness|chest_pain|secret|accounts\.dancehall|weightKg|kcal/,
    );
  });
  it('trims and caps what it carries', () => {
    const p = buildAchievementShare(
      { kind: 'workout', title: ` ${'T'.repeat(200)} `, minutes: 9999 },
      { includeMinutes: true, note: 'N'.repeat(500) },
    );
    expect(p.milestone.title.length).toBe(80);
    expect(p.milestone.minutes).toBe(600);
    expect(p.publicLines[p.publicLines.length - 1]!.length).toBe(COMMUNITY_LIMITS.noteChars);
  });
});

describe('moderation queue', () => {
  const item = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    targetType: 'post' as const,
    createdAt: `2026-06-01T10:0${id}:00Z`,
    status: 'held' as const,
    flags: [] as string[],
    reportCount: 0,
    hasMedia: false,
    ...over,
  });
  it('shows only held and hidden items, urgent first, then reported, then oldest first', () => {
    const q = moderationQueue([
      item('1'),
      item('2', { reportCount: 2 }),
      item('3', { flags: ['self_harm'] }),
      item('4', { status: 'published' }),
      item('5', { status: 'removed' }),
      item('6', { flags: ['private_information'], status: 'hidden' }),
    ]);
    expect(q.map((i) => i.id)).toEqual(['3', '6', '2', '1']);
  });
});

import { readFileSync } from 'node:fs';
describe('shared cases: the TypeScript rules and the database proposal must agree', () => {
  const doc = JSON.parse(
    readFileSync(new URL('../../../supabase/tests/community-cases.json', import.meta.url), 'utf8'),
  ) as {
    text: Array<{ text: string; max: number; decision: string; flags: string[] }>;
    usernames: Array<{ name: string; ok: boolean }>;
  };
  it('text screening gives the recorded decision and flags for every case', () => {
    expect(doc.text.length).toBeGreaterThan(30);
    for (const c of doc.text) {
      const r = screenText(c.text, { maxChars: c.max });
      expect(
        { decision: r.decision, flags: [...r.flags].sort() },
        JSON.stringify(c.text.slice(0, 40)),
      ).toEqual({ decision: c.decision, flags: c.flags });
    }
  });
  it('usernames are accepted or refused exactly as recorded', () => {
    for (const c of doc.usernames) expect(validateUsername(c.name).ok, c.name).toBe(c.ok);
  });
});

describe('moderation targets', () => {
  it('match the database backlog function', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync(
      new URL('../../../supabase/proposed/community.up.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain(
      `urgent_target numeric := ${MODERATION_TARGETS.urgentHours}; normal_target numeric := ${MODERATION_TARGETS.normalHours};`,
    );
    expect(sql).toContain(`>= ${MODERATION_TARGETS.mediaPauseCount} \n`.trim());
    expect(sql).toContain(`interval '${MODERATION_TARGETS.mediaPauseHours} hours'`);
  });
});
