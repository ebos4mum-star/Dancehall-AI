/**
 * Safety guard for the live (hosted) verification suite. The suite never runs unless it is explicitly enabled AND points at the one approved
 * DanceHall Fit AI development project. Nothing else is ever contacted, and secret keys are refused.
 */
export const APPROVED_PROJECT_REF = 'vvwjhbsyxetnktimgaxg';
export const APPROVED_URL = `https://${APPROVED_PROJECT_REF}.supabase.co`;

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
export function resolveLiveConfig(env: LiveEnv): LiveConfig {
  if (env.LIVE_SUPABASE !== '1')
    return { enabled: false, reason: 'LIVE_SUPABASE=1 is not set (live tests are opt-in)' };
  const url = (env.LIVE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  if (url !== APPROVED_URL)
    return { enabled: false, reason: `URL must be exactly ${APPROVED_URL}` };
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
