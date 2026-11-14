import { describe, expect, it } from 'vitest';
import { PROGRAMS, WORKOUT_BY_ID, activitySummary, programSessions } from '@dancehall/shared';
import { MockStore, type KeyValue } from './mockStore';
import { StoreError } from './types';

const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};
const clock = { t: new Date('2026-06-15T12:00:00Z') };
const code = async (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );
async function setup(consent = true) {
  clock.t = new Date('2026-06-15T12:00:00Z');
  const s = new MockStore(memory(), () => clock.t);
  await s.signInDev();
  if (consent) await s.setConsent('health_data_processing', true);
  return s;
}
const w = WORKOUT_BY_ID.get('qf10-latin-rhythm')!;
const planned = (over = {}) => ({
  workoutId: w.id,
  title: w.title,
  style: w.style,
  minutes: w.minutes,
  plannedFor: '2026-06-16',
  source: 'quick_fit' as const,
  ...over,
});

describe('workout sessions (mock mirrors the database)', () => {
  it('needs health-data consent for writes but can always read', async () => {
    const s = await setup(false);
    expect(await code(s.createSession(planned()))).toBe('consent_required');
    await s.setConsent('health_data_processing', true);
    await s.createSession(planned());
    await s.setConsent('health_data_processing', false);
    expect(await code(s.createSession(planned()))).toBe('consent_required');
    expect(
      await code(s.updateSession((await s.listSessions())[0]!.id, { status: 'skipped' })),
    ).toBe('consent_required');
    expect(await s.listSessions()).toHaveLength(1);
  });
  it('validates like the database', async () => {
    const s = await setup();
    expect(await code(s.createSession(planned({ plannedFor: null })))).toBe('invalid_input');
    expect(await code(s.createSession(planned({ workoutId: 'no-such-workout' })))).toBe(
      'invalid_input',
    );
    expect(await code(s.createSession(planned({ perceivedExertion: 11 })))).toBe('invalid_input');
    expect(await code(s.createSession(planned({ durationS: 0 })))).toBe('invalid_input');
    expect(await code(s.createSession(planned({ minutes: 500 })))).toBe('invalid_input');
    expect(await code(s.createSession(planned({ title: '' })))).toBe('invalid_input');
    expect(await code(s.createSession(planned({ status: 'skipped' as never })))).toBe(
      'invalid_input',
    );
    expect(
      await code(
        s.createSession({
          title: 'Done',
          minutes: 10,
          status: 'completed',
          completedAt: '2027-01-01T00:00:00Z',
        }),
      ),
    ).toBe('invalid_input');
  });
  it('completes, undoes, skips and reschedules', async () => {
    const s = await setup();
    const a = await s.createSession(planned());
    expect(a).toMatchObject({ status: 'planned', completedAt: null });
    const done = await s.updateSession(a.id, {
      status: 'completed',
      durationS: 600,
      perceivedExertion: 6,
    });
    expect(done.completedAt).toBe(clock.t.toISOString());
    expect((await s.updateSession(a.id, { status: 'planned' })).completedAt).toBeNull();
    expect((await s.updateSession(a.id, { status: 'skipped' })).status).toBe('skipped');
    expect(
      (await s.updateSession(a.id, { status: 'planned', plannedFor: '2026-06-20' })).plannedFor,
    ).toBe('2026-06-20');
    expect(await code(s.updateSession(a.id, { status: 'planned', plannedFor: null }))).toBe(
      'invalid_input',
    );
    expect(await code(s.updateSession(a.id, { perceivedExertion: 0 }))).toBe('invalid_input');
    expect(await code(s.updateSession('missing', { status: 'skipped' }))).toBe('not_found');
    await s.deleteSession(a.id);
    expect(await s.listSessions()).toHaveLength(0);
  });
  it('logs a finished workout directly and feeds the activity summary', async () => {
    const s = await setup();
    await s.createSession({
      workoutId: 'qf5-lowimpact-reset',
      title: 'Low-Impact Reset',
      minutes: 5,
      status: 'completed',
      durationS: 290,
      perceivedExertion: 4,
      lowImpact: true,
      source: 'manual',
    });
    const a = await s.createSession(planned({ plannedFor: '2026-06-15' }));
    await s.updateSession(a.id, { status: 'completed', durationS: 610 });
    const sum = activitySummary(await s.listSessions(), { timeZone: 'UTC', now: clock.t });
    expect(sum.thisWeek).toMatchObject({ sessions: 2, minutes: 5 + 10, activeDays: 1 });
  });
  it('schedules a whole program in one step', async () => {
    const s = await setup();
    const p = PROGRAMS[0]!;
    const inputs = programSessions(p, '2026-06-16').map((x) => {
      const wk = WORKOUT_BY_ID.get(x.workoutId)!;
      return {
        workoutId: wk.id,
        programId: p.id,
        title: wk.title,
        style: wk.style,
        minutes: wk.minutes,
        plannedFor: x.plannedFor,
        source: 'program' as const,
      };
    });
    const made = await s.createSessions(inputs);
    expect(made).toHaveLength(12);
    expect(
      (await s.listSessions()).every((x) => x.programId === p.id && x.status === 'planned'),
    ).toBe(true);
    expect(await code(s.createSessions([...inputs, { ...inputs[0]!, minutes: 0 }]))).toBe(
      'invalid_input',
    );
    expect(await s.listSessions()).toHaveLength(12); // nothing partial is saved on failure
  });
});
