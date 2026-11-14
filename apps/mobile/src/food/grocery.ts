export interface GroceryInput {
  foodId: string | null;
  name: string;
  grams: number;
}
export interface GroceryLine {
  key: string;
  name: string;
  /** Total planned grams, rounded up to the nearest 10 g so the list is easy to read. */
  grams: number;
  /** How many planned meals use it. */
  meals: number;
}

/** Combines a meal plan's items into one shopping list: same food across days and meals becomes one line. Pure. */
export function buildGroceryList(items: GroceryInput[]): GroceryLine[] {
  const by = new Map<string, GroceryLine>();
  for (const i of items) {
    if (!(i.grams > 0)) continue;
    const key = i.foodId ?? `name:${i.name.trim().toLowerCase()}`;
    const cur = by.get(key) ?? { key, name: i.name.trim(), grams: 0, meals: 0 };
    cur.grams += i.grams;
    cur.meals += 1;
    by.set(key, cur);
  }
  return [...by.values()]
    .map((l) => ({ ...l, grams: Math.ceil(l.grams / 10) * 10 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Plain text for sharing or pasting into any notes app. Only what the person chose to share. */
export function groceryText(title: string, lines: GroceryLine[], people = 1): string {
  const head = people > 1 ? `${title} (${people} people)` : title;
  return [head, ...lines.map((l) => `- ${l.name}: ${l.grams} g`)].join('\n');
}

export const HOUSEHOLD_MIN = 1;
export const HOUSEHOLD_MAX = 6;

/** Clamps a stored or typed value to a whole number of people between 1 and 6. */
export function clampHouseholdSize(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return HOUSEHOLD_MIN;
  return Math.min(HOUSEHOLD_MAX, Math.max(HOUSEHOLD_MIN, Math.round(v)));
}

/** The same planned portions for more than one person: quantities are multiplied, then rounded up to 10 g. Nutrition is never scaled. */
export function scaleGroceryList(lines: GroceryLine[], people: number): GroceryLine[] {
  const n = clampHouseholdSize(people);
  return lines.map((l) => ({ ...l, grams: Math.ceil((l.grams * n) / 10) * 10 }));
}
