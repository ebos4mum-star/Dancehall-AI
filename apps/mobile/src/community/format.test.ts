import { describe, expect, it } from 'vitest';
import { mimeFromUri, timeAgo } from './format';

const NOW = new Date('2026-06-15T12:00:00Z');
describe('timeAgo', () => {
  it('is short and gentle', () => {
    expect(timeAgo('2026-06-15T11:59:40Z', NOW)).toBe('just now');
    expect(timeAgo('2026-06-15T11:55:00Z', NOW)).toBe('5m');
    expect(timeAgo('2026-06-15T09:00:00Z', NOW)).toBe('3h');
    expect(timeAgo('2026-06-13T12:00:00Z', NOW)).toBe('2d');
    expect(timeAgo('2026-05-01T12:00:00Z', NOW)).toBe('2026-05-01');
    expect(timeAgo('nonsense', NOW)).toBe('');
    expect(timeAgo('2026-06-15T12:05:00Z', NOW)).toBe('just now');
  });
});
describe('mimeFromUri', () => {
  it('uses the extension, with safe defaults', () => {
    expect(mimeFromUri('file:///a/b.PNG', 'photo')).toBe('image/png');
    expect(mimeFromUri('file:///a/b.mov?x=1', 'video')).toBe('video/quicktime');
    expect(mimeFromUri('blob:abc', 'photo')).toBe('image/jpeg');
    expect(mimeFromUri('blob:abc', 'video')).toBe('video/mp4');
  });
});
