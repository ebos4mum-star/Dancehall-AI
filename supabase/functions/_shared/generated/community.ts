// GENERATED from packages/shared/src/community.ts by scripts/sync-edge-core.mjs. Do not edit: change the source and run `node scripts/sync-edge-core.mjs`.
/**
 * Community: one chronological feed, one Share Progress action, one Encourage reaction and simple flat comments. Pure rules only (no storage, no clock, no randomness), so
 * the safety behaviour is the same on the device, in tests and in the database proposal that mirrors it.
 *
 * What it deliberately does NOT have: follows, direct messages, hashtags, mentions, an algorithmic or "popular" feed, leaderboards, or public counts of who is liked.
 *
 * Privacy: people appear only by a public username. Internal account ids, emails (including the synthetic sign-in address) and health records never appear in anything a
 * reader receives (`toPublicPost`, `toPublicComment`). A shared achievement carries only a short whitelist of fields (`buildAchievementShare`); weight, calories,
 * measurements, effort ratings and readiness answers can never be added to one.
 *
 * Safety: text is screened before it is stored (blocked, or held for a person to review); photos publish at once (V1 decision: no staff pre-approval) and are acted on after publication through reports; reports hide a post
 * quickly; blocking is mutual and silent; every action is rate limited; authors can delete their own content at any time.
 *
 * PROVISIONAL: the word lists and limits below are engineering defaults. A reviewed list, a moderator process and a legal/terms review are required before this is public.
 */

export const COMMUNITY_LIMITS = {
  postChars: 500,
  storyChars: 1500,
  commentChars: 300,
  noteChars: 200,
  postsPerDay: 5,
  commentsPerDay: 30,
  reactionsPerDay: 100,
  reportsPerDay: 10,
  /** A photo post is one photo, or a before-and-after pair. */
  maxPhotos: 2,
  videoSeconds: 30,
  videoMB: 25,
  photoMB: 8,
  /** Different people who must report something before it is hidden pending review. */
  autoHideReports: 3,
  feedPageMax: 30,
} as const;

export const POST_TYPES = ['text', 'story', 'milestone', 'photo', 'video'] as const;
export type PostType = (typeof POST_TYPES)[number];

// ---------- Usernames ----------
export type UsernameResult = { ok: true; username: string } | { ok: false; reason: string };
const RESERVED = new Set([
  'admin',
  'administrator',
  'moderator',
  'mod',
  'staff',
  'support',
  'official',
  'system',
  'root',
  'null',
  'undefined',
  'anonymous',
  'everyone',
  'deleted',
  'pulse',
  'coach',
  'team',
  'help',
]);
/** Words an impersonator would use. Matched anywhere in the name. */
const BRAND_PARTS = ['dancehallfit', 'dancehall_fit', 'dhfit', 'dancehallai'];
/** A small default blocklist. A reviewed list is a launch requirement. */
const ABUSIVE_NAME = ['idiot', 'stupid', 'ugly', 'fatty', 'loser', 'hate'];
/** Pro-eating-disorder and self-harm terms: never allowed in a name or a post. */
const ED_TERMS = [
  'thinspo',
  'proana',
  'pro_ana',
  'promia',
  'pro_mia',
  'bonespo',
  'meanspo',
  'edtwt',
  'anorexia tips',
  'purge tips',
];
const SELF_HARM = [
  'kill myself',
  'suicide',
  'end my life',
  'self harm',
  'self-harm',
  'cut myself',
  'want to die',
];

/** Days a member must wait between username changes. Their first change is free. */
export const USERNAME_COOLDOWN_DAYS = 30;
/** Days a released name stays unavailable to anyone else, so it cannot be used to pass as the previous owner. */
export const USERNAME_HOLD_DAYS = 90;

/**
 * Collapses look-alike spellings (adm1n, rn/m, 0/o, 1/l/i, underscores) so "dancehall_fit" and "dancehal1fit" count as the same name.
 * Used to refuse names that would let someone pass as staff, the app or another member.
 */
export function usernameSkeleton(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/_/g, '')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/[1i|]/g, 'l')
    .replace(/0/g, 'o')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');
}
const RESERVED_SKELETONS = [...RESERVED].map(usernameSkeleton);

export function validateUsername(raw: string): UsernameResult {
  const u = raw.trim().toLowerCase();
  if (u.length < 3 || u.length > 20) return { ok: false, reason: 'Use 3 to 20 characters.' };
  if (!/^[a-z][a-z0-9_]*$/.test(u))
    return {
      ok: false,
      reason: 'Start with a letter, then use only letters, numbers and underscores.',
    };
  if (u.endsWith('_') || u.includes('__'))
    return { ok: false, reason: 'Avoid a trailing or doubled underscore.' };
  // Anything that looks like a phone number, an internal id or the synthetic sign-in address is never a public name.
  if (/\d{6,}/.test(u) || /^u[0-9a-f]{16,}$/.test(u) || /[0-9a-f]{16,}/.test(u))
    return { ok: false, reason: 'That name is not available. Try a different one.' };
  const flat = u.replace(/_/g, '');
  if (
    RESERVED.has(u) ||
    RESERVED_SKELETONS.includes(usernameSkeleton(u)) ||
    BRAND_PARTS.some((b) => usernameSkeleton(flat).includes(usernameSkeleton(b))) ||
    BRAND_PARTS.some((b) => flat.includes(b.replace(/_/g, ''))) ||
    ABUSIVE_NAME.some((b) => flat.includes(b)) ||
    ED_TERMS.some((b) => flat.includes(b.replace(/[ _]/g, '')))
  )
    return { ok: false, reason: 'That name is not available. Try a different one.' };
  return { ok: true, username: u };
}

// ---------- Text screening ----------
export type ScreenDecision = 'allow' | 'hold' | 'block';
export interface ScreenResult {
  decision: ScreenDecision;
  /** Plain reasons the person can read. For a block these say what to change; they never repeat the offending text. */
  reasons: string[];
  /** Machine-readable flags for moderators. */
  flags: string[];
  /** Set when the text suggests the person may need support: the app shows kind help instead of posting. */
  support: boolean;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i;
const URL_LIKE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|app|link|ly|gg|xyz|info|biz|shop)\b/i;
const PHONE = /(?:\+?\d[\s().-]?){7,}/;
const MENTION = /(^|\s)@\w+/;
const CONTACT_SOLICIT =
  /\b(dm me|message me|text me|whats ?app|telegram|snap ?chat|insta(?:gram)?|cash ?app|venmo|paypal|onlyfans|link in bio|follow me)\b/i;
// V1 decision: ordinary talk about weight, calories, health numbers and personal weight-loss experiences is allowed and never held. What is rejected (with a reason, never held) is
// dangerous: promoted diet drugs, "miracle" claims, starvation instructions, and harassment.
const HEALTH_CLAIM =
  /\b(cure[sd]?|detox|miracle|guaranteed|burn(?:s|ed)? fat fast|fat[- ]burner|diet pills?|weight loss (?:drug|jab|injection)|ozempic|wegovy|semaglutide|mounjaro|tirzepatide|laxatives?|starv\w+|fasting for \d+)\b/i;
const HARASSMENT =
  /\b(kill yourself|kys|go die|hope you die|fat (?:pig|cow|slob)|ugly (?:cow|pig)|you(?:'| a)?re (?:so )?(?:fat|disgusting|ugly)|nobody likes you)\b/i;

export function screenText(raw: string, opts: { maxChars: number }): ScreenResult {
  const text = raw.trim();
  const out = (
    decision: ScreenDecision,
    reasons: string[],
    flags: string[],
    support = false,
  ): ScreenResult => ({ decision, reasons, flags, support });
  if (text.length === 0) return out('block', ['Write something first.'], ['empty']);
  if (text.length > opts.maxChars)
    return out('block', [`Keep it to ${opts.maxChars} characters.`], ['too_long']);
  const lower = text.toLowerCase();
  if (SELF_HARM.some((w) => lower.includes(w)))
    return out(
      'block',
      [
        'It sounds like you might be going through something hard. This space cannot support that, but you deserve support: please reach out to a doctor, someone you trust, or a local crisis line.',
      ],
      ['self_harm'],
      true,
    );
  if (ED_TERMS.some((w) => lower.replace(/[\s_-]/g, '').includes(w.replace(/[\s_-]/g, ''))))
    return out(
      'block',
      [
        'We cannot post content that promotes extreme restriction or disordered eating. If food or weight feels hard, a doctor or a dietitian who works with eating concerns can help.',
      ],
      ['ed_content'],
      true,
    );
  const blocks: string[] = [];
  const flags: string[] = [];
  if (EMAIL.test(text)) {
    blocks.push('Please leave out email addresses.');
    flags.push('email');
  }
  if (URL_LIKE.test(text)) {
    blocks.push('Please leave out links.');
    flags.push('link');
  }
  if (PHONE.test(text)) {
    blocks.push('Please leave out phone numbers.');
    flags.push('phone');
  }
  if (MENTION.test(text)) {
    blocks.push('Mentions are not used here.');
    flags.push('mention');
  }
  if (CONTACT_SOLICIT.test(text)) {
    blocks.push('Please do not ask people to contact you elsewhere.');
    flags.push('contact_solicit');
  }
  if (blocks.length > 0) return out('block', blocks, flags);
  const rejects: string[] = [];
  if (HARASSMENT.test(text)) {
    rejects.push('Please keep it kind. Insults and harassment are not allowed here.');
    flags.push('harassment');
  }
  if (HEALTH_CLAIM.test(text)) {
    rejects.push('Please leave out health claims, diet drugs and extreme restriction.');
    flags.push('health_claim');
  }
  if (rejects.length > 0) return out('block', rejects, flags);
  return out('allow', [], []);
}

// ---------- Media ----------
export interface MediaInput {
  kind: 'photo' | 'video';
  /** For a before-and-after pair. */
  role: 'single' | 'before' | 'after';
  mime: string;
  bytes: number;
  durationS?: number | null;
  /** Where the file is (a local file on the device; a storage path in a real backend). Never shown as an identifier of the person. */
  uri: string;
}
export type MediaCheck = { ok: true } | { ok: false; reason: string };
const PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];

export function validateMedia(list: readonly MediaInput[]): MediaCheck {
  if (list.length === 0) return { ok: true };
  const photos = list.filter((m) => m.kind === 'photo');
  const videos = list.filter((m) => m.kind === 'video');
  if (photos.length > 0 && videos.length > 0)
    return { ok: false, reason: 'Share photos or a video, not both.' };
  if (videos.length > 1) return { ok: false, reason: 'One video per post.' };
  if (photos.length > COMMUNITY_LIMITS.maxPhotos)
    return { ok: false, reason: 'At most two photos: a before and an after.' };
  for (const m of list) {
    if (!m.uri) return { ok: false, reason: 'The file is missing.' };
    if (m.kind === 'photo') {
      if (!PHOTO_MIME.includes(m.mime))
        return { ok: false, reason: 'Use a JPEG, PNG or WebP photo.' };
      if (m.bytes > COMMUNITY_LIMITS.photoMB * 1_048_576)
        return { ok: false, reason: `Photos can be up to ${COMMUNITY_LIMITS.photoMB} MB.` };
    } else {
      if (!VIDEO_MIME.includes(m.mime))
        return { ok: false, reason: 'Use an MP4, MOV or WebM video.' };
      if (m.bytes > COMMUNITY_LIMITS.videoMB * 1_048_576)
        return { ok: false, reason: `Videos can be up to ${COMMUNITY_LIMITS.videoMB} MB.` };
      if (!(
        typeof m.durationS === 'number' &&
        m.durationS > 0 &&
        m.durationS <= COMMUNITY_LIMITS.videoSeconds
      ))
        return {
          ok: false,
          reason: `Videos can be up to ${COMMUNITY_LIMITS.videoSeconds} seconds.`,
        };
    }
  }
  if (photos.length === 2) {
    const roles = photos
      .map((p) => p.role)
      .sort()
      .join(',');
    if (roles !== 'after,before')
      return { ok: false, reason: 'A pair needs one before and one after photo.' };
  } else if (photos.length === 1 && photos[0]!.role !== 'single')
    return { ok: false, reason: 'A single photo is not a before-and-after pair.' };
  return { ok: true };
}

// ---------- Posts, comments, visibility ----------
export type PostStatus = 'published' | 'held' | 'hidden' | 'removed';
export type CommentStatus = 'published' | 'hidden' | 'removed';

export interface MilestoneShare {
  kind: 'workout' | 'achievement';
  title: string;
  style?: string | null;
  minutes?: number | null;
  achievementId?: string | null;
}

/** A stored post. `authorId` is INTERNAL and never leaves the server; readers only ever get `toPublicPost`. */
export interface StoredPost {
  id: string;
  authorId: string;
  authorUsername: string;
  type: PostType;
  body: string;
  milestone: MilestoneShare | null;
  media: MediaInput[];
  status: PostStatus;
  createdAt: string;
  /** Development sample posts are labelled as such. */
  isSample?: boolean;
  /** Moderator-facing flags from screening and reports. Never shown to readers. */
  flags?: string[];
}
export interface StoredComment {
  id: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  isSample?: boolean;
}
export interface Viewer {
  /** Internal id, or null for a guest. */
  id: string | null;
  /** Ids the viewer blocked, and ids that blocked the viewer. Blocking is mutual and silent. */
  blocked: ReadonlySet<string>;
  blockedBy: ReadonlySet<string>;
}
export const GUEST: Viewer = { id: null, blocked: new Set(), blockedBy: new Set() };

const hiddenBetween = (v: Viewer, authorId: string) =>
  v.blocked.has(authorId) || v.blockedBy.has(authorId);

export function canSeePost(p: StoredPost, v: Viewer): boolean {
  if (p.authorId === v.id) return p.status !== 'removed'; // authors see their own held and hidden posts, with a label
  if (p.status !== 'published') return false;
  return !hiddenBetween(v, p.authorId);
}
export function canSeeComment(c: StoredComment, post: StoredPost, v: Viewer): boolean {
  if (!canSeePost(post, v)) return false;
  if (c.authorId === v.id) return c.status !== 'removed';
  if (c.status !== 'published') return false;
  return !hiddenBetween(v, c.authorId);
}

export interface PublicPost {
  id: string;
  /** The public username: the only name anyone sees. */
  author: string;
  type: PostType;
  body: string;
  milestone: MilestoneShare | null;
  media: Array<Pick<MediaInput, 'kind' | 'role' | 'uri'> & { durationS?: number | null }>;
  createdAt: string;
  isMine: boolean;
  isSample: boolean;
  /** Only the author's own non-published posts carry a status; readers only ever see published posts. */
  status: PostStatus;
  commentCount: number;
  encouragedByMe: boolean;
  /** Only the author sees how many people encouraged the post. Nobody sees a ranking. */
  encouragedCount: number | null;
}
export interface PublicComment {
  id: string;
  postId: string;
  author: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  status: CommentStatus;
  isSample: boolean;
}

export function toPublicPost(
  p: StoredPost,
  v: Viewer,
  ctx: { commentCount: number; encouragedBy: ReadonlySet<string> },
): PublicPost {
  const mine = p.authorId === v.id;
  return {
    id: p.id,
    author: p.authorUsername,
    type: p.type,
    body: p.body,
    milestone: p.milestone ? { ...p.milestone } : null,
    media: p.media.map((m) => ({
      kind: m.kind,
      role: m.role,
      uri: m.uri,
      durationS: m.durationS ?? null,
    })),
    createdAt: p.createdAt,
    isMine: mine,
    isSample: p.isSample === true,
    status: p.status,
    commentCount: ctx.commentCount,
    encouragedByMe: v.id !== null && ctx.encouragedBy.has(v.id),
    encouragedCount: ctx.encouragedBy.size, // V1: public like counts (a number only, never who)
  };
}
export function toPublicComment(c: StoredComment, v: Viewer): PublicComment {
  return {
    id: c.id,
    postId: c.postId,
    author: c.authorUsername,
    body: c.body,
    createdAt: c.createdAt,
    isMine: c.authorId === v.id,
    status: c.status,
    isSample: c.isSample === true,
  };
}

/** One chronological feed: newest first, deterministic ties, no ranking of any kind. The cursor is `createdAt|id`. */
export function buildFeed(
  posts: readonly StoredPost[],
  v: Viewer,
  opts: { cursor?: string | null; limit?: number } = {},
): { posts: StoredPost[]; next: string | null } {
  const limit = Math.max(1, Math.min(opts.limit ?? 20, COMMUNITY_LIMITS.feedPageMax));
  const sorted = posts
    .filter((p) => canSeePost(p, v))
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? b.id.localeCompare(a.id)
        : b.createdAt.localeCompare(a.createdAt),
    );
  let start = 0;
  if (opts.cursor) {
    const [at, id] = opts.cursor.split('|');
    start = sorted.findIndex(
      (p) => p.createdAt < (at ?? '') || (p.createdAt === at && p.id.localeCompare(id ?? '') < 0),
    );
    if (start < 0) start = sorted.length;
  }
  const page = sorted.slice(start, start + limit);
  const last = page[page.length - 1];
  return {
    posts: page,
    next: last && start + limit < sorted.length ? `${last.createdAt}|${last.id}` : null,
  };
}

// ---------- Rate limits ----------
export type CommunityAction = 'post' | 'comment' | 'reaction' | 'report';
const DAILY: Record<CommunityAction, number> = {
  post: COMMUNITY_LIMITS.postsPerDay,
  comment: COMMUNITY_LIMITS.commentsPerDay,
  reaction: COMMUNITY_LIMITS.reactionsPerDay,
  report: COMMUNITY_LIMITS.reportsPerDay,
};
export const withinDailyLimit = (action: CommunityAction, usedToday: number): boolean =>
  usedToday < DAILY[action];

// ---------- Moderation targets ----------
/**
 * How quickly open items should be looked at, in hours. PROPOSED defaults for one part-time moderator, awaiting the owner's decision.
 * Mirrored in `app.community_backlog` (SQL). A target is a goal to measure against, not a promise to members.
 */
export const MODERATION_TARGETS = {
  urgentHours: 4,
  normalHours: 48,
  /** Photos and videos pause by themselves when this many are waiting for review, or the oldest has waited this long. */
  mediaPauseCount: 20,
  mediaPauseHours: 72,
} as const;

// ---------- Reports ----------
export const REPORT_REASONS = [
  'harassment',
  'unsafe_advice',
  'body_shaming_or_eating_concern',
  'spam',
  'private_information',
  'child_safety',
  'self_harm',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Reasons that hide the content at once, before any threshold, because waiting could cause harm. */
const IMMEDIATE: readonly ReportReason[] = ['private_information', 'child_safety', 'self_harm'];

export function shouldHideAfterReports(
  reasons: readonly ReportReason[],
  distinctReporters: number,
): boolean {
  return (
    distinctReporters >= COMMUNITY_LIMITS.autoHideReports ||
    reasons.some((r) => IMMEDIATE.includes(r))
  );
}

// ---------- Share My Achievement ----------
/**
 * What a shared achievement may contain. Built from a short whitelist: the title, the dance style, and (only if the person turns it on) the minutes. Weight, calories,
 * measurements, effort ratings, readiness answers, goals and habits are not accepted by this function at all, so they cannot be added by accident.
 */
export interface ShareSource {
  kind: 'workout' | 'achievement';
  title: string;
  style?: string | null;
  minutes?: number | null;
  achievementId?: string | null;
}
export interface ShareOptions {
  /** Off by default: minutes are activity data, so the person opts in. */
  includeMinutes?: boolean;
  /** A short note in the person's own words. Screened like any post. */
  note?: string;
}
export interface SharePreview {
  type: 'milestone';
  body: string;
  milestone: MilestoneShare;
  /** Exactly what will be public, line by line, for the preview. */
  publicLines: string[];
  /** What is NOT shared, stated plainly. */
  privateByDefault: string[];
}
export const PRIVATE_BY_DEFAULT = [
  'Your weight, body measurements and goals',
  'Calories and food logs',
  'Effort ratings and safety answers',
  'Your sleep, hunger and recovery notes',
] as const;

export function buildAchievementShare(src: ShareSource, opts: ShareOptions = {}): SharePreview {
  const title = src.title.trim().slice(0, 80);
  const milestone: MilestoneShare = {
    kind: src.kind,
    title,
    style: src.style ? String(src.style).slice(0, 40) : null,
    minutes:
      opts.includeMinutes && typeof src.minutes === 'number' && src.minutes > 0
        ? Math.min(600, Math.round(src.minutes))
        : null,
    achievementId: src.achievementId ?? null,
  };
  const lead = src.kind === 'workout' ? `Finished a workout: ${title}` : `Earned: ${title}`;
  const note = (opts.note ?? '').trim().slice(0, COMMUNITY_LIMITS.noteChars);
  const publicLines = [
    lead,
    ...(milestone.style ? [`Style: ${milestone.style}`] : []),
    ...(milestone.minutes ? [`${milestone.minutes} minutes`] : []),
    ...(note ? [note] : []),
  ];
  return {
    type: 'milestone',
    body: note ? `${lead}\n${note}` : lead,
    milestone,
    publicLines,
    privateByDefault: [...PRIVATE_BY_DEFAULT],
  };
}

// ---------- Moderation ----------
export type ModerationAction = 'approve' | 'remove' | 'restore';
export interface ModerationItem {
  id: string;
  targetType: 'post' | 'comment';
  createdAt: string;
  status: PostStatus | CommentStatus;
  flags: string[];
  reportCount: number;
  hasMedia: boolean;
}
/** The review queue: held and hidden items, reported ones and self-harm or private-information first, then oldest first. Moderators never see private health records. */
export function moderationQueue(items: readonly ModerationItem[]): ModerationItem[] {
  const urgent = (i: ModerationItem) =>
    i.flags.includes('self_harm') ||
    i.flags.includes('child_safety') ||
    i.flags.includes('private_information')
      ? 0
      : i.reportCount > 0
        ? 1
        : 2;
  return items
    .filter((i) => i.status === 'held' || i.status === 'hidden')
    .sort(
      (a, b) =>
        urgent(a) - urgent(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
}
export function statusAfter(action: ModerationAction): 'published' | 'removed' {
  return action === 'remove' ? 'removed' : 'published';
}
