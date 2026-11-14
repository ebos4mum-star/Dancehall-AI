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
