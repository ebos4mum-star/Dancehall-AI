import type { FoodItemValues } from '@dancehall/shared';
import type { FoodLog } from '@/data/types';

/**
 * The foods this person logged most recently, newest first, one per food and portion, ready to log again in one tap.
 * Simulated or AI estimates are left out: re-logging should only repeat values the person entered or a reference food gave.
 */
export function recentFoods(logs: readonly FoodLog[], limit = 6): FoodItemValues[] {
  const out: FoodItemValues[] = [];
  const seen = new Set<string>();
  const sorted = [...logs].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  for (const l of sorted) {
    for (const i of l.items) {
      if (i.source === 'ai_estimate') continue;
      const key = `${i.foodId ?? `name:${i.name.trim().toLowerCase()}`}|${Math.round(i.grams)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { id: _id, logId: _logId, ...values } = i;
      out.push(values);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
