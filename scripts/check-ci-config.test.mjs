import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve(import.meta.dirname, 'check-ci-config.mjs');
const GOOD = `name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - run: echo hi
`;
function run(content) {
  const d = mkdtempSync(join(tmpdir(), 'ci-'));
  mkdirSync(join(d, '.github/workflows'), { recursive: true });
  writeFileSync(join(d, '.github/workflows/ci.yml'), content);
  return spawnSync('node', [script], { cwd: d, encoding: 'utf8' });
}
test('accepts a compliant workflow', () => assert.equal(run(GOOD).status, 0));
test('rejects macOS runners', () =>
  assert.notEqual(run(GOOD.replace('ubuntu-latest', 'macos-latest')).status, 0));
test('rejects schedules', () =>
  assert.notEqual(
    run(GOOD.replace('pull_request:', 'schedule:\n    - cron: "0 * * * *"\n  pull_request:'))
      .status,
    0,
  ));
test('rejects missing concurrency cancel', () =>
  assert.notEqual(
    run(GOOD.replace('cancel-in-progress: true', 'cancel-in-progress: false')).status,
    0,
  ));
test('rejects secrets use', () =>
  assert.notEqual(run(GOOD.replace('echo hi', 'echo ${{ secrets.X }}')).status, 0));
test('rejects wildcard push triggers', () =>
  assert.notEqual(run(GOOD.replace('[main]', "['**']")).status, 0));

// The single approved native-iOS workflow: manual, pinned, unsigned, secret-free. Anything else stays forbidden.
const NATIVE = `name: iOS native build (unsigned)
on:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: x
  cancel-in-progress: true
env:
  XCODE_APP: /Applications/Xcode_26.6.app
jobs:
  b:
    runs-on: macos-26
    timeout-minutes: 60
    steps:
      - run: npx expo prebuild --platform ios --no-install
      - run: xcodebuild -scheme S CODE_SIGNING_ALLOWED=NO build
`;
function runNamed(name, content) {
  const d = mkdtempSync(join(tmpdir(), 'ci-'));
  mkdirSync(join(d, '.github/workflows'), { recursive: true });
  writeFileSync(join(d, '.github/workflows', name), content);
  return spawnSync('node', [script], { cwd: d, encoding: 'utf8' });
}
const N = 'ios-native-build.yml';
test('native: the approved workflow passes', () => assert.equal(runNamed(N, NATIVE).status, 0));
test('native: the same content under any other name is rejected', () =>
  assert.notEqual(runNamed('other.yml', NATIVE).status, 0));
test('native: macos-latest is rejected', () =>
  assert.notEqual(runNamed(N, NATIVE.replace('macos-26', 'macos-latest')).status, 0));
test('native: an unpinned Xcode is rejected', () =>
  assert.notEqual(runNamed(N, NATIVE.replace(/XCODE_APP:.*/, 'FOO: 1')).status, 0));
test('native: automatic triggers are rejected', () =>
  assert.notEqual(runNamed(N, NATIVE.replace('workflow_dispatch:', 'pull_request:')).status, 0));
test('native: signing must stay disabled', () =>
  assert.notEqual(runNamed(N, NATIVE.replace('CODE_SIGNING_ALLOWED=NO', '')).status, 0));
test('native: secrets are rejected', () =>
  assert.notEqual(runNamed(N, NATIVE + '      - run: echo ${{ secrets.P12 }}\n').status, 0));
test('native: archive, export and upload are rejected', () => {
  for (const bad of [
    'xcodebuild archive',
    'xcodebuild -exportArchive',
    'xcrun altool --upload-app',
    'fastlane pilot',
  ])
    assert.notEqual(runNamed(N, NATIVE + `      - run: ${bad}\n`).status, 0, bad);
});
test('native: eas build is still rejected', () =>
  assert.notEqual(runNamed(N, NATIVE + '      - run: eas build\n').status, 0));

// The two release workflows (build, then separately upload): the real files must pass, and each safety rule must bite.
import { readFileSync } from 'node:fs';
const wf = (n) => readFileSync(resolve(import.meta.dirname, '../.github/workflows', n), 'utf8');
const B = 'ios-testflight-build.yml';
const U = 'ios-testflight-upload.yml';
test('release: the real build and upload workflows pass', () => {
  assert.equal(runNamed(B, wf(B)).status, 0);
  assert.equal(runNamed(U, wf(U)).status, 0);
});
test('release: the same content under another name is judged by the strict generic rules', () => {
  assert.notEqual(runNamed('other.yml', wf(B)).status, 0);
});
test('release build: can never upload or touch App Store Connect', () => {
  for (const bad of [
    'xcrun altool --upload-app',
    'xcrun altool --validate-app',
    'xcrun iTMSTransporter',
    'fastlane pilot',
    'eas submit',
    'eas build',
    'echo ASC_API_KEY',
  ])
    assert.notEqual(runNamed(B, wf(B) + `      - run: ${bad}\n`).status, 0, bad);
});
test('release build: no automatic trigger, the environment, the phrase, the explicit commit and ancestry check are required', () => {
  const t = wf(B);
  assert.notEqual(
    runNamed(
      B,
      t.replace('workflow_dispatch:', 'push:\n    branches: [main]\n  workflow_dispatch:'),
    ).status,
    0,
  );
  assert.notEqual(
    runNamed(B, t.replace('environment: testflight-build', 'environment: other')).status,
    0,
  );
  assert.notEqual(runNamed(B, t.replaceAll('BUILD-SIGNED-IPA', 'GO')).status, 0);
  assert.notEqual(
    runNamed(B, t.replaceAll('ref: ${{ inputs.release_sha }}', 'ref: main')).status,
    0,
  );
  assert.notEqual(runNamed(B, t.replace('merge-base --is-ancestor', 'true')).status, 0);
  assert.notEqual(runNamed(B, t.replace('runs-on: macos-26', 'runs-on: macos-latest')).status, 0);
  assert.notEqual(runNamed(B, t.replace(/XCODE_APP:.*/, 'FOO: 1')).status, 0);
});
test('release: only allow-listed secrets and variables, only after the protected environment, never production or service-role', () => {
  const t = wf(B);
  assert.notEqual(
    runNamed(B, t.replace('RELEASE_ARTIFACT_PASSPHRASE', 'SOME_OTHER_SECRET')).status,
    0,
  );
  assert.notEqual(
    runNamed(B, t.replace('vars.APPLE_TEAM_ID', 'vars.PRODUCTION_SUPABASE_URL')).status,
    0,
  );
  assert.notEqual(
    runNamed(B, t + '      - run: echo ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}\n').status,
    0,
  );
  assert.notEqual(
    runNamed(
      B,
      t.replace(
        'jobs:',
        'jobs:\n  early:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - run: echo ${{ secrets.IOS_DISTRIBUTION_CERT_PASSWORD }}',
      ),
    ).status,
    0,
  );
});
test('release upload: dry run by default, upload only when dry_run is false, exactly once, hash checked, own environment and phrase', () => {
  const t = wf(U);
  assert.notEqual(runNamed(U, t.replace('default: true', 'default: false')).status, 0);
  assert.notEqual(
    runNamed(U, t.replace('if: ${{ inputs.dry_run == false }}', 'if: always()')).status,
    0,
  );
  assert.notEqual(runNamed(U, t + '      - run: xcrun altool --upload-app -f x.ipa\n').status, 0);
  assert.notEqual(runNamed(U, t.replace('shasum -a 256', 'true')).status, 0);
  assert.notEqual(
    runNamed(U, t.replace('environment: testflight-upload', 'environment: testflight-build'))
      .status,
    0,
  );
  assert.notEqual(runNamed(U, t.replaceAll('UPLOAD-TO-TESTFLIGHT', 'GO')).status, 0);
  assert.notEqual(
    runNamed(
      U,
      t.replace('workflow_dispatch:', 'schedule:\n    - cron: "0 * * * *"\n  workflow_dispatch:'),
    ).status,
    0,
  );
  assert.notEqual(runNamed(U, t.replace('ASC_API_KEY_P8', 'ASC_OTHER')).status, 0);
});
test('release: the build workflow holds no App Store Connect secrets and the upload workflow holds no signing certificate', () => {
  assert.doesNotMatch(wf(B), /ASC_API|altool|environment: testflight-upload/);
  assert.doesNotMatch(wf(U), /IOS_DISTRIBUTION_CERT|IOS_APPSTORE_PROFILE/);
});
test('release: actions are pinned to full commit SHAs and a running release job is never cancelled', () => {
  for (const [n, t] of [
    [B, wf(B)],
    [U, wf(U)],
  ]) {
    assert.notEqual(runNamed(n, t.replace(/@[0-9a-f]{40} # v4/, '@v4')).status, 0, `${n} unpinned`);
    assert.notEqual(
      runNamed(n, t.replace('cancel-in-progress: false', 'cancel-in-progress: true')).status,
      0,
      `${n} cancel`,
    );
  }
});
