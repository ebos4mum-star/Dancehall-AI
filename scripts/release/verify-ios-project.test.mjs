import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePlist } from './plist.mjs';
import { verifyProject } from './verify-ios-project.mjs';

const HEALTH =
  'Locked In Fitness reads your workouts (type, start and length) from Apple Health when you turn on import, so they count toward your progress. It never reads calories, heart rate or location, and never writes to Health.';
const wrap = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>`;
const s = (k, v) => `<key>${k}</key><string>${v}</string>`;
function fixture(o = {}) {
  const d = mkdtempSync(join(tmpdir(), 'ios-'));
  mkdirSync(join(d, 'App.xcodeproj'));
  mkdirSync(join(d, 'App'));
  writeFileSync(
    join(d, 'App.xcodeproj/project.pbxproj'),
    `PRODUCT_BUNDLE_IDENTIFIER = ${o.bundle ?? 'com.dancehallfit.app'};\nIPHONEOS_DEPLOYMENT_TARGET = ${o.target ?? '16.4'};\n${o.noPrivacyRes ? '' : 'X /* PrivacyInfo.xcprivacy in Resources */ = {};'}`,
  );
  const info = [
    s('CFBundleShortVersionString', o.version ?? '0.1.0'),
    s('CFBundleVersion', o.build ?? '7'),
    '<key>ITSAppUsesNonExemptEncryption</key><false/>',
    s('NSHealthShareUsageDescription', o.health ?? HEALTH),
    s('NSCameraUsageDescription', 'c'),
    s('NSPhotoLibraryUsageDescription', 'p'),
    o.extraInfo ?? '',
  ].join('\n');
  writeFileSync(join(d, 'App/Info.plist'), wrap(info));
  if (!o.noEnt)
    writeFileSync(
      join(d, 'App/App.entitlements'),
      wrap(o.ent ?? '<key>com.apple.developer.healthkit</key><true/>'),
    );
  if (!o.noPrivacy)
    writeFileSync(
      join(d, 'App/PrivacyInfo.xcprivacy'),
      wrap(
        o.privacy ??
          '<key>NSPrivacyAccessedAPITypes</key><array><dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array></dict></array><key>NSPrivacyCollectedDataTypes</key><array/><key>NSPrivacyTracking</key><false/><key>NSPrivacyTrackingDomains</key><array/>',
      ),
    );
  return d;
}
const ok = { version: '0.1.0', build: '7' };

test('the parser reads dictionaries, arrays, booleans and strings', () => {
  const p = parsePlist(
    wrap(
      '<key>a</key><true/><key>b</key><array><string>x &amp; y</string></array><key>c</key><dict/>',
    ),
  );
  assert.deepEqual(p, { a: true, b: ['x & y'], c: {} });
});
test('a correct generated project passes', () =>
  assert.deepEqual(verifyProject(fixture(), ok), []));
test('wrong version, build number, bundle id and deployment target are caught', () => {
  assert.match(
    verifyProject(fixture({ version: '0.0.1' }), ok).join(),
    /CFBundleShortVersionString/,
  );
  assert.match(verifyProject(fixture({ build: '8' }), ok).join(), /CFBundleVersion/);
  assert.match(
    verifyProject(fixture({ bundle: 'com.example.other' }), ok).join(),
    /bundle identifier/,
  );
  assert.match(verifyProject(fixture({ target: '15.1' }), ok).join(), /deployment target/);
});
test('HealthKit entitlement must exist and be the only entitlement; Health must stay read-only', () => {
  assert.match(verifyProject(fixture({ noEnt: true }), ok).join(), /HealthKit/);
  assert.match(
    verifyProject(
      fixture({
        ent: '<key>com.apple.developer.healthkit</key><true/><key>aps-environment</key><string>production</string>',
      }),
      ok,
    ).join(),
    /exactly/,
  );
  assert.match(
    verifyProject(fixture({ extraInfo: s('NSHealthUpdateUsageDescription', 'w') }), ok).join(),
    /write access/,
  );
  assert.match(
    verifyProject(
      fixture({
        extraInfo: '<key>UIBackgroundModes</key><array><string>processing</string></array>',
      }),
      ok,
    ).join(),
    /UIBackgroundModes/,
  );
  assert.match(
    verifyProject(fixture({ health: 'Reads everything' }), ok).join(),
    /approved read-only text/,
  );
  assert.match(
    verifyProject(fixture({ extraInfo: s('NSMicrophoneUsageDescription', 'm') }), ok).join(),
    /microphone/,
  );
});
test('privacy manifest must exist, be in the target, declare only UserDefaults CA92.1, and no tracking or collected data', () => {
  assert.match(verifyProject(fixture({ noPrivacy: true }), ok).join(), /PrivacyInfo/);
  assert.match(
    verifyProject(fixture({ noPrivacyRes: true }), ok).join(),
    /not part of the app target/,
  );
  const wrong = (reason) =>
    `<key>NSPrivacyAccessedAPITypes</key><array><dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>${reason}</string></array></dict></array><key>NSPrivacyCollectedDataTypes</key><array/><key>NSPrivacyTracking</key><false/><key>NSPrivacyTrackingDomains</key><array/>`;
  assert.match(
    verifyProject(fixture({ privacy: wrong('1C8F.1') }), ok).join(),
    /approved declaration/,
  );
  assert.match(
    verifyProject(
      fixture({
        privacy: wrong('CA92.1').replace(
          '<key>NSPrivacyTracking</key><false/>',
          '<key>NSPrivacyTracking</key><true/>',
        ),
      }),
      ok,
    ).join(),
    /NSPrivacyTracking/,
  );
  assert.match(
    verifyProject(
      fixture({
        privacy: wrong('CA92.1').replace(
          '<key>NSPrivacyCollectedDataTypes</key><array/>',
          '<key>NSPrivacyCollectedDataTypes</key><array><dict/></array>',
        ),
      }),
      ok,
    ).join(),
    /collected data/,
  );
});
