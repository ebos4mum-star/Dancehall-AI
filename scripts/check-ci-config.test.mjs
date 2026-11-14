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
