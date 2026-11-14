// Keeps the owner-operated Dashboard scripts honest: generated from the repository migrations, containing the exact text, with the right checksums.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS, build, sha } from './make-owner-apply.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');
const readme = read('supabase', 'owner-apply', 'README.md');
const hist = JSON.parse(read('supabase', 'hosted-history.json'));

test('the owner scripts are current and contain the exact repository migration twice (run and record)', () => {
  for (const s of STEPS) {
    const file = `${String(s.n).padStart(2, '0')}_${s.name}.sql`;
    const script = read('supabase', 'owner-apply', file);
    assert.equal(script, build(s), `${file} is out of date: run node scripts/make-owner-apply.mjs`);
    const mig = read('supabase', 'migrations', s.file).trimEnd();
    assert.equal(script.split(mig).length - 1, 2, `${file} embeds the migration exactly twice`);
    assert.match(script, /^begin;$/m);
    assert.match(script, /^commit;$/m);
  }
});

test('the headers and the README carry the migration checksums', () => {
  for (const s of STEPS) {
    const h = sha(read('supabase', 'migrations', s.file));
    assert.ok(
      read('supabase', 'owner-apply', `${String(s.n).padStart(2, '0')}_${s.name}.sql`).includes(h),
    );
    assert.ok(readme.includes(h), `README lists the checksum of ${s.file}`);
    assert.ok(readme.includes(s.file));
  }
});

test('the steps are exactly the pending migrations, in file order, and each has a verification script', () => {
  const pending = hist.pending.filter((f) => f !== '20261207000100_habits.sql');
  assert.deepEqual(
    STEPS.map((s) => s.file),
    pending.filter((f) => STEPS.some((s) => s.file === f)),
  );
  const files = readdirSync(join(root, 'supabase', 'owner-apply'));
  for (const s of STEPS)
    assert.ok(files.includes(`verify_${String(s.n).padStart(2, '0')}_${s.name}.sql`));
  assert.ok(files.includes('verify_05_final.sql'));
  for (const f of files.filter((x) => x.startsWith('verify_'))) {
    const v = read('supabase', 'owner-apply', f);
    assert.match(v, /'ALL OK'/);
    assert.match(v, /Read-only/);
    assert.doesNotMatch(v, /\bdrop table\b|\btruncate\b|\binsert into\b|\bdelete from\b/i);
  }
});

test('the guards protect against the wrong project, a re-run and out-of-order application', () => {
  for (const s of STEPS) {
    const script = read('supabase', 'owner-apply', `${String(s.n).padStart(2, '0')}_${s.name}.sql`);
    assert.match(script, /Wrong project/);
    assert.match(script, /already recorded as applied/);
    assert.match(script, /Out of order/);
    assert.match(script, /20261114150446/);
  }
});

test('nothing in the owner pack contains credentials', () => {
  for (const f of readdirSync(join(root, 'supabase', 'owner-apply')))
    assert.doesNotMatch(
      read('supabase', 'owner-apply', f),
      /sb_secret|service_role_key|password\s*=|eyJ[A-Za-z0-9_-]{20,}/i,
    );
});
