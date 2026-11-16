// Safety guard for every staging step. Staging may only ever target a project that is NOT one of the existing DanceHall projects, and only after an explicit confirmation.
// Known existing projects (never targets): the documented development project, and a second project in the same organization whose purpose is unconfirmed (treated as possibly production).
export const FORBIDDEN_REFS = ['vvwjhbsyxetnktimgaxg', 'bxhnrjulksganzydgrgm'];
export const CONFIRM_PHRASE = 'I-AM-USING-THE-STAGING-PROJECT';

/** Throws unless `ref` looks like a project reference, is not a known existing project, and the confirmation phrase was given. */
export function assertStagingRef(ref, confirm) {
  if (typeof ref !== 'string' || !/^[a-z]{20}$/.test(ref))
    throw new Error(
      'STAGING_REF must be a 20-letter Supabase project reference (from the dashboard URL).',
    );
  if (FORBIDDEN_REFS.includes(ref))
    throw new Error(
      'That is an existing DanceHall project. Staging must be a NEW, separate project. Nothing was done.',
    );
  if (confirm !== CONFIRM_PHRASE)
    throw new Error(
      `Set STAGING_CONFIRM=${CONFIRM_PHRASE} to confirm this is the new staging project.`,
    );
  return ref;
}
