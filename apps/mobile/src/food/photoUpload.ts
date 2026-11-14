import { StoreError, type PhotoUpload } from '../data/types';

/** Mirrors the private `food-photos` bucket: JPEG only, 5 MB (5,242,880 bytes), each person confined to their own folder. */
export const PHOTO_BUCKET = 'food-photos';
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_CONTENT_TYPE = 'image/jpeg';

export type { PhotoUpload };

/** True when the bytes start with the JPEG signature (FF D8 FF): the declared type alone is not trusted. */
export function looksLikeJpeg(data: ArrayBuffer): boolean {
  if (data.byteLength < 3) return false;
  const b = new Uint8Array(data, 0, 3);
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/** Throws a StoreError (never a raw storage message) unless the photo is acceptable to upload. */
export function validatePhoto(p: PhotoUpload | undefined | null): asserts p is PhotoUpload {
  if (!p || !(p.data instanceof ArrayBuffer)) throw new StoreError('invalid_input', 'no photo');
  if (p.contentType.toLowerCase() !== PHOTO_CONTENT_TYPE)
    throw new StoreError('photo_invalid_type', 'only JPEG photos can be uploaded');
  if (p.data.byteLength === 0) throw new StoreError('invalid_input', 'empty photo');
  if (p.data.byteLength > PHOTO_MAX_BYTES)
    throw new StoreError('photo_too_large', 'photo is over 5 MB');
  if (!looksLikeJpeg(p.data))
    throw new StoreError('photo_invalid_type', 'photo is not a valid JPEG');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `<user-id>/<random-id>.jpg`: the folder is what the storage policy and the server both check. */
export function photoObjectPath(userId: string, objectId: string): string {
  if (!UUID.test(userId) || !UUID.test(objectId)) throw new StoreError('invalid_input', 'bad id');
  return `${userId}/${objectId}.jpg`;
}

export function newObjectId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
