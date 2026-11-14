// Verifies the cost and safety rules for GitHub Actions workflows (public repo, minimal compute).
import { readFileSync, readdirSync } from 'node:fs';

const dir = '.github/workflows';
const errors = [];
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
if (files.length === 0) errors.push('no workflows found');

for (const f of files) {
  const t = readFileSync(`${dir}/${f}`, 'utf8');
  const at = (m) => errors.push(`${f}: ${m}`);
  for (const m of t.matchAll(/runs-on:\s*(.+)/g)) {
    const v = m[1].trim();
    if (v !== 'ubuntu-latest' && !/^ubuntu-2\d\.04$/.test(v) && !/^ubuntu-24\.04$/.test(v))
      at(
        `runner "${v}" is not a standard Ubuntu runner (macOS, Windows and larger runners cost more)`,
      );
  }
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(t))
    at('must declare top-level least-privilege permissions (contents: read)');
  if (!/concurrency:/.test(t) || !/cancel-in-progress:\s*true/.test(t))
    at('must cancel superseded runs (concurrency + cancel-in-progress)');
  if (/^\s*schedule:/m.test(t))
    at('scheduled workflows are not allowed without a documented requirement');
  if (/timeout-minutes:/.test(t) === false) at('jobs must set timeout-minutes');
  if (/eas build|expo prebuild|xcodebuild|gradlew|fastlane/i.test(t))
    at('must not build iOS/Android binaries in CI');
  if (/ANTHROPIC|OPENAI|REVENUECAT|STRIPE|SERVICE_ROLE|secrets\./i.test(t))
    at('must not use paid external services or secrets');
  if (/pull_request_target/.test(t)) at('pull_request_target is not allowed');
  if (/^\s+push:\s*\n(?:\s+.*\n)*?\s+branches:\s*\[?\s*['"]?\*\*/m.test(t))
    at('push must be limited to main to avoid duplicate runs with pull_request');
}
if (errors.length) {
  console.error('CI configuration check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`CI configuration check passed (${files.length} workflow file(s)).`);
