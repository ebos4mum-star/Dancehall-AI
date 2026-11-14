import type { SupabaseClient } from '@supabase/supabase-js';
import { PHOTO_BUCKET, newObjectId, photoObjectPath, validatePhoto } from '../food/photoUpload';
import { createServerCaller } from './supabaseCoach';
import { StoreError, type DataStore, type PhotoAnalysisResult } from './types';

export interface PhotoAdapterDeps {
  db: SupabaseClient;
  base: Pick<DataStore, 'getConsents'>;
  /** Base URL of the server AI gateway. Without it the adapter offers no photo analysis at all (nothing is uploaded). */
  aiApiUrl?: string;
  fetchImpl?: typeof fetch;
  newId?: () => string;
  emit: () => void;
}

/**
 * Real photo upload to the private `food-photos` bucket, then analysis through the server route.
 * Authorization is layered: the signed-in user's own session is used (never a service key); the storage policy confines writes to
 * `<user-id>/`; consent is checked before any byte leaves the device; and the server re-checks ownership and consent.
 * Errors reaching the app are typed StoreErrors with fixed messages (raw storage or server text is not passed through).
 */
export function createPhotoAdapter(d: PhotoAdapterDeps): Partial<DataStore> {
  // Not offered until the AI gateway exists: uploading photos that can never be analysed or tracked for deletion would be harmful.
  if (!d.aiApiUrl) return {};
  const { db, emit } = d;
  const callServer = createServerCaller(db, d.aiApiUrl, d.fetchImpl);
  const bucket = () => db.storage.from(PHOTO_BUCKET);

  return {
    async analyzeMealPhoto(input): Promise<PhotoAnalysisResult> {
      validatePhoto(input.photo);
      const { data: u } = await db.auth.getUser();
      if (!u.user) throw new StoreError('not_authenticated');
      const consents = await d.base.getConsents();
      if (
        consents.health_data_processing !== true ||
        consents.ai_processing_of_food_photos !== true
      )
        throw new StoreError('ai_consent_required');

      const path = photoObjectPath(u.user.id, (d.newId ?? newObjectId)());
      let up: { error: { message?: string; statusCode?: string | number } | null };
      try {
        up = await bucket().upload(path, input.photo.data, {
          contentType: input.photo.contentType.toLowerCase(),
          upsert: false,
          cacheControl: '0',
        });
      } catch {
        throw new StoreError('photo_upload_failed');
      }
      if (up.error) {
        const m = `${up.error.message ?? ''} ${up.error.statusCode ?? ''}`;
        if (/JWT|401|expired/i.test(m)) throw new StoreError('not_authenticated');
        if (/exceeded the maximum allowed size|413|too large/i.test(m))
          throw new StoreError('photo_too_large');
        if (/mime type|invalid_mime|415/i.test(m)) throw new StoreError('photo_invalid_type');
        throw new StoreError('photo_upload_failed');
      }
      try {
        const res = await callServer<PhotoAnalysisResult>('/v1/food/photo-analysis', {
          storagePath: path,
        });
        emit();
        return res;
      } catch (e) {
        // The analysis did not complete: remove the object now (best effort; the server's retention job is the backstop).
        await bucket()
          .remove([path])
          .catch(() => undefined);
        emit();
        throw e;
      }
    },
  };
}
