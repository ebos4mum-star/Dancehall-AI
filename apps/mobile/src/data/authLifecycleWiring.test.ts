/** The Supabase store binds token auto-refresh to the app's foreground state, and leaves auth settings unchanged. */
import { describe, expect, it, vi } from 'vitest';

const start = vi.fn(async () => {});
const stop = vi.fn(async () => {});
let options: { auth?: Record<string, unknown> } = {};
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_u: string, _k: string, o: typeof options) => {
    options = o;
    return {
      auth: {
        startAutoRefresh: start,
        stopAutoRefresh: stop,
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    };
  },
}));
const { createSupabaseStore } = await import('./supabaseStore');

const storage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
const base = {
  url: 'https://placeholder.supabase.example.test',
  publishableKey: 'sb_publishable_x',
  storage,
};

describe('store auth lifecycle wiring', () => {
  it('keeps session persistence and auto-refresh enabled, and follows the app state', () => {
    let listener: (s: string) => void = () => {};
    createSupabaseStore({
      ...base,
      appState: {
        currentState: 'active',
        addEventListener: (_t, l) => ((listener = l), { remove() {} }),
      },
    });
    expect(options.auth).toMatchObject({
      persistSession: true,
      autoRefreshToken: true,
      storage,
      detectSessionInUrl: false,
    });
    expect(start).toHaveBeenCalledTimes(1);
    listener('background');
    expect(stop).toHaveBeenCalledTimes(1);
    listener('active');
    expect(start).toHaveBeenCalledTimes(2);
  });
  it('without an app-state source (tests, web preview) nothing is bound', () => {
    start.mockClear();
    stop.mockClear();
    createSupabaseStore(base);
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
});
