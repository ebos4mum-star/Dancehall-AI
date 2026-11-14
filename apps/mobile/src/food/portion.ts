import { FOOD_BY_ID } from '@dancehall/shared';

const FRACTIONS: Record<number, string> = { 0: '', 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** "about 1½ × 1 medium" for a reference food, so grams are understandable. Null when there is no usable serving size. */
export function portionText(foodId: string | null | undefined, grams: number): string | null {
  const ref = foodId ? FOOD_BY_ID.get(foodId) : undefined;
  if (!ref || !(ref.servingG > 0) || !(grams > 0)) return null;
  const quarters = Math.round((grams / ref.servingG) * 4) / 4;
  if (quarters <= 0) return null;
  const whole = Math.floor(quarters);
  const frac = FRACTIONS[quarters - whole] ?? '';
  const count = `${whole > 0 ? whole : ''}${frac}` || '0';
  return `about ${count} × ${ref.servingLabel}`;
}
