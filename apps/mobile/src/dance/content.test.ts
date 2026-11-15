import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  WORKOUTS,
  buildHomeWorkout,
  encodeHomeId,
  makeRequest,
  disableInternalFixtures,
  enableInternalFixtures,
  initRunnerFromSegments,
  runnerReduce,
  sessionSegments,
} from '@dancehall/shared';
import { resolveContent, strengthSessions } from './content';

afterEach(() => disableInternalFixtures());

describe('session content resolver', () => {
  it('resolves every genuine workout as dance content, never as a fixture', () => {
    for (const w of WORKOUTS) {
      const c = resolveContent(w.id)!;
      expect(c.kind).toBe('dance');
      expect(c.fixture).toBe(false);
      expect(c.style).toBe(w.style);
      expect(c.blocks).toBe(w.blocks);
    }
    expect(resolveContent('does-not-exist')).toBeUndefined();
  });
  it('shows no strength session unless it passes the review gate: none exist, so none appear', () => {
    expect(strengthSessions()).toEqual([]);
    expect(resolveContent('fixture-strength-bodyweight')).toBeUndefined();
    expect(resolveContent('fixture-chair-dance-10')).toBeUndefined();
  });
  it('with fixtures on, strength resolves through the same shape, marked as a fixture, with no dance fields', () => {
    enableInternalFixtures();
    const c = resolveContent('fixture-strength-bodyweight')!;
    expect(c).toMatchObject({
      kind: 'strength',
      style: null,
      intensity: null,
      impact: null,
      fixture: true,
    });
    expect(c.exercises?.length).toBe(3);
    expect(c.blocks.some((b) => b.manual)).toBe(true);
    expect(c.blocks.some((b) => b.kind === 'rest')).toBe(true);
    expect(
      strengthSessions()
        .filter((s) => s.fixture)
        .map((s) => s.id),
    ).toEqual(['fixture-strength-bodyweight']);
    expect(strengthSessions().filter((s) => s.draft).length).toBeGreaterThanOrEqual(2);
  });
  it('with fixtures on, chair dance is seated throughout and another session can be seated-suitable', () => {
    enableInternalFixtures();
    expect(resolveContent('fixture-chair-dance-10')).toMatchObject({
      kind: 'dance',
      style: 'chair_dance',
      seatedSuitable: true,
      seatedOnly: true,
      fixture: true,
    });
    expect(resolveContent('fixture-seated-suitable')).toMatchObject({
      style: 'afrobeats',
      seatedSuitable: true,
      seatedOnly: false,
    });
    expect(resolveContent(WORKOUTS[0]!.id)!.seatedSuitable).toBe(false);
  });
  it('a strength session runs end to end through the dance player machinery', () => {
    enableInternalFixtures();
    const c = resolveContent('fixture-strength-bodyweight')!;
    let r = initRunnerFromSegments(c.id, sessionSegments(c, false), false);
    r = runnerReduce(r, { type: 'begin', prepS: 0 });
    for (let i = 0; i < 100 && r.session.status !== 'finished'; i++) {
      const seg = r.session.segments[r.session.index]!;
      r = runnerReduce(r, seg.manual ? { type: 'done' } : { type: 'tick', seconds: seg.seconds });
    }
    expect(r.session.status).toBe('finished');
    expect(r.session.elapsedS).toBeGreaterThan(0);
  });
});

describe('screens resolve session content once per id', () => {
  // resolveContent builds a new object on every call. The player's effects depend on it (recovering an interrupted session, saving recovery points), so calling it
  // directly in a render restarts them on every render: the session paused itself and the screen locked up. The screens must memoise it.
  const root = join(__dirname, '..', '..', 'app', 'dance');
  for (const f of ['session.tsx', '[id].tsx'])
    it(`${f} memoises resolveContent`, () => {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).toMatch(/useMemo\(\(\) => resolveContent\(String\(id\)\), \[id\]\)/);
      expect(src.match(/resolveContent\(/g)).toHaveLength(1);
    });
});

describe('Use what you have in the session resolver', () => {
  const id = encodeHomeId(
    makeRequest({ items: ['chair', 'wall'], level: 'beginner', minutes: 15 }),
  );
  it('is not found in a normal build, even for a well-formed id', () => {
    expect(resolveContent(id)).toBeUndefined();
  });
  it('with the preview switch on, resolves through the same shape as other strength sessions, with its checks and draft label', () => {
    enableInternalFixtures();
    const c = resolveContent(id)!;
    expect(c).toMatchObject({ kind: 'strength', id, draft: true, fixture: false, style: null });
    expect(c.home?.itemsUsed.length).toBeGreaterThan(0);
    expect(c.home?.checks.length).toBeGreaterThan(0);
    expect(c.blocks.some((b) => b.manual)).toBe(true);
    expect(c.blocks.some((b) => b.kind === 'rest')).toBe(true);
    expect(c.exercises?.length).toBe(c.strength?.blocks.length);
    // The same id always gives the same session, which is what resume and the player rely on.
    const again = resolveContent(id)!;
    expect(again.blocks.map((b) => b.title)).toEqual(c.blocks.map((b) => b.title));
  });
  it('rejects ids that are not canonical or that nothing can be built for', () => {
    enableInternalFixtures();
    expect(resolveContent('home~bad')).toBeUndefined();
    expect(resolveContent(id.replace('beginner', 'expert'))).toBeUndefined();
    const nothing = buildHomeWorkout({ items: ['towel'], seated: false });
    expect(nothing.ok).toBe(true);
  });
  it('is never a strength session offered in the generic strength list', () => {
    enableInternalFixtures();
    expect(strengthSessions().some((s) => s.id.startsWith('home~'))).toBe(false);
  });
});
