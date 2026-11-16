// GENERATED from packages/shared/src/community-media.ts by scripts/sync-edge-core.mjs. Do not edit: change the source and run `node scripts/sync-edge-core.mjs`.
// Server-side checks for Community uploads. Pure functions over bytes, so they run in the Edge Function and in tests.
// The server never trusts the type or size a phone claims: it looks at the file itself, removes hidden metadata from images (location, camera, thumbnails),
// refuses oversized or location-tagged files, and only then lets a post use the file. People still review every photo and video before anyone else sees it.
import { COMMUNITY_LIMITS } from './community.ts';

export type SniffedMedia = { kind: 'photo' | 'video'; mime: string };

const at = (b: Uint8Array, i: number) => (i >= 0 && i < b.length ? b[i]! : -1);
const ascii = (b: Uint8Array, i: number, n: number) => {
  let s = '';
  for (let k = 0; k < n; k++) s += String.fromCharCode(at(b, i + k) & 0xff);
  return s;
};
const u32 = (b: Uint8Array, i: number) =>
  ((at(b, i) << 24) | (at(b, i + 1) << 16) | (at(b, i + 2) << 8) | at(b, i + 3)) >>> 0;
const u16 = (b: Uint8Array, i: number) => (at(b, i) << 8) | at(b, i + 1);
const le32 = (b: Uint8Array, i: number) =>
  (at(b, i) | (at(b, i + 1) << 8) | (at(b, i + 2) << 16) | (at(b, i + 3) << 24)) >>> 0;

/** What the file really is, from its first bytes. Null for anything not allowed. */
export function sniffMedia(b: Uint8Array): SniffedMedia | null {
  if (at(b, 0) === 0xff && at(b, 1) === 0xd8 && at(b, 2) === 0xff)
    return { kind: 'photo', mime: 'image/jpeg' };
  if (ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n') return { kind: 'photo', mime: 'image/png' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP')
    return { kind: 'photo', mime: 'image/webp' };
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (brand === 'qt  ') return { kind: 'video', mime: 'video/quicktime' };
    if (/^(isom|iso2|mp41|mp42|avc1|M4V |dash|MSNV|3gp\d)/.test(brand))
      return { kind: 'video', mime: 'video/mp4' };
  }
  return null;
}

/** The type a storage path promises, from its extension. */
export function mimeForPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase();
  return (
    (
      {
        jpg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
      } as Record<string, string>
    )[ext ?? ''] ?? null
  );
}

export interface ImageInfo {
  width: number;
  height: number;
}
/** Pixel size without decoding the image. Null when it cannot be read (the file is then refused). */
export function imageInfo(b: Uint8Array, mime: string): ImageInfo | null {
  if (mime === 'image/png') {
    if (ascii(b, 12, 4) !== 'IHDR') return null;
    return { width: u32(b, 16), height: u32(b, 20) };
  }
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (at(b, i) !== 0xff) return null;
      const m = at(b, i + 1);
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { height: u16(b, i + 5), width: u16(b, i + 7) };
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) {
        i += 2;
        continue;
      }
      if (m === 0xda || m === 0xd9) return null;
      i += 2 + u16(b, i + 2);
    }
    return null;
  }
  if (mime === 'image/webp') {
    const t = ascii(b, 12, 4);
    if (t === 'VP8X')
      return {
        width: 1 + (at(b, 24) | (at(b, 25) << 8) | (at(b, 26) << 16)),
        height: 1 + (at(b, 27) | (at(b, 28) << 8) | (at(b, 29) << 16)),
      };
    if (t === 'VP8 ')
      return {
        width: (at(b, 26) | (at(b, 27) << 8)) & 0x3fff,
        height: (at(b, 28) | (at(b, 29) << 8)) & 0x3fff,
      };
    if (t === 'VP8L') {
      const v = le32(b, 21);
      return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** JPEG: drop EXIF/XMP/ICC-adjacent application segments and comments (APP1-APP15, COM). Image data is untouched. Null if the structure is not a clean JPEG. */
function stripJpeg(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (at(b, i) !== 0xff) return null;
    const m = at(b, i + 1);
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xd9) {
      parts.push(b.subarray(i, i + 2));
      return concat(parts);
    }
    if (m === 0xda) {
      parts.push(b.subarray(i)); // scan data and everything after it
      return concat(parts);
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = u16(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe;
    if (!drop) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

/** PNG: keep only the chunks needed to draw the picture; drop text, EXIF and time chunks. */
const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'pHYs',
  'acTL',
  'fcTL',
  'fdAT',
]);
function stripPng(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let sawEnd = false;
  while (i + 12 <= b.length) {
    const len = u32(b, i);
    const type = ascii(b, i + 4, 4);
    if (i + 12 + len > b.length) return null;
    if (PNG_KEEP.has(type)) parts.push(b.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === 'IEND') {
      sawEnd = true;
      break;
    }
  }
  return sawEnd ? concat(parts) : null;
}

/** WebP: drop the EXIF and XMP chunks and clear their flags. */
function stripWebp(b: Uint8Array): Uint8Array | null {
  if (b.length < 20) return null;
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = le32(b, i + 4);
    const total = 8 + len + (len & 1);
    if (i + 8 + len > b.length) return null;
    if (type === 'EXIF' || type === 'XMP ') {
      i += total;
      continue;
    }
    let chunk = b.slice(i, Math.min(i + total, b.length));
    if (type === 'VP8X') chunk[8] = chunk[8]! & ~0x0c; // EXIF and XMP flags
    parts.push(chunk);
    i += total;
  }
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  out.set(body, 12);
  const size = out.length - 8;
  out[4] = size & 0xff;
  out[5] = (size >> 8) & 0xff;
  out[6] = (size >> 16) & 0xff;
  out[7] = (size >> 24) & 0xff;
  return out;
}

export function stripImageMetadata(b: Uint8Array, mime: string): Uint8Array | null {
  if (mime === 'image/jpeg') return stripJpeg(b);
  if (mime === 'image/png') return stripPng(b);
  if (mime === 'image/webp') return stripWebp(b);
  return null;
}

/** MP4/MOV: the movie header's duration in seconds, or null. */
export function videoDurationS(b: Uint8Array): number | null {
  for (let i = 4; i + 28 < b.length; i++) {
    if (at(b, i) === 0x6d && ascii(b, i, 4) === 'mvhd') {
      const v = at(b, i + 4);
      const timescale = v === 1 ? u32(b, i + 24) : u32(b, i + 16);
      const duration = v === 1 ? u32(b, i + 28) * 2 ** 32 + u32(b, i + 32) : u32(b, i + 20);
      return timescale > 0 ? duration / timescale : null;
    }
  }
  return null;
}
/** A recorded GPS position inside an MP4/MOV (the ©xyz box). Such files are refused so no one's location is published. */
export function videoHasLocation(b: Uint8Array): boolean {
  for (let i = 0; i + 4 <= b.length; i++)
    if (
      at(b, i) === 0xa9 &&
      at(b, i + 1) === 0x78 &&
      at(b, i + 2) === 0x79 &&
      at(b, i + 3) === 0x7a
    )
      return true;
  return false;
}

export type MediaVerdict =
  | { ok: true; mime: string; kind: 'photo' | 'video'; bytes: Uint8Array; durationS: number | null }
  | {
      ok: false;
      code:
        'wrong_type' | 'too_large' | 'too_long' | 'unreadable' | 'has_location' | 'too_many_pixels';
      reason: string;
    };

export const MAX_PIXELS = 24_000_000;
const no = (code: Extract<MediaVerdict, { ok: false }>['code'], reason: string): MediaVerdict => ({
  ok: false,
  code,
  reason,
});

/** Everything the server checks about an uploaded file. Returns the bytes to store (images are rewritten without metadata). */
export function checkUpload(expectedMime: string, b: Uint8Array): MediaVerdict {
  const seen = sniffMedia(b);
  if (!seen || seen.mime !== expectedMime)
    return no('wrong_type', 'That file is not the kind of photo or video we expected.');
  if (seen.kind === 'photo') {
    if (b.length > COMMUNITY_LIMITS.photoMB * 1024 * 1024)
      return no('too_large', `Photos can be up to ${COMMUNITY_LIMITS.photoMB} MB.`);
    const info = imageInfo(b, seen.mime);
    if (!info || info.width < 1 || info.height < 1)
      return no('unreadable', 'We could not read that photo.');
    if (info.width * info.height > MAX_PIXELS)
      return no('too_many_pixels', 'That photo is too large. Choose a smaller one.');
    const clean = stripImageMetadata(b, seen.mime);
    if (!clean || !imageInfo(clean, seen.mime))
      return no('unreadable', 'We could not read that photo.');
    return { ok: true, mime: seen.mime, kind: 'photo', bytes: clean, durationS: null };
  }
  if (b.length > COMMUNITY_LIMITS.videoMB * 1024 * 1024)
    return no('too_large', `Videos can be up to ${COMMUNITY_LIMITS.videoMB} MB.`);
  const d = videoDurationS(b);
  if (d === null || d <= 0) return no('unreadable', 'We could not read that video.');
  if (d > COMMUNITY_LIMITS.videoSeconds + 0.5)
    return no('too_long', `Videos can be up to ${COMMUNITY_LIMITS.videoSeconds} seconds.`);
  if (videoHasLocation(b))
    return no(
      'has_location',
      'That video has a location saved inside it. Export or trim it again without location, then retry.',
    );
  return { ok: true, mime: seen.mime, kind: 'video', bytes: b, durationS: Math.round(d * 10) / 10 };
}
