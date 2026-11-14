import { StoreError } from '../data/types';
import type { HouseholdMealType } from '../data/types';

export const HOUSEHOLD_MAX_MEMBERS = 6;
export const HOUSEHOLD_MEAL_TYPES: HouseholdMealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function cleanText(raw: string, max: number): string | null {
  const v = raw.replace(/\s+/g, ' ').trim();
  return v.length >= 1 && v.length <= max ? v : null;
}
export const cleanHouseholdName = (r: string) => cleanText(r, 40);
export const cleanMealTitle = (r: string) => cleanText(r, 80);
export const cleanGroceryName = (r: string) => cleanText(r, 60);
export function cleanQuantity(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = raw.trim();
  if (v === '') return null;
  if (v.length > 20) throw new StoreError('invalid_input', 'quantity');
  return v;
}
export const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
export const normalizeInviteCode = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();
/** Maps a database error message to a stable StoreError code the screens can explain. */
export function householdError(message: string | undefined): StoreError {
  const m = message ?? '';
  for (const c of [
    'already_in_household',
    'invalid_invite',
    'household_full',
    'too_many_attempts',
    'not_owner',
  ] as const)
    if (m.includes(c)) return new StoreError(c, m);
  return new StoreError('unknown', m);
}

/** The same item typed twice (ignoring case, spacing and punctuation) should not appear twice on the shared list. */
export const groceryKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function isDuplicateGrocery(
  existing: ReadonlyArray<{ name: string; checked: boolean }>,
  name: string,
): boolean {
  const k = groceryKey(name);
  return k !== '' && existing.some((e) => !e.checked && groceryKey(e.name) === k);
}
