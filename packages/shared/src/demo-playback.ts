import type { CaptionCue } from './demo-media';

/**
 * The state of a demonstration player, as a pure reducer, so every surface (the placeholder, a real video, an audio track) behaves identically and the rules are
 * tested without a screen. Playback never starts by itself. With reduced motion on, nothing loops and nothing animates by itself either: the person presses Play.
 */
export const DEMO_RATES = [0.5, 0.75, 1] as const;
export type DemoRate = (typeof DEMO_RATES)[number];

export interface DemoPlayback {
  status: 'paused' | 'playing' | 'ended' | 'error';
  positionS: number;
  durationS: number;
  rate: DemoRate;
  captionsOn: boolean;
  reducedMotion: boolean;
}
export type DemoEvent =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'tick'; seconds: number }
  | { type: 'seek'; positionS: number }
  | { type: 'replay' }
  | { type: 'rate'; rate: DemoRate }
  | { type: 'captions'; on: boolean }
  | { type: 'motion'; reduced: boolean }
  | { type: 'ended' }
  | { type: 'error' }
  /** The renderer reports where it actually is (a real video's clock is the truth). */
  | { type: 'sync'; positionS: number };

export const initPlayback = (
  durationS: number,
  opts: { reducedMotion?: boolean; captionsOn?: boolean } = {},
): DemoPlayback => ({
  status: 'paused',
  positionS: 0,
  durationS: Math.max(0, durationS),
  rate: 1,
  captionsOn: opts.captionsOn ?? true,
  reducedMotion: opts.reducedMotion === true,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function playbackReduce(s: DemoPlayback, e: DemoEvent): DemoPlayback {
  if (s.status === 'error') {
    if (e.type === 'captions') return { ...s, captionsOn: e.on };
    if (e.type === 'motion') return { ...s, reducedMotion: e.reduced };
    return s;
  }
  switch (e.type) {
    case 'play':
      return s.status === 'ended'
        ? { ...s, positionS: 0, status: 'playing' }
        : { ...s, status: 'playing' };
    case 'pause':
      return s.status === 'playing' ? { ...s, status: 'paused' } : s;
    case 'toggle':
      return playbackReduce(s, { type: s.status === 'playing' ? 'pause' : 'play' });
    case 'tick': {
      if (s.status !== 'playing') return s;
      const pos = s.positionS + Math.max(0, e.seconds) * s.rate;
      return pos >= s.durationS
        ? { ...s, positionS: s.durationS, status: 'ended' }
        : { ...s, positionS: pos };
    }
    case 'seek': {
      const pos = clamp(e.positionS, 0, s.durationS);
      return {
        ...s,
        positionS: pos,
        status: s.status === 'ended' && pos < s.durationS ? 'paused' : s.status,
      };
    }
    case 'sync': {
      if (s.status === 'ended') return s;
      return { ...s, positionS: clamp(e.positionS, 0, s.durationS) };
    }
    case 'replay':
      return { ...s, positionS: 0, status: 'playing' };
    case 'rate':
      return DEMO_RATES.includes(e.rate) ? { ...s, rate: e.rate } : s;
    case 'captions':
      return { ...s, captionsOn: e.on };
    case 'motion':
      return { ...s, reducedMotion: e.reduced };
    case 'ended':
      return { ...s, positionS: s.durationS, status: 'ended' };
    case 'error':
      return { ...s, status: 'error' };
  }
}

/** The caption to show now: nothing when captions are off, the current cue for timed captions, or the whole transcript when there are no cues. */
export function activeCaption(
  clip: { captions: string; captionCues?: readonly CaptionCue[] },
  positionS: number,
  captionsOn: boolean,
): string | null {
  if (!captionsOn) return null;
  if (!clip.captionCues || clip.captionCues.length === 0) return clip.captions;
  return clip.captionCues.find((c) => positionS >= c.startS && positionS < c.endS)?.text ?? '';
}

/** "0:07 of 0:20", for the progress label. */
export const clockText = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
