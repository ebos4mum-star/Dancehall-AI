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
export const WORLDS = [
  'today',
  'dance',
  'food',
  'coach',
  'me',
  'friends',
  'progress',
  'community',
  'onboard',
] as const;
export type World = (typeof WORLDS)[number];

const SKY: Record<World, [string, string, string]> = {
  today: ['#1A0E2E', brand.plum, '#3A2072'],
  dance: ['#1A0E2E', '#33164F', '#5A1F6B'],
  food: ['#1F1030', '#3B1B4A', '#6B2A55'],
  coach: ['#160B29', '#2A1A52', '#3F2C85'],
  me: ['#1A0E2E', '#2A1850', '#4A3290'],
  friends: ['#1A0E2E', '#2B1650', '#5B2F7A'],
  progress: ['#150B29', '#25194F', '#3E3A8C'],
  community: ['#1A0E2E', '#2E1858', '#6A3A86'],
  onboard: ['#160B29', '#2A1A52', '#5A3FA0'],
};

function Props({ world, chapter }: { world: World; chapter: number }) {
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
          {/* a quiet study nook: shelf of books, a reading lamp and a cup of tea */}
          <Rect x="14" y="196" width="104" height="5" rx="2" fill="#4A2B8C" />
          {[
            [18, 168, 12, brand.coral],
            [32, 176, 10, brand.violet],
            [44, 164, 13, brand.lime],
            [59, 172, 11, brand.ivory],
            [72, 170, 12, brand.coral],
            [86, 178, 10, brand.violet],
          ].map(([x, y, w, c], k) => (
            <Rect
              key={k}
              x={x as number}
              y={y as number}
              width={w as number}
              height={196 - (y as number)}
              rx="2"
              fill={c as string}
              opacity={0.5}
            />
          ))}
          <Path d="M316 248 V196" stroke={brand.ivory} strokeWidth="3" opacity={0.5} />
          <Path d="M298 196 L334 196 L326 170 L306 170 Z" fill={brand.lime} opacity={0.45} />
          <Polygon points="306,196 326,196 352,250 280,250" fill={brand.lime} opacity={0.07} />
          <Path d="M150 244 H182 L178 226 H154 Z" fill={brand.ivory} opacity={0.4} />
          <Path
            d="M162 220 Q156 208 164 198 M172 220 Q178 210 170 200"
            stroke={brand.ivory}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity={0.25}
          />
        </G>
      );
    case 'community':
      return (
        <G>
          {/* a village square: bunting across the sky, a notice board with pinned notes, lanterns */}
          <Path
            d="M-4 30 Q90 74 180 38 T364 34"
            stroke={brand.ivory}
            strokeWidth="1.5"
            fill="none"
            opacity={0.7}
          />
          {[22, 62, 104, 148, 196, 240, 284, 328].map((x, k) => (
            <Polygon
              key={x}
              points={`${x - 11},${44 + (k % 2 ? 2 : 0) + Math.sin(k) * 6} ${x + 11},${44 + (k % 2 ? 2 : 0) + Math.sin(k) * 6} ${x},${66 + Math.sin(k) * 6}`}
              fill={[brand.coral, brand.lime, brand.violet][k % 3]}
              opacity={0.9}
            />
          ))}
          <Rect x="40" y="168" width="104" height="64" rx="8" fill="#4A2B8C" opacity={0.95} />
          <Rect x="48" y="176" width="88" height="48" rx="5" fill="#2A1850" />
          {[
            [56, 184, brand.lime],
            [88, 182, brand.coral],
            [112, 194, brand.ivory],
            [60, 204, brand.violet],
          ].map(([x, y, c], k) => (
            <Rect
              key={k}
              x={x as number}
              y={y as number}
              width="22"
              height="18"
              rx="2"
              fill={c as string}
              opacity={0.75}
            />
          ))}
          <Rect x="60" y="232" width="6" height="16" fill="#4A2B8C" />
          <Rect x="118" y="232" width="6" height="16" fill="#4A2B8C" />
          {[200, 300].map((x, k) => (
            <G key={x}>
              <Path
                d={`M${x} 90 V${120 + k * 10}`}
                stroke={brand.violet}
                strokeWidth="1.5"
                opacity={0.9}
              />
              <Ellipse cx={x} cy={134 + k * 10} rx="12" ry="15" fill={brand.coral} opacity={0.85} />
              <Ellipse cx={x} cy={134 + k * 10} rx="30" ry="34" fill={brand.coral} opacity={0.16} />
            </G>
          ))}
          <Rect x="168" y="214" width="62" height="12" rx="6" fill={brand.violet} opacity={0.25} />
          <Path
            d="M160 236 H250 M176 244 H236"
            stroke={brand.violet}
            strokeWidth="1.5"
            opacity={0.35}
          />
        </G>
      );
    case 'onboard': {
      const ch = Math.min(5, Math.max(1, Math.round(chapter)));
      const mx = [34, 108, 182, 254, 322][ch - 1]!;
      const my = [252, 247, 242, 236, 224][ch - 1]!;
      return (
        <G>
          {/* the journey: one winding trail, a lantern marking how far along you are */}
          <Path
            d="M-10 262 C 70 238 120 260 190 242 S 310 238 370 216"
            stroke={brand.ivory}
            strokeWidth="3"
            strokeDasharray="2 8"
            strokeLinecap="round"
            fill="none"
            opacity={0.4}
          />
          {/* the chapter emblem, hung in the open corner above Pulse so each step is recognisable at a glance */}
          <Circle cx="306" cy="58" r="44" fill={brand.lime} opacity={0.1} />
          <Circle cx="306" cy="58" r="32" fill="#24143D" opacity={0.75} />
          <G transform="translate(-26 0)">
            <Circle
              cx="306"
              cy="58"
              r="32"
              stroke={brand.lime}
              strokeWidth="2.5"
              fill="none"
              opacity={0.8}
            />
            {ch === 1 ? (
              <G>
                <Path d="M306 76 V40" stroke={brand.ivory} strokeWidth="3" strokeLinecap="round" />
                <Path d="M306 42 H326 L332 49 L326 56 H306 Z" fill={brand.coral} />
                <Path d="M306 58 H288 L282 65 L288 72 H306 Z" fill={brand.violet} />
              </G>
            ) : null}
            {ch === 2 ? (
              <G>
                <Path
                  d="M306 38 L324 45 V60 C324 70 315 77 306 81 C297 77 288 70 288 60 V45 Z"
                  fill={brand.lime}
                />
                <Path
                  d="M298 59 L304 65 L315 52"
                  stroke={brand.plum}
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </G>
            ) : null}
            {ch === 3 ? (
              <G>
                <Rect x="286" y="52" width="40" height="12" rx="6" fill={brand.ivory} />
                {[292, 300, 308, 316, 324].map((x, k) => (
                  <Path
                    key={x}
                    d={`M${x} 52 V${k % 2 ? 58 : 61}`}
                    stroke={brand.plum}
                    strokeWidth="2"
                  />
                ))}
                <Ellipse cx="306" cy="76" rx="14" ry="5" fill={brand.violet} />
              </G>
            ) : null}
            {ch === 4 ? (
              <G>
                <Path
                  d="M306 80 C 284 64 288 44 299 46 C 303 47 306 51 306 54 C 306 51 309 47 313 46 C 324 44 328 64 306 80 Z"
                  fill={brand.coral}
                />
                <Path
                  d="M291 62 H301 L305 55 L310 68 L314 61 H323"
                  stroke={brand.lime}
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </G>
            ) : null}
            {ch === 5 ? (
              <G>
                <Polygon points="286,80 306,52 326,80" fill={brand.violet} />
                <Path d="M306 52 V32" stroke={brand.ivory} strokeWidth="3" strokeLinecap="round" />
                <Path d="M306 32 L324 38 L306 44 Z" fill={brand.coral} />
              </G>
            ) : null}
          </G>
          <Circle cx={mx} cy={my} r="20" fill={brand.lime} opacity={0.14} />
          <Circle cx={mx} cy={my} r="9" fill={brand.lime} opacity={0.85} />
          {ch === 1 ? (
            <G>
              {/* a signpost at the start of the path: "who is walking?" */}
              <Path d="M168 248 V196" stroke={brand.ivory} strokeWidth="3" opacity={0.55} />
              <Path d="M168 198 H206 L214 207 L206 216 H168 Z" fill={brand.coral} opacity={0.85} />
              <Path d="M168 222 H138 L130 230 L138 238 H168 Z" fill={brand.violet} opacity={0.9} />
            </G>
          ) : null}
          {ch === 2 ? (
            <G>
              {/* a lantern-lit gate with a shield: your information, your say */}
              <Rect x="236" y="112" width="12" height="136" rx="4" fill="#4A2B8C" />
              <Rect x="312" y="112" width="12" height="136" rx="4" fill="#4A2B8C" />
              <Path d="M236 118 Q280 62 324 118" stroke="#6B49BD" strokeWidth="10" fill="none" />
              <Ellipse cx="242" cy="104" rx="9" ry="11" fill={brand.coral} opacity={0.6} />
              <Ellipse cx="318" cy="104" rx="9" ry="11" fill={brand.coral} opacity={0.6} />
            </G>
          ) : null}
          {ch === 3 ? (
            <G>
              {/* stepping stones and a soft ruler: getting to know your body, gently */}
              {[
                [214, 232, 26],
                [252, 216, 24],
                [288, 196, 22],
                [320, 172, 20],
              ].map(([x, y, r], k) => (
                <Ellipse
                  key={k}
                  cx={x}
                  cy={y}
                  rx={r as number}
                  ry={(r as number) * 0.4}
                  fill="#6B49BD"
                  opacity={0.95}
                />
              ))}
              <Rect x="40" y="96" width="14" height="150" rx="5" fill={brand.ivory} opacity={0.2} />
              {Array.from({ length: 10 }, (_, k) => (
                <Path
                  key={k}
                  d={`M40 ${104 + k * 14} H${k % 2 ? 48 : 54}`}
                  stroke={brand.plum}
                  strokeWidth="2"
                  opacity={0.6}
                />
              ))}
            </G>
          ) : null}
          {ch === 4 ? (
            <G>
              {/* a heart beacon with calm rings: how you feel today */}
              {[70, 52, 34].map((r, k) => (
                <Circle
                  key={r}
                  cx="272"
                  cy="130"
                  r={r}
                  stroke={brand.coral}
                  strokeWidth="1.5"
                  fill="none"
                  opacity={0.12 + k * 0.08}
                />
              ))}
            </G>
          ) : null}
          {ch === 5 ? (
            <G>
              {/* the summit with a flag: the goal you choose */}
              <Polygon points="190,246 262,110 340,246" fill="#4C3699" opacity={0.95} />
              <Polygon points="262,110 292,166 262,156 238,170" fill={brand.ivory} opacity={0.35} />
              {[
                { x: 60, y: 60 },
                { x: 150, y: 40 },
                { x: 330, y: 50 },
              ].map(({ x, y }) => (
                <Circle key={x} cx={x} cy={y} r="2.5" fill={brand.lime} opacity={0.7} />
              ))}
            </G>
          ) : null}
        </G>
      );
    }
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
          <Ellipse cx="180" cy="232" rx="90" ry="22" fill={brand.coral} opacity={0.28} />
          <Path d="M168 238 Q180 196 192 238 Z" fill={brand.coral} opacity={0.9} />
          <Path d="M174 238 Q180 214 186 238 Z" fill={brand.lime} opacity={0.8} />
          <Path
            d="M0 40 Q90 90 180 50 T360 44"
            stroke={brand.violet}
            strokeWidth="1.5"
            fill="none"
            opacity={0.8}
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
              <Circle cx={x} cy="206" r="14" fill="#7A58D0" opacity={0.9} />
              <Rect
                x={x - 16}
                y="218"
                width="32"
                height="30"
                rx="14"
                fill="#7A58D0"
                opacity={0.9}
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
 * The far layer: two soft ridges for depth, then a few world-specific silhouettes on the horizon (rooftops for the village, trees for friends, speaker stacks for dance,
 * a skyline for today). Silhouettes are dark and low-contrast on purpose, so they add depth without competing with text or controls.
 */
function Horizon({ world }: { world: World }) {
  const far = '#3B2A7E';
  return (
    <G>
      <Path
        d="M0 212 Q50 186 112 204 T232 196 T360 206 V258 H0 Z"
        fill={brand.violet}
        opacity={0.16}
      />
      <Path d="M0 228 Q70 204 140 222 T290 214 T360 226 V258 H0 Z" fill={far} opacity={0.42} />
      {world === 'community' ? (
        <G>
          {(
            [
              [150, 208, 30, 24],
              [186, 198, 38, 34],
              [232, 208, 30, 24],
              [4, 208, 28, 24],
            ] as Array<[number, number, number, number]>
          ).map(([x, y, w, h], k) => (
            <G key={k}>
              <Rect x={x} y={y} width={w} height={h} fill="#2A1850" opacity={0.95} />
              <Polygon
                points={`${x - 4},${y} ${x + w / 2},${y - 14} ${x + w + 4},${y}`}
                fill="#3E2A78"
              />
              <Rect
                x={x + w / 2 - 3}
                y={y + 8}
                width="6"
                height="8"
                rx="1"
                fill={brand.lime}
                opacity={0.75}
              />
            </G>
          ))}
        </G>
      ) : null}
      {world === 'friends' ? (
        <G>
          {[18, 54, 96, 250, 292, 334].map((x, k) => (
            <G key={x}>
              <Rect x={x - 2} y={218} width="4" height="14" fill="#2A1850" />
              <Path
                d={`M${x} ${190 - (k % 2) * 8} L${x + 16} 222 L${x - 16} 222 Z`}
                fill="#2F1D63"
                opacity={0.95}
              />
              <Path
                d={`M${x} ${176 - (k % 2) * 8} L${x + 12} 204 L${x - 12} 204 Z`}
                fill="#3A2878"
                opacity={0.95}
              />
            </G>
          ))}
        </G>
      ) : null}
      {world === 'dance' ? (
        <G>
          {[10, 330].map((x) => (
            <G key={x}>
              <Rect x={x} y={176} width="22" height="54" rx="4" fill="#24143D" opacity={0.95} />
              <Circle cx={x + 11} cy={192} r="6" fill={brand.violet} opacity={0.55} />
              <Circle cx={x + 11} cy={214} r="8" fill={brand.violet} opacity={0.55} />
            </G>
          ))}
        </G>
      ) : null}
      {world === 'today' ? (
        <G>
          {(
            [
              [250, 190, 22, 46],
              [276, 176, 26, 60],
              [306, 196, 20, 40],
              [330, 184, 24, 52],
            ] as Array<[number, number, number, number]>
          ).map(([x, y, w, h], k) => (
            <G key={k}>
              <Rect x={x} y={y} width={w} height={h} rx="3" fill="#24143D" opacity={0.9} />
              {[0, 1, 2].map((r) => (
                <Rect
                  key={r}
                  x={x + 5}
                  y={y + 8 + r * 14}
                  width="5"
                  height="5"
                  rx="1"
                  fill={brand.lime}
                  opacity={0.35}
                />
              ))}
            </G>
          ))}
        </G>
      ) : null}
    </G>
  );
}

/** Deterministic twinkles for the sky, so the same screen always looks the same. */
const STARS = Array.from({ length: 26 }, (_, k) => ({
  x: (k * 97 + 23) % 350,
  y: (k * 53 + 11) % 150,
  r: 0.9 + ((k * 7) % 3) * 0.55,
  o: 0.25 + ((k * 13) % 5) * 0.1,
}));

/**
 * The layered environment behind a hero: sky, rhythm arcs, a world-specific prop layer, curtains, spotlight and a lime-rimmed floor. Static art
 * with one slowly drifting glow (stops under reduced motion). Decorative: hidden from screen readers. Absolutely fills its parent.
 */
export function SceneBackdrop({
  world = 'today',
  chapter = 1,
}: {
  world?: World;
  /** Onboarding only: which of the five steps (1 to 5) the scene shows. */
  chapter?: number;
}) {
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
          <LinearGradient id={`${id}-fog`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={brand.ivory} stopOpacity="0" />
            <Stop offset="0.55" stopColor={brand.ivory} stopOpacity="0.1" />
            <Stop offset="1" stopColor={brand.ivory} stopOpacity="0" />
          </LinearGradient>
          <RadialGradient id={`${id}-vig`} cx="0.5" cy="0.45" rx="0.75" ry="0.75">
            <Stop offset="0.6" stopColor="#0F0720" stopOpacity="0" />
            <Stop offset="1" stopColor="#0F0720" stopOpacity="0.5" />
          </RadialGradient>
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
        <Horizon world={world} />
        <Rect x="0" y="214" width="360" height="44" fill={`url(#${id}-fog)`} />
        <Props world={world} chapter={chapter} />
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
        <Rect width="360" height="320" fill={`url(#${id}-vig)`} />
      </Svg>
      {/* sparkles: a far layer that drifts the opposite way to the glow, a quiet parallax (still with Reduce Motion) */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          transform: [
            { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [4, -4] }) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 360 320" preserveAspectRatio="xMidYMid slice">
          {STARS.map((st, k) => (
            <Circle
              key={k}
              cx={st.x + 5}
              cy={st.y + 6}
              r={st.r}
              fill={k % 4 === 0 ? brand.lime : brand.ivory}
              opacity={st.o}
            />
          ))}
        </Svg>
      </Animated.View>
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
