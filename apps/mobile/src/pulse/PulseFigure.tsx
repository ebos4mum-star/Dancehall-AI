import { useId } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import type { CosmeticId } from '@dancehall/shared';
import { usePulseCosmetics } from './cosmetics';
import type { Flourish } from './moment';
import { brand } from '@/theme/tokens';
import type { PulseState } from './machine';

/**
 * Pulse: a luminous, softly rounded energy form (docs/CHARACTER_BRIEF_PULSE.md). Satin violet body shading to plum, emissive lime eyes and
 * chest pulse line, coral rim light for celebration only, two tapered arms and a trailing ribbon. No mouth except a faint arc when
 * celebrating, no fingers, no feet, no text. Each state has an authored still pose, so reduced-motion shows the same information.
 * Pure vector art: this is the first renderer behind the stage interface, not the final 3D production asset.
 */
const POSES: Record<PulseState, { l: number; r: number }> = {
  idle: { l: 14, r: -14 },
  welcome: { l: 58, r: -58 },
  dance: { l: 150, r: -38 },
  celebrate: { l: 158, r: -158 },
  encourage: { l: 22, r: -72 },
};
/** The second dance pose; the stage alternates between the two at a slow, fixed beat. */
export const DANCE_ALT = { l: 38, r: -150 };

const ARM = 'M0 -2 C 12 2 15 30 10 58 C 8 70 -8 70 -10 58 C -15 30 -12 2 0 -2 Z';
const BODY =
  'M100 28 C 138 28 160 62 160 104 C 160 150 140 206 100 210 C 60 206 40 150 40 104 C 40 62 62 28 100 28 Z';

const PULSE_LINE: Record<PulseState, string> = {
  idle: 'M68 134 H84 L91 124 L100 142 L108 128 L114 134 H132',
  welcome: 'M68 134 H82 L90 118 L100 148 L110 124 L116 134 H132',
  dance: 'M68 134 H80 L88 120 L96 146 L104 122 L112 144 L118 134 H132',
  celebrate: 'M66 134 H78 L88 108 L100 158 L112 112 L122 134 H134',
  encourage: 'M68 134 H86 L93 126 L100 140 L107 130 L112 134 H132',
};

export function PulseFigure({
  state,
  size = 160,
  beat = 0,
  flourish,
  cosmetics,
  blink = false,
}: {
  state: PulseState;
  size?: number;
  /** A small decoration for the occasion (stars, flame, confetti, heart, shield). Decorative only. */
  flourish?: Flourish;
  /** Show exactly these accessories instead of what Pulse is wearing (for the wardrobe preview). */
  cosmetics?: readonly CosmeticId[];
  /** 0 or 1: which dance pose to show. Ignored for other states. */
  beat?: 0 | 1;
  /** A momentary blink: the eyes close for an instant. Driven by the stage, idle only. */
  blink?: boolean;
}) {
  // SVG ids are document-global: every instance needs its own, or hidden tabs' gradients shadow the visible figure.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const wornNow = usePulseCosmetics();
  const worn = new Set(cosmetics ?? wornNow);
  const pose = state === 'dance' && beat === 1 ? DANCE_ALT : POSES[state];
  const celebrate = state === 'celebrate';
  const encourage = state === 'encourage';
  const eyeRy = blink ? 1.6 : state === 'welcome' ? 14 : encourage ? 9.5 : 12.5;
  return (
    <Svg width={size} height={size * (262 / 280)} viewBox="-40 -12 280 262">
      <Defs>
        <LinearGradient id={`${uid}-body`} x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#BBA5F6" />
          <Stop offset="0.42" stopColor={brand.violet} />
          <Stop offset="1" stopColor="#3B2270" />
        </LinearGradient>
        <RadialGradient id={`${uid}-shade`} cx="0.5" cy="0.5" rx="0.55" ry="0.6">
          <Stop offset="0.55" stopColor={brand.plum} stopOpacity="0" />
          <Stop offset="1" stopColor={brand.plum} stopOpacity="0.55" />
        </RadialGradient>
        <LinearGradient id={`${uid}-arm`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={brand.violet} />
          <Stop offset="1" stopColor="#6B4BB8" />
        </LinearGradient>
        <LinearGradient id={`${uid}-ribbon`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={brand.coral} />
          <Stop offset="1" stopColor={brand.violet} />
        </LinearGradient>
      </Defs>

      {/* floor light and soft contact shadow */}
      <Ellipse cx="100" cy="226" rx="62" ry="10" fill={brand.lime} opacity={0.1} />
      <Ellipse cx="100" cy="226" rx="46" ry="6.5" fill={brand.plum} opacity={0.5} />

      {/* trailing pulse ribbon */}
      <Path
        d={
          celebrate
            ? 'M64 188 C 8 196 0 130 34 96 C 52 78 40 52 58 40'
            : 'M66 190 C 26 202 12 160 30 134 C 38 122 34 108 42 98'
        }
        stroke={`url(#${uid}-ribbon)`}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
        opacity={0.92}
      />

      {worn.has('cosmetic_cape') ? (
        <>
          <Path
            d="M52 104 C 14 150 8 196 20 226 Q100 250 180 226 C 192 196 186 150 148 104 Q100 134 52 104 Z"
            fill={brand.coral}
          />
          <Path
            d="M52 104 C 30 152 30 196 40 220 Q100 236 160 220 C 170 196 170 152 148 104 Q100 130 52 104 Z"
            fill={brand.plum}
            opacity={0.28}
          />
          <Path d="M100 130 L100 232" stroke={brand.plum} strokeWidth={3} opacity={0.35} />
        </>
      ) : null}

      {/* arms sit behind the body so the shoulders blend in */}
      <G transform={`translate(48 116) rotate(${pose.l})`}>
        <Path d={ARM} fill={`url(#${uid}-arm)`} />
      </G>
      <G transform={`translate(152 116) rotate(${pose.r})`}>
        <Path d={ARM} fill={`url(#${uid}-arm)`} />
      </G>

      {/* body: satin resin, volume shading, specular highlight, rim light */}
      {celebrate ? (
        <>
          <Ellipse cx="100" cy="120" rx="92" ry="112" fill={brand.coral} opacity={0.1} />
          <Ellipse cx="100" cy="120" rx="76" ry="96" fill={brand.coral} opacity={0.14} />
        </>
      ) : null}
      <Path d={BODY} fill={`url(#${uid}-body)`} />
      <Path d={BODY} fill={`url(#${uid}-shade)`} />
      <Ellipse
        cx="80"
        cy="66"
        rx="24"
        ry="12"
        fill={brand.ivory}
        opacity={0.38}
        transform="rotate(-24 80 66)"
      />
      <Circle cx="66" cy="92" r="4" fill={brand.ivory} opacity={0.22} />
      <Path
        d="M150 70 C 160 104 156 152 134 192"
        stroke={brand.coral}
        strokeWidth={celebrate ? 4 : 2.5}
        strokeLinecap="round"
        fill="none"
        opacity={celebrate ? 0.75 : 0.45}
      />

      {/* eyes: emissive lime with ivory catch-lights */}
      {celebrate ? (
        <>
          <Path
            d="M73 86 Q84 70 95 86"
            stroke={brand.lime}
            strokeWidth={5}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M105 86 Q116 70 127 86"
            stroke={brand.lime}
            strokeWidth={5}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M92 102 Q100 110 108 102"
            stroke={brand.ivory}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.85}
          />
        </>
      ) : (
        <>
          <G transform={encourage ? 'rotate(-6 83 82)' : undefined}>
            <Ellipse cx="83" cy="82" rx="10" ry={eyeRy} fill={brand.lime} />
            <Circle cx="80" cy={82 - eyeRy * 0.42} r="3.2" fill={brand.ivory} />
          </G>
          <G transform={encourage ? 'rotate(6 117 82)' : undefined}>
            <Ellipse cx="117" cy="82" rx="10" ry={eyeRy} fill={brand.lime} />
            <Circle cx="114" cy={82 - eyeRy * 0.42} r="3.2" fill={brand.ivory} />
          </G>
        </>
      )}

      {/* chest pulse line: the main carrier of emotion */}
      <Path
        d={PULSE_LINE[state]}
        stroke={brand.lime}
        strokeWidth={11}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.22}
      />
      <Path
        d={PULSE_LINE[state]}
        stroke={brand.lime}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* cosmetics: drawn last, purely decorative */}
      {worn.has('cosmetic_headband') ? (
        <>
          <Path
            d="M56 56 Q100 30 144 56"
            stroke={brand.plum}
            strokeWidth={15}
            strokeLinecap="round"
            fill="none"
            opacity={0.35}
          />
          <Path
            d="M56 54 Q100 28 144 54"
            stroke={brand.lime}
            strokeWidth={11}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M66 49 Q100 31 134 49"
            stroke={brand.ivory}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.7}
          />
          <Circle cx="146" cy="56" r="7" fill={brand.coral} />
        </>
      ) : null}
      {worn.has('cosmetic_beanie') ? (
        <>
          <Path d="M58 58 Q100 -8 142 58 Z" fill={brand.coral} />
          <Path
            d="M70 50 Q100 8 130 50"
            stroke={brand.ivory}
            strokeWidth={3}
            fill="none"
            opacity={0.5}
          />
          <Path d="M56 58 H144" stroke={brand.ivory} strokeWidth={11} strokeLinecap="round" />
          <Circle cx="100" cy="6" r="9" fill={brand.ivory} />
        </>
      ) : null}
      {worn.has('cosmetic_flower') ? (
        <>
          {[0, 72, 144, 216, 288].map((a) => (
            <Ellipse
              key={a}
              cx="146"
              cy="40"
              rx="6"
              ry="11"
              fill={brand.coral}
              transform={`rotate(${a} 146 48)`}
            />
          ))}
          <Circle cx="146" cy="48" r="6" fill={brand.lime} />
        </>
      ) : null}
      {worn.has('cosmetic_sunglasses') ? (
        <>
          <Path
            d="M64 72 H136 V94 Q136 104 124 104 H110 Q101 104 100 92 Q99 104 90 104 H76 Q64 104 64 94 Z"
            fill={brand.plum}
          />
          <Path
            d="M70 78 L86 78"
            stroke={brand.ivory}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.7}
          />
          <Path
            d="M114 78 L130 78"
            stroke={brand.ivory}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.7}
          />
        </>
      ) : null}
      {worn.has('cosmetic_scarf') ? (
        <>
          <Path
            d="M50 168 Q100 190 150 168"
            stroke={brand.plum}
            strokeWidth={20}
            strokeLinecap="round"
            fill="none"
            opacity={0.3}
          />
          <Path
            d="M50 166 Q100 188 150 166"
            stroke={brand.coral}
            strokeWidth={16}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M62 163 Q100 183 138 163"
            stroke={brand.ivory}
            strokeWidth={3}
            strokeDasharray="6 8"
            fill="none"
            opacity={0.8}
          />
          <Path d="M132 176 L144 214 L130 218 L122 182 Z" fill={brand.coral} />
          <Path d="M136 190 L141 206" stroke={brand.ivory} strokeWidth={3} opacity={0.8} />
        </>
      ) : null}
      {worn.has('cosmetic_wristbands') ? (
        <>
          <G transform={`translate(48 116) rotate(${pose.l})`}>
            <Path
              d="M-12 58 H12"
              stroke={brand.plum}
              strokeWidth={12}
              strokeLinecap="round"
              opacity={0.4}
            />
            <Path d="M-12 57 H12" stroke={brand.lime} strokeWidth={9} strokeLinecap="round" />
          </G>
          <G transform={`translate(152 116) rotate(${pose.r})`}>
            <Path
              d="M-12 58 H12"
              stroke={brand.plum}
              strokeWidth={12}
              strokeLinecap="round"
              opacity={0.4}
            />
            <Path d="M-12 57 H12" stroke={brand.lime} strokeWidth={9} strokeLinecap="round" />
          </G>
        </>
      ) : null}
      {flourish ? <FlourishArt kind={flourish} /> : null}
    </Svg>
  );
}

const STAR = 'M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z';
/** The decoration around Pulse for an occasion. Small, in the brand palette, behind nothing important. */
function FlourishArt({ kind }: { kind: Flourish }) {
  if (kind === 'flame')
    return (
      <G transform="translate(194 52)">
        <Path d="M0 -26 C 14 -10 16 6 0 18 C -16 6 -14 -10 0 -26 Z" fill={brand.coral} />
        <Path d="M0 -10 C 7 -2 8 6 0 12 C -8 6 -7 -2 0 -10 Z" fill={brand.lime} />
      </G>
    );
  if (kind === 'heart')
    return <Path d="M194 70 C 176 56 180 38 194 44 C 208 38 212 56 194 70 Z" fill={brand.coral} />;
  if (kind === 'shield')
    return (
      <G transform="translate(194 52)">
        <Path
          d="M0 -20 L16 -13 V3 C 16 14 8 20 0 24 C -8 20 -16 14 -16 3 V-13 Z"
          fill={brand.violet}
          stroke={brand.lime}
          strokeWidth={3}
        />
        <Path
          d="M-6 2 L-1 8 L8 -5"
          stroke={brand.lime}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    );
  if (kind === 'confetti')
    return (
      <G>
        {[
          [-14, 30, brand.coral],
          [214, 24, brand.lime],
          [206, 128, brand.ivory],
          [-22, 120, brand.lime],
          [190, 12, brand.coral],
          [-6, 70, brand.ivory],
        ].map(([x, y, c], i) => (
          <Path
            key={i}
            d="M-5 -2 H5 V2 H-5 Z"
            fill={c as string}
            transform={`translate(${x} ${y}) rotate(${i * 37})`}
          />
        ))}
      </G>
    );
  return (
    <G>
      <G transform="translate(-10 40) scale(1.1)">
        <Path d={STAR} fill={brand.lime} />
      </G>
      <G transform="translate(210 28)">
        <Path d={STAR} fill={brand.ivory} />
      </G>
      <G transform="translate(204 122) scale(0.8)">
        <Path d={STAR} fill={brand.coral} />
      </G>
      <G transform="translate(-22 128) scale(0.7)">
        <Path d={STAR} fill={brand.ivory} />
      </G>
    </G>
  );
}
