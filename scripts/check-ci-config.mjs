// Verifies the cost and safety rules for GitHub Actions workflows (public repo, minimal compute).
import { readFileSync, readdirSync } from 'node:fs';

const dir = '.github/workflows';
const errors = [];
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
if (files.length === 0) errors.push('no workflows found');

// The ONE workflow allowed to run native iOS tooling: a manual, unsigned, secret-free compile check. Every other workflow keeps all restrictions.
const NATIVE_IOS_WORKFLOW = 'ios-native-build.yml';

for (const f of files) {
  const t = readFileSync(`${dir}/${f}`, 'utf8');
  const at = (m) => errors.push(`${f}: ${m}`);
  const native = f === NATIVE_IOS_WORKFLOW;
  if (native) {
    // Narrow exceptions, each pinned: a fixed macOS image, manual trigger only, signing disabled, nothing signed or uploaded.
    if (!/^\s+runs-on:\s*macos-26\s*$/m.test(t))
      at('native iOS workflow must run on the pinned macos-26 image');
    if (!/^\s+XCODE_APP:\s*\/Applications\/Xcode_\d+\.\d+(\.\d+)?\.app\s*$/m.test(t))
      at('native iOS workflow must pin an explicit Xcode version (XCODE_APP)');
    if (!/^on:\s*\n\s+workflow_dispatch:\s*$/m.test(t))
      at('native iOS workflow must be manual only (workflow_dispatch)');
    if (/^\s+(pull_request|push|schedule|workflow_run|release):/m.test(t))
      at('native iOS workflow must have no automatic trigger');
    if (!/CODE_SIGNING_ALLOWED=NO/.test(t)) at('native iOS workflow must disable code signing');
    if (
      /exportArchive|\barchive\b|altool|notarytool|transporter|security\s+(import|create-keychain)|\.p12|\.p8|\.mobileprovision|provisioning|testflight|app-store-connect/i.test(
        t.replace(/^\s*#.*$/gm, ''),
      )
    )
      at(
        'native iOS workflow must not sign, archive, export or upload (signing is a separate approval)',
      );
  }
  for (const m of t.matchAll(/runs-on:\s*(.+)/g)) {
    const v = m[1].trim();
    if (native && v === 'macos-26') continue;
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
  const nativeTools = native
    ? /eas build|gradlew|fastlane/i
    : /eas build|expo prebuild|xcodebuild|gradlew|fastlane/i;
  if (nativeTools.test(t)) at('must not build iOS/Android binaries in CI');
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
