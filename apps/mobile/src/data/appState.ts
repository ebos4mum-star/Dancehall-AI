import type { DataStore, Profile, Session } from './types';

export interface AppSnapshot {
  session: Session | null;
  profile: Profile | null;
  /** True when the session or profile could not be read (offline, server error). The user is NOT treated as signed out or un-onboarded. */
  loadError: boolean;
}

/**
 * Reads the session and profile. A failure is reported as `loadError` and never as "signed out":
 * a network blip must not send an onboarded user to sign-in or onboarding.
 * An already-known session is kept when a refresh fails.
 */
export async function loadAppState(store: DataStore, prev: AppSnapshot): Promise<AppSnapshot> {
  let session: Session | null;
  try {
    session = await store.getSession();
  } catch {
    return { ...prev, loadError: true };
  }
  if (!session) return { session: null, profile: null, loadError: false };
  try {
    // Housekeeping; failures here must never block loading.
    await store.purgeExpiredPhotos?.().catch(() => 0);
    await store.purgeOldCoachData?.().catch(() => 0);
    const profile = await store.getProfile();
    return { session, profile, loadError: false };
  } catch {
    return {
      session,
      profile: prev.session?.userId === session.userId ? prev.profile : null,
      loadError: true,
    };
  }
}
