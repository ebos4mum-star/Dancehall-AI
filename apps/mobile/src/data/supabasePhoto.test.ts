/** Photo upload adapter against recording fakes: no network, no real project, synthetic bytes only. */
import { describe, expect, it, vi } from 'vitest';
import { createPhotoAdapter } from './supabasePhoto';
import { StoreError, type PhotoUpload } from './types';

const U = '123e4567-e89b-42d3-a456-426614174000';
const OBJ = '223e4567-e89b-42d3-a456-426614174001';
const jpeg = (): PhotoUpload => {
  const b = new Uint8Array(32);
  b.set([0xff, 0xd8, 0xff]);
  return { data: b.buffer, contentType: 'image/jpeg' };
};
const RESULT = { analysisId: 'a1', provider: 'mock', items: [], notes: null };

function setup(
  o: {
    user?: { id: string } | null;
    consents?: Partial<Record<string, boolean>>;
    uploadError?: { message?: string; statusCode?: string } | null;
    uploadThrows?: boolean;
    server?: { ok: boolean; json: unknown } | 'network';
    aiApiUrl?: string | null;
  } = {},
) {
  const upload = vi.fn(async () => {
    if (o.uploadThrows) throw new Error('socket hang up: secret-host.internal');
    return { error: o.uploadError ?? null };
  });
  const remove = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ upload, remove }));
  const db = {
    auth: {
      getUser: async () => ({ data: { user: o.user === undefined ? { id: U } : o.user } }),
      getSession: async () => ({ data: { session: { access_token: 'tok-synthetic' } } }),
    },
    storage: { from },
  };
  const fetchImpl = vi.fn(async () => {
    if (o.server === 'network') throw new Error('offline');
    const s = o.server ?? { ok: true, json: RESULT };
    return { ok: s.ok, json: async () => s.json } as unknown as Response;
  });
  const emit = vi.fn();
  const adapter = createPhotoAdapter({
    db: db as never,
    base: {
      getConsents: async () =>
        ({
          health_data_processing: true,
          ai_processing_of_food_photos: true,
          ...o.consents,
        }) as never,
    },
    aiApiUrl: o.aiApiUrl === null ? undefined : (o.aiApiUrl ?? 'https://ai.example.test'),
    fetchImpl: fetchImpl as never,
    newId: () => OBJ,
    emit,
  });
  return { adapter, upload, remove, from, fetchImpl, emit };
}
const code = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof StoreError ? e.code : `other:${String(e)}`),
  );

describe('photo upload adapter', () => {
  it('offers no photo analysis (and uploads nothing) without an AI gateway URL', () => {
    expect(setup({ aiApiUrl: null }).adapter.analyzeMealPhoto).toBeUndefined();
  });
  it('uploads to the person’s own folder in the private bucket, then asks the server to analyse that path', async () => {
    const s = setup();
    const r = await s.adapter.analyzeMealPhoto!({ seed: 1, photo: jpeg() });
    expect(r).toEqual(RESULT);
    expect(s.from).toHaveBeenCalledWith('food-photos');
    expect(s.upload).toHaveBeenCalledWith(
      `${U}/${OBJ}.jpg`,
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: false }),
    );
    const [url, init] = s.fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ai.example.test/v1/food/photo-analysis');
    expect(JSON.parse(init.body as string)).toEqual({ storagePath: `${U}/${OBJ}.jpg` });
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok-synthetic');
    expect(s.remove).not.toHaveBeenCalled();
  });
  it('uploads nothing when the photo fails validation', async () => {
    for (const photo of [
      undefined,
      { ...jpeg(), contentType: 'image/png' },
      { data: new ArrayBuffer(6 * 1024 * 1024), contentType: 'image/jpeg' },
    ]) {
      const s = setup();
      expect(await code(s.adapter.analyzeMealPhoto!({ seed: 1, photo }))).toMatch(
        /invalid_input|photo_invalid_type|photo_too_large/,
      );
      expect(s.upload).not.toHaveBeenCalled();
    }
  });
  it('requires a signed-in user and both consents before any byte is uploaded', async () => {
    const a = setup({ user: null });
    expect(await code(a.adapter.analyzeMealPhoto!({ seed: 1, photo: jpeg() }))).toBe(
      'not_authenticated',
    );
    expect(a.upload).not.toHaveBeenCalled();
    for (const consents of [
      { ai_processing_of_food_photos: false },
      { health_data_processing: false },
    ]) {
      const s = setup({ consents });
      expect(await code(s.adapter.analyzeMealPhoto!({ seed: 1, photo: jpeg() }))).toBe(
        'ai_consent_required',
      );
      expect(s.upload).not.toHaveBeenCalled();
      expect(s.fetchImpl).not.toHaveBeenCalled();
    }
  });
  it('maps storage failures to fixed, safe errors and never leaks the raw message', async () => {
    const cases: Array<[Parameters<typeof setup>[0], string]> = [
      [
        { uploadError: { message: 'The object exceeded the maximum allowed size' } },
        'photo_too_large',
      ],
      [{ uploadError: { message: 'mime type image/gif is not supported' } }, 'photo_invalid_type'],
      [{ uploadError: { message: 'JWT expired' } }, 'not_authenticated'],
      [
        { uploadError: { message: 'new row violates row-level security policy' } },
        'photo_upload_failed',
      ],
      [{ uploadThrows: true }, 'photo_upload_failed'],
    ];
    for (const [o, expected] of cases) {
      const s = setup(o);
      const e = await s.adapter.analyzeMealPhoto!({ seed: 1, photo: jpeg() }).catch((x) => x);
      expect(e).toBeInstanceOf(StoreError);
      expect(e.code).toBe(expected);
      expect(String(e.message)).not.toMatch(/secret-host|row-level|JWT/);
      expect(s.fetchImpl).not.toHaveBeenCalled();
    }
  });
  it('removes the uploaded object when the analysis fails, and surfaces the typed error', async () => {
    for (const [server, expected] of [
      [{ ok: false, json: { error: { code: 'quota_exceeded' } } }, 'quota_exceeded'],
      [
        { ok: false, json: { error: { code: 'internal', message: 'stack trace' } } },
        'ai_unavailable',
      ],
      ['network', 'ai_unavailable'],
    ] as const) {
      const s = setup({ server });
      expect(await code(s.adapter.analyzeMealPhoto!({ seed: 1, photo: jpeg() }))).toBe(expected);
      expect(s.remove).toHaveBeenCalledWith([`${U}/${OBJ}.jpg`]);
    }
  });
});
