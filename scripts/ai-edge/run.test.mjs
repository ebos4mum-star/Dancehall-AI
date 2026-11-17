// The AI Edge Function under a REAL Deno runtime, nothing hosted: phone-like HTTP client -> the real supabase/functions/ai bundle -> supabase-js -> the local Auth stand-in.
// It proves what can be proven without a database: the function refuses to serve unless the owner configured it, serves only the Coach routes, requires a real signed-in person,
// refuses oversized or unreadable requests, and reveals nothing when the backend fails. The Coach conversation itself (consent, allowance, budget, safety screen, stored reply)
// is covered by packages/ai/src/edge.test.ts and handlers.test.ts against the in-memory repository; the SQL access runs for the first time on staging.
// Run:  pnpm test:ai-edge     (needs Deno: set DENO_BIN or put `deno` on PATH; otherwise the test skips and says why.)
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBundle } from '../edge-bundle.mjs';
import { signJwt, startPlatform } from '../community-integration/platform.mjs';

const DENO = process.env.DENO_BIN || 'deno';
const skip = (() => {
  try {
    execFileSync(DENO, ['--version'], { stdio: 'ignore' });
    return false;
  } catch {
    return 'Deno is not installed (set DENO_BIN)';
  }
})();
// Throwaway values for a stand-in on this machine only (built at run time so no secret-looking literal sits in the repository).
const JWT_SECRET = ['stand-in', 'jwt', 'signing', 'value'].join('-');
const SERVICE_KEY = ['stand-in', 'server', 'credential'].join('-');
const PLATFORM_PORT = 54921;
const PORTS = { mock: 54922, unset: 54923, live: 54924, photo: 54925 };

describe('the AI Edge Function (real Deno, local Auth stand-in)', { skip }, () => {
  let platform;
  const procs = [];
  const logs = {};
  const url = (which, path) => `http://127.0.0.1:${PORTS[which]}${path}`;
  const token = (sub, o = {}) =>
    signJwt(
      { sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
      o.secret ?? JWT_SECRET,
    );
  const call = async (which, path, { method = 'POST', tok, body } = {}) => {
    const r = await fetch(url(which, path), {
      method,
      headers: {
        'content-type': 'application/json',
        ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      },
      body:
        method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body ?? {}),
    });
    const text = await r.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: r.status, json, text, headers: r.headers };
  };
  const start = async (which, extraEnv) => {
    const dir = join(mkdtempSync(join(tmpdir(), 'ai-e2e-')), 'b');
    buildBundle(dir, 'ai');
    const proc = spawn(DENO, ['run', '--allow-net', '--allow-env', 'index.ts'], {
      cwd: dir,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DENO_DIR: process.env.DENO_DIR ?? '',
        HTTPS_PROXY: process.env.HTTPS_PROXY ?? '',
        NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS ?? '',
        DENO_CERT: process.env.NODE_EXTRA_CA_CERTS ?? '',
        NO_COLOR: '1',
        DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${PORTS[which]}`,
        SUPABASE_URL: `http://127.0.0.1:${PLATFORM_PORT}`,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    procs.push(proc);
    logs[which] = '';
    proc.stdout.on('data', (d) => (logs[which] += d));
    proc.stderr.on('data', (d) => (logs[which] += d));
    for (let i = 0; i < 300; i++) {
      try {
        if ((await fetch(url(which, '/v1/coach/messages'), { method: 'GET' })).status) return;
      } catch {
        /* not up yet */
      }
      if (proc.exitCode !== null)
        throw new Error(`the function exited: ${logs[which].slice(-800)}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`the function did not start: ${logs[which].slice(-800)}`);
  };

  before(
    async () => {
      platform = await startPlatform({
        port: PLATFORM_PORT,
        database: 'postgres',
        jwtSecret: JWT_SECRET,
        serviceKey: SERVICE_KEY,
      });
      await Promise.all([
        start('mock', { AI_PROVIDER: 'mock' }),
        start('unset', {}),
        start('live', { AI_PROVIDER: 'live' }),
        start('photo', { AI_PROVIDER: 'mock', AI_ROUTES: 'coach,photo' }),
      ]);
    },
    { timeout: 240000 },
  );
  after(async () => {
    for (const p of procs) p.kill();
    await platform?.close();
  });

  it('serves nothing when AI_PROVIDER is not set (the simulated provider is never a default)', async () => {
    for (const p of ['/v1/coach/messages', '/v1/coach/weekly-review', '/v1/food/photo-analysis']) {
      const r = await call('unset', p, {
        tok: token('11111111-1111-4111-8111-111111111111'),
        body: { text: 'hi' },
      });
      assert.equal(r.status, 503, p);
      assert.equal(r.json.error.code, 'feature_disabled');
    }
  });
  it('refuses a live provider (none is implemented)', async () => {
    const r = await call('live', '/v1/coach/messages', {
      tok: token('22222222-2222-4222-8222-222222222222'),
      body: { text: 'hi' },
    });
    assert.equal(r.status, 503);
    assert.doesNotMatch(r.text, /live|AI_PROVIDER/);
  });
  it('only POST is served, and the answer is never cached', async () => {
    const g = await call('mock', '/v1/coach/messages', { method: 'GET' });
    assert.equal(g.status, 405);
    const p = await call('mock', '/v1/coach/messages', { body: { text: 'hi' } });
    assert.equal(p.headers.get('cache-control'), 'no-store');
  });
  it('requires a real signed-in person: no token, a garbage token and a token signed with a different key are all 401', async () => {
    assert.equal((await call('mock', '/v1/coach/messages', { body: { text: 'hi' } })).status, 401);
    assert.equal(
      (await call('mock', '/v1/coach/messages', { tok: 'garbage', body: { text: 'hi' } })).status,
      401,
    );
    const forged = token('33333333-3333-4333-8333-333333333333', {
      secret: 'a-different-signing-value',
    });
    assert.equal(
      (await call('mock', '/v1/coach/messages', { tok: forged, body: { text: 'hi' } })).status,
      401,
    );
  });
  it('serves only the Coach routes: photo analysis is a feature that is off, and account deletion is not served at all', async () => {
    const tok = token('44444444-4444-4444-8444-444444444444');
    const photo = await call('mock', '/v1/food/photo-analysis', {
      tok,
      body: { storagePath: 'x/y.jpg' },
    });
    assert.equal(photo.status, 503);
    assert.equal(photo.json.error.code, 'feature_disabled');
    for (const p of [
      '/v1/account/deletion',
      '/v1/account/deletion/cancel',
      '/v1/admin/anything',
      '/health',
    ])
      assert.equal((await call('mock', p, { tok, body: {} })).status, 404, p);
  });
  it('photo analysis is served only when AI_ROUTES explicitly asks for it (then it is still behind sign-in)', async () => {
    assert.equal((await call('photo', '/v1/food/photo-analysis', { body: {} })).status, 401);
  });
  it('refuses unreadable and oversized requests, and echoes nothing', async () => {
    const tok = token('55555555-5555-4555-8555-555555555555');
    const bad = await call('mock', '/v1/coach/messages', {
      tok,
      body: '{"text": <script>alert(1)</script>',
    });
    assert.equal(bad.status, 400);
    assert.doesNotMatch(bad.text, /script|alert/);
    assert.equal(
      (await call('mock', '/v1/coach/messages', { tok, body: { text: 'x'.repeat(9000) } })).status,
      413,
    );
  });
  it('a failing backend reveals nothing: a valid person whose data cannot be read gets a plain error, no table, query or address', async () => {
    // The Auth stand-in knows the person; it serves no table rows, so the consent lookup fails the way a database outage would.
    const r = await call('mock', '/v1/coach/messages', {
      tok: token('66666666-6666-4666-8666-666666666666'),
      body: { text: 'Can you plan a workout?' },
    });
    assert.ok(r.status >= 400 && r.status < 600, `status ${r.status}`);
    assert.doesNotMatch(
      r.text,
      /consents|rest\/v1|127\.0\.0\.1|supabase|select|stand-in|PGRST|relation/i,
    );
  });
  it('the response never carries a key or an identifier', async () => {
    const r = await call('mock', '/v1/coach/messages', {
      tok: token('77777777-7777-4777-8777-777777777777'),
      body: { text: 'hi' },
    });
    assert.doesNotMatch(r.text, new RegExp(`${SERVICE_KEY}|${JWT_SECRET}|7777777`));
  });
});
