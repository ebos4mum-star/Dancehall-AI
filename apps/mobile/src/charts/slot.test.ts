import { describe, expect, it } from 'vitest';
import { slotAt } from './data';
describe('slotAt', () => {
  it('maps touch x to a slot, clamped', () => {
    expect(slotAt(0, 300, 7)).toBe(0);
    expect(slotAt(299, 300, 7)).toBe(6);
    expect(slotAt(-20, 300, 7)).toBe(0);
    expect(slotAt(999, 300, 7)).toBe(6);
    expect(slotAt(150, 300, 7)).toBe(3);
    expect(slotAt(10, 0, 3)).toBe(2);
  });
});
