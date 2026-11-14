import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { motion } from '@/theme/tokens';

/**
 * Reusable motion kit. Every animation is short and purposeful, and every one collapses to "no animation" when the person has
 * turned on reduced motion in their system settings.
 */

/** Gentle press feedback (scale). Spread the returned handlers onto a Pressable and apply `style` to an Animated.View. */
export function usePressScale() {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };
  return { style: { transform: [{ scale }] }, onPressIn: () => to(0.97), onPressOut: () => to(1) };
}

/** Animates a number toward a new target (for calorie totals). With reduced motion it jumps straight to the value. */
export function useCountUp(target: number, durationMs: number = motion.slow): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduced]);
  return value;
}

/** Fade-and-rise entrance, staggered by `delay`. */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, {
      toValue: 1,
      duration: motion.normal,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduced, v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** A slow, subtle idle float for hero artwork. Static with reduced motion. */
export function Floating({ children, distance = 5 }: { children: ReactNode; distance?: number }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, v]);
  return (
    <Animated.View
      style={{
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** A circular progress ring that animates to its value. `fraction` may exceed 1 (the ring then reads as full). */
export function Ring({
  size = 120,
  stroke = 12,
  fraction,
  color,
  track,
  children,
}: {
  size?: number;
  stroke?: number;
  fraction: number;
  color: string;
  track: string;
  children?: ReactNode;
}) {
  const pct = useCountUp(Math.round(Math.min(1, Math.max(0, fraction)) * 100));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c}`}
          strokeDashoffset={c * (1 - pct / 100)}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}
