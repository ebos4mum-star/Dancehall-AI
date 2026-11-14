import { beforeEach, describe, expect, it, vi } from 'vitest';

const vault = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => vault.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void vault.set(k, v),
  deleteItemAsync: async (k: string) => void vault.delete(k),
}));
const { secureStorage } = await import('./secureStorage');
const { createSupabaseStore } = await import('./supabaseStore');

beforeEach(() => vault.clear());

describe('secure session storage', () => {
  it('round-trips a session larger than the 2KB SecureStore limit, in chunks', async () => {
    const big = JSON.stringify({ token: 'x'.repeat(9000) });
    await secureStorage.setItem('sb-test-auth-token', big);
    expect([...vault.values()].every((v) => v.length <= 1800 || v.length < 5)).toBe(true);
    expect(await secureStorage.getItem('sb-test-auth-token')).toBe(big);
  });
  it('a missing chunk reads as signed out, never as a corrupt session', async () => {
    await secureStorage.setItem('k', 'y'.repeat(5000));
    vault.delete([...vault.keys()].find((k) => k.endsWith('.1'))!);
    expect(await secureStorage.getItem('k')).toBeNull();
  });
  it('overwriting leaves no stale chunks, and removal clears everything', async () => {
    await secureStorage.setItem('k', 'a'.repeat(9000));
    await secureStorage.setItem('k', 'b');
    expect(vault.size).toBe(2);
    await secureStorage.removeItem('k');
    expect(vault.size).toBe(0);
  });
});

describe('session restoration', () => {
  const KEY = 'sb-x-auth-token';
  const seed = (expiresAt: number) =>
    secureStorage.setItem(
      KEY,
      JSON.stringify({
        access_token: 'a.b.c',
        refresh_token: 'r',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expiresAt,
        user: {
          id: 'u1',
          email: 'p@example.test',
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      }),
    );
  const open = () =>
    createSupabaseStore({
      url: 'https://x.supabase.example.test',
      publishableKey: 'sb_publishable_test',
      storage: secureStorage,
    });

  it('restores a valid session from secure storage on app start', async () => {
    await seed(Math.floor(Date.now() / 1000) + 3600);
    expect(await open().getSession()).toEqual({
      userId: 'u1',
      email: 'p@example.test',
      mode: 'supabase',
    });
  });
  it('starts signed out when nothing is stored', async () => {
    expect(await open().getSession()).toBeNull();
  });
  it('starts signed out when the stored session is unreadable', async () => {
    await secureStorage.setItem(KEY, '{not json');
    expect(await open().getSession()).toBeNull();
  });
});
