import { SEATED, STAND, POSE_KEYS, type Pose, type PoseKey, type TrainerView } from './trainer-rig';

/**
 * ORIGINAL placeholder motions for the animated trainer: generic movement patterns (a march, a bounce, a sit-to-stand, a seated knee lift) built from a few joint
 * angles. They are NOT choreography, NOT a recording of any dancer and NOT a reviewed demonstration of any exercise: they exist so the animation pipeline (smooth
 * transitions, viewing angles, speed, seated and easier versions, captions, previews) can be built, tested and shown to reviewers before real motion exists. Real
 * motion would come from the practitioners (see docs/review/REVIEW_QUEUE.md) and replace these through the same clip format.
 */
export interface Motion {
  id: string;
  /** Plain name used in captions. */
  label: string;
  base: 'standing' | 'seated';
  cycleS: number;
  /** Key poses over one cycle as differences from the base pose; the last key returns to the first. */
  keys: ReadonlyArray<readonly [number, Partial<Pose>]>;
  view: TrainerView;
  /** A chair is drawn (sitting down, or seated). */
  chair?: boolean;
  /** The chair is held in front of the trainer instead of sat on. */
  chairFront?: boolean;
  /** The seated version of this motion. Seated motions are their own seated version. */
  seatedId?: string;
}

const k = (t: number, p: Partial<Pose> = {}): readonly [number, Partial<Pose>] => [t, p];
const M = (m: Motion): Motion => m;

export const MOTIONS: readonly Motion[] = [
  // Standing, for dance blocks.
  M({
    id: 'weight_shift',
    label: 'weight shift',
    base: 'standing',
    cycleS: 2.4,
    view: 'front',
    seatedId: 'seated_sway',
    keys: [
      k(0),
      k(0.6, { x: 0.07, tr: -4, llk: 4 }),
      k(1.2),
      k(1.8, { x: -0.07, tr: 4, lrk: 4 }),
      k(2.4),
    ],
  }),
  M({
    id: 'march',
    label: 'march',
    base: 'standing',
    cycleS: 2,
    view: 'front',
    seatedId: 'seated_knee_lift',
    keys: [
      k(0),
      k(0.5, { llp: 55, llk: 70, arp: 25, alp: -25 }),
      k(1),
      k(1.5, { lrp: 55, lrk: 70, alp: 25, arp: -25 }),
      k(2),
    ],
  }),
  M({
    id: 'bounce',
    label: 'soft bounce',
    base: 'standing',
    cycleS: 1,
    view: 'front',
    seatedId: 'seated_bounce',
    keys: [
      k(0),
      k(0.5, { llk: 22, lrk: 22, llp: 12, lrp: 12, tp: 4, alp: 10, arp: 10, ale: 25, are: 25 }),
      k(1),
    ],
  }),
  M({
    id: 'side_step',
    label: 'side step',
    base: 'standing',
    cycleS: 2.4,
    view: 'front',
    seatedId: 'seated_step_out',
    keys: [
      k(0),
      k(0.6, { x: 0.12, lra: 18, tr: -4, ara: 25, ala: 25, are: 30, ale: 30 }),
      k(1.2),
      k(1.8, { x: -0.12, lla: 18, tr: 4, ara: 25, ala: 25, are: 30, ale: 30 }),
      k(2.4),
    ],
  }),
  M({
    id: 'step_touch',
    label: 'step and touch',
    base: 'standing',
    cycleS: 2.4,
    view: 'front',
    seatedId: 'seated_step_out',
    keys: [
      k(0),
      k(0.6, { x: 0.1, lra: 20, lrk: 8, arp: 15, alp: 15, are: 35, ale: 35 }),
      k(1.2),
      k(1.8, { x: -0.1, lla: 20, llk: 8, alp: 15, arp: 15, are: 35, ale: 35 }),
      k(2.4),
    ],
  }),
  M({
    id: 'hip_sway',
    label: 'hip sway',
    base: 'standing',
    cycleS: 2.4,
    view: 'front',
    seatedId: 'seated_sway',
    keys: [
      k(0, { llk: 8, lrk: 8, llp: 4, lrp: 4 }),
      k(0.6, { x: 0.07, tr: -7, llk: 8, lrk: 8, llp: 4, lrp: 4 }),
      k(1.2, { llk: 8, lrk: 8, llp: 4, lrp: 4 }),
      k(1.8, { x: -0.07, tr: 7, llk: 8, lrk: 8, llp: 4, lrp: 4 }),
      k(2.4, { llk: 8, lrk: 8, llp: 4, lrp: 4 }),
    ],
  }),
  M({
    id: 'hip_rock',
    label: 'hip rock',
    base: 'standing',
    cycleS: 1.2,
    view: 'side',
    seatedId: 'seated_sway',
    keys: [
      k(0, { llk: 10, lrk: 10, llp: 5, lrp: 5 }),
      k(0.6, { tp: -6, llk: 20, lrk: 20, llp: 16, lrp: 16 }),
      k(1.2, { llk: 10, lrk: 10, llp: 5, lrp: 5 }),
    ],
  }),
  M({
    id: 'knee_bend',
    label: 'knee bend',
    base: 'standing',
    cycleS: 2.4,
    view: 'side',
    seatedId: 'seated_bounce',
    keys: [
      k(0),
      k(1.2, { llk: 45, lrk: 45, llp: 40, lrp: 40, tp: 12, alp: 30, arp: 30, ale: 20, are: 20 }),
      k(2.4),
    ],
  }),
  M({
    id: 'arm_swing',
    label: 'arm swing',
    base: 'standing',
    cycleS: 2,
    view: 'front',
    seatedId: 'seated_bounce',
    keys: [
      k(0),
      k(0.5, { alp: 35, arp: -35, ale: 25, are: 25 }),
      k(1),
      k(1.5, { alp: -35, arp: 35, ale: 25, are: 25 }),
      k(2),
    ],
  }),
  M({
    id: 'arm_reach',
    label: 'overhead reach',
    base: 'standing',
    cycleS: 3,
    view: 'front',
    seatedId: 'seated_reach',
    keys: [k(0), k(1.5, { alp: 170, arp: 170, ale: 5, are: 5, hd: -10 }), k(3)],
  }),
  M({
    id: 'arm_circles',
    label: 'shoulder and arm circles',
    base: 'standing',
    cycleS: 2.4,
    view: 'front',
    seatedId: 'seated_sway',
    keys: [
      k(0),
      k(0.6, { alp: 20, arp: 20 }),
      k(1.2, { ala: 28, ara: 28 }),
      k(1.8, { alp: -20, arp: -20 }),
      k(2.4),
    ],
  }),
  M({
    id: 'twist',
    label: 'torso twist',
    base: 'standing',
    cycleS: 2.4,
    view: 'front',
    seatedId: 'seated_twist',
    keys: [
      k(0, { alp: 40, arp: 40, ale: 110, are: 110 }),
      k(0.6, { tw: 35, alp: 40, arp: 40, ale: 110, are: 110 }),
      k(1.2, { alp: 40, arp: 40, ale: 110, are: 110 }),
      k(1.8, { tw: -35, alp: 40, arp: 40, ale: 110, are: 110 }),
      k(2.4, { alp: 40, arp: 40, ale: 110, are: 110 }),
    ],
  }),
  M({
    id: 'turn',
    label: 'quarter turn',
    base: 'standing',
    cycleS: 3.2,
    view: 'three_quarter',
    seatedId: 'seated_twist',
    keys: [k(0), k(1.6, { yaw: 90 }), k(3.2)],
  }),
  M({
    id: 'lean',
    label: 'side lean',
    base: 'standing',
    cycleS: 2.4,
    view: 'front',
    seatedId: 'seated_sway',
    keys: [
      k(0),
      k(0.6, { tr: 12, x: 0.05, ala: 30 }),
      k(1.2),
      k(1.8, { tr: -12, x: -0.05, ara: 30 }),
      k(2.4),
    ],
  }),
  M({
    id: 'breathe',
    label: 'breathing with the arms',
    base: 'standing',
    cycleS: 4,
    view: 'front',
    seatedId: 'seated_breathe',
    keys: [k(0), k(2, { alp: 150, arp: 150, hd: -8 }), k(4)],
  }),
  M({
    id: 'stretch',
    label: 'side stretch',
    base: 'standing',
    cycleS: 4,
    view: 'front',
    seatedId: 'seated_reach',
    keys: [k(0), k(2, { tr: -18, arp: 165, ara: 10, alp: 20, ale: 70 }), k(4)],
  }),
  // Standing, for exercises.
  M({
    id: 'squat',
    label: 'squat holding a load at the chest',
    base: 'standing',
    cycleS: 2.4,
    view: 'side',
    keys: [
      k(0, { alp: 60, arp: 60, ale: 100, are: 100 }),
      k(1.2, { llp: 55, lrp: 55, llk: 80, lrk: 80, tp: 20, alp: 60, arp: 60, ale: 100, are: 100 }),
      k(2.4, { alp: 60, arp: 60, ale: 100, are: 100 }),
    ],
  }),
  M({
    id: 'sit_to_stand',
    label: 'sit-to-stand with a chair',
    base: 'standing',
    cycleS: 4,
    view: 'side',
    chair: true,
    keys: [
      k(0),
      k(1, { tp: 25, llp: 50, llk: 70, lrp: 50, lrk: 70, alp: 40, arp: 40 }),
      k(2, { tp: 5, llp: 90, llk: 90, lrp: 90, lrk: 90 }),
      k(3, { tp: 25, llp: 55, llk: 75, lrp: 55, lrk: 75, alp: 40, arp: 40 }),
      k(4),
    ],
  }),
  M({
    id: 'hip_hinge',
    label: 'hip hinge',
    base: 'standing',
    cycleS: 3,
    view: 'side',
    keys: [k(0), k(1.5, { tp: 55, llk: 14, lrk: 14, llp: 10, lrp: 10, alp: 40, arp: 40 }), k(3)],
  }),
  M({
    id: 'wall_push_up',
    label: 'wall push-up',
    base: 'standing',
    cycleS: 3,
    view: 'side',
    keys: [
      k(0, { bp: 62, alp: 28, arp: 28, ale: 6, are: 6, ala: 15, ara: 15 }),
      k(1.5, { bp: 74, alp: 16, arp: 16, ale: 78, are: 78, ala: 15, ara: 15 }),
      k(3, { bp: 62, alp: 28, arp: 28, ale: 6, are: 6, ala: 15, ara: 15 }),
    ],
  }),
  M({
    id: 'split_squat',
    chairFront: true,
    label: 'split squat holding a chair',
    base: 'standing',
    cycleS: 2.6,
    view: 'side',
    chair: true,
    keys: [
      k(0, { llp: 15, lrp: -20, lrk: 10, alp: 30, arp: 30, ale: 20, are: 20 }),
      k(1.3, { llp: 60, llk: 70, lrp: -35, lrk: 60, tp: 5, alp: 30, arp: 30, ale: 20, are: 20 }),
      k(2.6, { llp: 15, lrp: -20, lrk: 10, alp: 30, arp: 30, ale: 20, are: 20 }),
    ],
  }),
  M({
    id: 'overhead_press',
    label: 'overhead press',
    base: 'standing',
    cycleS: 3,
    view: 'front',
    seatedId: 'seated_press',
    keys: [
      k(0, { alp: 15, arp: 15, ala: 35, ara: 35, ale: 115, are: 115 }),
      k(1.5, { alp: 170, arp: 170, ala: 10, ara: 10, ale: 5, are: 5 }),
      k(3, { alp: 15, arp: 15, ala: 35, ara: 35, ale: 115, are: 115 }),
    ],
  }),
  M({
    id: 'curl',
    label: 'arm curl',
    base: 'standing',
    cycleS: 3,
    view: 'front',
    seatedId: 'seated_curl',
    keys: [k(0), k(1.5, { ale: 130, are: 130, alp: 5, arp: 5 }), k(3)],
  }),
  M({
    id: 'towel_pull_apart',
    label: 'towel pull-apart',
    base: 'standing',
    cycleS: 2.4,
    view: 'front',
    seatedId: 'seated_towel',
    keys: [
      k(0, { alp: 80, arp: 80, ale: 25, are: 25, ala: 12, ara: 12 }),
      k(1, { alp: 60, arp: 60, ale: 15, are: 15, ala: 75, ara: 75 }),
      k(2.4, { alp: 80, arp: 80, ale: 25, are: 25, ala: 12, ara: 12 }),
    ],
  }),
  M({
    id: 'wall_slide',
    label: 'wall slide',
    base: 'standing',
    cycleS: 3,
    view: 'front',
    keys: [
      k(0, { ala: 45, ara: 45, ale: 90, are: 90 }),
      k(1.5, { ala: 150, ara: 150, ale: 20, are: 20 }),
      k(3, { ala: 45, ara: 45, ale: 90, are: 90 }),
    ],
  }),
  // Seated.
  M({
    id: 'seated_knee_lift',
    label: 'seated knee lift',
    base: 'seated',
    cycleS: 3.2,
    view: 'side',
    chair: true,
    keys: [
      k(0),
      k(0.8, { llp: 125, llk: 100, tp: -3 }),
      k(1.6),
      k(2.4, { lrp: 125, lrk: 100, tp: -3 }),
      k(3.2),
    ],
  }),
  M({
    id: 'seated_knee_extension',
    label: 'seated knee extension',
    base: 'seated',
    cycleS: 7.2,
    view: 'side',
    chair: true,
    keys: [
      k(0),
      k(1.2, { llk: 8 }),
      k(2.4, { llk: 8 }),
      k(3.6),
      k(4.8, { lrk: 8 }),
      k(6, { lrk: 8 }),
      k(7.2),
    ],
  }),
  M({
    id: 'seated_twist',
    label: 'seated torso twist',
    base: 'seated',
    cycleS: 2.4,
    view: 'front',
    chair: true,
    keys: [
      k(0, { alp: 40, arp: 40, ale: 110, are: 110 }),
      k(0.6, { tw: 35, alp: 40, arp: 40, ale: 110, are: 110 }),
      k(1.2, { alp: 40, arp: 40, ale: 110, are: 110 }),
      k(1.8, { tw: -35, alp: 40, arp: 40, ale: 110, are: 110 }),
      k(2.4, { alp: 40, arp: 40, ale: 110, are: 110 }),
    ],
  }),
  M({
    id: 'seated_press',
    label: 'seated overhead press',
    base: 'seated',
    cycleS: 3,
    view: 'front',
    chair: true,
    keys: [
      k(0, { alp: 15, arp: 15, ala: 35, ara: 35, ale: 115, are: 115 }),
      k(1.5, { alp: 170, arp: 170, ala: 10, ara: 10, ale: 5, are: 5 }),
      k(3, { alp: 15, arp: 15, ala: 35, ara: 35, ale: 115, are: 115 }),
    ],
  }),
  M({
    id: 'seated_curl',
    label: 'seated arm curl',
    base: 'seated',
    cycleS: 3,
    view: 'front',
    chair: true,
    keys: [k(0), k(1.5, { ale: 130, are: 130, alp: 5, arp: 5 }), k(3)],
  }),
  M({
    id: 'seated_row',
    label: 'seated row',
    base: 'seated',
    cycleS: 2.4,
    view: 'side',
    chair: true,
    keys: [
      k(0, { tp: 25, alp: 40, arp: 40, ale: 5, are: 5 }),
      k(1.2, { tp: 20, alp: -20, arp: -20, ale: 95, are: 95 }),
      k(2.4, { tp: 25, alp: 40, arp: 40, ale: 5, are: 5 }),
    ],
  }),
  M({
    id: 'seated_towel',
    label: 'seated towel pull-apart',
    base: 'seated',
    cycleS: 2.4,
    view: 'front',
    chair: true,
    keys: [
      k(0, { alp: 80, arp: 80, ale: 25, are: 25, ala: 12, ara: 12 }),
      k(1, { alp: 60, arp: 60, ale: 15, are: 15, ala: 75, ara: 75 }),
      k(2.4, { alp: 80, arp: 80, ale: 25, are: 25, ala: 12, ara: 12 }),
    ],
  }),
  M({
    id: 'seated_bounce',
    label: 'seated bounce',
    base: 'seated',
    cycleS: 1.2,
    view: 'front',
    chair: true,
    keys: [
      k(0),
      k(0.3, { llk: 80, lrk: 100, alp: 15, arp: -15, ale: 25, are: 25 }),
      k(0.6),
      k(0.9, { llk: 100, lrk: 80, alp: -15, arp: 15, ale: 25, are: 25 }),
      k(1.2),
    ],
  }),
  M({
    id: 'seated_sway',
    label: 'seated sway',
    base: 'seated',
    cycleS: 2.4,
    view: 'front',
    chair: true,
    keys: [k(0), k(0.6, { tr: -8, x: 0.04 }), k(1.2), k(1.8, { tr: 8, x: -0.04 }), k(2.4)],
  }),
  M({
    id: 'seated_step_out',
    label: 'seated step-out',
    base: 'seated',
    cycleS: 2.4,
    view: 'front',
    chair: true,
    keys: [k(0), k(0.6, { lra: 24, tr: -3 }), k(1.2), k(1.8, { lla: 24, tr: 3 }), k(2.4)],
  }),
  M({
    id: 'seated_reach',
    label: 'seated overhead reach',
    base: 'seated',
    cycleS: 3,
    view: 'front',
    chair: true,
    keys: [k(0), k(1.5, { alp: 170, arp: 170, ale: 5, are: 5, hd: -10 }), k(3)],
  }),
  M({
    id: 'seated_breathe',
    label: 'seated breathing with the arms',
    base: 'seated',
    cycleS: 4,
    view: 'front',
    chair: true,
    keys: [k(0), k(2, { alp: 150, arp: 150, hd: -8 }), k(4)],
  }),
];

export const MOTION_BY_ID: ReadonlyMap<string, Motion> = new Map(MOTIONS.map((m) => [m.id, m]));

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};
const baseOf = (m: Motion): Pose => (m.base === 'seated' ? SEATED : STAND);
const full = (m: Motion, p: Partial<Pose>): Pose => ({ ...baseOf(m), ...p });

/** Mixes two poses: 0 is `a`, 1 is `b`. */
export function mixPoses(a: Pose, b: Pose, w: number): Pose {
  const out = { ...a };
  for (const key of POSE_KEYS as readonly PoseKey[]) out[key] = a[key] + (b[key] - a[key]) * w;
  return out;
}

export interface PlayOptions {
  /** Half-size movements for a beginner modification. */
  easier?: boolean;
  /** Use each motion's seated version. */
  seated?: boolean;
}

/** The motion actually shown for a request: its seated version when asked and there is one, else the motion itself. */
export function resolveMotion(id: string, seated: boolean): Motion | null {
  const m = MOTION_BY_ID.get(id);
  if (!m) return null;
  if (seated && m.base !== 'seated')
    return m.seatedId ? (MOTION_BY_ID.get(m.seatedId) ?? null) : null;
  return m;
}
/** Whether a motion can be shown seated: it is a seated motion, or has a seated version. */
export const canSeat = (id: string): boolean => {
  const m = MOTION_BY_ID.get(id);
  return !!m && (m.base === 'seated' || !!m.seatedId);
};

/** One motion at time `t` seconds into its (repeating) cycle, with the beginner modification applied. */
export function evaluateMotion(m: Motion, t: number, opts: PlayOptions = {}): Pose {
  const phase = ((t % m.cycleS) + m.cycleS) % m.cycleS;
  let i = 0;
  while (i < m.keys.length - 2 && phase >= m.keys[i + 1]![0]) i++;
  const [t0, p0] = m.keys[i]!;
  const [t1, p1] = m.keys[i + 1]!;
  const pose = mixPoses(full(m, p0), full(m, p1), smooth((phase - t0) / (t1 - t0)));
  return opts.easier ? mixPoses(baseOf(m), pose, 0.5) : pose;
}

/** Blend time at both ends of a clip and between movements. */
export const BLEND_S = 0.8;

/**
 * A clip is one or more movements, each shown for an equal share of `totalS`, with a smooth crossfade between movements and a smooth start and finish from the
 * resting pose. Movements that cannot be shown for the request (for example no seated version) are skipped; null when none can.
 */
export function evaluateClip(
  motionIds: readonly string[],
  t: number,
  totalS: number,
  opts: PlayOptions = {},
): Pose | null {
  const ms = motionIds
    .map((id) => resolveMotion(id, opts.seated === true))
    .filter((m): m is Motion => m !== null);
  if (ms.length === 0) return null;
  const seg = totalS / ms.length;
  const at = (idx: number, time: number) => evaluateMotion(ms[idx]!, time, opts);
  const idx = Math.min(ms.length - 1, Math.max(0, Math.floor(t / seg)));
  let pose = at(idx, t);
  // Crossfade around each boundary, using each movement's own cycle so neither jumps.
  for (let b = 1; b < ms.length; b++) {
    const centre = b * seg;
    const w = (t - (centre - BLEND_S / 2)) / BLEND_S;
    if (w > 0 && w < 1) pose = mixPoses(at(b - 1, t), at(b, t), smooth(w));
  }
  // Rest -> first movement at the start, last movement -> rest at the end.
  const rest = ms[0]!.base === 'seated' ? SEATED : STAND;
  const edge = smooth(Math.min(t, totalS - t) / BLEND_S);
  return mixPoses(rest, pose, edge);
}

/** Seconds a clip of these motions lasts: about eight seconds for one movement, six for each of several. */
export function clipDuration(motionIds: readonly string[]): number {
  if (motionIds.length > 1) return motionIds.length * 6;
  const m = MOTION_BY_ID.get(motionIds[0] ?? '');
  return m ? Math.max(6, Math.round(m.cycleS * Math.ceil(8 / m.cycleS) * 10) / 10) : 8;
}

/** Whether any shown movement of the clip needs the chair drawn. */
export function clipHasChair(motionIds: readonly string[], seated: boolean): boolean {
  return motionIds.some((id) => resolveMotion(id, seated)?.chair === true);
}
/** The best viewing angle for a clip: that of its first shown movement. */
export function clipView(motionIds: readonly string[], seated: boolean): TrainerView {
  for (const id of motionIds) {
    const m = resolveMotion(id, seated);
    if (m) return m.view;
  }
  return 'front';
}

/** Whether the chair is in front of the trainer (held) rather than under them. */
export function clipChairFront(motionIds: readonly string[], seated: boolean): boolean {
  return motionIds.some((id) => resolveMotion(id, seated)?.chairFront === true);
}
