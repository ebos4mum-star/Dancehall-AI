import { scrypt } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  FRESH_THROTTLE,
  afterFailure,
  afterSuccess,
  attemptsLeft,
  isPinFormat,
  lockRemaining,
  requiresReset,
  type PinThrottle,
} from '@dancehall/shared';

/**
 * The device-side PIN vault. The PIN locks the app on a phone that already holds an account session; it is never sent anywhere and it is not what proves identity
 * to the cloud. What is stored is a salted scrypt hash, never the PIN, in the platform's secure storage. The wrong-attempt counter is written BEFORE the check, so
 * killing the app in the middle of a guess cannot reset it, and a persistent lockout, rising to a hard stop, limits guessing.
 *
 * Honest limits: six digits is a million possibilities, so someone who can read this device's secure storage (a compromised or jailbroken phone) could
 * guess a PIN offline however slow the hash. The PIN is a lock, not a credential; the account's real protection is the device-bound session and, for a new
 * phone, a recovery factor with far more entropy (see docs/ACCOUNT_SECURITY.md).
 */
export interface VaultStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const KEY_PIN = 'dh.pin.v1';
const KEY_THROTTLE = 'dh.pin.throttle.v1';
const KEY_BIO = 'dh.pin.biometric.v1';

/** scrypt parameters: 16 MiB, so a guess costs real time and memory. */
export const KDF = { N: 2 ** 14, r: 8, p: 1, dkLen: 32 } as const;

interface PinRecord {
  v: 1;
  kdf: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'wrong'; attemptsLeft: number; lockedForS: number }
  | { ok: false; reason: 'locked'; lockedForS: number }
  | { ok: false; reason: 'reset_required' }
  | { ok: false; reason: 'not_set' | 'format' };

export interface VaultDeps {
  storage: VaultStorage;
  /** Cryptographically secure random bytes. */
  random: (n: number) => Uint8Array;
  now?: () => number;
}

const encoder = new TextEncoder();
function derive(pin: string, salt: Uint8Array, p: Pick<PinRecord, 'N' | 'r' | 'p'>): Uint8Array {
  return scrypt(encoder.encode(pin), salt, { N: p.N, r: p.r, p: p.p, dkLen: KDF.dkLen });
}
/** Compares in time that does not depend on where the bytes differ. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

export function createPinVault({ storage, random, now = Date.now }: VaultDeps) {
  const readThrottle = async (): Promise<PinThrottle> => {
    try {
      const raw = await storage.get(KEY_THROTTLE);
      if (!raw) return FRESH_THROTTLE;
      const v = JSON.parse(raw) as Partial<PinThrottle>;
      const failures = Number.isInteger(v.failures) && v.failures! >= 0 ? v.failures! : 0;
      const lockedUntil = typeof v.lockedUntil === 'number' ? v.lockedUntil : null;
      return { failures, lockedUntil };
    } catch {
      // A damaged counter must not become a free reset: treat it as the strictest state that is not a hard stop.
      return { failures: 9, lockedUntil: now() + 3600_000 };
    }
  };
  const writeThrottle = (t: PinThrottle) => storage.set(KEY_THROTTLE, JSON.stringify(t));

  async function readRecord(): Promise<PinRecord | null> {
    const raw = await storage.get(KEY_PIN);
    if (!raw) return null;
    try {
      const r = JSON.parse(raw) as PinRecord;
      return r.v === 1 &&
        r.kdf === 'scrypt' &&
        typeof r.salt === 'string' &&
        typeof r.hash === 'string'
        ? r
        : null;
    } catch {
      return null;
    }
  }

  return {
    /** Whether a PIN is set on this device. */
    async isSet(): Promise<boolean> {
      return (await readRecord()) !== null;
    },

    /** Sets (or replaces) the PIN. The caller has already confirmed it by having it typed twice. */
    async create(pin: string): Promise<void> {
      if (!isPinFormat(pin)) throw new Error('A PIN is exactly six digits.');
      const salt = random(16);
      const rec: PinRecord = {
        v: 1,
        kdf: 'scrypt',
        N: KDF.N,
        r: KDF.r,
        p: KDF.p,
        salt: bytesToHex(salt),
        hash: bytesToHex(derive(pin, salt, KDF)),
      };
      await storage.set(KEY_PIN, JSON.stringify(rec));
      await writeThrottle(FRESH_THROTTLE);
    },

    async verify(pin: string): Promise<VerifyResult> {
      if (!isPinFormat(pin)) return { ok: false, reason: 'format' };
      const rec = await readRecord();
      if (!rec) return { ok: false, reason: 'not_set' };
      const t = await readThrottle();
      if (requiresReset(t)) return { ok: false, reason: 'reset_required' };
      const wait = lockRemaining(t, now());
      if (wait > 0) return { ok: false, reason: 'locked', lockedForS: wait };
      // Count the attempt first, so interrupting the check cannot reset the counter.
      const counted = afterFailure(t, now());
      await writeThrottle(counted);
      const same = equalBytes(derive(pin, hexToBytes(rec.salt), rec), hexToBytes(rec.hash));
      if (same) {
        await writeThrottle(afterSuccess());
        return { ok: true };
      }
      return requiresReset(counted)
        ? { ok: false, reason: 'reset_required' }
        : {
            ok: false,
            reason: 'wrong',
            attemptsLeft: attemptsLeft(counted),
            lockedForS: lockRemaining(counted, now()),
          };
    },

    /** The current lockout, for the screen. */
    async status(): Promise<{
      set: boolean;
      lockedForS: number;
      resetRequired: boolean;
      failures: number;
    }> {
      const [rec, t] = await Promise.all([readRecord(), readThrottle()]);
      return {
        set: rec !== null,
        lockedForS: lockRemaining(t, now()),
        resetRequired: requiresReset(t),
        failures: t.failures,
      };
    },

    /** Changing the PIN needs the old one to verify first (and counts against the same lockout). */
    async change(oldPin: string, newPin: string): Promise<VerifyResult> {
      const r = await this.verify(oldPin);
      if (r.ok) await this.create(newPin);
      return r;
    },

    async biometricEnabled(): Promise<boolean> {
      return (await storage.get(KEY_BIO)) === '1';
    },
    async setBiometric(on: boolean): Promise<void> {
      if (on) await storage.set(KEY_BIO, '1');
      else await storage.remove(KEY_BIO);
    },

    /** Removes the PIN, its counter and the biometric choice (signing out of this device). */
    async clear(): Promise<void> {
      await storage.remove(KEY_PIN);
      await storage.remove(KEY_THROTTLE);
      await storage.remove(KEY_BIO);
    },
  };
}
export type PinVault = ReturnType<typeof createPinVault>;
