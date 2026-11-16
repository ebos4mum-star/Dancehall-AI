import { haptics } from './haptics';

/**
 * The haptic vocabulary of the app, one pattern per meaning, so the same thing always feels the same:
 *  select    a light tick for choosing, scrubbing a chart, expanding a card, toggling a switch
 *  success   one soft confirmation for a saved record or a finished quest
 *  milestone the two-beat pattern for a level, a streak milestone, a badge, a group goal
 *  reveal    a medium tap as something new appears (an unlocked accessory)
 *  error     a warning pattern for something that needs attention
 * Whether any of them play is decided by `feedbackAllowed` from the person's "Pulse celebrations" setting: Off plays none, Gentle plays only select, success and error,
 * Full plays all. Phones without a haptic engine ignore every call.
 */
export type FeedbackKind = 'select' | 'success' | 'milestone' | 'reveal' | 'error';

export function feedbackAllowed(level: 'off' | 'gentle' | 'full', kind: FeedbackKind): boolean {
  if (level === 'off') return false;
  if (level === 'gentle') return kind === 'select' || kind === 'success' || kind === 'error';
  return true;
}

export function play(level: 'off' | 'gentle' | 'full', kind: FeedbackKind): void {
  if (!feedbackAllowed(level, kind)) return;
  switch (kind) {
    case 'select':
      return haptics.tap();
    case 'success':
      return haptics.success();
    case 'milestone':
      return haptics.celebrate();
    case 'reveal':
      return haptics.capture();
    case 'error':
      return haptics.warning();
  }
}
