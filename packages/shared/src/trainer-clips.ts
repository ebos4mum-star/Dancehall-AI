import type { DemoClip } from './demo-media';
import { DRAFT_STRENGTH_EXERCISES, DRAFT_WORKOUTS } from './draft-packs';
import { HOME_EXERCISES } from './home-exercises';
import { MOTION_BY_ID, clipDuration, resolveMotion } from './trainer-motions';
import { movementId } from './instruction-media';
import { STYLE_DEFS, type DanceStyle, type WorkoutBlock, type WorkoutDef } from './workouts';

/**
 * Placeholder trainer animations for the draft content: which generic motion illustrates which block or exercise. A motion is attached ONLY where one matches the
 * movement plainly (a march for a march, a sit-to-stand for a sit-to-stand); everything else has no animation and the player says so. These are drafts: labelled,
 * preview-only, never approved, and their captions say they are generic placeholders and not the choreography or a reviewed demonstration.
 */
export const EXERCISE_MOTION: Readonly<Record<string, string>> = {
  'home-chair-sit-to-stand': 'sit_to_stand',
  'home-chair-slow-sit-to-stand': 'sit_to_stand',
  'home-chair-staggered-sit-to-stand': 'sit_to_stand',
  'draft-sit-to-stand': 'sit_to_stand',
  'home-backpack-squat': 'squat',
  'home-backpack-slow-squat': 'squat',
  'home-hip-hinge': 'hip_hinge',
  'home-bottle-hinge': 'hip_hinge',
  'draft-hip-hinge': 'hip_hinge',
  'home-wall-push-up': 'wall_push_up',
  'home-wall-push-up-far': 'wall_push_up',
  'draft-wall-push-up': 'wall_push_up',
  'home-chair-split-squat': 'split_squat',
  'draft-supported-split-squat': 'split_squat',
  'home-seated-knee-extension': 'seated_knee_extension',
  'home-seated-knee-lift': 'seated_knee_lift',
  'home-seated-trunk-twist': 'seated_twist',
  'home-towel-pull-apart': 'towel_pull_apart',
  'home-bottle-seated-press': 'seated_press',
  'home-bottle-standing-press': 'overhead_press',
  'home-backpack-press': 'seated_press',
  'home-bottle-curl': 'curl',
  'home-bottle-seated-row': 'seated_row',
  'home-wall-angel': 'wall_slide',
};

const COMPOSITE: Record<string, string[]> = {
  dancehall: ['bounce', 'side_step', 'hip_rock'],
  reggae: ['hip_sway', 'side_step', 'arm_reach'],
  chair_dance: ['seated_bounce', 'seated_step_out', 'seated_sway'],
  low_impact: ['step_touch', 'hip_sway', 'arm_reach'],
};

/** Keyword rules in order: the first that matches the block's title decides. */
const RULES: ReadonlyArray<readonly [RegExp, string[]]> = [
  [/put it together|routine|run-through|flow it|link/i, []], // composite, filled per style
  [/quarter-turn/i, ['turn']],
  [/weight shift|slow weight/i, ['weight_shift']],
  [/knee bends?|knee and/i, ['knee_bend']],
  [/march/i, ['march']],
  [
    /step and sweep|step-out|step-touch|side-to-side step|step and lean|side step|step, lean/i,
    ['side_step'],
  ],
  [/hip rock|hip and knee/i, ['hip_rock']],
  [/hip sway|side sway|hip circles/i, ['hip_sway']],
  [/bounce/i, ['bounce']],
  [/twist/i, ['twist']],
  [/arm lifts|arm reaches|reach/i, ['arm_reach']],
  [/arm circles|roll/i, ['arm_circles']],
  [/breath/i, ['breathe']],
  [/stretch|settle|slow down|slow sway/i, ['stretch']],
  [/arms and hips/i, ['hip_sway', 'arm_reach']],
  [/toe and heel taps|taps/i, ['march']],
];

export function motionsForBlock(style: DanceStyle, block: Pick<WorkoutBlock, 'title'>): string[] {
  for (const [re, motions] of RULES) {
    if (re.test(block.title)) return motions.length > 0 ? motions : (COMPOSITE[style] ?? []);
  }
  return [];
}

const styleLabel = (s: DanceStyle) => STYLE_DEFS[s].label;
const SAME =
  'It is not a reviewed demonstration and no professional has checked it. Follow the written steps.';

function blockClip(w: WorkoutDef, index: number): DemoClip | null {
  const block = w.blocks[index]!;
  // A chair-dance block is seated throughout, so it is shown with each movement's seated version.
  const motions = motionsForBlock(w.style, block).map((id) =>
    STYLE_DEFS[w.style].seatedOnly ? (resolveMotion(id, true)?.id ?? '') : id,
  );
  const known = motions.filter((id) => MOTION_BY_ID.has(id));
  if (known.length === 0) return null;
  const labels = known.map((id) => MOTION_BY_ID.get(id)!.label).join(', then ');
  return {
    id: `trainer-${w.id}-${index}`,
    subjectId: movementId(w.id, index),
    kind: 'animation',
    uri: `trainer:${known.join('+')}`,
    durationS: clipDuration(known),
    captions: `Placeholder animation of a generic ${labels}. It shows a plain movement pattern only. It is not the ${styleLabel(w.style)} choreography, not a recording of any dancer, and no practitioner has reviewed it. ${SAME}`,
    audioDescription: `A plain figure repeats a ${labels}. Placeholder only.`,
    review: 'unreviewed',
    attribution: {
      creditLine:
        'Original placeholder animation, generated in code. Not a reviewed demonstration.',
    },
    fixture: true,
  };
}

function exerciseClip(id: string): DemoClip | null {
  const motion = EXERCISE_MOTION[id];
  const m = motion ? MOTION_BY_ID.get(motion) : undefined;
  if (!m) return null;
  return {
    id: `trainer-${id}`,
    subjectId: id,
    kind: 'animation',
    uri: `trainer:${m.id}`,
    durationS: clipDuration([m.id]),
    captions: `Placeholder animation of a generic ${m.label}. It shows a plain movement pattern with a simple figure, not a character or a recorded person. ${SAME}`,
    audioDescription: `A plain figure repeats a ${m.label}. Placeholder only.`,
    review: 'unreviewed',
    attribution: {
      creditLine:
        'Original placeholder animation, generated in code. Not a reviewed demonstration.',
    },
    fixture: true,
  };
}

/** Every placeholder trainer clip for the draft content. Registered only in development and review builds. */
export function buildTrainerClips(): DemoClip[] {
  const out: DemoClip[] = [];
  for (const w of DRAFT_WORKOUTS)
    w.blocks.forEach((_, i) => {
      const c = blockClip(w, i);
      if (c) out.push(c);
    });
  for (const e of [...DRAFT_STRENGTH_EXERCISES, ...HOME_EXERCISES]) {
    const c = exerciseClip(e.id);
    if (c) out.push(c);
  }
  return out;
}
export const TRAINER_CLIPS: readonly DemoClip[] = buildTrainerClips();
