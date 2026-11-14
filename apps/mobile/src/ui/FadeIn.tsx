import { useEffect, useRef, type ReactNode } from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { motion } from '@/theme/tokens';

/** Purposeful entrance animation that is skipped entirely when the user prefers reduced motion. */
export function FadeIn({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.normal,
      useNativeDriver: true,
    }).start();
  }, [reduced, opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}
