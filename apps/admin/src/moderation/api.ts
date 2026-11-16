import type { Backlog, Mode, QueueItem, RestrictInput } from './model';

/** What the console needs from the server. A real one talks to the `community` Edge Function; the demo one keeps everything in memory. */
export interface ModerationApi {
  readonly kind: 'live' | 'demo';
  queue(): Promise<QueueItem[]>;
  backlog(): Promise<Backlog>;
  act(input: {
    type: 'post' | 'comment';
    targetId: string;
    action: 'approve' | 'remove' | 'restore';
    note?: string;
  }): Promise<void>;
  restrict(input: { username: string } & RestrictInput): Promise<void>;
  setMode(mode: Mode, note?: string): Promise<void>;
}

export class ModerationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const FRIENDLY: Record<string, string> = {
  unauthorized: 'Your session ended. Please sign in again.',
  forbidden:
    'This account does not have moderation access, or the second factor has not been verified.',
  not_found: 'That item is no longer there. Refresh the queue.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
};

export function createLiveModerationApi(cfg: {
  baseUrl: string;
  publishableKey: string;
  getToken(): Promise<string | null>;
  fetchImpl?: typeof fetch;
}): ModerationApi {
  const f = cfg.fetchImpl ?? fetch;
  async function call(
    route: string,
    body: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const token = await cfg.getToken();
    if (!token) throw new ModerationError('unauthorized', FRIENDLY.unauthorized!);
    let res: Response;
    try {
      res = await f(`${cfg.baseUrl.replace(/\/+$/, '')}/functions/v1/community/${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: cfg.publishableKey,
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ModerationError('network', 'Could not reach the server. Nothing was changed.');
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* handled below */
    }
    if (json.ok === true) return json;
    const code = typeof json.code === 'string' ? json.code : 'server_error';
    throw new ModerationError(code, FRIENDLY[code] ?? 'That did not work. Nothing was changed.');
  }
  return {
    kind: 'live',
    async queue() {
      return ((await call('mod/queue')).items as QueueItem[]) ?? [];
    },
    async backlog() {
      return (await call('mod/backlog')).backlog as Backlog;
    },
    async act(i) {
      await call('mod/act', { type: i.type, targetId: i.targetId, action: i.action, note: i.note });
    },
    async setMode(mode, note) {
      await call('mod/mode', { mode, note });
    },
    async restrict(i) {
      await call('mod/restrict', {
        username: i.username,
        restriction: i.restriction,
        hours: i.hours ?? undefined,
        reason: i.restriction === 'none' ? undefined : i.reason,
        note: i.note,
      });
    },
  };
}
