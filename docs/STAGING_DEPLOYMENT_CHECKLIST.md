# Staging deployment checklist (prepared, NOT executed)

Target: the designated staging project **`bxhnrjulksganzydgrgm` only**. Never production (does not exist yet), never development (`vvwjhbsyxetnktimgaxg`), never any other project.
Status: **nothing in this document has been run against staging.** Every hosted step needs the authorization listed in section 0. Local rehearsals (sections 3 and 4) are the only parts already run, on throwaway databases.
Companion documents: `STAGING_STATUS.md` (what was done before), `CLAUDE_HANDOFF.md`, `GAMIFICATION_ARCHITECTURE.md` section 5, `NATIVE_TEST_PLAN.md`.

## 0. Authorizations needed before staging deployment (nothing below is assumed)

| #                                                                                                                                                                | What                                                                                                                                                                        | Why                                                                                                                  | Needed for                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A1                                                                                                                                                               | Apply four migrations to staging, in this order: `community.patch3_safety_phrases`, `social.patch2_eligible_workouts`, `health_sync`, `gamification`                        | the friends league, server XP, the one-workout-counts-once rule, Apple Health columns, newer safety phrases          | staging integration tests      |
| A2                                                                                                                                                               | Redeploy three Edge Functions to staging: `social`, `community`, `account` (in that order after the SQL)                                                                    | gm routes and eligible-workouts totals (`social`), safety phrases (`community`), deletion in maintenance (`account`) | staging integration tests      |
| A3                                                                                                                                                               | Add the host `bxhnrjulksganzydgrgm.supabase.co` (nothing else) to the allowed network hosts of the Claude environment, for the duration of the checks, then remove it       | lets Claude run the HTTPS probes from this environment; not needed if you run them on your Mac                       | HTTP smoke tests run by Claude |
| A4                                                                                                                                                               | Create synthetic test accounts on staging, then delete them and verify a clean read-back                                                                                    | the authenticated Friends smoke (`social-checks.mjs`); not needed if only app-driven native testing is used          | optional                       |
| A5                                                                                                                                                               | Schedule the account-deletion maintenance call (choose the mechanism, see section 8)                                                                                        | Apple's 5.1.1(v) requires deletion to actually happen; today nothing runs it                                         | before any shared build        |
| A6                                                                                                                                                               | Confirm no secret changes are wanted (none are required by this round) and that `COMMUNITY_FLOOR_MODE` stays `read_only`                                                    | Community stays Read only during all of this                                                                         | all                            |
| A7                                                                                                                                                               | Your Mac and phone: Xcode and a Simulator runtime, optionally a physical iPhone with your own signing; the staging **publishable** key in your local `.friends-staging.env` | native testing; Claude never receives the key or signing                                                             | native testing                 |
| A8 (optional)                                                                                                                                                    | Temporary Community `open` mode for photo checks                                                                                                                            | only to re-test photos; skip unless wanted                                                                           | optional                       |
| Not requested and not done by this checklist: production anything, development Supabase, EAS/TestFlight builds, Apple signing, merging to `main`, secret values. |

## 1. What staging holds today, and what changes

From `STAGING_STATUS.md` and `CLAUDE_HANDOFF.md` (these are records, not proof: section 2 re-verifies them live).

| Item           | Today on staging                                                                                                                                                                                                                                                                                                              | After this checklist                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Migrations     | 16 repository migrations; `community.up.sql` (earlier version, `ac889a6`), `community.storage`, `account_deletion_purge`; `social_up` (`1444af20`, SHA-256 `fa16d8b9...`), `social_patch1_view_dedupe` (`86757a16...`); `community_patch2_photo_immediate` (`70fb1a2d...`); config migration setting Community to `read_only` | plus `community_patch3_safety_phrases`, `social_patch2_eligible_workouts`, `health_sync`, `gamification`     |
| Edge Functions | `community` v10 (hash `c6debb97...`, code pinned `887b7801`), `social` v4 (hash `09f95127...`, code pinned `1444af20`), `account` v1 (hash `ac596a31...`, code pinned `434cabb2`), all `verify_jwt=false`                                                                                                                     | the same three, redeployed from the final reviewed commit, still `verify_jwt=false`                          |
| Secrets        | `COMMUNITY_PEPPER`, `COMMUNITY_MAINTENANCE_KEY`, `COMMUNITY_FLOOR_MODE=read_only`, `ACCOUNT_PEPPER`, `MAINTENANCE_KEY`                                                                                                                                                                                                        | unchanged (no new secret is read by any function: checked by grepping `Deno.env.get` in the three functions) |
| Data           | synthetic only; last recorded as clean                                                                                                                                                                                                                                                                                        | unchanged; any data added by tests is synthetic and removed                                                  |

## 2. Verify the existing staging schema first (read-only, before anything changes)

Run each of these, record the output in `STAGING_STATUS.md`, and **stop if anything differs from section 1**.

1. Reference check: `STAGING_REF=bxhnrjulksganzydgrgm STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT` with any script (the guard refuses every other ref), and `get_project` returns exactly `bxhnrjulksganzydgrgm`.
2. Migration history (read-only SQL): `select version, name from supabase_migrations.schema_migrations order by version;` Expect the 19 bootstrap entries, the config migration, `social_up`, `social_patch1_view_dedupe` and `community_patch2_photo_immediate`, and **none** of the four new names.
3. Absence of the new objects (read-only SQL), each must return `false` or `0`:
   `select to_regprocedure('app.eligible_workouts(uuid, timestamptz)') is not null;` `select count(*) from information_schema.columns where table_name='workout_sessions' and column_name='external_id';` `select to_regclass('public.gm_ledger') is not null;` `select to_regprocedure('public.gm_rpc(text, jsonb)') is not null;`
4. Catalog snapshot: `psql "$STAGING_DB_URL" -X -At -f supabase/staging/catalog-snapshot.sql > staging-before.txt` (metadata only, never user rows). Keep it: it is the rollback yardstick.
5. Function inventory: Edge Function list shows `community`, `social`, `account` at the versions and hashes in section 1.
6. Community state: `check-access.mjs function` (read-only) reports mode `read_only`, comments and video disabled; `check-access.mjs db` passes.
7. Data is synthetic: read-only counts of `auth.users`, `community_members`, posts, uploads, `workout_sessions` match what was last recorded (zero or only labelled synthetic rows). **If real person data is present, take the full backup in section 5 first.**
8. Security advisors: record the current findings so new ones can be recognised afterwards.

## 3. Local gates (already passing today; rerun on the final commit before asking for approval)

```bash
git fetch origin && git checkout <final reviewed commit> && git status -sb          # clean
STAGING_REHEARSAL_STRICT=1 bash supabase/proposed/staging-increment-dry-run.sh      # the staging-specific rehearsal, section 4
pnpm db:test                                                                        # includes every dry run
pnpm check:edge && pnpm check:secrets && pnpm test:scripts
export PATH=/tmp/denobin:$PATH DENO_DIR=/tmp/denodir                                 # real Deno + a local Postgres
pnpm test:social-integration && pnpm test:community-integration
sha256sum supabase/proposed/community.patch3_safety_phrases.sql supabase/proposed/social.patch2_eligible_workouts.sql supabase/proposed/health_sync.up.sql supabase/proposed/gamification.up.sql
```

Record the commit hash and the four SHA-256 values. Each file is applied only if its hash equals the recorded one.

## 4. Migrations: order, dependencies, dry run (done locally)

Dependency order (each depends only on what is before it and on what staging already has):

| Step                                          | File                                  | Depends on                                         | What it changes (the exact expected catalog diff, from the rehearsal)                                                                                                                                                        | Rollback                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                                             | `community.patch3_safety_phrases.sql` | `community.up.sql` (any version)                   | replaces **one** function: `app.community_screen` (self-harm phrases now match the coach screen). No table, column, policy or data                                                                                           | re-run `community.patch2_photo_immediate.sql` (byte-identical to the one staging holds)                                                                    |
| 2                                             | `social.patch2_eligible_workouts.sql` | `social.up.sql` (+ patch 1)                        | adds `app.eligible_workouts` (service role only); replaces `app.social_sync_group` and `app.social_view_friend`. No table, column, policy or data                                                                            | `social.patch2_eligible_workouts.down.sql` (new, generated from staging's current definitions and tested): restores the two functions, drops the added one |
| 3                                             | `health_sync.up.sql`                  | `workout_sessions`                                 | adds column `workout_sessions.external_id`, widens the `source` check to allow `apple_health`, adds a uniqueness index and an import check. Additive                                                                         | `health_sync.down.sql` (**deletes rows with source `apple_health`**: see section 5)                                                                        |
| 4                                             | `gamification.up.sql`                 | steps 2 and 3, `community.up.sql`, `social.up.sql` | adds tables `gm_ledger` and `gm_league_optin` (RLS on, deny-all policy, no client grants), functions `app.gm_inputs`, `gm_record`, `gm_state`, `gm_set_league`, `gm_league` and the door `public.gm_rpc` (service role only) | `gamification.down.sql` (drops the two tables and the functions)                                                                                           |
| Order of rollback is the reverse: 4, 3, 2, 1. |

**Dry run, run locally on throwaway databases:** `supabase/proposed/staging-increment-dry-run.sh` rebuilds staging's _actual_ current state from the pinned commits (every pinned file's SHA-256 is checked against the hash recorded when it was applied), applies only the four increments in the order above, and proves:

1. each increment changes exactly the objects in the table above (the script prints the expected diff per step);
2. the result is **catalog-identical to a fresh build of the current files** (1,445 objects compared: function bodies and grants, columns, constraints, indexes, policies, table grants);
3. the proposed tests pass on it (community, social, gamification, account deletion, community storage, structural RLS);
4. the rollback files, in reverse order, return the catalog **exactly** to staging's state before the increments (1,406 objects), and the increments can then be applied again with the same result;
5. the two function patches are repeatable (applying twice changes nothing).
   Last result: all PASS, local only, no hosted project contacted. The existing `gamification-dry-run.sh`, `social-dry-run.sh` and `community-dry-run.sh` still cover the fresh-build path.

## 5. Backup and rollback strategy

**Before step 1 (read-only, reversible):**

1. `staging-before.txt` from section 2 step 4.
2. Schema-only dump on your machine, with the staging connection string and DB password (never pasted into chat): `pg_dump --schema-only --schema=public --schema=app "$STAGING_DB_URL" > staging-schema-before.sql`.
3. Record the Edge Function versions and hashes and the _names_ (not values) of the secrets.
4. Data: staging should hold synthetic data only. If section 2 step 7 shows anything real, take a full dump (`pg_dump --data-only`) or a dashboard backup first. Point-in-time recovery depends on the project's plan; **check the dashboard, do not assume it**.
   **Rollback decision table**
   | If                                                  | Do                                                                                                                                                                                                         | Data effect                                                                                                                                                                                                                                                                                       |
   | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | a SQL step fails or its diff differs from section 4 | stop; that file runs in one transaction and rolls itself back; compare the snapshot with `staging-before.txt`                                                                                              | none                                                                                                                                                                                                                                                                                              |
   | a step is applied but a check fails                 | run that step's rollback, then the earlier steps' rollbacks in reverse; run the snapshot again and `diff` against `staging-before.txt`: **an empty diff proves the rollback**                              | steps 1 and 2: none. Step 3: `health_sync.down.sql` deletes imported Apple Health workouts: acceptable on staging, but record it. Step 4: drops the server XP ledger and league opt-ins; progression is recomputed on the phone from the person's records, so nothing the person recorded is lost |
   | an Edge Function misbehaves                         | redeploy the previous version from its pinned commit (section 1) and compare the hash; keep the SQL (it is additive and backwards compatible with the old function: the old `social` never calls `gm_rpc`) | none                                                                                                                                                                                                                                                                                              |
   | anything touches a project other than staging       | stop everything and tell the owner                                                                                                                                                                         | n/a                                                                                                                                                                                                                                                                                               |

## 6. Edge Function redeployments (after the SQL, in this order)

Deploy from the **final reviewed commit** with the same method used before (pinned shared code, `verify_jwt=false`), compare each deployed code hash with the reviewed one, record version and hash.

| Order                                                                                                                                                                                                             | Function    | Why it must be redeployed                                                                                            | Must come after                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1                                                                                                                                                                                                                 | `social`    | adds `gm/state`, `gm/sync`, `gm/league`, `gm/league/optin` and the one-workout rule in totals; calls `public.gm_rpc` | steps 2, 3 and 4 (deploying earlier would make the new routes fail) |
| 2                                                                                                                                                                                                                 | `community` | safety phrases shared with the coach; no other behaviour change                                                      | step 1                                                              |
| 3                                                                                                                                                                                                                 | `account`   | the scheduled `maintenance/reap` call also runs due account deletions                                                | `account_deletion_purge` (already on staging)                       |
| `pnpm check:edge` must pass first: it proves the generated shared copies in `supabase/functions/_shared/generated/` equal the reviewed source. Immediately after each deploy run the matching probe in section 9. |

## 7. Feature flags and environments

**App build (staging only; none of these may reach a production build):** `EXPO_PUBLIC_APP_ENV=preview`, `EXPO_PUBLIC_AUTH_MODE=supabase`, `EXPO_PUBLIC_CLOUD_ACCOUNTS=1`, `EXPO_PUBLIC_SOCIAL=1`, `EXPO_PUBLIC_COMMUNITY=1`, `EXPO_PUBLIC_APPLE_HEALTH=1`, `EXPO_PUBLIC_SUPABASE_URL=https://bxhnrjulksganzydgrgm.supabase.co`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` (publishable only). Leave unset: `EXPO_PUBLIC_PRODUCTION_ACCOUNTS`, `EXPO_PUBLIC_BARCODE_PROVIDER` (a production build refuses `local`), optional `EXPO_PUBLIC_SUPPORT_EMAIL`.
Locally: `bash scripts/friends-staging-ios.sh --community --health` (Simulator; add `--device`). It refuses any project except staging, any secret key and any http URL, and builds nothing for upload. The EAS profile `staging-preview` sets the same flags and is **not to be built** in this phase.
**Edge secrets:** set and unchanged: `COMMUNITY_PEPPER`, `COMMUNITY_MAINTENANCE_KEY`, `COMMUNITY_FLOOR_MODE` (**must stay `read_only`**), `ACCOUNT_PEPPER`, `MAINTENANCE_KEY`. Must stay unset on staging: `COMMUNITY_COMMENTS`, `COMMUNITY_ALERTS` and `COMMUNITY_ALERT_*`, `COMMUNITY_DEBUG`, `SOCIAL_DEBUG`, `ACCOUNT_ALLOW_SHORT_COOLING_OFF` (it shortens the recovery wait: test-only). Defaults apply for `ACCOUNT_COOLING_OFF_HOURS` (24) and `ACCOUNT_IDENTIFIER_DOMAIN`.
**Community stored mode:** `read_only`, comments and video off, before and after.

## 8. Account-deletion maintenance scheduling

The `account` function's `POST /functions/v1/account/maintenance/reap` with header `x-maintenance-key: <MAINTENANCE_KEY>` finishes abandoned half-made accounts, prunes, **and** runs account deletions whose 30-day waiting period has ended (`purge_due_account_deletions`, at most 50 per call; it returns only a count). The key is never printed or committed.

1. After the `account` redeploy, call it once by hand from your shell: `curl -sS -X POST "https://bxhnrjulksganzydgrgm.supabase.co/functions/v1/account/maintenance/reap" -H "apikey: $STAGING_PUBLISHABLE_KEY" -H "x-maintenance-key: $MAINTENANCE_KEY"`. Expect HTTP 200 with `ok: true` and **`purged` a number (not `null`)**: a `null` means the purge function is missing. A wrong key must give 401.
2. Decide the scheduler (authorization A5): Supabase Cron (`pg_cron` with `pg_net`; enabling those extensions is itself a hosted change) or an external scheduler that holds the key. Interval: every 10 minutes is what `CLOUD_ACCOUNTS_ACTIVATION.md` recommends for the reaper; the deletion step is safe to repeat because it processes only due requests.
3. Prove it end to end once on staging with a synthetic account: request deletion, confirm the waiting period is shown, and rely on `supabase/staging/real-db-checks.sql` (already verifies the executor deletes only the due account and cascades). Disabling the schedule is the rollback.
4. `COMMUNITY_MAINTENANCE_KEY` / `community/maintenance/prune` follows the same pattern and is optional here.

## 9. Smoke tests (after each hosted step; stop at the first failure)

**Friends and Group Goals**

- Read-only: `check-access.mjs function` and `db`; `gm-boundary-checks.mjs` (below) after the `social` redeploy.
- Authenticated (needs A4, or use two real staging accounts in the native app): `scripts/staging/social-checks.mjs main` then `after-delete` (37 and 5 checks last time), then cleanup and read-back of zero.
- New in this round, in the app with two accounts: a workout imported from Apple Health and the same one done in the app counts once in a group total; editing and deleting a workout moves the total.
  **Community (Read only)**
- `check-access.mjs function`: mode `read_only`, comments and video disabled, writes refused without a token, only POST served.
- After the `community` redeploy: a post containing a self-harm phrase from `supabase/tests/community-cases.json` is refused (in the app or via the function); browse, report and block still work.
  **Gamification (new on staging)**
- `STAGING_REF=bxhnrjulksganzydgrgm STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT STAGING_PUBLISHABLE_KEY=<publishable> node scripts/staging/gm-boundary-checks.mjs before` **before** the `social` redeploy (records how the old function answers), and `... after` **after** it: every gm route returns 401 without a sign-in, a forged token is refused, only POST is served, no key or identifier leaks. Read-only, creates nothing.
- Read-only SQL after step 4: `select relname, relrowsecurity from pg_class where relname in ('gm_ledger','gm_league_optin');` (both `true`); `select has_table_privilege('anon','public.gm_ledger','select') or has_table_privilege('authenticated','public.gm_ledger','select');` (`false`); `select has_function_privilege('authenticated','public.gm_rpc(text, jsonb)','execute');` (`false`) and the same with `service_role` (`true`).
- Authenticated, in the app (two staging accounts): progression shows; completing a workout raises XP once and a retry or a second device does not pay twice; sending fake XP is ignored (covered by the local integration tests); the league appears only after both people opt in and shows a username and one number; deleting an account removes its ledger rows.
- The same 17 social-integration tests (real Deno, real SQL) pass locally and are the reference for expected behaviour.
  **Catalog diffs:** after each SQL step, run `catalog-snapshot.sql` again and `diff` against the previous snapshot: the changed lines must be exactly those in section 4.

## 10. Apple Health build configuration

- Off everywhere except builds made with `EXPO_PUBLIC_APPLE_HEALTH=1`. `apps/mobile/app.config.js` then adds the `@kingstinct/react-native-healthkit` plugin with **read access to workouts only**: `NSHealthShareUsageDescription` (the usage text), `NSHealthUpdateUsageDescription: false` (no write access), `background: false` (no background delivery). Without the flag the app is exactly `app.json`: no HealthKit module, entitlement or usage text.
- A production build given the flag **refuses to start** (`src/lib/env.ts`); no EAS profile except `staging-preview` sets it (a test pins this).
- Only a workout's id, type, start and end cross the boundary; calories, heart rate and routes are never read.
- On your Mac, after `bash scripts/friends-staging-ios.sh --health` has generated the iOS project, confirm: the entitlements file contains `com.apple.developer.healthkit` and nothing else HealthKit related; `Info.plist` has `NSHealthShareUsageDescription` and **no** `NSHealthUpdateUsageDescription`; no `UIBackgroundModes` entry for HealthKit.
- Signing is yours; this checklist does not change it.

## 11. Production isolation safeguards (where they are enforced)

| Safeguard                                                                                                                                | Where                                                                                   | Verified by                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Staging scripts accept only the designated ref and the confirmation phrase; the development ref and any other ref are refused            | `scripts/staging/guard.mjs` (every staging script calls it, including the new gm probe) | `scripts/staging/staging.test.mjs`                                                  |
| The local launcher refuses any project except staging, secret keys and http URLs; sets the preview environment                           | `scripts/friends-staging-ios.sh`                                                        | `scripts/friends-staging-ios.test.mjs` (now including `--health` and `--community`) |
| A production build refuses to start with Community, Friends, Apple Health, the barcode sample list or content fixtures on                | `apps/mobile/src/lib/env.ts`                                                            | `env.test.ts`, `buildConfig.test.ts`                                                |
| Only `staging-preview` sets the flags; the production profile cannot reach them                                                          | `apps/mobile/eas.json`                                                                  | `buildConfig.test.ts`                                                               |
| HealthKit is added only when the flag is set                                                                                             | `apps/mobile/app.config.js`                                                             | `appConfig.test.ts`                                                                 |
| Edge Functions use the platform-provided URL and service key of the project they are deployed to; they hold no other project's reference | `supabase/functions/*`                                                                  | staging checks in `STAGING_STATUS.md`                                               |
| No client can reach any social, community or gamification table or function; only the service role can                                   | each `*.up.sql` (RLS deny-all, no grants)                                               | the proposed SQL tests and the rehearsal's structural RLS guard                     |
| No secret in the repository or in the app                                                                                                | `pnpm check:secrets`                                                                    | `scripts/secret-patterns.test.mjs`                                                  |
| Hosted steps verify the project reference first                                                                                          | the guard, and `get_project` before each hosted change                                  | recorded in `STAGING_STATUS.md`                                                     |
| During the staging work: no EAS or TestFlight build, no signing change, no change to `main`, production or development Supabase.         |

## 12. Sign-off record (fill in as you go)

| Step                          | Authorized by / date | Result | Snapshot diff empty/expected | Hash recorded |
| ----------------------------- | -------------------- | ------ | ---------------------------- | ------------- |
| Section 2 verification        |                      |        |                              |               |
| SQL 1 patch3                  |                      |        |                              |               |
| SQL 2 social patch2           |                      |        |                              |               |
| SQL 3 health_sync             |                      |        |                              |               |
| SQL 4 gamification            |                      |        |                              |               |
| Redeploy social               |                      |        |                              |               |
| Redeploy community            |                      |        |                              |               |
| Redeploy account              |                      |        |                              |               |
| Maintenance call and schedule |                      |        |                              |               |
| Smoke tests (section 9)       |                      |        |                              |               |
| Cleanup, network host removed |                      |        |                              |               |
