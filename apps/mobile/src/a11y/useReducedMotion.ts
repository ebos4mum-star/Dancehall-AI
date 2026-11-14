import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReview } from '@/preview/review';

/** Follows the system "reduce motion" setting. Animations must collapse to instant when this is true. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const review = useReview();
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return review.reduced ?? reduced;
}
