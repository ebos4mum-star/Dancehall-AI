import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from './secret-patterns.mjs';

// Fake values are assembled at runtime so this file never contains a literal that looks like a real credential.
const fake = (prefix, n, ch = 'a') => prefix + ch.repeat(n);

test('flags realistic secret shapes', () => {
  const cases = [
    ['private-key-block', '-----BEGIN ' + 'PRIVATE KEY-----'],
    ['anthropic-key', fake('sk-ant-', 30)],
    ['aws-access-key-id', 'AKIA' + 'ABCDEFGHIJKLMNOP'],
    ['github-token', fake('ghp_', 36)],
    ['stripe-secret-key', fake('sk_live_', 24)],
    ['supabase-secret-key', fake('sb_secret_', 24)],
    ['secret-assignment', 'SUPABASE_SERVICE_ROLE_KEY=' + 'a1b2c3d4e5f6g7h8i9j0k1l2'],
    ['jwt-like-token', 'eyJ' + 'a'.repeat(20) + '.eyJ' + 'b'.repeat(20) + '.' + 'c'.repeat(20)],
  ];
  for (const [rule, text] of cases) {
    const hits = scanText(text);
    assert.ok(
      hits.some((h) => h.rule === rule),
      `expected ${rule}`,
    );
  }
});

test('allows placeholders and empty values', () => {
  const ok = [
    'ANTHROPIC_API_KEY=',
    'SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here-please',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key',
    'const url = "https://example.supabase.co";',
  ];
  for (const t of ok) assert.deepEqual(scanText(t), [], t);
});

test('supports an explicit per-line allow marker', () => {
  assert.deepEqual(scanText(fake('ghp_', 36) + ' // secret-scan: allow'), []);
});

test('never returns matched values', () => {
  const hits = scanText(fake('sk-ant-', 30));
  for (const h of hits) assert.deepEqual(Object.keys(h).sort(), ['line', 'rule']);
});
