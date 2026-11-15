import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const repo = join(root, '..', '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const code = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const cloudFiles = walk(join(root, 'src', 'account', 'cloud')).filter(
  (f) => /\.tsx?$/.test(f) && !/\.test\./.test(f),
);
const screens = ['questions', 'recovery-key', 'recover', 'rotate'].map((n) =>
  join(root, 'app', 'account', `${n}.tsx`),
);

describe('cloud accounts: what the app must never do', () => {
  it('holds no service-role or secret key, and never mentions one', () => {
    const files = walk(join(root, 'src')).concat(walk(join(root, 'app')));
    const hits = files
      // env.ts is the guard that REFUSES such keys, so it has to name them.
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !f.endsWith(join('lib', 'env.ts')))
      .filter((f) => /service_role|SERVICE_ROLE|sb_secret_/i.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the PIN never reaches the cloud code: no PIN parameter, import or field anywhere in the account service or API', () => {
    for (const f of cloudFiles) {
      const src = code(f);
      expect(src, f).not.toMatch(/\bpin\b/i);
      expect(src, f).not.toMatch(/pinVault|PinVault/);
    }
  });

  it('secrets go only through secure storage: the service never touches ordinary storage', () => {
    const src = code(join(root, 'src', 'account', 'cloud', 'accountService.ts'));
    expect(src).not.toMatch(/AsyncStorage|localStorage|sessionStorage|document\.cookie/);
  });

  it('nothing in the account code or screens logs, so no key, answer or token reaches a log, analytics or a crash report', () => {
    for (const f of [
      ...cloudFiles,
      ...screens,
      join(root, 'src', 'account', 'QuestionFields.tsx'),
    ]) {
      expect(code(f), f).not.toMatch(/console\.\w+|Sentry|analytics|crashlytics/i);
    }
    expect(code(join(repo, 'supabase', 'functions', 'account', 'index.ts'))).not.toMatch(
      /console\.\w+/,
    );
  });

  it('the new screens ask for no email and no password, and keep answers out of autofill', () => {
    for (const f of screens) {
      const src = code(f);
      expect(src, f).not.toMatch(
        /keyboardType="email-address"|secureTextEntry|autoComplete="(email|password|new-password|username)"/,
      );
    }
    const fields = code(join(root, 'src', 'account', 'QuestionFields.tsx'));
    expect(fields).toMatch(/importantForAutofill: 'no'/);
    expect(fields).toMatch(/autoComplete: 'off'/);
  });

  it('the Recovery Key is never saved automatically: no photo library, no file, no analytics; sharing and copying are button presses', () => {
    const src = code(join(root, 'app', 'account', 'recovery-key.tsx'));
    expect(src).not.toMatch(
      /MediaLibrary|ImagePicker|FileSystem|captureRef|takeScreenshot|AsyncStorage/,
    );
    // The clipboard is written only inside the explicit copy handler.
    expect(src.match(/setStringAsync\(key\)/g)).toHaveLength(1);
    expect(src).toMatch(/const copy = async/);
  });

  it('only the preview-cloud profile enables cloud accounts, and nothing that can reach production does', () => {
    const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')) as {
      build: Record<string, { env?: Record<string, string> }>;
    };
    const enabled = Object.entries(eas.build).filter(
      ([, p]) => p.env?.EXPO_PUBLIC_CLOUD_ACCOUNTS !== undefined,
    );
    expect(enabled.map(([n]) => n)).toEqual(['preview-cloud']);
    expect(eas.build.production!.env).not.toHaveProperty('EXPO_PUBLIC_CLOUD_ACCOUNTS');
  });

  it('the Edge Function holds its secrets in the environment, not in the code', () => {
    const src = readFileSync(join(repo, 'supabase', 'functions', 'account', 'index.ts'), 'utf8');
    expect(src).toMatch(/env\('ACCOUNT_PEPPER'\)/);
    expect(src).toMatch(/env\('SUPABASE_SERVICE_ROLE_KEY'\)/);
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
});
