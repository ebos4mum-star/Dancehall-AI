// Safety guard for every staging step. Staging may only ever target the ONE project the owner has explicitly designated, after an explicit confirmation.
// Everything else is refused: the development project, any other reference (production included), and anything malformed.
//
// The repository is public, so the project references themselves are NOT written here. The guard is pinned to SHA-256 digests of the
// designated staging reference and of the development reference (a 20-letter reference cannot be recovered from its digest). A reference is accepted only
// if its digest equals the staging pin; the development pin only produces a more specific refusal. Adding a different target is a deliberate code change
// (replace the pin). The reference itself is supplied at run time (STAGING_REF, or the staging URL variable in the protected GitHub environment).
import { createHash } from 'node:crypto';

/** SHA-256 of the designated staging project reference (designated by the owner on 2026-11-16). */
export const DESIGNATED_STAGING_REF_SHA256 =
  'd746b80bdfbb24b3ec62411f77f4100858df5ff0ff1c3f3925ddc0ea70120ce6';
/** SHA-256 of the development project reference: never a staging target, pinned so the refusal message can be specific. */
export const DEVELOPMENT_REF_SHA256 =
  '28b12271d516972144edb9c494362ef7b1bb6fc2fe26a9ee49aa9d404c69bafb';
export const CONFIRM_PHRASE = 'I-AM-USING-THE-STAGING-PROJECT';

export const refDigest = (ref) => createHash('sha256').update(String(ref)).digest('hex');

/** True only for a well-formed reference whose digest is the staging pin (`pin` is overridable for tests only; callers never pass it). */
export const isDesignatedStagingRef = (ref, pin = DESIGNATED_STAGING_REF_SHA256) =>
  typeof ref === 'string' && /^[a-z]{20}$/.test(ref) && refDigest(ref) === pin;

/** Throws unless `ref` is exactly the designated staging project and the confirmation phrase was given. */
export function assertStagingRef(ref, confirm, pins = {}) {
  const staging = pins.staging ?? DESIGNATED_STAGING_REF_SHA256;
  const development = pins.development ?? DEVELOPMENT_REF_SHA256;
  if (typeof ref !== 'string' || !/^[a-z]{20}$/.test(ref))
    throw new Error(
      'STAGING_REF must be a 20-letter Supabase project reference (from the dashboard URL).',
    );
  if (refDigest(ref) === development)
    throw new Error(
      'That is the DEVELOPMENT project. Staging must never target it. Nothing was done.',
    );
  if (refDigest(ref) !== staging)
    throw new Error('That is not the designated staging project. Nothing was done.');
  if (confirm !== CONFIRM_PHRASE)
    throw new Error(
      `Set STAGING_CONFIRM=${CONFIRM_PHRASE} to confirm this is the staging project.`,
    );
  return ref;
}
