/**
 * Validates the developer's real `apps/mobile/.env.local` when it exists (it is git-ignored, so CI skips this).
 * Run `pnpm --filter @dancehall/mobile test` after creating it: a wrong key type or URL fails here, not on a phone.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from './env';

const file = join(__dirname, '..', '..', '.env.local');
const present = existsSync(file);

function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

describe.skipIf(!present)('apps/mobile/.env.local', () => {
  const env = present ? parse(readFileSync(file, 'utf8')) : {};
  it('holds a valid Supabase configuration for later activation, whatever mode is set now', () => {
    const c = resolveConfig({ ...env, EXPO_PUBLIC_AUTH_MODE: 'supabase' });
    expect(c.authMode).toBe('supabase');
    expect(c.supabaseUrl).toMatch(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
    expect(c.supabasePublishableKey).toMatch(/^sb_publishable_/);
  });
  it('is in development, where mock sign-in is allowed, until real sign-in is activated', () => {
    const c = resolveConfig(env);
    expect(c.appEnv).toBe('development');
  });
  it('contains only EXPO_PUBLIC_* names, so no secret can ship in the app bundle', () => {
    const bad = Object.keys(env).filter((k) => !k.startsWith('EXPO_PUBLIC_'));
    expect(bad).toEqual([]);
  });
  it('never contains a service-role or secret key', () => {
    const text = Object.values(env).join(' ');
    expect(text).not.toMatch(/sb_secret_|service_role/);
  });
});
