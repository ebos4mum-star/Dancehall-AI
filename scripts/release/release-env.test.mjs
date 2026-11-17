import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ALLOWED_FLAGS,
  assertCleanEnv,
  assertPublishableKey,
  assertStagingUrl,
  resolveReleaseEnv,
} from './release-env.mjs';
import {
  DESIGNATED_STAGING_REF_SHA256,
  DEVELOPMENT_REF_SHA256,
  refDigest,
} from '../staging/guard.mjs';

const eas = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../apps/mobile/eas.json'), 'utf8'),
);
// Synthetic references with their own pins: the real project references are not in the public repository.
const STAGING = 'aaaaaaaaaaaaaaaaaaaa';
const DEV = 'bbbbbbbbbbbbbbbbbbbb';
const PINS = { staging: refDigest(STAGING), development: refDigest(DEV) };
const URL_OK = `https://${STAGING}.supabase.co`;
const KEY_OK = 'sb_publishable_abcdefghijklmnop1234';

test('accepts the designated staging project and a publishable key, with the approved flags only', () => {
  const out = resolveReleaseEnv({ eas, supabaseUrl: URL_OK, publishableKey: KEY_OK, pins: PINS });
  assert.equal(out.EXPO_PUBLIC_SUPABASE_URL, URL_OK);
  assert.equal(out.EXPO_PUBLIC_APP_ENV, 'preview');
  assert.equal(out.EXPO_PUBLIC_BARCODE_PROVIDER, 'off');
  assert.equal(out.EXPO_PUBLIC_APPLE_HEALTH, '1');
  for (const k of Object.keys(out))
    assert.ok(
      [
        ...ALLOWED_FLAGS,
        'EXPO_PUBLIC_SUPABASE_URL',
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      ].includes(k),
      k,
    );
  assert.ok(!Object.keys(out).some((k) => /AI_API_URL|FIXTURES/.test(k)));
});
test('refuses the development project, any other project, malformed and non-https URLs', () => {
  assert.throws(() => assertStagingUrl(`https://${DEV}.supabase.co`, PINS), /DEVELOPMENT/);
  assert.throws(
    () => assertStagingUrl(['https://abcdefghijklmnopqrst', 'supabase', 'co'].join('.'), PINS),
    /not the designated/,
  );
  assert.throws(() => assertStagingUrl('http://' + STAGING + '.supabase.co', PINS));
  assert.throws(() => assertStagingUrl(`${URL_OK}/rest/v1`, PINS));
  assert.throws(() => assertStagingUrl('https://placeholder.invalid', PINS));
  assert.throws(() => assertStagingUrl(undefined, PINS));
});
test('refuses secret, service-role, legacy and empty keys', () => {
  for (const bad of [
    ['sb', 'secret', 'abcdefghijklmnop1234'].join('_'),
    'eyJhbGciOi.service_role.x',
    '',
    undefined,
    'sb_publishable_short',
  ])
    assert.throws(() => assertPublishableKey(bad));
  assert.equal(assertPublishableKey(KEY_OK), KEY_OK);
});
test('refuses a profile that is not store distribution on staging, or that carries an AI gateway or fixtures', () => {
  const clone = () => JSON.parse(JSON.stringify(eas));
  const a = clone();
  a.build['staging-testflight'].distribution = 'internal';
  assert.throws(
    () => resolveReleaseEnv({ eas: a, supabaseUrl: URL_OK, publishableKey: KEY_OK, pins: PINS }),
    /store/,
  );
  const b = clone();
  b.build['staging-testflight'].environment = 'production';
  assert.throws(
    () => resolveReleaseEnv({ eas: b, supabaseUrl: URL_OK, publishableKey: KEY_OK, pins: PINS }),
    /staging/,
  );
  const c = clone();
  c.build['staging-testflight'].env.EXPO_PUBLIC_AI_API_URL = 'https://ai.example.test';
  assert.throws(
    () => resolveReleaseEnv({ eas: c, supabaseUrl: URL_OK, publishableKey: KEY_OK, pins: PINS }),
    /Unexpected/,
  );
  const d = clone();
  d.build['staging-testflight'].env.EXPO_PUBLIC_CONTENT_FIXTURES = '1';
  assert.throws(
    () => resolveReleaseEnv({ eas: d, supabaseUrl: URL_OK, publishableKey: KEY_OK, pins: PINS }),
    /Unexpected/,
  );
  const e = clone();
  e.build['staging-testflight'].env.EXPO_PUBLIC_BARCODE_PROVIDER = 'open_food_facts';
  assert.throws(
    () => resolveReleaseEnv({ eas: e, supabaseUrl: URL_OK, publishableKey: KEY_OK, pins: PINS }),
    /off/,
  );
  const f = clone();
  f.build['staging-testflight'].env.EXPO_PUBLIC_APP_ENV = 'production';
  assert.throws(
    () => resolveReleaseEnv({ eas: f, supabaseUrl: URL_OK, publishableKey: KEY_OK, pins: PINS }),
    /preview/,
  );
});
test('refuses a runner environment that already defines app or server variables', () => {
  assert.doesNotThrow(() => assertCleanEnv({ PATH: '/bin', GITHUB_SHA: 'x', RUNNER_TEMP: '/t' }));
  assert.throws(() => assertCleanEnv({ EXPO_PUBLIC_SUPABASE_URL: 'x' }));
  assert.throws(() => assertCleanEnv({ SUPABASE_SERVICE_ROLE_KEY: 'x' }));
  assert.throws(() => assertCleanEnv({ EXPO_PUBLIC_AI_API_URL: 'x' }));
});

test('the real pins are in force by default: a synthetic reference is refused, and the pins are digests, not references', () => {
  assert.throws(() => assertStagingUrl(URL_OK), /not the designated|DEVELOPMENT/);
  assert.match(DESIGNATED_STAGING_REF_SHA256, /^[0-9a-f]{64}$/);
  assert.match(DEVELOPMENT_REF_SHA256, /^[0-9a-f]{64}$/);
  assert.notEqual(DESIGNATED_STAGING_REF_SHA256, DEVELOPMENT_REF_SHA256);
});
test('unexpected variables of any family fail the build', () => {
  for (const name of [
    'STAGING_ANYTHING_ELSE',
    'PRODUCTION_SUPABASE_URL',
    'PROD_API',
    'DEV_URL',
    'LIVE_SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_CONTENT_FIXTURES',
    'OPENAI_API_KEY',
  ])
    assert.throws(() => assertCleanEnv({ PATH: '/bin', [name]: 'x' }), undefined, name);
  assert.doesNotThrow(() =>
    assertCleanEnv({
      PATH: '/bin',
      STAGING_SUPABASE_URL: 'x',
      STAGING_SUPABASE_PUBLISHABLE_KEY: 'y',
    }),
  );
});
test('missing inputs fail', () => {
  assert.throws(() =>
    resolveReleaseEnv({ eas, supabaseUrl: undefined, publishableKey: KEY_OK, pins: PINS }),
  );
  assert.throws(() =>
    resolveReleaseEnv({ eas, supabaseUrl: URL_OK, publishableKey: undefined, pins: PINS }),
  );
});
