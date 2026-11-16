import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const require_ = createRequire(import.meta.url);
const base = require_(join(root, 'app.json')) as {
  expo: Record<string, unknown> & { plugins: unknown[] };
};
const make = require_(join(root, 'app.config.js')) as (a: { config: unknown }) => {
  plugins: unknown[];
  ios: { bundleIdentifier: string };
  slug: string;
  scheme: string;
  name: string;
};

const saved = process.env.EXPO_PUBLIC_APPLE_HEALTH;
afterEach(() => {
  if (saved === undefined) delete process.env.EXPO_PUBLIC_APPLE_HEALTH;
  else process.env.EXPO_PUBLIC_APPLE_HEALTH = saved;
});

describe('app.config.js adds HealthKit only for the build that asks for it', () => {
  it('without the flag the config is exactly app.json (no HealthKit plugin, entitlement or usage text)', () => {
    delete process.env.EXPO_PUBLIC_APPLE_HEALTH;
    expect(make({ config: base.expo })).toEqual(base.expo);
    expect(JSON.stringify(make({ config: base.expo }))).not.toMatch(/healthkit|NSHealth/i);
    process.env.EXPO_PUBLIC_APPLE_HEALTH = '0';
    expect(make({ config: base.expo })).toEqual(base.expo);
  });
  it('with the flag it adds the plugin with read-only usage text and leaves the app identity untouched', () => {
    process.env.EXPO_PUBLIC_APPLE_HEALTH = '1';
    const c = make({ config: base.expo });
    const hk = c.plugins.find(
      (p) => Array.isArray(p) && p[0] === '@kingstinct/react-native-healthkit',
    ) as [string, Record<string, unknown>];
    expect(hk).toBeTruthy();
    expect(String(hk[1].NSHealthShareUsageDescription)).toMatch(
      /never reads calories, heart rate or location/,
    );
    expect(hk[1].NSHealthUpdateUsageDescription).toBe(false); // no write access is requested
    expect(hk[1].background).toBe(false); // no background delivery entitlement
    expect(c.plugins.length).toBe(base.expo.plugins.length + 1);
    expect(c.ios.bundleIdentifier).toBe('com.dancehallfit.app');
    expect(c.slug).toBe('dancehall-fit-ai');
    expect(c.scheme).toBe('dancehallfit');
    expect(c.name).toBe(base.expo.name);
  });
});
