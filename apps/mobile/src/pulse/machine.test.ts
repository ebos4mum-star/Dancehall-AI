import { describe, expect, it } from 'vitest';
import {
  ONE_SHOT_MS,
  PULSE_DESCRIPTION,
  PULSE_STATES,
  pulseReduce,
  type PulseEvent,
  type PulseState,
} from './machine';

const run = (events: PulseEvent[], from: PulseState = 'idle') => events.reduce(pulseReduce, from);

describe('Pulse state machine', () => {
  it('has the five approved states, each with a text description', () => {
    expect([...PULSE_STATES]).toEqual(['idle', 'welcome', 'dance', 'celebrate', 'encourage']);
    for (const s of PULSE_STATES) expect(PULSE_DESCRIPTION[s]).toMatch(/Pulse/);
  });
  it('one-shots return to idle on settled; dance and idle do not', () => {
    for (const s of ['welcome', 'celebrate', 'encourage'] as const)
      expect(pulseReduce(s, 'settled')).toBe('idle');
    expect(pulseReduce('dance', 'settled')).toBe('dance');
    expect(pulseReduce('idle', 'settled')).toBe('idle');
    for (const ms of Object.values(ONE_SHOT_MS)) expect(ms).toBeLessThanOrEqual(2500);
  });
  it('dance lasts until the workout ends', () => {
    expect(run(['workoutStarted'])).toBe('dance');
    expect(run(['workoutStarted', 'settled'])).toBe('dance');
    expect(run(['workoutStarted', 'workoutEnded'])).toBe('idle');
    expect(pulseReduce('celebrate', 'workoutEnded')).toBe('celebrate');
  });
  it('priority: celebrate beats encourage beats welcome beats dance; lower requests are dropped', () => {
    expect(run(['appOpened', 'milestone'])).toBe('celebrate');
    expect(run(['comeback', 'milestone'])).toBe('celebrate');
    expect(run(['milestone', 'comeback'])).toBe('celebrate');
    expect(run(['milestone', 'appOpened'])).toBe('celebrate');
    expect(run(['appOpened', 'workoutStarted'])).toBe('welcome');
    expect(run(['workoutStarted', 'appOpened'])).toBe('welcome');
    expect(run(['comeback', 'appOpened'])).toBe('encourage');
  });
  it('a dropped request is not replayed after the higher one settles', () => {
    expect(run(['milestone', 'appOpened', 'settled'])).toBe('idle');
  });
});
