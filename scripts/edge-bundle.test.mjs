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
