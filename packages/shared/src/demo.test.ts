import { afterEach, describe, expect, it } from 'vitest';
import {
  DEMO_CLIPS,
  DEMO_RATES,
  FIXTURE_DEMO_CLIPS,
  TRAINER_CLIPS,
  HOME_EXERCISES,
  DRAFT_WORKOUTS,
  activeCaption,
  bundledContentProblems,
  clockText,
  demoClipProblems,
  demoFor,
  disableInternalFixtures,
  enableInternalFixtures,
  initPlayback,
  movementId,
  playbackReduce,
  resolveDemo,
  type DemoClip,
  type DemoEvent,
  type Licence,
} from './index';

afterEach(() => disableInternalFixtures());

const licence: Licence = {
  id: 'lic-test',
  status: 'cleared',
  territories: ['*'],
  startsOn: '2026-01-01',
  endsOn: null,
} as never;
const approved: DemoClip = {
  id: 'clip-approved',
  subjectId: 'home-wall-push-up',
  kind: 'video',
  uri: 'https://media.example.test/a.mp4',
  durationS: 20,
  captions: 'Test captions describing the movement.',
  licence,
  review: 'approved',
  reviewer: {
    role: 'exercise_physiologist',
    evidenceRef: 'rev-1',
    reviewedOn: '2026-06-01',
    isAuthor: false,
  },
  attribution: { creditLine: 'Test credit' },
};
const args = { subjectId: 'home-wall-push-up', country: 'AU', today: '2026-06-02' };

describe('demonstration clips: approved, draft and none are kept apart', () => {
  it('none exist today, so none is ever offered or implied', () => {
    expect(DEMO_CLIPS).toEqual([]);
    expect(resolveDemo(args)).toEqual({ state: 'none', reason: 'no_demo' });
    for (const e of HOME_EXERCISES)
      expect(demoFor(e.id, 'AU', '2026-06-02').state, e.id).toBe('none');
    expect(bundledContentProblems()).toEqual([]);
  });

  it('an approved clip needs a cleared licence for the country and date, captions, and a review', () => {
    expect(resolveDemo({ ...args, clips: [approved] }).state).toBe('approved');
    expect(demoClipProblems(approved)).toEqual([]);
    const cases: Array<[Partial<DemoClip>, string]> = [
      [{ licence: undefined }, 'not_licensed'],
      [{ licence: { ...licence, status: 'revoked' } as never }, 'not_licensed'],
      [{ licence: { ...licence, endsOn: '2026-03-01' } as never }, 'not_licensed'],
      [{ licence: { ...licence, territories: ['NZ'] } as never }, 'not_licensed'],
      [{ captions: '' }, 'no_captions'],
      [{ review: 'unreviewed' }, 'not_reviewed'],
      [{ review: 'in_review' }, 'not_reviewed'],
      [{ review: 'changes_requested' }, 'not_reviewed'],
    ];
    for (const [patch, reason] of cases) {
      const r = resolveDemo({ ...args, clips: [{ ...approved, ...patch }] });
      expect(r, JSON.stringify(patch)).toEqual({ state: 'none', reason });
    }
    expect(
      resolveDemo({ ...args, clips: [approved], missing: new Set(['clip-approved']) }),
    ).toEqual({
      state: 'none',
      reason: 'media_missing',
    });
  });

  it('a draft clip is shown only when drafts are allowed, and is then labelled as a draft, never approved', () => {
    const draft = {
      ...approved,
      id: 'clip-draft',
      review: 'unreviewed' as const,
      licence: undefined,
    };
    expect(resolveDemo({ ...args, clips: [draft] })).toEqual({
      state: 'none',
      reason: 'not_reviewed',
    });
    const r = resolveDemo({ ...args, clips: [draft], allowDraft: true });
    expect(r.state).toBe('draft');
    // An approved clip wins over a draft for the same subject.
    expect(resolveDemo({ ...args, clips: [draft, approved], allowDraft: true }).state).toBe(
      'approved',
    );
    // A draft without captions is never offered, even in a development build.
    expect(resolveDemo({ ...args, clips: [{ ...draft, captions: '' }], allowDraft: true })).toEqual(
      { state: 'none', reason: 'no_captions' },
    );
  });

  it('a fixture can never resolve as approved, even if it claims to be', () => {
    const fake = { ...approved, fixture: true as const };
    expect(resolveDemo({ ...args, clips: [fake], allowDraft: false })).toEqual({
      state: 'none',
      reason: 'not_licensed',
    });
    expect(demoClipProblems(fake).join(' ')).toMatch(/internal fixture clip is in the bundle/);
  });

  it('the bundle gate rejects any clip that is not approved, licensed and independently reviewed', () => {
    expect(bundledContentProblems({ demoClips: [approved] })).toEqual([]);
    const bad: Array<Partial<DemoClip>> = [
      { review: 'unreviewed' },
      { licence: undefined },
      { reviewer: undefined },
      { reviewer: { ...approved.reviewer!, isAuthor: true } },
      { reviewer: { ...approved.reviewer!, role: 'physiotherapist', evidenceRef: '' } },
      { attribution: { creditLine: ' ' } },
      { captions: 'short' },
      { durationS: 0 },
    ];
    for (const patch of bad)
      expect(
        bundledContentProblems({ demoClips: [{ ...approved, ...patch }] }).length,
        JSON.stringify(patch),
      ).toBeGreaterThan(0);
  });

  it('dance blocks use the same subject ids as the movement ids, and the draft packs have blocks to point at', () => {
    const w = DRAFT_WORKOUTS[0]!;
    expect(movementId(w.id, 2)).toBe(`${w.id}:2`);
    expect(w.blocks[2]).toBeTruthy();
  });

  it('fixture clips appear only with the preview switch, are all drafts, and leave nothing behind', () => {
    expect(DEMO_CLIPS).toEqual([]);
    enableInternalFixtures();
    expect(DEMO_CLIPS.length).toBe(FIXTURE_DEMO_CLIPS.length + TRAINER_CLIPS.length);
    for (const c of [...FIXTURE_DEMO_CLIPS, ...TRAINER_CLIPS]) {
      expect(c.fixture).toBe(true);
      expect(c.review).toBe('unreviewed');
      expect(c.licence).toBeUndefined();
      expect(c.attribution.creditLine).toMatch(/placeholder|Internal fixture/i);
      expect(c.captions.length).toBeGreaterThan(10);
    }
    expect(demoFor('home-wall-push-up', null, '2026-06-02').state).toBe('draft');
    expect(demoFor('draft-dancehall-foundations-10:2', null, '2026-06-02').state).toBe('draft');
    expect(demoFor('home-sit-to-stand-none', null, '2026-06-02').state).toBe('none');
    disableInternalFixtures();
    expect(DEMO_CLIPS).toEqual([]);
    expect(demoFor('home-wall-push-up', null, '2026-06-02').state).toBe('none');
  });
});

describe('demonstration playback', () => {
  const run = (events: DemoEvent[], opts?: Parameters<typeof initPlayback>[1], dur = 20) =>
    events.reduce(playbackReduce, initPlayback(dur, opts));

  it('never starts by itself, and starts at normal speed with captions on', () => {
    const s = initPlayback(20);
    expect(s).toMatchObject({ status: 'paused', positionS: 0, rate: 1, captionsOn: true });
    expect(playbackReduce(s, { type: 'tick', seconds: 5 }).positionS).toBe(0);
  });

  it('plays, pauses and keeps its place', () => {
    const s = run([
      { type: 'play' },
      { type: 'tick', seconds: 4 },
      { type: 'pause' },
      { type: 'tick', seconds: 4 },
    ]);
    expect(s).toMatchObject({ status: 'paused', positionS: 4 });
    expect(playbackReduce(s, { type: 'toggle' }).status).toBe('playing');
  });

  it('plays at half, three-quarter and normal speed', () => {
    expect(DEMO_RATES).toEqual([0.5, 0.75, 1]);
    for (const [rate, pos] of [
      [0.5, 2],
      [0.75, 3],
      [1, 4],
    ] as const)
      expect(
        run([{ type: 'rate', rate }, { type: 'play' }, { type: 'tick', seconds: 4 }]).positionS,
      ).toBeCloseTo(pos);
    expect(run([{ type: 'rate', rate: 3 as never }]).rate).toBe(1);
  });

  it('ends at the end, and replay or play after the end starts again from the start', () => {
    const ended = run([{ type: 'play' }, { type: 'tick', seconds: 25 }]);
    expect(ended).toMatchObject({ status: 'ended', positionS: 20 });
    expect(playbackReduce(ended, { type: 'tick', seconds: 5 }).positionS).toBe(20);
    expect(playbackReduce(ended, { type: 'replay' })).toMatchObject({
      status: 'playing',
      positionS: 0,
    });
    expect(playbackReduce(ended, { type: 'play' })).toMatchObject({
      status: 'playing',
      positionS: 0,
    });
    expect(
      playbackReduce(playbackReduce(ended, { type: 'replay' }), { type: 'pause' }).status,
    ).toBe('paused');
  });

  it('seeks within the clip, and seeking back from the end makes it playable again', () => {
    expect(run([{ type: 'seek', positionS: 99 }]).positionS).toBe(20);
    expect(run([{ type: 'seek', positionS: -5 }]).positionS).toBe(0);
    const ended = run([{ type: 'play' }, { type: 'tick', seconds: 30 }]);
    expect(playbackReduce(ended, { type: 'seek', positionS: 5 })).toMatchObject({
      status: 'paused',
      positionS: 5,
    });
  });

  it('follows the renderer’s own clock when it reports one', () => {
    expect(run([{ type: 'play' }, { type: 'sync', positionS: 7.5 }]).positionS).toBe(7.5);
    expect(run([{ type: 'sync', positionS: 99 }]).positionS).toBe(20);
  });

  it('an error stops playback for good; only captions can still change', () => {
    const e = run([{ type: 'play' }, { type: 'error' }]);
    expect(e.status).toBe('error');
    expect(playbackReduce(e, { type: 'play' }).status).toBe('error');
    expect(playbackReduce(e, { type: 'captions', on: false }).captionsOn).toBe(false);
  });

  it('reduced motion is carried in the state and never starts or loops playback', () => {
    const s = initPlayback(10, { reducedMotion: true });
    expect(s.reducedMotion).toBe(true);
    expect(s.status).toBe('paused');
    const ended = [{ type: 'play' }, { type: 'tick', seconds: 30 }].reduce(
      playbackReduce as never,
      s,
    ) as ReturnType<typeof initPlayback>;
    expect(ended.status).toBe('ended'); // does not loop
  });

  it('follows the system reduced-motion setting as it changes, even after an error', () => {
    const s = run([{ type: 'motion', reduced: true }]);
    expect(s.reducedMotion).toBe(true);
    expect(run([{ type: 'error' }, { type: 'motion', reduced: true }]).reducedMotion).toBe(true);
    expect(playbackReduce(s, { type: 'motion', reduced: false }).reducedMotion).toBe(false);
  });

  it('shows the current timed caption, the whole transcript without cues, and nothing when captions are off', () => {
    const clip = {
      captions: 'Whole transcript here.',
      captionCues: [
        { startS: 0, endS: 5, text: 'First.' },
        { startS: 5, endS: 10, text: 'Second.' },
      ],
    };
    expect(activeCaption(clip, 1, true)).toBe('First.');
    expect(activeCaption(clip, 5, true)).toBe('Second.');
    expect(activeCaption(clip, 12, true)).toBe('');
    expect(activeCaption({ captions: 'Whole transcript here.' }, 3, true)).toBe(
      'Whole transcript here.',
    );
    expect(activeCaption(clip, 1, false)).toBeNull();
    expect(clockText(7)).toBe('0:07');
    expect(clockText(75)).toBe('1:15');
  });
});
