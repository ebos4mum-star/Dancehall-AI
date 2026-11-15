import type { StrengthExerciseDef, StrengthWorkoutDef } from './strength';
import type { DraftInfo, WorkoutBlock, WorkoutDef } from './workouts';

/**
 * DRAFT WORKOUT PACKS. Original session structures written for this app: timings, transitions, instructions, easier versions and seated versions that run in the
 * existing player. They are DRAFTS. No qualified person has reviewed them, no Dancehall or reggae practitioner has checked the movement or the tempo, no music is
 * licensed for them and no rights agreement exists. So:
 *
 *  - every item carries a `draft` marker that lists what it still needs, and no provenance (it must never look reviewed);
 *  - the bundled-content gate fails CI if a draft is ever in the bundle, and the seed script refuses it;
 *  - they are visible only in development and review builds (the same switch as the internal fixtures), labelled "Draft, not reviewed", and left out of the
 *    automatic suggestions;
 *  - the movement vocabulary is deliberately plain (bounce, step, sway, rock). The pack names no signature move and makes no claim about the culture, the genre or
 *    any dancer: those claims belong to the practitioners who review and credit the final versions.
 *
 * Music is not included. `tempoBpm` is the target range a track must match; a licensed or royalty-free track of that tempo (with its licence recorded) is
 * still needed for each pack.
 */
const NEEDS_MUSIC =
  'A licensed or royalty-free track at the target tempo, with its licence recorded (none is included).';
const NEEDS_FITNESS =
  'Independent review by an exercise professional, strength coach or physiotherapist.';
const NEEDS_AUTHOR = 'A credited author or choreographer and a signed rights agreement.';
const NEEDS_TEMPO = 'The practitioners confirm the tempo range by dancing it.';
const NEEDS_CULTURE = 'A cultural review by qualified practitioners of the style.';

const draft = (pack: string, extra: string[] = []): DraftInfo => ({
  pack,
  needs: [NEEDS_AUTHOR, NEEDS_FITNESS, NEEDS_MUSIC, ...extra],
});

const b = (
  kind: WorkoutBlock['kind'],
  title: string,
  seconds: number,
  cue: string,
  lowImpactAlt: string,
  seatedAlt?: string,
): WorkoutBlock => ({
  kind,
  title,
  seconds,
  cue,
  lowImpactAlt,
  ...(seatedAlt ? { seatedAlt } : {}),
});

const SAFETY = [
  'Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.',
  'Keep your movements within what is comfortable; you should be able to talk while you move.',
];
const SAFETY_SEATED = [
  'Use a sturdy chair without wheels, on a non-slip floor, with both feet flat on the floor.',
  ...SAFETY,
];

const DRAFT_NOTE = 'Draft, not reviewed.';

const base = (
  id: string,
  title: string,
  style: WorkoutDef['style'],
  minutes: number,
  extra: Partial<WorkoutDef> &
    Pick<WorkoutDef, 'summary' | 'blocks' | 'tempoBpm' | 'draft' | 'intensity'>,
): WorkoutDef => ({
  id,
  title,
  style,
  level: 'beginner',
  minutes,
  impact: 'low',
  instructorId: null,
  equipment: 'none',
  contentOrigin: 'original_text',
  safety: SAFETY,
  ...extra,
});

const DANCEHALL = 'dancehall-foundations';
const REGGAE = 'reggae-flow';
const CHAIR = 'chair-dance';
const LOW = 'low-impact-dance';
const STRENGTH = 'beginner-strength';

export const DRAFT_WORKOUTS: readonly WorkoutDef[] = [
  base('draft-dancehall-foundations-10', 'Dancehall Foundations', 'dancehall', 10, {
    summary: `Ten minutes of bounce, side step and hip rock, built up one step at a time. ${DRAFT_NOTE}`,
    intensity: 'moderate',
    tempoBpm: [90, 102],
    draft: draft(DANCEHALL, [NEEDS_TEMPO, NEEDS_CULTURE]),
    blocks: [
      b(
        'warmup',
        'Weight shifts and shoulder rolls',
        45,
        'Stand with your feet a little wider than your hips. Shift your weight slowly from one foot to the other and roll your shoulders back.',
        'Keep the shifts small and stay close to a wall or chair for balance.',
      ),
      b(
        'warmup',
        'Knee bends and arm circles',
        45,
        'Bend your knees gently a few times, then circle your arms forward and back, slowly getting a little bigger.',
        'Bend only a little and keep the arm circles small.',
      ),
      b(
        'main',
        'Easy bounce',
        90,
        'Soften your knees and bounce gently in time with the music, heels staying close to the floor. Let your arms hang loose and swing a little.',
        'Do a slow weight shift instead of the bounce.',
      ),
      b(
        'main',
        'Side-to-side step',
        90,
        'Step to the right and bring your feet together, then step to the left. Keep your knees soft and let your arms follow the step.',
        'Take smaller steps and keep one foot on the floor.',
      ),
      b(
        'main',
        'Hip rock',
        90,
        'Rock your hips gently forward and back while your chest stays tall and your knees stay soft. Keep it relaxed rather than big.',
        'Make the rock very small and hold a chair for balance.',
      ),
      b(
        'main',
        'Put it together',
        150,
        'Link what you have learned: four bounces, four steps to the side, then four hip rocks. Repeat, and keep your shoulders relaxed.',
        'Do the same pattern with smaller movements and a slower pace.',
      ),
      b(
        'cooldown',
        'Slow sway and breathing',
        45,
        'Slow right down to a gentle sway. Breathe in through your nose and out through your mouth.',
        'Sway very slightly, or stand still and breathe.',
      ),
      b(
        'cooldown',
        'Stretch',
        45,
        'Hold a calf stretch, a hip stretch and a shoulder stretch for about fifteen seconds each, without bouncing.',
        'Do the stretches standing at a wall, or seated.',
      ),
    ],
  }),
  base('draft-dancehall-builder-15', 'Dancehall Cardio Builder', 'dancehall', 15, {
    summary: `Fifteen minutes that add a quarter turn and a longer routine to the foundations. ${DRAFT_NOTE}`,
    intensity: 'moderate',
    tempoBpm: [90, 102],
    draft: draft(DANCEHALL, [NEEDS_TEMPO, NEEDS_CULTURE]),
    blocks: [
      b(
        'warmup',
        'March and reach',
        60,
        'March in place, swinging your arms, and reach overhead every fourth step.',
        'March more slowly, and keep your arms low.',
      ),
      b(
        'warmup',
        'Hip circles and side bends',
        60,
        'Make slow hip circles in each direction, then bend gently from side to side.',
        'Keep the circles small and hold a chair or wall.',
      ),
      b(
        'main',
        'Warm bounce',
        132,
        'Bounce gently with soft knees, letting your arms swing loosely. Stay light on your feet.',
        'Replace the bounce with a slow weight shift.',
      ),
      b(
        'main',
        'Step and sweep',
        132,
        'Step to the side and sweep your arm across your body as you bring your feet together. Alternate sides.',
        'Step without the sweep, or sweep your arm only to chest height.',
      ),
      b(
        'main',
        'Hip rock and knee bend',
        132,
        'Add a deeper knee bend to the hip rock. Keep your chest tall and your weight over both feet.',
        'Keep the knee bend shallow.',
      ),
      b(
        'main',
        'Quarter-turn pattern',
        132,
        'Do four bounces, four steps to the side and a quarter turn, then repeat so that you face each wall in turn.',
        'Skip the turn and repeat the pattern facing the front.',
      ),
      b(
        'main',
        'Full routine run-through',
        132,
        'Put every part together and run it through at an easy pace. Keep breathing and keep your shoulders loose.',
        'Run through it at half effort with smaller movements.',
      ),
      b(
        'cooldown',
        'Slow walk and breathing',
        60,
        'Walk slowly in place and breathe in through your nose, out through your mouth, until your breathing settles.',
        'Stand still, or sit, and breathe slowly.',
      ),
      b(
        'cooldown',
        'Stretch',
        60,
        'Hold a calf, front-of-thigh and chest stretch for about twenty seconds each, without bouncing.',
        'Do the stretches seated or at a wall.',
      ),
    ],
  }),

  base('draft-reggae-sway-10', 'Reggae Sway Flow', 'reggae', 10, {
    summary: `A slow, steady ten minutes of sway, weight shift and relaxed arm movement. ${DRAFT_NOTE}`,
    intensity: 'low',
    tempoBpm: [70, 85],
    draft: draft(REGGAE, [NEEDS_TEMPO, NEEDS_CULTURE]),
    blocks: [
      b(
        'warmup',
        'Breathe and roll',
        60,
        'Stand tall, breathe slowly and roll your shoulders and neck gently.',
        'Do the same seated, or standing at a wall.',
      ),
      b(
        'warmup',
        'Slow weight shift',
        60,
        'Shift your weight from foot to foot in time with the music. Let your arms hang and your knees stay soft.',
        'Keep the shift very small.',
      ),
      b(
        'main',
        'Side sway',
        90,
        'Sway from side to side, letting your hips lead and your shoulders follow.',
        'Sway in a smaller range and keep both feet planted.',
      ),
      b(
        'main',
        'Step and lean',
        90,
        'Step to one side, lean your upper body gently the same way, then return. Keep your movements loose and slow.',
        'Lean less and keep your feet closer together.',
      ),
      b(
        'main',
        'Arm lifts on the off-beat',
        90,
        'Keep your steps steady and lift your hands lightly in between the main beats, as though you are bringing the sound up with you.',
        'Lift your hands only to waist height.',
      ),
      b(
        'main',
        'Flow it together',
        90,
        'Link the sway, the step and lean, and the arm lifts, moving smoothly from one to the next.',
        'Link them with smaller movements and a slower pace.',
      ),
      b(
        'cooldown',
        'Settle',
        30,
        'Let your movement slow to a gentle sway and let your breathing slow with it.',
        'Stand still and breathe slowly.',
      ),
      b(
        'cooldown',
        'Stretch',
        90,
        'Hold a neck, shoulder, hip and calf stretch for about twenty seconds each, without bouncing.',
        'Do the stretches seated.',
      ),
    ],
  }),
  base('draft-reggae-groove-15', 'Reggae Steady Groove', 'reggae', 15, {
    summary: `Fifteen minutes of steady grooving with slow turns and longer flowing patterns. ${DRAFT_NOTE}`,
    intensity: 'low',
    tempoBpm: [70, 85],
    draft: draft(REGGAE, [NEEDS_TEMPO, NEEDS_CULTURE]),
    blocks: [
      b(
        'warmup',
        'Breathe and sway',
        90,
        'Stand tall and breathe slowly while you sway gently. Roll your shoulders and loosen your arms.',
        'Do this seated or standing at a wall.',
      ),
      b(
        'warmup',
        'Hip and knee warm-up',
        90,
        'Make slow hip circles, then bend and straighten your knees gently, getting a little deeper each time.',
        'Keep the movements small and hold a chair.',
      ),
      b(
        'main',
        'Side sway',
        150,
        'Sway from side to side, letting your hips lead and your shoulders follow.',
        'Sway in a smaller range with both feet planted.',
      ),
      b(
        'main',
        'Step, lean and return',
        150,
        'Step to one side and lean your upper body the same way, then return to the middle. Repeat on the other side.',
        'Lean less and take smaller steps.',
      ),
      b(
        'main',
        'Slow turn',
        150,
        'Add a slow quarter turn after each pair of steps, so that you gradually face each wall in turn.',
        'Skip the turn and stay facing the front.',
      ),
      b(
        'main',
        'Arms and hips together',
        150,
        'Combine the arm lifts between the beats with the hip sway, keeping everything loose and relaxed.',
        'Keep your arms low and your hips still, or the other way round.',
      ),
      b(
        'cooldown',
        'Slow walk and breathing',
        60,
        'Walk slowly in place and breathe in through your nose, out through your mouth.',
        'Stand still or sit and breathe slowly.',
      ),
      b(
        'cooldown',
        'Stretch',
        60,
        'Hold a calf, hip and shoulder stretch for about twenty seconds each, without bouncing.',
        'Do the stretches seated.',
      ),
    ],
  }),

  base('draft-chair-dance-5', 'Chair Dance Quick Start', 'chair_dance', 5, {
    summary: `Five minutes of seated rhythm for the upper body, hips and feet. ${DRAFT_NOTE}`,
    intensity: 'low',
    tempoBpm: [90, 105],
    seatedSuitable: true,
    safety: SAFETY_SEATED,
    draft: draft(CHAIR, [NEEDS_TEMPO]),
    blocks: [
      b(
        'warmup',
        'Sit tall and roll',
        60,
        'Sit tall with your feet flat. Roll your shoulders back and turn your head gently from side to side.',
        'Make the rolls smaller and slower.',
      ),
      b(
        'main',
        'Seated bounce and arm swing',
        90,
        'Press through your feet and bounce your heels lightly in time with the music while your arms swing from side to side.',
        'Tap your toes and keep your arms low.',
      ),
      b(
        'main',
        'Hip sway and reach',
        90,
        'Sway your hips from side to side on the chair and reach each arm out in turn.',
        'Sway less and reach only to chest height.',
      ),
      b(
        'cooldown',
        'Slow sway and breathing',
        30,
        'Slow your movement to a gentle sway and breathe in through your nose and out through your mouth.',
        'Sit still and breathe slowly.',
      ),
      b(
        'cooldown',
        'Seated stretch',
        30,
        'Reach your arms overhead, then hug yourself and turn gently to each side.',
        'Keep your arms low and turn only a little.',
      ),
    ],
  }),
  base('draft-chair-dance-10', 'Chair Dance Groove', 'chair_dance', 10, {
    summary: `Ten minutes of seated dance that builds from simple taps to a full routine. ${DRAFT_NOTE}`,
    intensity: 'low',
    tempoBpm: [90, 105],
    seatedSuitable: true,
    safety: SAFETY_SEATED,
    draft: draft(CHAIR, [NEEDS_TEMPO]),
    blocks: [
      b(
        'warmup',
        'Sit tall and breathe',
        60,
        'Sit tall with your feet flat. Breathe in as you lift your arms, and out as you lower them.',
        'Lift your arms only halfway.',
      ),
      b(
        'warmup',
        'Shoulder and ankle rolls',
        60,
        'Roll your shoulders back, then lift one foot and circle your ankle in each direction before switching feet.',
        'Roll your shoulders only, and keep both feet down.',
      ),
      b(
        'main',
        'Toe and heel taps',
        90,
        'Tap your toes, then your heels, in time with the music. Let your arms move naturally.',
        'Tap slowly and keep your arms still.',
      ),
      b(
        'main',
        'Seated step-out',
        90,
        'Slide one foot out to the side and back in, alternating feet, while your shoulders sway the other way.',
        'Slide the foot out only a short way.',
      ),
      b(
        'main',
        'Hip sway and arm reach',
        90,
        'Sway your hips side to side on the chair and reach each arm out in turn, following your hand with your eyes.',
        'Keep the sway small and your arms low.',
      ),
      b(
        'main',
        'Seated routine',
        90,
        'Link the taps, the step-out and the sway: eight taps, eight step-outs, eight sways. Repeat at an easy pace.',
        'Do four of each instead of eight.',
      ),
      b(
        'cooldown',
        'Slow sway and breathing',
        60,
        'Slow to a gentle sway and breathe in through your nose, out through your mouth.',
        'Sit still and breathe slowly.',
      ),
      b(
        'cooldown',
        'Seated stretch',
        60,
        'Reach your arms overhead, hug yourself and turn gently to each side, then stretch each leg out in front of you.',
        'Keep the stretches gentle and stop at the first feeling of stretch.',
      ),
    ],
  }),
  base('draft-chair-dance-15', 'Chair Dance Energy', 'chair_dance', 15, {
    summary: `Fifteen minutes of seated dance with longer patterns and more upper-body movement. ${DRAFT_NOTE}`,
    intensity: 'moderate',
    tempoBpm: [90, 110],
    seatedSuitable: true,
    safety: SAFETY_SEATED,
    draft: draft(CHAIR, [NEEDS_TEMPO]),
    blocks: [
      b(
        'warmup',
        'Sit tall and roll',
        90,
        'Sit tall, roll your shoulders and neck, and breathe slowly.',
        'Make every movement smaller.',
      ),
      b(
        'warmup',
        'Marching and arm swings',
        90,
        'March your feet on the spot while seated and swing your arms gently.',
        'March slowly with your arms low.',
      ),
      b(
        'main',
        'Seated bounce',
        150,
        'Press through your feet and bounce your heels in time with the music, with your arms swinging from side to side.',
        'Tap your toes instead of bouncing.',
      ),
      b(
        'main',
        'Step-out and arm sweep',
        150,
        'Slide one foot out to the side and sweep the opposite arm across your body. Alternate sides.',
        'Slide the foot out only a short way and keep your arms low.',
      ),
      b(
        'main',
        'Twist and reach',
        150,
        'Turn your upper body to one side and reach, then turn to the other. Keep your hips facing forward.',
        'Turn less and reach only to chest height.',
      ),
      b(
        'main',
        'Full seated routine',
        150,
        'Link the bounce, the step-out and the twist into one longer pattern and repeat it, keeping your breathing easy.',
        'Do half the repeats at a slower pace.',
      ),
      b(
        'cooldown',
        'Slow sway and breathing',
        60,
        'Slow to a gentle sway and breathe slowly until your breathing settles.',
        'Sit still and breathe slowly.',
      ),
      b(
        'cooldown',
        'Seated stretch',
        60,
        'Reach overhead, hug yourself and turn to each side, then stretch each leg out in front of you.',
        'Keep the stretches gentle.',
      ),
    ],
  }),

  base('draft-low-impact-groove-10', 'Low-Impact Dance Groove', 'low_impact', 10, {
    summary: `Ten gentle minutes of dance with no jumping, which can also be done seated. ${DRAFT_NOTE}`,
    intensity: 'low',
    tempoBpm: [85, 105],
    seatedSuitable: true,
    safety: SAFETY_SEATED,
    draft: draft(LOW),
    blocks: [
      b(
        'warmup',
        'Roll and breathe',
        60,
        'Stand tall. Roll your shoulders and neck, and breathe slowly.',
        'Make the rolls smaller.',
        'Sit tall and do the same rolls.',
      ),
      b(
        'warmup',
        'Slow march',
        60,
        'March gently in place and swing your arms.',
        'March more slowly and keep your arms low.',
        'March your feet on the floor while seated.',
      ),
      b(
        'main',
        'Step-touch',
        90,
        'Step to the side and bring your other foot in to touch, then go back the other way, with your arms swinging easily.',
        'Take smaller steps and keep your arms low.',
        'Slide one foot out and back, alternating, while seated.',
      ),
      b(
        'main',
        'Hip sway',
        90,
        'Sway your hips from side to side with soft knees and relaxed shoulders.',
        'Keep the sway small and hold a chair.',
        'Sway your hips on the chair.',
      ),
      b(
        'main',
        'Arm reaches',
        90,
        'Reach one arm out and across, then the other, keeping your steps small and easy.',
        'Reach only to chest height.',
        'Reach one arm at a time while seated.',
      ),
      b(
        'main',
        'Easy routine',
        90,
        'Link the step-touch, the sway and the reaches: eight of each, then repeat at an easy pace.',
        'Do four of each.',
        'Do the same pattern seated, with four of each.',
      ),
      b(
        'cooldown',
        'Slow down',
        60,
        'Slow your movement and breathe in through your nose, out through your mouth.',
        'Stand still and breathe slowly.',
        'Sit still and breathe slowly.',
      ),
      b(
        'cooldown',
        'Stretch',
        60,
        'Reach overhead and hold a calf stretch and a shoulder stretch for about fifteen seconds each.',
        'Do the stretches at a wall.',
        'Do the shoulder stretch and reach overhead, seated.',
      ),
    ],
  }),
];

const sNeeds = (extra: string[] = []): DraftInfo => ({
  pack: STRENGTH,
  needs: [
    NEEDS_FITNESS,
    'The strength coach or physiotherapist confirms the sets, repetitions, rest and progression for beginners.',
    ...extra,
  ],
});

const sx = (
  id: string,
  name: string,
  pattern: StrengthExerciseDef['pattern'],
  cues: string[],
  regression: string,
  progression: string | null,
  safety: string[],
): StrengthExerciseDef => ({
  id,
  name,
  pattern,
  equipment: 'none',
  cues,
  regression,
  progression,
  safety,
  contentOrigin: 'original_text',
  review: 'unreviewed',
  reviewer: null,
  draft: sNeeds(),
});

export const DRAFT_STRENGTH_EXERCISES: readonly StrengthExerciseDef[] = [
  sx(
    'draft-sit-to-stand',
    'Chair sit-to-stand',
    'squat',
    [
      'Sit near the front of a sturdy chair with your feet about hip-width apart.',
      'Lean slightly forward and stand up, pressing through your whole foot.',
      'Sit back down slowly and with control.',
    ],
    'Use a higher seat, or push gently on your thighs to help you stand.',
    'Lower yourself more slowly, taking about three seconds to sit.',
    ['Stop if you feel pain in your knees or hips, or feel dizzy.'],
  ),
  sx(
    'draft-wall-push-up',
    'Wall push-up',
    'push',
    [
      'Stand an arm’s length from a wall with your hands on it at chest height, a little wider than your shoulders.',
      'Bend your elbows to bring your chest toward the wall, keeping your body in a straight line.',
      'Press back to the start.',
    ],
    'Stand closer to the wall and bend your elbows less.',
    'Stand further from the wall, or use a sturdy countertop.',
    ['Stop if you feel pain in your shoulders, wrists or elbows.'],
  ),
  sx(
    'draft-glute-bridge',
    'Glute bridge',
    'hinge',
    [
      'Lie on your back with your knees bent and your feet flat on the floor.',
      'Press through your feet and lift your hips until your body is in a line from shoulders to knees.',
      'Lower slowly.',
    ],
    'Lift your hips only a short way, and pause briefly at the top.',
    'Hold the top position for three seconds before lowering.',
    ['Stop if you feel pain in your lower back, and keep your neck relaxed.'],
  ),
  sx(
    'draft-bird-dog',
    'Bird-dog',
    'core',
    [
      'Start on your hands and knees with your back flat.',
      'Slide one leg straight back and reach the opposite arm forward.',
      'Return to the start and switch sides.',
    ],
    'Lift only an arm, or only a leg, at a time.',
    'Hold each lift for three seconds.',
    ['Stop if you feel pain in your wrists, knees or lower back.'],
  ),
  sx(
    'draft-hip-hinge',
    'Standing hip hinge',
    'hinge',
    [
      'Stand with your feet hip-width apart and your hands on your thighs.',
      'Push your hips back with a flat back and slide your hands down toward your knees.',
      'Squeeze your hips forward to stand tall.',
    ],
    'Hinge only a short way, with your hands on a counter or chair back.',
    null,
    ['Stop if you feel pain in your lower back or the back of your knees.'],
  ),
  sx(
    'draft-supported-split-squat',
    'Supported split squat',
    'lunge',
    [
      'Hold a counter or chair back and step one foot back.',
      'Bend both knees to lower a short way, keeping your chest tall.',
      'Press through your front foot to stand and repeat before switching legs.',
    ],
    'Take a shorter step and lower only a little.',
    'Lower a little further, still holding the support.',
    ['Stop if you feel pain in your knees or hips, and always keep a hand on the support.'],
  ),
  sx(
    'draft-dead-bug',
    'Dead bug',
    'core',
    [
      'Lie on your back with your knees bent over your hips and your arms reaching up.',
      'Slowly lower one arm and the opposite leg toward the floor, keeping your lower back gently pressed down.',
      'Return and switch sides, counting one repetition for each side.',
    ],
    'Lower only the arm, or tap one foot to the floor and back.',
    'Lower the arm and leg further.',
    ['Stop if you feel pain in your lower back or neck.'],
  ),
];

const sw = (
  id: string,
  title: string,
  minutes: number,
  blocks: StrengthWorkoutDef['blocks'],
  warmup: StrengthWorkoutDef['warmup'],
  cooldown: StrengthWorkoutDef['cooldown'],
): StrengthWorkoutDef => ({
  id,
  title,
  level: 'beginner',
  minutes,
  equipment: 'none',
  warmup,
  cooldown,
  blocks,
  safety: [
    'Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.',
    'Some effort is normal, but sharp or joint pain is not: stop that exercise and use the easier version or skip it.',
  ],
  contentOrigin: 'original_text',
  review: 'unreviewed',
  reviewer: null,
  draft: sNeeds(),
});

export const DRAFT_STRENGTH_WORKOUTS: readonly StrengthWorkoutDef[] = [
  sw(
    'draft-strength-beginner-full-body',
    'Beginner Strength: Full Body',
    14,
    [
      { exerciseId: 'draft-sit-to-stand', sets: 2, reps: 8, seconds: null, restSeconds: 45 },
      { exerciseId: 'draft-wall-push-up', sets: 2, reps: 8, seconds: null, restSeconds: 45 },
      { exerciseId: 'draft-glute-bridge', sets: 2, reps: 10, seconds: null, restSeconds: 45 },
      { exerciseId: 'draft-bird-dog', sets: 2, reps: 6, seconds: null, restSeconds: 45 },
    ],
    {
      title: 'Warm-up',
      seconds: 120,
      cue: 'March gently in place, roll your shoulders and circle your hips. Build up slowly.',
    },
    {
      title: 'Cool-down',
      seconds: 120,
      cue: 'Slow your breathing. Hold a calf, hip and chest stretch for about twenty seconds each.',
    },
  ),
  sw(
    'draft-strength-beginner-lower-core',
    'Beginner Strength: Legs and Core',
    12,
    [
      { exerciseId: 'draft-sit-to-stand', sets: 2, reps: 8, seconds: null, restSeconds: 45 },
      { exerciseId: 'draft-hip-hinge', sets: 2, reps: 8, seconds: null, restSeconds: 45 },
      {
        exerciseId: 'draft-supported-split-squat',
        sets: 2,
        reps: 6,
        seconds: null,
        restSeconds: 45,
      },
      { exerciseId: 'draft-dead-bug', sets: 2, reps: 6, seconds: null, restSeconds: 45 },
    ],
    {
      title: 'Warm-up',
      seconds: 120,
      cue: 'March gently in place, roll your shoulders and circle your hips. Build up slowly.',
    },
    {
      title: 'Cool-down',
      seconds: 120,
      cue: 'Slow your breathing. Hold a calf, hip and chest stretch for about twenty seconds each.',
    },
  ),
];
