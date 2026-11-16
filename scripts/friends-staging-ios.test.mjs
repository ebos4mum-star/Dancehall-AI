import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGING = 'bxhnrjulksganzydgrgm';
const DEV = 'vvwjhbsyxetnktimgaxg';
const run = (body) => {
  const f = join(mkdtempSync(join(tmpdir(), 'fs-')), 'env');
  writeFileSync(f, body);
  return spawnSync('bash', ['scripts/friends-staging-ios.sh'], {
    env: { ...process.env, FRIENDS_ENV_FILE: f, DRY_RUN: '1' },
    encoding: 'utf8',
  });
};
const good = `EXPO_PUBLIC_SUPABASE_URL=https://${STAGING}.supabase.co\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_placeholder\n`;

test('the local Friends launcher accepts only the staging project with a publishable key', () => {
  const ok = run(good);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /Friends ON for this local run/);
  for (const [name, body, code] of [
    ['development project', good.replace(STAGING, DEV), 3],
    ['some other project', good.replace(STAGING, 'abcdefghijklmnopqrst'), 3],
    ['http url', good.replace('https', 'http'), 3],
    [
      'development ref in the key',
      good + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_${DEV}\n`,
      3,
    ],
    ['secret key', good.replace('sb_publishable_placeholder', 'sb_secret_abc'), 4],
    ['service-role jwt', good.replace('sb_publishable_placeholder', 'eyJ_service_role_abc'), 4],
    ['empty key', good.replace('sb_publishable_placeholder', ''), 4],
  ]) {
    const r = run(body);
    assert.equal(r.status, code, `${name}: ${r.stderr}`);
  }
  assert.equal(
    spawnSync('bash', ['scripts/friends-staging-ios.sh'], {
      env: { ...process.env, FRIENDS_ENV_FILE: '/nonexistent' },
      encoding: 'utf8',
    }).status,
    2,
  );
});

test('the launcher never builds for upload and never sets a production environment', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('scripts/friends-staging-ios.sh', 'utf8');
  assert.match(src, /EXPO_PUBLIC_APP_ENV=preview/);
  assert.doesNotMatch(
    src,
    /eas build|eas submit|testflight|EXPO_PUBLIC_APP_ENV=production/i.source
      ? /eas (build|submit)|EXPO_PUBLIC_APP_ENV=production/i
      : /x/,
  );
  assert.match(src, /expo run:ios/);
});
