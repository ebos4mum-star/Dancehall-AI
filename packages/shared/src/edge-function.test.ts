/**
 * Runs the REAL `supabase/functions/account/index.ts` and its generated shared files (not a copy of the logic) in Node with a stand-in for the Deno runtime and a fake
 * Supabase client, to check what the wrapper itself guarantees: with `verify_jwt=false` every action must enforce its own authorization and abuse protection.
 * It proves nothing about the hosted Edge runtime, Auth server or database; it proves the wrapper's own behaviour.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryAccountDb } from './account-memory-db';
import { generateRecoveryKey, recoveryDigest } from './recovery-key';
import { answersProof } from './security-questions';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const tmp = join(here, '..', '.edge-test-tmp');
type Handler = (req: Request) => Promise<Response> | Response;
const csprng = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

interface FakeWorld {
  db: MemoryAccountDb;
  users: Map<string, { email: string; password: string }>;
  tokens: Map<string, string>;
  rpcFails: boolean;
}

/** Writes the function and its generated files into a scratch folder with the Deno-only import specifiers swapped for ones Node can resolve. */
function stage(dir: string) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'account'), { recursive: true });
  cpSync(join(repo, 'supabase', 'functions', '_shared'), join(dir, '_shared'), { recursive: true });
  const fix = (s: string) =>
    s
      .replace(/npm:@noble\/hashes@[\d.]+\//g, '@noble/hashes/')
      .replace(/npm:@supabase\/supabase-js@[\d.]+/g, '../fake-supabase.mjs');
  const src = fix(readFileSync(join(repo, 'supabase', 'functions', 'account', 'index.ts'), 'utf8'));
  writeFileSync(join(dir, 'account', 'index.ts'), src);
  for (const f of ['account-core.ts', 'security-questions.ts', 'account-rpc-db.ts']) {
    const p = join(dir, '_shared', 'generated', f);
    writeFileSync(p, fix(readFileSync(p, 'utf8')));
  }
  writeFileSync(
    join(dir, 'fake-supabase.mjs'),
    'export function createClient(){ return globalThis.__fakeSupabase(); }\n',
  );
}

function fakeClient(w: FakeWorld) {
  const d = w.db;
  // The fake database is called through the same untyped JSON the real function sends.
  type P = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const rpcs: Record<string, (p: P) => unknown> = {
    acct_provision_begin: (p) => d.provisionBegin(p),
    acct_provision_attach: (p) => d.provisionAttach(p.requestId, p.userId, p.identifier),
    acct_provision_finalize: (p) => d.provisionFinalize(p),
    acct_provision_abort: (p) => d.provisionAbort(p.requestId),
    acct_stale_pending: (p) => d.stalePending(p.before),
    acct_hit: (p) => d.hit(p.bucket, p.now, p.windowMs, p.limit),
    acct_by_digest: (p) => d.accountByDigest(p.digestMac),
    acct_tx_open: (p) => d.txOpen(p),
    acct_tx_verify: (p) => d.txVerify(p),
    acct_tx_complete: (p) => d.txComplete(p),
    acct_tx_revert: (p) => d.txRevert(p.txId),
    acct_cancel_recoveries: (p) => d.cancelRecoveries(p.userId),
    acct_rotate: (p) => d.rotate(p),
    acct_status: (p) => d.status(p.userId, p.now),
    acct_revoke_sessions: (p) => d.revokeSessions(p.userId),
    acct_prune: () => ({ tx: 0, hits: 0 }),
  };
  let n = 0;
  return {
    rpc: async (fn: string, a: { p: unknown }) => {
      if (w.rpcFails)
        return {
          data: null,
          error: { message: 'secret-looking detail that must never be echoed' },
        };
      return { data: (await rpcs[fn]!(a.p)) ?? null, error: null };
    },
    auth: {
      getUser: async (t: string) => {
        const id = w.tokens.get(t);
        return { data: { user: id ? { id } : null }, error: null };
      },
      admin: {
        createUser: async ({ email, password }: { email: string; password: string }) => {
          const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
          w.users.set(id, { email, password });
          return { data: { user: { id, email } }, error: null };
        },
        deleteUser: async (id: string) => (w.users.delete(id), { error: null }),
        updateUserById: async (id: string, { password }: { password: string }) => {
          const u = w.users.get(id)!;
          u.password = password;
          return { data: { user: { id, email: u.email } }, error: null };
        },
      },
    },
  };
}

let loads = 0;
async function load(env: Record<string, string | undefined>) {
  const world: FakeWorld = {
    db: new MemoryAccountDb(),
    users: new Map(),
    tokens: new Map(),
    rpcFails: false,
  };
  let handler: Handler | null = null;
  const g = globalThis as Record<string, unknown>;
  g.__fakeSupabase = () => fakeClient(world);
  g.Deno = { env: { get: (k: string) => env[k] }, serve: (h: Handler) => void (handler = h) };
  // A fresh copy of the entry file per load, so each load reads its own environment (module state is per file).
  const name = `index-${++loads}.ts`;
  cpSync(join(tmp, 'account', 'index.ts'), join(tmp, 'account', name));
  vi.resetModules();
  await import(/* @vite-ignore */ join(tmp, 'account', name));
  return { world, handler: handler as unknown as Handler };
}

const BASE_ENV = {
  SUPABASE_URL: 'https://example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder-not-a-real-credential',
  ACCOUNT_PEPPER: b64(new Uint8Array(48).fill(9)),
  MAINTENANCE_KEY: 'maintenance-test-value-0123456789',
};
const call = (
  h: Handler,
  op: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = 'POST',
) =>
  h(
    new Request(`https://x.example.invalid/functions/v1/account/${op}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body:
        method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    }),
  );
const FAST = { N: 16, r: 8, p: 1, dkLen: 32 };
const answers: [{ id: string; answer: string }, { id: string; answer: string }] = [
  { id: 'q-first-pet', answer: 'Rex' },
  { id: 'q-family-dish', answer: 'Curry goat' },
];
async function provisionBody() {
  const key = generateRecoveryKey(csprng);
  const salt = hexOf(csprng(16));
  return {
    key,
    body: {
      requestId: hexOf(csprng(16)),
      deviceSecret: 'a'.repeat(43),
      digest: recoveryDigest(key),
      proof: await answersProof(answers, salt, FAST),
      salt,
      q1: 'q-family-dish',
      q2: 'q-first-pet',
    },
  };
}

beforeAll(() => stage(tmp));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('account Edge Function wrapper (verify_jwt=false: each action guards itself)', () => {
  it('refuses anything but POST, and unknown actions', async () => {
    const { handler } = await load(BASE_ENV);
    expect((await call(handler, 'provision', null, {}, 'GET')).status).toBe(405);
    expect((await call(handler, 'delete-everything', {})).status).toBe(404);
  });

  it('the three signed-in actions need a real session: no header, a wrong token, the publishable key and a revoked token are all refused', async () => {
    const { handler, world } = await load(BASE_ENV);
    world.tokens.set('live-session-token', '00000000-0000-4000-8000-000000000042');
    for (const op of ['status', 'rotate', 'recover/cancel']) {
      expect((await call(handler, op, {})).status, `${op} without a token`).toBe(401);
      expect(
        (await call(handler, op, {}, { authorization: 'Bearer nonsense' })).status,
        `${op} bad token`,
      ).toBe(401);
      expect(
        (await call(handler, op, {}, { authorization: 'Bearer sb_publishable_looks_public' }))
          .status,
        `${op} public key`,
      ).toBe(401);
    }
    expect(
      (await call(handler, 'status', {}, { authorization: 'Bearer live-session-token' })).status,
    ).toBe(200);
    world.tokens.delete('live-session-token'); // the session was revoked
    expect(
      (await call(handler, 'status', {}, { authorization: 'Bearer live-session-token' })).status,
    ).toBe(401);
  });

  it('the unauthenticated actions work without any token, and say nothing about whether a key exists', async () => {
    const { handler } = await load(BASE_ENV);
    const p = await provisionBody();
    const r = await call(handler, 'provision', p.body);
    expect(r.status).toBe(200);
    const j = (await r.json()) as Record<string, unknown>;
    expect(String(j.identifier)).toMatch(/^u[0-9a-f]{32}@accounts\.dancehall\.invalid$/);
    expect(JSON.stringify(j)).not.toMatch(/deviceSecret|digest|proof|pepper|a{43}/);
    const real = (await (
      await call(handler, 'recover/start', { digest: p.body.digest })
    ).json()) as Record<string, unknown>;
    const fake = (await (
      await call(handler, 'recover/start', { digest: recoveryDigest(generateRecoveryKey(csprng)) })
    ).json()) as Record<string, unknown>;
    expect(Object.keys(real).sort()).toEqual(Object.keys(fake).sort());
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('content-type')).toBe('application/json');
  });

  it('the maintenance route needs its key (constant-time compared), and an unset key fails closed', async () => {
    const { handler } = await load(BASE_ENV);
    expect((await call(handler, 'maintenance/reap', {})).status).toBe(401);
    expect(
      (await call(handler, 'maintenance/reap', {}, { 'x-maintenance-key': 'wrong' })).status,
    ).toBe(401);
    expect(
      (
        await call(
          handler,
          'maintenance/reap',
          {},
          { 'x-maintenance-key': BASE_ENV.MAINTENANCE_KEY },
        )
      ).status,
    ).toBe(200);
    const open = await load({ ...BASE_ENV, MAINTENANCE_KEY: undefined });
    expect(
      (await call(open.handler, 'maintenance/reap', {}, { 'x-maintenance-key': '' })).status,
    ).toBe(500);
  });

  it("bad bodies are the caller's error (400) or too large (413); nothing from them is echoed", async () => {
    const { handler } = await load(BASE_ENV);
    for (const bad of ['{not json', '[1,2]', '"text"', 'null']) {
      const r = await call(handler, 'provision', bad);
      expect(r.status, bad).toBe(400);
      expect(JSON.stringify(await r.json())).not.toContain('not json');
    }
    expect((await call(handler, 'provision', 'x'.repeat(9000))).status).toBe(413);
    expect((await call(handler, 'provision', '{}', { 'content-length': '9000' })).status).toBe(413);
  });

  it('a database failure is a generic 500 with no detail', async () => {
    const { handler, world } = await load(BASE_ENV);
    world.rpcFails = true;
    const r = await call(handler, 'recover/start', {
      digest: recoveryDigest(generateRecoveryKey(csprng)),
    });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: 'internal' });
  });

  it('refuses to start without its secrets, or with a short pepper (fails closed)', async () => {
    await expect(load({ ...BASE_ENV, ACCOUNT_PEPPER: undefined })).rejects.toThrow();
    await expect(
      load({ ...BASE_ENV, ACCOUNT_PEPPER: b64(new Uint8Array(16).fill(1)) }),
    ).rejects.toThrow();
    await expect(load({ ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined })).rejects.toThrow();
    await expect(
      load({ ...BASE_ENV, ACCOUNT_IDENTIFIER_DOMAIN: 'not a domain' }),
    ).rejects.toThrow();
  });

  it('network limits key on cf-connecting-ip ONLY: spoofed forwarding headers change nothing, other networks are separate, an IPv6 /64 is one network, and no identity fails closed', async () => {
    const sendMany = async (headersFor: (i: number) => Record<string, string>, n = 22) => {
      const { handler } = await load(BASE_ENV);
      const statuses: number[] = [];
      for (let i = 0; i < n; i++) {
        const p = await provisionBody();
        statuses.push((await call(handler, 'provision', p.body, headersFor(i))).status);
      }
      return statuses;
    };
    // One real network; the caller varies every header it can write: only the 20 per-network provisions are allowed.
    const spoof = await sendMany((i) => ({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': `10.0.0.${i}, 198.51.100.${i}`,
      'x-real-ip': `192.0.2.${i}`,
      'true-client-ip': `198.18.0.${i}`,
    }));
    expect(spoof.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(spoof.slice(20)).toEqual([429, 429]);
    // Different real networks are counted separately.
    expect(
      (await sendMany((i) => ({ 'cf-connecting-ip': `203.0.113.${i + 1}` }))).every(
        (s) => s === 200,
      ),
    ).toBe(true);
    // One IPv6 /64 is one network, however the low 64 bits vary.
    const v6 = await sendMany((i) => ({
      'cf-connecting-ip': `2001:db8:1:2:${i.toString(16)}:aaaa:bbbb:cccc`,
    }));
    expect(v6.slice(20)).toEqual([429, 429]);
    // No platform identity at all (even with spoofed headers): everyone shares one bucket, so it fails closed.
    const none = await sendMany((i) => ({
      'x-forwarded-for': `10.1.1.${i}`,
      'x-real-ip': `10.2.2.${i}`,
    }));
    expect(none.slice(20)).toEqual([429, 429]);
  });

  it('the service-wide account cap does not depend on any address header', async () => {
    const { handler } = await load(BASE_ENV);
    let ok = 0;
    for (let i = 0; i < 330; i++) {
      const p = await provisionBody();
      const r = await call(handler, 'provision', p.body, {
        'cf-connecting-ip': `10.${i >> 8}.${i & 255}.1`,
      });
      if (r.status === 200) ok++;
    }
    expect(ok).toBe(300);
  }, 60_000);

  it('the cooling-off cannot be switched off by configuration; a short wait needs the explicit test flag', async () => {
    const wait = async (env: Record<string, string | undefined>) => {
      const { handler } = await load({ ...BASE_ENV, ...env });
      const p = await provisionBody();
      await call(handler, 'provision', p.body);
      const start = (await (
        await call(handler, 'recover/start', { digest: p.body.digest })
      ).json()) as { txId: string; salt: string };
      const proof = await answersProof(answers, start.salt, FAST);
      const before = Date.now();
      const v = (await (
        await call(handler, 'recover/verify', {
          txId: start.txId,
          proof,
          completionSecret: hexOf(csprng(32)),
        })
      ).json()) as { readyAt: number };
      return v.readyAt - before;
    };
    const H = 3600_000;
    expect(await wait({})).toBeGreaterThan(23.9 * H);
    expect(await wait({ ACCOUNT_COOLING_OFF_HOURS: '0' })).toBeGreaterThan(23.9 * H);
    expect(
      await wait({ ACCOUNT_COOLING_OFF_HOURS: 'banana', ACCOUNT_ALLOW_SHORT_COOLING_OFF: '1' }),
    ).toBeGreaterThan(23.9 * H);
    expect(
      await wait({ ACCOUNT_COOLING_OFF_HOURS: '0.05', ACCOUNT_ALLOW_SHORT_COOLING_OFF: '1' }),
    ).toBeLessThan(0.06 * H);
  });
});
