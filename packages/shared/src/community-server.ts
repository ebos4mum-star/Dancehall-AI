// The Community server layer: one routed function in front of the database. NOT DEPLOYED by this change.
// It runs inside an Edge Function (Deno) and in tests (Node) because everything it needs is passed in (`CommunityDeps`).
//
// What it guarantees, for every route:
//  * Identity comes only from a verified JWT (never from the request body). Guests may browse; everything else needs a signed-in member.
//  * Staff routes need a verified JWT with a second factor (aal2) AND the moderation.review permission, checked again in the database.
//  * Every body is validated field by field; unknown fields are ignored; sizes are bounded. The database re-checks everything.
//  * Every route is rate limited per member (or per hashed network address for guests) before it does any work.
//  * Responses never contain internal user ids, email addresses, storage paths or other members' counts. Media is returned only as short-lived signed links.
//  * Errors are plain codes. Unexpected errors return a generic message and are never logged with content.
import {
  COMMUNITY_LIMITS,
  POST_TYPES,
  REPORT_REASONS,
  screenText,
  validateUsername,
  type PublicComment,
  type PublicPost,
} from './community';
import { checkUpload, mimeForPath } from './community-media';

export interface CommunityRpc {
  /** Calls `app.<fn>` as the server. Throws an Error whose message is the database's exception text. */
  call(fn: string, args: Record<string, unknown>): Promise<unknown>;
}
export interface CommunityStorage {
  signedUploadUrl(path: string): Promise<{ url: string; token: string } | null>;
  download(path: string): Promise<Uint8Array | null>;
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  signedUrl(path: string, seconds: number): Promise<string | null>;
}
export interface CommunityAuth {
  /** Verifies the signature and expiry of a Supabase access token. Null if it is not valid. */
  verify(token: string): Promise<{ userId: string; aal: 'aal1' | 'aal2' } | null>;
}
export interface CommunityDeps {
  rpc: CommunityRpc;
  storage: CommunityStorage;
  auth: CommunityAuth;
  /** Constant-time comparison of the scheduled-maintenance key. */
  maintenanceKeyOk: (key: string | null) => boolean;
}
export interface CommunityRequest {
  route: string;
  token: string | null;
  /** A hash of the caller's network address (never the address itself). Used only to limit guests. */
  networkKey: string;
  body: unknown;
  maintenanceKey?: string | null;
}
export interface CommunityResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

export const MAX_BODY_CHARS = 20_000;
export const SIGNED_VIEW_SECONDS = 600;

// ----- validation -----
class Invalid extends Error {
  constructor(public field: string) {
    super('invalid_input');
  }
}
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (o: Record<string, unknown>, k: string, max: number, opt = false): string => {
  const v = o[k];
  if (v === undefined || v === null) {
    if (opt) return '';
    throw new Invalid(k);
  }
  if (typeof v !== 'string' || v.length > max) throw new Invalid(k);
  return v;
};
const uuid = (o: Record<string, unknown>, k: string): string => {
  const v = o[k];
  if (typeof v !== 'string' || !UUID.test(v)) throw new Invalid(k);
  return v.toLowerCase();
};
const oneOf = <T extends string>(
  o: Record<string, unknown>,
  k: string,
  allowed: readonly T[],
): T => {
  const v = o[k];
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new Invalid(k);
  return v as T;
};
const username = (o: Record<string, unknown>, k: string): string => {
  const v = str(o, k, 40);
  if (!/^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(v)) throw new Invalid(k);
  return v.toLowerCase();
};

// ----- error mapping -----
const STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  suspended: 403,
  muted: 403,
  not_found: 404,
  rate_limited: 429,
  taken: 409,
  too_similar: 409,
  cooldown: 409,
  unchanged: 409,
  already_set: 409,
  needs_username: 409,
  payload_too_large: 413,
  paused: 503,
  media_paused: 503,
  too_large: 422,
  too_long: 422,
  wrong_type: 422,
  unreadable: 422,
  has_location: 422,
  too_many_pixels: 422,
};
const KNOWN = new Set([
  ...Object.keys(STATUS),
  'blocked',
  'not_confirmed',
  'invalid_media',
  'invalid_milestone',
  'invalid_type',
  'invalid_username',
  'invalid_action',
  'own_post',
  'own_content',
  'self',
  'invalid_input',
]);
const MESSAGES: Record<string, string> = {
  unauthorized: 'Please sign in to do that.',
  forbidden: 'You do not have access to that.',
  suspended: 'This account cannot take part in Community right now.',
  muted: 'This account cannot post or comment right now.',
  not_found: 'We could not find that.',
  rate_limited: 'You are doing that too quickly. Please wait a little and try again.',
  taken: 'That name is not available. Try a different one.',
  too_similar: 'That name is too close to another name. Try a different one.',
  cooldown: 'You changed your username recently. Please try again later.',
  unchanged: 'That is already your username.',
  already_set: 'You already have a username.',
  needs_username: 'Choose a username first.',
  payload_too_large: 'That request is too large.',
  paused: 'Community is paused for new posts and comments for a short while. You can still read.',
  media_paused: 'Photos and videos are paused for a short while. You can still share text.',
  not_confirmed: 'Please confirm you want this to be public.',
  blocked: 'That cannot be posted. Please change it and try again.',
  invalid_media: 'That photo or video could not be used.',
};

function fail(code: string, extra: Record<string, unknown> = {}): CommunityResponse {
  const known = KNOWN.has(code);
  const c = known ? code : 'server_error';
  return {
    status: known ? (STATUS[c] ?? 400) : 500,
    body: {
      ok: false,
      code: c,
      message:
        MESSAGES[c] ??
        (known ? 'That could not be done.' : 'Something went wrong. Please try again.'),
      ...extra,
    },
  };
}
const done = (body: Record<string, unknown> = {}): CommunityResponse => ({
  status: 200,
  body: { ok: true, ...body },
});

// ----- routes -----
type Auth = 'guest' | 'member' | 'staff';
interface Route {
  auth: Auth;
  /** Burst bucket, max requests, window seconds. */
  limit: [string, number, number];
  run(ctx: Ctx): Promise<CommunityResponse>;
}
interface Ctx {
  deps: CommunityDeps;
  /** Verified user id; null for a guest. */
  user: string | null;
  aal2: boolean;
  body: Record<string, unknown>;
}
const READ: [string, number, number] = ['read', 90, 60];
const WRITE: [string, number, number] = ['write', 20, 60];
const rpc = (c: Ctx, fn: string, args: Record<string, unknown>) => c.deps.rpc.call(fn, args);
const rows = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v.filter(isObj) as Array<Record<string, unknown>>) : [];

async function signMedia(c: Ctx, media: unknown): Promise<PublicPost['media']> {
  const out: PublicPost['media'] = [];
  for (const m of rows(media)) {
    const path = typeof m.path === 'string' ? m.path : '';
    const url = path ? await c.deps.storage.signedUrl(path, SIGNED_VIEW_SECONDS) : null;
    if (!url) continue;
    out.push({
      kind: m.kind as 'photo' | 'video',
      role: m.role as 'single' | 'before' | 'after',
      uri: url,
      durationS: typeof m.durationS === 'number' ? m.durationS : null,
    });
  }
  return out;
}
async function toPost(c: Ctx, r: Record<string, unknown>): Promise<PublicPost> {
  return {
    id: String(r.id),
    author: String(r.author),
    type: r.type as PublicPost['type'],
    body: String(r.body ?? ''),
    milestone: (r.milestone as PublicPost['milestone']) ?? null,
    media: await signMedia(c, r.media),
    createdAt: new Date(String(r.created_at)).toISOString(),
    isMine: r.is_mine === true,
    isSample: false,
    status: r.status as PublicPost['status'],
    commentCount: Number(r.comment_count ?? 0),
    encouragedByMe: r.encouraged_by_me === true,
    // Only the author's own row carries a number; the database returns null for everyone else.
    encouragedCount:
      r.is_mine === true && typeof r.encouraged_count === 'number' ? r.encouraged_count : null,
  };
}

function cursorOf(body: Record<string, unknown>): { at: string | null; id: string | null } {
  const raw = body.cursor;
  if (raw === undefined || raw === null || raw === '') return { at: null, id: null };
  if (typeof raw !== 'string' || raw.length > 80) throw new Invalid('cursor');
  const [at, id] = raw.split('|');
  if (!at || Number.isNaN(Date.parse(at)) || !id || !UUID.test(id)) throw new Invalid('cursor');
  return { at: new Date(at).toISOString(), id: id.toLowerCase() };
}

/** Storage paths are random and carry no account identifier; ownership is checked in the database. */
const PATH =
  /^m\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|mp4|mov)$/i;
const SERVER_ROLES = ['single', 'before', 'after'] as const;

/** For a refused post or comment, say what to change (the database only says "blocked"). */
function whyBlocked(text: string, max: number): Record<string, unknown> {
  const s = screenText(text, { maxChars: max });
  return { reasons: s.reasons, support: s.support };
}

async function removeFiles(c: Ctx, paths: unknown) {
  const list = Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : [];
  if (list.length) await c.deps.storage.remove(list).catch(() => undefined); // best effort; stale files are swept by maintenance
}

const ROUTES: Record<string, Route> = {
  feed: {
    auth: 'guest',
    limit: READ,
    async run(c) {
      const { at, id } = cursorOf(c.body);
      const limit =
        typeof c.body.limit === 'number'
          ? Math.max(1, Math.min(COMMUNITY_LIMITS.feedPageMax, Math.floor(c.body.limit)))
          : 20;
      const list = rows(
        await rpc(c, 'community_feed', {
          p_viewer: c.user,
          p_cursor_at: at,
          p_cursor_id: id,
          p_limit: limit,
        }),
      );
      const posts = await Promise.all(list.map((r) => toPost(c, r)));
      const last = list[list.length - 1];
      return done({
        posts,
        nextCursor:
          list.length === limit && last
            ? `${new Date(String(last.created_at)).toISOString()}|${String(last.id)}`
            : null,
      });
    },
  },
  comments: {
    auth: 'guest',
    limit: READ,
    async run(c) {
      const list = rows(
        await rpc(c, 'community_comments', { p_viewer: c.user, p_post: uuid(c.body, 'postId') }),
      );
      const comments: PublicComment[] = list.map((r) => ({
        id: String(r.id),
        postId: String(r.post_id),
        author: String(r.author),
        body: String(r.body),
        createdAt: new Date(String(r.created_at)).toISOString(),
        isMine: r.is_mine === true,
        status: r.status as PublicComment['status'],
        isSample: false,
      }));
      return done({ comments });
    },
  },
  status: {
    auth: 'guest',
    limit: READ,
    async run(c) {
      const s = (await rpc(c, 'community_status', {})) as { mode?: string } | null;
      return done({ mode: s?.mode === 'text_only' || s?.mode === 'read_only' ? s.mode : 'open' });
    },
  },
  profile: {
    auth: 'member',
    limit: READ,
    async run(c) {
      const p = (await rpc(c, 'community_profile', { p_user: c.user })) as Record<
        string,
        unknown
      > | null;
      return done({
        username: p?.username ?? null,
        canChangeAt: p?.canChangeAt ?? null,
        restriction: p?.restriction ?? null,
      });
    },
  },
  'username/claim': {
    auth: 'member',
    limit: ['username', 5, 3600],
    async run(c) {
      const name = str(c.body, 'username', 40);
      const v = validateUsername(name);
      if (!v.ok) return fail('invalid_username', { reasons: [v.reason] });
      return done({
        username: await rpc(c, 'community_claim_username', { p_user: c.user, p_name: v.username }),
      });
    },
  },
  'username/change': {
    auth: 'member',
    limit: ['username', 5, 3600],
    async run(c) {
      const name = str(c.body, 'username', 40);
      const v = validateUsername(name);
      if (!v.ok) return fail('invalid_username', { reasons: [v.reason] });
      return done({
        username: await rpc(c, 'community_change_username', { p_user: c.user, p_name: v.username }),
      });
    },
  },
  'upload/ticket': {
    auth: 'member',
    limit: ['upload', 10, 60],
    async run(c) {
      const kind = oneOf(c.body, 'kind', ['photo', 'video'] as const);
      const mime = oneOf(c.body, 'mime', [
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/quicktime',
      ] as const);
      const t = (await rpc(c, 'community_issue_upload', {
        p_user: c.user,
        p_kind: kind,
        p_mime: mime,
      })) as { path: string };
      const url = await c.deps.storage.signedUploadUrl(t.path);
      if (!url) return fail('server_error');
      return done({
        path: t.path,
        uploadUrl: url.url,
        token: url.token,
        maxBytes:
          kind === 'photo'
            ? COMMUNITY_LIMITS.photoMB * 1048576
            : COMMUNITY_LIMITS.videoMB * 1048576,
      });
    },
  },
  'upload/commit': {
    auth: 'member',
    limit: ['upload', 10, 60],
    async run(c) {
      const path = str(c.body, 'path', 200);
      if (!PATH.test(path)) throw new Invalid('path');
      // Must be this member's own ticket, still unchecked (stops anyone rewriting someone else's file). The promised type comes from the ticket.
      const expected = (await rpc(c, 'community_upload_ticket', {
        p_user: c.user,
        p_path: path,
      })) as string;
      if (typeof expected !== 'string' || mimeForPath(path) !== expected) throw new Invalid('path');
      const bytes = await c.deps.storage.download(path);
      if (!bytes) return fail('not_found');
      const verdict = checkUpload(expected, bytes);
      if (!verdict.ok) {
        await rpc(c, 'community_reject_upload', { p_user: c.user, p_path: path });
        await c.deps.storage.remove([path]).catch(() => undefined);
        return fail(verdict.code, { message: verdict.reason });
      }
      if (verdict.kind === 'photo') await c.deps.storage.upload(path, verdict.bytes, verdict.mime); // replaced by the metadata-free copy
      try {
        await rpc(c, 'community_verify_upload', {
          p_user: c.user,
          p_path: path,
          p_bytes: verdict.bytes.length,
          p_duration: verdict.durationS,
        });
      } catch (e) {
        await c.deps.storage.remove([path]).catch(() => undefined);
        throw e;
      }
      return done({
        path,
        kind: verdict.kind,
        bytes: verdict.bytes.length,
        durationS: verdict.durationS,
      });
    },
  },
  post: {
    auth: 'member',
    limit: WRITE,
    async run(c) {
      const type = oneOf(c.body, 'type', POST_TYPES);
      const body = str(c.body, 'body', COMMUNITY_LIMITS.storyChars + 200, true);
      if (c.body.confirmed !== true) return fail('not_confirmed');
      let milestone: Record<string, unknown> | null = null;
      if (c.body.milestone !== undefined && c.body.milestone !== null) {
        if (!isObj(c.body.milestone) || Object.keys(c.body.milestone).length > 12)
          throw new Invalid('milestone');
        milestone = c.body.milestone;
      }
      const media = c.body.media === undefined || c.body.media === null ? [] : c.body.media;
      if (!Array.isArray(media) || media.length > COMMUNITY_LIMITS.maxPhotos)
        throw new Invalid('media');
      const items = media.map((m) => {
        if (!isObj(m)) throw new Invalid('media');
        const path = str(m, 'path', 200);
        if (!PATH.test(path)) throw new Invalid('media');
        return {
          kind: oneOf(m, 'kind', ['photo', 'video'] as const),
          role: oneOf(m, 'role', SERVER_ROLES),
          path,
        };
      });
      try {
        const r = await rpc(c, 'community_create_post', {
          p_user: c.user,
          p_type: type,
          p_body: body,
          p_milestone: milestone,
          p_media: items,
          p_confirmed: true,
        });
        return done(isObj(r) ? { id: r.id, status: r.status } : {});
      } catch (e) {
        if (e instanceof Error && e.message === 'blocked')
          return fail(
            'blocked',
            whyBlocked(
              body,
              type === 'story' ? COMMUNITY_LIMITS.storyChars : COMMUNITY_LIMITS.postChars,
            ),
          );
        throw e;
      }
    },
  },
  'post/delete': {
    auth: 'member',
    limit: WRITE,
    async run(c) {
      await removeFiles(
        c,
        await rpc(c, 'community_delete_post', { p_user: c.user, p_post: uuid(c.body, 'postId') }),
      );
      return done();
    },
  },
  comment: {
    auth: 'member',
    limit: WRITE,
    async run(c) {
      const text = str(c.body, 'body', COMMUNITY_LIMITS.commentChars + 100);
      try {
        const r = await rpc(c, 'community_add_comment', {
          p_user: c.user,
          p_post: uuid(c.body, 'postId'),
          p_body: text,
        });
        return done(isObj(r) ? { id: r.id, status: r.status } : {});
      } catch (e) {
        if (e instanceof Error && e.message === 'blocked')
          return fail('blocked', whyBlocked(text, COMMUNITY_LIMITS.commentChars));
        throw e;
      }
    },
  },
  'comment/delete': {
    auth: 'member',
    limit: WRITE,
    async run(c) {
      await rpc(c, 'community_delete_comment', {
        p_user: c.user,
        p_comment: uuid(c.body, 'commentId'),
      });
      return done();
    },
  },
  encourage: {
    auth: 'member',
    limit: ['react', 60, 60],
    async run(c) {
      if (typeof c.body.on !== 'boolean') throw new Invalid('on');
      return done({
        on: await rpc(c, 'community_set_encourage', {
          p_user: c.user,
          p_post: uuid(c.body, 'postId'),
          p_on: c.body.on,
        }),
      });
    },
  },
  report: {
    auth: 'member',
    limit: ['report', 10, 60],
    async run(c) {
      await rpc(c, 'community_report', {
        p_user: c.user,
        p_type: oneOf(c.body, 'type', ['post', 'comment'] as const),
        p_target: uuid(c.body, 'targetId'),
        p_reason: oneOf(c.body, 'reason', REPORT_REASONS),
        p_note: str(c.body, 'note', COMMUNITY_LIMITS.noteChars, true) || null,
      });
      return done(); // identical whether or not it was new, so reports cannot be probed
    },
  },
  block: {
    auth: 'member',
    limit: WRITE,
    async run(c) {
      await rpc(c, 'community_block', { p_user: c.user, p_username: username(c.body, 'username') });
      return done();
    },
  },
  unblock: {
    auth: 'member',
    limit: WRITE,
    async run(c) {
      await rpc(c, 'community_unblock', {
        p_user: c.user,
        p_username: username(c.body, 'username'),
      });
      return done();
    },
  },
  blocked: {
    auth: 'member',
    limit: READ,
    async run(c) {
      const v = await rpc(c, 'community_blocked', { p_user: c.user });
      return done({
        usernames: Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [],
      });
    },
  },
  leave: {
    auth: 'member',
    limit: ['leave', 3, 3600],
    async run(c) {
      await removeFiles(c, await rpc(c, 'community_leave', { p_user: c.user }));
      return done();
    },
  },

  // ----- staff (verified JWT, second factor, moderation.review) -----
  'mod/queue': {
    auth: 'staff',
    limit: ['mod', 120, 60],
    async run(c) {
      const list = rows(
        await rpc(c, 'community_moderation_queue', { p_actor: c.user, p_aal2: c.aal2 }),
      );
      const items = await Promise.all(
        list.map(async (r) => ({
          id: String(r.id),
          targetType: String(r.target_type),
          author: String(r.author),
          body: String(r.body ?? ''),
          status: String(r.status),
          flags: Array.isArray(r.flags) ? r.flags : [],
          reasons: Array.isArray(r.reasons) ? r.reasons : [],
          reportCount: Number(r.report_count ?? 0),
          urgent: r.urgent === true,
          ageHours: Number(r.age_hours ?? 0),
          createdAt: new Date(String(r.created_at)).toISOString(),
          media: await signMedia(c, r.media),
        })),
      );
      return done({ items });
    },
  },
  'mod/backlog': {
    auth: 'staff',
    limit: ['mod', 120, 60],
    async run(c) {
      return done({
        backlog: await rpc(c, 'community_backlog', { p_actor: c.user, p_aal2: c.aal2 }),
      });
    },
  },
  'mod/mode': {
    auth: 'staff',
    limit: ['mod', 120, 60],
    async run(c) {
      const mode = await rpc(c, 'community_set_mode', {
        p_actor: c.user,
        p_aal2: c.aal2,
        p_mode: oneOf(c.body, 'mode', ['open', 'text_only', 'read_only'] as const),
        p_note: str(c.body, 'note', 300, true) || null,
      });
      return done({ mode });
    },
  },
  'mod/act': {
    auth: 'staff',
    limit: ['mod', 120, 60],
    async run(c) {
      const paths = await rpc(c, 'community_moderate', {
        p_actor: c.user,
        p_aal2: c.aal2,
        p_type: oneOf(c.body, 'type', ['post', 'comment'] as const),
        p_target: uuid(c.body, 'targetId'),
        p_action: oneOf(c.body, 'action', ['approve', 'remove', 'restore'] as const),
        p_note: str(c.body, 'note', 300, true) || null,
      });
      await removeFiles(c, paths);
      return done();
    },
  },
  'mod/restrict': {
    auth: 'staff',
    limit: ['mod', 120, 60],
    async run(c) {
      const hours = c.body.hours;
      if (
        hours !== undefined &&
        hours !== null &&
        (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 8760)
      )
        throw new Invalid('hours');
      const restriction = oneOf(c.body, 'restriction', ['none', 'muted', 'suspended'] as const);
      await rpc(c, 'community_restrict', {
        p_actor: c.user,
        p_aal2: c.aal2,
        p_username: username(c.body, 'username'),
        p_restriction: restriction,
        p_hours: typeof hours === 'number' ? hours : null,
        p_reason:
          restriction === 'none'
            ? null
            : oneOf(c.body, 'reason', [
                'harassment',
                'unsafe_content',
                'spam',
                'impersonation',
                'other',
              ] as const),
        p_note: str(c.body, 'note', 300, true) || null,
      });
      return done();
    },
  },
  'maintenance/prune': {
    auth: 'guest', // authorised by the maintenance key instead; see handle()
    limit: ['maintenance', 10, 60],
    async run(c) {
      await removeFiles(c, await rpc(c, 'community_prune', {}));
      return done();
    },
  },
};

export function createCommunityServer(deps: CommunityDeps) {
  return {
    routes: Object.keys(ROUTES),
    async handle(req: CommunityRequest): Promise<CommunityResponse> {
      const route = ROUTES[req.route];
      if (!route) return fail('not_found');
      try {
        if (JSON.stringify(req.body ?? {}).length > MAX_BODY_CHARS)
          return fail('payload_too_large');
        if (req.body !== undefined && req.body !== null && !isObj(req.body))
          return fail('invalid_input');
        const body = (req.body ?? {}) as Record<string, unknown>;

        if (req.route === 'maintenance/prune') {
          if (!deps.maintenanceKeyOk(req.maintenanceKey ?? null)) return fail('forbidden');
          return await route.run({ deps, user: null, aal2: false, body });
        }

        // Identity: only from a verified token. A bad token on a public route is treated as a guest, so browsing never breaks.
        const who = req.token ? await deps.auth.verify(req.token).catch(() => null) : null;
        if (route.auth !== 'guest' && !who) return fail('unauthorized');
        if (route.auth === 'staff' && who!.aal !== 'aal2') return fail('forbidden');

        const [bucket, max, seconds] = route.limit;
        const key = who ? `u:${who.userId}` : `n:${req.networkKey}`;
        const ok = await deps.rpc.call('community_burst', {
          p_key: key,
          p_bucket: bucket,
          p_max: max,
          p_seconds: seconds,
        });
        if (ok !== true)
          return { ...fail('rate_limited'), headers: { 'Retry-After': String(seconds) } };

        return await route.run({
          deps,
          user: who?.userId ?? null,
          aal2: who?.aal === 'aal2',
          body,
        });
      } catch (e) {
        if (e instanceof Invalid)
          return {
            status: 400,
            body: {
              ok: false,
              code: 'invalid_input',
              message: 'Some of that was not valid.',
              field: e.field,
            },
          };
        const code = e instanceof Error ? e.message.trim() : '';
        return fail(code);
      }
    },
  };
}
