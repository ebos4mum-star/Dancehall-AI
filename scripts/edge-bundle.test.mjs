import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBundle } from './edge-bundle.mjs';

test('the account function bundles flat: every relative import resolves, npm imports are pinned, no secrets', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'edge-')), 'b');
  const report = buildBundle(out);
  const names = report.map((r) => r.name).sort();
  assert.deepEqual(names, [
    'account-core.ts',
    'account-rpc-db.ts',
    'index.ts',
    'security-questions.ts',
  ]);
  const idx = readFileSync(join(out, 'index.ts'), 'utf8');
  assert.match(idx, /from '\.\/account-core\.ts'/);
  assert.match(idx, /from '\.\/account-rpc-db\.ts'/);
  assert.doesNotMatch(idx, /_shared/);
  assert.match(idx, /npm:@supabase\/supabase-js@\d+\.\d+\.\d+/);
});

test('the community function bundles flat with only the files it reaches', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'edge-')), 'b');
  const names = buildBundle(out, 'community')
    .map((r) => r.name)
    .sort();
  assert.deepEqual(names, [
    'account-core.ts',
    'community-alerts.ts',
    'community-media.ts',
    'community-server.ts',
    'community.ts',
    'index.ts',
    'security-questions.ts',
  ]);
  const idx = readFileSync(join(out, 'index.ts'), 'utf8');
  assert.match(idx, /from '\.\/community-server\.ts'/);
  assert.doesNotMatch(idx, /_shared/);
  assert.match(idx, /Deno\.serve/);
  // Nothing from the account's recovery database layer is shipped with Community.
  assert.ok(!names.includes('account-rpc-db.ts'));
});

test('the social function bundles flat: only its own server layer, no Community routes, no account recovery code', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'edge-')), 'b');
  const names = buildBundle(out, 'social')
    .map((r) => r.name)
    .sort();
  assert.deepEqual(names, ['index.ts', 'social-server.ts']);
  const idx = readFileSync(join(out, 'index.ts'), 'utf8');
  assert.match(idx, /from '\.\/social-server\.ts'/);
  assert.doesNotMatch(idx, /_shared|community-server/);
  assert.match(idx, /Deno\.serve/);
  // It talks to the database only through its own allow-listed door.
  assert.match(idx, /admin\.rpc\('social_rpc'/);
  assert.doesNotMatch(idx, /community_rpc/);
});
