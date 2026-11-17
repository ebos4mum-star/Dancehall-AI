// Environment guard for the signed TestFlight build. The Expo configuration stays the source of truth: the app flags come from
// apps/mobile/eas.json, profile "staging-testflight" (used here only as a configuration file; EAS itself is NOT used). The
// only two values supplied from outside are the staging Supabase URL and publishable key, and both are checked here:
//   - the URL must be exactly the ONE designated staging project (scripts/staging/guard.mjs); the development project and every other
//     reference are refused, so a production or development credential cannot enter this build even if it is stored by mistake;
//   - the key must be a publishable key (never a secret or service-role key).
// Nothing here prints a key. Refusals name the rule, not the value.
import { readFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DESIGNATED_STAGING_REF, DEVELOPMENT_REF } from '../staging/guard.mjs';

export const PROFILE = 'staging-testflight';
/** The only EXPO_PUBLIC_ names the release build may carry besides the two Supabase values. */
export const ALLOWED_FLAGS = [
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_AUTH_MODE',
  'EXPO_PUBLIC_CLOUD_ACCOUNTS',
  'EXPO_PUBLIC_SOCIAL',
  'EXPO_PUBLIC_COMMUNITY',
  'EXPO_PUBLIC_APPLE_HEALTH',
  'EXPO_PUBLIC_BARCODE_PROVIDER',
];
/** Must never be present in this build: AI gateway (the Coach stays unavailable), fixtures, mock auth, any server-side key. */
const FORBIDDEN_NAMES =
  /AI_API_URL|CONTENT_FIXTURES|SERVICE_ROLE|SECRET_KEY|SUPABASE_SECRET|OPENAI|ANTHROPIC|PRIVATE_KEY/i;

/** Throws unless the process environment is clean before the guard injects anything. */
export function assertCleanEnv(env) {
  const bad = Object.keys(env).filter(
    (k) =>
      /^EXPO_PUBLIC_/.test(k) ||
      (FORBIDDEN_NAMES.test(k) && !/^(ACTIONS_|GITHUB_|RUNNER_)/.test(k)),
  );
  if (bad.length)
    throw new Error(
      `The release job environment must not predefine app or server variables; found: ${bad.join(', ')}. Only the guard sets EXPO_PUBLIC_* values.`,
    );
}

export function assertStagingUrl(url) {
  const m = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(url ?? '');
  if (!m)
    throw new Error('STAGING_SUPABASE_URL must look like https://<20-letter-ref>.supabase.co');
  if (m[1] === DEVELOPMENT_REF)
    throw new Error('That is the DEVELOPMENT project. The TestFlight build must use staging only.');
  if (m[1] !== DESIGNATED_STAGING_REF)
    throw new Error('That is not the designated staging project. Nothing was built.');
  return `https://${m[1]}.supabase.co`;
}

export function assertPublishableKey(key) {
  if (typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))
    throw new Error(
      'STAGING_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key (sb_publishable_...). A secret or service-role key is refused.',
    );
  return key;
}

/** Returns the complete EXPO_PUBLIC_* set for the build, or throws. `eas` is the parsed eas.json. */
export function resolveReleaseEnv({ eas, supabaseUrl, publishableKey }) {
  const p = eas?.build?.[PROFILE];
  if (!p) throw new Error(`eas.json has no "${PROFILE}" profile (used as configuration only).`);
  if (p.distribution !== 'store')
    throw new Error('The release profile must be store distribution.');
  if (p.environment !== 'staging')
    throw new Error('The release profile must be the staging environment.');
  const flags = p.env ?? {};
  for (const k of Object.keys(flags))
    if (!ALLOWED_FLAGS.includes(k))
      throw new Error(`Unexpected variable in the release profile: ${k}`);
  const want = {
    EXPO_PUBLIC_APP_ENV: 'preview',
    EXPO_PUBLIC_AUTH_MODE: 'supabase',
    EXPO_PUBLIC_BARCODE_PROVIDER: 'off',
    EXPO_PUBLIC_APPLE_HEALTH: '1',
    EXPO_PUBLIC_COMMUNITY: '1',
  };
  for (const [k, v] of Object.entries(want))
    if (flags[k] !== v) throw new Error(`The release profile must set ${k}=${v}.`);
  return {
    ...flags,
    EXPO_PUBLIC_SUPABASE_URL: assertStagingUrl(supabaseUrl),
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: assertPublishableKey(publishableKey),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const envFile = process.argv[process.argv.indexOf('--github-env') + 1];
    if (!envFile || !process.argv.includes('--github-env'))
      throw new Error('usage: --github-env <file>');
    assertCleanEnv(process.env);
    const eas = JSON.parse(readFileSync('apps/mobile/eas.json', 'utf8'));
    const out = resolveReleaseEnv({
      eas,
      supabaseUrl: process.env.STAGING_SUPABASE_URL,
      publishableKey: process.env.STAGING_SUPABASE_PUBLISHABLE_KEY,
    });
    for (const [k, v] of Object.entries(out)) appendFileSync(envFile, `${k}=${v}\n`);
    console.log(
      `Release environment accepted: staging project ${DESIGNATED_STAGING_REF.slice(0, 4)}…, ${Object.keys(out).length} variables, no AI gateway, no fixtures.`,
    );
  } catch (e) {
    console.error(`Release environment refused: ${e.message}`);
    process.exit(1);
  }
}
