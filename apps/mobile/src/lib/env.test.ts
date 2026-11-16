import { describe, expect, it } from 'vitest';
import { ConfigError, PRODUCTION_ACCOUNTS_ACK, resolveConfig } from './env';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.sig`;

describe('resolveConfig', () => {
  it('defaults to mock in development with nothing configured', () => {
    expect(resolveConfig({})).toEqual({
      appEnv: 'development',
      authMode: 'mock',
      contentFixtures: false,
      cloudAccounts: true,
      barcodeProvider: 'local',
      community: true,
      social: true,
      appleHealth: true,
    });
  });
  it('carries an optional public support address and refuses anything that is not an email address', () => {
    expect(resolveConfig({ EXPO_PUBLIC_SUPPORT_EMAIL: ' help@example.test ' }).supportEmail).toBe(
      'help@example.test',
    );
    expect(resolveConfig({}).supportEmail).toBeUndefined();
    expect(() => resolveConfig({ EXPO_PUBLIC_SUPPORT_EMAIL: 'not an email' })).toThrow(/email/);
  });
  it('carries optional public policy and support addresses, https only', () => {
    const c = resolveConfig({
      EXPO_PUBLIC_PRIVACY_POLICY_URL: ' https://example.test/privacy ',
      EXPO_PUBLIC_SUPPORT_URL: 'https://example.test/support',
    });
    expect(c).toMatchObject({
      privacyPolicyUrl: 'https://example.test/privacy',
      supportUrl: 'https://example.test/support',
    });
    expect(resolveConfig({}).privacyPolicyUrl).toBeUndefined();
    for (const bad of [
      'http://example.test/p',
      'javascript:alert(1)',
      'https://',
      'https://a b.test',
      'example.test/privacy',
    ])
      expect(() => resolveConfig({ EXPO_PUBLIC_PRIVACY_POLICY_URL: bad })).toThrow(/https/);
  });
  it('offers cloud accounts in a Supabase build only when explicitly enabled', () => {
    const base = {
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    };
    expect(resolveConfig(base).cloudAccounts).toBe(false);
    expect(resolveConfig({ ...base, EXPO_PUBLIC_CLOUD_ACCOUNTS: '1' }).cloudAccounts).toBe(true);
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

describe('resolveConfig: placeholder verification', () => {
  it('accepts the documented placeholder shape and trims whitespace', () => {
    const c = resolveConfig({
      EXPO_PUBLIC_APP_ENV: 'preview',
      EXPO_PUBLIC_SUPABASE_URL: ' https://your-project-ref.supabase.co ',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_xxxxxxxx ',
    });
    expect(c).toMatchObject({
      authMode: 'supabase',
      supabaseUrl: 'https://your-project-ref.supabase.co',
      supabasePublishableKey: 'sb_publishable_xxxxxxxx',
    });
  });
  it('refuses a production build without Supabase configured', () => {
    expect(() => resolveConfig({ EXPO_PUBLIC_APP_ENV: 'production' })).toThrow(ConfigError);
  });
});

describe('mock authentication can never be enabled in production', () => {
  const urls = [undefined, 'https://x.supabase.example.test', 'http://localhost:54321', ''];
  const keys = [undefined, 'sb_publishable_abc', ''];
  const modes = [undefined, 'mock', 'supabase', 'MOCK', ' mock ', 'dev', ''];
  it('no combination of settings yields mock mode when APP_ENV is production', () => {
    let tried = 0;
    for (const url of urls)
      for (const key of keys)
        for (const mode of modes) {
          tried++;
          let result: ReturnType<typeof resolveConfig> | null = null;
          try {
            result = resolveConfig({
              EXPO_PUBLIC_APP_ENV: 'production',
              EXPO_PUBLIC_AUTH_MODE: mode,
              EXPO_PUBLIC_SUPABASE_URL: url,
              EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
            });
          } catch (e) {
            expect(e).toBeInstanceOf(ConfigError);
          }
          if (result) {
            expect(result.authMode).toBe('supabase');
            expect(result.supabaseUrl).toBeTruthy();
            expect(result.supabasePublishableKey).toBeTruthy();
          }
        }
    expect(tried).toBe(urls.length * keys.length * modes.length);
  });
  it('the preview environment is treated like development (mock allowed) only when explicitly requested', () => {
    expect(resolveConfig({ EXPO_PUBLIC_APP_ENV: 'preview' }).authMode).toBe('mock');
  });
  it('an unknown or misspelled environment is refused rather than defaulting to something permissive', () => {
    for (const e of ['prod', 'Production', 'staging', 'live'])
      expect(() => resolveConfig({ EXPO_PUBLIC_APP_ENV: e })).toThrow(ConfigError);
  });
});

describe('internal content fixtures', () => {
  it('are off unless explicitly enabled, and allowed in development and preview builds', () => {
    expect(resolveConfig({}).contentFixtures).toBe(false);
    expect(resolveConfig({ EXPO_PUBLIC_CONTENT_FIXTURES: '0' }).contentFixtures).toBe(false);
    expect(resolveConfig({ EXPO_PUBLIC_CONTENT_FIXTURES: '1' }).contentFixtures).toBe(true);
    expect(
      resolveConfig({ EXPO_PUBLIC_CONTENT_FIXTURES: '1', EXPO_PUBLIC_APP_ENV: 'preview' })
        .contentFixtures,
    ).toBe(true);
  });
  it('can never be enabled in a production build, with any other setting', () => {
    for (const mode of [undefined, 'mock', 'supabase'])
      expect(() =>
        resolveConfig({
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_CONTENT_FIXTURES: '1',
          EXPO_PUBLIC_AUTH_MODE: mode,
          EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.example.test',
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
        }),
      ).toThrow(ConfigError);
  });
  it('the supabase path carries the flag too', () => {
    const c = resolveConfig({
      EXPO_PUBLIC_CONTENT_FIXTURES: '1',
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.example.test',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
    });
    expect(c).toMatchObject({ authMode: 'supabase', contentFixtures: true });
  });
  it('a production build refuses cloud accounts unless the backend is explicitly confirmed live and reviewed', () => {
    const base = {
      EXPO_PUBLIC_APP_ENV: 'production',
      EXPO_PUBLIC_AUTH_MODE: 'supabase',
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
    };
    expect(resolveConfig(base).cloudAccounts).toBe(false);
    expect(() => resolveConfig({ ...base, EXPO_PUBLIC_CLOUD_ACCOUNTS: '1' })).toThrow(/production/);
    // the acknowledgement alone does nothing, a wrong value does nothing, and only both together offer accounts
    expect(
      resolveConfig({ ...base, EXPO_PUBLIC_PRODUCTION_ACCOUNTS: PRODUCTION_ACCOUNTS_ACK })
        .cloudAccounts,
    ).toBe(false);
    expect(() =>
      resolveConfig({
        ...base,
        EXPO_PUBLIC_CLOUD_ACCOUNTS: '1',
        EXPO_PUBLIC_PRODUCTION_ACCOUNTS: 'yes',
      }),
    ).toThrow(/production/);
    expect(() =>
      resolveConfig({
        ...base,
        EXPO_PUBLIC_CLOUD_ACCOUNTS: '1',
        EXPO_PUBLIC_PRODUCTION_ACCOUNTS: '1',
      }),
    ).toThrow(/production/);
    const on = resolveConfig({
      ...base,
      EXPO_PUBLIC_CLOUD_ACCOUNTS: '1',
      EXPO_PUBLIC_PRODUCTION_ACCOUNTS: PRODUCTION_ACCOUNTS_ACK,
    });
    expect(on.cloudAccounts).toBe(true);
    // accounts in production never bring Community, fixtures or mock sign-in with them
    expect(on.community).toBe(false);
    expect(on.contentFixtures).toBe(false);
    expect(on.authMode).toBe('supabase');
    expect(() =>
      resolveConfig({
        ...base,
        EXPO_PUBLIC_CLOUD_ACCOUNTS: '1',
        EXPO_PUBLIC_PRODUCTION_ACCOUNTS: PRODUCTION_ACCOUNTS_ACK,
        EXPO_PUBLIC_COMMUNITY: '1',
      }),
    ).toThrow(/Community/);
    expect(() =>
      resolveConfig({
        ...base,
        EXPO_PUBLIC_CLOUD_ACCOUNTS: '1',
        EXPO_PUBLIC_PRODUCTION_ACCOUNTS: PRODUCTION_ACCOUNTS_ACK,
        EXPO_PUBLIC_CONTENT_FIXTURES: '1',
      }),
    ).toThrow();
    // preview and development builds may enable it
    expect(
      resolveConfig({ ...base, EXPO_PUBLIC_APP_ENV: 'preview', EXPO_PUBLIC_CLOUD_ACCOUNTS: '1' })
        .cloudAccounts,
    ).toBe(true);
    expect(
      resolveConfig({
        ...base,
        EXPO_PUBLIC_APP_ENV: 'development',
        EXPO_PUBLIC_CLOUD_ACCOUNTS: '1',
      }).cloudAccounts,
    ).toBe(true);
  });
});

describe('social flag', () => {
  const sb = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://x.example.test',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
  };
  it('is on in the development mock, off in a Supabase build unless asked, and refused in production', () => {
    expect(resolveConfig({}).social).toBe(true);
    expect(resolveConfig({ EXPO_PUBLIC_SOCIAL: '0' }).social).toBe(false);
    expect(resolveConfig({ ...sb }).social).toBe(false);
    expect(resolveConfig({ ...sb, EXPO_PUBLIC_SOCIAL: '1' }).social).toBe(true);
    expect(() =>
      resolveConfig({ ...sb, EXPO_PUBLIC_APP_ENV: 'production', EXPO_PUBLIC_SOCIAL: '1' }),
    ).toThrow(/production/);
    expect(resolveConfig({ ...sb, EXPO_PUBLIC_APP_ENV: 'production' }).social).toBe(false);
  });
});
