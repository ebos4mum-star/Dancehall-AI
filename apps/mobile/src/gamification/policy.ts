import type { CelebrationLevel } from '@dancehall/shared';

/**
 * One decision, used by every optional celebration (toasts, reward banners, Pulse reactions, haptics, entrance animations), so nothing can ignore the person's
 * "Pulse celebrations" choice (Goals, Your focus) or the phone's Reduce Motion setting.
 *  - off:    nothing celebratory at all. Numbers still update quietly on the cards; no toast, no banner, no haptic, no motion.
 *  - gentle: a calm banner and a calm Pulse (the `encourage` pose), no haptics. Motion only if the phone allows it.
 *  - full:   the celebration pose, haptics, and motion (if the phone allows it).
 * Reduce Motion removes motion in every level; text, banners and still poses remain.
 */
export interface CelebrationPolicy {
  level: CelebrationLevel;
  /** A Pulse toast over the screen. */
  toast: boolean;
  /** An inline reward summary on Home, workout completion, Nutrition and Progress. */
  banner: boolean;
  pulseState: 'celebrate' | 'encourage';
  haptics: boolean;
  /** Animated fills, pops and entrances. */
  motion: boolean;
  /** At most this many celebration toasts a day (repetition limit). Banners are not counted: they are quiet. */
  maxToastsPerDay: number;
}

export function celebrationPolicy(
  level: CelebrationLevel,
  reducedMotion: boolean,
): CelebrationPolicy {
  const off = level === 'off';
  return {
    level,
    toast: !off,
    banner: !off,
    pulseState: level === 'full' ? 'celebrate' : 'encourage',
    haptics: level === 'full',
    motion: !off && !reducedMotion,
    maxToastsPerDay: level === 'full' ? 6 : level === 'gentle' ? 3 : 0,
  };
}
