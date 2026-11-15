/**
 * The six-digit PIN rules and the lockout schedule, as pure functions. The PIN is an APP LOCK for a device that already holds an account session: it is not, and
 * must never be treated as, a credential that proves who someone is to the cloud (six digits is only a million possibilities, so it cannot be). What protects the
 * PIN itself is a slow salted hash kept in the device's secure storage, a lockout that persists across restarts, and a hard stop after too many failures.
 */
export const PIN_LENGTH = 6;
export const isPinFormat = (s: string): boolean => /^\d{6}$/.test(s);
/** Keeps digits only, at most PIN_LENGTH of them. */
export const digitsOnly = (s: string): string => s.replace(/\D/g, '').slice(0, PIN_LENGTH);

export type PinProblem = 'format' | 'repeated' | 'sequence' | 'pattern' | 'common';

/** PINs people choose first and attackers try first. Not exhaustive: it blocks the obvious ones and says why. */
const COMMON = new Set([
  '123123',
  '112233',
  '121212',
  '696969',
  '654321',
  '123321',
  '159753',
  '147258',
  '258369',
  '789456',
  '456789',
  '101010',
  '202020',
  '131313',
  '111222',
  '000111',
  '999000',
  '100000',
  '123456',
  '012345',
  '234567',
  '345678',
  '456789',
  '567890',
  '987654',
  '876543',
  '765432',
  '543210',
  '098765',
  '200000',
  '110011',
  '520520',
  '112112',
  '223344',
  '334455',
  '445566',
]);

export function pinProblem(pin: string): PinProblem | null {
  if (!isPinFormat(pin)) return 'format';
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return 'repeated';
  const steps = d.slice(1).map((x, i) => x - d[i]!);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'sequence';
  // abcabc, ababab, aabbcc
  if (
    pin.slice(0, 3) === pin.slice(3) ||
    /^(\d\d)\1\1$/.test(pin) ||
    /^(\d)\1(\d)\2(\d)\3$/.test(pin)
  )
    return 'pattern';
  if (COMMON.has(pin)) return 'common';
  return null;
}

/** Throttle state kept with the PIN record, so it survives a restart and killing the app mid-attempt does not reset it. */
export interface PinThrottle {
  /** Wrong attempts since the last correct one. */
  failures: number;
  /** Epoch milliseconds until which attempts are refused, or null. */
  lockedUntil: number | null;
}
export const FRESH_THROTTLE: PinThrottle = { failures: 0, lockedUntil: null };
/** Failures allowed before the first lockout. */
export const FREE_ATTEMPTS = 4;
/** After this many failures the PIN is no longer accepted at all on this device: the person must sign out of it and start again. */
export const RESET_AFTER = 10;
/** Lockout seconds by failure count: the fifth wrong attempt locks for 30 s, the sixth 1 min, then 5, 15 and 60 min. */
const LOCK_SECONDS: Record<number, number> = { 5: 30, 6: 60, 7: 300, 8: 900, 9: 3600 };

export const lockSecondsFor = (failures: number): number => LOCK_SECONDS[failures] ?? 0;
export const requiresReset = (t: PinThrottle): boolean => t.failures >= RESET_AFTER;
/** Whole seconds still locked (0 when attempts are allowed). Treats a locked time too far in the future as the longest lock, so a changed clock cannot extend it unboundedly. */
export function lockRemaining(t: PinThrottle, now: number): number {
  if (t.lockedUntil === null) return 0;
  const left = Math.ceil((Math.min(t.lockedUntil, now + 3600_000) - now) / 1000);
  return left > 0 ? left : 0;
}
/** The state after a wrong attempt. */
export function afterFailure(t: PinThrottle, now: number): PinThrottle {
  const failures = t.failures + 1;
  const secs = lockSecondsFor(failures);
  return { failures, lockedUntil: secs > 0 ? now + secs * 1000 : null };
}
export const afterSuccess = (): PinThrottle => FRESH_THROTTLE;
/** Attempts left before the next lockout (or before the reset), for the message. */
export function attemptsLeft(t: PinThrottle): number {
  if (t.failures >= RESET_AFTER) return 0;
  if (t.failures < FREE_ATTEMPTS) return FREE_ATTEMPTS - t.failures;
  return 1;
}

/**
 * The PIN setup steps as a pure state machine, so the screen only draws it. The PIN lives in this state only while it is being typed: it is never written
 * anywhere here, and the screen hands the confirmed PIN to the vault once and drops it.
 */
export type PinStep = 'create' | 'confirm' | 'done';
export interface PinSetup {
  step: PinStep;
  /** What is being typed now. */
  entry: string;
  /** The first entry, kept only until it is confirmed or the setup restarts. */
  first: string | null;
  /** Why the last attempt was sent back, for a message. */
  error: PinProblem | 'mismatch' | null;
}
export const initPinSetup = (): PinSetup => ({
  step: 'create',
  entry: '',
  first: null,
  error: null,
});
export type PinSetupEvent =
  { type: 'digit'; digit: string } | { type: 'delete' } | { type: 'restart' };
export function pinSetupReduce(s: PinSetup, e: PinSetupEvent): PinSetup {
  if (s.step === 'done') return s;
  if (e.type === 'restart') return initPinSetup();
  if (e.type === 'delete') return { ...s, entry: s.entry.slice(0, -1), error: null };
  if (!/^\d$/.test(e.digit) || s.entry.length >= PIN_LENGTH) return s;
  const entry = s.entry + e.digit;
  if (entry.length < PIN_LENGTH) return { ...s, entry, error: null };
  if (s.step === 'create') {
    const problem = pinProblem(entry);
    return problem
      ? { step: 'create', entry: '', first: null, error: problem }
      : { step: 'confirm', entry: '', first: entry, error: null };
  }
  // confirm
  return entry === s.first
    ? { step: 'done', entry, first: s.first, error: null }
    : { step: 'create', entry: '', first: null, error: 'mismatch' };
}
