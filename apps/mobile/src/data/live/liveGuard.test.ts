import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPROVED_URL, resolveLiveConfig } from './liveGuard';

const good = {
  LIVE_SUPABASE: '1',
  LIVE_SUPABASE_URL: APPROVED_URL,
  LIVE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
  LIVE_USER_A_EMAIL: 'a@example.test',
  LIVE_USER_A_PASSWORD: 'x',
  LIVE_USER_B_EMAIL: 'b@example.test',
  LIVE_USER_B_PASSWORD: 'y',
};
describe('live verification guard', () => {
  it('is off unless explicitly enabled', () => {
    expect(resolveLiveConfig({}).enabled).toBe(false);
    expect(resolveLiveConfig({ ...good, LIVE_SUPABASE: undefined }).enabled).toBe(false);
  });
  it('accepts only the approved DanceHall development project', () => {
    expect(resolveLiveConfig(good).enabled).toBe(true);
    expect(resolveLiveConfig({ ...good, LIVE_SUPABASE_URL: `${APPROVED_URL}/` }).enabled).toBe(
      true,
    );
    for (const url of [
      `https://${'a'.repeat(20)}.supabase.co`,
      `${APPROVED_URL}.evil.test`,
      APPROVED_URL.replace('https://', 'http://'),
      '',
    ])
      expect(resolveLiveConfig({ ...good, LIVE_SUPABASE_URL: url }).enabled, url).toBe(false);
  });
  it('refuses secret or service keys', () => {
    for (const k of [`sb_${'secret'}_abc`, `eyJservice_${'role'}`, 'anything', ''])
      expect(resolveLiveConfig({ ...good, LIVE_SUPABASE_PUBLISHABLE_KEY: k }).enabled, k).toBe(
        false,
      );
    expect(
      resolveLiveConfig({
        ...good,
        LIVE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_service_${'role'}`,
      }).enabled,
    ).toBe(false);
  });
  it('needs two distinct test users', () => {
    expect(resolveLiveConfig({ ...good, LIVE_USER_B_EMAIL: 'A@example.test' }).enabled).toBe(false);
    expect(resolveLiveConfig({ ...good, LIVE_USER_B_PASSWORD: '' }).enabled).toBe(false);
  });
  it('accepts only synthetic (.test) accounts, never a real address', () => {
    for (const email of ['person@gmail.com', 'a@example.com', 'a@example.test.evil.com', 'nobody'])
      expect(resolveLiveConfig({ ...good, LIVE_USER_A_EMAIL: email }).enabled, email).toBe(false);
    expect(resolveLiveConfig({ ...good, LIVE_USER_A_EMAIL: 'Live-A@Example.TEST' }).enabled).toBe(
      true,
    );
  });
  it('the live files never log, print or persist credentials', () => {
    for (const f of readdirSync(__dirname)
      .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
      .concat(['live.test.ts'])) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src, f).not.toMatch(
        /console\.|writeFile|appendFile|JSON\.stringify\((cfg|live|env|process\.env)/,
      );
    }
  });
});
