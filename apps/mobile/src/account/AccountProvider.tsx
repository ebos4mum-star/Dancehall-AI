import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makePending, parsePending, type GateIntent, type PendingAction } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import type { Biometrics, BiometricInfo } from './biometrics';
import { defaultBiometrics } from './biometricsNative';
import type { PinVault, VerifyResult } from './pinVault';
import { defaultVault } from './vaultStorage';

/** Locks the app again after it has been in the background this long. */
export const LOCK_AFTER_MS = 60_000;
const PENDING_KEY = 'dh.pending.v1';

interface AccountState {
  /** The vault has been read (until then nothing is shown as locked or unlocked). */
  ready: boolean;
  /** A PIN is set on this device. */
  pinSet: boolean;
  /** An account session exists and a PIN is set, and it has not been entered since the app opened or came back after a while. */
  locked: boolean;
  biometric: BiometricInfo & { enabled: boolean };
  /** Seconds the PIN is refused for (0 when attempts are allowed), and whether it has been shut off entirely. */
  lockedForS: number;
  resetRequired: boolean;
  unlockWithPin(pin: string): Promise<VerifyResult>;
  unlockWithBiometric(): Promise<boolean>;
  /** Sets the PIN (already typed twice) and unlocks. */
  createPin(pin: string, opts?: { biometric?: boolean }): Promise<void>;
  changePin(oldPin: string, newPin: string): Promise<VerifyResult>;
  setBiometricEnabled(on: boolean): Promise<void>;
  lockNow(): void;
  /** Signs out of this device: the session, the PIN, the biometric choice and any saved action. Nothing is deleted from the cloud. */
  signOutDevice(): Promise<void>;
  /** What the person was doing when the account gate appeared, if it is still valid. */
  peekPending(): Promise<PendingAction | null>;
  setPending(next: string, intent: GateIntent): Promise<void>;
  clearPending(): Promise<void>;
  /** Reads the pending action once and removes it. */
  takePending(): Promise<PendingAction | null>;
}
const Ctx = createContext<AccountState | null>(null);
export function useAccount(): AccountState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount must be used inside AccountProvider');
  return v;
}

export function AccountProvider({
  children,
  vault: injectedVault,
  biometrics: injectedBio,
}: {
  children: ReactNode;
  vault?: PinVault;
  biometrics?: Biometrics;
}) {
  const { store, session, ready: appReady, refresh } = useApp();
  const vault = useMemo(() => injectedVault ?? defaultVault(), [injectedVault]);
  const bio = useMemo(() => injectedBio ?? defaultBiometrics(), [injectedBio]);
  const [ready, setReady] = useState(false);
  const [pinSet, setPinSet] = useState(false);
  const [locked, setLocked] = useState(true);
  const [biometric, setBiometric] = useState<BiometricInfo & { enabled: boolean }>({
    available: false,
    kind: null,
    enabled: false,
  });
  const [lockedForS, setLockedForS] = useState(0);
  const [resetRequired, setResetRequired] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const readStatus = useCallback(async () => {
    const [s, info, enabled] = await Promise.all([
      vault.status(),
      bio.info(),
      vault.biometricEnabled(),
    ]);
    setPinSet(s.set);
    setLockedForS(s.lockedForS);
    setResetRequired(s.resetRequired);
    setBiometric({ ...info, enabled: enabled && info.available });
    return s;
  }, [vault, bio]);

  // First read, and again once the session is known: a PIN only locks an app that has an account in it.
  useEffect(() => {
    let alive = true;
    void readStatus().then((s) => {
      if (!alive) return;
      setLocked(s.set); // starts locked when a PIN exists; the session check below lifts it when there is nothing to protect
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [readStatus]);

  // Count the lockout down so the screen can show it and lift it by itself.
  useEffect(() => {
    if (lockedForS <= 0) return;
    const id = setInterval(() => setLockedForS((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [lockedForS]);

  // Lock again after a while in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current ??= Date.now();
        return;
      }
      if (state === 'active') {
        const left = backgroundedAt.current;
        backgroundedAt.current = null;
        if (left !== null && Date.now() - left >= LOCK_AFTER_MS && sessionRef.current) {
          void readStatus().then((s) => s.set && setLocked(true));
        }
      }
    });
    return () => sub.remove();
  }, [readStatus]);

  const effectiveLocked = ready && appReady && !!session && pinSet && locked;

  const unlockWithPin = useCallback(
    async (pin: string): Promise<VerifyResult> => {
      const r = await vault.verify(pin);
      if (r.ok) setLocked(false);
      await readStatus();
      return r;
    },
    [vault, readStatus],
  );
  const unlockWithBiometric = useCallback(async () => {
    if (!biometric.enabled || resetRequired || lockedForS > 0) return false;
    const ok = await bio.prompt('Unlock DanceHall Fit', 'Use PIN');
    if (ok) setLocked(false);
    return ok;
  }, [bio, biometric.enabled, resetRequired, lockedForS]);
  const createPin = useCallback(
    async (pin: string, opts?: { biometric?: boolean }) => {
      await vault.create(pin);
      if (opts?.biometric) await vault.setBiometric(true);
      await readStatus();
      setLocked(false);
    },
    [vault, readStatus],
  );
  const changePin = useCallback(
    async (oldPin: string, newPin: string) => {
      const r = await vault.change(oldPin, newPin);
      await readStatus();
      return r;
    },
    [vault, readStatus],
  );
  const setBiometricEnabled = useCallback(
    async (on: boolean) => {
      if (on && !(await bio.info()).available) return;
      await vault.setBiometric(on);
      await readStatus();
    },
    [vault, bio, readStatus],
  );
  const lockNow = useCallback(() => {
    if (pinSet) setLocked(true);
  }, [pinSet]);

  const peekPending = useCallback(async () => {
    try {
      return parsePending(await AsyncStorage.getItem(PENDING_KEY), Date.now());
    } catch {
      return null;
    }
  }, []);
  const setPending = useCallback(async (next: string, intent: GateIntent) => {
    const p = makePending(next, intent, Date.now());
    try {
      if (p) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p));
    } catch {
      /* the action is only a convenience; losing it just returns the person to the home screen */
    }
  }, []);
  const clearPending = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  const takePending = useCallback(async () => {
    const p = await peekPending();
    await clearPending();
    return p;
  }, [peekPending, clearPending]);

  const signOutDevice = useCallback(async () => {
    await store.signOut();
    await vault.clear();
    await clearPending();
    await readStatus();
    setLocked(false);
    await refresh();
  }, [store, vault, clearPending, readStatus, refresh]);

  const value: AccountState = {
    ready,
    pinSet,
    locked: effectiveLocked,
    biometric,
    lockedForS,
    resetRequired,
    unlockWithPin,
    unlockWithBiometric,
    createPin,
    changePin,
    setBiometricEnabled,
    lockNow,
    signOutDevice,
    peekPending,
    setPending,
    clearPending,
    takePending,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
