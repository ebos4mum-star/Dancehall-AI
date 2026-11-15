// Edge Function `account`: email-free cloud accounts and lost-phone recovery. NOT DEPLOYED by this change: it ships as reviewed code only.
//
// Routes (POST, JSON):  provision · recover/start · recover/verify · recover/complete · recover/cancel · rotate · status · maintenance/reap
// Secrets (set with `supabase secrets set`, never in the app or the repo):
//   ACCOUNT_PEPPER       base64, >= 32 random bytes. Keys the HMACs stored in the database. Losing it makes every stored recovery verifier unusable.
//   MAINTENANCE_KEY      random string that authorises the scheduled `maintenance/reap` call.
//   ACCOUNT_COOLING_OFF_HOURS  optional, default 24; values under 1 are ignored unless ACCOUNT_ALLOW_SHORT_COOLING_OFF=1 (live test only).
//   ACCOUNT_IDENTIFIER_DOMAIN  optional, default accounts.dancehall.invalid (see docs/CLOUD_ACCOUNTS_ACTIVATION.md gate 2).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform to the function and never reach a client.
//
// This function never receives a PIN, a Recovery Key or a security answer, and never logs request bodies.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import {
  DEFAULT_IDENTIFIER_DOMAIN,
  coolingOffMsFromEnv,
  createAccountCore,
  safeEqual,
  type AuthAdmin,
  type Ctx,
} from '../_shared/generated/account-core.ts';
import { createRpcAccountDb } from '../_shared/generated/account-rpc-db.ts';

declare const Deno: {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};

const env = (k: string): string => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`missing configuration: ${k}`);
  return v;
};
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer): string =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pepper = b64(env('ACCOUNT_PEPPER'));

const authAdmin: AuthAdmin = {
  async createUser({ identifier, secret }) {
    // The device secret is a 256-bit random value held in the phone's secure storage. It is the account's "password" to GoTrue only; people never see or type it.
    const { data, error } = await admin.auth.admin.createUser({
      email: identifier,
      password: secret,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error('create_failed');
    return data.user.id;
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error('delete_failed');
  },
  async setSecret(userId, secret) {
    const { data, error } = await admin.auth.admin.updateUserById(userId, { password: secret });
    if (error || !data.user?.email) throw new Error('update_failed');
    return data.user.email;
  },
};

const db = createRpcAccountDb(async (fn, args) => {
  const { data, error } = await admin.rpc(fn, { p: args });
  if (error) throw new Error('db_failed');
  return data;
});

const core = createAccountCore({
  db,
  auth: authAdmin,
  random: (n) => crypto.getRandomValues(new Uint8Array(n)),
  now: () => Date.now(),
  pepper,
  // A cooling-off shorter than an hour is honoured only when ACCOUNT_ALLOW_SHORT_COOLING_OFF=1 (a live test); otherwise it falls back to the 24-hour default.
  policy: {
    coolingOffMs: coolingOffMsFromEnv(
      Deno.env.get('ACCOUNT_COOLING_OFF_HOURS'),
      Deno.env.get('ACCOUNT_ALLOW_SHORT_COOLING_OFF') === '1',
    ),
  },
  identifierDomain: Deno.env.get('ACCOUNT_IDENTIFIER_DOMAIN') ?? DEFAULT_IDENTIFIER_DOMAIN,
});

const NEEDS_USER = new Set(['recover/cancel', 'rotate', 'status']);
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function ipBucket(req: Request): Promise<string> {
  // Prefer headers the platform sets itself; if only X-Forwarded-For is present take its LAST entry (the one the nearest proxy added), never the first (the client can write that).
  // This limit slows abuse from one network; the per-account lockouts do not depend on it. Which header the hosted platform sets is to be confirmed at activation.
  const xff = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const raw =
    req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? xff.at(-1) ?? 'unknown';
  const key = await crypto.subtle.importKey(
    'raw',
    pepper,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`ip:${raw}`))).slice(
    0,
    32,
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  const op = new URL(req.url).pathname.replace(/^.*\/account\/?/, '').replace(/\/$/, '');
  try {
    if (op === 'maintenance/reap') {
      if (!safeEqual(req.headers.get('x-maintenance-key') ?? '', env('MAINTENANCE_KEY')))
        return json(401, { ok: false, error: 'unauthenticated' });
      const reaped = await core.reap();
      const pruned = await admin.rpc('acct_prune', { p: { now: Date.now() } });
      return json(200, { ok: true, reaped, pruned: pruned.data });
    }
    if (Number(req.headers.get('content-length') ?? '0') > 8192)
      return json(413, { ok: false, error: 'too_large' });
    const text = await req.text();
    if (text.length > 8192) return json(413, { ok: false, error: 'too_large' });
    let input: Record<string, unknown> = {};
    if (text) {
      // A body that is not a JSON object is the caller's mistake (400), not a server fault, and nothing from it is echoed back.
      try {
        const v: unknown = JSON.parse(text);
        if (!v || typeof v !== 'object' || Array.isArray(v))
          return json(400, { ok: false, error: 'invalid_request' });
        input = v as Record<string, unknown>;
      } catch {
        return json(400, { ok: false, error: 'invalid_request' });
      }
    }
    const ctx: Ctx = { ipBucket: await ipBucket(req) };
    if (NEEDS_USER.has(op)) {
      const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data } = token ? await admin.auth.getUser(token) : { data: { user: null } };
      if (!data.user) return json(401, { ok: false, error: 'unauthenticated' });
      ctx.userId = data.user.id;
    }
    const r = await core.handle(op, input, ctx);
    return json(r.status, r.body);
  } catch {
    // No detail: errors here may sit near secrets. The platform's own logs record that the invocation failed.
    return json(500, { ok: false, error: 'internal' });
  }
});
