import { useCallback } from 'react';
import { useProgression } from '@/gamification/progressionStore';
import { play, type FeedbackKind } from '@/ui/feedback';

/** Haptics that follow the person's Pulse celebrations setting. */
export function useFeedback(): (kind: FeedbackKind) => void {
  const level = useProgression().policy.level;
  return useCallback((kind: FeedbackKind) => play(level, kind), [level]);
}
export function useMotionAllowed(): boolean {
  return useProgression().policy.motion;
}
