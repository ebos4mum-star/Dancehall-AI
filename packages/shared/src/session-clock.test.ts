import { describe, expect, it } from 'vitest';
import {
  MAX_CATCH_UP_S,
  METER_IDLE,
  completionSummary,
  initRunner,
  isTicking,
  meterPoll,
  meterStart,
  meterStop,
  runnerReduce,
  type RunnerEvent,
  type RunnerState,
} from './session-clock';
import {
  movementId,
  resolvePresentation,
  sequenceMatches,
  type InstructionalTrack,
} from './instruction-media';
import type { Licence } from './licensing';
import { WORKOUTS, type WorkoutDef } from './workouts';

const w: WorkoutDef = WORKOUTS[0]!;
const run = (r: RunnerState, ...es: RunnerEvent[]) => es.reduce(runnerReduce, r);
const total = w.blocks.reduce((a, b) => a + b.seconds, 0);

describe('tick meter (elapsed-time model)', () => {
  it('credits whole seconds and carries the remainder', () => {
    let m = meterStart(0);
    let r = meterPoll(m, 1400);
    expect(r.seconds).toBe(1);
    m = r.meter;
    r = meterPoll(m, 2300);
    expect(r.seconds).toBe(0 + 1 - 0); // 400 carry + 900 = 1300ms
    expect(r.meter.carryMs).toBe(300);
  });
  it('catches up after a throttled timer, but never beyond the cap', () => {
    expect(meterPoll(meterStart(0), 3000).seconds).toBe(3);
    expect(meterPoll(meterStart(0), 600_000).seconds).toBe(MAX_CATCH_UP_S);
  });
  it('credits nothing while stopped, and stopping drops the partial second', () => {
    expect(meterPoll(METER_IDLE, 99_999).seconds).toBe(0);
    const m = meterPoll(meterStart(0), 900).meter;
    expect(meterStop()).toEqual(METER_IDLE);
    expect(m.carryMs).toBe(900);
  });
  it('re-anchors if the clock moves backwards', () => {
    const r = meterPoll(meterStart(10_000), 5_000);
    expect(r.seconds).toBe(0);
    expect(r.meter.lastMs).toBe(5_000);
  });
});

describe('runner: preparation, pause, resume', () => {
  it('counts a preparation countdown before the first movement', () => {
    let r = run(initRunner(w, false), { type: 'begin' });
    expect(r.phase).toBe('prep');
    expect(isTicking(r)).toBe(true);
    r = run(r, { type: 'tick' }, { type: 'tick' });
    expect(r.prepS).toBe(1);
    expect(r.session.elapsedS).toBe(0);
    r = run(r, { type: 'tick' });
    expect(r.phase).toBe('active');
    expect(r.session.status).toBe('running');
    expect(r.session.elapsedS).toBe(0);
  });
  it('carries leftover seconds from a late tick into the session', () => {
    const r = run(initRunner(w, false), { type: 'begin' }, { type: 'tick', seconds: 5 });
    expect(r.session.elapsedS).toBe(2);
  });
  it('pausing during preparation stops it; resuming continues', () => {
    let r = run(initRunner(w, false), { type: 'begin' }, { type: 'tick' }, { type: 'pause' });
    expect(isTicking(r)).toBe(false);
    r = run(r, { type: 'tick' }, { type: 'tick' });
    expect(r.prepS).toBe(2);
    r = run(r, { type: 'resume' });
    expect(isTicking(r)).toBe(true);
  });
  it('time spent paused is never counted', () => {
    let r = run(initRunner(w, false), { type: 'begin', prepS: 0 }, { type: 'tick', seconds: 4 });
    expect(r.session.elapsedS).toBe(4);
    r = run(r, { type: 'pause' }, { type: 'tick', seconds: 60 });
    expect(r.session.elapsedS).toBe(4);
    r = run(r, { type: 'resume' }, { type: 'tick' });
    expect(r.session.elapsedS).toBe(5);
  });
  it('ignores ticks before the session has begun', () => {
    const r = run(initRunner(w, false), { type: 'tick', seconds: 10 });
    expect(r.session.elapsedS).toBe(0);
    expect(isTicking(r)).toBe(false);
  });
  it('backgrounding is a pause: away time adds nothing, and return needs an explicit resume', () => {
    let r = run(initRunner(w, false), { type: 'begin', prepS: 0 }, { type: 'tick', seconds: 3 });
    r = run(r, { type: 'pause' }); // what the screen does on AppState change
    expect(isTicking(r)).toBe(false);
    expect(r.session.elapsedS).toBe(3);
  });
});

describe('runner: skipping, finishing, interruption', () => {
  it('skipping moves on and records the skipped time, not exercised time', () => {
    const r = run(initRunner(w, false), { type: 'begin', prepS: 0 }, { type: 'skip' });
    expect(r.session.index).toBe(1);
    expect(r.session.elapsedS).toBe(0);
    expect(r.session.skippedS).toBe(w.blocks[0]!.seconds);
  });
  it('a full session finishes naturally with every movement completed', () => {
    const r = run(
      initRunner(w, false),
      { type: 'begin', prepS: 0 },
      { type: 'tick', seconds: total },
    );
    const c = completionSummary(r);
    expect(r.session.status).toBe('finished');
    expect(c.finishedNaturally).toBe(true);
    expect(c.segmentsCompleted).toBe(c.segmentsTotal);
    expect(c.elapsedS).toBe(total);
    expect(c.recordable).toBe(true);
  });
  it('ending early reports what was actually done and is not a natural finish', () => {
    const r = run(
      initRunner(w, false),
      { type: 'begin', prepS: 0 },
      { type: 'tick', seconds: w.blocks[0]!.seconds + 5 },
      { type: 'finish' },
    );
    const c = completionSummary(r);
    expect(c.finishedNaturally).toBe(false);
    expect(c.segmentsCompleted).toBe(1);
    expect(c.elapsedS).toBe(w.blocks[0]!.seconds + 5);
  });
  it('a workout that was only opened or started is not recordable', () => {
    expect(completionSummary(initRunner(w, false)).recordable).toBe(false);
    const ended = run(initRunner(w, false), { type: 'begin', prepS: 0 }, { type: 'finish' });
    expect(completionSummary(ended).recordable).toBe(false);
  });
  it('finishing twice does not change the result', () => {
    const once = run(
      initRunner(w, false),
      { type: 'begin', prepS: 0 },
      { type: 'tick', seconds: 9 },
      { type: 'finish' },
    );
    expect(runnerReduce(once, { type: 'finish' })).toEqual(once);
  });
  it('a restored session returns paused, past preparation, with no added time', () => {
    const base = run(
      initRunner(w, false),
      { type: 'begin', prepS: 0 },
      { type: 'tick', seconds: 12 },
      { type: 'pause' },
    );
    const r = runnerReduce(initRunner(w, false), { type: 'restore', session: base.session });
    expect(r.phase).toBe('active');
    expect(isTicking(r)).toBe(false);
    expect(r.session.elapsedS).toBe(12);
  });
  it('low impact can be switched mid-session without moving the clock', () => {
    const r = run(initRunner(w, false), { type: 'begin', prepS: 0 }, { type: 'tick', seconds: 7 });
    const l = runnerReduce(r, { type: 'lowImpact', value: true });
    expect(l.session.elapsedS).toBe(7);
    expect(l.session.index).toBe(r.session.index);
    expect(l.session.segments[0]!.cue).toBe(w.blocks[0]!.lowImpactAlt);
  });
});

const licence = (over: Partial<Licence> = {}): Licence => ({
  id: 'L1',
  assetKind: 'video',
  title: 't',
  status: 'cleared',
  territories: ['*'],
  startsOn: '2026-01-01',
  endsOn: null,
  evidenceRef: 'x',
  ...over,
});
const track = (over: Partial<InstructionalTrack> = {}): InstructionalTrack => ({
  id: 'T1',
  workoutId: w.id,
  presentation: 'real_dancer',
  licenceId: 'L1',
  review: 'approved',
  attribution: { creditLine: 'Test instructor', instructorId: null },
  uri: 'x://t',
  movements: w.blocks.map((b, i) => ({
    movementId: movementId(w.id, i),
    seconds: b.seconds,
    difficulty: 'beginner',
    impact: 'low',
    hasLowImpactVersion: true,
  })),
  ...over,
});
const base = {
  workout: w,
  licences: [licence()],
  country: 'US',
  today: '2026-11-14',
  lowImpact: false,
};

describe('presentation modes reflect real availability', () => {
  it('with no assets, nothing is offered and guided text is shown', () => {
    const r = resolvePresentation({ ...base, tracks: [] });
    expect(r.active).toBe('guided_text');
    expect(r.options.every((o) => !o.available && o.reason === 'no_asset')).toBe(true);
  });
  it('offers a mode only when licensed, approved, matching and loadable', () => {
    expect(resolvePresentation({ ...base, tracks: [track()] }).active).toBe('real_dancer');
    expect(
      resolvePresentation({ ...base, tracks: [track({ review: 'in_review' })] }).options[0]!.reason,
    ).toBe('not_reviewed');
    expect(
      resolvePresentation({ ...base, tracks: [track()], licences: [licence({ status: 'draft' })] })
        .options[0]!.reason,
    ).toBe('not_licensed');
    expect(
      resolvePresentation({
        ...base,
        tracks: [track()],
        licences: [licence({ territories: ['GB'] })],
      }).options[0]!.reason,
    ).toBe('not_licensed');
    expect(
      resolvePresentation({ ...base, tracks: [track()], missing: new Set(['T1']) }).options[0]!
        .reason,
    ).toBe('media_missing');
  });
  it('a track with a different sequence or timing is rejected, never reordered to fit', () => {
    const bad = track({ movements: track().movements.slice().reverse() });
    expect(sequenceMatches(w, bad)).toBe(false);
    const retimed = track();
    retimed.movements[0] = { ...retimed.movements[0]!, seconds: 1 };
    expect(resolvePresentation({ ...base, tracks: [retimed] }).options[0]!.reason).toBe(
      'sequence_mismatch',
    );
  });
  it('low impact requires an authored low-impact version of every movement', () => {
    const t = track();
    t.movements[1] = { ...t.movements[1]!, hasLowImpactVersion: false };
    const r = resolvePresentation({
      ...base,
      tracks: [t],
      lowImpact: true,
      requested: 'real_dancer',
    });
    expect(r.active).toBe('guided_text');
    expect(r.fallback).toBe('no_low_impact_version');
  });
  it('a requested mode that is unavailable falls back honestly and says why', () => {
    const r = resolvePresentation({ ...base, tracks: [track()], requested: 'dancer_3d' });
    expect(r.active).toBe('real_dancer');
    expect(r.fallback).toBe('no_asset');
  });
  it('both modes can be available at once and the request is honoured', () => {
    const tracks = [track(), track({ id: 'T2', presentation: 'dancer_3d', rigId: 'rig-a' })];
    const r = resolvePresentation({ ...base, tracks, requested: 'dancer_3d' });
    expect(r.active).toBe('dancer_3d');
    expect(r.options.every((o) => o.available)).toBe(true);
  });
  it('the shipped catalogue has no tracks, so no demonstration is ever implied', () => {
    for (const x of WORKOUTS)
      expect(resolvePresentation({ ...base, workout: x, tracks: [] }).active).toBe('guided_text');
  });
});
