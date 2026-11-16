import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CommunityFail,
  NewPostInput,
  PublicComment,
  PublicPost,
  ReportReason,
} from '@dancehall/shared';
import type { DataStore } from './types';

/**
 * Community over the `community` Edge Function. The app never reads or writes a community table: every call is a POST to the function, which verifies the account's
 * token, validates the input and applies the rules. Guests can read (the publishable key identifies the project); every other call sends the member's access token.
 * Photos and videos are uploaded to a private bucket through a one-time signed link and then checked by the server before a post may use them.
 */
export interface CommunityAdapterDeps {
  db: SupabaseClient;
  url: string;
  publishableKey: string;
  fetchImpl?: typeof fetch;
  /** Reads a local file. Injected so tests need no device. */
  readFile?: (uri: string) => Promise<Uint8Array>;
  uploadToSignedUrl?: (
    path: string,
    token: string,
    bytes: Uint8Array,
    contentType: string,
  ) => Promise<void>;
}

const TIMEOUT_MS = 30_000;
const BUCKET = 'community-media';

type Reply = { ok: true } & Record<string, unknown>;
type Failure = CommunityFail;

export function createCommunityAdapter(d: CommunityAdapterDeps): Partial<DataStore> {
  const f = d.fetchImpl ?? fetch;
  const base = `${d.url.replace(/\/+$/, '')}/functions/v1/community`;
  let me: string | null = null;

  async function call(
    route: string,
    body: Record<string, unknown> = {},
    signedIn = true,
  ): Promise<Reply | Failure> {
    const token = signedIn
      ? ((await d.db.auth.getSession()).data.session?.access_token ?? null)
      : null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await f(`${base}/${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: d.publishableKey,
          authorization: `Bearer ${token ?? d.publishableKey}`,
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      let json: Record<string, unknown> = {};
      try {
        json = (await res.json()) as Record<string, unknown>;
      } catch {
        /* not JSON: a failure below */
      }
      if (json.ok === true) return json as Reply;
      const reasons = Array.isArray(json.reasons)
        ? (json.reasons as string[])
        : [
            typeof json.message === 'string'
              ? json.message
              : 'Something went wrong. Please try again.',
          ];
      return {
        ok: false,
        code: typeof json.code === 'string' ? json.code : 'server_error',
        reasons,
        ...(json.support === true ? { support: true } : {}),
      };
    } catch {
      return {
        ok: false,
        code: 'network',
        reasons: ['We could not reach Community. Check your connection and try again.'],
      };
    } finally {
      clearTimeout(timer);
    }
  }
  const isFail = (r: Reply | Failure): r is Failure => r.ok === false;

  async function upload(
    m: NonNullable<NewPostInput['media']>[number],
  ): Promise<{ path: string } | Failure> {
    const t = await call('upload/ticket', { kind: m.kind, mime: m.mime });
    if (isFail(t)) return t;
    const path = String(t.path);
    const read =
      d.readFile ?? (async (uri: string) => new Uint8Array(await (await f(uri)).arrayBuffer()));
    const put =
      d.uploadToSignedUrl ??
      (async (p: string, token: string, bytes: Uint8Array, contentType: string) => {
        const { error } = await d.db.storage
          .from(BUCKET)
          .uploadToSignedUrl(p, token, bytes, { contentType });
        if (error) throw new Error('upload_failed');
      });
    try {
      await put(path, String(t.token), await read(m.uri), m.mime);
    } catch {
      return {
        ok: false,
        code: 'upload_failed',
        reasons: ['That file could not be uploaded. Please try again.'],
      };
    }
    const c = await call('upload/commit', { path });
    return isFail(c) ? c : { path };
  }

  return {
    async communityProfile() {
      const r = await call('profile');
      if (isFail(r) || typeof r.username !== 'string') return null;
      me = r.username;
      return {
        username: r.username,
        canChangeAt: (r.canChangeAt as string | null) ?? null,
        restriction: (r.restriction as 'muted' | 'suspended' | null) ?? null,
      };
    },
    async communityClaimUsername(raw) {
      const r = await call('username/claim', { username: raw });
      if (isFail(r)) return r;
      me = String(r.username);
      return { ok: true, username: me };
    },
    async communityChangeUsername(raw) {
      const r = await call('username/change', { username: raw });
      if (isFail(r)) return r;
      me = String(r.username);
      return { ok: true, username: me };
    },
    async communityFeed(opts) {
      // A guest (or an expired session) can still browse: the function treats a missing or invalid token as a guest.
      const r = await call('feed', { cursor: opts?.cursor ?? undefined, limit: opts?.limit }, true);
      if (isFail(r)) return { posts: [], next: null };
      return {
        posts: (r.posts as PublicPost[]) ?? [],
        next: (r.nextCursor as string | null) ?? null,
      };
    },
    async communityComments(postId) {
      const r = await call('comments', { postId });
      return isFail(r) ? [] : ((r.comments as PublicComment[]) ?? []);
    },
    async communityPost(input, opts) {
      const media: Array<{
        kind: 'photo' | 'video';
        role: 'single' | 'before' | 'after';
        path: string;
      }> = [];
      for (const m of input.media ?? []) {
        const u = await upload(m);
        if ('ok' in u) return u;
        media.push({ kind: m.kind, role: m.role, path: u.path });
      }
      const r = await call('post', {
        type: input.type,
        body: input.body,
        milestone: input.milestone ?? undefined,
        media,
        confirmed: opts.confirmed,
      });
      if (isFail(r)) return r;
      const status = r.status === 'held' ? 'held' : 'published';
      const post: PublicPost = {
        id: String(r.id),
        author: me ?? '',
        type: input.type,
        body: input.body,
        milestone: input.milestone ?? null,
        media: [],
        createdAt: new Date().toISOString(),
        isMine: true,
        isSample: false,
        status,
        commentCount: 0,
        encouragedByMe: false,
        encouragedCount: 0,
      };
      return {
        ok: true,
        post,
        status,
        message:
          status === 'held' ? 'Thank you. Your post will appear after a quick review.' : 'Shared.',
      };
    },
    async communityDeletePost(postId) {
      const r = await call('post/delete', { postId });
      return isFail(r) ? r : { ok: true };
    },
    async communityComment(postId, text) {
      const r = await call('comment', { postId, body: text });
      if (isFail(r)) return r;
      const status = r.status === 'hidden' ? 'hidden' : 'published';
      const comment: PublicComment = {
        id: String(r.id),
        postId,
        author: me ?? '',
        body: text,
        createdAt: new Date().toISOString(),
        isMine: true,
        status,
        isSample: false,
      };
      return {
        ok: true,
        comment,
        status,
        message:
          status === 'hidden'
            ? 'Thank you. Your comment will appear after a quick review.'
            : 'Comment added.',
      };
    },
    async communityDeleteComment(commentId) {
      const r = await call('comment/delete', { commentId });
      return isFail(r) ? r : { ok: true };
    },
    async communityEncourage(postId, on) {
      const r = await call('encourage', { postId, on });
      return isFail(r) ? r : { ok: true, encouraged: r.on === true };
    },
    async communityReport(input: {
      targetType: 'post' | 'comment';
      targetId: string;
      reason: ReportReason;
      note?: string;
    }) {
      const r = await call('report', {
        type: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        note: input.note,
      });
      return isFail(r) ? r : { ok: true };
    },
    async communityBlock(username) {
      const r = await call('block', { username });
      return isFail(r) ? r : { ok: true };
    },
    async communityUnblock(username) {
      const r = await call('unblock', { username });
      return isFail(r) ? r : { ok: true };
    },
    async communityBlocked() {
      const r = await call('blocked');
      return isFail(r) ? [] : ((r.usernames as string[]) ?? []);
    },
    async communityLeave() {
      const r = await call('leave');
      if (!isFail(r)) me = null;
      return isFail(r) ? r : { ok: true };
    },
  };
}
