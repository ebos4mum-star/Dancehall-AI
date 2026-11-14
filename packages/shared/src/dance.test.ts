import { describe, expect, it } from 'vitest';
import {
  DANCE_STYLES,
  INSTRUCTORS,
  INTENSITIES,
  LEVELS,
  PROGRAMS,
  QUICK_FIT_MINUTES,
  WORKOUTS,
  WORKOUT_BY_ID,
  WORKOUT_DATA_NOTICE,
  activitySummary,
  addDaysIso,
  filterWorkouts,
  initSession,
  isQuickFit,
  licenceAllows,
  playbackFor,
  programSessions,
  publishReadiness,
  sessionMinutes,
  sessionReduce,
  sessionSegments,
  structureProblems,
  suggestQuickFit,
  weekStartOf,
  workoutSeconds,
  type Licence,
  type MediaAsset,
  type SessionState,
} from './index';

describe('sample catalog', () => {
  it('is clearly marked as sample text-only content', () => {
    expect(WORKOUT_DATA_NOTICE).toMatch(/SAMPLE text-only/);
    expect(WORKOUT_DATA_NOTICE).toMatch(/no video, music or instructor likeness/i);
    expect(INSTRUCTORS.every((i) => /placeholder/i.test(i.displayName))).toBe(true);
  });
  it('covers every style, level, intensity and Quick Fit length', () => {
    for (const s of DANCE_STYLES)
      expect(
        WORKOUTS.some((w) => w.style === s),
        s,
      ).toBe(true);
    for (const l of LEVELS)
      expect(
        WORKOUTS.some((w) => w.level === l),
        l,
      ).toBe(true);
    for (const i of INTENSITIES)
      expect(
        WORKOUTS.some((w) => w.intensity === i),
        i,
      ).toBe(true);
    for (const m of QUICK_FIT_MINUTES)
      expect(WORKOUTS.filter((w) => w.minutes === m).length, `${m} min`).toBeGreaterThanOrEqual(2);
  });
  it('every workout is structurally safe: warm-up, cool-down, low-impact version, safety notes, matching length', () => {
    for (const w of WORKOUTS) {
      expect(structureProblems(w.blocks), w.id).toEqual([]);
      expect(workoutSeconds(w), w.id).toBe(w.minutes * 60);
      expect(w.safety.length, w.id).toBeGreaterThan(0);
      expect(w.safety.join(' ')).toMatch(/low-impact/i);
      expect(w.contentOrigin).toBe('original_text');
      expect(w.instructorId).toBeNull();
      // nothing in the data names a real artist, song or trademark-style reference
      expect(JSON.stringify(w)).not.toMatch(/youtube|spotify|http|©|feat\./i);
    }
  });
  it('high-impact workouts warn newcomers and offer the low-impact version', () => {
    for (const w of WORKOUTS.filter((x) => x.impact === 'high'))
      expect(w.safety[0]).toMatch(/low-impact version/i);
  });
  it('has unique ids and a valid sample program', () => {
    expect(new Set(WORKOUTS.map((w) => w.id)).size).toBe(WORKOUTS.length);
    for (const p of PROGRAMS) {
      for (const s of p.schedule) expect(WORKOUT_BY_ID.has(s.workoutId)).toBe(true);
      expect(p.schedule.length).toBe(p.weeks * p.sessionsPerWeek);
    }
  });
});

describe('discovery', () => {
  it('filters by style, intensity, duration and difficulty together', () => {
    const r = filterWorkouts({ styles: ['latin'], levels: ['beginner'], minutes: [10] });
    expect(r.map((w) => w.id)).toEqual(['qf10-latin-rhythm']);
    expect(filterWorkouts({ intensities: ['high'] }).every((w) => w.intensity === 'high')).toBe(
      true,
    );
    expect(filterWorkouts({ quickFitOnly: true }).every(isQuickFit)).toBe(true);
    expect(filterWorkouts({ lowImpactOnly: true }).every((w) => w.impact === 'low')).toBe(true);
    expect(filterWorkouts({}).length).toBe(WORKOUTS.length);
    expect(filterWorkouts({ styles: ['hip_hop'], levels: ['beginner'] })).toEqual([]);
  });
  it('sorts shortest first', () => {
    const mins = filterWorkouts({}).map((w) => w.minutes);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
  });
  it('suggests a Quick Fit of the right length and respects low-impact needs', () => {
    for (const m of QUICK_FIT_MINUTES) {
      expect(suggestQuickFit({ minutes: m })?.minutes).toBe(m);
      const low = suggestQuickFit({ minutes: m, lowImpactOnly: true });
      expect(low?.impact).toBe('low');
    }
    expect(suggestQuickFit({ minutes: 10, seed: 0 })).not.toBeNull();
    expect(suggestQuickFit({ minutes: 10, style: 'latin' })?.style).toBe('latin');
    const a = suggestQuickFit({ minutes: 10, seed: 0 })!;
    expect(suggestQuickFit({ minutes: 10, excludeIds: [a.id], seed: 0 })!.id).not.toBe(a.id);
  });
});

describe('guided session engine', () => {
  const w = WORKOUT_BY_ID.get('qf5-lowimpact-reset')!;
  const run = (s: SessionState, ...ev: Parameters<typeof sessionReduce>[1][]) =>
    ev.reduce((st, e) => sessionReduce(st, e).state, s);
  it('does not count down until started and stops while paused', () => {
    let s = initSession(w, false);
    expect(run(s, { type: 'tick' }).elapsedS).toBe(0);
    s = run(s, { type: 'start' }, { type: 'tick', seconds: 10 });
    expect(s.elapsedS).toBe(10);
    s = run(s, { type: 'pause' }, { type: 'tick', seconds: 30 });
    expect(s.elapsedS).toBe(10);
    s = run(s, { type: 'resume' }, { type: 'tick', seconds: 5 });
    expect(s.elapsedS).toBe(15);
  });
  it('moves through every block and finishes at the workout length', () => {
    const r = sessionReduce(run(initSession(w, false), { type: 'start' }), {
      type: 'tick',
      seconds: 100000,
    });
    expect(r.state.status).toBe('finished');
    expect(r.state.elapsedS).toBe(w.minutes * 60);
    expect(r.segmentChanged).toBe(true);
  });
  it('reports a block change at the boundary', () => {
    const first = w.blocks[0]!.seconds;
    let s = run(initSession(w, false), { type: 'start' });
    const r = sessionReduce(s, { type: 'tick', seconds: first });
    expect(r.segmentChanged).toBe(true);
    expect(r.state.index).toBe(1);
    s = r.state;
    expect(sessionReduce(s, { type: 'tick', seconds: 1 }).segmentChanged).toBe(false);
  });
  it('skips and goes back; skipped time is not counted as exercise', () => {
    let s = run(initSession(w, false), { type: 'start' }, { type: 'tick', seconds: 5 });
    s = run(s, { type: 'skip' });
    expect(s.index).toBe(1);
    expect(s.skippedS).toBe(w.blocks[0]!.seconds - 5);
    expect(s.elapsedS).toBe(5);
    s = run(s, { type: 'back' });
    expect(s.index).toBe(0);
    expect(s.remainingS).toBe(w.blocks[0]!.seconds);
  });
  it('switches to the low-impact version at any moment without moving the clock', () => {
    const hi = WORKOUT_BY_ID.get('w30-afrobeats-party')!;
    let s = run(initSession(hi, false), { type: 'start' }, { type: 'tick', seconds: 90 });
    const before = { index: s.index, remainingS: s.remainingS };
    s = run(s, { type: 'lowImpact', value: true });
    expect(s).toMatchObject({ ...before, lowImpact: true });
    expect(s.segments[s.index]!.cue).toBe(hi.blocks[s.index]!.lowImpactAlt);
    s = run(s, { type: 'lowImpact', value: false });
    expect(s.segments[s.index]!.cue).toBe(hi.blocks[s.index]!.cue);
  });
  it('builds segments with the right cue for the mode', () => {
    expect(sessionSegments(w, true)[2]!.cue).toBe(w.blocks[2]!.lowImpactAlt);
    expect(sessionSegments(w, false)[2]!.cue).toBe(w.blocks[2]!.cue);
  });
});

describe('program scheduling', () => {
  it('maps program days to dates from the start date', () => {
    expect(addDaysIso('2026-01-30', 3)).toBe('2026-02-02');
    const s = programSessions(PROGRAMS[0]!, '2026-06-01');
    expect(s).toHaveLength(12);
    expect(s[0]).toMatchObject({ plannedFor: '2026-06-01', week: 1, day: 1 });
    expect(s[11]).toMatchObject({ plannedFor: '2026-06-26', week: 4, day: 5 });
    expect(s.map((x) => x.plannedFor)).toEqual([...s.map((x) => x.plannedFor)].sort());
  });
});

describe('licensing and publication rules', () => {
  const lic = (over: Partial<Licence> = {}): Licence => ({
    id: 'l1',
    assetKind: 'music',
    title: 'Track',
    status: 'cleared',
    territories: ['GH', 'GB'],
    startsOn: '2026-01-01',
    endsOn: '2026-12-31',
    evidenceRef: 'doc-1',
    ...over,
  });
  const asset: MediaAsset = {
    id: 'a1',
    workoutId: 'w',
    kind: 'audio',
    licenceId: 'l1',
    durationS: 300,
  };
  it('allows only cleared, in-date licences that cover the territory', () => {
    expect(licenceAllows(lic(), 'GH', '2026-06-01')).toBe(true);
    expect(licenceAllows(lic(), 'US', '2026-06-01')).toBe(false);
    expect(licenceAllows(lic(), null, '2026-06-01')).toBe(false);
    expect(licenceAllows(lic({ territories: ['*'] }), null, '2026-06-01')).toBe(true);
    expect(licenceAllows(lic(), 'GH', '2027-01-01')).toBe(false);
    expect(licenceAllows(lic(), 'GH', '2025-12-31')).toBe(false);
    expect(licenceAllows(lic({ endsOn: null }), 'GH', '2030-01-01')).toBe(true);
    expect(licenceAllows(lic({ status: 'draft' }), 'GH', '2026-06-01')).toBe(false);
    expect(licenceAllows(lic({ status: 'revoked' }), 'GH', '2026-06-01')).toBe(false);
    expect(licenceAllows(undefined, 'GH', '2026-06-01')).toBe(false);
  });
  it('plays media only when every asset is cleared there, otherwise falls back to the text session', () => {
    expect(playbackFor([], [], 'GH', '2026-06-01')).toEqual({
      mode: 'guided_text',
      reason: 'no_media',
    });
    expect(playbackFor([asset], [lic()], 'GH', '2026-06-01').mode).toBe('media');
    expect(playbackFor([asset], [lic()], 'US', '2026-06-01')).toEqual({
      mode: 'guided_text',
      reason: 'not_cleared',
    });
    const video: MediaAsset = {
      id: 'a2',
      workoutId: 'w',
      kind: 'video',
      licenceId: 'l2',
      durationS: 300,
    };
    expect(
      playbackFor(
        [asset, video],
        [lic(), lic({ id: 'l2', territories: ['US'] })],
        'GH',
        '2026-06-01',
      ).mode,
    ).toBe('guided_text');
  });
  it('requires real content, an independent review, cleared licences, structure and safety notes', () => {
    const w = WORKOUT_BY_ID.get('qf10-latin-rhythm')!;
    const base = {
      createdBy: 'author',
      blocks: w.blocks,
      safety: w.safety,
      media: [],
      licences: [],
      today: '2026-06-01',
    };
    const sample = publishReadiness({ ...base, isSynthetic: true, reviews: [] });
    expect(sample.ok).toBe(false);
    expect(sample.items.find((i) => i.id === 'original')!.passed).toBe(false);
    const ok = publishReadiness({
      ...base,
      isSynthetic: false,
      reviews: [{ type: 'fitness', outcome: 'approved', reviewerId: 'reviewer' }],
    });
    expect(ok.ok).toBe(true);
    expect(
      publishReadiness({
        ...base,
        isSynthetic: false,
        reviews: [{ type: 'fitness', outcome: 'approved', reviewerId: 'author' }],
      }).items.find((i) => i.id === 'review')!.passed,
    ).toBe(false);
    expect(
      publishReadiness({
        ...base,
        isSynthetic: false,
        reviews: [{ type: 'fitness', outcome: 'changes_requested', reviewerId: 'reviewer' }],
      }).ok,
    ).toBe(false);
    const rev = [
      { type: 'fitness' as const, outcome: 'approved' as const, reviewerId: 'reviewer' },
    ];
    expect(
      publishReadiness({
        ...base,
        isSynthetic: false,
        reviews: rev,
        media: [asset],
        licences: [lic({ status: 'draft' })],
      }).items.find((i) => i.id === 'licences')!.passed,
    ).toBe(false);
    expect(
      publishReadiness({
        ...base,
        isSynthetic: false,
        reviews: rev,
        media: [asset],
        licences: [lic()],
      }).ok,
    ).toBe(true);
    expect(publishReadiness({ ...base, isSynthetic: false, reviews: rev, safety: [] }).ok).toBe(
      false,
    );
    expect(
      publishReadiness({
        ...base,
        isSynthetic: false,
        reviews: rev,
        blocks: w.blocks.filter((b) => b.kind !== 'warmup'),
      }).items.find((i) => i.id === 'structure')!.detail,
    ).toMatch(/warm-up/);
  });
});

describe('activity summary', () => {
  const done = (iso: string, minutes = 10, durationS: number | null = null) => ({
    status: 'completed' as const,
    completedAt: iso,
    durationS,
    minutes,
  });
  it('finds the Monday of a week', () => {
    expect(weekStartOf('2026-06-17')).toBe('2026-06-15');
    expect(weekStartOf('2026-06-15')).toBe('2026-06-15');
    expect(weekStartOf('2026-06-21')).toBe('2026-06-15');
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29');
  });
  it('counts actual exercised time, falling back to workout length', () => {
    expect(sessionMinutes({ durationS: 310, minutes: 10 })).toBe(5);
    expect(sessionMinutes({ durationS: null, minutes: 10 })).toBe(10);
    expect(sessionMinutes({ durationS: 5, minutes: 10 })).toBe(1);
  });
  it("totals this week and the last weeks in the person's time zone; ignores planned and skipped", () => {
    const now = new Date('2026-06-17T12:00:00Z');
    const s = [
      done('2026-06-15T09:00:00Z', 10),
      done('2026-06-15T18:00:00Z', 5),
      done('2026-06-16T08:00:00Z', 15),
      done('2026-06-09T08:00:00Z', 20),
      { status: 'planned' as const, completedAt: null, durationS: null, minutes: 30 },
      { status: 'skipped' as const, completedAt: null, durationS: null, minutes: 30 },
    ];
    const r = activitySummary(s, { timeZone: 'UTC', now });
    expect(r.thisWeek).toMatchObject({
      weekStart: '2026-06-15',
      sessions: 3,
      minutes: 30,
      activeDays: 2,
    });
    expect(r.weeks).toHaveLength(4);
    expect(r.weeks[2]).toMatchObject({ weekStart: '2026-06-08', sessions: 1, minutes: 20 });
    expect(r.totalSessions).toBe(4);
    // a late-Sunday-UTC session is Monday in Kolkata, so it lands in the next week there
    const edge = [done('2026-06-14T21:00:00Z', 10)];
    expect(activitySummary(edge, { timeZone: 'UTC', now }).thisWeek.sessions).toBe(0);
    expect(activitySummary(edge, { timeZone: 'Asia/Kolkata', now }).thisWeek.sessions).toBe(1);
  });
});
