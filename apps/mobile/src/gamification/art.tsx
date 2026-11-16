import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { BadgeId } from '@dancehall/shared';
import { brand } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { useId } from 'react';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * A progress bar that fills with an ease when the value rises (and never animates when motion is off or Reduce Motion is on). It is a true progressbar for assistive
 * technology: the label and value are always current, whatever the animation is doing. Uses a transform (native driver), not layout.
 */
export function AnimatedBar({
  fraction,
  label,
  motion,
  height = 12,
  color,
  track,
}: {
  fraction: number;
  label: string;
  motion: boolean;
  height?: number;
  color?: string;
  track?: string;
}) {
  const { colors } = useTheme();
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const v = useRef(new Animated.Value(motion ? 0 : f)).current;
  const [w, setW] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (!motion) {
      v.setValue(f);
      first.current = false;
      return;
    }
    Animated.timing(v, {
      toValue: f,
      duration: first.current ? 700 : 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    first.current = false;
  }, [f, motion, v]);
  const pct = Math.round(f * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{
        height,
        borderRadius: height,
        backgroundColor: track ?? colors.border,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{
          // Hidden until measured, so the bar never flashes full before it fills.
          opacity: w ? 1 : 0,
          width: w || '100%',
          height: '100%',
          borderRadius: height,
          backgroundColor: color ?? colors.primary,
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-(w || 0), 0] }) },
          ],
        }}
      />
    </View>
  );
}

/** A small spring "pop" for something that just became true (a quest ticked, a badge earned). Static when motion is off. */
export function Pop({
  on,
  motion,
  children,
}: {
  on: boolean;
  motion: boolean;
  children: ReactNode;
}) {
  const s = useRef(new Animated.Value(1)).current;
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current && motion) {
      s.setValue(0.6);
      Animated.spring(s, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: true }).start();
    }
    was.current = on;
  }, [on, motion, s]);
  return <Animated.View style={{ transform: [{ scale: s }] }}>{children}</Animated.View>;
}

/** The level medallion: a violet ring with the level number. */
export function LevelBadge({ level, size = 64 }: { level: number; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
      <Defs>
        <LinearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={brand.violet} />
          <Stop offset="1" stopColor={brand.plum} />
        </LinearGradient>
      </Defs>
      <Circle cx="32" cy="32" r="29" fill={`url(#${uid}g)`} />
      <Circle cx="32" cy="32" r="29" fill="none" stroke={brand.lime} strokeWidth={3} />
      <Circle
        cx="32"
        cy="32"
        r="23"
        fill="none"
        stroke={brand.ivory}
        strokeWidth={1}
        opacity={0.35}
      />
      <SvgText
        x="32"
        y={level >= 100 ? 39 : 41}
        fontSize={level >= 100 ? 18 : 26}
        fontWeight="800"
        fill={brand.ivory}
        textAnchor="middle"
      >
        {String(level)}
      </SvgText>
    </Svg>
  );
}

const BADGE_LOOK: Record<BadgeId, { icon: IconName; a: string; b: string }> = {
  level_5: { icon: 'star', a: '#E2A56B', b: '#9B5E2A' },
  level_10: { icon: 'star', a: '#F5D76E', b: '#C79A1B' },
  streak_7: { icon: 'flame', a: '#FF9A7E', b: '#E04E2E' },
  streak_30: { icon: 'flame', a: '#F5D76E', b: '#E04E2E' },
  quests_10: { icon: 'checkmark-done', a: '#BBA5F6', b: '#6B4BB8' },
  rest_respected: { icon: 'moon', a: '#D2F27A', b: '#6FA41D' },
  season_finisher: { icon: 'leaf', a: '#9DE0C2', b: '#2F9C74' },
};

/** A collectible badge: a faceted medallion with its glyph. Locked badges are a grey silhouette with a lock. Drawn here, no image files. */
export function BadgeArt({
  id,
  earned,
  size = 72,
}: {
  id: BadgeId;
  earned: boolean;
  size?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const look = BADGE_LOOK[id];
  const a = earned ? look.a : '#D9D4E4';
  const b = earned ? look.b : '#A9A2BC';
  return (
    <View
      accessible={false}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} viewBox="0 0 72 72" style={{ position: 'absolute' }}>
        <Defs>
          <LinearGradient id={`${uid}m`} x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="1" stopColor={b} />
          </LinearGradient>
        </Defs>
        <G>
          <Path
            d="M36 4 L62 18 V46 C62 58 50 66 36 70 C22 66 10 58 10 46 V18 Z"
            fill={`url(#${uid}m)`}
          />
          <Path
            d="M36 4 L62 18 V46 C62 58 50 66 36 70 C22 66 10 58 10 46 V18 Z"
            fill="none"
            stroke={earned ? brand.ivory : '#8E87A3'}
            strokeWidth={2.5}
            opacity={0.9}
          />
          <Path
            d="M36 12 L55 22 V45 C55 54 46 60 36 63 C26 60 17 54 17 45 V22 Z"
            fill="none"
            stroke={brand.ivory}
            strokeWidth={1.2}
            opacity={earned ? 0.5 : 0.35}
          />
          <Path
            d="M20 24 Q36 14 52 24"
            stroke={brand.ivory}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
            opacity={earned ? 0.45 : 0.2}
          />
        </G>
      </Svg>
      <Ionicons
        name={earned ? look.icon : 'lock-closed'}
        size={size * 0.38}
        color={earned ? brand.plum : '#6E6785'}
      />
    </View>
  );
}
