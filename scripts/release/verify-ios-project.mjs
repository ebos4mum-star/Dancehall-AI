// Verifies the GENERATED iOS project (expo prebuild output, never committed) before it is signed: identity, version, deployment
// target, HealthKit entitlement and usage text, privacy manifest, permissions. Usage:
//   node scripts/release/verify-ios-project.mjs <apps/mobile/ios> --version 0.1.0 --build 7
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlist } from './plist.mjs';

export const EXPECT = {
  bundleId: 'com.dancehallfit.app',
  minDeploymentTarget: 16.4,
  privacyApis: [
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
    },
  ],
};

export function verifyProject(iosDir, { version, build }) {
  const errors = [];
  const fail = (m) => errors.push(m);
  const proj = readdirSync(iosDir).find((n) => n.endsWith('.xcodeproj'));
  if (!proj) return ['no .xcodeproj in the generated project'];
  const name = proj.replace(/\.xcodeproj$/, '');
  const dir = join(iosDir, name);
  const pbx = readFileSync(join(iosDir, proj, 'project.pbxproj'), 'utf8');

  const ids = [
    ...new Set([...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";\s]+)"?;/g)].map((m) => m[1])),
  ];
  if (ids.length !== 1 || ids[0] !== EXPECT.bundleId)
    fail(`bundle identifier must be ${EXPECT.bundleId}, found ${ids.join(', ') || 'none'}`);
  const targets = [
    ...new Set(
      [...pbx.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+);/g)].map((m) => Number(m[1])),
    ),
  ];
  if (!targets.length || Math.min(...targets) < EXPECT.minDeploymentTarget)
    fail(
      `iOS deployment target must be ${EXPECT.minDeploymentTarget} or newer, found ${targets.join(', ')}`,
    );

  const info = parsePlist(readFileSync(join(dir, 'Info.plist'), 'utf8'));
  if (info.CFBundleShortVersionString !== version)
    fail(`CFBundleShortVersionString must be ${version}, found ${info.CFBundleShortVersionString}`);
  if (build !== undefined && String(info.CFBundleVersion) !== String(build))
    fail(`CFBundleVersion must be ${build}, found ${info.CFBundleVersion}`);
  if (info.ITSAppUsesNonExemptEncryption !== false)
    fail('ITSAppUsesNonExemptEncryption must be false');
  if (!info.NSHealthShareUsageDescription)
    fail('NSHealthShareUsageDescription (read-only Health text) is missing');
  if (
    !/never reads calories, heart rate or location, and never writes/.test(
      info.NSHealthShareUsageDescription ?? '',
    )
  )
    fail('the Health usage text is not the approved read-only text');
  if ('NSHealthUpdateUsageDescription' in info)
    fail('NSHealthUpdateUsageDescription must not exist (no write access to Health)');
  if ('UIBackgroundModes' in info)
    fail('UIBackgroundModes must not exist (no background delivery)');
  if ('NSMicrophoneUsageDescription' in info) fail('the app must not request the microphone');
  for (const k of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription'])
    if (!info[k]) fail(`${k} is missing`);

  const ent = readdirSync(dir).find((n) => n.endsWith('.entitlements'));
  if (!ent) fail('no entitlements file: the HealthKit capability is missing');
  else {
    const e = parsePlist(readFileSync(join(dir, ent), 'utf8'));
    const keys = Object.keys(e);
    if (keys.length !== 1 || e['com.apple.developer.healthkit'] !== true)
      fail(
        `entitlements must be exactly com.apple.developer.healthkit = true, found ${keys.join(', ') || 'none'}`,
      );
  }

  const pm = join(dir, 'PrivacyInfo.xcprivacy');
  if (!existsSync(pm)) fail('PrivacyInfo.xcprivacy is missing from the app target folder');
  else {
    const m = parsePlist(readFileSync(pm, 'utf8'));
    if (JSON.stringify(m.NSPrivacyAccessedAPITypes) !== JSON.stringify(EXPECT.privacyApis))
      fail(
        'privacy manifest API declarations differ from the approved declaration (UserDefaults CA92.1 only)',
      );
    if (m.NSPrivacyTracking !== false) fail('NSPrivacyTracking must be false');
    if ((m.NSPrivacyCollectedDataTypes ?? []).length !== 0)
      fail('no collected data types may be declared');
    if ((m.NSPrivacyTrackingDomains ?? []).length !== 0)
      fail('no tracking domains may be declared');
    if (!/PrivacyInfo\.xcprivacy in Resources/.test(pbx))
      fail('PrivacyInfo.xcprivacy is not part of the app target resources');
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const opt = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  const errors = verifyProject(a[0], { version: opt('--version'), build: opt('--build') });
  if (errors.length) {
    console.error(
      'Generated iOS project check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'),
    );
    process.exit(1);
  }
  console.log(
    `Generated iOS project OK: ${EXPECT.bundleId}, version ${opt('--version')}${opt('--build') ? ` (${opt('--build')})` : ''}, HealthKit entitlement only, privacy manifest present, read-only Health text.`,
  );
}
