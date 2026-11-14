import { describe, expect, it } from 'vitest';
import { cleanDisplayName } from './displayName';

describe('cleanDisplayName', () => {
  it('trims and collapses whitespace', () => expect(cleanDisplayName('  Ama   K  ')).toBe('Ama K'));
  it('rejects empty and over-long names', () => {
    expect(cleanDisplayName('   ')).toBeNull();
    expect(cleanDisplayName('')).toBeNull();
    expect(cleanDisplayName('x'.repeat(41))).toBeNull();
    expect(cleanDisplayName('x'.repeat(40))).toHaveLength(40);
  });
});
