import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { GM_ROUTES, runChecks } from './gm-boundary-checks.mjs';

const KEY = 'sb_publishable_placeholder';
const serve = (handler) =>
  new Promise((resolve) => {
    const s = createServer((req, res) => {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => handler(req, res, b));
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
const reply = (res, status, body = {}) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

test('a function that refuses everyone who is not signed in passes the "after" probe', async () => {
  const { s, url } = await serve((req, res) =>
    req.method !== 'POST'
      ? reply(res, 405, { ok: false })
      : reply(res, 401, { ok: false, code: 'unauthenticated' }),
  );
  const r = await runChecks({ baseUrl: url, publishableKey: KEY, phase: 'after' });
  s.close();
  assert.equal(r.length, GM_ROUTES.length + 3);
  assert.ok(
    r.every((x) => x.ok),
    JSON.stringify(r.filter((x) => !x.ok)),
  );
});

test('a route that answers without a sign-in fails the "after" probe, and the error is reported, not hidden', async () => {
  const { s, url } = await serve((req, res) =>
    req.method !== 'POST'
      ? reply(res, 405)
      : req.url.endsWith('gm/league')
        ? reply(res, 200, { league: [] })
        : reply(res, 401),
  );
  const r = await runChecks({ baseUrl: url, publishableKey: KEY, phase: 'after' });
  s.close();
  const failed = r.filter((x) => !x.ok).map((x) => x.name);
  assert.deepEqual(failed, ['G1 gm/league refuses a caller who is not signed in']);
});

test('the "before" probe only records how the old function answers (routes may not exist yet) but still insists on POST-only and no leaked identifiers', async () => {
  const { s, url } = await serve((req, res) =>
    req.method !== 'POST' ? reply(res, 405) : reply(res, 404, { ok: false, code: 'not_found' }),
  );
  const r = await runChecks({ baseUrl: url, publishableKey: KEY, phase: 'before' });
  s.close();
  assert.ok(r.every((x) => x.ok));
});

test('a response that leaks the key or an internal identifier fails', async () => {
  const { s, url } = await serve((req, res) =>
    req.method !== 'POST' ? reply(res, 405) : reply(res, 401, { detail: `user_id leaked, ${KEY}` }),
  );
  const r = await runChecks({ baseUrl: url, publishableKey: KEY, phase: 'after' });
  s.close();
  assert.equal(r.find((x) => x.name.startsWith('G4')).ok, false);
});

test('an unreachable server fails the "after" probe (status 0 is never a pass)', async () => {
  const r = await runChecks({ baseUrl: 'http://127.0.0.1:1', publishableKey: KEY, phase: 'after' });
  assert.ok(r.some((x) => !x.ok));
});
