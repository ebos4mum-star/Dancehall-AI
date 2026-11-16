// Edge Function `social`: Friends, per-friend sharing and Group Goals. NOT DEPLOYED by this change: it ships as reviewed code only, and needs
// supabase/proposed/community.up.sql (public usernames) and supabase/proposed/social.up.sql applied first (separate approval).
//
// POST JSON to /social/<route>. Every route needs a signed-in member (verified JWT). Routes and rules live in packages/shared/src/social-server.ts (copied into the
// function's shared folder by scripts/sync-edge-core.mjs). It reuses the Community username and rate limiter, NOT the Community feed, its mode or its routes, so it
// works whether or not the public Community feed is switched on.
// Secrets: none of its own. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform to the function and never reach a client.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { createSocialServer } from '../_shared/generated/social-server.ts';

declare const Deno: {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};

const env = (k: string): string => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`missing configuration: ${k}`);
  return v;
};
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const server = createSocialServer({
  rpc: {
    async call(fn, args) {
      // `app` is not exposed over the API; this single service-role-only function runs the allow-listed functions (see social.up.sql).
      const { data, error } = await admin.rpc('social_rpc', { fn, args });
      // The database raises plain codes ("not_friends", "taken"...). Anything else is reported upward as-is and mapped to a generic 500 there.
      if (error) throw new Error(error.message);
      return data;
    },
  },
  auth: {
    async verify(token) {
      // The auth server checks the signature, expiry and that the account still exists.
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      try {
        const payload = JSON.parse(
          atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
        );
        return { userId: data.user.id, aal: payload.aal === 'aal2' ? 'aal2' : 'aal1' };
      } catch {
        return null;
      }
    },
  },
  // Local diagnosis only: SOCIAL_DEBUG=1 prints the error's name and first words (never request content). Leave unset in any hosted project.
  onError:
    Deno.env.get('SOCIAL_DEBUG') === '1'
      ? (e) =>
          console.error(
            'social_error',
            e instanceof Error ? `${e.name}: ${e.message.slice(0, 120)}` : 'unknown',
          )
      : undefined,
});

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
  const route = new URL(req.url).pathname.replace(/^.*\/social\/?/, '').replace(/\/$/, '');
  if (Number(req.headers.get('content-length') ?? '0') > 8192)
    return json(413, { ok: false, code: 'payload_too_large' });
  const text = await req.text();
  if (text.length > 8192) return json(413, { ok: false, code: 'payload_too_large' });
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { ok: false, code: 'invalid_input' });
    }
  }
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') || null;
  const r = await server.handle({ route, token, body });
  return json(r.status, r.body, r.headers);
});
