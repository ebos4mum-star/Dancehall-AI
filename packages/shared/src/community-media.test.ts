import { describe, expect, it } from 'vitest';
import {
  checkUpload,
  imageInfo,
  mimeForPath,
  sniffMedia,
  stripImageMetadata,
  videoDurationS,
  videoHasLocation,
} from './community-media';

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const cat = (...p: Uint8Array[]) => {
  const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of p) (o.set(x, i), (i += x.length));
  return o;
};
const be32 = (n: number) =>
  Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
const be16 = (n: number) => Uint8Array.of((n >> 8) & 255, n & 255);

// A tiny valid-looking JPEG: SOI, EXIF (APP1) with GPS text, COM, DQT-ish, SOF0 (8x6), SOS + data, EOI.
const exifData = enc('Exif\0\0GPS-12.34,56.78!');
const exif = cat(Uint8Array.of(0xff, 0xe1), be16(2 + exifData.length), exifData);
const com = cat(Uint8Array.of(0xff, 0xfe), be16(2 + 5), enc('hello'));
const app0 = cat(Uint8Array.of(0xff, 0xe0), be16(2 + 5), enc('JFIF\0'));
const sof = cat(
  Uint8Array.of(0xff, 0xc0),
  be16(11),
  Uint8Array.of(8),
  be16(6),
  be16(8),
  Uint8Array.of(1, 1, 0x11, 0),
);
const sos = cat(
  Uint8Array.of(0xff, 0xda),
  be16(4),
  Uint8Array.of(0, 0),
  Uint8Array.of(1, 2, 3, 4),
  Uint8Array.of(0xff, 0xd9),
);
const jpeg = cat(Uint8Array.of(0xff, 0xd8), app0, exif, com, sof, sos);

const chunk = (type: string, data: Uint8Array) => cat(be32(data.length), enc(type), data, be32(0));
const png = (extra = new Uint8Array()) =>
  cat(
    enc('\x89PNG\r\n\x1a\n'),
    chunk('IHDR', cat(be32(10), be32(7), Uint8Array.of(8, 2, 0, 0, 0))),
    extra,
    chunk('IDAT', Uint8Array.of(1, 2, 3)),
    chunk('IEND', new Uint8Array()),
  );

const box = (type: string, payload: Uint8Array) =>
  cat(be32(8 + payload.length), enc(type), payload);
const mvhd = (timescale: number, duration: number) =>
  box(
    'mvhd',
    cat(
      Uint8Array.of(0, 0, 0, 0),
      be32(0),
      be32(0),
      be32(timescale),
      be32(duration),
      new Uint8Array(80),
    ),
  );
const mp4 = (seconds: number, extra = new Uint8Array()) =>
  cat(
    box('ftyp', cat(enc('isom'), be32(0), enc('isom'))),
    box('moov', cat(mvhd(1000, seconds * 1000), extra)),
    box('mdat', new Uint8Array(32)),
  );

describe('sniffMedia', () => {
  it('recognises allowed files by content, not by name', () => {
    expect(sniffMedia(jpeg)).toEqual({ kind: 'photo', mime: 'image/jpeg' });
    expect(sniffMedia(png())).toEqual({ kind: 'photo', mime: 'image/png' });
    expect(sniffMedia(mp4(5))).toEqual({ kind: 'video', mime: 'video/mp4' });
  });
  it('refuses anything else, including scripts and disguised executables', () => {
    for (const s of [
      '<html><script>alert(1)</script>',
      'MZ\x90\x00',
      '#!/bin/sh\n',
      'GIF89a',
      '%PDF-1.7',
    ])
      expect(sniffMedia(enc(s))).toBeNull();
    expect(sniffMedia(new Uint8Array())).toBeNull();
  });
  it('maps a storage path to its promised type', () => {
    expect(mimeForPath('u/x/y.jpg')).toBe('image/jpeg');
    expect(mimeForPath('u/x/y.mov')).toBe('video/quicktime');
    expect(mimeForPath('u/x/y.exe')).toBeNull();
  });
});

describe('image metadata', () => {
  it('removes EXIF, comments and other application segments from a JPEG, keeps the picture', () => {
    const clean = stripImageMetadata(jpeg, 'image/jpeg')!;
    expect(clean).not.toBeNull();
    const text = Array.from(clean, (c) => String.fromCharCode(c)).join('');
    expect(text).not.toContain('Exif');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('hello');
    expect(imageInfo(clean, 'image/jpeg')).toEqual({ width: 8, height: 6 });
    expect(clean.length).toBeLessThan(jpeg.length);
  });
  it('removes text and EXIF chunks from a PNG', () => {
    const dirty = png(cat(chunk('tEXt', enc('GPS=1,2')), chunk('eXIf', enc('secret'))));
    const clean = stripImageMetadata(dirty, 'image/png')!;
    const text = Array.from(clean, (c) => String.fromCharCode(c)).join('');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('secret');
    expect(imageInfo(clean, 'image/png')).toEqual({ width: 10, height: 7 });
  });
  it('removes EXIF and XMP chunks from a WebP and fixes the length', () => {
    const c = (t: string, d: Uint8Array) =>
      cat(
        enc(t),
        Uint8Array.of(d.length & 255, 0, 0, 0),
        d,
        d.length % 2 ? Uint8Array.of(0) : new Uint8Array(),
      );
    const vp8x = c(
      'VP8X',
      cat(Uint8Array.of(0x0c, 0, 0, 0), Uint8Array.of(9, 0, 0), Uint8Array.of(5, 0, 0)),
    );
    const body = cat(
      vp8x,
      c('EXIF', enc('GPS!')),
      c('XMP ', enc('xmp!')),
      c('VP8 ', new Uint8Array(10)),
    );
    const file = cat(enc('RIFF'), Uint8Array.of(body.length + 4, 0, 0, 0), enc('WEBP'), body);
    const clean = stripImageMetadata(file, 'image/webp')!;
    const text = Array.from(clean, (x) => String.fromCharCode(x)).join('');
    expect(text).not.toContain('GPS');
    expect(text).not.toContain('xmp!');
    expect(clean[20]! & 0x0c).toBe(0);
    expect(clean[4]! + (clean[5]! << 8)).toBe(clean.length - 8);
  });
  it('refuses a truncated or malformed image', () => {
    expect(stripImageMetadata(jpeg.subarray(0, 20), 'image/jpeg')).toBeNull();
    expect(stripImageMetadata(png().subarray(0, 30), 'image/png')).toBeNull();
  });
});

describe('video checks', () => {
  it('reads the duration', () => expect(videoDurationS(mp4(12))).toBeCloseTo(12, 1));
  it('detects a recorded location', () => {
    expect(videoHasLocation(mp4(5))).toBe(false);
    expect(videoHasLocation(mp4(5, box('\xa9xyz', enc('+05.6037-000.1870/'))))).toBe(true);
  });
});

describe('checkUpload', () => {
  it('accepts a clean photo and returns it without metadata', () => {
    const v = checkUpload('image/jpeg', jpeg);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.bytes.length).toBeLessThan(jpeg.length);
  });
  it('refuses a file that is not what the ticket promised', () => {
    expect(checkUpload('image/png', jpeg)).toMatchObject({ ok: false, code: 'wrong_type' });
    expect(checkUpload('image/jpeg', enc('<script>'))).toMatchObject({
      ok: false,
      code: 'wrong_type',
    });
    expect(checkUpload('video/mp4', jpeg)).toMatchObject({ ok: false, code: 'wrong_type' });
  });
  it('refuses oversized pictures and decompression bombs', () => {
    const huge = Uint8Array.from(jpeg);
    expect(checkUpload('image/jpeg', cat(jpeg, new Uint8Array(9 * 1024 * 1024)))).toMatchObject({
      ok: false,
      code: 'too_large',
    });
    const bomb = cat(
      enc('\x89PNG\r\n\x1a\n'),
      chunk('IHDR', cat(be32(60000), be32(60000), Uint8Array.of(8, 2, 0, 0, 0))),
      chunk('IEND', new Uint8Array()),
    );
    expect(checkUpload('image/png', bomb)).toMatchObject({ ok: false, code: 'too_many_pixels' });
    expect(huge.length).toBeGreaterThan(0);
  });
  it('accepts a short video, refuses a long one and one with a location', () => {
    expect(checkUpload('video/mp4', mp4(20))).toMatchObject({
      ok: true,
      kind: 'video',
      durationS: 20,
    });
    expect(checkUpload('video/mp4', mp4(45))).toMatchObject({ ok: false, code: 'too_long' });
    expect(checkUpload('video/mp4', mp4(5, box('\xa9xyz', enc('+05.6-000.1/'))))).toMatchObject({
      ok: false,
      code: 'has_location',
    });
    expect(
      checkUpload(
        'video/mp4',
        cat(box('ftyp', cat(enc('isom'), be32(0))), box('mdat', new Uint8Array(8))),
      ),
    ).toMatchObject({ ok: false, code: 'unreadable' });
  });
});
