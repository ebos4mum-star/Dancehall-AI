/**
 * Supabase auth lifecycle for a native app.
 *
 * supabase-js refreshes the access token on a timer. In a native app that timer must only run while the app is in the foreground:
 * the OS suspends background timers (so a refresh would fire late or fail), and a refresh in the background wastes battery and network.
 * Supabase's documented pattern is to call `startAutoRefresh()` when the app becomes active and `stopAutoRefresh()` when it does not.
 * `startAutoRefresh()` also refreshes immediately if the token expired while the app was away. Session persistence is untouched:
 * the session stays in secure storage either way, and a stopped timer never signs anyone out.
 */
export interface AutoRefreshControl {
  startAutoRefresh(): Promise<void>;
  stopAutoRefresh(): Promise<void>;
}
export type AppStateName = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';
export interface AppStateSource {
  /** React Native reports null/undefined until the native module answers. */
  readonly currentState: AppStateName | string | null | undefined;
  addEventListener(
    type: 'change',
    listener: (state: AppStateName | string) => void,
  ): { remove(): void };
}

const safe = (fn: () => Promise<void>) => {
  // A failure to start or stop the timer must never crash the app or touch the stored session.
  try {
    void Promise.resolve(fn()).catch(() => undefined);
  } catch {
    /* ignore */
  }
};

/** Binds auto-refresh to the app's foreground state. Returns a function that unbinds it (and stops refreshing). */
export function bindAuthLifecycle(auth: AutoRefreshControl, app: AppStateSource): () => void {
  const apply = (state: string | null | undefined) =>
    safe(() =>
      state === 'active' || state == null ? auth.startAutoRefresh() : auth.stopAutoRefresh(),
    );
  apply(app.currentState);
  const sub = app.addEventListener('change', apply);
  return () => {
    sub.remove();
    safe(() => auth.stopAutoRefresh());
  };
}
