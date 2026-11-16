import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Expo inlines only static `process.env.EXPO_PUBLIC_*` references. A variable that resolveConfig reads but readConfig does not spell out can never be set in a real build.
describe('every build variable resolveConfig understands is passed in by readConfig', () => {
  const env = readFileSync(join(__dirname, '../lib/env.ts'), 'utf8');
  const store = readFileSync(join(__dirname, 'createStore.ts'), 'utf8');
  const wanted = [...new Set([...env.matchAll(/env\.(EXPO_PUBLIC_[A-Z_]+)/g)].map((m) => m[1]!))];
  it('finds the variables', () => expect(wanted.length).toBeGreaterThan(6));
  for (const v of wanted) it(v, () => expect(store).toContain(`${v}: process.env.${v}`));
});
