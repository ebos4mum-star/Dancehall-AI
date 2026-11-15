import { DEMO_CLIPS, type DemoClip } from './demo-media';
import type { FoodRef } from './food-data';
import { HOME_EXERCISES } from './home-exercises';
import { DRAFT_STRENGTH_EXERCISES, DRAFT_STRENGTH_WORKOUTS, DRAFT_WORKOUTS } from './draft-packs';
import { STAGED_FOODS } from './food-staged';
import { isProtectedStyle, type WorkoutDef } from './workouts';
import type { StrengthExerciseDef, StrengthWorkoutDef } from './strength';

/**
 * The review workflow, as data. Every workout, strength session, exercise and staged food that is still a draft says exactly what is outstanding before it can be
 * published, who has to do it, and what record they leave. Nothing here marks anything as reviewed: a draft has no provenance, so every requirement is outstanding.
 * An item is only ever `done` when it carries the real record the bundled-content gate checks (provenance for a workout, a review record for strength, a dietitian
 * record for a food). The generated review queue (docs/review/REVIEW_QUEUE.md) is built from this and a test keeps it in step with the content.
 */
export const REQUIREMENT_IDS = [
  'exercise_safety',
  'choreography',
  'cultural',
  'media_rights',
  'dietitian',
] as const;
export type RequirementId = (typeof REQUIREMENT_IDS)[number];
export type RequirementStatus = 'outstanding' | 'done' | 'not_applicable';

export interface Requirement {
  id: RequirementId;
  label: string;
  status: RequirementStatus;
  /** Who has to do it. */
  by: string;
  /** What they confirm and the record they leave. */
  detail: string;
}
export type ReviewKind = 'workout' | 'strength_workout' | 'exercise' | 'food';
export interface ReviewItem {
  kind: ReviewKind;
  id: string;
  title: string;
  pack: string;
  requirements: Requirement[];
  /** Outstanding applicable requirements. */
  outstanding: number;
}

const FITNESS_BY =
  'An exercise physiologist, certified strength coach or physiotherapist who is not the author';
const req = (
  id: RequirementId,
  label: string,
  status: RequirementStatus,
  by: string,
  detail: string,
): Requirement => ({ id, label, status, by, detail });
const na = (id: RequirementId, label: string, why: string): Requirement =>
  req(id, label, 'not_applicable', '-', why);

const LABEL: Record<RequirementId, string> = {
  exercise_safety: 'Exercise safety review',
  choreography: 'Choreography authenticity and rights',
  cultural: 'Cultural review',
  media_rights: 'Media rights',
  dietitian: 'Dietitian review',
};
const finish = (
  kind: ReviewKind,
  id: string,
  title: string,
  pack: string,
  requirements: Requirement[],
): ReviewItem => ({
  kind,
  id,
  title,
  pack,
  requirements,
  outstanding: requirements.filter((r) => r.status === 'outstanding').length,
});

const clipsFor = (subject: string, clips: readonly DemoClip[]) =>
  clips.filter((c) => c.subjectId === subject);

export function workoutReview(w: WorkoutDef): ReviewItem {
  const p = w.provenance;
  const reviewed = !!p && p.review.status === 'approved';
  const out: Requirement[] = [];
  out.push(
    req(
      'exercise_safety',
      LABEL.exercise_safety,
      reviewed ? 'done' : 'outstanding',
      FITNESS_BY,
      'Confirm the movements, timing, intensity, impact, easier and seated versions and safety notes suit the stated level. Record the reviewer’s role, evidence reference and date; the reviewer must not be the author.',
    ),
  );
  out.push(
    req(
      'choreography',
      LABEL.choreography,
      p && p.credits.length > 0 && p.rightsRef ? 'done' : 'outstanding',
      isProtectedStyle(w.style)
        ? 'The credited choreographer, with practitioners of the style'
        : 'The credited choreographer',
      'Confirm the choreography is original or licensed, correctly credited, covered by a signed rights agreement, and an honest representation of the style. Record the credits and the rights reference.',
    ),
  );
  out.push(
    w.style === 'dancehall' || w.style === 'reggae'
      ? req(
          'cultural',
          LABEL.cultural,
          p?.culturalReviewRef ? 'done' : 'outstanding',
          'Qualified practitioners from the culture of the style',
          'Confirm the movement, vocabulary, framing and music do not misrepresent or appropriate the culture. Record the cultural review reference.',
        )
      : na('cultural', LABEL.cultural, 'Required for Dancehall and reggae only.'),
  );
  out.push(
    req(
      'media_rights',
      LABEL.media_rights,
      p?.rightsRef ? 'done' : 'outstanding',
      'The rights owner and whoever clears licences',
      'A licensed or royalty-free track at the session’s target tempo, with its licence recorded; no music is included. Any draft demonstration clip also needs a cleared licence, captions and approval.',
    ),
  );
  out.push(na('dietitian', LABEL.dietitian, 'Applies to foods only.'));
  return finish('workout', w.id, w.title, w.draft?.pack ?? 'workouts', out);
}

const strengthSafety = (reviewed: boolean, what: string): Requirement =>
  req(
    'exercise_safety',
    LABEL.exercise_safety,
    reviewed ? 'done' : 'outstanding',
    FITNESS_BY,
    `Confirm the ${what}. Record the reviewer’s role, evidence reference and date; the reviewer must not be the author.`,
  );
const mediaFor = (subjects: string[], clips: readonly DemoClip[]): Requirement => {
  const n = subjects.flatMap((s) => clipsFor(s, clips)).length;
  return n > 0
    ? req(
        'media_rights',
        LABEL.media_rights,
        'outstanding',
        'The rights owner and whoever clears licences',
        'A draft demonstration clip exists. It needs a cleared licence, captions and approval before it can be published.',
      )
    : na(
        'media_rights',
        LABEL.media_rights,
        'No demonstration clip exists; the written steps are used.',
      );
};
const notDance = (): Requirement[] => [
  na('choreography', LABEL.choreography, 'Applies to dance sessions only.'),
  na('cultural', LABEL.cultural, 'Applies to Dancehall and reggae only.'),
  na('dietitian', LABEL.dietitian, 'Applies to foods only.'),
];

export function exerciseReview(
  e: StrengthExerciseDef,
  clips: readonly DemoClip[] = DEMO_CLIPS,
): ReviewItem {
  const household = e.household !== undefined;
  return finish('exercise', e.id, e.name, e.draft?.pack ?? 'strength', [
    strengthSafety(
      e.review === 'approved' && !!e.reviewer && !e.reviewer.isAuthor && !e.draft,
      household
        ? 'household-item limits, the repetitions, the easier version and the stop-if note for beginners'
        : 'form cues, the easier version and the stop-if note for the stated level',
    ),
    ...notDance().slice(0, 2),
    mediaFor([e.id], clips),
    notDance()[2]!,
  ]);
}

export function strengthWorkoutReview(
  w: StrengthWorkoutDef,
  clips: readonly DemoClip[] = DEMO_CLIPS,
): ReviewItem {
  return finish('strength_workout', w.id, w.title, w.draft?.pack ?? 'strength', [
    strengthSafety(
      w.review === 'approved' && !!w.reviewer && !w.reviewer.isAuthor && !w.draft,
      'sets, repetitions, rest, warm-up, cool-down and progression for the stated level',
    ),
    ...notDance().slice(0, 2),
    mediaFor(
      w.blocks.map((b) => b.exerciseId),
      clips,
    ),
    notDance()[2]!,
  ]);
}

const PRIORITY = new Set([
  'jamaican',
  'caribbean',
  'west_african',
  'east_african',
  'southern_african',
]);
export function foodReview(f: FoodRef): ReviewItem {
  const done = !!f.provenance;
  return finish('food', f.id, f.name, 'cultural-nutrition', [
    na('exercise_safety', LABEL.exercise_safety, 'Applies to exercises only.'),
    na('choreography', LABEL.choreography, 'Applies to dance sessions only.'),
    f.regionTags.some((t) => PRIORITY.has(t))
      ? req(
          'cultural',
          LABEL.cultural,
          f.provenance?.culturalReviewRef ? 'done' : 'outstanding',
          'A reviewer from the cuisine’s culture',
          'Confirm the region tags and the names people search for (aliases) are accurate and respectful.',
        )
      : na('cultural', LABEL.cultural, 'Only for the priority cuisines.'),
    na('media_rights', LABEL.media_rights, 'No media.'),
    req(
      'dietitian',
      LABEL.dietitian,
      done ? 'done' : 'outstanding',
      'A registered dietitian',
      `Confirm the values from ${f.staged?.sourceFoodId ?? 'the source'} suit the food as eaten, the serving size, and that the source’s licence allows this use. Record the licence confirmation and review reference.`,
    ),
  ]);
}

/** Everything that is still a draft, grouped by pack in a stable order. */
export function reviewQueue(): ReviewItem[] {
  const clips = [...DEMO_CLIPS];
  const items: ReviewItem[] = [
    ...DRAFT_WORKOUTS.map((w) => workoutReview(w)),
    ...DRAFT_STRENGTH_WORKOUTS.map((w) => strengthWorkoutReview(w, clips)),
    ...DRAFT_STRENGTH_EXERCISES.map((e) => exerciseReview(e, clips)),
    ...HOME_EXERCISES.map((e) => exerciseReview(e, clips)),
    ...STAGED_FOODS.map((f) => foodReview(f)),
  ];
  return items;
}

/** A session that combines exercises (for example a "Use what you have" session): its own safety review plus each exercise's. */
export function composedReview(
  title: string,
  id: string,
  pack: string,
  exercises: readonly StrengthExerciseDef[],
  clips: readonly DemoClip[] = DEMO_CLIPS,
): ReviewItem {
  return finish('strength_workout', id, title, pack, [
    strengthSafety(
      exercises.length > 0 && exercises.every((e) => e.review === 'approved' && !e.draft),
      'item limits, sets, repetitions, rest and easier versions for the stated level',
    ),
    ...notDance().slice(0, 2),
    mediaFor(
      exercises.map((e) => e.id),
      clips,
    ),
    notDance()[2]!,
  ]);
}

const PACK_TITLES: Record<string, string> = {
  'dancehall-foundations': 'Dancehall',
  'reggae-flow': 'Reggae',
  'chair-dance': 'Chair dance',
  'low-impact-dance': 'Low-impact dance',
  'beginner-strength': 'Beginner strength',
  'use-what-you-have': 'Use what you have (household exercises)',
  'cultural-nutrition': 'Jamaican, Caribbean and West African foods',
};

/** The review queue as Markdown, for reviewers. Generated: do not edit by hand (a test fails if it is out of step with the content). */
export function renderReviewQueue(items: readonly ReviewItem[] = reviewQueue()): string {
  const packs = [...new Set(items.map((i) => i.pack))];
  const L: string[] = [];
  L.push('# Content review queue');
  L.push('');
  L.push(
    '_Generated from the content by `packages/shared/src/review-requirements.ts`. Do not edit by hand: run `UPDATE_REVIEW_QUEUE=1 pnpm --filter @dancehall/shared test` after changing content._',
  );
  L.push('');
  L.push(
    '**Nothing below has been reviewed.** Every item is an unreviewed draft: it is never bundled, never seeded and visible only in development and review builds, labelled as a draft. No professional, cultural or rights review has taken place, and no music or demonstration media is licensed.',
  );
  L.push('');
  L.push('## How an item gets published');
  L.push('');
  L.push(
    '1. The reviewer does the work in the requirement and leaves the record named in it (credits and rights reference, review role, evidence reference and date, cultural reference; for foods, the licence confirmation and dietitian reference). The reviewer must not be the author.',
  );
  L.push(
    '2. A developer replaces the item’s `draft` (or `staged`) marker with that provenance. The bundled-content gate (`bundledContentProblems`) then judges it as reviewed content, and CI fails if any record is missing or incomplete.',
  );
  L.push(
    '3. Hosted seeding and the style migration are separate approvals; nothing here applies them.',
  );
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push('| Pack | Items | Safety | Choreography | Cultural | Media rights | Dietitian |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  const count = (list: readonly ReviewItem[], id: RequirementId) =>
    list.filter((i) => i.requirements.find((r) => r.id === id)?.status === 'outstanding').length;
  for (const pack of packs) {
    const list = items.filter((i) => i.pack === pack);
    L.push(
      `| ${PACK_TITLES[pack] ?? pack} | ${list.length} | ${count(list, 'exercise_safety')} | ${count(list, 'choreography')} | ${count(list, 'cultural')} | ${count(list, 'media_rights')} | ${count(list, 'dietitian')} |`,
    );
  }
  L.push('');
  L.push('Counts are outstanding requirements.');
  for (const pack of packs) {
    const list = items.filter((i) => i.pack === pack);
    L.push('');
    L.push(`## ${PACK_TITLES[pack] ?? pack}`);
    // The requirement text is the same for every item of a kind, so it is written once per pack and the items list what is outstanding.
    L.push('');
    for (const id of REQUIREMENT_IDS) {
      const r = list
        .map((i) => i.requirements.find((x) => x.id === id))
        .find((x) => x && x.status === 'outstanding');
      if (r) L.push(`- **${r.label}.** By: ${r.by}. ${r.detail}`);
    }
    L.push('');
    L.push('| Item | Id | Outstanding |');
    L.push('| --- | --- | --- |');
    for (const i of list) {
      const open = i.requirements.filter((r) => r.status === 'outstanding').map((r) => r.label);
      L.push(`| ${i.title} | \`${i.id}\` | ${open.join('; ') || 'none'} |`);
    }
  }
  L.push('');
  return L.join('\n');
}
