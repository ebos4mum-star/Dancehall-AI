import type { PulseState } from '@/pulse/machine';
import type { NextUp } from './nextUp';

/**
 * The one short, supportive line under the greeting. It answers "what now?" from real data, never mentions weight, and never judges a
 * quiet day. `hour` is the person's local hour.
 */
export function heroLine(args: {
  pulse: PulseState;
  next: NextUp;
  hour: number;
  doneAnything: boolean;
}): string {
  if (args.pulse === 'celebrate') return 'That one counts. Nice work.';
  if (args.pulse === 'encourage') return 'Welcome back. A gentle restart is all it takes.';
  if (args.next.kind === 'allDone')
    return 'You have done what you set out to do today. Anything more is a bonus.';
  if (args.next.kind === 'item') return 'Ready when you are. Your next step is just below.';
  if (args.doneAnything) return 'Good going so far today.';
  const part = args.hour < 12 ? 'morning' : args.hour < 18 ? 'afternoon' : 'evening';
  return `A small start is plenty this ${part}.`;
}
