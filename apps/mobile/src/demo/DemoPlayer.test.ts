import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The player draws shared rules; these guard the mistakes that cannot be seen from the rules alone. */
const src = readFileSync(join(__dirname, 'DemoPlayer.tsx'), 'utf8');

describe('DemoPlayer source guards', () => {
  it('hands the surface controls over through a ref, never state (state here re-renders in a loop)', () => {
    expect(src).not.toMatch(/useState<SurfaceControl/);
    expect(src).toMatch(/useRef<SurfaceControl/);
  });
  it('never autoplays or loops', () => {
    expect(src).toMatch(/p\.loop = false/);
    expect(src).not.toMatch(
      /\.play\(\)\s*;?\s*\n?\s*}\s*,\s*\[player\]\s*\)\s*;?\s*\n?\s*useEffect\(\(\) => \{\s*player\.play/,
    );
    expect(src).not.toMatch(/autoPlay|shouldPlay/);
  });
  it('keeps the written instructions to its callers and always offers captions and a way to replay', () => {
    expect(src).toMatch(/demo\.captions/);
    expect(src).toMatch(/demo\.replay/);
    expect(src).toMatch(/demo\.reduced/);
  });
  it('labels drafts and falls back in words', () => {
    expect(src).toMatch(/demo\.draftBadge/);
    expect(src).toMatch(/demo\.none/);
    expect(src).toMatch(/demo\.missing/);
  });
});
