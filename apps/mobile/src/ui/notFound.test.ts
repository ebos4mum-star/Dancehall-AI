import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Regression: a missing workout or unknown address used to be a dead end (no button) or the router's developer "Sitemap" screen. */
describe('not-found screens always offer a way out', () => {
  it('unknown addresses use the friendly screen, not the router default', () => {
    expect(read('app/+not-found.tsx')).toMatch(/NotFound/);
  });
  it('the shared screen has a button that returns to Today', () => {
    const s = read('src/ui/NotFound.tsx');
    expect(s).toMatch(/<Button/);
    expect(s).toMatch(/router\.replace\('\/'\)/);
  });
  it.each(['app/dance/[id].tsx', 'app/dance/session.tsx', 'app/dance/program.tsx'])(
    '%s shows the shared screen for a missing workout',
    (f) => {
      const s = read(f);
      expect(s).toMatch(/<NotFound message=\{t\('wk\.notFound'\)\}/);
      expect(s).not.toMatch(/<Notice>\{t\('wk\.notFound'\)\}<\/Notice>/);
    },
  );
});

describe('an empty schedule is not a dead end', () => {
  it('offers a button to choose a workout', () => {
    expect(read('app/dance/schedule.tsx')).toMatch(/sch\.pick/);
  });
});

describe('signing out drops the in-progress workout recovery point', () => {
  it('signOutDevice clears the device-wide snapshot so the next person is not offered it', () => {
    const s = read('src/account/AccountProvider.tsx');
    const body = s.slice(s.indexOf('const signOutDevice'), s.indexOf('const value: AccountState'));
    expect(body).toMatch(/clearSnapshot\(deviceSnapshotStore\)/);
  });
});
