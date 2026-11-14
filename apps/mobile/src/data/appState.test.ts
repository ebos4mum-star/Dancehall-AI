import { describe, expect, it } from 'vitest';
import { loadAppState, type AppSnapshot } from './appState';
import type { DataStore, Profile, Session } from './types';

const S: Session = { userId: 'u1', email: 'a@example.test', mode: 'supabase' };
const P = { displayName: 'A', locale: 'en', onboardedAt: '2026-06-01T00:00:00Z' } as Profile;
const empty: AppSnapshot = { session: null, profile: null, loadError: false };
const mk = (o: Partial<DataStore>) => o as DataStore;

describe('loadAppState', () => {
  it('signed out when there is no session', async () => {
    const r = await loadAppState(mk({ getSession: async () => null }), {
      session: S,
      profile: P,
      loadError: false,
    });
    expect(r).toEqual(empty);
  });
  it('loads session and profile', async () => {
    const r = await loadAppState(
      mk({ getSession: async () => S, getProfile: async () => P }),
      empty,
    );
    expect(r).toEqual({ session: S, profile: P, loadError: false });
  });
  it('profile fetch failure keeps the user signed in and flags a load error (not "not onboarded")', async () => {
    const r = await loadAppState(
      mk({
        getSession: async () => S,
        getProfile: async () => {
          throw new Error('offline');
        },
      }),
      empty,
    );
    expect(r).toEqual({ session: S, profile: null, loadError: true });
  });
  it('keeps the previous profile for the same user when a refresh fails', async () => {
    const r = await loadAppState(
      mk({
        getSession: async () => S,
        getProfile: async () => {
          throw new Error('offline');
        },
      }),
      { session: S, profile: P, loadError: false },
    );
    expect(r).toEqual({ session: S, profile: P, loadError: true });
  });
  it('a session read failure never signs the user out', async () => {
    const r = await loadAppState(
      mk({
        getSession: async () => {
          throw new Error('offline');
        },
      }),
      { session: S, profile: P, loadError: false },
    );
    expect(r).toEqual({ session: S, profile: P, loadError: true });
  });
  it('a different user never inherits the previous profile', async () => {
    const r = await loadAppState(
      mk({
        getSession: async () => ({ ...S, userId: 'u2' }),
        getProfile: async () => {
          throw new Error('x');
        },
      }),
      { session: S, profile: P, loadError: false },
    );
    expect(r.profile).toBeNull();
  });
  it('housekeeping failures do not block loading', async () => {
    const r = await loadAppState(
      mk({
        getSession: async () => S,
        getProfile: async () => P,
        purgeExpiredPhotos: async () => {
          throw new Error('x');
        },
      }),
      empty,
    );
    expect(r.loadError).toBe(false);
  });
});
