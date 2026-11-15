import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_MONTHLY_BUDGET_USD } from '@dancehall/shared';
import { PLACEHOLDER_PRICES } from './cost';
import { newBudget } from './budget';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist' || f === '.expo') return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const src = (root: string) =>
  walk(root).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f));
const read = (f: string) => readFileSync(f, 'utf8');
const repo = join(__dirname, '..', '..', '..');

describe('no paid provider or live cloud service is wired in', () => {
  it('only mock models are priced, and the ceiling is $50', () => {
    expect(Object.keys(PLACEHOLDER_PRICES).every((m) => m.startsWith('mock-'))).toBe(true);
    expect(DEFAULT_AI_MONTHLY_BUDGET_USD).toBe(50);
    expect(newBudget().ceilingUsd).toBe(50);
  });
  it('AI package source never calls a provider API or the network', () => {
    for (const f of src(join(repo, 'packages', 'ai', 'src'))) {
      const t = read(f);
      expect(t, f).not.toMatch(
        /api\.(anthropic|openai)\.com|@anthropic-ai|openai|generativelanguage|\bfetch\(|XMLHttpRequest/i,
      );
    }
  });
  it('the app never references a service-role or secret key', () => {
    for (const f of src(join(repo, 'apps', 'mobile', 'src')).concat(
      src(join(repo, 'apps', 'mobile', 'app')),
    )) {
      if (f.endsWith('lib/env.ts')) continue; // the guard that REFUSES such keys
      expect(read(f), f).not.toMatch(/service_role|SERVICE_ROLE|sb_secret_/);
    }
  });
  it("the app only talks to the AI service through the optional, https-only gateway URL (plus its own project's account function)", () => {
    const hits = src(join(repo, 'apps', 'mobile', 'src')).filter((f) =>
      /\bfetch\(|fetchImpl \?\? fetch/.test(read(f)),
    );
    expect(hits.map((f) => f.split('/').pop())).toEqual(['accountApi.ts', 'supabaseCoach.ts']);
    // The one extra caller reaches only the configured project's `account` Edge Function, never another host.
    const account = read(hits.find((f) => f.endsWith('accountApi.ts'))!);
    expect(account).toMatch(/\/functions\/v1\/account\//);
    expect(account.match(/https?:\/\//g) ?? []).toEqual([]);
  });
  it('the server handlers default to the mock provider label', () => {
    const t = read(join(repo, 'packages', 'ai', 'src', 'provider.ts'));
    expect(t).toMatch(/class MockAiProvider/);
    expect(t).not.toMatch(/class \w*(Anthropic|OpenAI|Live)\w*Provider/);
  });
  it('the database never lets a person write assistant text, usage, budget or kill switches', () => {
    const sql = read(join(repo, 'supabase', 'migrations', '20261204000100_coach.sql'));
    expect(sql).toMatch(/revoke all on public\.ai_budget from anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.ai_usage_events to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update)[^;]*on public\.ai_usage_events/);
    expect(sql).toMatch(/role = 'user'/);
  });
});

describe('service-role credentials and configuration', () => {
  it('no mobile config or env template contains a service-role or secret key', () => {
    for (const f of [
      'apps/mobile/app.json',
      'apps/mobile/app.config.ts',
      'apps/mobile/eas.json',
      'apps/mobile/.env.example',
    ]) {
      try {
        expect(read(join(repo, f)), f).not.toMatch(
          /service_role|SERVICE_ROLE|sb_secret_|eyJ[A-Za-z0-9_-]{20,}\./,
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
  });
  it('the root env template lists server secrets only as EMPTY server-side variables, never as EXPO_PUBLIC_*', () => {
    const lines = read(join(repo, '.env.example'))
      .split('\n')
      .filter((l) => l && !l.startsWith('#'));
    for (const l of lines) {
      const [k, ...v] = l.split('=');
      if (/SERVICE_ROLE|SECRET|PRIVATE/i.test(k!)) {
        expect(k, l).not.toMatch(/^EXPO_PUBLIC_/);
        expect(v.join('='), l).toBe('');
      }
    }
  });
  it('the exported web bundle (if built) contains no secret key material', () => {
    const dist = join(repo, 'apps', 'mobile', 'dist');
    let files: string[] = [];
    try {
      files = walk(dist).filter((f) => f.endsWith('.js'));
    } catch {
      return; // not built: the e2e script covers the bundle
    }
    for (const f of files) expect(read(f), f).not.toMatch(/sb_secret_[A-Za-z0-9_]{10,}/);
  });
  it('only server-side modules may import the service-role-oriented adapters', () => {
    const importers = src(join(repo, 'apps', 'mobile')).filter((f) =>
      /supabase-repo|supabase-ports|server\/handlers/.test(read(f)),
    );
    expect(importers).toEqual([]);
  });
});
