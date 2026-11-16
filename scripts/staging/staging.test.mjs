import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIRM_PHRASE,
  DESIGNATED_STAGING_REF,
  DEVELOPMENT_REF,
  FORBIDDEN_REFS,
  assertStagingRef,
} from './guard.mjs';
import { buildBundle } from './prepare-bundle.mjs';

const NEW_REF = DESIGNATED_STAGING_REF;
const UNKNOWN_REF = 'abcdefghijklmnopqrst';

test('the guard allows only the designated staging project, and refuses development, unknown and malformed references', () => {
  assert.equal(DESIGNATED_STAGING_REF, 'bxhnrjulksganzydgrgm');
  assert.ok(!FORBIDDEN_REFS.includes(DESIGNATED_STAGING_REF));
  assert.throws(() => assertStagingRef(DEVELOPMENT_REF, CONFIRM_PHRASE), /DEVELOPMENT project/);
  assert.throws(
    () => assertStagingRef(UNKNOWN_REF, CONFIRM_PHRASE),
    /not the designated staging project/,
  );
  for (const r of [
    undefined,
    '',
    'short',
    'ABCDEFGHIJKLMNOPQRST',
    'abcdefghijklmnopqrst1',
    'abc-defghijklmnopqrs',
  ])
    assert.throws(() => assertStagingRef(r, CONFIRM_PHRASE), /20-letter/);
  assert.throws(() => assertStagingRef(NEW_REF, undefined), /STAGING_CONFIRM/);
  assert.throws(() => assertStagingRef(NEW_REF, 'yes'), /STAGING_CONFIRM/);
  assert.equal(assertStagingRef(NEW_REF, CONFIRM_PHRASE), NEW_REF);
});

test('the bundle refuses to build for the development project or any unknown reference', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'stg-')), 'b');
  assert.throws(
    () => buildBundle(out, { ref: DEVELOPMENT_REF, confirm: CONFIRM_PHRASE }),
    /DEVELOPMENT project/,
  );
  assert.throws(
    () => buildBundle(out, { ref: UNKNOWN_REF, confirm: CONFIRM_PHRASE }),
    /not the designated/,
  );
});

test('the bundle holds every repository migration then the three staging additions, in order, with a manifest', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'stg-')), 'b');
  const m = buildBundle(out, { ref: NEW_REF, confirm: CONFIRM_PHRASE });
  const files = readdirSync(join(out, 'supabase', 'migrations'));
  const repo = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
  assert.equal(files.length, repo.length + 3);
  assert.deepEqual(files, [...files].sort(), 'files are in apply order');
  assert.deepEqual(files.slice(-3), [
    '20261216000100_community.sql',
    '20261216000200_community_storage.sql',
    '20261216000300_account_deletion_purge.sql',
  ]);
  const manifest = JSON.parse(readFileSync(join(out, 'MANIFEST.json'), 'utf8'));
  assert.equal(manifest.projectRef, NEW_REF);
  assert.equal(manifest.files.length, m.length);
  assert.ok(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)));
  // The repository's own migrations folder is untouched (the staging files never appear there).
  assert.ok(!repo.includes('20261216000100_community.sql'));
});

test('no secret or hosted address is written into the bundle files', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'stg-')), 'b');
  buildBundle(out, { ref: NEW_REF, confirm: CONFIRM_PHRASE });
  const text = readdirSync(join(out, 'supabase', 'migrations'))
    .map((f) => readFileSync(join(out, 'supabase', 'migrations', f), 'utf8'))
    .join('\n');
  assert.ok(
    !/sb_secret_|eyJ[A-Za-z0-9_-]{20,}|vvwjhbsyxetnktimgaxg|bxhnrjulksganzydgrgm/.test(text),
  );
});

import { runChecks } from './check-access.mjs';

const fake = (rules) => async (url, init) => {
  const path = url.replace(/^https:\/\/[a-z]+\.supabase\.co/, '');
  const r = rules(path, init?.method ?? 'GET') ?? { status: 404, text: '{}' };
  return { status: r.status, text: async () => r.text ?? '{}' };
};

test('database checks pass when every boundary refuses the publishable key', async () => {
  const out = await runChecks({
    ref: NEW_REF,
    publishableKey: 'sb_publishable_x',
    phase: 'db',
    fetchImpl: fake(() => ({ status: 401 })),
  });
  assert.ok(out.length >= 10);
  assert.ok(out.every((c) => c.ok));
});

test('database checks fail loudly when the door or a table is reachable', async () => {
  const leaky = fake((p) =>
    p.includes('community_rpc') || p.includes('community_posts')
      ? { status: 200, text: '[]' }
      : { status: 401 },
  );
  const out = await runChecks({
    ref: NEW_REF,
    publishableKey: 'sb_publishable_x',
    phase: 'db',
    fetchImpl: leaky,
  });
  const failed = out.filter((c) => !c.ok).map((c) => c.name);
  assert.ok(
    failed.some((n) => n.startsWith('B1')) && failed.some((n) => n.includes('community_posts')),
  );
  const open = fake((p) => (p.includes('/auth/v1/signup') ? { status: 200 } : { status: 401 }));
  assert.ok(
    (await runChecks({ ref: NEW_REF, publishableKey: 'k', phase: 'db', fetchImpl: open })).some(
      (c) => c.name.startsWith('A3') && !c.ok,
    ),
  );
});

test('function checks pass for a Read-only function with comments and video off', async () => {
  const good = fake((p, m) => {
    if (m === 'GET') return { status: 405 };
    if (p.endsWith('/status'))
      return {
        status: 200,
        text: JSON.stringify({
          ok: true,
          mode: 'read_only',
          videoEnabled: false,
          commentsEnabled: false,
        }),
      };
    if (p.includes('maintenance')) return { status: 403 };
    return { status: 401 };
  });
  const out = await runChecks({
    ref: NEW_REF,
    publishableKey: 'sb_publishable_test',
    phase: 'function',
    fetchImpl: good,
  });
  assert.ok(
    out.every((c) => c.ok),
    JSON.stringify(out.filter((c) => !c.ok)),
  );
});

test('function checks fail if it starts open, serves members without a token, or comments are on', async () => {
  const bad = fake((p, m) =>
    m === 'GET'
      ? { status: 405 }
      : p.endsWith('/status')
        ? {
            status: 200,
            text: JSON.stringify({
              ok: true,
              mode: 'open',
              videoEnabled: true,
              commentsEnabled: true,
            }),
          }
        : p.includes('maintenance')
          ? { status: 403 }
          : { status: 200 },
  );
  const failed = (
    await runChecks({
      ref: NEW_REF,
      publishableKey: 'sb_publishable_test',
      phase: 'function',
      fetchImpl: bad,
    })
  )
    .filter((c) => !c.ok)
    .map((c) => c.name);
  for (const n of ['C1b', 'C1c', 'C1d', 'C2 post'])
    assert.ok(
      failed.some((f) => f.startsWith(n)),
      n,
    );
});

test('the checker never prints or returns the key and refuses secret keys at the command line', async () => {
  const out = await runChecks({
    ref: NEW_REF,
    publishableKey: 'sb_publishable_UNIQUE123',
    phase: 'db',
    fetchImpl: fake(() => ({ status: 401 })),
  });
  assert.ok(!JSON.stringify(out).includes('UNIQUE123'));
});
