import { describe, expect, it } from 'vitest';
import {
  FREE_ATTEMPTS,
  FRESH_THROTTLE,
  PENDING_TTL_MS,
  RESET_AFTER,
  afterFailure,
  afterSuccess,
  attemptsLeft,
  digitsOnly,
  gateIntentForPath,
  initPinSetup,
  isPublicPath,
  lockRemaining,
  makePending,
  parsePending,
  pinProblem,
  pinSetupReduce,
  requiresReset,
  sanitizeNext,
  type PinSetup,
  type PinThrottle,
} from './index';

const type = (s: PinSetup, digits: string): PinSetup =>
  [...digits].reduce((st, d) => pinSetupReduce(st, { type: 'digit', digit: d }), s);

describe('PIN policy', () => {
  it('accepts exactly six digits that are not obvious', () => {
    for (const ok of ['482916', '906318', '730512', '184726'])
      expect(pinProblem(ok), ok).toBeNull();
  });
  it('refuses wrong lengths and non-digits', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 456', '１２３４５６'])
      expect(pinProblem(bad), bad).toBe('format');
    expect(digitsOnly('12-34 56789')).toBe('123456');
  });
  it('refuses repeated digits, sequences, patterns and the most common PINs, and says which', () => {
    expect(pinProblem('111111')).toBe('repeated');
    expect(pinProblem('000000')).toBe('repeated');
    for (const s of ['123456', '234567', '654321', '987654', '012345'])
      expect(pinProblem(s), s).toBe('sequence');
    for (const p of ['123123', '121212', '112233']) expect(pinProblem(p), p).toBe('pattern');
    for (const c of ['159753', '147258', '696969', '123321'])
      expect(pinProblem(c), c).not.toBeNull();
  });
});

describe('PIN lockout schedule', () => {
  const now = 1_000_000;
  const fail = (t: PinThrottle, times: number, at = now) =>
    Array.from({ length: times }).reduce<PinThrottle>((s) => afterFailure(s, at), t);

  it('allows four wrong attempts, then locks for longer each time, then stops accepting the PIN', () => {
    expect(lockRemaining(fail(FRESH_THROTTLE, FREE_ATTEMPTS), now)).toBe(0);
    expect(lockRemaining(fail(FRESH_THROTTLE, 5), now)).toBe(30);
    expect(lockRemaining(fail(FRESH_THROTTLE, 6), now)).toBe(60);
    expect(lockRemaining(fail(FRESH_THROTTLE, 7), now)).toBe(300);
    expect(lockRemaining(fail(FRESH_THROTTLE, 8), now)).toBe(900);
    expect(lockRemaining(fail(FRESH_THROTTLE, 9), now)).toBe(3600);
    expect(requiresReset(fail(FRESH_THROTTLE, RESET_AFTER - 1))).toBe(false);
    expect(requiresReset(fail(FRESH_THROTTLE, RESET_AFTER))).toBe(true);
  });
  it('counts down with time and lifts when it ends', () => {
    const t = fail(FRESH_THROTTLE, 5);
    expect(lockRemaining(t, now + 10_000)).toBe(20);
    expect(lockRemaining(t, now + 30_000)).toBe(0);
    expect(lockRemaining(t, now + 99_000)).toBe(0);
  });
  it('a clock set far ahead cannot extend a lock beyond the longest one', () => {
    expect(lockRemaining({ failures: 5, lockedUntil: now + 10 * 24 * 3600_000 }, now)).toBe(3600);
  });
  it('a correct PIN clears the failures', () => {
    expect(afterSuccess()).toEqual(FRESH_THROTTLE);
  });
  it('reports attempts left before the next lockout', () => {
    expect(attemptsLeft(FRESH_THROTTLE)).toBe(4);
    expect(attemptsLeft(fail(FRESH_THROTTLE, 3))).toBe(1);
    expect(attemptsLeft(fail(FRESH_THROTTLE, 5))).toBe(1);
    expect(attemptsLeft(fail(FRESH_THROTTLE, RESET_AFTER))).toBe(0);
  });
});

describe('PIN setup state machine', () => {
  it('create, confirm, done, and the PIN is only in the state while it is being set', () => {
    let s = type(initPinSetup(), '482916');
    expect(s).toMatchObject({ step: 'confirm', entry: '', first: '482916', error: null });
    s = type(s, '482916');
    expect(s.step).toBe('done');
  });
  it('sends a weak PIN back with the reason and keeps nothing', () => {
    expect(type(initPinSetup(), '123456')).toMatchObject({
      step: 'create',
      entry: '',
      first: null,
      error: 'sequence',
    });
    expect(type(initPinSetup(), '111111').error).toBe('repeated');
  });
  it('a mismatch on confirmation restarts, with no PIN kept', () => {
    const s = type(type(initPinSetup(), '482916'), '482917');
    expect(s).toMatchObject({ step: 'create', entry: '', first: null, error: 'mismatch' });
  });
  it('delete removes the last digit, ignores non-digits and extra digits, and typing clears an old error', () => {
    let s = type(initPinSetup(), '48');
    s = pinSetupReduce(s, { type: 'delete' });
    expect(s.entry).toBe('4');
    expect(pinSetupReduce(s, { type: 'digit', digit: 'x' })).toBe(s);
    expect(type(initPinSetup(), '4829165').step).toBe('confirm'); // the seventh digit is ignored, not wrapped
    const bad = type(initPinSetup(), '123456');
    expect(type(bad, '4').error).toBeNull();
  });
  it('restart goes back to the beginning and done is final', () => {
    expect(pinSetupReduce(type(initPinSetup(), '482916'), { type: 'restart' })).toEqual(
      initPinSetup(),
    );
    const done = type(type(initPinSetup(), '482916'), '482916');
    expect(pinSetupReduce(done, { type: 'restart' })).toBe(done);
    expect(pinSetupReduce(done, { type: 'digit', digit: '1' })).toBe(done);
  });
});

describe('browse first, account when it matters', () => {
  it('lets a guest see the catalogue, workout details and the browsing tabs', () => {
    for (const p of [
      '/',
      '/dance',
      '/dance/qf5-afrobeats-wake-up',
      '/dance/program',
      '/food',
      '/me',
      '/(tabs)',
    ])
      expect(isPublicPath(p), p).toBe(true);
  });
  it('asks for an account at starting a workout, saving progress, plans, food logging and the other personal features', () => {
    const cases: Array<[string, string]> = [
      ['/dance/session', 'start_workout'],
      ['/dance/session?id=x&low=0', 'start_workout'],
      ['/dance/schedule', 'schedule_workout'],
      ['/dance/history', 'save_progress'],
      ['/progress', 'save_progress'],
      ['/food/add', 'log_food'],
      ['/food/review', 'log_food'],
      ['/food/camera', 'log_food'],
      ['/food/barcode', 'log_food'],
      ['/food/plan', 'meal_plan'],
      ['/goals', 'goals'],
      ['/challenges', 'challenges'],
      ['/coach', 'coach'],
      ['/coach/settings', 'coach'],
      ['/privacy', 'profile'],
    ];
    for (const [p, intent] of cases) expect(gateIntentForPath(p), p).toBe(intent);
  });
  it('does not mistake a similar public path for an account path', () => {
    expect(gateIntentForPath('/dance/sessions-info')).toBeNull();
    expect(gateIntentForPath('/food')).toBeNull();
    expect(gateIntentForPath('/dance/session/')).toBe('start_workout');
  });
});

describe('return address safety', () => {
  it('accepts the app’s own screens, with their parameters', () => {
    for (const ok of [
      '/',
      '/dance/session?id=qf5-afrobeats-wake-up&low=0&seated=1',
      '/dance/home~chair~beginner~15~f~n~2~-'.replace('~', '%7E'),
      '/food/add',
      '/coach',
      '/goals',
    ])
      expect(sanitizeNext(ok), ok).toBe(ok);
  });
  it('refuses other sites, scheme tricks, loops into the account screens, traversal and junk', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/account/start',
      '/sign-in',
      '/onboarding',
      '/dance/../account/start',
      '/dance/%2e%2e/account',
      '/dance/session?x=<script>',
      '/dance/session?x="',
      '',
      ' ',
      '/' + 'a'.repeat(400),
      42,
      null,
      undefined,
      {},
    ])
      expect(sanitizeNext(bad), String(bad)).toBeNull();
  });
  it('keeps and restores a pending action, and drops one that is tampered with or too old', () => {
    const now = 5_000_000_000;
    const p = makePending('/dance/session?id=abc', 'start_workout', now)!;
    expect(p).toEqual({ next: '/dance/session?id=abc', intent: 'start_workout', createdAt: now });
    expect(parsePending(JSON.stringify(p), now + 1000)).toEqual(p);
    expect(parsePending(JSON.stringify(p), now + PENDING_TTL_MS + 1)).toBeNull();
    expect(parsePending(JSON.stringify({ ...p, next: 'https://evil.example' }), now)).toBeNull();
    expect(parsePending(JSON.stringify({ ...p, intent: 'admin' }), now)).toBeNull();
    expect(parsePending(JSON.stringify({ ...p, createdAt: now + 10 * 60_000 }), now)).toBeNull();
    expect(parsePending('{not json', now)).toBeNull();
    expect(parsePending(null, now)).toBeNull();
    expect(makePending('/account/start', 'start_workout', now)).toBeNull();
    expect(makePending('/coach', 'nope', now)).toBeNull();
  });
});
