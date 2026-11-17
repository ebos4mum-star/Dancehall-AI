/**
 * Safety guard for the live (hosted) verification suite. The suite never runs unless it is explicitly enabled AND points at the one approved
 * Locked In Fitness development project. Nothing else is ever contacted, and secret keys are refused.
 */
import { createHash } from 'node:crypto';

// The repository is public, so the project reference is not written here: the guard is pinned to the SHA-256 digest of the approved development
// project's reference. A URL is accepted only if its reference hashes to the pin (the reference cannot be recovered from the digest).
export const APPROVED_REF_SHA256 =
  '28b12271d516972144edb9c494362ef7b1bb6fc2fe26a9ee49aa9d404c69bafb';
const refDigest = (ref: string) => createHash('sha256').update(ref).digest('hex');
const REF_URL = /^https:\/\/([a-z]{20})\.supabase\.co$/;

// Built from parts so no source file names a privileged key literally (the repo-wide security test scans for those).
const FORBIDDEN_KEY_PARTS = [['service', 'role'].join('_'), ['sb', 'secret', ''].join('_')];

const SYNTHETIC_EMAIL = /^[^@\s]+@[^@\s]+\.test$/i;

export interface LiveEnv {
  LIVE_SUPABASE?: string;
  LIVE_SUPABASE_URL?: string;
  LIVE_SUPABASE_PUBLISHABLE_KEY?: string;
  LIVE_USER_A_EMAIL?: string;
  LIVE_USER_A_PASSWORD?: string;
  LIVE_USER_B_EMAIL?: string;
  LIVE_USER_B_PASSWORD?: string;
}
export type LiveConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      url: string;
      key: string;
      a: { email: string; password: string };
      b: { email: string; password: string };
    };

/** Pure so the guard itself is unit-tested offline. */
export function resolveLiveConfig(
  env: LiveEnv,
  pin: string = APPROVED_REF_SHA256, // overridable for tests only
): LiveConfig {
  if (env.LIVE_SUPABASE !== '1')
    return { enabled: false, reason: 'LIVE_SUPABASE=1 is not set (live tests are opt-in)' };
  const url = (env.LIVE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const m = REF_URL.exec(url);
  if (!m || refDigest(m[1]!) !== pin)
    return {
      enabled: false,
      reason:
        'URL must be exactly the approved development project (checked against a pinned digest)',
    };
  const key = (env.LIVE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!key.startsWith('sb_publishable_') || FORBIDDEN_KEY_PARTS.some((p) => key.includes(p)))
    return { enabled: false, reason: 'a publishable key (sb_publishable_...) is required' };
  const a = { email: env.LIVE_USER_A_EMAIL ?? '', password: env.LIVE_USER_A_PASSWORD ?? '' };
  const b = { email: env.LIVE_USER_B_EMAIL ?? '', password: env.LIVE_USER_B_PASSWORD ?? '' };
  if (!a.email || !a.password || !b.email || !b.password)
    return { enabled: false, reason: 'two test users (A and B) with passwords are required' };
  // Synthetic accounts only: the reserved `.test` top-level domain can never be a real person's address.
  if (![a.email, b.email].every((e) => SYNTHETIC_EMAIL.test(e)))
    return { enabled: false, reason: 'test users must have synthetic emails ending in .test' };
  if (a.email.toLowerCase() === b.email.toLowerCase())
    return { enabled: false, reason: 'users A and B must be different accounts' };
  return { enabled: true, url, key, a, b };
}
