import { describe, expect, it } from 'vitest';
import {
  BONE_LIST,
  DRAFT_WORKOUTS,
  FOOT_Y,
  HOME_EXERCISES,
  JOINTS,
  MOTIONS,
  MOTION_BY_ID,
  POSE_KEYS,
  SEATED,
  SEAT_HEIGHT,
  STAND,
  TRAINER_CLIPS,
  VIEWS,
  canSeat,
  clipDuration,
  clipHasChair,
  clipView,
  evaluateClip,
  evaluateMotion,
  motionsForBlock,
  project,
  resolveMotion,
  solvePose,
  type Pose,
} from './index';

const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const maxDelta = (a: Pose, b: Pose) => Math.max(...POSE_KEYS.map((k) => Math.abs(a[k] - b[k])));

describe('trainer rig', () => {
  it('keeps every bone its length whatever the pose, and every joint finite', () => {
    const rnd = (() => {
      let s = 7;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    })();
    for (let n = 0; n < 200; n++) {
      const pose = { ...STAND } as Pose;
      for (const k of POSE_KEYS)
        (pose as unknown as Record<string, number>)[k] = STAND[k] + rnd() * 60;
      const sk = solvePose(pose);
      for (const j of JOINTS) for (const c of sk[j]) expect(Number.isFinite(c)).toBe(true);
      for (const [a, b, len] of BONE_LIST)
        expect(dist(sk[a], sk[b]), `${a}-${b}`).toBeCloseTo(len, 5);
    }
  });

  it('stands with straight legs on the floor, and a seated pose sits on the chair seat', () => {
    const s = solvePose(STAND);
    expect(s.ankleL[1]).toBeCloseTo(FOOT_Y, 5);
    expect(s.head[1]).toBeGreaterThan(1.5);
    expect(s.head[1]).toBeLessThan(1.9);
    const seated = solvePose(SEATED);
    expect(seated.pelvis[1]).toBeCloseTo(SEAT_HEIGHT, 1);
    expect(seated.kneeL[1]).toBeCloseTo(seated.pelvis[1], 1); // thighs level
  });

  it('projects with a front, a three-quarter and a side view that really differ', () => {
    expect(VIEWS).toEqual(['front', 'three_quarter', 'side']);
    const wide = solvePose({ ...STAND, ala: 90, ara: 90 }); // arms out to the sides
    const spread = (view: (typeof VIEWS)[number]) => {
      const xs = JOINTS.map((j) => project(wide[j], view, 100, 0, 0).x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread('front')).toBeGreaterThan(spread('three_quarter'));
    expect(spread('three_quarter')).toBeGreaterThan(spread('side'));
    // The trainer's right is on the viewer's right in the front view.
    const sk = solvePose(STAND);
    expect(project(sk.shoulderR, 'front', 100, 0, 0).x).toBeGreaterThan(
      project(sk.shoulderL, 'front', 100, 0, 0).x,
    );
    // Higher is higher on screen.
    expect(project(sk.head, 'front', 100, 0, 200).y).toBeLessThan(
      project(sk.ankleL, 'front', 100, 0, 200).y,
    );
  });
});

describe('trainer motions', () => {
  const all = MOTIONS.map((m) => m.id);

  it('has unique motions whose seated versions exist and are seated', () => {
    expect(new Set(all).size).toBe(all.length);
    for (const m of MOTIONS) {
      if (m.seatedId) expect(MOTION_BY_ID.get(m.seatedId)?.base, m.id).toBe('seated');
      expect(m.keys[0]![0]).toBe(0);
      expect(m.keys.at(-1)![0], m.id).toBe(m.cycleS);
    }
  });

  it('every movement keeps both feet on the floor line and nothing goes through the floor, normal, easier and seated', () => {
    for (const id of all)
      for (const easier of [false, true])
        for (let t = 0; t < MOTION_BY_ID.get(id)!.cycleS; t += 0.1) {
          const sk = solvePose(evaluateMotion(MOTION_BY_ID.get(id)!, t, { easier }));
          const low = Math.min(...JOINTS.map((j) => sk[j][1]));
          // Standing and seated figures stand or sit on the floor; the low point is a foot, within a small allowance for a lifted-heel pose.
          expect(low, `${id} t=${t}`).toBeGreaterThanOrEqual(-0.02);
          const feet = Math.min(sk.ankleL[1], sk.ankleR[1]);
          if (Math.abs(evaluateMotion(MOTION_BY_ID.get(id)!, t, { easier }).bp) <= 80)
            expect(feet, `${id} t=${t}`).toBeCloseTo(FOOT_Y, 3);
        }
  });

  it('the beginner modification is always gentler than the full movement', () => {
    for (const m of MOTIONS) {
      let full = 0;
      let easy = 0;
      for (let t = 0; t < m.cycleS; t += 0.1) {
        const base = m.base === 'seated' ? SEATED : STAND;
        full = Math.max(full, maxDelta(evaluateMotion(m, t), base));
        easy = Math.max(easy, maxDelta(evaluateMotion(m, t, { easier: true }), base));
      }
      expect(easy, m.id).toBeLessThan(full);
      expect(easy, m.id).toBeCloseTo(full / 2, 0);
    }
  });

  it('seated motions keep the pelvis on the seat; a chair is drawn for them and for sit-to-stand', () => {
    for (const m of MOTIONS.filter((x) => x.base === 'seated'))
      for (let t = 0; t < m.cycleS; t += 0.2) {
        const sk = solvePose(evaluateMotion(m, t));
        expect(sk.pelvis[1], `${m.id} t=${t}`).toBeGreaterThan(SEAT_HEIGHT - 0.12);
        expect(sk.pelvis[1], `${m.id} t=${t}`).toBeLessThan(SEAT_HEIGHT + 0.12);
        expect(m.chair, m.id).toBe(true);
      }
    expect(MOTION_BY_ID.get('sit_to_stand')!.chair).toBe(true);
  });

  it('shows the seated version when asked and there is one, and says so when there is not', () => {
    expect(resolveMotion('march', true)?.id).toBe('seated_knee_lift');
    expect(resolveMotion('march', false)?.id).toBe('march');
    expect(resolveMotion('seated_press', true)?.id).toBe('seated_press');
    expect(resolveMotion('hip_hinge', true)).toBeNull();
    expect(canSeat('march')).toBe(true);
    expect(canSeat('hip_hinge')).toBe(false);
    expect(evaluateClip(['hip_hinge'], 1, 8, { seated: true })).toBeNull();
    expect(clipHasChair(['march'], true)).toBe(true);
    expect(clipHasChair(['march'], false)).toBe(false);
  });

  it('starts and ends in the resting pose and moves smoothly everywhere, including between movements', () => {
    const chains: string[][] = [
      ...all.map((id) => [id]),
      ['bounce', 'side_step', 'hip_rock'],
      ['hip_sway', 'side_step', 'arm_reach'],
      ['seated_bounce', 'seated_step_out', 'seated_sway'],
      ['step_touch', 'hip_sway', 'arm_reach'],
    ];
    for (const chain of chains)
      for (const seated of [false, true]) {
        const total = clipDuration(chain);
        const first = resolveMotion(chain[0]!, seated);
        if (!first) continue;
        const rest = first.base === 'seated' ? SEATED : STAND;
        expect(
          maxDelta(evaluateClip(chain, 0, total, { seated })!, rest),
          chain.join(),
        ).toBeLessThan(1e-6);
        expect(
          maxDelta(evaluateClip(chain, total, total, { seated })!, rest),
          chain.join(),
        ).toBeLessThan(1e-6);
        let prev = evaluateClip(chain, 0, total, { seated })!;
        for (let t = 1 / 30; t <= total; t += 1 / 30) {
          const cur = evaluateClip(chain, t, total, { seated })!;
          // No pose snaps: at 30 frames a second no joint turns more than 12 degrees between frames.
          expect(
            maxDelta(prev, cur),
            `${chain.join('+')} seated=${seated} t=${t.toFixed(2)}`,
          ).toBeLessThan(12);
          prev = cur;
        }
      }
  });

  it('suggests a sensible viewing angle: side views for movements seen best from the side', () => {
    expect(clipView(['hip_hinge'], false)).toBe('side');
    expect(clipView(['sit_to_stand'], false)).toBe('side');
    expect(clipView(['march'], false)).toBe('front');
    expect(clipView(['turn'], false)).toBe('three_quarter');
    expect(clipView([], false)).toBe('front');
  });
});

describe('trainer clips for the draft content', () => {
  it('covers each of the five packs, and every clip is a labelled, unreviewed placeholder', () => {
    expect(TRAINER_CLIPS.length).toBeGreaterThan(40);
    for (const c of TRAINER_CLIPS) {
      expect(c.kind).toBe('animation');
      expect(c.review).toBe('unreviewed');
      expect(c.fixture).toBe(true);
      expect(c.licence).toBeUndefined();
      expect(c.captions).toMatch(/Placeholder animation/);
      expect(c.captions).toMatch(/not a reviewed demonstration|not the .* choreography/);
      expect(c.captions.toLowerCase()).not.toMatch(
        /authentic|official|professional(ly)? (reviewed|approved)/,
      );
      const ids = c.uri.replace('trainer:', '').split('+');
      for (const id of ids) expect(MOTION_BY_ID.has(id), c.id).toBe(true);
      expect(c.durationS).toBe(clipDuration(ids));
    }
    for (const style of ['dancehall', 'reggae', 'chair_dance', 'low_impact']) {
      const ws = DRAFT_WORKOUTS.filter((w) => w.style === style);
      const covered = ws.some((w) =>
        w.blocks.some((_, i) => TRAINER_CLIPS.some((c) => c.subjectId === `${w.id}:${i}`)),
      );
      expect(covered, style).toBe(true);
    }
    expect(TRAINER_CLIPS.some((c) => c.subjectId === 'home-chair-sit-to-stand')).toBe(true);
    expect(TRAINER_CLIPS.some((c) => c.subjectId === 'draft-wall-push-up')).toBe(true);
  });

  it('never animates a movement it cannot honestly match, and the fixtures used by the browser test stay free', () => {
    expect(TRAINER_CLIPS.some((c) => c.subjectId === 'home-dead-bug')).toBe(false);
    expect(TRAINER_CLIPS.some((c) => c.subjectId === 'home-bird-dog')).toBe(false);
    expect(motionsForBlock('dancehall', { title: 'Something with no matching words' })).toEqual([]);
    const unmapped = HOME_EXERCISES.filter((e) => !TRAINER_CLIPS.some((c) => c.subjectId === e.id));
    expect(unmapped.length).toBeGreaterThan(0); // the player says so for these
  });

  it('chair dance blocks use seated motions, and standing dance blocks can be shown seated where a seated version exists', () => {
    for (const w of DRAFT_WORKOUTS.filter((x) => x.style === 'chair_dance'))
      w.blocks.forEach((_, i) => {
        const c = TRAINER_CLIPS.find((x) => x.subjectId === `${w.id}:${i}`);
        if (!c) return;
        for (const id of c.uri.replace('trainer:', '').split('+'))
          expect(MOTION_BY_ID.get(id)?.base ?? 'seated', `${w.id}:${i}`).toBe('seated');
      });
    const low = DRAFT_WORKOUTS.find((w) => w.style === 'low_impact')!;
    const seatable = low.blocks.filter((_, i) => {
      const c = TRAINER_CLIPS.find((x) => x.subjectId === `${low.id}:${i}`);
      return c && c.uri.replace('trainer:', '').split('+').every(canSeat);
    });
    expect(seatable.length).toBeGreaterThan(0);
  });
});
