import { beforeEach, describe, expect, it } from 'vitest';
import { dismissMoment, getMoment, resetMomentsForTest, showMoment } from './moment';

beforeEach(resetMomentsForTest);
describe('Pulse moments', () => {
  it('shows one moment at a time and a newer one replaces an older one', () => {
    const a = showMoment('Saved', 'celebrate');
    const b = showMoment('Goal set', 'welcome');
    expect(getMoment()).toMatchObject({ id: b, message: 'Goal set', state: 'welcome' });
    expect(b).toBeGreaterThan(a);
  });
  it('a late timer for an old moment cannot close the newer one', () => {
    const a = showMoment('one');
    const b = showMoment('two');
    dismissMoment(a);
    expect(getMoment()?.id).toBe(b);
    dismissMoment(b);
    expect(getMoment()).toBeNull();
    dismissMoment();
    expect(getMoment()).toBeNull();
  });
});
