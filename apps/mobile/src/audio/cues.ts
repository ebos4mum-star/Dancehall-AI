import type { RunnerState } from '@dancehall/shared';

/** A cue is what the player announces or shows. It is produced from state changes only, never from timers or animation. */
export type Cue =
  | { kind: 'countdown'; n: number }
  | { kind: 'go' }
  | { kind: 'segment'; title: string; seconds: number }
  | { kind: 'finish' };

/** The cues a transition from `a` to `b` should fire. Pure, so cue behaviour is unit-tested without audio. */
export function cuesBetween(a: RunnerState, b: RunnerState): Cue[] {
  const out: Cue[] = [];
  if (b.phase === 'prep' && b.prepS > 0 && b.prepS !== a.prepS)
    out.push({ kind: 'countdown', n: b.prepS });
  if (a.phase === 'prep' && b.phase === 'active') out.push({ kind: 'go' });
  const sa = a.session;
  const sb = b.session;
  if (sb.status === 'finished' && sa.status !== 'finished') {
    out.push({ kind: 'finish' });
    return out;
  }
  if (b.phase === 'active' && sb.status === 'running') {
    if (sb.index !== sa.index) {
      const seg = sb.segments[sb.index];
      if (seg) out.push({ kind: 'segment', title: seg.title, seconds: seg.seconds });
    } else if (sb.remainingS > 0 && sb.remainingS <= 3 && sb.remainingS !== sa.remainingS) {
      out.push({ kind: 'countdown', n: sb.remainingS });
    }
  }
  return out;
}

/** Spoken wording for a cue. Short, plain, no claims. */
export function cueText(c: Cue): string {
  switch (c.kind) {
    case 'countdown':
      return String(c.n);
    case 'go':
      return 'Go';
    case 'segment':
      return c.title;
    case 'finish':
      return 'Well done. That is the end of the session.';
  }
}
