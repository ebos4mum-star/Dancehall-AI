import { describe, expect, it } from 'vitest';
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
const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : 'other'),
  );
async function setup(consent = true) {
  const s = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
  await s.signInDev();
  if (consent) await s.setConsent('health_data_processing', true);
  return s;
}
const input = { lengthDays: 7, targetDays: 3, startDate: '2026-06-15' };

describe('mock fit challenges', () => {
  it('starts, lists and completes a challenge', async () => {
    const s = await setup();
    const c = await s.startChallenge(input);
    expect(c).toMatchObject({ status: 'active', lengthDays: 7, targetDays: 3 });
    await s.setChallengeStatus(c.id, 'completed');
    expect((await s.listChallenges())[0]!.status).toBe('completed');
  });
  it('needs health-data consent, like the database', async () => {
    expect(await code((await setup(false)).startChallenge(input))).toBe('consent_required');
  });
  it('allows one active challenge at a time, and a new one after the first ends', async () => {
    const s = await setup();
    const c = await s.startChallenge(input);
    expect(await code(s.startChallenge(input))).toBe('active_challenge_exists');
    await s.setChallengeStatus(c.id, 'abandoned');
    expect(await code(s.startChallenge(input))).toBeNull();
  });
  it('refuses targets that leave no rest days, and bad lengths or dates', async () => {
    const s = await setup();
    expect(await code(s.startChallenge({ ...input, targetDays: 6 }))).toBe('invalid_input');
    expect(await code(s.startChallenge({ ...input, lengthDays: 10 }))).toBe('invalid_input');
    expect(await code(s.startChallenge({ ...input, startDate: 'tomorrow' }))).toBe('invalid_input');
  });
  it('reports unknown challenges and keeps history after it ends', async () => {
    const s = await setup();
    expect(await code(s.setChallengeStatus('nope', 'completed'))).toBe('not_found');
    const c = await s.startChallenge(input);
    await s.setChallengeStatus(c.id, 'abandoned');
    expect(await s.listChallenges()).toHaveLength(1);
  });
  it('requires sign-in', async () => {
    const s = new MockStore(memory());
    expect(await code(s.listChallenges())).toBe('not_authenticated');
  });
});
