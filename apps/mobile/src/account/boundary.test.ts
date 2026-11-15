import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateIntentForPath } from '@dancehall/shared';
import { MockStore, type KeyValue } from '../data/mockStore';

const root = join(__dirname, '..', '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const memory = (): KeyValue => {
  const d = new Map<string, string>();
  return {
    get: async (k) => d.get(k) ?? null,
    set: async (k, v) => void d.set(k, v),
    remove: async (k) => void d.delete(k),
  };
};

/** The route a screen file serves: groups in parentheses disappear, index is the folder itself. */
function routeOf(file: string): string {
  const rel = relative(join(root, 'app'), file).replace(/\.tsx$/, '');
  const parts = rel.split('/').filter((s) => !/^\(.*\)$/.test(s));
  if (parts.at(-1) === 'index') parts.pop();
  return '/' + parts.join('/');
}

describe('authorization boundaries: who can reach what', () => {
  const screens = walk(join(root, 'app')).filter(
    (f) => f.endsWith('.tsx') && !/_layout\.tsx$/.test(f),
  );

  it('every screen that needs an account is wrapped so a guest never sees it, and no public screen is', () => {
    const offenders: string[] = [];
    for (const f of screens) {
      const route = routeOf(f);
      if (/^\/(account|onboarding|sign-in)/.test(route)) continue; // the account screens themselves
      const needs = gateIntentForPath(route) !== null;
      const wrapped = /export default withAccount\(/.test(readFileSync(f, 'utf8'));
      if (needs !== wrapped) offenders.push(`${route}: needs account=${needs}, wrapped=${wrapped}`);
    }
    expect(offenders).toEqual([]);
    expect(screens.length).toBeGreaterThan(20);
  });

  it('the tabs that show personal data have a guest version, and the guest versions read no account data', () => {
    for (const tab of ['index', 'food', 'me']) {
      const src = readFileSync(join(root, 'app', '(tabs)', `${tab}.tsx`), 'utf8');
      expect(src, tab).toMatch(/session \? <\w+Account \/> : <Guest\w+ \/>/);
    }
    const guest = readFileSync(join(root, 'src', 'account', 'guest.tsx'), 'utf8');
    expect(guest).not.toMatch(/useLoad|useWellness|useFoodData|useDanceData|store\./);
  });

  it('the data store refuses every account operation when signed out, so a guest screen cannot read or write anything by mistake', async () => {
    const s = new MockStore(memory(), () => new Date('2026-06-15T12:00:00Z'));
    const calls: Array<[string, () => Promise<unknown>]> = [
      ['listSessions', () => s.listSessions()],
      [
        'createSession',
        () => s.createSession({ title: 'x', minutes: 10, plannedFor: '2026-06-15' } as never),
      ],
      ['getWellnessPrefs', () => s.getWellnessPrefs()],
      ['setWellnessPrefs', () => s.setWellnessPrefs({ homeItems: ['chair'] })],
      ['listWellness', () => s.listWellness('2026-06-01')],
      [
        'addWellness',
        () =>
          s.addWellness({
            kind: 'water',
            day: '2026-06-15',
            amount: 250,
            clientKey: 'abcdefgh',
          } as never),
      ],
      ['getPrivate', () => s.getPrivate()],
      ['listWeights', () => s.listWeights()],
      ['listGoals', () => s.listGoals()],
      ['listHabits', () => s.listHabits()],
      ['updateProfile', () => s.updateProfile({ displayName: 'x' } as never)],
    ];
    for (const [name, call] of calls)
      await expect(call(), name).rejects.toMatchObject({
        code: expect.stringMatching(/not_authenticated|consent/),
      });
  });

  it('a person with no account has no data in the store after browsing (nothing is created by looking)', async () => {
    const kv = memory();
    const s = new MockStore(kv, () => new Date('2026-06-15T12:00:00Z'));
    expect(await s.getSession()).toBeNull();
    expect(await kv.get('dh.mock.v1')).toBeNull();
  });
});

describe('the PIN is handled carefully in the code', () => {
  const files = walk(join(root, 'src', 'account'))
    .concat(walk(join(root, 'app', 'account')))
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
  it('never logs, and never writes a PIN to ordinary storage', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/console\.(log|info|debug|warn)/);
      expect(src, f).not.toMatch(/AsyncStorage\.setItem\([^)]*pin/i);
      expect(src, f).not.toMatch(/localStorage\.setItem\([^)]*pin/i);
    }
  });
  it('keeps the PIN record in secure storage, readable only when unlocked and never moved to another device', () => {
    const src = readFileSync(join(root, 'src', 'account', 'vaultStorage.ts'), 'utf8');
    expect(src).toMatch(/WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
    expect(src).toMatch(/SecureStore\.setItemAsync/);
  });
  it('shows the account screen text without email or password fields', () => {
    for (const f of ['start.tsx', 'pin.tsx']) {
      const src = readFileSync(join(root, 'app', 'account', f), 'utf8');
      expect(src, f).not.toMatch(
        /keyboardType="email-address"|secureTextEntry|autoComplete="(email|password|new-password)"/,
      );
    }
  });
});
