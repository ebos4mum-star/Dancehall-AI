import { describe, expect, it } from 'vitest';
import { StoreError } from '../data/types';
import {
  PHOTO_MAX_BYTES,
  looksLikeJpeg,
  newObjectId,
  photoObjectPath,
  validatePhoto,
} from './photoUpload';

const jpeg = (n = 10) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff]);
  return b.buffer;
};
const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof StoreError ? e.code : 'other';
  }
};
const U = '123e4567-e89b-42d3-a456-426614174000';

describe('photo validation', () => {
  it('accepts a small JPEG', () => {
    expect(code(() => validatePhoto({ data: jpeg(), contentType: 'image/jpeg' }))).toBeNull();
    expect(code(() => validatePhoto({ data: jpeg(), contentType: 'IMAGE/JPEG' }))).toBeNull();
  });
  it('accepts exactly the 5 MB limit and refuses one byte more', () => {
    expect(
      code(() => validatePhoto({ data: jpeg(PHOTO_MAX_BYTES), contentType: 'image/jpeg' })),
    ).toBeNull();
    expect(
      code(() => validatePhoto({ data: jpeg(PHOTO_MAX_BYTES + 1), contentType: 'image/jpeg' })),
    ).toBe('photo_too_large');
  });
  it('refuses other content types, even with JPEG bytes', () => {
    for (const t of ['image/png', 'image/heic', 'application/pdf', 'text/html', ''])
      expect(code(() => validatePhoto({ data: jpeg(), contentType: t }))).toBe(
        'photo_invalid_type',
      );
  });
  it('refuses bytes that are not a JPEG, whatever the declared type', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer;
    expect(code(() => validatePhoto({ data: png, contentType: 'image/jpeg' }))).toBe(
      'photo_invalid_type',
    );
    expect(looksLikeJpeg(new ArrayBuffer(2))).toBe(false);
  });
  it('refuses missing, empty or non-buffer input', () => {
    expect(code(() => validatePhoto(undefined))).toBe('invalid_input');
    expect(code(() => validatePhoto({ data: new ArrayBuffer(0), contentType: 'image/jpeg' }))).toBe(
      'invalid_input',
    );
    expect(
      code(() => validatePhoto({ data: 'x' as unknown as ArrayBuffer, contentType: 'image/jpeg' })),
    ).toBe('invalid_input');
  });
});

describe('object paths', () => {
  it('is <user-id>/<id>.jpg', () => {
    expect(photoObjectPath(U, U)).toBe(`${U}/${U}.jpg`);
  });
  it('rejects anything that could escape the person’s folder', () => {
    expect(code(() => photoObjectPath('../other', U))).toBe('invalid_input');
    expect(code(() => photoObjectPath(U, '../../x'))).toBe('invalid_input');
    expect(code(() => photoObjectPath(`${U}/x`, U))).toBe('invalid_input');
  });
  it('generates valid, distinct ids', () => {
    const a = newObjectId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newObjectId()).not.toBe(a);
  });
});
