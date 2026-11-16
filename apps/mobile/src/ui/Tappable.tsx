import { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '@/a11y/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A pressable that answers the finger: it dips slightly while held and dims a touch, so a selectable card never feels dead.
 * With Reduce Motion it only dims (no movement). It is a plain Pressable underneath: roles, labels, state and hit area are the caller's, unchanged.
 */
export function Tappable({
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [down, setDown] = useState(false);
  const to = (v: number) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: v, speed: 40, bounciness: 4, useNativeDriver: true }).start();
  };
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        setDown(true);
        to(0.97);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setDown(false);
        to(1);
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }], opacity: down && !disabled ? 0.88 : 1 }]}
    />
  );
}
