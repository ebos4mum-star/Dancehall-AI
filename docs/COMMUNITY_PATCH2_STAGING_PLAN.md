# Community patch 2: staging application and rollback plan

**Status: prepared only. Nothing has been applied to any hosted project.** Needs the owner's explicit authorization. Target: staging project `<staging-ref>` only. Never production, never development.

## Exact scope (verified locally)

`supabase/proposed/community.patch2_photo_immediate.sql` replaces exactly three functions with `create or replace` (signatures, return types, grants and security-definer flags unchanged):

| Function                    | Change                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.community_screen`      | Nothing is held. Ordinary weight, calorie and health-number talk and capitals publish. Rejected (with a reason, nothing stored): dangerous health claims, diet-drug promotion, harassment. Personal weight-loss stories are allowed. |
| `app.community_create_post` | No media hold: photos (and, if video were ever enabled, video) publish at once.                                                                                                                                                      |
| `app.community_feed`        | Like count returned to every reader (a number, never who).                                                                                                                                                                           |

No tables, columns, policies, settings, storage buckets, secrets or data are touched. Checked on two local throwaway databases (staging's earlier `community.up.sql` plus the patch, versus a fresh current `community.up.sql`): function definitions, grants and definer flags identical; table columns identical; policy count identical (13); patch is safe to run twice; the rollback restores the earlier definitions exactly.

**Dependencies:** `community.up.sql` (any earlier version; staging has it). Nothing else.

**Separate hosted change that must travel with it:** the `community` Edge Function must be redeployed from this branch (public like count mapping, hard-off video routes). Without it, guests would still see `encouragedCount` as null/0 from the old mapping, and the database could still be asked about video. The function is deployed with the existing hash-verified process (pinned commit), staging only.

## Proposed order (when authorized)

0. Confirm the reference is `<staging-ref>` (guard script). Confirm Community mode is `read_only` and `COMMUNITY_FLOOR_MODE=read_only` (record both).
1. Apply `community.patch2_photo_immediate.sql` with the hash-verified loader (the same method used for the social migrations). Record the file hash first.
2. Verify the function definitions on staging equal the reviewed ones (hash of `pg_get_functiondef`), grants unchanged.
3. Redeploy the `community` function from the pinned commit; compare the deployed hash with the reviewed one.
4. Only if the owner then opens Community temporarily (as in the earlier photo verification): run `PHOTO_MODE=published node scripts/staging/photo-checks.mjs`, then restore `read_only`. Synthetic accounts and content only; clean up afterwards.
5. Read-only guest-burst check from one machine: `node scripts/staging/guest-limit-and-expiry.mjs guest-burst`; expired-token check with a saved token older than an hour: `... expired`.
6. Run the staging advisors and confirm no new findings. Record everything in `docs/STAGING_STATUS.md`.

## Rollback

`supabase/proposed/community.patch2_photo_immediate.down.sql` restores the previous three functions (photos held, risky text held, like count to the author only). Redeploy the previous `community` function version if step 3 was done. Rollback changes functions only: posts that were published under the patch stay published (hide any of them through the moderator tools if needed). Re-running either file is safe.

## What this does not do

No production change. No change to Community mode, video or comment settings, which stay `read_only`, off and off. No change to authentication, storage or the audit log.
