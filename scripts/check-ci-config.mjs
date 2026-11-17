// Verifies the cost and safety rules for GitHub Actions workflows (public repo, minimal compute).
import { readFileSync, readdirSync } from 'node:fs';

const dir = '.github/workflows';
const errors = [];
const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
if (files.length === 0) errors.push('no workflows found');

// The ONE workflow allowed to run native iOS tooling: a manual, unsigned, secret-free compile check. Every other workflow keeps all restrictions.
const NATIVE_IOS_WORKFLOW = 'ios-native-build.yml';

// The two release workflows (GitHub Actions -> Xcode -> App Store Connect -> TestFlight; EAS is not used). Each is manual only, pinned, and
// may reference ONLY the named secrets and variables, and only after its protected `environment:` line. The BUILD workflow can never upload;
// the UPLOAD workflow validates by default and uploads only when dry_run is explicitly false. Both are separate approvals.
const RELEASE = {
  'ios-testflight-build.yml': {
    environment: 'testflight-build',
    phrase: 'BUILD-SIGNED-IPA',
    secrets: [
      'IOS_DISTRIBUTION_CERT_P12_BASE64',
      'IOS_DISTRIBUTION_CERT_PASSWORD',
      'IOS_APPSTORE_PROFILE_BASE64',
      'RELEASE_ARTIFACT_PASSPHRASE',
    ],
    vars: ['APPLE_TEAM_ID', 'STAGING_SUPABASE_URL', 'STAGING_SUPABASE_PUBLISHABLE_KEY'],
    forbidden:
      /altool|notarytool|iTMSTransporter|\bTransporter\b|fastlane|\bpilot\b|upload-app|validate-app|ASC_API|eas\s+(build|submit)|gradlew/i,
  },
  'ios-testflight-upload.yml': {
    environment: 'testflight-upload',
    phrase: 'UPLOAD-TO-TESTFLIGHT',
    secrets: ['RELEASE_ARTIFACT_PASSPHRASE', 'ASC_API_KEY_P8'],
    vars: ['ASC_API_KEY_ID', 'ASC_API_ISSUER_ID', 'STAGING_SUPABASE_URL'],
    forbidden: /fastlane|\bpilot\b|eas\s+(build|submit)|gradlew|expo prebuild|pod install|archive/i,
  },
};

for (const f of files) {
  const t = readFileSync(`${dir}/${f}`, 'utf8');
  const at = (m) => errors.push(`${f}: ${m}`);
  const native = f === NATIVE_IOS_WORKFLOW;
  const rel = RELEASE[f];
  if (rel) {
    const code = t.replace(/^\s*#.*$/gm, '');
    if (!/^\s+runs-on:\s*macos-26\s*$/m.test(t))
      at('release workflow must run its signing job on the pinned macos-26 image');
    if (!/^\s+XCODE_APP:\s*\/Applications\/Xcode_\d+\.\d+(\.\d+)?\.app\s*$/m.test(t))
      at('release workflow must pin an explicit Xcode version (XCODE_APP)');
    if (!/^on:\s*\n\s+workflow_dispatch:/m.test(t))
      at('release workflow must be manual only (workflow_dispatch)');
    if (
      /^\s+(pull_request|push|schedule|workflow_run|release|repository_dispatch|workflow_call):/m.test(
        code,
      )
    )
      at('release workflow must have no automatic trigger');
    if (!new RegExp(`^\\s+environment:\\s*${rel.environment}\\s*$`, 'm').test(code))
      at(`release workflow must use the protected environment "${rel.environment}"`);
    if (!code.includes(rel.phrase))
      at(`release workflow must require the confirmation phrase ${rel.phrase}`);
    if (rel.forbidden.test(code))
      at('release workflow contains a command that is not allowed in this workflow');
    const envAt = code.search(new RegExp(`environment:\\s*${rel.environment}`));
    for (const m of code.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)) {
      if (!rel.secrets.includes(m[1])) at(`secret ${m[1]} is not on this workflow's allow-list`);
      if (envAt < 0 || m.index < envAt)
        at(`secret ${m[1]} is used before the protected environment is entered`);
    }
    for (const m of code.matchAll(/\$\{\{\s*vars\.([A-Za-z0-9_]+)\s*\}\}/g))
      if (!rel.vars.includes(m[1])) at(`variable ${m[1]} is not on this workflow's allow-list`);
    if (
      /\$\{\{\s*secrets\.(?!\w)/.test(code) ||
      /secrets\[/.test(code) ||
      /toJSON\(\s*secrets/i.test(code)
    )
      at('secrets must be referenced by name only');
    if (/PRODUCTION|SERVICE_ROLE|ANTHROPIC|OPENAI|REVENUECAT|STRIPE/i.test(code))
      at('release workflow must not mention production, service-role or paid-service credentials');
    if (/pull_request_target/.test(code)) at('pull_request_target is not allowed');
    if (f === 'ios-testflight-build.yml') {
      if (!/ref:\s*\$\{\{\s*inputs\.release_sha\s*\}\}/.test(code))
        at('the build must check out the explicit release_sha input');
      if (!/merge-base --is-ancestor/.test(code))
        at('the build must verify the commit is on the release branch');
      if (
        !/pnpm test\b/.test(code) ||
        !/release-env\.mjs/.test(code) ||
        !/verify-ios-project\.mjs/.test(code) ||
        !/verify-ipa\.sh/.test(code)
      )
        at(
          'the build must run release validation, the environment guard and the project and IPA checks',
        );
      if (!/exportArchive/.test(code)) at('the build must export the IPA');
    } else {
      if (!/default:\s*true/.test(code)) at('dry_run must default to true');
      const up =
        /- name: Upload to TestFlight[^\n]*\n\s+if:\s*\$\{\{\s*inputs\.dry_run == false\s*\}\}/.test(
          code,
        );
      if (!up) at('the upload step must run only when dry_run is explicitly false');
      const count = (code.match(/--upload-app/g) ?? []).length;
      if (count !== 1) at('the upload command must appear exactly once');
      if (!/shasum -a 256/.test(code)) at('the upload workflow must verify the IPA hash');
    }
  }
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
    if ((native || rel) && v === 'macos-26') continue;
    if (v !== 'ubuntu-latest' && !/^ubuntu-2\d\.04$/.test(v) && !/^ubuntu-24\.04$/.test(v))
      at(
        `runner "${v}" is not a standard Ubuntu runner (macOS, Windows and larger runners cost more)`,
      );
  }
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(t))
    at('must declare top-level least-privilege permissions (contents: read)');
  if (rel) {
    if (!/concurrency:/.test(t) || !/cancel-in-progress:\s*false/.test(t))
      at(
        'release workflows must queue, never cancel a running release job (cancel-in-progress: false)',
      );
    for (const m of t.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm))
      if (!/@[0-9a-f]{40}$/.test(m[1]))
        at(`action ${m[1]} must be pinned to a full commit SHA in a release workflow`);
  } else if (!/concurrency:/.test(t) || !/cancel-in-progress:\s*true/.test(t))
    at('must cancel superseded runs (concurrency + cancel-in-progress)');
  if (/^\s*schedule:/m.test(t))
    at('scheduled workflows are not allowed without a documented requirement');
  if (/timeout-minutes:/.test(t) === false) at('jobs must set timeout-minutes');
  const nativeTools =
    native || rel
      ? /eas build|eas submit|gradlew|fastlane/i
      : /eas build|eas submit|expo prebuild|xcodebuild|gradlew|fastlane/i;
  if (nativeTools.test(t.replace(/^\s*#.*$/gm, '')))
    at('must not build iOS/Android binaries in CI');
  if (!rel && /ANTHROPIC|OPENAI|REVENUECAT|STRIPE|SERVICE_ROLE|secrets\./i.test(t))
    at('must not use paid external services or secrets');
  if (/pull_request_target/.test(t)) at('pull_request_target is not allowed');
  // Linear scan (the earlier nested-quantifier pattern could backtrack catastrophically on long files).
  const lines = t.split('\n');
  const pushAt = lines.findIndex((l) => /^\s+push:\s*$/.test(l));
  if (pushAt >= 0) {
    const indent = lines[pushAt].match(/^\s*/)[0].length;
    for (let i = pushAt + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() && l.match(/^\s*/)[0].length <= indent) break;
      if (/^\s+branches:\s*\[?\s*['"]?\*\*/.test(l)) {
        at('push must be limited to main to avoid duplicate runs with pull_request');
        break;
      }
    }
  }
}
if (errors.length) {
  console.error('CI configuration check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`CI configuration check passed (${files.length} workflow file(s)).`);
