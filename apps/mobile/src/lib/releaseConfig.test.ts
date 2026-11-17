import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PROGRAMS, WORKOUTS, disableInternalFixtures, isPreviewOnly } from '@dancehall/shared';
import { coachAvailable } from '../coach/availability';
import { createServerCaller } from '../data/supabaseCoach';
import { resolveConfig } from './env';

/** First internal TestFlight round: the release facts that must not drift. Static checks of the repository files, no network, no Apple or EAS account. */
const root = join(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const json = (f: string) => JSON.parse(read(f));
const { expo } = json('app.json');
const eas = json('eas.json');
const tf = eas.build['staging-testflight'];

describe('app identity and version', () => {
  it('is version 0.1.0 and keeps the approved identity', () => {
    expect(expo.version).toBe('0.1.0');
    expect(json('package.json').version).toBe('0.1.0');
    expect(expo.ios.bundleIdentifier).toBe('com.dancehallfit.app');
    expect(expo.slug).toBe('dancehall-fit-ai');
    expect(expo.name).toBe('Locked In Fitness');
    expect(expo.scheme).toBe('dancehallfit');
  });
  it('uses remote build numbers: nothing hardcodes a build number', () => {
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(tf.autoIncrement).toBe(true);
    expect(expo.ios.buildNumber).toBeUndefined();
  });
  it('has no EAS project id or owner invented in the repository (linking needs the account: `eas init`)', () => {
    expect(expo.extra?.eas?.projectId).toBeUndefined();
    expect(expo.owner).toBeUndefined();
  });
});

describe('privacy manifest declaration', () => {
  it('declares exactly the one reason the code supports: expo-video reads and writes its own cache-size default (UserDefaults, CA92.1)', () => {
    expect(expo.ios.privacyManifests).toEqual({
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    });
  });
  it('declares no tracking, tracking domains or collected data in the app manifest overrides', () => {
    const m = JSON.stringify(expo.ios.privacyManifests);
    expect(m).not.toMatch(/Tracking|CollectedData/);
  });
  it('keeps the approved permission texts: camera and photos only, no microphone, HealthKit read-only', () => {
    const cam = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-camera')[1];
    expect(cam.microphonePermission).toBe(false);
    const pick = expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-image-picker',
    )[1];
    expect(pick.microphonePermission).toBe(false);
    const cfg = createRequire(__filename)('../../app.config.js') as (a: { config: object }) => {
      plugins: unknown[];
    };
    const prev = process.env.EXPO_PUBLIC_APPLE_HEALTH;
    process.env.EXPO_PUBLIC_APPLE_HEALTH = '1';
    const withHealth = cfg({ config: expo });
    if (prev === undefined) delete process.env.EXPO_PUBLIC_APPLE_HEALTH;
    else process.env.EXPO_PUBLIC_APPLE_HEALTH = prev;
    const hk = withHealth.plugins.find(
      (p) => Array.isArray(p) && p[0] === '@kingstinct/react-native-healthkit',
    ) as [string, Record<string, unknown>];
    expect(hk[1].NSHealthUpdateUsageDescription).toBe(false);
    expect(hk[1].background).toBe(false);
  });
});

describe('staging-testflight profile', () => {
  it('is App Store distribution on the staging environment with only the approved flags', () => {
    expect(tf.distribution).toBe('store');
    expect(tf.environment).toBe('staging');
    expect(tf.env).toEqual({
      EXPO_PUBLIC_APP_ENV: 'preview',
      EXPO_PUBLIC_AUTH_MODE: 'supabase',
      EXPO_PUBLIC_CLOUD_ACCOUNTS: '1',
      EXPO_PUBLIC_SOCIAL: '1',
      EXPO_PUBLIC_COMMUNITY: '1',
      EXPO_PUBLIC_APPLE_HEALTH: '1',
      EXPO_PUBLIC_BARCODE_PROVIDER: 'off',
    });
  });
  it('sets no AI gateway, no content fixtures, no URLs and no secrets', () => {
    const text = JSON.stringify(tf);
    expect(text).not.toMatch(
      /AI_API_URL|CONTENT_FIXTURES|https?:|SERVICE_ROLE|secret|password|token/i,
    );
    expect(eas.submit['staging-testflight']).toEqual({ ios: {} });
  });
});

describe('AI Coach is unavailable in the TestFlight configuration', () => {
  const base = {
    EXPO_PUBLIC_APP_ENV: 'preview',
    EXPO_PUBLIC_AUTH_MODE: 'supabase',
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    ...tf.env,
  };
  it('the resolved TestFlight configuration has no gateway, so the Coach is unavailable', () => {
    const c = resolveConfig(base);
    expect(c.aiApiUrl).toBeUndefined();
    expect(c.authMode).toBe('supabase');
    expect(coachAvailable(c)).toBe(false);
  });
  it('is available only in the labelled development simulation or when a gateway is configured', () => {
    expect(coachAvailable({ authMode: 'mock' })).toBe(true);
    expect(coachAvailable({ authMode: 'supabase', aiApiUrl: 'https://ai.example.test' })).toBe(
      true,
    );
    expect(coachAvailable({ authMode: 'supabase' })).toBe(false);
  });
  it('makes no network request at all without a gateway', async () => {
    const fetchImpl = vi.fn();
    const db = { auth: { getSession: vi.fn() } };
    const call = createServerCaller(db as never, undefined, fetchImpl as never);
    await expect(call('/v1/coach/messages', { text: 'hi' })).rejects.toMatchObject({
      code: 'ai_unavailable',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(db.auth.getSession).not.toHaveBeenCalled();
  });
  it('the Coach screens guard every request on availability and keep their code and navigation', () => {
    const tab = read('app/(tabs)/coach.tsx');
    expect(tab).toMatch(/const unavailable = supported && !coachAvailable\(config\)/);
    expect(tab).toMatch(/if \(!msg \|\| busy \|\| unavailable/);
    expect(tab).toMatch(/!unavailable && st\.listConversations/);
    expect(tab).toMatch(/!unavailable && st\.getAiUsage/);
    expect(tab).toMatch(/supported && !unavailable/);
    expect(tab).toMatch(/editable=\{false\}/);
    expect(tab).toMatch(/sendCoachMessage/);
    const review = read('app/coach/review.tsx');
    expect(review).toMatch(/if \(unavailable\) return;/);
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/coach/);
  });
  it('shows the friendly copy without technical wording', () => {
    const en = read('src/i18n/en.ts');
    expect(en).toMatch(/'coach\.soonTitle': 'Your AI Coach is getting ready'/);
    expect(en).toMatch(/This feature isn't available in this test version yet/);
  });
});

describe('workout catalogue stays the bundled content, with no fixtures', () => {
  it('has 14 bundled workouts in 6 styles and the four-week program, none a fixture', () => {
    disableInternalFixtures();
    expect(WORKOUTS).toHaveLength(14);
    expect(new Set(WORKOUTS.map((w) => w.style)).size).toBe(6);
    expect(PROGRAMS).toHaveLength(1);
    expect(PROGRAMS[0]!.weeks).toBe(4);
    expect(WORKOUTS.some((w) => isPreviewOnly(w) && (w as { fixture?: boolean }).fixture)).toBe(
      false,
    );
  });
  it('production-like configuration refuses fixtures and the TestFlight profile never sets them', () => {
    expect(() =>
      resolveConfig({
        EXPO_PUBLIC_APP_ENV: 'production',
        EXPO_PUBLIC_AUTH_MODE: 'supabase',
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
        EXPO_PUBLIC_CONTENT_FIXTURES: '1',
      }),
    ).toThrow();
  });
});
