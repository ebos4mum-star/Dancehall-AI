// Guards the record of what is applied to the dedicated development project (supabase/hosted-history.json):
// applied migrations may never be edited, every record maps to exactly one repository file by name, and anything not applied is pending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hist = JSON.parse(readFileSync(join(root, 'supabase', 'hosted-history.json'), 'utf8'));
const files = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

test('applied migrations are unchanged since they were applied', () => {
  for (const a of hist.applied) {
    const sha = createHash('sha256')
      .update(readFileSync(join(root, 'supabase', 'migrations', a.file)))
      .digest('hex');
    assert.equal(
      sha,
      a.sha256,
      `${a.file} was edited after being applied; add a new migration instead`,
    );
  }
});
test('every hosted record maps to exactly one repository file by name, in the same order', () => {
  const names = files.map((f) => f.replace(/^\d+_/, '').replace(/\.sql$/, ''));
  for (const a of hist.applied) {
    assert.equal(names.filter((n) => n === a.name).length, 1, `${a.name} maps to one file`);
    assert.ok(files.includes(a.file), `${a.file} exists`);
  }
  const order = hist.applied.map((a) => files.indexOf(a.file));
  assert.deepEqual(
    order,
    [...order].sort((x, y) => x - y),
    'applied migrations keep their order',
  );
  const hv = hist.applied.map((a) => a.hostedVersion);
  assert.deepEqual(hv, [...hv].sort(), 'hosted versions are ascending');
});
test('pending is exactly the files that are not applied, and all sort after every applied file', () => {
  const applied = new Set(hist.applied.map((a) => a.file));
  assert.deepEqual(
    hist.pending,
    files.filter((f) => !applied.has(f)),
  );
  const lastApplied = Math.max(...hist.applied.map((a) => files.indexOf(a.file)));
  for (const p of hist.pending)
    assert.ok(files.indexOf(p) > lastApplied, `${p} sorts after the applied migrations`);
});
test('the record never contains credentials', () => {
  assert.doesNotMatch(JSON.stringify(hist), /sb_secret|service_role|password|eyJ/i);
});
