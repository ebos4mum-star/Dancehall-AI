// Edge Function `community`: the only way anyone reaches Community data. NOT DEPLOYED by this change: it ships as reviewed code only.
//
// POST JSON to /community/<route>. Routes and rules live in packages/shared/src/community-server.ts (copied into the function's shared folder by scripts/sync-edge-core.mjs).
//   Guests:  feed · comments · status            Members: profile · username/claim · username/change · upload/ticket · upload/commit · post · post/delete · comment · comment/delete
//                                                 encourage · report · block · unblock · blocked · leave
//   Staff (verified JWT with a second factor + moderation.review): mod/queue · mod/act · mod/restrict · mod/mode · mod/backlog
//   Scheduled: maintenance/prune · maintenance/alerts (header x-maintenance-key)
// Secrets (set with `supabase secrets set`, never in the app or the repo):
//   COMMUNITY_PEPPER           >= 32 random bytes, base64. Keys the hash of a guest's network address (we never store the address itself).
//   COMMUNITY_MAINTENANCE_KEY  random string that authorises maintenance/prune and maintenance/alerts.
// Optional configuration (all off by default):
//   COMMUNITY_FLOOR_MODE       "read_only" or "text_only": a Community-only kill switch that needs no database and never loosens the moderator's setting.
//   COMMUNITY_ALERTS=1         turns on urgent-report emails. Also needs ALL of: COMMUNITY_ALERT_RECIPIENTS (comma-separated: moderator and backup),
//                              COMMUNITY_ALERT_FROM (a verified sender), COMMUNITY_ALERT_API_URL (https) and COMMUNITY_ALERT_API_KEY (a secret), from an APPROVED provider.
//                              Without all of them nothing is sent. COMMUNITY_CONSOLE_URL optionally adds a link to the console.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform to the function and never reach a client.
// Needs: supabase/proposed/community.up.sql and community.storage.sql applied (separate approval). Public activation also needs EXPO_PUBLIC_COMMUNITY=1 in a reviewed build.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { networkIdentity, safeEqual } from '../_shared/generated/account-core.ts';
import { createAlerter } from '../_shared/generated/community-alerts.ts';
import { storageUploadOptions } from '../_shared/generated/community-media.ts';
import { createCommunityServer } from '../_shared/generated/community-server.ts';

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

const BUCKET = 'community-media';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pepper = b64(env('COMMUNITY_PEPPER'));
const maintenanceKey = env('COMMUNITY_MAINTENANCE_KEY');

const server = createCommunityServer({
  rpc: {
    async call(fn, args) {
      // `app` is not exposed over the API; this single service-role-only function runs the allow-listed community functions (see community.up.sql).
      const { data, error } = await admin.rpc('community_rpc', { fn, args });
      // The database raises plain codes ("taken", "forbidden"...). Anything else is reported upward as-is and mapped to a generic 500 there.
      if (error) throw new Error(error.message);
      return data;
    },
  },
  storage: {
    async signedUploadUrl(path) {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      return error || !data ? null : { url: data.signedUrl, token: data.token };
    },
    async size(path) {
      // A HEAD request on a short-lived signed link returns the stored size without reading the file into memory.
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 30);
      if (error || !data) return null;
      const r = await fetch(data.signedUrl, { method: 'HEAD' });
      const n = Number(r.headers.get('content-length'));
      return r.ok && Number.isFinite(n) ? n : null;
    },
    async download(path) {
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    async upload(path, bytes, mime) {
      // Short-cache policy (see COMMUNITY_FILE_CACHE_SECONDS): a deleted photo must not stay cached for the platform default of an hour.
      const { error } = await admin.storage
        .from(BUCKET)
        .upload(path, bytes, storageUploadOptions(mime));
      if (error) throw new Error('storage_failed');
    },
    async remove(paths) {
      await admin.storage.from(BUCKET).remove(paths);
    },
    async signedUrl(path, seconds) {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, seconds);
      return error || !data ? null : data.signedUrl;
    },
  },
  auth: {
    async verify(token) {
      // The auth server checks the signature, expiry and that the account still exists. The assurance level is then read from the same, already verified, token.
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
  maintenanceKeyOk: (key) => !!key && safeEqual(key, maintenanceKey),
  // Local diagnosis only: COMMUNITY_DEBUG=1 prints the error's name and first words (never request content). Leave unset in any hosted project.
  onError:
    Deno.env.get('COMMUNITY_DEBUG') === '1'
      ? (e) =>
          console.error(
            'community_error',
            e instanceof Error ? `${e.name}: ${e.message.slice(0, 120)}` : 'unknown',
          )
      : undefined,
  // Comments are off for V1. They stay refused unless this is set AND the database setting is changed by an approved migration.
  commentsEnabled: Deno.env.get('COMMUNITY_COMMENTS') === '1',
  alerts: createAlerter({
    enabled: Deno.env.get('COMMUNITY_ALERTS'),
    recipients: Deno.env.get('COMMUNITY_ALERT_RECIPIENTS'),
    from: Deno.env.get('COMMUNITY_ALERT_FROM'),
    apiUrl: Deno.env.get('COMMUNITY_ALERT_API_URL'),
    apiKey: Deno.env.get('COMMUNITY_ALERT_API_KEY'),
    consoleUrl: Deno.env.get('COMMUNITY_CONSOLE_URL'),
  }),
  floorMode: ['text_only', 'read_only'].includes(Deno.env.get('COMMUNITY_FLOOR_MODE') ?? '')
    ? (Deno.env.get('COMMUNITY_FLOOR_MODE') as 'text_only' | 'read_only')
    : 'open',
});

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  });

async function networkKey(req: Request): Promise<string> {
  // Only `cf-connecting-ip` is trusted (see networkIdentity); callers can write the other forwarding headers.
  const identity = networkIdentity(req.headers.get('cf-connecting-ip'));
  const key = await crypto.subtle.importKey(
    'raw',
    pepper,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`community-ip:${identity}`)),
  ).slice(0, 32);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });
  const route = new URL(req.url).pathname.replace(/^.*\/community\/?/, '').replace(/\/$/, '');
  if (Number(req.headers.get('content-length') ?? '0') > 32768)
    return json(413, { ok: false, code: 'payload_too_large' });
  const text = await req.text();
  if (text.length > 32768) return json(413, { ok: false, code: 'payload_too_large' });
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { ok: false, code: 'invalid_input' });
    }
  }
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '') || null;
  const r = await server.handle({
    route,
    token,
    networkKey: await networkKey(req),
    body,
    maintenanceKey: req.headers.get('x-maintenance-key'),
  });
  return json(r.status, r.body, r.headers);
});
