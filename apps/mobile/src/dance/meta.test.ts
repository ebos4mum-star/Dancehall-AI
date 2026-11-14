import { describe, expect, it } from 'vitest';
import { DANCE_STYLES } from '@dancehall/shared';
import { contrastRatio } from '../theme/tokens';
import { EFFORT_CHOICES, STYLE_META, effortKey, mmss } from './meta';

describe('dance style cards', () => {
  it('cover every style with white text meeting WCAG AA on both gradient stops', () => {
    for (const s of DANCE_STYLES) {
      expect(STYLE_META[s], s).toBeDefined();
      expect(contrastRatio('#FFFFFF', STYLE_META[s].from), `${s} from`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#FFFFFF', STYLE_META[s].to), `${s} to`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('formats time and maps effort', () => {
    expect(mmss(0)).toBe('0:00');
    expect(mmss(65)).toBe('1:05');
    expect(mmss(600)).toBe('10:00');
    expect(mmss(-4)).toBe('0:00');
    expect(effortKey(null)).toBeNull();
    expect(effortKey(2)).toBe('easy');
    expect(effortKey(6)).toBe('hard');
    expect(effortKey(10)).toBe('veryHard');
    for (const e of EFFORT_CHOICES) expect(effortKey(e.value)).toBe(e.key);
  });
});
