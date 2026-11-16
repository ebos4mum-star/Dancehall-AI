import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { brand } from '@/theme/tokens';

/** Each main tab has its own environment. They share lighting, palette, framing and the stage floor, so they read as one world. */
export const WORLDS = ['today', 'dance', 'food', 'coach', 'me', 'friends', 'progress'] as const;
export type World = (typeof WORLDS)[number];

const SKY: Record<World, [string, string, string]> = {
  today: ['#1A0E2E', brand.plum, '#3A2072'],
  dance: ['#1A0E2E', '#33164F', '#5A1F6B'],
  food: ['#1F1030', '#3B1B4A', '#6B2A55'],
  coach: ['#160B29', '#2A1A52', '#3F2C85'],
  me: ['#1A0E2E', '#2A1850', '#4A3290'],
  friends: ['#1A0E2E', '#2B1650', '#5B2F7A'],
  progress: ['#150B29', '#25194F', '#3E3A8C'],
};

function Props({ world }: { world: World }) {
  switch (world) {
    case 'dance':
      return (
        <G>
          {/* three coloured stage beams */}
          <Polygon points="70,0 96,0 150,250 20,250" fill={brand.coral} opacity={0.1} />
          <Polygon points="196,0 224,0 300,250 130,250" fill={brand.violet} opacity={0.14} />
          <Polygon points="300,0 322,0 360,230 270,230" fill={brand.lime} opacity={0.08} />
          {/* equalizer bars along the floor edge */}
          {[16, 30, 18, 38, 24, 44, 20, 34, 14, 40, 22, 30].map((h, k) => (
            <Rect
              key={k}
              x={14 + k * 29}
              y={248 - h}
              width="12"
              height={h}
              rx="6"
              fill={k % 3 === 0 ? brand.lime : brand.violet}
              opacity={0.35}
            />
          ))}
          <Path
            d="M0 70 Q90 40 180 70 T360 60"
            stroke={brand.coral}
            strokeWidth="1.5"
            fill="none"
            opacity={0.3}
          />
        </G>
      );
    case 'food':
      return (
        <G>
          {/* pendant lamps with a warm glow */}
          {[70, 180, 290].map((x, k) => (
            <G key={x}>
              <Path
                d={`M${x} 0 V${34 + k * 6}`}
                stroke={brand.violet}
                strokeWidth="1.5"
                opacity={0.6}
              />
              <Ellipse cx={x} cy={48 + k * 6} rx="26" ry="14" fill={brand.coral} opacity={0.35} />
              <Ellipse cx={x} cy={48 + k * 6} rx="46" ry="30" fill={brand.coral} opacity={0.08} />
            </G>
          ))}
          {/* counter, bowl and plate */}
          <Rect x="0" y="236" width="360" height="12" fill="#4A2B8C" opacity={0.9} />
          <Path d="M46 232 Q86 276 126 232 Z" fill={brand.violet} opacity={0.55} />
          <Ellipse cx="86" cy="231" rx="40" ry="6" fill={brand.lime} opacity={0.35} />
          <Ellipse cx="150" cy="238" rx="34" ry="7" fill={brand.ivory} opacity={0.2} />
          {/* steam and leaves */}
          <Path
            d="M80 214 Q74 200 82 188 Q90 176 82 164"
            stroke={brand.ivory}
            strokeWidth="2"
            fill="none"
            opacity={0.25}
            strokeLinecap="round"
          />
          <Path
            d="M96 214 Q104 202 96 190"
            stroke={brand.ivory}
            strokeWidth="2"
            fill="none"
            opacity={0.2}
            strokeLinecap="round"
          />
          <Path d="M300 236 Q320 200 346 214 Q330 240 300 236 Z" fill={brand.lime} opacity={0.28} />
        </G>
      );
    case 'coach':
      return (
        <G>
          {/* soft speech bubbles drifting in the dark */}
          <Rect x="22" y="40" width="96" height="46" rx="22" fill={brand.violet} opacity={0.18} />
          <Path d="M40 86 L34 104 L58 86 Z" fill={brand.violet} opacity={0.18} />
          <Rect x="236" y="96" width="92" height="44" rx="22" fill={brand.lime} opacity={0.1} />
          <Path d="M300 140 L312 158 L286 140 Z" fill={brand.lime} opacity={0.1} />
          <Circle cx="48" cy="60" r="3" fill={brand.ivory} opacity={0.5} />
          <Circle cx="62" cy="60" r="3" fill={brand.ivory} opacity={0.4} />
          <Circle cx="76" cy="60" r="3" fill={brand.ivory} opacity={0.3} />
          <Path
            d="M10 200 Q120 150 230 190 T360 170"
            stroke={brand.violet}
            strokeWidth="1.5"
            strokeDasharray="3 6"
            fill="none"
            opacity={0.5}
          />
        </G>
      );
    case 'me':
      return (
        <G>
          {/* ascending steps, a flag and small stars: personal growth */}
          <Rect x="20" y="214" width="84" height="34" rx="6" fill="#4A2B8C" opacity={0.9} />
          <Rect x="92" y="190" width="84" height="58" rx="6" fill="#5B3AA6" opacity={0.9} />
          <Rect x="164" y="164" width="84" height="84" rx="6" fill="#6B49BD" opacity={0.9} />
          <Path d="M206 164 V120" stroke={brand.ivory} strokeWidth="2.5" opacity={0.7} />
          <Path d="M206 120 L238 132 L206 144 Z" fill={brand.coral} />
          {[
            { x: 40, y: 60 },
            { x: 120, y: 90 },
            { x: 300, y: 50 },
            { x: 330, y: 120 },
            { x: 260, y: 30 },
          ].map(({ x, y }, k) => (
            <Path
              key={k}
              d={`M${x} ${y - 6} L${x + 2} ${y - 2} L${x + 6} ${y} L${x + 2} ${y + 2} L${x} ${y + 6} L${x - 2} ${y + 2} L${x - 6} ${y} L${x - 2} ${y - 2} Z`}
              fill={brand.lime}
              opacity={0.55}
            />
          ))}
        </G>
      );
    case 'friends':
      return (
        <G>
          {/* a warm campfire glow with lanterns strung between friends */}
          <Ellipse cx="180" cy="232" rx="90" ry="22" fill={brand.coral} opacity={0.12} />
          <Path d="M168 238 Q180 196 192 238 Z" fill={brand.coral} opacity={0.6} />
          <Path d="M174 238 Q180 214 186 238 Z" fill={brand.lime} opacity={0.5} />
          <Path
            d="M0 40 Q90 90 180 50 T360 44"
            stroke={brand.violet}
            strokeWidth="1.5"
            fill="none"
            opacity={0.5}
          />
          {[40, 110, 180, 250, 320].map((x, k) => (
            <Circle
              key={x}
              cx={x}
              cy={k % 2 ? 72 : 62}
              r="7"
              fill={k % 2 ? brand.lime : brand.coral}
              opacity={0.55}
            />
          ))}
          {[60, 300].map((x) => (
            <G key={x}>
              <Circle cx={x} cy="206" r="14" fill="#4A2B8C" opacity={0.85} />
              <Rect
                x={x - 16}
                y="218"
                width="32"
                height="30"
                rx="14"
                fill="#4A2B8C"
                opacity={0.85}
              />
            </G>
          ))}
        </G>
      );
    case 'progress':
      return (
        <G>
          {/* a landscape: far hills, a winding path to a flag, a rising sun */}
          <Circle cx="290" cy="86" r="30" fill={brand.lime} opacity={0.16} />
          <Circle cx="290" cy="86" r="16" fill={brand.lime} opacity={0.3} />
          <Path
            d="M0 200 Q70 120 150 190 T300 170 T360 190 V250 H0 Z"
            fill="#3B2A7E"
            opacity={0.85}
          />
          <Path d="M0 226 Q90 170 190 216 T360 206 V250 H0 Z" fill="#4C3699" opacity={0.95} />
          <Path
            d="M120 250 Q150 224 190 220 Q240 214 250 190"
            stroke={brand.ivory}
            strokeWidth="3"
            strokeDasharray="2 7"
            strokeLinecap="round"
            fill="none"
            opacity={0.45}
          />
          <Path d="M250 190 V150" stroke={brand.ivory} strokeWidth="2.5" opacity={0.75} />
          <Path d="M250 150 L278 160 L250 170 Z" fill={brand.coral} />
          {[
            { x: 50, y: 50 },
            { x: 150, y: 36 },
            { x: 214, y: 70 },
            { x: 330, y: 40 },
          ].map(({ x, y }) => (
            <Circle key={x} cx={x} cy={y} r="2" fill={brand.ivory} opacity={0.6} />
          ))}
        </G>
      );
    default:
      return null;
  }
}

/**
 * The layered environment behind a hero: sky, rhythm arcs, a world-specific prop layer, curtains, spotlight and a lime-rimmed floor. Static art
 * with one slowly drifting glow (stops under reduced motion). Decorative: hidden from screen readers. Absolutely fills its parent.
 */
export function SceneBackdrop({ world = 'today' }: { world?: World }) {
  const reduced = useReducedMotion();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      drift.setValue(0);
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: ease, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: ease, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [reduced, drift]);
  const [a, b, c] = SKY[world];
  const id = `sb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 360 320"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute' }}
      >
        <Defs>
          <LinearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={a} />
            <Stop offset="0.6" stopColor={b} />
            <Stop offset="1" stopColor={c} />
          </LinearGradient>
          <LinearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#4A2B8C" />
            <Stop offset="1" stopColor="#1F1136" />
          </LinearGradient>
          <LinearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={brand.ivory} stopOpacity="0.14" />
            <Stop offset="1" stopColor={brand.ivory} stopOpacity="0" />
          </LinearGradient>
          <RadialGradient id={`${id}-curtain`} cx="0.5" cy="0.5" rx="0.6" ry="0.8">
            <Stop offset="0" stopColor="#4A2B8C" />
            <Stop offset="1" stopColor="#1A0E2E" />
          </RadialGradient>
        </Defs>
        <Rect width="360" height="320" fill={`url(#${id}-sky)`} />
        <Circle
          cx="240"
          cy="190"
          r="150"
          stroke={brand.violet}
          strokeWidth="1.5"
          fill="none"
          opacity={0.16}
        />
        <Circle
          cx="240"
          cy="190"
          r="110"
          stroke={brand.violet}
          strokeWidth="1.5"
          fill="none"
          opacity={0.22}
        />
        <Circle
          cx="240"
          cy="190"
          r="72"
          stroke={brand.lime}
          strokeWidth="1.5"
          fill="none"
          opacity={0.18}
        />
        <Polygon points="226,0 254,0 330,240 150,240" fill={`url(#${id}-beam)`} />
        <Props world={world} />
        <Path d="M0 0 H40 C30 70 46 150 26 250 L0 262 Z" fill={`url(#${id}-curtain)`} />
        <Path d="M360 0 H322 C332 66 316 150 338 250 L360 262 Z" fill={`url(#${id}-curtain)`} />
        <Path
          d="M40 0 C30 70 46 150 26 250"
          stroke={brand.violet}
          strokeWidth="1.5"
          fill="none"
          opacity={0.45}
        />
        <Path
          d="M322 0 C332 66 316 150 338 250"
          stroke={brand.violet}
          strokeWidth="1.5"
          fill="none"
          opacity={0.45}
        />
        <Path d="M0 250 Q180 214 360 250 L360 320 L0 320 Z" fill={`url(#${id}-floor)`} />
        <Path
          d="M0 250 Q180 214 360 250"
          stroke={brand.lime}
          strokeWidth="2"
          fill="none"
          opacity={0.5}
        />
        <Path
          d="M180 232 L110 320 M180 232 L250 320 M180 232 L20 320 M180 232 L340 320"
          stroke={brand.violet}
          strokeWidth="1"
          opacity={0.18}
        />
        <Ellipse cx="240" cy="262" rx="78" ry="12" fill={brand.violet} opacity={0.26} />
      </Svg>
      <Animated.View
        style={{
          position: 'absolute',
          right: -20,
          top: 10,
          width: 280,
          height: 280,
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={`${id}-glow`} cx="0.5" cy="0.5" rx="0.5" ry="0.5">
              <Stop offset="0" stopColor={brand.violet} stopOpacity="0.45" />
              <Stop offset="1" stopColor={brand.violet} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#${id}-glow)`} />
        </Svg>
      </Animated.View>
    </View>
  );
}
