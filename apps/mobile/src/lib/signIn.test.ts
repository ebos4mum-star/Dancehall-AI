import { describe, expect, it } from 'vitest';
import { isCompleteCode, isValidEmail, normalizeCode, normalizeEmail } from './signIn';

describe('sign-in helpers', () => {
  it('validates emails', () => {
    for (const ok of ['a@b.co', ' dancer@example.com ', 'a.b+c@mail.example.org'])
      expect(isValidEmail(ok)).toBe(true);
    for (const bad of ['', 'a', 'a@', '@b.co', 'a@b', 'a@b.', 'a b@c.co', 'a@@b.co', 'a@.co'])
      expect(isValidEmail(bad)).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });
  it('normalizes emails', () => expect(normalizeEmail('  A@B.Co ')).toBe('a@b.co'));
  it('normalizes pasted codes to digits only, max 8', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('12-34-56')).toBe('123456');
    expect(normalizeCode('abc')).toBe('');
    expect(normalizeCode('123456789')).toBe('12345678');
  });
  it('knows when a code is complete', () => {
    expect(isCompleteCode('12345')).toBe(false);
    expect(isCompleteCode('123456')).toBe(true);
    expect(isCompleteCode('12345678')).toBe(true);
    expect(isCompleteCode('12a456')).toBe(false);
  });
});
