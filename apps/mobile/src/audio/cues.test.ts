import { describe, expect, it } from 'vitest';
import { WORKOUTS, initRunner, runnerReduce, type RunnerEvent } from '@dancehall/shared';
import { cueText, cuesBetween } from './cues';
import { DEFAULT_AUDIO, clamp01, musicAvailable, parseAudio } from './settings';

const w = WORKOUTS[0]!;
const step = (r: ReturnType<typeof initRunner>, e: RunnerEvent) => {
  const n = runnerReduce(r, e);
  return { n, cues: cuesBetween(r, n) };
};

describe('cues come from state changes', () => {
  it('counts down the preparation, then says go', () => {
    let r = runnerReduce(initRunner(w, false), { type: 'begin' });
    expect(cuesBetween(initRunner(w, false), r)).toEqual([{ kind: 'countdown', n: 3 }]);
    const a = step(r, { type: 'tick' });
    expect(a.cues).toEqual([{ kind: 'countdown', n: 2 }]);
    r = a.n;
    r = step(r, { type: 'tick' }).n;
    expect(step(r, { type: 'tick' }).cues).toEqual([{ kind: 'go' }]);
  });
  it('announces each new movement and counts the last three seconds', () => {
    let r = runnerReduce(initRunner(w, false), { type: 'begin', prepS: 0 });
    const seg0 = w.blocks[0]!.seconds;
    r = runnerReduce(r, { type: 'tick', seconds: seg0 - 3 });
    expect(step(r, { type: 'tick' }).cues).toEqual([{ kind: 'countdown', n: 2 }]);
    r = runnerReduce(r, { type: 'tick', seconds: 3 });
    const before = runnerReduce(initRunner(w, false), { type: 'begin', prepS: 0 });
    const cues = cuesBetween(
      runnerReduce(before, { type: 'tick', seconds: seg0 - 1 }),
      runnerReduce(before, { type: 'tick', seconds: seg0 }),
    );
    expect(cues).toEqual([
      { kind: 'segment', title: w.blocks[1]!.title, seconds: w.blocks[1]!.seconds },
    ]);
  });
  it('says nothing while paused and finishes once', () => {
    const r = runnerReduce(initRunner(w, false), { type: 'begin', prepS: 0 });
    const p = runnerReduce(r, { type: 'pause' });
    expect(cuesBetween(p, runnerReduce(p, { type: 'tick' }))).toEqual([]);
    const fin = step(r, { type: 'finish' });
    expect(fin.cues).toEqual([{ kind: 'finish' }]);
    expect(cuesBetween(fin.n, runnerReduce(fin.n, { type: 'finish' }))).toEqual([]);
    expect(cueText({ kind: 'countdown', n: 2 })).toBe('2');
  });
});

describe('audio settings', () => {
  it('clamps and recovers from bad data', () => {
    expect(clamp01(5, 0.5)).toBe(1);
    expect(clamp01(-1, 0.5)).toBe(0);
    expect(clamp01('x', 0.5)).toBe(0.5);
    expect(parseAudio('not json')).toEqual(DEFAULT_AUDIO);
    expect(parseAudio(JSON.stringify({ voiceVolume: 0.2, voiceMuted: true }))).toMatchObject({
      voiceVolume: 0.2,
      voiceMuted: true,
      musicVolume: DEFAULT_AUDIO.musicVolume,
    });
  });
  it('reports that no licensed music exists yet', () => {
    expect(musicAvailable()).toBe(false);
  });
});
