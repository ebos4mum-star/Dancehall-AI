import { useCallback, useEffect, type ComponentType } from 'react';
import { Redirect, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { gateIntentForPath, sanitizeNext, type GateIntent } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';

/** The address of the current screen, with its parameters, as a return address for after sign-up. */
function useHere(): string {
  const path = usePathname();
  const params = useGlobalSearchParams();
  const q = Object.entries(params)
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&');
  return q ? `${path}?${q}` : path;
}

export const gateHref = (next: string, intent: GateIntent) =>
  ({ pathname: '/account/start', params: { next, intent } }) as const;

/**
 * Wraps a screen that needs an account. A guest never sees the screen (it is not even rendered): they are sent to the account screen, which remembers where they
 * were going and brings them back after setup. A person with an account sees the screen as before.
 */
export function withAccount<P extends object>(
  Screen: ComponentType<P>,
  fallbackIntent: GateIntent,
): ComponentType<P> {
  function Guarded(props: P) {
    const { ready, session } = useApp();
    const here = useHere();
    if (!ready) return null;
    if (!session) {
      const intent = gateIntentForPath(here) ?? fallbackIntent;
      return <Redirect href={gateHref(sanitizeNext(here) ?? '/', intent)} />;
    }
    return <Screen {...props} />;
  }
  Guarded.displayName = `withAccount(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return Guarded;
}

/**
 * For buttons on public screens: `go` does the action when there is an account, and otherwise opens the account screen with the action saved, so the person
 * ends up doing it after they sign up.
 */
export function useAccountGate() {
  const { session } = useApp();
  const go = useCallback(
    (intent: GateIntent, next: string) => {
      const safe = sanitizeNext(next);
      if (session) {
        if (safe) router.push(safe as never);
        return;
      }
      router.push(gateHref(safe ?? '/', intent));
    },
    [session],
  );
  /** Runs `action` with an account; otherwise sends the person to create one and then back to `returnTo`. */
  const guard = useCallback(
    (intent: GateIntent, returnTo: string, action: () => void) => {
      if (session) action();
      else router.push(gateHref(sanitizeNext(returnTo) ?? '/', intent));
    },
    [session],
  );
  return { signedIn: !!session, go, guard };
}

/** Runs once when a screen appears (used by the account screens to keep the pending action). */
export function useOnce(fn: () => void) {
  useEffect(fn, []); // eslint-disable-line react-hooks/exhaustive-deps
}
