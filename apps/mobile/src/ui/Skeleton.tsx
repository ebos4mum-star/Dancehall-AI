import { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/** A quiet placeholder block. It pulses gently, or stays still when the person has reduced motion on. */
export function SkeletonBlock({
  width = '100%',
  height = 14,
}: {
  width?: DimensionValue;
  height?: number;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const o = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduced) {
      o.setValue(0.55);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.55, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, o]);
  return (
    <Animated.View
      style={{ width, height, borderRadius: radius.sm, backgroundColor: colors.border, opacity: o }}
    />
  );
}

/** Card-shaped loading state: a heading bar and `lines` text bars. Announced once as "Loading". */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <SkeletonBlock width="45%" height={20} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBlock key={i} width={i === lines - 1 ? '70%' : '100%'} />
      ))}
    </View>
  );
}

/** A few skeleton cards with one accessible "Loading" label for the whole group. */
export function SkeletonList({ cards = 3, label }: { cards?: number; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md }}
    >
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i} lines={i === 0 ? 3 : 2} />
      ))}
    </View>
  );
}
