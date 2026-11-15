/**
 * Cultural cuisine taxonomy. One definition used by preferences, the engine's explanations, meal plans and swaps. The priority cuisines are Jamaican and wider
 * Caribbean, West African, East African and Southern African. A cuisine can have a parent: `jamaican` sits inside `caribbean`, so a food tagged for the wider
 * Caribbean still matches a person who chose Jamaican (it is just a broader match), and Jamaican-tagged foods match a person who chose Caribbean.
 * Food region tags in the reference data use these ids. This file contains no nutrition data.
 */
export const CUISINE_IDS = [
  'jamaican',
  'caribbean',
  'west_african',
  'east_african',
  'southern_african',
  'mediterranean',
  'south_asian',
  'asian',
  'latin_american',
] as const;
export type CuisineId = (typeof CUISINE_IDS)[number];

export interface CuisineDef {
  id: CuisineId;
  label: string;
  group: 'caribbean' | 'african' | 'other';
  parent: CuisineId | null;
  /** 1 = the owner's priority cuisines for reviewed food data. */
  priority: 1 | 2;
}
export const CUISINES: Record<CuisineId, CuisineDef> = {
  jamaican: {
    id: 'jamaican',
    label: 'Jamaican',
    group: 'caribbean',
    parent: 'caribbean',
    priority: 1,
  },
  caribbean: { id: 'caribbean', label: 'Caribbean', group: 'caribbean', parent: null, priority: 1 },
  west_african: {
    id: 'west_african',
    label: 'West African',
    group: 'african',
    parent: null,
    priority: 1,
  },
  east_african: {
    id: 'east_african',
    label: 'East African',
    group: 'african',
    parent: null,
    priority: 1,
  },
  southern_african: {
    id: 'southern_african',
    label: 'Southern African',
    group: 'african',
    parent: null,
    priority: 1,
  },
  mediterranean: {
    id: 'mediterranean',
    label: 'Mediterranean',
    group: 'other',
    parent: null,
    priority: 2,
  },
  south_asian: {
    id: 'south_asian',
    label: 'South Asian',
    group: 'other',
    parent: null,
    priority: 2,
  },
  asian: { id: 'asian', label: 'Asian', group: 'other', parent: null, priority: 2 },
  latin_american: {
    id: 'latin_american',
    label: 'Latin American',
    group: 'other',
    parent: null,
    priority: 2,
  },
};
export const isCuisineId = (v: string): v is CuisineId =>
  (CUISINE_IDS as readonly string[]).includes(v);

/** Region tags that count as a match for this cuisine: itself, its parent, and its children. Order is fixed. */
export function matchTags(id: CuisineId): string[] {
  const out = new Set<string>([id]);
  const parent = CUISINES[id].parent;
  if (parent) out.add(parent);
  for (const c of CUISINE_IDS) if (CUISINES[c].parent === id) out.add(c);
  return [...out];
}
/** The region tags to prefer for a set of chosen cuisines (any unknown ids are ignored). */
export function regionTagsFor(ids: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) if (isCuisineId(id)) for (const t of matchTags(id)) out.add(t);
  return [...out];
}
/** How well a food's region tags fit a cuisine: 2 exact, 1 related (parent or child), 0 none. */
export function cuisineFit(tags: readonly string[], id: CuisineId): 0 | 1 | 2 {
  if (tags.includes(id)) return 2;
  return matchTags(id).some((t) => tags.includes(t)) ? 1 : 0;
}
/** The best fit across chosen cuisines. */
export function bestCuisineFit(tags: readonly string[], ids: readonly string[]): 0 | 1 | 2 {
  let best: 0 | 1 | 2 = 0;
  for (const id of ids)
    if (isCuisineId(id)) best = Math.max(best, cuisineFit(tags, id)) as 0 | 1 | 2;
  return best;
}
