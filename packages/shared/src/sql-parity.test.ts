import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_STYLES,
  GOAL_PERIODS,
  LIVE_STYLES,
  WORKOUTS,
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
  /** The style list the database enforces: the LAST definition across all migrations (a later migration may replace the check). */
  const dbStyles = (): string[] => {
    const created = /style text not null check \(style in \(([^)]*)\)/.exec(
      sql.slice(sql.indexOf('create table public.workouts')),
    );
    let list = created![1]!;
    for (const m of sql.matchAll(/workouts_style_check\s+check \(style in \(([^)]*)\)\)/g))
      list = m[1]!;
    return [...list.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
  };
  it('workout styles, levels and intensities match the catalog constraints', async () => {
    const { LEVELS, INTENSITIES } = await import('./index');
    const grab = (col: string) =>
      [
        ...new RegExp(`${col} text not null check \\(${col} in \\(([^)]*)\\)`)
          .exec(sql.slice(sql.indexOf('create table public.workouts')))![1]!
          .matchAll(/'([a-z_]+)'/g),
      ].map((x) => x[1]!);
    // The styles the app offers are exactly the styles the database accepts today (the latest definition).
    expect(dbStyles()).toEqual([...LIVE_STYLES]);
    expect(grab('level')).toEqual([...LEVELS]);
    expect(grab('intensity')).toEqual([...INTENSITIES]);
  });
  it('every style the database accepts is known to the code, and every bundled workout uses a style the database accepts', () => {
    for (const s of dbStyles()) expect(ALL_STYLES as readonly string[], s).toContain(s);
    for (const w of WORKOUTS) expect(dbStyles(), `${w.id} (${w.style})`).toContain(w.style);
  });
  it('the proposed M3 v2 migration allows exactly the styles the code knows, its rollback restores exactly the live ones, and it is not in the migrations folder', () => {
    const read = (f: string) =>
      readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'proposed', f), 'utf8');
    const styles = (sqlText: string) => {
      const m = /workouts_style_check\s+check \(style in \(([^)]*)\)\)/.exec(
        sqlText.replace(/\s+/g, ' '),
      );
      return [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    };
    expect(styles(read('m3v2_workout_styles.up.sql')).sort()).toEqual([...ALL_STYLES].sort());
    expect(styles(read('m3v2_workout_styles.down.sql')).sort()).toEqual([...LIVE_STYLES].sort());
    const migrations = readdirSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations'));
    expect(migrations.some((f) => /style/.test(f))).toBe(false); // not applied, not a migration, until the owner approves it
  });
});
