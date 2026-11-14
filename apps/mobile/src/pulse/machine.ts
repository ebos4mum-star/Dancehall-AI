/**
 * Pulse state machine (docs/CHARACTER_BRIEF_PULSE.md section 2). Pure and renderer-independent: the renderer decides how a state looks,
 * including reduced-motion stills. One-shot states return to idle on `settled`; dance lasts until the workout ends.
 */
export const PULSE_STATES = ['idle', 'welcome', 'dance', 'celebrate', 'encourage'] as const;
export type PulseState = (typeof PULSE_STATES)[number];
export type PulseEvent =
  'appOpened' | 'workoutStarted' | 'workoutEnded' | 'milestone' | 'comeback' | 'settled';

/** Higher number wins. A lower-priority request while a higher one-shot is playing is dropped, never queued. */
const PRIORITY: Record<PulseState, number> = {
  idle: 0,
  dance: 1,
  welcome: 2,
  encourage: 3,
  celebrate: 4,
};
const ONE_SHOT: ReadonlySet<PulseState> = new Set(['welcome', 'celebrate', 'encourage']);

const go = (cur: PulseState, next: PulseState): PulseState =>
  PRIORITY[next] > PRIORITY[cur] ? next : cur;

export function pulseReduce(cur: PulseState, e: PulseEvent): PulseState {
  switch (e) {
    case 'appOpened':
      return go(cur, 'welcome');
    case 'workoutStarted':
      return go(cur, 'dance');
    case 'workoutEnded':
      return cur === 'dance' ? 'idle' : cur;
    case 'milestone':
      return go(cur, 'celebrate');
    case 'comeback':
      return go(cur, 'encourage');
    case 'settled':
      return ONE_SHOT.has(cur) ? 'idle' : cur;
  }
}

/** Approximate length of each one-shot, so the renderer can send `settled`. */
export const ONE_SHOT_MS: Record<'welcome' | 'celebrate' | 'encourage', number> = {
  welcome: 2400,
  celebrate: 1900,
  encourage: 2000,
};

/** A text equivalent of each state, used as the accessible label. Pulse is never the only carrier of information. */
export const PULSE_DESCRIPTION: Record<PulseState, string> = {
  idle: 'Pulse, your guide, is relaxed and ready.',
  welcome: 'Pulse, your guide, is welcoming you.',
  dance: 'Pulse, your guide, is dancing along.',
  celebrate: 'Pulse, your guide, is celebrating with you.',
  encourage: 'Pulse, your guide, is cheering you on gently.',
};
