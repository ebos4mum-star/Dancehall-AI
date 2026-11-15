import { cueFor, sessionSegments, type SessionSegment, type WorkoutDef } from './workouts';

export interface SessionState {
  workoutId: string;
  segments: SessionSegment[];
  index: number;
  remainingS: number;
  status: 'ready' | 'running' | 'paused' | 'finished';
  /** Seconds actually exercised (time spent paused does not count). */
  elapsedS: number;
  skippedS: number;
  lowImpact: boolean;
  /** Seated version in use (only effective on blocks that have one). */
  seated: boolean;
}
export type SessionEvent =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'tick'; seconds?: number }
  | { type: 'skip' }
  /** The person finished a counted set. Advances without counting anything as skipped. */
  | { type: 'done' }
  | { type: 'back' }
  | { type: 'lowImpact'; value: boolean }
  | { type: 'seated'; value: boolean }
  | { type: 'finish' };

export function initSession(
  w: Pick<WorkoutDef, 'id' | 'blocks'>,
  lowImpact: boolean,
  seated = false,
): SessionState {
  return initSessionFromSegments(w.id, sessionSegments(w, lowImpact, seated), lowImpact, seated);
}

/** The same machine for any list of segments (strength workouts build theirs in strength.ts). */
export function initSessionFromSegments(
  id: string,
  segments: SessionSegment[],
  lowImpact: boolean,
  seated = false,
): SessionState {
  return {
    workoutId: id,
    segments,
    index: 0,
    remainingS: segments[0]?.seconds ?? 0,
    status: 'ready',
    elapsedS: 0,
    skippedS: 0,
    lowImpact,
    seated,
  };
}

/** A pure timer for guided (text) sessions. The UI feeds it one `tick` per second while running. */
export function sessionReduce(
  s: SessionState,
  e: SessionEvent,
): { state: SessionState; segmentChanged: boolean } {
  switch (e.type) {
    case 'start':
      return {
        state: s.status === 'ready' ? { ...s, status: 'running' } : s,
        segmentChanged: false,
      };
    case 'pause':
      return {
        state: s.status === 'running' ? { ...s, status: 'paused' } : s,
        segmentChanged: false,
      };
    case 'resume':
      return {
        state: s.status === 'paused' ? { ...s, status: 'running' } : s,
        segmentChanged: false,
      };
    case 'lowImpact': {
      // Swap the instructions in place; the clock and position are unchanged.
      const segments = s.segments.map((seg) => ({
        ...seg,
        cue: cueFor(seg, e.value, s.seated),
      }));
      return { state: { ...s, lowImpact: e.value, segments }, segmentChanged: false };
    }
    case 'seated': {
      // Same rule: the instructions change in place, the clock and position do not. Seated is always at least as gentle as low impact.
      const segments = s.segments.map((seg) => ({
        ...seg,
        cue: cueFor(seg, s.lowImpact, e.value),
      }));
      return { state: { ...s, seated: e.value, segments }, segmentChanged: false };
    }
    case 'tick': {
      if (s.status !== 'running') return { state: s, segmentChanged: false };
      let secs = e.seconds ?? 1;
      let st = s;
      let changed = false;
      while (secs > 0 && st.status === 'running') {
        // A counted set has no countdown: time still counts as exercise, but only "Done" ends it.
        if (st.segments[st.index]?.manual) {
          st = { ...st, elapsedS: st.elapsedS + secs };
          break;
        }
        const use = Math.min(secs, st.remainingS);
        st = { ...st, remainingS: st.remainingS - use, elapsedS: st.elapsedS + use };
        secs -= use;
        if (st.remainingS === 0) {
          const next = advance(st);
          changed = changed || next.index !== st.index || next.status === 'finished';
          st = next;
        }
      }
      return { state: st, segmentChanged: changed };
    }
    case 'skip': {
      if (s.status === 'finished') return { state: s, segmentChanged: false };
      const manual = s.segments[s.index]?.manual === true;
      const next = advance({
        ...s,
        skippedS: s.skippedS + (manual ? 0 : s.remainingS),
        remainingS: 0,
      });
      return { state: next, segmentChanged: true };
    }
    case 'done': {
      if (s.status !== 'running' && s.status !== 'paused')
        return { state: s, segmentChanged: false };
      if (!s.segments[s.index]?.manual) return { state: s, segmentChanged: false };
      return { state: advance({ ...s, remainingS: 0 }), segmentChanged: true };
    }
    case 'back': {
      if (s.status === 'finished' || s.index === 0)
        return {
          state: { ...s, remainingS: s.segments[s.index]?.seconds ?? 0 },
          segmentChanged: false,
        };
      const i = s.index - 1;
      return {
        state: { ...s, index: i, remainingS: s.segments[i]!.seconds },
        segmentChanged: true,
      };
    }
    case 'finish':
      return { state: { ...s, status: 'finished', remainingS: 0 }, segmentChanged: true };
  }
}

function advance(s: SessionState): SessionState {
  const i = s.index + 1;
  if (i >= s.segments.length) return { ...s, status: 'finished', remainingS: 0 };
  return { ...s, index: i, remainingS: s.segments[i]!.seconds };
}
