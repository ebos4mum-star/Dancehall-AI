import { useSyncExternalStore } from 'react';
import type { PulseState } from './machine';

/** A short Pulse reaction to something the person really did (a meal saved, a goal set). One at a time; a newer one replaces an older one. */
export interface Moment {
  id: number;
  message: string;
  state: PulseState;
}
export const MOMENT_MS = 2600;

let current: Moment | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showMoment(message: string, state: PulseState = 'celebrate'): number {
  seq += 1;
  current = { id: seq, message, state };
  emit();
  return seq;
}
/** Clears the moment, but only if it is still the one the caller started (a late timer must not close a newer moment). */
export function dismissMoment(id?: number): void {
  if (id !== undefined && current?.id !== id) return;
  if (current === null) return;
  current = null;
  emit();
}
export const getMoment = (): Moment | null => current;
export function useMoment(): Moment | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getMoment,
    getMoment,
  );
}
export function resetMomentsForTest(): void {
  current = null;
  seq = 0;
  listeners.clear();
}
