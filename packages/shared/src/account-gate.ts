/**
 * Browse first, account when it matters. Which screens are public, which need an account and why, and how the person is returned to what they were doing once
 * the account exists. All pure, so the rules are tested without a screen.
 */
export const GATE_INTENTS = [
  'start_workout',
  'schedule_workout',
  'save_progress',
  'personal_plan',
  'log_food',
  'meal_plan',
  'coach',
  'goals',
  'challenges',
  'profile',
  'community_post',
  'community_join',
] as const;
export type GateIntent = (typeof GATE_INTENTS)[number];
export const isGateIntent = (v: unknown): v is GateIntent =>
  typeof v === 'string' && (GATE_INTENTS as readonly string[]).includes(v);

/** Screens that need an account, with the reason shown on the gate. Matched by path prefix. */
const ACCOUNT_PATHS: ReadonlyArray<readonly [string, GateIntent]> = [
  ['/dance/session', 'start_workout'],
  ['/dance/schedule', 'schedule_workout'],
  ['/dance/history', 'save_progress'],
  ['/progress', 'save_progress'],
  ['/challenges', 'challenges'],
  ['/goals', 'goals'],
  ['/coach', 'coach'],
  ['/food/add', 'log_food'],
  ['/food/review', 'log_food'],
  ['/food/camera', 'log_food'],
  ['/food/barcode', 'log_food'],
  ['/food/history', 'log_food'],
  ['/food/saved', 'log_food'],
  ['/food/household', 'log_food'],
  ['/food/swap', 'log_food'],
  ['/food/fridge', 'log_food'],
  ['/food/plan', 'meal_plan'],
  ['/privacy', 'profile'],
];
const norm = (p: string): string => p.split('?')[0]!.replace(/\/+$/, '') || '/';

/** The reason a path needs an account, or null when a guest may see it. */
export function gateIntentForPath(path: string): GateIntent | null {
  const p = norm(path);
  for (const [prefix, intent] of ACCOUNT_PATHS)
    if (p === prefix || p.startsWith(`${prefix}/`)) return intent;
  return null;
}
export const isPublicPath = (path: string): boolean => gateIntentForPath(path) === null;

/** Where a return address may point: the app's own screens, never the account screens themselves. */
const NEXT_PREFIXES = [
  '/dance',
  '/food',
  '/coach',
  '/challenges',
  '/goals',
  '/progress',
  '/privacy',
  '/me',
  '/community',
];
const SAFE = /^[A-Za-z0-9_\-.~%=&+:,/?]+$/;

/**
 * A return address is only used if it is an internal path of this app. This is what stops a crafted link from sending someone to another site, or into
 * the account screens in a loop, after they create an account.
 */
export function sanitizeNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (s.length === 0 || s.length > 300 || !s.startsWith('/') || s.startsWith('//') || !SAFE.test(s))
    return null;
  if (
    s.includes('..') ||
    s.includes('%2e') ||
    s.includes('%2E') ||
    s.includes('%2f') ||
    s.includes('%2F') ||
    s.includes('%5c') ||
    s.includes('%5C')
  )
    return null;
  if (s === '/') return '/';
  const path = norm(s);
  return NEXT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) ? s : null;
}

/** What the person was trying to do when the gate appeared. Kept so the action survives an interrupted setup. */
export interface PendingAction {
  next: string;
  intent: GateIntent;
  createdAt: number;
}
export const PENDING_TTL_MS = 24 * 3600_000;
export function makePending(next: unknown, intent: unknown, now: number): PendingAction | null {
  const n = sanitizeNext(next);
  if (!n || !isGateIntent(intent)) return null;
  return { next: n, intent, createdAt: now };
}
/** Reads a stored pending action: malformed, tampered or older than a day is dropped. */
export function parsePending(raw: string | null, now: number): PendingAction | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingAction>;
    const p = makePending(v.next, v.intent, typeof v.createdAt === 'number' ? v.createdAt : NaN);
    if (
      !p ||
      !Number.isFinite(p.createdAt) ||
      now - p.createdAt > PENDING_TTL_MS ||
      p.createdAt > now + 60_000
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
