import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('uses the first letters of the first two words', () => {
    expect(initials('Ama Kofi')).toBe('AK');
    expect(initials('  sam  ')).toBe('S');
    expect(initials('Mary Jane Watson')).toBe('MJ');
  });
  it('handles missing names and non-latin or emoji starts', () => {
    expect(initials(null)).toBe('?');
    expect(initials('   ')).toBe('?');
    expect(initials('édith piaf')).toBe('ÉP');
    expect(initials('🔥 Fire')).toBe('🔥F');
  });
});
