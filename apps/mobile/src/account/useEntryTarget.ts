import { useApp } from '@/data/AppProvider';
import { useAccount } from './AccountProvider';

/**
 * Where a person with an account must go before they can use the app, or null when they may. Used by the entry screen and the tabs, so neither sends the other
 * round in a circle: the Recovery Key backup, then a PIN (this also catches a setup that was interrupted after the account was made), then onboarding. A guest has no target.
 */
export function useEntryTarget():
  '/account/recovery-key' | '/account/pin?mode=protect' | '/onboarding' | null {
  const { ready, session, profile } = useApp();
  const account = useAccount();
  if (!ready || !session || !account.ready) return null;
  // The Recovery Key must be saved and confirmed before anything else, so an interrupted setup resumes at the key and never leaves an account nobody can recover.
  if (account.backup === 'pending') return '/account/recovery-key';
  if (!account.pinSet) return '/account/pin?mode=protect';
  if (!profile?.onboardedAt) return '/onboarding';
  return null;
}
