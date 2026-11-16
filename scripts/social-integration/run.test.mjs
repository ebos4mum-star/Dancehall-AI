// End-to-end test of the Friends and Group Goals server path on ONE machine, with nothing hosted:
//   phone-like HTTP client -> the REAL `social` Edge Function under a REAL Deno runtime -> supabase-js -> a local stand-in for Supabase Auth and REST ->
//   a REAL Postgres with the REAL migrations, community.up.sql and social.up.sql (every call runs as the service_role database role).
// Notably it does NOT start the community function at all: Friends must work with the public Community feed switched off.
// Run:  pnpm test:social-integration     (needs Postgres and Deno: set DENO_BIN or put `deno` on PATH; otherwise the test skips and says why.)
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { buildBundle } from '../edge-bundle.mjs';
import { pgOptions, signJwt, startPlatform } from '../community-integration/platform.mjs';

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

const DB = 'dh_social_e2e';
// Throwaway values for a stand-in on this machine only (built at run time so no secret-looking literal sits in the repository).
const JWT_SECRET = ['stand-in', 'jwt', 'signing', 'value'].join('-');
const SERVICE_KEY = ['stand-in', 'server', 'credential'].join('-');
const PLATFORM_PORT = 54911;
const FN_PORT = 54912;
const sh = (args) =>
  execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

describe(
  'Friends and Group Goals end to end (real Deno, real SQL, local platform stand-in)',
  { skip: skip ?? false },
  () => {
    let platform, db, bundle, proc;
    const users = {};
    const seen = [];
    const url = (route) => `http://127.0.0.1:${FN_PORT}/social/${route}`;
    const mint = (
      sub,
      { aal = 'aal1', exp = Math.floor(Date.now() / 1000) + 3600, secret = JWT_SECRET } = {},
    ) => signJwt({ sub, role: 'authenticated', aal, exp }, secret);
    const tok = (n, o) => mint(users[n], o);
    const call = async (route, body = {}, token = null) => {
      const r = await fetch(url(route), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      seen.push(text);
      let json = {};
      try {
        json = JSON.parse(text);
      } catch {
        /* not json */
      }
      return { status: r.status, body: json, text };
    };
    const as = (n) => (route, body) => call(route, body, tok(n));

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
        sh(['-d', DB, '-f', 'supabase/proposed/social.up.sql']);
        sh(['-d', DB, '-f', 'supabase/proposed/health_sync.up.sql']);
        sh(['-d', DB, '-f', 'supabase/proposed/gamification.up.sql']);
        db = new pg.Client(pgOptions(DB));
        await db.connect();
        for (const n of ['ama', 'kofi', 'efua', 'yaw', 'plain']) {
          const r = await db.query(
            'insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id',
            [`${n}@accounts.dancehall.invalid`],
          );
          users[n] = r.rows[0].id;
        }
        platform = await startPlatform({
          port: PLATFORM_PORT,
          database: DB,
          jwtSecret: JWT_SECRET,
          serviceKey: SERVICE_KEY,
        });
        bundle = join(mkdtempSync(join(tmpdir(), 'social-e2e-')), 'b');
        buildBundle(bundle, 'social');
        proc = spawn(DENO, ['run', '--allow-net', '--allow-env', 'index.ts'], {
          cwd: bundle,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            DENO_DIR: process.env.DENO_DIR ?? '',
            NO_COLOR: '1',
            SOCIAL_DEBUG: '1',
            DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FN_PORT}`,
            SUPABASE_URL: `http://127.0.0.1:${PLATFORM_PORT}`,
            SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let log = '';
        proc.stdout.on('data', (d) => (log += d));
        proc.stderr.on('data', (d) => {
          log += d;
          if (process.env.E2E_DEBUG) console.error('FN', String(d).trim().slice(0, 300));
        });
        for (let i = 0; i < 150; i++) {
          try {
            if ((await fetch(url('overview'), { method: 'POST', body: '{}' })).status) return;
          } catch {
            /* not up yet */
          }
          if (proc.exitCode !== null) throw new Error(`the function exited: ${log.slice(-800)}`);
          await new Promise((r) => setTimeout(r, 200));
        }
        throw new Error(`the function did not start: ${log.slice(-800)}`);
      },
      { timeout: 240000 },
    );
    after(async () => {
      proc?.kill();
      await platform?.close();
      await db?.end();
      sh(['-d', 'postgres', '-c', `drop database if exists ${DB}`]);
    });

    describe('the function itself', () => {
      it('answers only POST with JSON, bounds the body, and refuses everyone without a valid token', async () => {
        assert.equal((await fetch(url('overview'))).status, 405);
        assert.equal(
          (await fetch(url('overview'), { method: 'POST', body: '{not json' })).status,
          400,
        );
        assert.equal(
          (
            await fetch(url('overview'), { method: 'POST', body: 'x'.repeat(20000) }).catch(() => ({
              status: 413,
            }))
          ).status,
          413,
        );
        assert.equal((await call('no/such/route', {}, tok('ama'))).status, 404);
        assert.equal((await call('overview', {}, null)).status, 401);
        assert.equal((await call('overview', {}, 'garbage')).status, 401);
        assert.equal(
          (await call('overview', {}, mint(users.ama, { secret: 'a-different-secret' }))).status,
          401,
        );
        assert.equal((await call('overview', {}, tok('ama', { exp: 1 }))).status, 401);
      });
    });

    describe('names, requests and acceptance (with the Community feed not running at all)', () => {
      it('needs a public name first, then claims one through the social route', async () => {
        assert.equal(
          (await as('ama')('friend/request', { username: 'kofi_moves' })).body.code,
          'needs_username',
        );
        assert.equal(
          (await as('plain')('username/claim', { username: 'admin' })).body.code,
          'invalid_username',
        );
        for (const [n, name] of [
          ['ama', 'ama_dances'],
          ['kofi', 'kofi_moves'],
          ['efua', 'efua_fit'],
          ['yaw', 'yaw_beats'],
        ])
          assert.equal((await as(n)('username/claim', { username: name })).status, 200);
        assert.equal(
          (await as('ama')('username/claim', { username: 'another_name' })).body.code,
          'already_set',
        );
        assert.equal((await as('ama')('overview')).body.overview.username, 'ama_dances');
      });
      it('request, withdraw, ask again, accept; both sides see the friendship and nothing else', async () => {
        assert.equal(
          (await as('ama')('friend/request', { username: 'ama_dances' })).body.code,
          'self',
        );
        assert.equal(
          (await as('ama')('friend/request', { username: 'kofi_moves' })).body.status,
          'requested',
        );
        assert.equal(
          (await as('ama')('friend/request', { username: 'kofi_moves' })).body.code,
          'already_requested',
        );
        assert.deepEqual((await as('kofi')('overview')).body.overview.incoming, ['ama_dances']);
        assert.equal(
          (await as('ama')('friend/respond', { username: 'kofi_moves', accept: true })).body.code,
          'no_request',
        ); // only the person asked can accept
        assert.equal((await as('ama')('friend/cancel', { username: 'kofi_moves' })).status, 200);
        assert.deepEqual((await as('kofi')('overview')).body.overview.incoming, []);
        await as('ama')('friend/request', { username: 'kofi_moves' });
        assert.equal(
          (await as('kofi')('friend/respond', { username: 'ama_dances', accept: true })).status,
          200,
        );
        assert.deepEqual((await as('ama')('overview')).body.overview.friends, ['kofi_moves']);
        assert.deepEqual((await as('kofi')('overview')).body.overview.friends, ['ama_dances']);
        assert.deepEqual((await as('efua')('overview')).body.overview.friends, []);
      });
    });

    describe('private data stays private; only a consented weekly summary is shared', () => {
      it('shares nothing by default, never food, weight or health, and shares the summary only after consent, one way, revocably', async () => {
        // Private records that must never appear in any response.
        await db
          .query('insert into public.weight_entries (user_id, weight_kg) values ($1, 71.37)', [
            users.ama,
          ])
          .catch(() => {});
        const cols = (
          await db.query(
            "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'workout_sessions'",
          )
        ).rows.length;
        assert.ok(cols > 5);
        await db.query(
          "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values ($1, 'Dancehall Basics', 30, 'completed', now() - interval '1 day', 1800), ($1, 'Afrobeats', 20, 'completed', now() - interval '2 days', 1200)",
          [users.ama],
        );
        assert.equal(
          (await as('kofi')('friend/view', { username: 'ama_dances' })).body.activity,
          null,
        );
        for (const bad of [
          'food',
          'food_diary',
          'weight',
          'weight_entries',
          'health',
          'photo',
          'location',
          'meals',
        ]) {
          const r = await as('ama')('share/set', {
            username: 'kofi_moves',
            category: bad,
            on: true,
          });
          assert.equal(r.status, 400, bad);
          assert.equal(r.body.code, 'invalid_category');
        }
        assert.equal(
          (
            await as('ama')('share/set', {
              username: 'efua_fit',
              category: 'activity_summary',
              on: true,
            })
          ).body.code,
          'not_friends',
        );
        assert.equal(
          (
            await as('ama')('share/set', {
              username: 'kofi_moves',
              category: 'activity_summary',
              on: true,
            })
          ).status,
          200,
        );
        assert.deepEqual((await as('ama')('share/get', { username: 'kofi_moves' })).body.shares, [
          'activity_summary',
        ]);
        const v = await as('kofi')('friend/view', { username: 'ama_dances' });
        assert.deepEqual(v.body, {
          ok: true,
          username: 'ama_dances',
          activity: { sessions: 2, minutes: 50, activeDays: 2 },
        });
        assert.doesNotMatch(v.text, /71|weight|kcal|food/i);
        assert.equal(
          (await as('ama')('friend/view', { username: 'kofi_moves' })).body.activity,
          null,
        ); // one way
        assert.equal(
          (await as('efua')('friend/view', { username: 'ama_dances' })).body.code,
          'not_friends',
        ); // a stranger sees nothing
        await as('ama')('share/revoke-all');
        assert.equal(
          (await as('kofi')('friend/view', { username: 'ama_dances' })).body.activity,
          null,
        ); // withdrawal is immediate
      });
    });

    describe('blocking and removal', () => {
      it('a block is indistinguishable from an unknown name, severs everything, and hides both sides', async () => {
        await as('ama')('share/set', {
          username: 'kofi_moves',
          category: 'activity_summary',
          on: true,
        });
        assert.equal((await as('kofi')('block', { username: 'ama_dances' })).status, 200);
        assert.deepEqual((await as('ama')('overview')).body.overview.friends, []);
        assert.deepEqual((await as('kofi')('overview')).body.overview.blocked, ['ama_dances']);
        const blocked = await as('ama')('friend/request', { username: 'kofi_moves' });
        const unknown = await as('ama')('friend/request', { username: 'no_such_person' });
        assert.equal(blocked.status, 404);
        assert.deepEqual(
          [blocked.body.code, blocked.body.message],
          [unknown.body.code, unknown.body.message],
        );
        assert.equal(
          (await as('ama')('friend/view', { username: 'kofi_moves' })).body.code,
          'not_friends',
        );
        assert.equal(
          (await db.query('select count(*)::int n from public.social_shares')).rows[0].n,
          0,
        );
        await as('kofi')('unblock', { username: 'ama_dances' });
        await as('ama')('friend/request', { username: 'kofi_moves' });
        await as('kofi')('friend/respond', { username: 'ama_dances', accept: true });
        assert.equal((await as('ama')('friend/remove', { username: 'kofi_moves' })).status, 200);
        assert.equal(
          (await as('ama')('friend/remove', { username: 'kofi_moves' })).body.code,
          'not_friends',
        );
        await as('ama')('friend/request', { username: 'kofi_moves' });
        await as('kofi')('friend/respond', { username: 'ama_dances', accept: true });
      });
    });

    describe('groups', () => {
      let gid;
      it('only friends can be invited; invitees see only the invitation; numbers come from the server; strangers are refused', async () => {
        const body = {
          kind: 'challenge',
          title: 'June moves',
          metric: 'active_minutes',
          startDay: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
          endDay: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
          invite: ['efua_fit'],
        };
        assert.equal((await as('ama')('group/create', body)).body.code, 'not_friends');
        const made = await as('ama')('group/create', { ...body, invite: ['kofi_moves'] });
        assert.equal(made.status, 200);
        gid = made.body.id;
        const inv = (await as('kofi')('overview')).body.overview.groups[0];
        assert.deepEqual([inv.iAm, inv.byMember], ['invited', []]);
        assert.equal((await as('kofi')('group/sync', { groupId: gid })).body.code, 'not_member');
        assert.equal((await as('efua')('group/sync', { groupId: gid })).body.code, 'not_member');
        assert.equal((await as('efua')('group/leave', { groupId: gid })).status, 404);
        assert.equal(
          (await as('kofi')('group/respond', { groupId: gid, accept: true })).status,
          200,
        );
        assert.equal((await as('ama')('group/sync', { groupId: gid })).body.days, 2);
        await db.query(
          "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values ($1, 'Kofi class', 40, 'completed', now() - interval '1 day', 2400)",
          [users.kofi],
        );
        await as('kofi')('group/sync', { groupId: gid });
        const g = (await as('kofi')('overview')).body.overview.groups[0];
        assert.deepEqual(
          g.byMember.map((m) => [m.username, m.total]),
          [
            ['ama_dances', 50],
            ['kofi_moves', 40],
          ],
        );
        assert.equal((await as('efua')('overview')).body.overview.groups.length, 0);
      });
      it("leaving removes the person's numbers and visibility", async () => {
        assert.equal((await as('kofi')('group/leave', { groupId: gid })).status, 200);
        assert.equal(
          (
            await db.query(
              'select count(*)::int n from public.social_contributions where user_id = $1',
              [users.kofi],
            )
          ).rows[0].n,
          0,
        );
        assert.equal((await as('kofi')('overview')).body.overview.groups.length, 0);
      });
    });

    describe('gamification is decided by the server, once', () => {
      it('refuses guests, ignores any XP the client sends, and never pays the same record twice', async () => {
        assert.equal((await call('gm/sync', {}, null)).status, 401);
        assert.equal((await call('gm/league', {}, null)).status, 401);
        await db.query(
          "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values ($1, 'GM walk', 30, 'completed', now() - interval '3 hours', 1800)",
          [users.efua],
        );
        const first = await as('efua')('gm/sync', {
          xp: 99999,
          totalXp: 99999,
          events: [{ id: 'workout:fake', kind: 'workout', day: '2026-01-01', xp: 100 }],
          prefs: { targetDaysPerWeek: 3, restWeekdays: [0] },
        });
        assert.equal(first.status, 200, JSON.stringify(first.body));
        assert.ok(
          first.body.totalXp > 0 && first.body.totalXp < 500,
          `total ${first.body.totalXp}`,
        );
        const again = await as('efua')('gm/sync', { prefs: { targetDaysPerWeek: 3 } });
        const third = await as('efua')('gm/sync', {});
        assert.equal(again.body.totalXp, first.body.totalXp);
        assert.equal(third.body.totalXp, first.body.totalXp);
        const rows = (
          await db.query(
            "select count(*)::int n from public.gm_ledger where user_id = $1 and event_id = 'workout:fake'",
            [users.efua],
          )
        ).rows[0].n;
        assert.equal(rows, 0);
        assert.equal((await as('efua')('gm/state')).body.state.totalXp, first.body.totalXp);
      });
      it('an Apple Health workout that repeats an in-app session is rewarded once, and importing the same id twice is refused by the database', async () => {
        const before = (await as('yaw')('gm/sync', {})).body.totalXp;
        await db.query(
          "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values ($1, 'In app', 30, 'completed', now() - interval '2 hours', 1800)",
          [users.yaw],
        );
        await db.query(
          "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id) values ($1, 'Apple Health: Dance', 31, 'completed', now() - interval '119 minutes', 1860, 'apple_health', 'hk-yaw-1')",
          [users.yaw],
        );
        const one = (await as('yaw')('gm/sync', {})).body.totalXp;
        await assert.rejects(
          db.query(
            "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id) values ($1, 'Apple Health: Dance', 31, 'completed', now() - interval '5 hours', 1860, 'apple_health', 'hk-yaw-1')",
            [users.yaw],
          ),
        );
        assert.equal((await as('yaw')('gm/sync', {})).body.totalXp, one);
        const w = (
          await db.query(
            "select count(*)::int n from public.gm_ledger where user_id = $1 and kind = 'workout'",
            [users.yaw],
          )
        ).rows[0].n;
        assert.equal(w, 1, 'one workout event for two overlapping records');
        assert.ok(one > before);
      });
      it('the league needs both people to opt in and a friendship, and shows only a name and a number', async () => {
        await as('ama')('friend/request', { username: 'yaw_beats' });
        await as('yaw')('friend/respond', { username: 'ama_dances', accept: true });
        assert.deepEqual((await as('yaw')('gm/league')).body.league, []);
        assert.equal((await as('yaw')('gm/league/optin', { on: true })).status, 200);
        assert.equal((await as('yaw')('gm/league')).body.league.length, 1);
        await as('ama')('gm/sync', {});
        await as('ama')('gm/league/optin', { on: true });
        const lg = (await as('yaw')('gm/league')).body.league;
        assert.deepEqual(lg.map((r) => r.username).sort(), ['ama_dances', 'yaw_beats']);
        for (const r of lg) assert.deepEqual(Object.keys(r).sort(), ['isMe', 'username', 'weekXp']);
        assert.equal((await as('efua')('gm/league')).body.league.length, 0);
        await as('yaw')('block', { username: 'ama_dances' });
        assert.equal((await as('yaw')('gm/league')).body.league.length, 1);
        assert.equal((await as('ama')('gm/league')).body.league.length, 1);
      });
    });

    describe('one physical workout counts once (Group Goals, XP and the league), in either order', () => {
      let gid;
      const total = async (uid) =>
        Number(
          (
            await db.query(
              'select coalesce(sum(value), 0)::int n from public.social_contributions where group_id = $1 and user_id = $2',
              [gid, uid],
            )
          ).rows[0].n,
        );
      const workoutEvents = async (uid, ids) =>
        (
          await db.query(
            "select count(*)::int n from public.gm_ledger where user_id = $1 and kind = 'workout' and event_id = any($2)",
            [uid, ids.map((i) => `workout:${i}`)],
          )
        ).rows[0].n;
      it('an Apple Health import first, then the guided session of the same workout: stored twice, added once to the group, paid once', async () => {
        await as('efua')('friend/request', { username: 'yaw_beats' });
        await as('yaw')('friend/respond', { username: 'efua_fit', accept: true });
        const made = await as('efua')('group/create', {
          kind: 'challenge',
          title: 'Same session',
          metric: 'active_minutes',
          startDay: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
          endDay: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
          invite: ['yaw_beats'],
        });
        assert.equal(made.status, 200, JSON.stringify(made.body));
        gid = made.body.id;
        await as('yaw')('group/respond', { groupId: gid, accept: true });
        await as('efua')('group/sync', { groupId: gid });
        const base = await total(users.efua); // whatever efua already did (the earlier gamification test left one 30-minute walk)
        const hk = (
          await db.query(
            "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id) values ($1, 'Apple Health: Dance', 31, 'completed', now() - interval '26 hours' + interval '1 minute', 1860, 'apple_health', 'hk-ef-dup') returning id",
            [users.efua],
          )
        ).rows[0].id;
        await as('efua')('group/sync', { groupId: gid });
        assert.equal(await total(users.efua), base + 31, 'the import alone counts');
        const guided = (
          await db.query(
            "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s) values ($1, 'Guided class', 30, 'completed', now() - interval '26 hours', 1800) returning id",
            [users.efua],
          )
        ).rows[0].id;
        await as('efua')('group/sync', { groupId: gid });
        assert.equal(
          await total(users.efua),
          base + 30,
          'now the same workout is not added twice (30, not 61)',
        );
        await as('efua')('gm/sync', {});
        assert.equal(
          await workoutEvents(users.efua, [guided, hk]),
          1,
          'XP is paid for one of the two records',
        );
        assert.equal(await workoutEvents(users.efua, [guided]), 1, 'and it is the in-app record');
      });
      it('a legitimate separate workout the same day still counts; an edit separates the records; a deletion lets the import count again', async () => {
        const before = await total(users.efua);
        await db.query(
          "insert into public.workout_sessions (user_id, title, minutes, status, completed_at, duration_s, source, external_id) values ($1, 'Apple Health: Run', 20, 'completed', now() - interval '20 hours', 1200, 'apple_health', 'hk-ef-run')",
          [users.efua],
        );
        await as('efua')('group/sync', { groupId: gid });
        assert.equal(await total(users.efua), before + 20, 'a separate workout counts');
        // Edit the guided session to the evening of the previous day: it no longer overlaps the import, so both count.
        await db.query(
          "update public.workout_sessions set completed_at = now() - interval '40 hours' where user_id = $1 and title = 'Guided class'",
          [users.efua],
        );
        await as('efua')('group/sync', { groupId: gid });
        assert.equal(
          await total(users.efua),
          before + 20 + 31,
          'after the edit the import is a separate workout (30 + 31 + 20 on top of the base)',
        );
        // Move it back, then delete it: the import counts alone.
        await db.query(
          "update public.workout_sessions set completed_at = now() - interval '26 hours' where user_id = $1 and title = 'Guided class'",
          [users.efua],
        );
        await db.query(
          "delete from public.workout_sessions where user_id = $1 and title = 'Guided class'",
          [users.efua],
        );
        await as('efua')('group/sync', { groupId: gid });
        assert.equal(
          await total(users.efua),
          before + 20 + 31 - 30,
          'after the deletion the import counts alone',
        );
        const view = await as('yaw')('friend/view', { username: 'efua_fit' });
        assert.ok([200, 403].includes(view.status)); // not shared: nothing about efua's activity is shown
        assert.equal(view.body.activity ?? null, null);
      });
      it('leaves nothing behind for the deletion test that follows', async () => {
        await db.query('delete from public.social_groups where id = $1', [gid]);
        assert.equal((await as('efua')('friend/remove', { username: 'yaw_beats' })).status, 200);
      });
    });

    describe('limits, isolation and deletion', () => {
      it('rate limits a member who is going too fast, without affecting another member', async () => {
        const results = await Promise.all(
          Array.from({ length: 60 }, () => as('yaw')('friend/cancel', { username: 'ama_dances' })),
        );
        assert.ok(
          results.some((r) => r.status === 429),
          'some requests were limited',
        );
        assert.ok(
          results.every((r) => r.status === 404 || r.status === 429),
          'never a server error',
        );
        assert.equal((await as('efua')('overview')).status, 200);
      });
      it('a body that names another account changes nothing: identity is the token', async () => {
        const r = await as('efua')('friend/remove', {
          username: 'ama_dances',
          user: users.ama,
          p_user: users.kofi,
          actor: users.kofi,
        });
        assert.equal(r.body.code, 'not_friends');
        assert.deepEqual((await as('ama')('overview')).body.overview.friends, ['kofi_moves']);
      });
      it('deleting an account removes its friendships, shares, groups and numbers', async () => {
        await as('ama')('share/set', {
          username: 'kofi_moves',
          category: 'activity_summary',
          on: true,
        });
        await db.query('delete from auth.users where id = $1', [users.ama]);
        assert.deepEqual((await as('kofi')('overview')).body.overview.friends, []);
        for (const t of [
          'social_friendships',
          'social_shares',
          'social_groups',
          'social_group_members',
          'social_contributions',
        ]) {
          assert.equal((await db.query(`select count(*)::int n from public.${t}`)).rows[0].n, 0, t);
        }
      });
    });

    describe('what every response contained', () => {
      it('no internal user id, email or private value appears anywhere in any response', () => {
        const all = seen.join('\n');
        for (const [n, id] of Object.entries(users)) {
          assert.ok(!all.includes(id), `no id of ${n}`);
          assert.ok(!all.includes(`${n}@accounts`), `no email of ${n}`);
        }
        // A UUID may appear only as a group `id`.
        const stray = [...all.matchAll(new RegExp(`"(\\w+)":"(${UUID.source})"`, 'gi'))].filter(
          (m) => m[1] !== 'id',
        );
        assert.deepEqual(stray, []);
        assert.doesNotMatch(all, /71\.37/);
      });
    });
  },
);
