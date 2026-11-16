import type { SupabaseClient } from '@supabase/supabase-js';
import type { DataStore, GmLeagueRow, GmServerState, SocialAck, SocialOverview } from './types';

/**
 * Friends and Group Goals over the `social` Edge Function. The app never reads or writes a social table: every call is a POST to the function, which verifies the
 * account's token, validates the input and applies the rules. There is no guest access: without a signed-in session no request is made. The only thing a friend can
 * ever be shown is a consented weekly activity summary; food, weight and health data are not reachable through this function at all.
 * Hosted builds keep the feature off until the backend is deployed and has passed its security tests (see `config.social`).
 */
export interface SocialAdapterDeps {
  db: SupabaseClient;
  url: string;
  publishableKey: string;
  fetchImpl?: typeof fetch;
}

const TIMEOUT_MS = 20_000;

export function createSocialAdapter(d: SocialAdapterDeps): Partial<DataStore> {
  const f = d.fetchImpl ?? fetch;
  const base = `${d.url.replace(/\/+$/, '')}/functions/v1/social`;

  async function call(
    route: string,
    body: Record<string, unknown> = {},
  ): Promise<Record<string, unknown> & { ok: boolean; code?: string }> {
    const token = (await d.db.auth.getSession()).data.session?.access_token ?? null;
    if (!token) return { ok: false, code: 'unauthorized' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await f(`${base}/${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: d.publishableKey,
          authorization: `Bearer ${token}`,
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
      if (json.ok === true) return json as { ok: true };
      return { ok: false, code: typeof json.code === 'string' ? json.code : 'server_error' };
    } catch {
      return { ok: false, code: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }
  const ack = (r: { ok: boolean; code?: string }): SocialAck =>
    r.ok ? { ok: true } : { ok: false, code: r.code ?? 'server_error' };
  const named = (username: string) => ({ username });

  return {
    async socialOverview(): Promise<SocialOverview> {
      const r = await call('overview');
      if (!r.ok) throw new Error(r.code ?? 'server_error');
      const o = r.overview as Partial<SocialOverview> | undefined;
      return {
        username: typeof o?.username === 'string' ? o.username : null,
        friends: o?.friends ?? [],
        incoming: o?.incoming ?? [],
        outgoing: o?.outgoing ?? [],
        blocked: o?.blocked ?? [],
        groups: o?.groups ?? [],
      };
    },
    async socialClaimUsername(username: string) {
      const r = await call('username/claim', named(username));
      return r.ok
        ? { ok: true as const, username: String(r.username ?? username) }
        : { ok: false as const, code: r.code ?? 'server_error' };
    },
    async socialRequest(username: string) {
      const r = await call('friend/request', named(username));
      return r.ok
        ? {
            ok: true as const,
            status: (r.status === 'accepted' ? 'accepted' : 'requested') as
              'requested' | 'accepted',
          }
        : { ok: false as const, code: r.code ?? 'server_error' };
    },
    async socialRespond(username: string, accept: boolean) {
      return ack(await call('friend/respond', { ...named(username), accept }));
    },
    async socialCancel(username: string) {
      return ack(await call('friend/cancel', named(username)));
    },
    async socialRemove(username: string) {
      return ack(await call('friend/remove', named(username)));
    },
    async socialBlock(username: string) {
      return ack(await call('block', named(username)));
    },
    async socialUnblock(username: string) {
      return ack(await call('unblock', named(username)));
    },
    async socialSetShare(username: string, category: string, on: boolean) {
      return ack(await call('share/set', { ...named(username), category, on }));
    },
    async socialSharesWith(username: string) {
      const r = await call('share/get', named(username));
      return r.ok && Array.isArray(r.shares) ? (r.shares as string[]) : [];
    },
    async gmSync(prefs) {
      const r = await call('gm/sync', { prefs });
      if (!r.ok) return null;
      const { ok: _ok, ...rest } = r as Record<string, unknown>;
      return rest as unknown as GmServerState;
    },
    async gmLeague() {
      const r = await call('gm/league');
      if (!r.ok || !Array.isArray(r.league)) return [];
      return (r.league as GmLeagueRow[]).map((x) => ({
        username: String(x.username),
        weekXp: Number(x.weekXp) || 0,
        isMe: x.isMe === true,
      }));
    },
    async gmSetLeague(on: boolean) {
      return ack(await call('gm/league/optin', { on }));
    },
    async socialRevokeAll() {
      return ack(await call('share/revoke-all'));
    },
    async socialViewFriend(username: string) {
      const r = await call('friend/view', named(username));
      if (!r.ok) return { ok: false as const, code: r.code ?? 'server_error' };
      const a = r.activity as
        { sessions: number; minutes: number; activeDays: number } | null | undefined;
      return { ok: true as const, username: String(r.username ?? username), activity: a ?? null };
    },
    async socialCreateGroup(input) {
      const r = await call('group/create', { ...input, target: input.target ?? null });
      return r.ok
        ? { ok: true as const, id: String(r.id) }
        : { ok: false as const, code: r.code ?? 'server_error' };
    },
    async socialRespondGroup(id: string, accept: boolean) {
      return ack(await call('group/respond', { groupId: id, accept }));
    },
    async socialLeaveGroup(id: string) {
      return ack(await call('group/leave', { groupId: id }));
    },
    async socialSyncGroup(id: string) {
      return ack(await call('group/sync', { groupId: id }));
    },
  };
}
