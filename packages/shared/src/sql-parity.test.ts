import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GOAL_PERIODS,
  GOAL_TYPES,
  MIN_USER_AGE_YEARS,
  PROVISIONAL_LIMITS,
  consentPurposeSchema,
} from './index';

const dir = new URL('../../../supabase/migrations/', import.meta.url).pathname;
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

describe('SQL and TypeScript stay in step', () => {
  it('safety limits are identical', () => {
    const m = /safety_limits\(\)[\s\S]*?select '(\{[^']+\})'::jsonb/.exec(sql);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]!)).toEqual({
      min_age_years: MIN_USER_AGE_YEARS,
      min_target_bmi: PROVISIONAL_LIMITS.minTargetBmi,
      max_weekly_loss_fraction: PROVISIONAL_LIMITS.maxWeeklyLossFraction,
      max_weekly_gain_fraction: PROVISIONAL_LIMITS.maxWeeklyGainFraction,
    });
  });
  const listFor = (re: RegExp): string[] => {
    const m = re.exec(sql);
    expect(m, String(re)).not.toBeNull();
    return [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
  };
  it('consent purposes match', () => {
    expect(listFor(/purpose text not null check \(purpose in \(([^)]*)\)/).sort()).toEqual(
      [...consentPurposeSchema.options].sort(),
    );
  });
  it('goal types and periods match', () => {
    expect(listFor(/type text not null check \(type in \(([^)]*)\)/)).toEqual([...GOAL_TYPES]);
    expect(listFor(/period text not null check \(period in \(([^)]*)\)/)).toEqual([
      ...GOAL_PERIODS,
    ]);
  });
});

import { ROLE_PERMISSIONS, STAFF_ROLES } from './index';

describe('staff permissions match the database', () => {
  it('app.role_permissions equals ROLE_PERMISSIONS for every role', () => {
    const fn = /function app\.role_permissions[\s\S]*?end\s*\$\$/.exec(sql)?.[0];
    expect(fn).toBeDefined();
    for (const role of STAFF_ROLES) {
      const m = new RegExp(`when '${role}' then array\\[([^\\]]*)\\]`).exec(fn!);
      expect(m, role).not.toBeNull();
      const perms = [...m![1]!.matchAll(/'([a-z_.]+)'/g)].map((x) => x[1]!);
      expect(perms.sort(), role).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
    const roles =
      /role in \(([^)]*)\)\)/.exec(
        sql.slice(sql.indexOf('create table public.staff_roles')),
      )?.[1] ?? '';
    expect([...roles.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!).sort()).toEqual(
      [...STAFF_ROLES].sort(),
    );
  });
  it('workout styles, levels and intensities match the catalog constraints', async () => {
    const { DANCE_STYLES, LEVELS, INTENSITIES } = await import('./index');
    const grab = (col: string) =>
      [
        ...new RegExp(`${col} text not null check \\(${col} in \\(([^)]*)\\)`)
          .exec(sql.slice(sql.indexOf('create table public.workouts')))![1]!
          .matchAll(/'([a-z_]+)'/g),
      ].map((x) => x[1]!);
    expect(grab('style')).toEqual([...DANCE_STYLES]);
    expect(grab('level')).toEqual([...LEVELS]);
    expect(grab('intensity')).toEqual([...INTENSITIES]);
  });
});
