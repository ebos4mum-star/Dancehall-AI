import { useApp } from '@/data/AppProvider';
import { useAccount } from './AccountProvider';

/**
 * Where a person with an account must go before they can use the app, or null when they may. Used by the entry screen and the tabs, so neither sends the other
 * round in a circle: a PIN first (this also catches a setup that was interrupted after the account was made), then onboarding. A guest has no target.
 */
export function useEntryTarget(): '/account/pin?mode=protect' | '/onboarding' | null {
  const { ready, session, profile } = useApp();
  const account = useAccount();
  if (!ready || !session || !account.ready) return null;
  if (!account.pinSet) return '/account/pin?mode=protect';
  if (!profile?.onboardedAt) return '/onboarding';
  return null;
}
