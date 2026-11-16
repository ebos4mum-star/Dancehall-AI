/**
 * The Friends and Group Goals server layer: one routed function in front of the database, for the `social` Edge Function (Deno) and for tests (Node). Everything it
 * needs is passed in (`SocialDeps`). It never talks to storage and never serves guests.
 *
 * What it guarantees, for every route:
 *  - Identity comes only from a verified JWT, never from the request body. A body field named `user`, `userId` or similar is ignored.
 *  - Every route needs a signed-in member. Nothing is public.
 *  - Every body is validated field by field; unknown fields are ignored; sizes are bounded; the database re-checks everything.
 *  - Every route is rate limited per member before it does any work.
 *  - Responses carry usernames and opaque group ids only: never internal user ids, emails, food, weight or health data. A last guard refuses to send a response that
 *    contains an identifier-shaped value outside the allowed `id` fields.
 *  - Friends works whether or not the public Community feed is switched on: it reuses only the Community username and its rate limiter, not its mode or its routes.
 *  - Errors are plain codes. Unexpected errors return a generic message and are never logged with content.
 */
import { computeGamification, normalizePrefs, type GmInput } from './gamification';

export interface SocialRpc {
  /** Calls `app.<fn>` as the server. Throws an Error whose message is the database's exception text. */
  call(fn: string, args: Record<string, unknown>): Promise<unknown>;
}
export interface SocialDeps {
  rpc: SocialRpc;
  auth: {
    /** Verifies signature, expiry and that the account still exists. Null if not valid. */
    verify(token: string): Promise<{ userId: string; aal: 'aal1' | 'aal2' } | null>;
  };
  /** Optional local diagnosis: receives the error's name and first words only (never request content). */
  onError?: (e: unknown) => void;
}
export interface SocialRequest {
  route: string;
  token: string | null;
  body?: unknown;
}
export interface SocialResponse {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}

const STATUS: Record<string, number> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  payload_too_large: 413,
  rate_limited: 429,
  server_error: 500,
  self: 400,
  already_friends: 409,
  already_requested: 409,
  no_request: 404,
  not_friends: 403,
  limit_reached: 409,
  invalid_category: 400,
  not_member: 403,
  closed: 409,
  invalid_username: 400,
  too_similar: 409,
  taken: 409,
  already_set: 409,
  cooldown: 429,
  restricted: 403,
  needs_username: 403,
};
const MESSAGE: Record<string, string> = {
  invalid_input: 'Some of that was not valid.',
  unauthorized: 'Please sign in to do that.',
  forbidden: 'You cannot do that.',
  not_found: 'We could not find that.',
  method_not_allowed: 'That is not supported.',
  payload_too_large: 'That request is too large.',
  rate_limited: 'You are doing that too quickly. Please wait a little and try again.',
  server_error: 'Something went wrong. Please try again.',
  self: 'That is you.',
  already_friends: 'You are already friends.',
  already_requested: 'You already sent a request.',
  no_request: 'There is no such request.',
  not_friends: 'Only friends can be invited or shared with.',
  limit_reached: 'You have reached a limit. Remove something first.',
  invalid_category: 'That cannot be shared.',
  not_member: 'You are not in that group.',
  closed: 'That day is outside this goal.',
  invalid_username: 'That name cannot be used.',
  too_similar: 'That name is too close to another one.',
  taken: 'That name is taken.',
  already_set: 'You already have a public name.',
  cooldown: 'You can change your name again later.',
  restricted: 'Your account cannot do that right now.',
  needs_username: 'Choose a public name first.',
};
const fail = (code: string, extra: Record<string, unknown> = {}): SocialResponse => {
  const c = code in STATUS ? code : 'server_error';
  return { status: STATUS[c]!, body: { ok: false, code: c, message: MESSAGE[c], ...extra } };
};
const done = (extra: Record<string, unknown> = {}): SocialResponse => ({
  status: 200,
  body: { ok: true, ...extra },
});

class Invalid extends Error {
  constructor(readonly field: string) {
    super('invalid_input');
  }
}
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const USERNAME = /^[a-z][a-z0-9_]{2,19}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function username(b: Record<string, unknown>, k: string): string {
  const v = b[k];
  if (typeof v !== 'string') throw new Invalid(k);
  const n = v.trim().toLowerCase();
  if (!USERNAME.test(n) || n.includes('__') || n.endsWith('_')) throw new Invalid(k);
  return n;
}
const bool = (b: Record<string, unknown>, k: string): boolean => {
  if (typeof b[k] !== 'boolean') throw new Invalid(k);
  return b[k] as boolean;
};
const uuid = (b: Record<string, unknown>, k: string): string => {
  const v = b[k];
  if (typeof v !== 'string' || !UUID.test(v)) throw new Invalid(k);
  return v.toLowerCase();
};
function day(b: Record<string, unknown>, k: string): string {
  const v = b[k];
  if (
    typeof v !== 'string' ||
    !DAY.test(v) ||
    Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ||
    new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v
  )
    throw new Invalid(k);
  return v;
}
function oneOf<T extends string>(b: Record<string, unknown>, k: string, allowed: readonly T[]): T {
  const v = b[k];
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw new Invalid(k);
  return v as T;
}

export const SOCIAL_RATE = {
  read: ['social-read', 90, 60],
  write: ['social-write', 30, 60],
  ask: ['social-ask', 12, 60],
  claim: ['social-claim', 6, 3600],
} as const;
type Limit = readonly [string, number, number];
interface Route {
  limit: Limit;
  run(c: {
    deps: SocialDeps;
    user: string;
    body: Record<string, unknown>;
  }): Promise<SocialResponse>;
}
const rpc = (c: { deps: SocialDeps }, fn: string, args: Record<string, unknown>) =>
  c.deps.rpc.call(fn, args);

const ID_FIELDS = new Set(['id']);
/** True if a response holds an identifier-shaped value anywhere other than an `id` field (a last guard against leaking an internal user id). */
export function leaksIdentifier(v: unknown, key = ''): boolean {
  if (typeof v === 'string') return UUID.test(v) && !ID_FIELDS.has(key);
  if (Array.isArray(v)) return v.some((x) => leaksIdentifier(x, key));
  if (isObj(v)) return Object.entries(v).some(([k, x]) => leaksIdentifier(x, k));
  return false;
}

const ROUTES: Record<string, Route> = {
  overview: {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({ overview: await rpc(c, 'social_overview', { p_user: c.user }) }),
  },
  profile: {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({ profile: await rpc(c, 'community_profile', { p_user: c.user }) }),
  },
  'username/claim': {
    limit: SOCIAL_RATE.claim,
    run: async (c) => {
      const name = username(c.body, 'username');
      const r = await rpc(c, 'community_claim_username', { p_user: c.user, p_name: name });
      return done({ username: typeof r === 'string' ? r : name });
    },
  },
  'friend/request': {
    limit: SOCIAL_RATE.ask,
    run: async (c) =>
      done({
        status: await rpc(c, 'social_request', {
          p_user: c.user,
          p_name: username(c.body, 'username'),
        }),
      }),
  },
  'friend/respond': {
    limit: SOCIAL_RATE.write,
    run: async (c) => {
      await rpc(c, 'social_respond', {
        p_user: c.user,
        p_name: username(c.body, 'username'),
        p_accept: bool(c.body, 'accept'),
      });
      return done();
    },
  },
  'friend/cancel': {
    limit: SOCIAL_RATE.write,
    run: async (c) => (
      await rpc(c, 'social_cancel', { p_user: c.user, p_name: username(c.body, 'username') }),
      done()
    ),
  },
  'friend/remove': {
    limit: SOCIAL_RATE.write,
    run: async (c) => (
      await rpc(c, 'social_remove', { p_user: c.user, p_name: username(c.body, 'username') }),
      done()
    ),
  },
  block: {
    limit: SOCIAL_RATE.write,
    run: async (c) => (
      await rpc(c, 'social_block', { p_user: c.user, p_name: username(c.body, 'username') }),
      done()
    ),
  },
  unblock: {
    limit: SOCIAL_RATE.write,
    run: async (c) => (
      await rpc(c, 'social_unblock', { p_user: c.user, p_name: username(c.body, 'username') }),
      done()
    ),
  },
  'share/set': {
    limit: SOCIAL_RATE.write,
    run: async (c) => {
      // The category is validated by the database against its single allowed value; a string is required here so nothing odd reaches it.
      if (typeof c.body.category !== 'string' || c.body.category.length > 40)
        throw new Invalid('category');
      await rpc(c, 'social_set_share', {
        p_user: c.user,
        p_name: username(c.body, 'username'),
        p_category: c.body.category,
        p_on: bool(c.body, 'on'),
      });
      return done();
    },
  },
  'share/get': {
    limit: SOCIAL_RATE.read,
    run: async (c) =>
      done({
        shares: await rpc(c, 'social_shares_with', {
          p_user: c.user,
          p_name: username(c.body, 'username'),
        }),
      }),
  },
  'share/revoke-all': {
    limit: SOCIAL_RATE.write,
    run: async (c) => done({ withdrawn: await rpc(c, 'social_revoke_all', { p_user: c.user }) }),
  },
  'friend/view': {
    limit: SOCIAL_RATE.read,
    run: async (c) => {
      const r = await rpc(c, 'social_view_friend', {
        p_user: c.user,
        p_name: username(c.body, 'username'),
      });
      return done(isObj(r) ? { username: r.username, activity: r.activity ?? null } : {});
    },
  },
  'group/create': {
    limit: SOCIAL_RATE.write,
    run: async (c) => {
      const b = c.body;
      const kind = oneOf(b, 'kind', ['challenge', 'couple', 'family'] as const);
      const metric = oneOf(b, 'metric', ['active_minutes', 'active_days'] as const);
      if (typeof b.title !== 'string' || b.title.trim().length < 1 || b.title.length > 60)
        throw new Invalid('title');
      const target = b.target === undefined || b.target === null ? null : b.target;
      if (
        target !== null &&
        (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > 100_000)
      )
        throw new Invalid('target');
      if (!Array.isArray(b.invite) || b.invite.length > 12) throw new Invalid('invite');
      const invite = b.invite.map((n) => username({ n }, 'n'));
      const id = await rpc(c, 'social_create_group', {
        p_user: c.user,
        p_kind: kind,
        p_title: b.title,
        p_metric: metric,
        p_target: target,
        p_start: day(b, 'startDay'),
        p_end: day(b, 'endDay'),
        p_invite: invite,
      });
      return done({ id });
    },
  },
  'group/respond': {
    limit: SOCIAL_RATE.write,
    run: async (c) => (
      await rpc(c, 'social_respond_group', {
        p_user: c.user,
        p_group: uuid(c.body, 'groupId'),
        p_accept: bool(c.body, 'accept'),
      }),
      done()
    ),
  },
  'group/leave': {
    limit: SOCIAL_RATE.write,
    run: async (c) => (
      await rpc(c, 'social_leave_group', { p_user: c.user, p_group: uuid(c.body, 'groupId') }),
      done()
    ),
  },
  'group/sync': {
    limit: SOCIAL_RATE.write,
    run: async (c) =>
      done({
        days: await rpc(c, 'social_sync_group', {
          p_user: c.user,
          p_group: uuid(c.body, 'groupId'),
        }),
      }),
  },
  'gm/state': {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({ state: await rpc(c, 'gm_state', { p_user: c.user }) }),
  },
  'gm/sync': {
    // The server reads the person's OWN records (ids, times, durations, days), runs the shared engine, and records the result. The client sends only its
    // personal preferences (a weekly target of 1 to 5 days and planned rest weekdays), which are normalised here and only change how easy a personal goal is.
    limit: SOCIAL_RATE.write,
    run: async (c) => {
      const raw = isObj(c.body.prefs) ? c.body.prefs : {};
      const prefs = normalizePrefs({
        enabled: true,
        targetDaysPerWeek:
          typeof raw.targetDaysPerWeek === 'number' ? raw.targetDaysPerWeek : undefined,
        restWeekdays: Array.isArray(raw.restWeekdays) ? (raw.restWeekdays as number[]) : undefined,
      });
      const inputs = await rpc(c, 'gm_inputs', { p_user: c.user });
      if (!isObj(inputs)) throw new Error('server_error');
      const g = computeGamification({ ...(inputs as unknown as Omit<GmInput, 'prefs'>), prefs });
      const ledger = await rpc(c, 'gm_record', { p_user: c.user, p_events: g.events.slice(-400) });
      return done({
        totalXp: isObj(ledger) ? ledger.totalXp : g.totalXp,
        weekXp: isObj(ledger) ? ledger.weekXp : g.weekXp,
        level: g.level,
        streak: g.streak,
        restNudge: g.restNudge,
        dailyQuests: g.dailyQuests,
        weeklyQuests: g.weeklyQuests,
        badges: g.badges,
        cosmetics: g.cosmetics,
        seasonal: {
          id: g.seasonal.season.id,
          activeDays: g.seasonal.activeDays,
          goalDays: g.seasonal.season.goalDays,
          done: g.seasonal.done,
        },
      });
    },
  },
  'gm/league': {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({ league: await rpc(c, 'gm_league', { p_user: c.user }) }),
  },
  'gm/league/optin': {
    limit: SOCIAL_RATE.write,
    run: async (c) => (
      await rpc(c, 'gm_set_league', { p_user: c.user, p_on: bool(c.body, 'on') }),
      done()
    ),
  },
};

export const SOCIAL_ROUTES = Object.keys(ROUTES);
const MAX_BODY_CHARS = 8192;

export function createSocialServer(deps: SocialDeps) {
  return {
    routes: SOCIAL_ROUTES,
    async handle(req: SocialRequest): Promise<SocialResponse> {
      const route = ROUTES[req.route];
      if (!route) return fail('not_found');
      try {
        if (JSON.stringify(req.body ?? {}).length > MAX_BODY_CHARS)
          return fail('payload_too_large');
        if (req.body !== undefined && req.body !== null && !isObj(req.body))
          return fail('invalid_input');
        const body = (req.body ?? {}) as Record<string, unknown>;
        // Identity: only from a verified token. Nothing is public.
        const who = req.token ? await deps.auth.verify(req.token).catch(() => null) : null;
        if (!who) return fail('unauthorized');
        const [bucket, max, seconds] = route.limit;
        const ok = await deps.rpc.call('community_burst', {
          p_key: `soc:${who.userId}`,
          p_bucket: bucket,
          p_max: max,
          p_seconds: seconds,
        });
        if (ok !== true)
          return { ...fail('rate_limited'), headers: { 'Retry-After': String(seconds) } };
        const r = await route.run({ deps, user: who.userId, body });
        if (leaksIdentifier(r.body)) {
          deps.onError?.(new Error('response held an identifier'));
          return fail('server_error');
        }
        return r;
      } catch (e) {
        if (e instanceof Invalid) return fail('invalid_input', { field: e.field });
        const msg = e instanceof Error ? e.message : '';
        if (msg in STATUS && msg !== 'server_error') return fail(msg);
        deps.onError?.(e);
        return fail('server_error');
      }
    },
  };
}
