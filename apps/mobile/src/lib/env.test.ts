import { describe, expect, it } from 'vitest';
import { ConfigError, resolveConfig } from './env';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`;

describe('resolveConfig', () => {
  it('defaults to mock in development with nothing configured', () => {
    expect(resolveConfig({})).toEqual({ appEnv: 'development', authMode: 'mock' });
  });
  it('refuses mock in production', () => {
    expect(() => resolveConfig({ EXPO_PUBLIC_APP_ENV: 'production' })).toThrow(ConfigError);
    expect(() =>
      resolveConfig({ EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_AUTH_MODE: 'mock' }),
    ).toThrow(/development-only/);
  });
  it('uses supabase when url and key are present', () => {
    const c = resolveConfig({
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    });
    expect(c.authMode).toBe('supabase');
  });
  it('requires both url and key, and https', () => {
    expect(() => resolveConfig({ EXPO_PUBLIC_AUTH_MODE: 'supabase' })).toThrow(ConfigError);
    expect(() =>
      resolveConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'http://evil.example.test',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k',
      }),
    ).toThrow(/https/);
  });
  it('rejects secret and service-role keys', () => {
    const base = { EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test' };
    expect(() =>
      resolveConfig({ ...base, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' }),
    ).toThrow(/never be used in the app/);
    expect(() =>
      resolveConfig({ ...base, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }),
    ).toThrow(/never be used in the app/);
    expect(
      resolveConfig({ ...base, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).authMode,
    ).toBe('supabase');
  });
  it('accepts an https AI service URL, trims it, and rejects insecure ones', () => {
    const base = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    };
    expect(
      resolveConfig({ ...base, EXPO_PUBLIC_AI_API_URL: 'https://ai.example.test/' }).aiApiUrl,
    ).toBe('https://ai.example.test');
    expect(resolveConfig(base).aiApiUrl).toBeUndefined();
    expect(() =>
      resolveConfig({ ...base, EXPO_PUBLIC_AI_API_URL: 'http://ai.example.test' }),
    ).toThrow(ConfigError);
  });
});
