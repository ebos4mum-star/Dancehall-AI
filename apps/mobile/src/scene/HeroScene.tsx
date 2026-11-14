import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { brand, radius } from '@/theme/tokens';

/**
 * The Today hero environment: a small illustrated dance hall stage, built from four static depth layers (backdrop, rhythm arcs, curtains and
 * spotlight, floor). Only the glow layer drifts, slowly, with the native driver; with reduced motion nothing moves. Decorative: hidden from
 * screen readers. Content (greeting, Pulse, status chips) is passed as children and laid over the scene.
 */
export function HeroScene({ children, height = 320 }: { children: ReactNode; height?: number }) {
  const reduced = useReducedMotion();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      drift.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 9000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [reduced, drift]);

  return (
    <View
      style={{
        height,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: brand.plum,
        shadowColor: brand.plum,
        shadowOpacity: 0.35,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        {/* 1. backdrop: midnight to violet haze */}
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 360 320"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute' }}
        >
          <Defs>
            <LinearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#1A0E2E" />
              <Stop offset="0.6" stopColor={brand.plum} />
              <Stop offset="1" stopColor="#3A2072" />
            </LinearGradient>
            <LinearGradient id="hs-floor" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#4A2B8C" />
              <Stop offset="1" stopColor="#1F1136" />
            </LinearGradient>
            <LinearGradient id="hs-beam" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={brand.ivory} stopOpacity="0.16" />
              <Stop offset="1" stopColor={brand.ivory} stopOpacity="0" />
            </LinearGradient>
            <RadialGradient id="hs-curtain" cx="0.5" cy="0.5" rx="0.6" ry="0.8">
              <Stop offset="0" stopColor="#4A2B8C" />
              <Stop offset="1" stopColor="#1A0E2E" />
            </RadialGradient>
          </Defs>
          <Rect width="360" height="320" fill="url(#hs-sky)" />
          {/* 2. rhythm arcs: static, low contrast */}
          <Circle
            cx="240"
            cy="190"
            r="150"
            stroke={brand.violet}
            strokeWidth="1.5"
            fill="none"
            opacity={0.18}
          />
          <Circle
            cx="240"
            cy="190"
            r="110"
            stroke={brand.violet}
            strokeWidth="1.5"
            fill="none"
            opacity={0.26}
          />
          <Circle
            cx="240"
            cy="190"
            r="72"
            stroke={brand.lime}
            strokeWidth="1.5"
            fill="none"
            opacity={0.2}
          />
          {/* 3. spotlight beam from above Pulse */}
          <Polygon points="226,0 254,0 330,240 150,240" fill="url(#hs-beam)" />
          {/* curtains frame the stage */}
          <Path d="M0 0 H46 C34 70 52 150 30 250 L0 262 Z" fill="url(#hs-curtain)" />
          <Path d="M360 0 H318 C330 66 312 150 336 250 L360 262 Z" fill="url(#hs-curtain)" />
          <Path
            d="M46 0 C34 70 52 150 30 250"
            stroke={brand.violet}
            strokeWidth="1.5"
            fill="none"
            opacity={0.5}
          />
          <Path
            d="M318 0 C330 66 312 150 336 250"
            stroke={brand.violet}
            strokeWidth="1.5"
            fill="none"
            opacity={0.5}
          />
          {/* 4. floor with a lime rim and perspective lines */}
          <Path d="M0 250 Q180 214 360 250 L360 320 L0 320 Z" fill="url(#hs-floor)" />
          <Path
            d="M0 250 Q180 214 360 250"
            stroke={brand.lime}
            strokeWidth="2"
            fill="none"
            opacity={0.55}
          />
          <Path
            d="M180 232 L110 320 M180 232 L250 320 M180 232 L20 320 M180 232 L340 320"
            stroke={brand.violet}
            strokeWidth="1"
            opacity={0.2}
          />
          <Ellipse cx="240" cy="262" rx="78" ry="12" fill={brand.violet} opacity={0.28} />
          {/* a few fixed sparks of warm light */}
          <Circle cx="26" cy="190" r="2" fill={brand.coral} opacity={0.7} />
          <Circle cx="300" cy="64" r="2.5" fill={brand.lime} opacity={0.7} />
          <Circle cx="206" cy="30" r="1.6" fill={brand.ivory} opacity={0.6} />
        </Svg>
        {/* drifting glow behind Pulse (the only moving layer) */}
        <Animated.View
          style={{
            position: 'absolute',
            right: -20,
            top: 20,
            width: 280,
            height: 280,
            transform: [
              { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] }) },
            ],
          }}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 100">
            <Defs>
              <RadialGradient id="hs-glow" cx="0.5" cy="0.5" rx="0.5" ry="0.5">
                <Stop offset="0" stopColor={brand.violet} stopOpacity="0.5" />
                <Stop offset="1" stopColor={brand.violet} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#hs-glow)" />
          </Svg>
        </Animated.View>
      </View>
      {children}
    </View>
  );
}
