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
  it('defines development, preview, preview-cloud, staging-preview, staging-testflight and production build profiles', () => {
    expect(Object.keys(eas.build)).toEqual([
      'development',
      'preview',
      'preview-cloud',
      'staging-preview',
      'staging-testflight',
      'production',
    ]);
  });
  it('never allows mock auth in production, and sets APP_ENV per profile', () => {
    expect(eas.build.production.env.EXPO_PUBLIC_APP_ENV).toBe('production');
    expect(eas.build.production.env.EXPO_PUBLIC_AUTH_MODE).toBe('supabase');
    expect(eas.build.preview.env.EXPO_PUBLIC_AUTH_MODE).toBe('supabase');
    expect(eas.build.development.env.EXPO_PUBLIC_APP_ENV).toBe('development');
  });
  it('cloud accounts are on in the preview-cloud, staging-preview and staging-testflight profiles ONLY: development, preview and production stay off', () => {
    for (const [name, profile] of Object.entries(eas.build) as [
      string,
      { env?: Record<string, string> },
    ][])
      expect(profile.env?.EXPO_PUBLIC_CLOUD_ACCOUNTS, name).toBe(
        name === 'preview-cloud' || name === 'staging-preview' || name === 'staging-testflight'
          ? '1'
          : undefined,
      );
  });
  it('preview-cloud is an isolated internal preview build: it extends nothing, is not a store or release profile, and is never submitted', () => {
    const p = eas.build['preview-cloud'];
    expect(p.env.EXPO_PUBLIC_APP_ENV).toBe('preview');
    expect(p.env.EXPO_PUBLIC_AUTH_MODE).toBe('supabase');
    expect(p.distribution).toBe('internal');
    expect(p.environment).toBe('preview'); // the URL and publishable key come from the EAS "preview" environment, not from git
    expect(p).not.toHaveProperty('extends');
    expect(p).not.toHaveProperty('autoIncrement');
    expect(p).not.toHaveProperty('channel');
    // Only the production and the dedicated staging-testflight profiles can ever be submitted; no preview profile can.
    expect(Object.keys(eas.submit ?? {})).toEqual(['production', 'staging-testflight']);
    expect(JSON.stringify(eas.submit)).not.toMatch(/preview/);
  });
  it('staging-preview is an isolated internal staging build: preview environment only, never submitted, never production', () => {
    const p = eas.build['staging-preview'];
    expect(p.env.EXPO_PUBLIC_APP_ENV).toBe('preview');
    expect(p.env.EXPO_PUBLIC_AUTH_MODE).toBe('supabase');
    expect(p.distribution).toBe('internal');
    expect(p.environment).toBe('staging'); // the staging URL and publishable key come from a separate EAS "staging" environment, not from git
    expect(p).not.toHaveProperty('extends');
    expect(p).not.toHaveProperty('autoIncrement');
    expect(p).not.toHaveProperty('channel');
  });
  it('staging-testflight is the ONLY staging profile that can be uploaded to TestFlight: store distribution, staging backend, preview app environment, never production', () => {
    const p = eas.build['staging-testflight'];
    const stagingPreview = eas.build['staging-preview'];
    // An internal-distribution (ad hoc) build cannot be uploaded to TestFlight; a store-distribution one can.
    expect(stagingPreview.distribution).toBe('internal');
    expect(p.distribution).toBe('store');
    expect(p.environment).toBe('staging'); // URL and publishable key from the EAS "staging" environment, never from git
    expect(p.autoIncrement).toBe(true); // build numbers come from EAS (appVersionSource: remote), so a re-upload never collides
    expect(p.env.EXPO_PUBLIC_APP_ENV).toBe('preview'); // never 'production': the production guards stay out of its way and it can never be mistaken for a release build
    expect(p.env.EXPO_PUBLIC_AUTH_MODE).toBe('supabase'); // never mock
    expect(p).not.toHaveProperty('extends');
    expect(p).not.toHaveProperty('channel');
    // The same switches as staging-preview, so the two cannot drift, plus the synthetic barcode sample list explicitly OFF (a preview build would otherwise default to it).
    const { EXPO_PUBLIC_BARCODE_PROVIDER: barcode, ...rest } = p.env;
    expect(rest).toEqual(stagingPreview.env);
    expect(barcode).toBe('off');
    expect(Object.keys(eas.submit['staging-testflight'])).toEqual(['ios']);
    expect(JSON.stringify(eas.submit['staging-testflight'])).not.toMatch(
      /apple|asc|key|password|token|@/i,
    ); // no Apple credential can live here
  });
  it('the existing profiles are unchanged by the cloud-account work', () => {
    expect(eas.build.development).toEqual({
      developmentClient: true,
      distribution: 'internal',
      ios: { simulator: false },
      env: { EXPO_PUBLIC_APP_ENV: 'development' },
    });
    expect(eas.build.preview).toEqual({
      distribution: 'internal',
      env: { EXPO_PUBLIC_APP_ENV: 'preview', EXPO_PUBLIC_AUTH_MODE: 'supabase' },
    });
    expect(eas.build.production).toEqual({
      autoIncrement: true,
      env: { EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_AUTH_MODE: 'supabase' },
    });
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
        'appleHealth',
        'appEnv',
        'authMode',
        'barcodeProvider',
        'cloudAccounts',
        'community',
        'contentFixtures',
        'privacyPolicyUrl',
        'social',
        'supabasePublishableKey',
        'supportEmail',
        'supportUrl',
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

describe('Friends is never switched on by a shared build profile', () => {
  const eas = JSON.parse(readFileSync(join(__dirname, '..', '..', 'eas.json'), 'utf8')) as {
    build: Record<string, { env?: Record<string, string> }>;
  };
  it('only the staging-preview profile sets EXPO_PUBLIC_SOCIAL or EXPO_PUBLIC_COMMUNITY, and the production profile cannot reach either', () => {
    for (const [name, p] of Object.entries(eas.build)) {
      const staging = name === 'staging-preview' || name === 'staging-testflight';
      expect(p.env?.EXPO_PUBLIC_SOCIAL, name).toBe(staging ? '1' : undefined);
      expect(p.env?.EXPO_PUBLIC_COMMUNITY, name).toBe(staging ? '1' : undefined);
      expect(p.env?.EXPO_PUBLIC_APPLE_HEALTH, name).toBe(staging ? '1' : undefined);
    }
    expect(eas.build.production!.env ?? {}).not.toHaveProperty('EXPO_PUBLIC_SOCIAL');
    expect(eas.build.production!.env ?? {}).not.toHaveProperty('EXPO_PUBLIC_COMMUNITY');
    expect(eas.build.production!.env ?? {}).not.toHaveProperty('EXPO_PUBLIC_APPLE_HEALTH');
  });
  it('a production build that is handed the Apple Health flag refuses to start', () => {
    expect(() =>
      resolveConfig({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_AUTH_MODE: 'supabase',
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_placeholder',
        EXPO_PUBLIC_APPLE_HEALTH: '1',
      }),
    ).toThrow(/Apple Health/);
  });
  it('a production build that is handed the flag refuses to start', () => {
    expect(() =>
      resolveConfig({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_AUTH_MODE: 'supabase',
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_placeholder',
        EXPO_PUBLIC_SOCIAL: '1',
      }),
    ).toThrow(/production/);
  });
});

describe('the staging-testflight build, as the app will see it', () => {
  const eas = readJson('eas.json');
  const profileEnv = eas.build['staging-testflight'].env as Record<string, string>;
  // The two values EAS supplies from its "staging" environment (placeholders here: no real project value is in the repository).
  const withBackend = {
    ...profileEnv,
    EXPO_PUBLIC_SUPABASE_URL: 'https://bxhnrjulksganzydgrgm.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_placeholder',
  };
  it('starts with the staging backend and the intended features, and nothing synthetic', () => {
    const c = resolveConfig(withBackend);
    expect(c).toMatchObject({
      appEnv: 'preview',
      authMode: 'supabase',
      cloudAccounts: true,
      social: true,
      community: true,
      appleHealth: true,
      barcodeProvider: 'off',
      contentFixtures: false,
    });
    expect(c.supabaseUrl).toBe('https://bxhnrjulksganzydgrgm.supabase.co');
    expect(c.aiApiUrl).toBeUndefined(); // the AI gateway is not deployed: the Coach says it is unavailable, never a simulation
  });
  it('refuses to start without the backend values (it can never fall back to the mock)', () => {
    expect(() => resolveConfig(profileEnv)).toThrow(/Supabase mode needs/);
  });
  it('refuses a secret key in the app', () => {
    expect(() =>
      resolveConfig({ ...withBackend, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }),
    ).toThrow(/secret or service-role key/);
  });
});
