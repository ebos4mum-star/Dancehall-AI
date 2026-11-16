import {
  COMMUNITY_LIMITS,
  GUEST,
  POST_TYPES,
  REPORT_REASONS,
  buildFeed,
  canSeeComment,
  canSeePost,
  moderationQueue,
  screenText,
  shouldHideAfterReports,
  statusAfter,
  toPublicComment,
  toPublicPost,
  validateMedia,
  validateUsername,
  withinDailyLimit,
  type CommunityAction,
  type MediaInput,
  type MilestoneShare,
  type ModerationAction,
  type ModerationItem,
  type PostType,
  type PublicComment,
  type PublicPost,
  type ReportReason,
  type StoredComment,
  type StoredPost,
  type Viewer,
} from './community';
import { hasPermission, type StaffRole } from './roles';

/**
 * The Community rules as one reference implementation over plain data. The device (development mock) runs it directly; the database proposal in
 * `supabase/proposed/community.up.sql` enforces the same rules in SQL, and the server code that replaces this must pass the same tests.
 *
 * Every method takes the acting person's INTERNAL id. Nothing it returns contains one: readers get only `PublicPost` / `PublicComment` (usernames and opaque content ids).
 */
export interface CommunityState {
  profiles: Record<string, { username: string; createdAt: string; suspended?: boolean }>;
  posts: StoredPost[];
  comments: StoredComment[];
  reactions: Array<{ postId: string; userId: string }>;
  reports: Array<{
    id: string;
    targetType: 'post' | 'comment';
    targetId: string;
    reporterId: string;
    reason: ReportReason;
    note: string | null;
    createdAt: string;
  }>;
  blocks: Array<{ blockerId: string; blockedId: string }>;
  /** Recent actions, for daily limits. Old entries are dropped. */
  actions: Array<{ userId: string; kind: CommunityAction; at: string }>;
  seq: number;
}
export const emptyCommunity = (): CommunityState => ({
  profiles: {},
  posts: [],
  comments: [],
  reactions: [],
  reports: [],
  blocks: [],
  actions: [],
  seq: 0,
});

export type CommunityFail = { ok: false; code: string; reasons: string[]; support?: boolean };
export type Ok<T> = { ok: true } & T;
const fail = (code: string, reason: string, extra: Partial<CommunityFail> = {}): CommunityFail => ({
  ok: false,
  code,
  reasons: [reason],
  ...extra,
});

export interface NewPostInput {
  type: PostType;
  body: string;
  milestone?: MilestoneShare | null;
  media?: MediaInput[];
}
export interface StaffActor {
  role: StaffRole | null;
  mfaVerified: boolean;
}

const DAY = 86_400_000;

export class CommunityEngine {
  constructor(
    public state: CommunityState,
    private now: () => Date = () => new Date(),
    private newId: (prefix: string) => string = (p) =>
      `${p}_${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`,
  ) {}

  // ----- identity -----
  usernameOf(userId: string): string | null {
    return this.state.profiles[userId]?.username ?? null;
  }
  private idOfUsername(username: string): string | null {
    const u = username.trim().toLowerCase();
    return Object.entries(this.state.profiles).find(([, p]) => p.username === u)?.[0] ?? null;
  }
  claimUsername(userId: string, raw: string): Ok<{ username: string }> | CommunityFail {
    if (this.state.profiles[userId])
      return fail('already_set', 'You already have a username. It cannot be changed.');
    const v = validateUsername(raw);
    if (!v.ok) return fail('invalid_username', v.reason);
    if (this.idOfUsername(v.username))
      return fail('taken', 'That name is taken. Try a different one.');
    this.state.profiles[userId] = { username: v.username, createdAt: this.now().toISOString() };
    return { ok: true, username: v.username };
  }

  // ----- viewer -----
  viewer(userId: string | null): Viewer {
    if (!userId) return GUEST;
    return {
      id: userId,
      blocked: new Set(
        this.state.blocks.filter((b) => b.blockerId === userId).map((b) => b.blockedId),
      ),
      blockedBy: new Set(
        this.state.blocks.filter((b) => b.blockedId === userId).map((b) => b.blockerId),
      ),
    };
  }
  private encouragedBy(postId: string): Set<string> {
    return new Set(this.state.reactions.filter((r) => r.postId === postId).map((r) => r.userId));
  }
  private commentCount(postId: string, v: Viewer): number {
    const post = this.state.posts.find((p) => p.id === postId);
    return post
      ? this.state.comments.filter((c) => c.postId === postId && canSeeComment(c, post, v)).length
      : 0;
  }
  private pub(p: StoredPost, v: Viewer): PublicPost {
    return toPublicPost(p, v, {
      commentCount: this.commentCount(p.id, v),
      encouragedBy: this.encouragedBy(p.id),
    });
  }

  // ----- limits -----
  private used(userId: string, kind: CommunityAction): number {
    const since = this.now().getTime() - DAY;
    return this.state.actions.filter(
      (a) => a.userId === userId && a.kind === kind && Date.parse(a.at) > since,
    ).length;
  }
  private record(userId: string, kind: CommunityAction) {
    const since = this.now().getTime() - 2 * DAY;
    this.state.actions = this.state.actions.filter((a) => Date.parse(a.at) > since);
    this.state.actions.push({ userId, kind, at: this.now().toISOString() });
  }
  private gate(
    userId: string,
    kind: CommunityAction,
    needsUsername: boolean,
  ): CommunityFail | null {
    const prof = this.state.profiles[userId];
    if (needsUsername && !prof) return fail('needs_username', 'Choose a public username first.');
    if (prof?.suspended) return fail('suspended', 'Posting is paused on this account.');
    if (!withinDailyLimit(kind, this.used(userId, kind)))
      return fail('rate_limited', 'That is enough for today. Please try again tomorrow.');
    return null;
  }

  // ----- reading -----
  feed(
    viewerId: string | null,
    opts: { cursor?: string | null; limit?: number } = {},
  ): { posts: PublicPost[]; next: string | null } {
    const v = this.viewer(viewerId);
    const page = buildFeed(this.state.posts, v, opts);
    return { posts: page.posts.map((p) => this.pub(p, v)), next: page.next };
  }
  comments(viewerId: string | null, postId: string): PublicComment[] {
    const v = this.viewer(viewerId);
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return [];
    return this.state.comments
      .filter((c) => c.postId === postId && canSeeComment(c, post, v))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((c) => toPublicComment(c, v));
  }

  // ----- posting -----
  createPost(
    userId: string,
    input: NewPostInput,
    opts: { confirmed: boolean },
  ): Ok<{ post: PublicPost; status: 'published' | 'held'; message: string }> | CommunityFail {
    if (opts.confirmed !== true) return fail('not_confirmed', 'Please confirm before sharing.');
    const blocked = this.gate(userId, 'post', true);
    if (blocked) return blocked;
    if (!(POST_TYPES as readonly string[]).includes(input.type))
      return fail('invalid_type', 'That kind of post is not available.');
    const media = input.media ?? [];
    const mediaOk = validateMedia(media);
    if (!mediaOk.ok) return fail('invalid_media', mediaOk.reason);
    if (
      (input.type === 'photo') !== media.some((m) => m.kind === 'photo') ||
      (input.type === 'video') !== media.some((m) => m.kind === 'video')
    )
      return fail(
        'invalid_media',
        input.type === 'photo'
          ? 'Add a photo, or choose another kind of post.'
          : input.type === 'video'
            ? 'Add a video, or choose another kind of post.'
            : 'This kind of post has no photos or video.',
      );
    let milestone: MilestoneShare | null = null;
    if (input.type === 'milestone') {
      const m = input.milestone;
      if (!m || !m.title || (m.kind !== 'workout' && m.kind !== 'achievement'))
        return fail('invalid_milestone', 'There is nothing to share.');
      milestone = {
        kind: m.kind,
        title: String(m.title).trim().slice(0, 80),
        style: m.style ? String(m.style).slice(0, 40) : null,
        minutes:
          typeof m.minutes === 'number' && m.minutes > 0
            ? Math.min(600, Math.round(m.minutes))
            : null,
        achievementId: m.achievementId ? String(m.achievementId).slice(0, 40) : null,
      };
    } else if (input.milestone)
      return fail('invalid_milestone', 'Only a milestone post can carry one.');
    const max =
      input.type === 'story'
        ? COMMUNITY_LIMITS.storyChars
        : input.type === 'milestone'
          ? COMMUNITY_LIMITS.postChars
          : COMMUNITY_LIMITS.postChars;
    const text =
      input.type === 'milestone' || input.type === 'photo' || input.type === 'video'
        ? input.body.trim() || ''
        : input.body;
    // A milestone, photo or video may have no words of its own; everything else needs some.
    const needsWords = input.type === 'text' || input.type === 'story';
    let flags: string[] = [];
    let hold = false;
    if (needsWords || text.length > 0) {
      const s = screenText(text, { maxChars: max });
      if (s.decision === 'block')
        return { ok: false, code: 'blocked', reasons: s.reasons, support: s.support };
      if (s.decision === 'hold') {
        hold = true;
        flags = s.flags;
      }
    }
    // Photos and videos cannot be scanned, so they are always reviewed by a person before anyone else sees them.
    if (media.length > 0) {
      hold = true;
      flags = [...flags, 'media_review'];
    }
    const id = this.newId('post');
    const post: StoredPost = {
      id,
      authorId: userId,
      authorUsername: this.state.profiles[userId]!.username,
      type: input.type,
      body: text,
      milestone,
      media: media.map((m) => ({ ...m })),
      status: hold ? 'held' : 'published',
      createdAt: this.now().toISOString(),
      flags,
    };
    this.state.posts.push(post);
    this.record(userId, 'post');
    return {
      ok: true,
      post: this.pub(post, this.viewer(userId)),
      status: post.status as 'published' | 'held',
      message: hold ? 'Thank you. Your post will appear after a quick review.' : 'Shared.',
    };
  }

  deletePost(userId: string, postId: string): Ok<object> | CommunityFail {
    const i = this.state.posts.findIndex((p) => p.id === postId);
    if (i < 0 || this.state.posts[i]!.authorId !== userId)
      return fail('not_found', 'That post is not available.');
    this.state.posts.splice(i, 1);
    this.state.comments = this.state.comments.filter((c) => c.postId !== postId);
    this.state.reactions = this.state.reactions.filter((r) => r.postId !== postId);
    return { ok: true };
  }

  addComment(
    userId: string,
    postId: string,
    text: string,
  ):
    | Ok<{ comment: PublicComment; status: 'published' | 'hidden'; message: string }>
    | CommunityFail {
    const post = this.state.posts.find((p) => p.id === postId);
    const v = this.viewer(userId);
    if (!post || !canSeePost(post, v)) return fail('not_found', 'That post is not available.');
    const blocked = this.gate(userId, 'comment', true);
    if (blocked) return blocked;
    const s = screenText(text, { maxChars: COMMUNITY_LIMITS.commentChars });
    if (s.decision === 'block')
      return { ok: false, code: 'blocked', reasons: s.reasons, support: s.support };
    const c: StoredComment = {
      id: this.newId('cmt'),
      postId,
      authorId: userId,
      authorUsername: this.state.profiles[userId]!.username,
      body: text.trim(),
      status: s.decision === 'hold' ? 'hidden' : 'published',
      createdAt: this.now().toISOString(),
    };
    this.state.comments.push(c);
    this.record(userId, 'comment');
    return {
      ok: true,
      comment: toPublicComment(c, v),
      status: c.status === 'published' ? 'published' : 'hidden',
      message:
        c.status === 'published'
          ? 'Posted.'
          : 'Thank you. Your comment will appear after a quick review.',
    };
  }
  deleteComment(userId: string, commentId: string): Ok<object> | CommunityFail {
    const c = this.state.comments.find((x) => x.id === commentId);
    const post = c ? this.state.posts.find((p) => p.id === c.postId) : undefined;
    if (!c || !post || (c.authorId !== userId && post.authorId !== userId))
      return fail('not_found', 'That comment is not available.');
    this.state.comments = this.state.comments.filter((x) => x.id !== commentId);
    return { ok: true };
  }

  setEncourage(
    userId: string,
    postId: string,
    on: boolean,
  ): Ok<{ encouraged: boolean }> | CommunityFail {
    const post = this.state.posts.find((p) => p.id === postId);
    const v = this.viewer(userId);
    if (!post || !canSeePost(post, v)) return fail('not_found', 'That post is not available.');
    if (post.authorId === userId) return fail('own_post', 'You cannot encourage your own post.');
    const had = this.state.reactions.some((r) => r.postId === postId && r.userId === userId);
    if (on === had) return { ok: true, encouraged: had };
    const blocked = this.gate(userId, 'reaction', false);
    if (blocked) return blocked;
    if (on) {
      this.state.reactions.push({ postId, userId });
      this.record(userId, 'reaction');
    } else
      this.state.reactions = this.state.reactions.filter(
        (r) => !(r.postId === postId && r.userId === userId),
      );
    return { ok: true, encouraged: on };
  }

  // ----- safety: reporting and blocking -----
  report(
    userId: string,
    input: {
      targetType: 'post' | 'comment';
      targetId: string;
      reason: ReportReason;
      note?: string;
    },
  ): Ok<object> | CommunityFail {
    if (!(REPORT_REASONS as readonly string[]).includes(input.reason))
      return fail('invalid_reason', 'Choose a reason.');
    const v = this.viewer(userId);
    const post =
      input.targetType === 'post'
        ? this.state.posts.find((p) => p.id === input.targetId)
        : this.state.posts.find(
            (p) => p.id === this.state.comments.find((c) => c.id === input.targetId)?.postId,
          );
    const comment =
      input.targetType === 'comment'
        ? this.state.comments.find((c) => c.id === input.targetId)
        : undefined;
    const target = input.targetType === 'post' ? post : comment;
    if (
      !target ||
      !post ||
      !(input.targetType === 'post' ? canSeePost(post, v) : canSeeComment(comment!, post, v))
    )
      return fail('not_found', 'That is not available.');
    if (target.authorId === userId)
      return fail('own_content', 'You can delete your own content instead.');
    const dup = this.state.reports.some(
      (r) => r.reporterId === userId && r.targetId === input.targetId,
    );
    if (dup) return { ok: true }; // quiet: reporting twice changes nothing and reveals nothing
    const blocked = this.gate(userId, 'report', false);
    if (blocked) return blocked;
    this.state.reports.push({
      id: this.newId('rep'),
      targetType: input.targetType,
      targetId: input.targetId,
      reporterId: userId,
      reason: input.reason,
      note: input.note ? input.note.trim().slice(0, COMMUNITY_LIMITS.noteChars) : null,
      createdAt: this.now().toISOString(),
    });
    this.record(userId, 'report');
    const mine = this.state.reports.filter((r) => r.targetId === input.targetId);
    const flagged =
      input.reason === 'private_information' || input.reason === 'self_harm' ? [input.reason] : [];
    if (
      shouldHideAfterReports(
        mine.map((r) => r.reason),
        new Set(mine.map((r) => r.reporterId)).size,
      )
    ) {
      if (target.status === 'published') target.status = 'hidden';
    }
    if (flagged.length && 'flags' in target)
      (target as StoredPost).flags = [
        ...new Set([...((target as StoredPost).flags ?? []), ...flagged]),
      ];
    return { ok: true };
  }
  block(userId: string, username: string): Ok<object> | CommunityFail {
    const id = this.idOfUsername(username);
    if (!id) return fail('not_found', 'We could not find that member.');
    if (id === userId) return fail('self', 'You cannot block yourself.');
    if (!this.state.blocks.some((b) => b.blockerId === userId && b.blockedId === id))
      this.state.blocks.push({ blockerId: userId, blockedId: id });
    return { ok: true };
  }
  unblock(userId: string, username: string): Ok<object> | CommunityFail {
    const id = this.idOfUsername(username);
    if (!id) return fail('not_found', 'We could not find that member.');
    this.state.blocks = this.state.blocks.filter(
      (b) => !(b.blockerId === userId && b.blockedId === id),
    );
    return { ok: true };
  }
  blockedUsernames(userId: string): string[] {
    return this.state.blocks
      .filter((b) => b.blockerId === userId)
      .map((b) => this.usernameOf(b.blockedId))
      .filter((u): u is string => !!u)
      .sort();
  }

  // ----- moderation (staff only; moderators never see health records, account ids or emails) -----
  private allowed(a: StaffActor): boolean {
    return hasPermission(a.role, 'moderation.review', { mfaVerified: a.mfaVerified });
  }
  moderationQueue(actor: StaffActor):
    | Ok<{
        items: Array<
          ModerationItem & { author: string; body: string; reportReasons: ReportReason[] }
        >;
      }>
    | CommunityFail {
    if (!this.allowed(actor)) return fail('forbidden', 'Not allowed.');
    const mk = (
      targetType: 'post' | 'comment',
      id: string,
      status: ModerationItem['status'],
      createdAt: string,
      flags: string[],
      hasMedia: boolean,
      author: string,
      body: string,
    ) => {
      const reps = this.state.reports.filter((r) => r.targetId === id);
      return {
        id,
        targetType,
        createdAt,
        status,
        flags,
        reportCount: reps.length,
        hasMedia,
        author,
        body,
        reportReasons: reps.map((r) => r.reason),
      };
    };
    const items = [
      ...this.state.posts.map((p) =>
        mk(
          'post',
          p.id,
          p.status,
          p.createdAt,
          p.flags ?? [],
          p.media.length > 0,
          p.authorUsername,
          p.body,
        ),
      ),
      ...this.state.comments.map((c) =>
        mk('comment', c.id, c.status, c.createdAt, [], false, c.authorUsername, c.body),
      ),
    ];
    const order = moderationQueue(items);
    return { ok: true, items: order.map((o) => items.find((i) => i.id === o.id)!) };
  }
  moderate(
    actor: StaffActor,
    input: { targetType: 'post' | 'comment'; targetId: string; action: ModerationAction },
  ): Ok<object> | CommunityFail {
    if (!this.allowed(actor)) return fail('forbidden', 'Not allowed.');
    const target =
      input.targetType === 'post'
        ? this.state.posts.find((p) => p.id === input.targetId)
        : this.state.comments.find((c) => c.id === input.targetId);
    if (!target) return fail('not_found', 'Not found.');
    const next = statusAfter(input.action);
    (target as { status: string }).status = next;
    if (input.action === 'approve')
      this.state.reports = this.state.reports.filter((r) => r.targetId !== input.targetId);
    return { ok: true };
  }
  suspendMember(actor: StaffActor, username: string, on: boolean): Ok<object> | CommunityFail {
    if (!this.allowed(actor)) return fail('forbidden', 'Not allowed.');
    const id = this.idOfUsername(username);
    if (!id) return fail('not_found', 'Not found.');
    this.state.profiles[id]!.suspended = on;
    return { ok: true };
  }

  // ----- account deletion -----
  /** Removes everything a member made or did. Reports they filed are kept only as anonymous moderation records. */
  deleteMember(userId: string): void {
    const s = this.state;
    const mine = new Set(s.posts.filter((p) => p.authorId === userId).map((p) => p.id));
    s.posts = s.posts.filter((p) => p.authorId !== userId);
    s.comments = s.comments.filter((c) => c.authorId !== userId && !mine.has(c.postId));
    s.reactions = s.reactions.filter((r) => r.userId !== userId && !mine.has(r.postId));
    s.blocks = s.blocks.filter((b) => b.blockerId !== userId && b.blockedId !== userId);
    s.reports = s.reports.filter((r) => !mine.has(r.targetId));
    s.actions = s.actions.filter((a) => a.userId !== userId);
    delete s.profiles[userId];
  }
}
