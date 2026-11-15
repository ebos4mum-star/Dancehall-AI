import {
  initSession,
  initSessionFromSegments,
  sessionReduce,
  type SessionEvent,
  type SessionState,
} from './session-engine';
import type { SessionSegment } from './workouts';
import type { WorkoutDef } from './workouts';

/**
 * Elapsed-time driver. The screen polls this with a wall-clock reading (any interval, throttled or not) and gets back the whole seconds that
 * genuinely passed while running. Rendering and animation never decide how much time passed.
 */
export interface TickMeter {
  lastMs: number | null;
  carryMs: number;
}
export const METER_IDLE: TickMeter = { lastMs: null, carryMs: 0 };
/** Seconds beyond this in a single poll are discarded, not credited: a suspended app must not count as exercise. */
export const MAX_CATCH_UP_S = 5;

export const meterStart = (nowMs: number): TickMeter => ({ lastMs: nowMs, carryMs: 0 });
/** Pausing, backgrounding or leaving drops the partial second; away time is never credited. */
export const meterStop = (): TickMeter => METER_IDLE;
export function meterPoll(m: TickMeter, nowMs: number): { meter: TickMeter; seconds: number } {
  if (m.lastMs === null) return { meter: m, seconds: 0 };
  // A clock that moved backwards (manual change) re-anchors instead of crediting or debiting time.
  if (nowMs < m.lastMs) return { meter: { lastMs: nowMs, carryMs: m.carryMs }, seconds: 0 };
  const total = m.carryMs + (nowMs - m.lastMs);
  const whole = Math.floor(total / 1000);
  return {
    meter: { lastMs: nowMs, carryMs: total - whole * 1000 },
    seconds: Math.min(whole, MAX_CATCH_UP_S),
  };
}

/** Preparation countdown before the first movement, then the existing pure session machine. */
export const PREP_SECONDS = 3;
export interface RunnerState {
  session: SessionState;
  phase: 'ready' | 'prep' | 'active';
  prepS: number;
  prepPaused: boolean;
  /** The person ended the session before the last movement finished. */
  endedEarly: boolean;
  /** Segment boundaries crossed, for cues and haptics. */
  changes: number;
}
export type RunnerEvent =
  | SessionEvent
  | { type: 'begin'; prepS?: number }
  | { type: 'skipPrep' }
  | { type: 'restore'; session: SessionState };

export function initRunner(
  w: Pick<WorkoutDef, 'id' | 'blocks'>,
  lowImpact: boolean,
  seated = false,
): RunnerState {
  return {
    session: initSession(w, lowImpact, seated),
    phase: 'ready',
    prepS: 0,
    prepPaused: false,
    endedEarly: false,
    changes: 0,
  };
}

/** A runner for any list of segments (strength workouts). */
export function initRunnerFromSegments(
  id: string,
  segments: SessionSegment[],
  lowImpact: boolean,
  seated = false,
): RunnerState {
  return {
    session: initSessionFromSegments(id, segments, lowImpact, seated),
    phase: 'ready',
    prepS: 0,
    prepPaused: false,
    endedEarly: false,
    changes: 0,
  };
}

export function runnerReduce(r: RunnerState, e: RunnerEvent): RunnerState {
  switch (e.type) {
    case 'restore':
      // A recovered session always returns paused, already past preparation.
      return { ...r, session: e.session, phase: 'active', prepS: 0, prepPaused: false };
    case 'begin': {
      if (r.phase !== 'ready') return r;
      const prep = e.prepS ?? PREP_SECONDS;
      if (prep <= 0) return runnerReduce({ ...r, phase: 'prep', prepS: 0 }, { type: 'skipPrep' });
      return { ...r, phase: 'prep', prepS: prep, prepPaused: false };
    }
    case 'skipPrep': {
      if (r.phase !== 'prep') return r;
      const s = sessionReduce(r.session, { type: 'start' }).state;
      return { ...r, phase: 'active', prepS: 0, session: s };
    }
    case 'pause':
      if (r.phase === 'prep') return { ...r, prepPaused: true };
      break;
    case 'resume':
      if (r.phase === 'prep') return { ...r, prepPaused: false };
      break;
    case 'tick': {
      if (r.phase === 'prep') {
        if (r.prepPaused) return r;
        const secs = e.seconds ?? 1;
        if (secs < r.prepS) return { ...r, prepS: r.prepS - secs };
        const left = secs - r.prepS;
        const started = runnerReduce({ ...r, prepS: 0 }, { type: 'skipPrep' });
        return left > 0 ? runnerReduce(started, { type: 'tick', seconds: left }) : started;
      }
      break;
    }
    case 'finish': {
      if (r.session.status === 'finished') return r;
      const natural =
        r.session.index >= r.session.segments.length - 1 && r.session.remainingS === 0;
      const res = sessionReduce(r.session, e);
      return {
        ...r,
        phase: 'active',
        session: res.state,
        endedEarly: !natural,
        changes: r.changes + 1,
      };
    }
    default:
      break;
  }
  if (r.phase === 'ready' && e.type !== 'lowImpact' && e.type !== 'seated') return r;
  const res = sessionReduce(r.session, e as SessionEvent);
  return { ...r, session: res.state, changes: r.changes + (res.segmentChanged ? 1 : 0) };
}

/** True while something should be counting down (drives the clock subscription). */
export const isTicking = (r: RunnerState): boolean =>
  (r.phase === 'prep' && !r.prepPaused) || (r.phase === 'active' && r.session.status === 'running');

export interface CompletionSummary {
  elapsedS: number;
  segmentsTotal: number;
  /** Movements fully completed (an early end does not count the one in progress). */
  segmentsCompleted: number;
  skippedS: number;
  /** Reached the end of the last movement. */
  finishedNaturally: boolean;
  /** Something real happened: nothing is recorded for a workout that was only opened. */
  recordable: boolean;
}
export function completionSummary(r: RunnerState): CompletionSummary {
  const s = r.session;
  const total = s.segments.length;
  const natural = s.status === 'finished' && !r.endedEarly;
  return {
    elapsedS: s.elapsedS,
    segmentsTotal: total,
    segmentsCompleted: natural ? total : Math.min(s.index, total),
    skippedS: s.skippedS,
    finishedNaturally: natural,
    recordable: s.status === 'finished' && s.elapsedS >= 1,
  };
}
