import { describe, expect, it } from 'vitest';
import { WORKOUTS } from '@dancehall/shared';
import { exampleTerritoryTable, sampleReadiness } from './readiness';

describe('admin publication foundations', () => {
  it('shows that no sample workout is ready for public release, for the right reason', () => {
    const rows = sampleReadiness();
    expect(rows).toHaveLength(WORKOUTS.length);
    for (const r of rows) {
      expect(r.check.ok).toBe(false);
      expect(r.check.items.find((i) => i.id === 'original')!.passed).toBe(false);
      expect(r.check.items.find((i) => i.id === 'review')!.passed).toBe(false);
      // structure and safety are already sound, so the remaining work is review and real content
      expect(r.check.items.find((i) => i.id === 'structure')!.passed).toBe(true);
      expect(r.check.items.find((i) => i.id === 'safety')!.passed).toBe(true);
    }
  });
  it('evaluates territory and dates for the illustrative licence', () => {
    const t = Object.fromEntries(
      exampleTerritoryTable().map((r) => [`${r.country}@${r.today}`, r.allowed]),
    );
    expect(t).toEqual({
      'GH@2026-06-01': true,
      'US@2026-06-01': false,
      'GB@2027-01-01': false,
      'NG@2025-12-31': false,
    });
  });
});
