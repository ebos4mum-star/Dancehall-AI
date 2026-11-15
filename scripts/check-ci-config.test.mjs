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
  XCODE_APP: /Applications/Xcode_16.4.app
jobs:
  b:
    runs-on: macos-15
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
  assert.notEqual(runNamed(N, NATIVE.replace('macos-15', 'macos-latest')).status, 0));
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
