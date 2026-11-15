/**
 * The animated trainer's skeleton and camera: pure 3D maths, no graphics library, so the same figure animates the same way on every platform and can be tested
 * without a screen. A pose is a handful of joint angles in degrees; `solvePose` turns it into 3D joint positions by forward kinematics (every bone keeps its length
 * whatever the angles) and plants the feet on the floor; `project` turns joints into screen coordinates for a chosen viewing angle.
 *
 * This is ORIGINAL placeholder tooling: a plain figure made of lines and circles. It is not a character asset, not authentic choreography and not a reviewed
 * exercise demonstration. A rigged character (for example a glTF model with skeletal animation) would replace the renderer and feed the same clips; the clip format,
 * player, views and variants below stay.
 */
export interface Pose {
  /** Body turn about the vertical axis (degrees). */
  yaw: number;
  /** Whole-body tilt toward the facing direction (0 upright, 65 leaning on a wall, -90 lying on the back). */
  bp: number;
  /** Pelvis sideways travel in metres. */
  x: number;
  /** Torso lean forward, side bend and twist. */
  tp: number;
  tr: number;
  tw: number;
  /** Head nod. */
  hd: number;
  /** Left and right arm: shoulder raise forward (p), raise sideways (a), elbow bend (e). */
  alp: number;
  ala: number;
  ale: number;
  arp: number;
  ara: number;
  are: number;
  /** Left and right leg: hip raise forward (p), out sideways (a), knee bend (k). */
  llp: number;
  lla: number;
  llk: number;
  lrp: number;
  lra: number;
  lrk: number;
}
export type PoseKey = keyof Pose;
export const POSE_KEYS: readonly PoseKey[] = [
  'yaw',
  'bp',
  'x',
  'tp',
  'tr',
  'tw',
  'hd',
  'alp',
  'ala',
  'ale',
  'arp',
  'ara',
  'are',
  'llp',
  'lla',
  'llk',
  'lrp',
  'lra',
  'lrk',
];

export const STAND: Pose = {
  yaw: 0,
  bp: 0,
  x: 0,
  tp: 0,
  tr: 0,
  tw: 0,
  hd: 0,
  alp: 0,
  ala: 8,
  ale: 5,
  arp: 0,
  ara: 8,
  are: 5,
  llp: 0,
  lla: 3,
  llk: 0,
  lrp: 0,
  lra: 3,
  lrk: 0,
};
/** Sitting on a chair: thighs level, shins vertical. */
export const SEATED: Pose = {
  ...STAND,
  llp: 90,
  llk: 90,
  lrp: 90,
  lrk: 90,
  lla: 4,
  lra: 4,
  tp: 0,
};

/** Bone lengths in metres. */
export const BONES = {
  torso: 0.5,
  neck: 0.17,
  headR: 0.11,
  halfShoulder: 0.19,
  halfHip: 0.1,
  upperArm: 0.3,
  foreArm: 0.27,
  thigh: 0.43,
  shin: 0.43,
  foot: 0.2,
} as const;
/** Pelvis height standing with straight legs (ankle 0.04 above the floor). */
export const STAND_HIP_HEIGHT = BONES.thigh + BONES.shin + 0.04;
export const FOOT_Y = 0.04;
/** The seat of the placeholder chair. */
export const SEAT_HEIGHT = BONES.thigh + 0.04;

export type V3 = readonly [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
/** Rotation about x, y, z (right-handed). */
const rx = (v: V3, a: number): V3 => [
  v[0],
  v[1] * Math.cos(a) - v[2] * Math.sin(a),
  v[1] * Math.sin(a) + v[2] * Math.cos(a),
];
const ry = (v: V3, a: number): V3 => [
  v[0] * Math.cos(a) + v[2] * Math.sin(a),
  v[1],
  -v[0] * Math.sin(a) + v[2] * Math.cos(a),
];
const rz = (v: V3, a: number): V3 => [
  v[0] * Math.cos(a) - v[1] * Math.sin(a),
  v[0] * Math.sin(a) + v[1] * Math.cos(a),
  v[2],
];

export const JOINTS = [
  'pelvis',
  'neck',
  'head',
  'shoulderL',
  'elbowL',
  'wristL',
  'shoulderR',
  'elbowR',
  'wristR',
  'hipL',
  'kneeL',
  'ankleL',
  'toeL',
  'hipR',
  'kneeR',
  'ankleR',
  'toeR',
] as const;
export type JointName = (typeof JOINTS)[number];
export type Skeleton = Record<JointName, V3>;

/** A limb in its own plane: `p` is the upper bone's raise forward, `bend` the second bone's extra bend (in the same direction for an arm, backward for a leg). */
function limb(
  origin: V3,
  len1: number,
  len2: number,
  p: number,
  abd: number,
  bend: number,
  side: 1 | -1,
): [V3, V3] {
  const dir = (angle: number): V3 =>
    rz([0, -Math.cos(rad(angle)), Math.sin(rad(angle))], rad(side * abd));
  const mid = add(origin, scale(dir(p), len1));
  const end = add(mid, scale(dir(p + bend), len2));
  return [mid, end];
}

/** Forward kinematics, feet planted. */
export function solvePose(pose: Pose): Skeleton {
  const body = (v: V3): V3 => ry(rx(v, rad(pose.bp)), rad(pose.yaw));
  const up = (v: V3): V3 => rx(ry(rz(v, rad(-pose.tr)), rad(pose.tw)), rad(pose.tp)); // torso frame
  const pel: V3 = [pose.x, STAND_HIP_HEIGHT, 0];
  const L = (v: V3): V3 => add(pel, body(v));
  // A foot stays flat on the floor, pointing the way the body faces, however the body is tilted.
  const flatToe = (ankle: V3): V3 => add(ankle, ry([0, 0, BONES.foot], rad(pose.yaw)));
  const neckLocal = up([0, BONES.torso, 0]);
  const shoulder = (s: 1 | -1): V3 => add(neckLocal, up([s * BONES.halfShoulder, -0.04, 0]));
  const headLocal = add(neckLocal, rx(up([0, BONES.neck, 0]), rad(pose.hd)));
  const arm = (s: 1 | -1, p: number, a: number, e: number) => {
    const [mid, end] = limb([0, 0, 0], BONES.upperArm, BONES.foreArm, p, a, e, s);
    const o = shoulder(s);
    // The arm hangs from the shoulder in the torso frame.
    const m = add(o, up(mid));
    const w = add(o, up(end));
    return [o, m, w] as const;
  };
  const leg = (s: 1 | -1, p: number, a: number, k: number) => {
    const hip: V3 = [s * BONES.halfHip, 0, 0];
    const [knee, ankle] = limb(hip, BONES.thigh, BONES.shin, p, a, -k, s);
    // The foot stays flat, pointing forward from the ankle.
    const foot = ankle; // placed flat in world space below, after the body is tilted
    return [hip, knee, ankle, foot] as const;
  };
  const [shL, elL, wrL] = arm(-1, pose.alp, pose.ala, pose.ale);
  const [shR, elR, wrR] = arm(1, pose.arp, pose.ara, pose.are);
  const [hpL, knL, anL, tL] = leg(-1, pose.llp, pose.lla, pose.llk);
  const [hpR, knR, anR, tR] = leg(1, pose.lrp, pose.lra, pose.lrk);
  const raw: Skeleton = {
    pelvis: L([0, 0, 0]),
    neck: L(neckLocal),
    head: L(headLocal),
    shoulderL: L(shL),
    elbowL: L(elL),
    wristL: L(wrL),
    shoulderR: L(shR),
    elbowR: L(elR),
    wristR: L(wrR),
    hipL: L(hpL),
    kneeL: L(knL),
    ankleL: L(anL),
    toeL: flatToe(L(tL)),
    hipR: L(hpR),
    kneeR: L(knR),
    ankleR: L(anR),
    toeR: flatToe(L(tR)),
  };
  // Plant the feet (or, when lying, the lowest joint) on the floor.
  const lying = Math.abs(pose.bp) > 80;
  const lowest = lying
    ? Math.min(...JOINTS.map((j) => raw[j][1])) - 0.06
    : Math.min(raw.ankleL[1], raw.ankleR[1]) - FOOT_Y;
  const out = {} as Skeleton;
  for (const j of JOINTS) out[j] = [raw[j][0], raw[j][1] - lowest, raw[j][2]];
  return out;
}

/** The bones as pairs, for drawing and for the length tests. */
export const BONE_LIST: ReadonlyArray<readonly [JointName, JointName, number]> = [
  ['pelvis', 'neck', BONES.torso],
  ['shoulderL', 'elbowL', BONES.upperArm],
  ['elbowL', 'wristL', BONES.foreArm],
  ['shoulderR', 'elbowR', BONES.upperArm],
  ['elbowR', 'wristR', BONES.foreArm],
  ['hipL', 'kneeL', BONES.thigh],
  ['kneeL', 'ankleL', BONES.shin],
  ['hipR', 'kneeR', BONES.thigh],
  ['kneeR', 'ankleR', BONES.shin],
];

/** Viewing angles. In the front view the trainer's right side is on the viewer's right, as in a class mirror, so a learner copies the same side. */
export const VIEWS = ['front', 'three_quarter', 'side'] as const;
export type TrainerView = (typeof VIEWS)[number];
export const VIEW_YAW: Record<TrainerView, number> = { front: 0, three_quarter: 40, side: 90 };

export interface Projected {
  x: number;
  y: number;
  /** Depth towards the viewer (larger is nearer), for drawing order. */
  z: number;
  /** Perspective scale. */
  s: number;
}
/** Projects a 3D point to the screen: x right, y down, in metres scaled by `ppm` (pixels per metre) around `cx`, ground at `groundY`. */
export function project(
  p: V3,
  view: TrainerView,
  ppm: number,
  cx: number,
  groundY: number,
): Projected {
  const yaw = rad(VIEW_YAW[view]);
  const r = ry(p, -yaw);
  const f = 7;
  const s = f / (f - r[2]);
  return { x: cx + r[0] * ppm * s, y: groundY - r[1] * ppm * s, z: r[2], s };
}
