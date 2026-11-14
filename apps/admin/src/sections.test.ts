import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@dancehall/shared';
import { SECTIONS, findSection } from './sections';

describe('admin sections', () => {
  it('use valid permissions that at least one role holds', () => {
    for (const s of SECTIONS) {
      expect(PERMISSIONS).toContain(s.permission);
      expect(Object.values(ROLE_PERMISSIONS).some((p) => p.includes(s.permission))).toBe(true);
    }
  });
  it('have unique slugs and prepare every approved admin area', () => {
    expect(new Set(SECTIONS.map((s) => s.slug)).size).toBe(SECTIONS.length);
    for (const slug of ['content', 'licensing', 'moderation', 'flags', 'ai-costs', 'audit'])
      expect(findSection(slug)).toBeDefined();
  });
});
