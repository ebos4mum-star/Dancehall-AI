import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from './env';

const root = join(__dirname, '..', '..');
const readJson = (f: string) => JSON.parse(readFileSync(join(root, f), 'utf8'));

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|json)$/.test(n)) out.push(p);
  }
  return out;
}

describe('app.json', () => {
  const { expo } = readJson('app.json');
  it('sets the iOS bundle identifier', () => {
    expect(expo.ios.bundleIdentifier).toBe('com.dancehallfit.app');
  });
  it('is iPhone-only and declares no non-exempt encryption', () => {
    expect(expo.ios.supportsTablet).toBe(false);
    expect(expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });
});

describe('eas.json', () => {
  const eas = readJson('eas.json');
  const text = readFileSync(join(root, 'eas.json'), 'utf8');
  it('defines development, preview and production build profiles', () => {
    expect(Object.keys(eas.build)).toEqual(['development', 'preview', 'production']);
  });
  it('never allows mock auth in production, and sets APP_ENV per profile', () => {
    expect(eas.build.production.env.EXPO_PUBLIC_APP_ENV).toBe('production');
    expect(eas.build.production.env.EXPO_PUBLIC_AUTH_MODE).toBe('supabase');
    expect(eas.build.preview.env.EXPO_PUBLIC_AUTH_MODE).toBe('supabase');
    expect(eas.build.development.env.EXPO_PUBLIC_APP_ENV).toBe('development');
  });
  it('contains no credentials: Supabase values come from EAS environment variables', () => {
    expect(text).not.toMatch(/SUPABASE_(URL|PUBLISHABLE_KEY|SERVICE)/i);
    expect(text).not.toMatch(/sb_(secret|publishable)_|eyJ|sk_|pk_|https?:\/\//);
  });
});

describe('isolation from unrelated credentials', () => {
  const files = [
    ...walk(join(root, 'src')),
    ...walk(join(root, 'app')),
    join(root, 'app.json'),
    join(root, 'eas.json'),
  ].filter((f) => !f.endsWith('buildConfig.test.ts'));
  it('no app source or config references Stripe', () => {
    const hits = files.filter((f) => /stripe/i.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('resolveConfig ignores unrelated variables and exposes only known fields', () => {
    const c = resolveConfig({
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_placeholder',
      UNRELATED_PUBLIC_KEY: 'placeholder-not-real',
      UNRELATED_TEST_MODE: 'true',
    });
    expect(Object.keys(c).sort()).toEqual(
      [
        'aiApiUrl',
        'appEnv',
        'authMode',
        'cloudAccounts',
        'contentFixtures',
        'supabasePublishableKey',
        'supabaseUrl',
      ].sort(),
    );
    expect(JSON.stringify(c)).not.toContain('placeholder-not-real');
  });
});

describe('internal content fixtures stay out of real builds', () => {
  it('no EAS build profile enables them', () => {
    expect(JSON.stringify(readJson('eas.json'))).not.toMatch(/CONTENT_FIXTURES/);
  });
  it('only the app startup switches them on, and only through the guarded configuration', () => {
    const hits = walk(join(root, 'src'))
      .concat(walk(join(root, 'app')))
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => /enableInternalFixtures\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(root, ''));
    expect(hits).toEqual(['/src/data/AppProvider.tsx']);
  });
});
