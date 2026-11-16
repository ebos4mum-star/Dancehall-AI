import { useSyncExternalStore } from 'react';
import type { CosmeticId } from '@dancehall/shared';

/**
 * What Pulse is wearing. Cosmetic only: no cosmetic changes any number, unlocks anything useful or is ever lost on a quiet week. The Today screen (which computes
 * progression) publishes the unlocked list; every PulseFigure reads it, so the companion looks the same everywhere without props being passed through screens.
 */
let worn: readonly CosmeticId[] = [];
const listeners = new Set<() => void>();

export function setPulseCosmetics(next: readonly CosmeticId[]): void {
  const same = next.length === worn.length && next.every((c, i) => c === worn[i]);
  if (same) return;
  worn = [...next];
  listeners.forEach((l) => l());
}
export const getPulseCosmetics = (): readonly CosmeticId[] => worn;
export function usePulseCosmetics(): readonly CosmeticId[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => worn,
    () => worn,
  );
}
export const resetPulseCosmeticsForTest = () => setPulseCosmetics([]);
