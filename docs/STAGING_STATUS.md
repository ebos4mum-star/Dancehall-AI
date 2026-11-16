# Staging status

Staging project: `bxhnrjulksganzydgrgm` (designated by the owner). Development `vvwjhbsyxetnktimgaxg` was not touched. Production does not exist yet. `main` is unchanged.

## Guard
`scripts/staging/guard.mjs` allows only the designated staging ref and refuses the development ref and any unknown ref. Its tests pass (9).

## Isolation
The project was empty before setup (no users, no tables, no functions). Identity was checked read-only before any change.

## Migrations applied (19, SHA-256 verified, pinned to commit ac889a6cfbc30b6fc5d97a2f465a57f5d2529bda)
Identity/consent, weight and goals, food, dance catalog, coach, integration, deletion config, challenges, habits, household (and join limit, trigger revoke), wellness, celebrations, account recovery (and replay fix), community, community storage, and the proposed account-deletion executor. The temporary `http` loader extension was removed afterwards.

## Real database tests (`supabase/staging/real-db-checks.sql`)
Run in three rolled-back parts: 24 + 14 + 6 = **44 passed, 0 failed**. After the runs staging held no users, posts, audit rows, staff rows or orphan files.
Covered: members and anonymous callers cannot reach Community tables or functions; username rules; text and weight-claim moderation; comments and video refused by the database; private, verified, owner-only photo uploads held before publication; moderator needs a second factor; audit chain verifies; urgent child-safety reports hide at once; muting; Read only mode; the account-deletion executor (waits, deletes only the due account, cascades, queues storage files); owner isolation on health data.
Community defaults: mode open, video off, comments off. Security advisors show no Community findings.

## Not tested (cannot be reached from this environment)
HTTP checks, the Edge Function, real MFA tokens, signed links, concurrency. The `community` Edge Function is **not deployed**.

## Unresolved
- EAS variables could not be read (no Expo credentials here).
- Owner to run on their own machine: `STAGING_REF=bxhnrjulksganzydgrgm STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT STAGING_PUBLISHABLE_KEY=<publishable key> node scripts/staging/check-access.mjs db`
- Function deployment needs owner-entered secrets.
