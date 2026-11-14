import { useSyncExternalStore } from 'react';
import type { PulseState } from '@/pulse/machine';

/**
 * Review aids for the private design-review build ONLY (EXPO_PUBLIC_PREVIEW_REVIEW=1). They let a reviewer replay Pulse's states and switch
 * motion and theme without waiting for real events. Never active in a production build, and never active outside mock authentication.
 */
export function reviewEnabled(env: Record<string, string | undefined>): boolean {
  return (
    env.EXPO_PUBLIC_PREVIEW_REVIEW === '1' &&
    env.EXPO_PUBLIC_APP_ENV !== 'production' &&
    (env.EXPO_PUBLIC_AUTH_MODE ?? 'mock') === 'mock'
  );
}
/** Expo inlines only static `process.env.EXPO_PUBLIC_*` references, so each one is spelled out. */
export const REVIEW = reviewEnabled({
  EXPO_PUBLIC_PREVIEW_REVIEW: process.env.EXPO_PUBLIC_PREVIEW_REVIEW,
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_AUTH_MODE: process.env.EXPO_PUBLIC_AUTH_MODE,
});

export interface ReviewState {
  pulse: PulseState | null;
  reduced: boolean | null;
  dark: boolean | null;
}
let state: ReviewState = { pulse: null, reduced: null, dark: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const getReview = (): ReviewState => state;
export function setReview(patch: Partial<ReviewState>): void {
  if (!REVIEW) return;
  state = { ...state, ...patch };
  emit();
}
export function useReview(): ReviewState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getReview,
    getReview,
  );
}
