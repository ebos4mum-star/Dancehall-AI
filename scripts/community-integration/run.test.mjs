// End-to-end test of the Community server path on ONE machine, with nothing hosted:
//   phone-like HTTP client -> the REAL Edge Function running under a REAL Deno runtime -> supabase-js -> a local stand-in for Supabase Auth/REST/Storage -> a REAL Postgres
//   with the REAL migrations and community.up.sql (every call runs as the service_role database role).
// Run:  pnpm test:community-integration     (needs Postgres, as for `pnpm db:test`, and Deno: set DENO_BIN or put `deno` on PATH; otherwise the test skips and says why.)
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { buildBundle } from '../edge-bundle.mjs';
import { pgOptions, signJwt, startPlatform } from './platform.mjs';

const DENO = process.env.DENO_BIN || 'deno';
const have = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const skip = !have(DENO, ['--version'])
  ? 'Deno is not installed (set DENO_BIN)'
  : !have('pg_isready', ['-q'])
    ? 'no Postgres server is reachable'
    : null;

const DB = 'dh_community_e2e';
// Throwaway values for a stand-in on this machine only (built at run time so no secret-looking literal sits in the repository).
const JWT_SECRET = ['stand-in', 'jwt', 'signing', 'value'].join('-');
const SERVICE_KEY = ['stand-in', 'server', 'credential'].join('-');
const PEPPER = Buffer.alloc(32, 7).toString('base64');
const MAINT = ['stand-in', 'maintenance', 'value'].join('-');
const PLATFORM_PORT = 54901;
const FN_PORT = 54902;
const FLOOR_PORT = 54903;
const ALERT_PORT = 54904;
const sh = (args) =>
  execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const cat = (...p) => {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) {
    o.set(x, i);
    i += x.length;
  }
  return o;
};
const be16 = (n) => Uint8Array.of((n >> 8) & 255, n & 255);
const exifData = enc('Exif\0\0GPS-5.6037,-0.1870 secret-location');
const JPEG = cat(
  Uint8Array.of(0xff, 0xd8),
  Uint8Array.of(0xff, 0xe1),
  be16(2 + exifData.length),
  exifData,
  Uint8Array.of(0xff, 0xc0),
  be16(11),
  Uint8Array.of(8),
  be16(6),
  be16(8),
  Uint8Array.of(1, 1, 0x11, 0),
  Uint8Array.of(0xff, 0xda),
  be16(4),
  Uint8Array.of(0, 0, 1, 2, 3, 4, 0xff, 0xd9),
);

describe(
  'Community end to end (real Deno, real SQL, local platform stand-in)',
  { skip: skip ?? false },
  () => {
    let platform,
      db,
      bundle,
      procs = [];
    const users = {};
    const seen = []; // every response body, scanned at the end for identifiers
    const baseUrl = (port) => `http://127.0.0.1:${port}/community`;
    const mint = (
      sub,
      { aal = 'aal1', exp = Math.floor(Date.now() / 1000) + 3600, secret = JWT_SECRET } = {},
    ) => signJwt({ sub, role: 'authenticated', aal, exp }, secret);
    const call = async (route, body = {}, token = null, { port = FN_PORT, headers = {} } = {}) => {
      const r = await fetch(`${baseUrl(port)}/${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      seen.push(text);
      if (process.env.E2E_DEBUG && r.status >= 500) console.error('HTTP', r.status, route, text);
      let json = {};
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      return { status: r.status, body: json, text, headers: r.headers };
    };
    const mail = async () =>
      await (await fetch(`http://127.0.0.1:${PLATFORM_PORT}/__test/mail`)).json();
    const files = async () =>
      await (await fetch(`http://127.0.0.1:${PLATFORM_PORT}/__test/files`)).json();
    const clock = (offsetS) =>
      fetch(`http://127.0.0.1:${PLATFORM_PORT}/__test/clock`, {
        method: 'POST',
        body: JSON.stringify({ offsetS }),
      });

    async function startFn(port, env = {}) {
      const p = spawn(DENO, ['run', '--allow-net', '--allow-env', 'index.ts'], {
        cwd: bundle,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          DENO_DIR: process.env.DENO_DIR ?? '',
          NO_COLOR: '1',
          COMMUNITY_DEBUG: '1',
          DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`,
          SUPABASE_URL: `http://127.0.0.1:${PLATFORM_PORT}`,
          SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
          COMMUNITY_PEPPER: PEPPER,
          COMMUNITY_MAINTENANCE_KEY: MAINT,
          ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let log = '';
      p.stdout.on('data', (d) => (log += d));
      p.stderr.on('data', (d) => {
        log += d;
        if (process.env.E2E_DEBUG) console.error('FN', String(d).trim().slice(0, 300));
      });
      procs.push(p);
      for (let i = 0; i < 150; i++) {
        try {
          const r = await fetch(`${baseUrl(port)}/status`, { method: 'POST', body: '{}' });
          if (r.status) return;
        } catch {
          /* not up yet */
        }
        if (p.exitCode !== null) throw new Error(`the function exited: ${log.slice(-800)}`);
        await new Promise((r) => setTimeout(r, 200));
      }
      throw new Error(`the function did not start: ${log.slice(-800)}`);
    }

    before(
      async () => {
        sh([
          '-d',
          'postgres',
          '-c',
          `drop database if exists ${DB}`,
          '-c',
          `create database ${DB}`,
        ]);
        sh(['-d', DB, '-f', 'supabase/tests/shim.sql']);
        for (const f of readdirSync('supabase/migrations')
          .filter((x) => x.endsWith('.sql'))
          .sort())
          sh(['-d', DB, '-f', `supabase/migrations/${f}`]);
        sh(['-d', DB, '-f', 'supabase/seed.sql']);
        sh(['-d', DB, '-f', 'supabase/proposed/community.up.sql']);
        db = new pg.Client(pgOptions(DB));
        await db.connect();
        const mk = async (name) => {
          const r = await db.query(
            'insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id',
            [`${name}@accounts.dancehall.invalid`],
          );
          users[name] = r.rows[0].id;
        };
        for (const n of ['ama', 'kofi', 'efua', 'yaw', 'mod1', 'mod2', 'plain', 'temp'])
          await mk(n);
        await db.query(
          "insert into public.staff_roles (user_id, role) values ($1, 'moderator'), ($2, 'moderator')",
          [users.mod1, users.mod2],
        );
        platform = await startPlatform({
          port: PLATFORM_PORT,
          database: DB,
          jwtSecret: JWT_SECRET,
          serviceKey: SERVICE_KEY,
        });
        bundle = join(mkdtempSync(join(tmpdir(), 'community-e2e-')), 'b');
        buildBundle(bundle, 'community');
        await startFn(FN_PORT);
      },
      { timeout: 240000 },
    );
    after(async () => {
      for (const p of procs) p.kill();
      await platform?.close();
      await db?.end();
      sh(['-d', 'postgres', '-c', `drop database if exists ${DB}`]);
    });

    const tok = (n, o) => mint(users[n], o);
    const upload = async (
      n,
      bytes,
      { kind = 'photo', mime = 'image/jpeg', port = FN_PORT } = {},
    ) => {
      const t = await call('upload/ticket', { kind, mime }, tok(n), { port });
      if (t.status !== 200) return { ticket: t };
      const put = await fetch(t.body.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': mime },
        body: bytes,
      });
      assert.equal(put.status, 200, 'the signed upload link accepts the file');
      return {
        ticket: t,
        path: t.body.path,
        commit: () => call('upload/commit', { path: t.body.path }, tok(n)),
      };
    };

    describe('the function itself', () => {
      it('answers only POST with JSON, bounds the body, and works as a guest', async () => {
        assert.equal((await fetch(`${baseUrl(FN_PORT)}/feed`)).status, 405);
        assert.equal((await call('feed', {}, null)).status, 200);
        const bad = await fetch(`${baseUrl(FN_PORT)}/feed`, { method: 'POST', body: '{not json' });
        assert.equal(bad.status, 400);
        const big = await fetch(`${baseUrl(FN_PORT)}/feed`, {
          method: 'POST',
          body: 'x'.repeat(40000),
        }).catch(() => ({ status: 413 }));
        assert.equal(big.status, 413);
        const s = await call('status', {}, null);
        assert.deepEqual([s.body.mode, s.body.videoEnabled], ['open', false]);
        assert.equal((await call('no/such/route', {}, null)).status, 404);
      });
      it('treats a bad token as a guest for reading, and refuses it for everything else', async () => {
        assert.equal((await call('feed', {}, 'garbage')).status, 200);
        assert.equal(
          (await call('post', { type: 'text', body: 'x', confirmed: true }, 'garbage')).status,
          401,
        );
        const forged = mint(users.ama, { secret: 'a-different-secret' });
        assert.equal(
          (await call('post', { type: 'text', body: 'x', confirmed: true }, forged)).status,
          401,
        );
        assert.equal(
          (await call('post', { type: 'text', body: 'x', confirmed: true }, tok('ama', { exp: 1 })))
            .status,
          401,
        );
      });
    });

    describe('usernames, posting and the public feed', () => {
      it('needs a username to post, claims one, then allows one free change and enforces the cooldown', async () => {
        assert.equal(
          (await call('post', { type: 'text', body: 'hi', confirmed: true }, tok('ama'))).body.code,
          'needs_username',
        );
        assert.equal(
          (await call('username/claim', { username: 'admin' }, tok('plain'))).body.code,
          'invalid_username',
        );
        assert.equal(
          (await call('username/claim', { username: 'ama_dances' }, tok('ama'))).status,
          200,
        );
        assert.equal(
          (await call('username/claim', { username: 'again_name' }, tok('ama'))).body.code,
          'already_set',
        );
        assert.equal(
          (await call('username/claim', { username: 'kofi_moves' }, tok('kofi'))).status,
          200,
        );
        assert.equal(
          (await call('username/claim', { username: 'efua_fit' }, tok('efua'))).status,
          200,
        );
        assert.equal(
          (await call('username/claim', { username: 'yaw_beats' }, tok('yaw'))).status,
          200,
        );
        assert.equal(
          (await call('username/change', { username: 'k0fi_m0ves' }, tok('ama'))).body.code,
          'too_similar',
        );
        assert.equal(
          (await call('username/change', { username: 'Ama_Moves' }, tok('ama'))).body.username,
          'ama_moves',
        );
        assert.equal(
          (await call('username/change', { username: 'ama_again' }, tok('ama'))).body.code,
          'cooldown',
        );
        const p = await call('profile', {}, tok('ama'));
        assert.equal(p.body.username, 'ama_moves');
        assert.ok(p.body.canChangeAt);
        assert.equal(
          (await call('username/claim', { username: 'ama_dances' }, tok('plain'))).body.code,
          'taken',
        ); // the released name is held
      });
      it('publishes ordinary text under the current username, refuses unsafe text without echoing it, and needs confirmation', async () => {
        assert.equal(
          (await call('post', { type: 'text', body: 'First class done!' }, tok('ama'))).body.code,
          'not_confirmed',
        );
        const ok = await call(
          'post',
          { type: 'text', body: 'First class done!', confirmed: true },
          tok('ama'),
        );
        assert.equal(ok.body.status, 'published');
        const feed = await call('feed', {}, null);
        assert.equal(feed.body.posts[0].author, 'ama_moves');
        const blocked = await call(
          'post',
          { type: 'text', body: 'call me on 0201234567', confirmed: true },
          tok('ama'),
        );
        assert.equal(blocked.body.code, 'blocked');
        assert.ok(!blocked.text.includes('0201234567'));
        const held = await call(
          'post',
          { type: 'text', body: 'I lost 12 kg in 3 weeks', confirmed: true },
          tok('ama'),
        );
        assert.equal(held.body.status, 'held');
        assert.ok(
          !(await call('feed', {}, null)).text.includes('lost 12 kg'),
          'a held post is not public',
        );
        assert.ok(
          (await call('feed', {}, tok('ama'))).text.includes('lost 12 kg'),
          'its author still sees it',
        );
      });
      it('shows an author their own Encourage count and nobody else', async () => {
        const post = (await call('feed', {}, null)).body.posts.find(
          (x) => x.body === 'First class done!',
        );
        assert.equal(
          (await call('encourage', { postId: post.id, on: true }, tok('kofi'))).status,
          200,
        );
        assert.equal(
          (await call('encourage', { postId: post.id, on: true }, tok('efua'))).status,
          200,
        );
        assert.equal(
          (await call('encourage', { postId: post.id, on: true }, tok('ama'))).body.code,
          'own_post',
        );
        const mine = (await call('feed', {}, tok('ama'))).body.posts.find((x) => x.id === post.id);
        const theirs = (await call('feed', {}, tok('kofi'))).body.posts.find(
          (x) => x.id === post.id,
        );
        const guest = (await call('feed', {}, null)).body.posts.find((x) => x.id === post.id);
        assert.equal(mine.encouragedCount, 2);
        assert.equal(theirs.encouragedCount, null);
        assert.equal(guest.encouragedCount, null);
      });
    });

    describe('private media', () => {
      let held, heldPostId;
      it('issues a one-time upload link, checks the real file, strips location data, and keeps the account id out of the path', async () => {
        held = await upload('ama', JPEG);
        assert.equal(held.ticket.status, 200);
        assert.match(held.path, /^m\/[0-9a-f-]{36}\.jpg$/);
        assert.ok(!held.path.includes(users.ama));
        const c = await held.commit();
        assert.equal(c.status, 200, c.text);
        const stored = Buffer.from(
          await (
            await fetch(
              `http://127.0.0.1:${PLATFORM_PORT}/__test/file/community-media/${held.path}`,
            )
          ).arrayBuffer(),
        ).toString('latin1');
        assert.ok(
          !stored.includes('GPS') &&
            !stored.includes('Exif') &&
            !stored.includes('secret-location'),
          'metadata was removed from the stored file',
        );
        assert.ok(stored.length > 10);
      });
      it('holds the post for review: invisible to guests and others, visible to its author through a short-lived signed link', async () => {
        const r = await call(
          'post',
          {
            type: 'photo',
            body: 'My journey',
            media: [{ kind: 'photo', role: 'single', path: held.path }],
            confirmed: true,
          },
          tok('ama'),
        );
        assert.equal(r.body.status, 'held', r.text);
        heldPostId = r.body.id;
        assert.ok(!(await call('feed', {}, null)).text.includes(heldPostId));
        assert.ok(!(await call('feed', {}, tok('kofi'))).text.includes(heldPostId));
        const own = (await call('feed', {}, tok('ama'))).body.posts.find(
          (x) => x.id === heldPostId,
        );
        assert.equal(own.status, 'held');
        const uri = own.media[0].uri;
        assert.ok(!uri.includes(users.ama), 'the link carries no account id');
        assert.equal((await fetch(uri)).status, 200, 'the signed link works');
        const tampered = new URL(uri);
        tampered.searchParams.set('token', tampered.searchParams.get('token').slice(0, -3) + 'abc');
        assert.equal((await fetch(tampered)).status, 400, 'a tampered link is refused');
        assert.equal((await fetch(uri.split('?')[0])).status, 400, 'no link, no file');
        assert.equal(
          (
            await fetch(
              `http://127.0.0.1:${PLATFORM_PORT}/storage/v1/object/community-media/${held.path}`,
            )
          ).status,
          400,
          'the bucket is private to anonymous callers',
        );
        await clock(11 * 60);
        assert.equal((await fetch(uri)).status, 400, 'an expired link is refused');
        await clock(0);
      });
      it('refuses a file that is not what it claims, removes it, and cannot attach it', async () => {
        const bad = await upload('kofi', enc('<html><script>alert(1)</script></html>'));
        const c = await bad.commit();
        assert.equal(c.status, 422);
        assert.equal(c.body.code, 'wrong_type');
        assert.ok(!(await files()).includes(`community-media/${bad.path}`), 'the file is deleted');
        const post = await call(
          'post',
          {
            type: 'photo',
            body: '',
            media: [{ kind: 'photo', role: 'single', path: bad.path }],
            confirmed: true,
          },
          tok('kofi'),
        );
        assert.equal(post.status, 400);
      });
      it('does not let anyone commit or attach somebody else’s upload', async () => {
        const mine = await upload('efua', JPEG);
        assert.equal(
          (await call('upload/commit', { path: mine.path }, tok('kofi'))).body.code,
          'not_found',
        );
        assert.equal((await mine.commit()).status, 200);
        const steal = await call(
          'post',
          {
            type: 'photo',
            body: '',
            media: [{ kind: 'photo', role: 'single', path: mine.path }],
            confirmed: true,
          },
          tok('kofi'),
        );
        assert.equal(steal.status, 400);
        const own = await call(
          'post',
          {
            type: 'photo',
            body: '',
            media: [{ kind: 'photo', role: 'single', path: mine.path }],
            confirmed: true,
          },
          tok('efua'),
        );
        assert.equal(own.status, 200);
      });
      it('keeps video off', async () => {
        const t = await call('upload/ticket', { kind: 'video', mime: 'video/mp4' }, tok('ama'));
        assert.equal(t.status, 503);
        assert.equal(t.body.code, 'video_disabled');
      });
    });

    describe('moderation permissions and second factor', () => {
      it('refuses ordinary members, staff without a second factor, non-staff with one, forged and expired tokens', async () => {
        assert.equal((await call('mod/queue', {}, tok('ama'))).status, 403);
        assert.equal((await call('mod/queue', {}, tok('mod1', { aal: 'aal1' }))).status, 403);
        assert.equal((await call('mod/queue', {}, tok('plain', { aal: 'aal2' }))).status, 403);
        assert.equal(
          (await call('mod/queue', {}, mint(users.mod1, { aal: 'aal2', secret: 'wrong-secret' })))
            .status,
          401,
        );
        assert.equal(
          (await call('mod/queue', {}, tok('mod1', { aal: 'aal2', exp: 1 }))).status,
          401,
        );
        assert.equal((await call('mod/queue', {}, null)).status, 401);
        for (const r of ['mod/act', 'mod/restrict', 'mod/mode', 'mod/backlog'])
          assert.equal(
            (await call(r, {}, tok('plain', { aal: 'aal2' }))).status,
            r === 'mod/act' || r === 'mod/restrict' || r === 'mod/mode' ? 400 : 403,
            r,
          );
        assert.equal(
          (await call('mod/mode', { mode: 'read_only' }, tok('plain', { aal: 'aal2' }))).status,
          403,
        );
        assert.equal(
          (
            await call(
              'mod/act',
              { type: 'post', targetId: heldId(), action: 'approve' },
              tok('ama'),
            )
          ).status,
          403,
        );
      });
      function heldId() {
        return '00000000-0000-4000-8000-000000000000';
      }
      it('shows a moderator the queue with usernames and signed media only, and nothing that identifies an account', async () => {
        const q = await call('mod/queue', {}, tok('mod1', { aal: 'aal2' }));
        assert.equal(q.status, 200, q.text);
        const item = q.body.items.find((x) => x.media.length > 0 && x.author === 'ama_moves');
        assert.ok(item, 'the held photo is in the queue');
        assert.equal((await fetch(item.media[0].uri)).status, 200);
        for (const id of Object.values(users)) assert.ok(!q.text.includes(id), 'no account id');
        assert.ok(!q.text.includes('accounts.dancehall.invalid'), 'no synthetic address');
        const b = await call('mod/backlog', {}, tok('mod2', { aal: 'aal2' }));
        assert.ok(b.body.backlog.open >= 2 && b.body.backlog.media >= 2);
      });
      it('lets the primary approve and the backup remove, deletes removed files, and records both in the audit log', async () => {
        const q = (await call('mod/queue', {}, tok('mod1', { aal: 'aal2' }))).body.items;
        const first = q.find((x) => x.author === 'ama_moves' && x.media.length);
        const second = q.find((x) => x.author === 'efua_fit' && x.media.length);
        assert.equal(
          (
            await call(
              'mod/act',
              { type: 'post', targetId: first.id, action: 'approve', note: 'fine' },
              tok('mod1', { aal: 'aal2' }),
            )
          ).status,
          200,
        );
        const pub = (await call('feed', {}, null)).body.posts.find((x) => x.id === first.id);
        assert.ok(
          pub && pub.media.length === 1 && (await fetch(pub.media[0].uri)).status === 200,
          'approved media is now public',
        );
        const before = (await files()).length;
        assert.equal(
          (
            await call(
              'mod/act',
              { type: 'post', targetId: second.id, action: 'remove', note: 'not suitable' },
              tok('mod2', { aal: 'aal2' }),
            )
          ).status,
          200,
        );
        assert.equal(
          (await files()).length,
          before - 1,
          'the removed post’s file was deleted from storage',
        );
        assert.ok(!(await call('feed', {}, tok('efua'))).text.includes(second.id));
        const audit = (
          await db.query(
            "select actor, action from public.audit_log where action like 'community.%' order by id",
          )
        ).rows.map(
          (r) =>
            `${r.actor === users.mod1 ? 'mod1' : r.actor === users.mod2 ? 'mod2' : '?'}:${r.action}`,
        );
        assert.ok(
          audit.includes('mod1:community.approve') && audit.includes('mod2:community.remove'),
        );
        const rows = (await db.query('select detail::text as d from public.audit_log')).rows
          .map((r) => r.d)
          .join(' ');
        assert.ok(
          !/not suitable|fine|First class/.test(rows),
          'the audit log holds no notes or content',
        );
      });
    });

    describe('abuse restrictions', () => {
      it('mutes, suspends and releases a member, with the moderator’s second factor required', async () => {
        const mod = tok('mod1', { aal: 'aal2' });
        assert.equal(
          (
            await call(
              'mod/restrict',
              { username: 'kofi_moves', restriction: 'muted', hours: 24, reason: 'spam' },
              tok('mod1', { aal: 'aal1' }),
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(
              'mod/restrict',
              { username: 'kofi_moves', restriction: 'muted', hours: 24, reason: 'spam' },
              mod,
            )
          ).status,
          200,
        );
        assert.equal(
          (await call('post', { type: 'text', body: 'hello again', confirmed: true }, tok('kofi')))
            .body.code,
          'muted',
        );
        assert.equal(
          (await call('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, tok('kofi'))).body
            .code,
          'muted',
        );
        assert.equal((await call('profile', {}, tok('kofi'))).body.restriction, 'muted');
        assert.equal(
          (
            await call(
              'mod/restrict',
              {
                username: 'kofi_moves',
                restriction: 'suspended',
                reason: 'harassment',
                note: 'repeated abuse',
              },
              mod,
            )
          ).status,
          200,
        );
        const any = (await call('feed', {}, null)).body.posts[0];
        assert.equal(
          (await call('encourage', { postId: any.id, on: true }, tok('kofi'))).body.code,
          'suspended',
        );
        assert.equal(
          (await call('mod/restrict', { username: 'kofi_moves', restriction: 'none' }, mod)).status,
          200,
        );
        assert.equal(
          (
            await call(
              'post',
              { type: 'text', body: 'back with kind words', confirmed: true },
              tok('kofi'),
            )
          ).body.status,
          'published',
        );
      });
      it('limits posts per day and requests per minute, and treats a repeat report quietly', async () => {
        const results = [];
        for (let i = 0; i < 7; i++)
          results.push(
            (
              await call(
                'post',
                { type: 'text', body: `daily post ${i}`, confirmed: true },
                tok('yaw'),
              )
            ).status,
          );
        assert.deepEqual(results.slice(0, 5), [200, 200, 200, 200, 200]);
        assert.deepEqual(results.slice(5), [429, 429]);
        const net = { headers: { 'cf-connecting-ip': '203.0.113.77' } };
        let limited = 0;
        for (let i = 0; i < 100; i++)
          if ((await call('feed', {}, null, net)).status === 429) limited++;
        assert.ok(limited >= 8, `a guest hammering the feed is limited (${limited})`);
        assert.equal(
          (await call('feed', {}, null, { headers: { 'cf-connecting-ip': '203.0.113.78' } }))
            .status,
          200,
          'another network is unaffected',
        );
        const target = (await call('feed', {}, tok('efua'))).body.posts.find(
          (x) => x.author === 'yaw_beats',
        );
        const a = await call(
          'report',
          { type: 'post', targetId: target.id, reason: 'spam' },
          tok('efua'),
        );
        const b = await call(
          'report',
          { type: 'post', targetId: target.id, reason: 'spam' },
          tok('efua'),
        );
        assert.deepEqual([a.status, b.status, a.text, b.text], [200, 200, b.text, a.text]);
        assert.equal(
          (await call('report', { type: 'post', targetId: target.id, reason: 'spam' }, tok('yaw')))
            .body.code,
          'own_content',
        );
      });
      it('keeps blocks mutual and silent', async () => {
        assert.equal((await call('block', { username: 'efua_fit' }, tok('yaw'))).status, 200);
        assert.ok(!(await call('feed', {}, tok('efua'))).text.includes('yaw_beats'));
        assert.ok(!(await call('feed', {}, tok('yaw'))).text.includes('efua_fit'));
        assert.deepEqual((await call('blocked', {}, tok('efua'))).body.usernames, []);
        assert.deepEqual((await call('blocked', {}, tok('yaw'))).body.usernames, ['efua_fit']);
      });
    });

    describe('Read only, for Community alone', () => {
      it('a moderator can switch to Read only: reading, reporting and deleting continue, new posts stop, and it can be reopened', async () => {
        const mod = tok('mod2', { aal: 'aal2' });
        assert.equal(
          (await call('mod/mode', { mode: 'read_only', note: 'busy week' }, mod)).status,
          200,
        );
        assert.equal((await call('status', {}, null)).body.mode, 'read_only');
        assert.equal(
          (await call('post', { type: 'text', body: 'nope', confirmed: true }, tok('ama'))).body
            .code,
          'paused',
        );
        const post = (await call('feed', {}, null)).body.posts[0];
        assert.equal(
          (await call('comment', { postId: post.id, body: 'nope' }, tok('ama'))).body.code,
          'paused',
        );
        assert.equal((await call('feed', {}, null)).status, 200);
        assert.equal((await call('mod/mode', { mode: 'text_only' }, mod)).status, 200);
        assert.equal(
          (await call('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, tok('ama'))).body
            .code,
          'media_paused',
        );
        assert.equal(
          (
            await call(
              'post',
              { type: 'text', body: 'text still fine', confirmed: true },
              tok('ama'),
            )
          ).status,
          200,
        );
        assert.equal((await call('mod/mode', { mode: 'open' }, mod)).status, 200);
        assert.equal((await call('status', {}, null)).body.mode, 'open');
      });
      it('a configuration floor makes Community read only with no database at all, and touches nothing else', async () => {
        await startFn(FLOOR_PORT, { COMMUNITY_FLOOR_MODE: 'read_only' });
        const before = (
          await (await fetch(`http://127.0.0.1:${PLATFORM_PORT}/__test/rpclog`)).json()
        ).length;
        await fetch(`http://127.0.0.1:${PLATFORM_PORT}/__test/rpc-down`, {
          method: 'POST',
          body: JSON.stringify({ down: true }),
        });
        const r = await call('post', { type: 'text', body: 'x', confirmed: true }, tok('ama'), {
          port: FLOOR_PORT,
        });
        assert.equal(r.body.code, 'paused');
        assert.equal(
          (
            await call('upload/ticket', { kind: 'photo', mime: 'image/jpeg' }, tok('ama'), {
              port: FLOOR_PORT,
            })
          ).body.code,
          'paused',
        );
        const feed = await call('feed', {}, null, { port: FLOOR_PORT });
        assert.equal(feed.status, 500);
        assert.ok(
          !/database|unavailable/i.test(feed.text),
          'a database failure is reported generically',
        );
        await fetch(`http://127.0.0.1:${PLATFORM_PORT}/__test/rpc-down`, {
          method: 'POST',
          body: JSON.stringify({ down: false }),
        });
        const after = (
          await (await fetch(`http://127.0.0.1:${PLATFORM_PORT}/__test/rpclog`)).json()
        ).length;
        assert.equal(after, before, 'the refused writes never reached the database');
        // The normal instance (the rest of the product’s server side) is untouched by the floor.
        assert.equal(
          (
            await call(
              'post',
              { type: 'text', body: 'normal instance still posts', confirmed: true },
              tok('ama'),
            )
          ).status,
          200,
        );
      });
    });

    describe('urgent email alerts', () => {
      it('send nothing by default, even for an urgent report', async () => {
        const post = (await call('feed', {}, tok('efua'))).body.posts.find(
          (x) => x.author === 'ama_moves',
        );
        assert.equal(
          (
            await call(
              'report',
              { type: 'post', targetId: post.id, reason: 'self_harm' },
              tok('efua'),
            )
          ).status,
          200,
        );
        assert.deepEqual(await mail(), []);
        assert.equal(
          (await call('maintenance/alerts', {}, null, { headers: { 'x-maintenance-key': MAINT } }))
            .body.alertsEnabled,
          false,
        );
      });
      it('when configured, email the moderator and backup with counts only, throttled, and a reminder from the scheduled job', async () => {
        await startFn(ALERT_PORT, {
          COMMUNITY_ALERTS: '1',
          COMMUNITY_ALERT_RECIPIENTS: 'moderator@example.test, backup@example.test',
          COMMUNITY_ALERT_FROM: 'alerts@example.test',
          COMMUNITY_ALERT_API_URL: `http://127.0.0.1:${PLATFORM_PORT}/mail/send`,
          COMMUNITY_ALERT_API_KEY: 'test-mail-key',
          COMMUNITY_CONSOLE_URL: 'https://admin.example.test/moderation',
        });
        const posts = (await call('feed', {}, tok('kofi'))).body.posts.filter(
          (x) => x.author !== 'kofi_moves',
        );
        const a = posts.find((x) => x.author === 'yaw_beats');
        const b = posts.find((x) => x.author === 'ama_moves' && x.status === 'published');
        assert.equal(
          (
            await call(
              'report',
              { type: 'post', targetId: a.id, reason: 'child_safety' },
              tok('kofi'),
              { port: ALERT_PORT },
            )
          ).status,
          200,
        );
        let m = await mail();
        assert.equal(m.length, 1);
        assert.deepEqual(m[0].to, ['moderator@example.test', 'backup@example.test']);
        assert.match(m[0].text, /Urgent items waiting/);
        assert.ok(
          !/ama_|yaw_|kofi_|efua_|First class|daily post/.test(m[0].subject + m[0].text),
          'no member names or content',
        );
        assert.ok(!m[0].text.includes(a.id));
        assert.equal(
          (
            await call(
              'report',
              { type: 'post', targetId: b.id, reason: 'self_harm' },
              tok('kofi'),
              {
                port: ALERT_PORT,
              },
            )
          ).status,
          200,
        );
        assert.equal(
          (await mail()).length,
          1,
          'a second urgent report inside the window sends no second email',
        );
        assert.equal(
          (await call('maintenance/alerts', {}, null, { port: ALERT_PORT })).status,
          403,
          'the scheduled job needs its key',
        );
        const r = await call('maintenance/alerts', {}, null, {
          port: ALERT_PORT,
          headers: { 'x-maintenance-key': MAINT },
        });
        assert.equal(r.body.sent, true, r.text);
        assert.equal((await mail()).length, 2);
        assert.equal(
          (
            await call('maintenance/alerts', {}, null, {
              port: ALERT_PORT,
              headers: { 'x-maintenance-key': MAINT },
            })
          ).body.sent,
          false,
          'reminders are throttled',
        );
      });
    });

    describe('deletion and privacy', () => {
      it('leaving Community removes the member’s posts, name and files, but not the account', async () => {
        await call('username/claim', { username: 'temp_dancer' }, tok('temp'));
        const up = await upload('temp', JPEG);
        await up.commit();
        await call(
          'post',
          {
            type: 'photo',
            body: 'x',
            media: [{ kind: 'photo', role: 'single', path: up.path }],
            confirmed: true,
          },
          tok('temp'),
        );
        assert.ok((await files()).includes(`community-media/${up.path}`));
        assert.equal((await call('leave', {}, tok('temp'))).status, 200);
        assert.ok(
          !(await files()).includes(`community-media/${up.path}`),
          'the file is deleted from storage',
        );
        assert.equal(
          (
            await db.query(
              'select count(*)::int n from public.community_members where user_id = $1',
              [users.temp],
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (await db.query('select count(*)::int n from auth.users where id = $1', [users.temp]))
            .rows[0].n,
          1,
          'the account stays',
        );
      });
      it('deleting an account by any route leaves no file behind once maintenance runs', async () => {
        await call('username/claim', { username: 'temp_again' }, tok('temp'));
        const up = await upload('temp', JPEG);
        await up.commit();
        await call(
          'post',
          {
            type: 'photo',
            body: 'x',
            media: [{ kind: 'photo', role: 'single', path: up.path }],
            confirmed: true,
          },
          tok('temp'),
        );
        await db.query('delete from auth.users where id = $1', [users.temp]); // as the account-deletion job would
        assert.ok(
          (await files()).includes(`community-media/${up.path}`),
          'the file is orphaned until maintenance',
        );
        assert.equal(
          (await call('maintenance/prune', {}, null, { headers: { 'x-maintenance-key': 'wrong' } }))
            .status,
          403,
        );
        assert.equal(
          (await call('maintenance/prune', {}, null, { headers: { 'x-maintenance-key': MAINT } }))
            .status,
          200,
        );
        assert.ok(
          !(await files()).includes(`community-media/${up.path}`),
          'maintenance removed it',
        );
        assert.equal(
          (await db.query("select count(*)::int n from public.community_posts where body = 'x'"))
            .rows[0].n,
          0,
          'their posts went with the account',
        );
      });
      it('never put an account id, a synthetic sign-in address or a raw column name in any response', () => {
        const all = seen.join('\n');
        for (const [name, id] of Object.entries(users))
          assert.ok(!all.includes(id), `no account id for ${name}`);
        assert.ok(!all.includes('accounts.dancehall.invalid'));
        assert.ok(!/user_id|author_id|reporter_id/.test(all));
        assert.ok(
          !/service_role|SERVICE_ROLE|stand-in-server-credential/.test(all),
          'no key in any response',
        );
      });
    });
  },
);
