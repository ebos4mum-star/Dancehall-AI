import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { motion, spacing } from '@/theme/tokens';

/**
 * Carries the person from one step to the next: the new step fades in while rising a few pixels, so a step change reads as turning a page, not a jump cut.
 * With Reduce Motion the step simply appears. The animation replays whenever `stepKey` changes.
 */
export function StepTransition({
  stepKey,
  children,
}: {
  stepKey: string | number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    Animated.timing(v, {
      toValue: 1,
      duration: motion.normal + 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [stepKey, reduced, v]);
  return (
    <Animated.View
      style={{
        gap: spacing.md,
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
