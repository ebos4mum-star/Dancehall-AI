/**
 * Household items for "Use what you have". Pure data, no imports, so preferences can name them. The checks and limits are written conservatively and are draft
 * safety text: an exercise professional must review them before they are published (see home-exercises.ts). Nothing here recommends a heavier or more improvised load
 * than an ordinary household item is meant to carry, and "no equipment" is always a valid choice.
 */
export const HOME_ITEM_IDS = [
  'chair',
  'wall',
  'towel',
  'water_bottles',
  'backpack',
  'stairs',
] as const;
export type HomeItemId = (typeof HOME_ITEM_IDS)[number];

export interface HomeItemDef {
  id: HomeItemId;
  label: string;
  /** One line shown beside the choice. */
  hint: string;
  /** Confirm each of these before using the item. */
  checks: string[];
}

export const HOME_ITEMS: Record<HomeItemId, HomeItemDef> = {
  chair: {
    id: 'chair',
    label: 'Sturdy chair',
    hint: 'For sitting, standing up and light support.',
    checks: [
      'The chair is sturdy, has no wheels and does not wobble, tip or creak.',
      'It is on a non-slip floor, or pushed against a wall so it cannot slide.',
      'It is not folding, swivelling, damaged or a stool. You only sit on it or hold it for light support; you never stand on it.',
    ],
  },
  wall: {
    id: 'wall',
    label: 'Wall',
    hint: 'For standing push-ups, wall sits and balance support.',
    checks: [
      'The wall is plain and solid, with nothing hanging on it and clear floor in front.',
      'Your feet will not slip: wear non-slip shoes, or use a rug-free grippy floor.',
    ],
  },
  towel: {
    id: 'towel',
    label: 'Towel',
    hint: 'For gentle pulling and stretching, held in your own hands.',
    checks: [
      'The towel is dry and not frayed or worn thin.',
      'You only hold it in your own hands. Never tie or anchor it to a door, furniture or anything else to pull against.',
    ],
  },
  water_bottles: {
    id: 'water_bottles',
    label: 'Water bottles',
    hint: 'Light hand weights: sealed plastic bottles.',
    checks: [
      'The bottles are plastic with the lid closed tight, never glass.',
      'Start with small bottles. Move up only if the last repetitions feel easy, and never beyond a standard two-litre bottle in each hand.',
      'You can hold them comfortably with a firm grip and good posture. Put them down if your form slips.',
    ],
  },
  backpack: {
    id: 'backpack',
    label: 'Backpack',
    hint: 'A soft, light load held in front of your chest.',
    checks: [
      'Fill it only with soft items such as clothes or towels, never hard, sharp or loose heavy objects.',
      'Zip it fully and keep it light enough to hold comfortably against your chest with both arms.',
      'You hold it in front of you as shown. Do not wear it for balance or jumping exercises.',
    ],
  },
  stairs: {
    id: 'stairs',
    label: 'Stairs',
    hint: 'Only the bottom step, with a handrail.',
    checks: [
      'The stairs have a firm handrail you can hold, a dry, non-slip surface, good light and a clear path.',
      'You only use the bottom step, and you keep a hand on or near the rail.',
      'Stop if you feel dizzy or unsteady. If balance is a concern, use the seated or wall versions instead.',
    ],
  },
};

/** Things never to use, shown with the checks. */
export const UNSAFE_IMPROVISED: readonly string[] = [
  'Tables, stools, sofas, beds, boxes or wheeled or folding chairs to stand on, lean on or push against.',
  'Glass bottles, buckets, paint tins, bricks, tools or heavy bags as weights.',
  'Doors, furniture or railings to anchor a towel or band for pulling.',
  'Any item that is damaged, wobbly or not made to hold your weight.',
];

export const isHomeItem = (v: unknown): v is HomeItemId =>
  typeof v === 'string' && (HOME_ITEM_IDS as readonly string[]).includes(v);
