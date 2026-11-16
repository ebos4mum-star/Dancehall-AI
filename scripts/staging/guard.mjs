// Safety guard for every staging step. Staging may only ever target the ONE project the owner has explicitly designated, after an explicit confirmation.
// Everything else is refused: the development project, any other reference, and anything malformed. Adding a different target is a deliberate code change.
export const DESIGNATED_STAGING_REF = 'bxhnrjulksganzydgrgm'; // designated by the owner on 2026-11-16
/** Never a staging target, named so the refusal message can be specific. */
export const DEVELOPMENT_REF = 'vvwjhbsyxetnktimgaxg';
/** Kept for callers and tests that want the list of refs that must always be refused. */
export const FORBIDDEN_REFS = [DEVELOPMENT_REF];
export const CONFIRM_PHRASE = 'I-AM-USING-THE-STAGING-PROJECT';

/** Throws unless `ref` is exactly the designated staging project and the confirmation phrase was given. */
export function assertStagingRef(ref, confirm) {
  if (typeof ref !== 'string' || !/^[a-z]{20}$/.test(ref))
    throw new Error(
      'STAGING_REF must be a 20-letter Supabase project reference (from the dashboard URL).',
    );
  if (ref === DEVELOPMENT_REF)
    throw new Error(
      'That is the DEVELOPMENT project. Staging must never target it. Nothing was done.',
    );
  if (ref !== DESIGNATED_STAGING_REF)
    throw new Error('That is not the designated staging project. Nothing was done.');
  if (confirm !== CONFIRM_PHRASE)
    throw new Error(
      `Set STAGING_CONFIRM=${CONFIRM_PHRASE} to confirm this is the staging project.`,
    );
  return ref;
}
