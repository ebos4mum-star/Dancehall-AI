import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Line } from 'react-native-svg';
import {
  BONES,
  SEAT_HEIGHT,
  clipChairFront,
  clipHasChair,
  evaluateClip,
  project,
  solvePose,
  type JointName,
  type TrainerView,
  type V3,
} from '@dancehall/shared';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

/**
 * Draws the animated trainer: a plain, original figure of lines and circles, projected from 3D joints by the shared rig so the front, three-quarter and side views
 * are real viewing angles. It is placeholder tooling, not a character and not a recorded person. A rigged character would replace this component and keep
 * the clip format, the player controls and the views. The left and right sides use different shades and different line weights, so side is never shown by colour alone.
 */
const W = 300;
const H = 250;
const GROUND = 228;
const PPM = 112;

interface Props {
  motionIds: string[];
  positionS: number;
  durationS: number;
  view: TrainerView;
  seated: boolean;
  easier: boolean;
  /** Reduced motion: the pose changes in whole-second steps instead of flowing. */
  stepped: boolean;
  label: string;
}

export function TrainerSurface({
  motionIds,
  positionS,
  durationS,
  view,
  seated,
  easier,
  stepped,
  label,
}: Props) {
  const { colors } = useTheme();
  const t = stepped ? Math.floor(positionS) : positionS;
  const drawing = useMemo(() => {
    const pose = evaluateClip(motionIds, t, durationS, { seated, easier });
    if (!pose) return null;
    const sk = solvePose(pose);
    const P = (p: V3) => project(p, view, PPM, W / 2, GROUND);
    const J = Object.fromEntries(
      (Object.keys(sk) as JointName[]).map((j) => [j, P(sk[j])]),
    ) as Record<JointName, ReturnType<typeof P>>;
    const chair = clipHasChair(motionIds, seated);
    const front = clipChairFront(motionIds, seated);
    return { J, chair, front, pelvis: sk.pelvis };
  }, [motionIds, t, durationS, view, seated, easier]);
  if (!drawing) return null;
  const { J, chair, front } = drawing;
  const stroke = colors.text;
  const left = colors.primary;
  const limbs: Array<{ a: JointName; b: JointName; side: 'L' | 'R' | 'C'; w: number }> = [
    { a: 'pelvis', b: 'neck', side: 'C', w: 0.1 },
    { a: 'shoulderL', b: 'elbowL', side: 'L', w: 0.05 },
    { a: 'elbowL', b: 'wristL', side: 'L', w: 0.045 },
    { a: 'shoulderR', b: 'elbowR', side: 'R', w: 0.05 },
    { a: 'elbowR', b: 'wristR', side: 'R', w: 0.045 },
    { a: 'hipL', b: 'kneeL', side: 'L', w: 0.075 },
    { a: 'kneeL', b: 'ankleL', side: 'L', w: 0.06 },
    { a: 'ankleL', b: 'toeL', side: 'L', w: 0.04 },
    { a: 'hipR', b: 'kneeR', side: 'R', w: 0.075 },
    { a: 'kneeR', b: 'ankleR', side: 'R', w: 0.06 },
    { a: 'ankleR', b: 'toeR', side: 'R', w: 0.04 },
    { a: 'shoulderL', b: 'shoulderR', side: 'C', w: 0.06 },
    { a: 'hipL', b: 'hipR', side: 'C', w: 0.08 },
  ];
  // Farther limbs first, so nearer ones draw over them.
  const sorted = [...limbs].sort((x, y) => (J[x.a].z + J[x.b].z) / 2 - (J[y.a].z + J[y.b].z) / 2);
  const head = J.head;
  const headPx = BONES.headR * PPM * head.s;

  const chairLines = (): Array<[V3, V3]> => {
    const y0 = SEAT_HEIGHT - 0.04;
    const zc = front ? 0.55 : -0.12;
    const backZ = front ? zc + 0.25 : zc - 0.25;
    const x = 0.22;
    const z0 = front ? zc - 0.25 : zc + 0.25;
    const corners: V3[] = [
      [-x, y0, z0],
      [x, y0, z0],
      [x, y0, backZ],
      [-x, y0, backZ],
    ];
    const lines: Array<[V3, V3]> = [];
    for (let i = 0; i < 4; i++) lines.push([corners[i]!, corners[(i + 1) % 4]!]);
    for (const c of corners) lines.push([c, [c[0], 0, c[2]]]); // legs
    lines.push(
      [
        [-x, y0, backZ],
        [-x, 0.92, backZ],
      ],
      [
        [x, y0, backZ],
        [x, 0.92, backZ],
      ],
      [
        [-x, 0.92, backZ],
        [x, 0.92, backZ],
      ],
    );
    return lines;
  };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        height: 190,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        alignItems: 'center',
      }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Ellipse cx={W / 2} cy={GROUND + 2} rx={70} ry={6} fill={colors.border} opacity={0.6} />
        {chair
          ? chairLines().map(([a, b], i) => {
              const pa = project(a, view, PPM, W / 2, GROUND);
              const pb = project(b, view, PPM, W / 2, GROUND);
              return (
                <Line
                  key={`c${i}`}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
                  stroke={colors.textMuted}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              );
            })
          : null}
        {sorted.map((l) => {
          const a = J[l.a];
          const b = J[l.b];
          const dim = l.side === 'L';
          return (
            <Line
              key={`${l.a}-${l.b}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={l.side === 'L' ? left : stroke}
              strokeOpacity={dim ? 0.85 : 1}
              strokeWidth={Math.max(
                3,
                l.w * PPM * ((a.s + b.s) / 2) * (l.side === 'L' ? 0.8 : 1.15),
              )}
              strokeLinecap="round"
              strokeDasharray={l.side === 'L' ? undefined : undefined}
            />
          );
        })}
        <Circle
          cx={head.x}
          cy={head.y}
          r={headPx}
          fill={colors.surface}
          stroke={stroke}
          strokeWidth={3}
        />
        {(['wristL', 'wristR'] as const).map((j) => (
          <Circle
            key={j}
            cx={J[j].x}
            cy={J[j].y}
            r={4.5 * J[j].s}
            fill={j === 'wristL' ? left : stroke}
          />
        ))}
      </Svg>
    </View>
  );
}
