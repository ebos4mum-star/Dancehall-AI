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
import { createStore, readConfig } from './createStore';
import { setLocale } from '@/i18n';
import { ConfigError, type AppConfig } from '@/lib/env';
import { loadAppState, type AppSnapshot } from './appState';
import type { DataStore, Profile, Session } from './types';

interface AppState {
  ready: boolean;
  config: AppConfig;
  store: DataStore;
  session: Session | null;
  profile: Profile | null;
  /** The session or profile could not be loaded (e.g. offline). Not the same as signed out. */
  loadError: boolean;
  /** Re-reads the session and profile (called after sign-in, onboarding and settings changes). */
  refresh: () => Promise<void>;
}
const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

export function AppProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: (message: string) => ReactNode;
}) {
  const boot = useMemo(() => {
    try {
      const config = readConfig();
      return { config, store: createStore(config), error: null as string | null };
    } catch (e) {
      return {
        config: null,
        store: null,
        error: e instanceof ConfigError ? e.message : 'Unexpected configuration error.',
      };
    }
  }, []);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const snap = useRef<AppSnapshot>({ session: null, profile: null, loadError: false });
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!boot.store) return;
    const next = await loadAppState(boot.store, snap.current);
    if (!alive.current) return;
    snap.current = next;
    setSession(next.session);
    setProfile(next.profile);
    setLoadError(next.loadError);
    if (next.profile) setLocale(next.profile.locale);
    setReady(true);
  }, [boot.store]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const off = boot.store?.subscribe(() => void refresh());
    return () => {
      alive.current = false;
      off?.();
    };
  }, [boot.store, refresh]);

  if (boot.error || !boot.store || !boot.config)
    return <>{fallback(boot.error ?? 'Unknown error')}</>;
  return (
    <Ctx.Provider
      value={{
        ready,
        config: boot.config,
        store: boot.store,
        session,
        profile,
        loadError,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
