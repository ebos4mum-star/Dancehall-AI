# Staging deployment checklist (prepared, NOT executed)

Target: the designated staging project **`bxhnrjulksganzydgrgm` only**. Never production (does not exist yet), never development (`vvwjhbsyxetnktimgaxg`), never any other project.
Status: **nothing in this document has been run against staging.** Every hosted step needs the authorization in section 0. The local rehearsal (sections 3 and 4) is the only part already run, on throwaway databases.
Companions: `TESTFLIGHT_RELEASE_READINESS.md` (the build and upload side), `STAGING_STATUS.md`, `CLAUDE_HANDOFF.md`, `GAMIFICATION_ARCHITECTURE.md` section 5, `NATIVE_TEST_PLAN.md`.

## 0. Authorizations needed before staging deployment (nothing is assumed)

| #                                                                                                                                                                   | What                                                                                                                                                                 | Why                                                                                                                  | Needed for                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A1                                                                                                                                                                  | Apply four migrations to staging, in this order: **`social.patch2_eligible_workouts`, `health_sync`, `gamification`, `community.patch3_safety_phrases`**             | the one-workout-counts-once rule, Apple Health columns, server XP and the friends league, newer safety phrases       | staging integration tests and the TestFlight build |
| A2                                                                                                                                                                  | Redeploy three Edge Functions to staging: **`social`, `community`, `account`** (in that order, after the SQL)                                                        | gm routes and eligible-workouts totals (`social`), safety phrases (`community`), deletion in maintenance (`account`) | same                                               |
| A3                                                                                                                                                                  | Add the host `bxhnrjulksganzydgrgm.supabase.co` (nothing else) to the allowed network hosts of the Claude environment for the duration of the checks, then remove it | lets Claude run the HTTPS probes from this environment; not needed if you run them on your Mac                       | HTTP smoke tests run by Claude                     |
| A4                                                                                                                                                                  | Create synthetic test accounts on staging, then delete them and verify a clean read-back                                                                             | the authenticated Friends smoke (`social-checks.mjs`); not needed if only app-driven native testing is used          | optional                                           |
| A5                                                                                                                                                                  | Schedule the account-deletion maintenance call (choose the mechanism, section 8)                                                                                     | Apple's 5.1.1(v) requires deletion to actually happen; today nothing runs it                                         | before any shared build                            |
| A6                                                                                                                                                                  | Confirm no secret change is wanted (none is required) and that `COMMUNITY_FLOOR_MODE` stays `read_only`                                                              | Community stays Read only throughout                                                                                 | all                                                |
| A7                                                                                                                                                                  | Your Mac, Xcode and phone, and the staging **publishable** key in your local `.friends-staging.env`                                                                  | native testing; Claude never receives the key or signing                                                             | native testing                                     |
| A8 (optional)                                                                                                                                                       | Temporary Community `open` mode for photo checks                                                                                                                     | only to re-test photos                                                                                               | optional                                           |
| Not requested and not done by this checklist: production anything, development Supabase, EAS or TestFlight builds, Apple signing, merging to `main`, secret values. |

## 0b. What must be confirmed, and where each is confirmed

| Confirm                     | How                                                                                                                                                                                                    | Where in this document |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Correct staging project     | every script runs `assertStagingRef` (refuses the development ref, any other ref, and a missing confirmation phrase); `get_project` must return exactly `bxhnrjulksganzydgrgm` before each hosted step | sections 2, 11, 12     |
| Current staging schema      | read-only migration list, absence checks for the new objects, a catalog snapshot, Edge versions and hashes, security advisors                                                                          | section 2              |
| Backup and rollback plan    | snapshot, schema dump, version record; a reverse-order rollback proven locally to restore the exact prior state                                                                                        | sections 4 and 5       |
| Migration compatibility     | additive and backwards compatible: see the table below; proven by the rehearsal                                                                                                                        | sections 4 and 4b      |
| Staging-only variables      | the secrets and app flags tables; none of them can reach a production build                                                                                                                            | section 7              |
| Community stays `read_only` | stored mode, `COMMUNITY_FLOOR_MODE`, comments and video off: checked before, after each step, and at the end                                                                                           | sections 2, 7, 9       |
| No production impact        | production does not exist; nothing here contacts it; the guards listed in section 11                                                                                                                   | section 11             |

## 1. What staging holds today, and what changes

From `STAGING_STATUS.md` and `CLAUDE_HANDOFF.md` (records, not proof: section 2 re-verifies them live).

| Item           | Today on staging                                                                                                                                                                                                                                                                                                                | After this checklist                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Migrations     | 16 repository migrations; `community.up.sql` (earlier version, `ac889a6`), `community.storage`, `account_deletion_purge`; `social_up` (`1444af20`, SHA-256 `fa16d8b9...`), `social_patch1_view_dedupe` (`86757a16...`); `community_patch2_photo_immediate` (`70fb1a2d...`); a config migration setting Community to `read_only` | plus the four in section 0                                                          |
| Edge Functions | `community` v10 (hash `c6debb97...`, code pinned `887b7801`), `social` v4 (hash `09f95127...`, code pinned `1444af20`), `account` v1 (hash `ac596a31...`, code pinned `434cabb2`), all `verify_jwt=false`                                                                                                                       | the same three, redeployed from the final reviewed commit, still `verify_jwt=false` |
| Secrets        | `COMMUNITY_PEPPER`, `COMMUNITY_MAINTENANCE_KEY`, `COMMUNITY_FLOOR_MODE=read_only`, `ACCOUNT_PEPPER`, `MAINTENANCE_KEY`                                                                                                                                                                                                          | unchanged: no function reads any other secret (checked by grepping `Deno.env.get`)  |
| Data           | synthetic only; last recorded as clean                                                                                                                                                                                                                                                                                          | unchanged; anything tests add is synthetic and removed                              |

## 2. Verify the existing staging schema first (read-only, before anything changes)

Record each output in `STAGING_STATUS.md` and **stop if anything differs from section 1**.

1. Reference: `STAGING_REF=bxhnrjulksganzydgrgm STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT` with any script, and `get_project` returns exactly `bxhnrjulksganzydgrgm`.
2. Migration history: `select version, name from supabase_migrations.schema_migrations order by version;` Expect the 19 bootstrap entries, the config migration, `social_up`, `social_patch1_view_dedupe`, `community_patch2_photo_immediate` and **none** of the four new names.
3. The new objects are absent (each returns `false` or `0`): `select to_regprocedure('app.eligible_workouts(uuid, timestamptz)') is not null;` `select count(*) from information_schema.columns where table_name='workout_sessions' and column_name='external_id';` `select to_regclass('public.gm_ledger') is not null;` `select to_regprocedure('public.gm_rpc(text, jsonb)') is not null;`
4. Catalog snapshot (metadata only, never user rows): `psql "$STAGING_DB_URL" -X -At -f supabase/staging/catalog-snapshot.sql > staging-before.txt`. Keep it: it is the rollback yardstick.
5. Edge Functions: `community`, `social`, `account` at the versions and hashes in section 1.
6. Community state: `check-access.mjs function` (read-only) shows mode `read_only`, comments and video disabled; `check-access.mjs db` passes.
7. Data is synthetic: read-only counts of `auth.users`, `community_members`, posts, uploads and `workout_sessions` match what was last recorded. **If real person data is present, take the full backup in section 5 first.**
8. Security advisors: record today's findings so new ones can be recognised.

## 3. Local gates (passing today; rerun on the final commit before asking for approval)

```bash
git fetch origin && git checkout <final reviewed commit> && git status -sb          # clean
STAGING_REHEARSAL_STRICT=1 bash supabase/proposed/staging-increment-dry-run.sh      # section 4 rehearsal
pnpm db:test && pnpm check:edge && pnpm check:secrets && pnpm test:scripts
export PATH=/tmp/denobin:$PATH DENO_DIR=/tmp/denodir
pnpm test:social-integration && pnpm test:community-integration
cd supabase/proposed && sha256sum social.patch2_eligible_workouts.sql health_sync.up.sql gamification.up.sql community.patch3_safety_phrases.sql
```

Recorded hashes at the time of writing (apply a file only if its SHA-256 equals the recorded value for the commit you approve):

| File                                                                                                  | SHA-256                                                            |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `social.patch2_eligible_workouts.sql`                                                                 | `932d780af33b654d31ce35ae11f5a3e8bbeea908576a39d17f7aa79a8facf8eb` |
| `health_sync.up.sql`                                                                                  | `6b74d200a6fff76ac0b1fa473fd9e95fe04f1b3f620638d79bcb0af997d9e3d8` |
| `gamification.up.sql`                                                                                 | `fa006f9fd4e3a779b1833349f18468d7edcc01c3773be53b7acf067e2196a107` |
| `community.patch3_safety_phrases.sql`                                                                 | `2ed1ebce20f13fdffec46f4627d8e35ebfdef85e6b93ad71a63b0e7617c383dc` |
| rollback `social.patch2_eligible_workouts.down.sql`                                                   | `5c571dcadf4977ed8343fa753aab1416f122f55567ac46f5fe6995668c259dc6` |
| rollback `health_sync.down.sql`                                                                       | `976827f542ddf194cdbd57e268e996eec68b946c7ebf8055be835a6dff4495fe` |
| rollback `gamification.down.sql`                                                                      | `5ea0bc137efdd150e143fbea62901cb0b441918e163d07665439cb83f2b65dba` |
| rollback of patch 3: `community.patch2_photo_immediate.sql` (byte-identical to the one staging holds) | `70fb1a2d6cca5694f169bf2ee6ede9d31cf0d3664c25e76852f09ee904b9c1de` |

## 4. Migrations: order, dependencies, dry run (done locally)

Your order, with what each depends on and exactly what it changes (the expected catalog diff, as printed by the rehearsal):

| Step                                                                                                                                                                                                                                             | File                                                    | Depends on                                         | Exact expected change                                                                                                                                                                                                             | Rollback                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1                                                                                                                                                                                                                                                | `social.patch2_eligible_workouts.sql` (own transaction) | `social.up.sql` + patch 1                          | adds `app.eligible_workouts` (service role only); replaces `app.social_sync_group` and `app.social_view_friend`. No table, column, policy or data                                                                                 | `social.patch2_eligible_workouts.down.sql` (generated from staging's current definitions; tested) |
| 2                                                                                                                                                                                                                                                | `health_sync.up.sql` (**no transaction wrapper**)       | `workout_sessions`                                 | adds column `workout_sessions.external_id`, widens the `source` check to allow `apple_health`, adds a uniqueness index and an import check. Additive                                                                              | `health_sync.down.sql` (**deletes rows with source `apple_health`**: see section 5)               |
| 3                                                                                                                                                                                                                                                | `gamification.up.sql` (**no transaction wrapper**)      | steps 1 and 2, `community.up.sql`, `social.up.sql` | adds tables `gm_ledger` and `gm_league_optin` (RLS on, deny-all policy, no client grants) and functions `app.gm_inputs`, `gm_record`, `gm_state`, `gm_set_league`, `gm_league`, plus the door `public.gm_rpc` (service role only) | `gamification.down.sql`                                                                           |
| 4                                                                                                                                                                                                                                                | `community.patch3_safety_phrases.sql` (own transaction) | `community.up.sql` (any version)                   | replaces **one** function, `app.community_screen` (self-harm phrases now match the coach screen). No table, column, policy or data                                                                                                | re-run `community.patch2_photo_immediate.sql`                                                     |
| Rollback is the reverse: 4, 3, 2, 1. **Steps 2 and 3 have no transaction of their own: apply them in a single transaction (`psql --single-transaction`, or a migration tool that wraps them), so a failure cannot leave a half-applied change.** |
| Patch 3 touches one Community function and nothing the other three use, so its position is free: the rehearsal also applies it first and gets the identical result.                                                                              |

**Dry run (local, throwaway databases only): `supabase/proposed/staging-increment-dry-run.sh`.** It rebuilds staging's _actual_ current state from the pinned commits (each pinned file's SHA-256 is checked against the hash recorded when it was applied), applies only the four increments in the order above, and proves:

1. each increment changes exactly the objects in the table above;
2. the result is **catalog-identical to a fresh build of the current files** (1,445 objects: function bodies and grants, columns, constraints, indexes, policies, table grants);
3. the proposed tests pass on it (community, social, gamification, account deletion, community storage, structural RLS);
4. the rollbacks in reverse order return the catalog **exactly** to staging's state before the increments (1,406 objects), and applying again gives the same result;
5. the two function patches are repeatable;
6. patch 3 applied first gives the same result as your order.
   Last result: all PASS, local only, no hosted project contacted.

## 4b. Migration compatibility (why the order of deployment is safe)

| Combination                                                                                                                                                   | Behaviour                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New SQL, old Edge Functions (between sections 4 and 6)                                                                                                        | the old `social` v4 never calls `gm_rpc` and uses function signatures that did not change; the old `community` v10 works with the replaced `app.community_screen`; nothing breaks |
| New SQL, new app, old `social` (a window you should keep short)                                                                                               | the app's progression asks the server, gets no `gm` route, and falls back to computing on the phone (the same engine and records); the friends league is simply unavailable       |
| New Edge Functions before the SQL (**do not do this**)                                                                                                        | `social` gm routes would fail because `gm_rpc` is missing; the app would fall back to the phone but league and server XP would error                                              |
| All new                                                                                                                                                       | server XP, league, one-workout rule and Apple Health import behave as in the local integration tests (17 social, 26 community)                                                    |
| The SQL is additive (one column, one widened check, two tables, new functions, three replaced function bodies), so the old state remains valid at every step. |

## 5. Backup and rollback strategy

**Before step 1 (read-only, reversible):**

1. `staging-before.txt` (section 2, step 4).
2. Schema-only dump on your machine with the staging connection string and DB password (never pasted into chat): `pg_dump --schema-only --schema=public --schema=app "$STAGING_DB_URL" > staging-schema-before.sql`.
3. Record the Edge Function versions and hashes and the _names_ (not values) of the secrets.
4. Data: staging should hold synthetic data only. If section 2 step 7 shows anything real, take a full dump (`pg_dump --data-only`) or a dashboard backup first. Point-in-time recovery depends on the project's plan: **check the dashboard, do not assume it**.
   **Rollback decision table**
   | If                                                  | Do                                                                                                                                                                                      | Data effect                                                                                                                                                                                                                                                                                    |
   | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | a SQL step fails or its diff differs from section 4 | stop. Steps 1 and 4 run in their own transaction and undo themselves; steps 2 and 3 must be applied in a single transaction (section 4). Compare the snapshot with `staging-before.txt` | none                                                                                                                                                                                                                                                                                           |
   | a step is applied but a check fails                 | run that step's rollback, then the earlier steps' rollbacks in reverse; run the snapshot and `diff` against `staging-before.txt`: **an empty diff proves the rollback**                 | steps 1 and 4: none. Step 2: `health_sync.down.sql` deletes imported Apple Health workouts (acceptable on staging; record it). Step 3: drops the server XP ledger and league opt-ins; progression is recomputed on the phone from the person's records, so nothing the person recorded is lost |
   | an Edge Function misbehaves                         | redeploy the previous version from its pinned commit (section 1) and compare the hash; keep the SQL (additive; the old `social` never calls `gm_rpc`)                                   | none                                                                                                                                                                                                                                                                                           |
   | anything touches a project other than staging       | stop everything and tell the owner                                                                                                                                                      | n/a                                                                                                                                                                                                                                                                                            |

## 6. Edge Function redeployments (after the SQL, in this order)

Deploy from the **final reviewed commit**, `verify_jwt=false` (there is no `supabase/config.toml`, so the flag must be given explicitly), compare each deployed code hash with the reviewed one, record version and hash.

| Order                                                                                                                                                                                                              | Function    | Why                                                                                                                  | Must come after                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1                                                                                                                                                                                                                  | `social`    | adds `gm/state`, `gm/sync`, `gm/league`, `gm/league/optin` and the one-workout rule in totals; calls `public.gm_rpc` | SQL steps 1, 2 and 3 (earlier would make the new routes fail) |
| 2                                                                                                                                                                                                                  | `community` | safety phrases shared with the coach screen; no other behaviour change                                               | SQL step 4                                                    |
| 3                                                                                                                                                                                                                  | `account`   | the scheduled `maintenance/reap` call also runs due account deletions                                                | `account_deletion_purge` (already on staging)                 |
| `pnpm check:edge` must pass first (it proves the generated shared copies in `supabase/functions/_shared/generated/` equal the reviewed source). Run the matching probe in section 9 immediately after each deploy. |

## 7. Feature flags and environments

**App build (staging only; none of these can reach a production build): the `staging-testflight` profile** sets `EXPO_PUBLIC_APP_ENV=preview`, `EXPO_PUBLIC_AUTH_MODE=supabase`, `EXPO_PUBLIC_CLOUD_ACCOUNTS=1`, `EXPO_PUBLIC_SOCIAL=1`, `EXPO_PUBLIC_COMMUNITY=1`, `EXPO_PUBLIC_APPLE_HEALTH=1`, `EXPO_PUBLIC_BARCODE_PROVIDER=off`. The two backend values come from the EAS `staging` environment, never from git: `EXPO_PUBLIC_SUPABASE_URL=https://bxhnrjulksganzydgrgm.supabase.co` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` (publishable only). Left unset: `EXPO_PUBLIC_PRODUCTION_ACCOUNTS`, `EXPO_PUBLIC_CONTENT_FIXTURES` (no EAS profile may enable fixtures), `EXPO_PUBLIC_AI_API_URL` (the AI gateway is not deployed), optional `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_SUPPORT_URL`.
Locally: `bash scripts/friends-staging-ios.sh --community --health` (Simulator; add `--device`). It refuses any project except staging, any secret key and any http URL, and builds nothing for upload.
**Edge secrets:** set and unchanged: `COMMUNITY_PEPPER`, `COMMUNITY_MAINTENANCE_KEY`, `COMMUNITY_FLOOR_MODE` (**must stay `read_only`**), `ACCOUNT_PEPPER`, `MAINTENANCE_KEY`. Must stay unset on staging: `COMMUNITY_COMMENTS`, `COMMUNITY_ALERTS` and `COMMUNITY_ALERT_*`, `COMMUNITY_DEBUG`, `SOCIAL_DEBUG`, `ACCOUNT_ALLOW_SHORT_COOLING_OFF` (it shortens the recovery wait: test-only). Defaults apply for `ACCOUNT_COOLING_OFF_HOURS` (24) and `ACCOUNT_IDENTIFIER_DOMAIN`.
**Community stored mode:** `read_only`, comments and video off, before and after.

## 8. Account-deletion maintenance scheduling

`POST /functions/v1/account/maintenance/reap` with header `x-maintenance-key: <MAINTENANCE_KEY>` finishes abandoned half-made accounts, prunes, **and** runs account deletions whose 30-day waiting period has ended (`purge_due_account_deletions`, at most 50 per call; it returns only a count). The key is never printed or committed.

1. After the `account` redeploy, call it once by hand from your shell (command in section 12). Expect HTTP 200, `ok: true` and **`purged` a number (not `null`)**: `null` means the purge function is missing. A wrong key must give 401.
2. Decide the scheduler (A5): Supabase Cron (`pg_cron` with `pg_net`; enabling those extensions is itself a hosted change) or an external scheduler that holds the key. Interval: every 10 minutes is what `CLOUD_ACCOUNTS_ACTIVATION.md` recommends for the reaper; the deletion step is safe to repeat because it processes only due requests.
3. Prove the executor once with a synthetic account (`supabase/staging/real-db-checks.sql` already verifies it deletes only the due account and cascades). Disabling the schedule is the rollback.
4. `COMMUNITY_MAINTENANCE_KEY` and `community/maintenance/prune` follow the same pattern and are optional here.

## 9. Smoke tests (after each hosted step; stop at the first failure)

**Friends and Group Goals**

- Read-only: `check-access.mjs function` and `db`; `gm-boundary-checks.mjs after` once `social` is redeployed.
- Authenticated (needs A4, or two real staging accounts in the native app): `scripts/staging/social-checks.mjs main` then `after-delete` (37 and 5 checks last time), then cleanup and read-back of zero.
- New, in the app with two accounts: a workout imported from Apple Health and the same one done in the app counts once in a group total; editing and deleting a workout moves the total.
  **Community (Read only)**
- `check-access.mjs function`: mode `read_only`, comments and video disabled, writes refused without a token, only POST served.
- After the `community` redeploy: a post containing a self-harm phrase from `supabase/tests/community-cases.json` is refused; browse, report and block still work.
  **Gamification (new on staging)**
- `gm-boundary-checks.mjs before` **before** the `social` redeploy (records how the old function answers) and `... after` **after** it: every gm route returns 401 without a sign-in, a forged token is refused, only POST is served, nothing leaks. Read-only, creates nothing.
- Read-only SQL after step 3: `select relname, relrowsecurity from pg_class where relname in ('gm_ledger','gm_league_optin');` (both `true`); `select has_table_privilege('anon','public.gm_ledger','select') or has_table_privilege('authenticated','public.gm_ledger','select');` (`false`); `select has_function_privilege('authenticated','public.gm_rpc(text, jsonb)','execute');` (`false`), and with `service_role` (`true`).
- In the app (two staging accounts): progression shows; completing a workout raises XP once and a retry or a second device does not pay twice (covered locally by the integration tests); the league appears only after both people opt in and shows a username and one number; deleting an account removes its ledger rows.
- The 17 social-integration tests (real Deno, real SQL) are the reference for expected behaviour.
  **Catalog diffs:** after each SQL step run `catalog-snapshot.sql` again and `diff` against the previous snapshot: the changed lines must be exactly those in section 4.
  **Not testable on staging today:** the AI Coach (the AI gateway is not deployed: the app says so honestly), and a live Coach (the optional `ai` function, secret `AI_PROVIDER=mock`, deploy with `--no-verify-jwt`, EAS variable `EXPO_PUBLIC_AI_API_URL`, is an approval-gated option; see `TESTFLIGHT_RELEASE_READINESS.md`). Workouts are bundled samples and need no staging content.

## 10. Apple Health build configuration

- Off everywhere except builds made with `EXPO_PUBLIC_APPLE_HEALTH=1`. `apps/mobile/app.config.js` then adds the `@kingstinct/react-native-healthkit` plugin with **read access to workouts only**: `NSHealthShareUsageDescription` (the usage text), `NSHealthUpdateUsageDescription: false` (no write access), `background: false`. Without the flag the app is exactly `app.json`: no HealthKit module, entitlement or usage text.
- Verified by generating the iOS project on Linux (`expo prebuild`, no build): with the flag the entitlements file holds only `com.apple.developer.healthkit`; `Info.plist` has `NSHealthShareUsageDescription`, no `NSHealthUpdateUsageDescription`, no `UIBackgroundModes`; without the flag the entitlements file is empty and no Health key exists.
- A production build given the flag **refuses to start** (`src/lib/env.ts`); only `staging-preview` and `staging-testflight` set it (a test pins this).
- Only a workout's id, type, start and end cross the boundary; calories, heart rate and routes are never read.
- Signing and the HealthKit capability on the App ID are **not changed by this checklist** (see `TESTFLIGHT_RELEASE_READINESS.md`: this needs your approval).

## 11. Production isolation safeguards (where they are enforced)

| Safeguard                                                                                                                                                  | Where                                                                      | Verified by                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Staging scripts accept only the designated ref and the confirmation phrase; the development ref and any other ref are refused                              | `scripts/staging/guard.mjs` (every staging script, including the gm probe) | `scripts/staging/staging.test.mjs`                   |
| The local launcher refuses any project except staging, secret keys and http URLs                                                                           | `scripts/friends-staging-ios.sh`                                           | `scripts/friends-staging-ios.test.mjs`               |
| A production build refuses to start with Community, Friends, Apple Health, the barcode sample list or content fixtures on                                  | `apps/mobile/src/lib/env.ts`                                               | `env.test.ts`, `buildConfig.test.ts`                 |
| Only the two staging profiles set the flags; the production profile cannot reach them; no profile enables content fixtures or contains a URL or credential | `apps/mobile/eas.json`                                                     | `buildConfig.test.ts`                                |
| HealthKit is added only when the flag is set                                                                                                               | `apps/mobile/app.config.js`                                                | `appConfig.test.ts` and the prebuild check           |
| Edge Functions use the platform-provided URL and service key of the project they are deployed to                                                           | `supabase/functions/*`                                                     | staging checks in `STAGING_STATUS.md`                |
| No client can reach any social, community or gamification table or function; only the service role can                                                     | each `*.up.sql`                                                            | the proposed SQL tests and the rehearsal's RLS guard |
| No secret in the repository or in the app                                                                                                                  | `pnpm check:secrets`                                                       | `scripts/secret-patterns.test.mjs`                   |

## 12. Exact command sheet (nothing here has been run on staging)

Set once, on the machine that runs the commands. The password and keys are entered by you and never pasted into chat.

```bash
export STAGING_REF=bxhnrjulksganzydgrgm
export STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT
export STAGING_PUBLISHABLE_KEY='sb_publishable_...'                      # publishable only
export STAGING_DB_URL='postgresql://postgres:<password>@db.bxhnrjulksganzydgrgm.supabase.co:5432/postgres'
cd Dancehall-AI && git fetch origin && git checkout <final reviewed commit> && git status -sb
```

**A. Read-only verification (section 2)**

```bash
node scripts/staging/check-access.mjs db && node scripts/staging/check-access.mjs function
node scripts/staging/gm-boundary-checks.mjs before
psql "$STAGING_DB_URL" -X -At -f supabase/staging/catalog-snapshot.sql > staging-before.txt
psql "$STAGING_DB_URL" -X -At -c "select version, name from supabase_migrations.schema_migrations order by version"
pg_dump --schema-only --schema=public --schema=app "$STAGING_DB_URL" > staging-schema-before.sql
```

**B. Apply (needs A1). Each step: verify the hash, apply in ONE transaction, snapshot, diff, stop on any difference**

```bash
cd supabase/proposed && PREV=../../staging-before.txt
for f in social.patch2_eligible_workouts health_sync.up gamification community.patch3_safety_phrases; do
  sha256sum "$f.sql"                                                   # must equal the recorded value (section 3)
  psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$f.sql"
  psql "$STAGING_DB_URL" -X -At -f ../staging/catalog-snapshot.sql > "../../after-$f.txt"
  diff "$PREV" "../../after-$f.txt" | grep -c '^[<>]'                    # compare with the expected change counts in section 4
  PREV="../../after-$f.txt"; read -p "Check passed? Enter to continue, Ctrl-C to stop " _
done
```

(`--single-transaction` is required for `health_sync.up` and `gamification.up`. For the two files that carry their own `begin;`/`commit;` it only adds a harmless warning.) `psql` does not write `supabase_migrations` history; when Claude applies the same files through the Supabase tool the history is recorded for you. If you use `psql`, record each step in `STAGING_STATUS.md` and tell Claude so the history can be reconciled.
**C. Redeploy the Edge Functions (needs A2; after B)**

```bash
supabase functions deploy social    --project-ref "$STAGING_REF" --no-verify-jwt
supabase functions deploy community --project-ref "$STAGING_REF" --no-verify-jwt
supabase functions deploy account   --project-ref "$STAGING_REF" --no-verify-jwt
node scripts/staging/gm-boundary-checks.mjs after && node scripts/staging/check-access.mjs function
```

(Confirm the flags with `supabase functions deploy --help` on your CLI version; if you do not use the CLI, Claude deploys the same files through the Supabase tool after approval. Either way, compare each deployed hash with the reviewed one and record version and hash.)
**D. Maintenance call (section 8; needs the `MAINTENANCE_KEY` value, which only you hold)**

```bash
export MAINTENANCE_KEY='...'
curl -sS -X POST "https://$STAGING_REF.supabase.co/functions/v1/account/maintenance/reap" -H "apikey: $STAGING_PUBLISHABLE_KEY" -H "x-maintenance-key: $MAINTENANCE_KEY"
# expect {"ok":true,"reaped":N,"pruned":...,"purged":0}  (purged a number, not null). A wrong key must return 401.
```

**E. Rollback (reverse order; needs your word that rollback is wanted)**

```bash
cd supabase/proposed
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f community.patch2_photo_immediate.sql        # undoes step 4
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f gamification.down.sql   # undoes step 3
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f health_sync.down.sql    # undoes step 2 (deletes apple_health workouts)
psql "$STAGING_DB_URL" -X -v ON_ERROR_STOP=1 -f social.patch2_eligible_workouts.down.sql     # undoes step 1
psql "$STAGING_DB_URL" -X -At -f ../staging/catalog-snapshot.sql > ../../staging-after-rollback.txt
diff ../../staging-before.txt ../../staging-after-rollback.txt && echo "ROLLBACK PROVEN: empty diff"
```

Then redeploy the previous Edge Function versions from their pinned commits if they were changed.

## 13. Sign-off record (fill in as you go)

| Step                          | Authorized by / date | Result | Snapshot diff empty/expected | Hash recorded |
| ----------------------------- | -------------------- | ------ | ---------------------------- | ------------- |
| Section 2 verification        |                      |        |                              |               |
| SQL 1 social.patch2           |                      |        |                              |               |
| SQL 2 health_sync             |                      |        |                              |               |
| SQL 3 gamification            |                      |        |                              |               |
| SQL 4 community.patch3        |                      |        |                              |               |
| Redeploy social               |                      |        |                              |               |
| Redeploy community            |                      |        |                              |               |
| Redeploy account              |                      |        |                              |               |
| Maintenance call and schedule |                      |        |                              |               |
| Smoke tests (section 9)       |                      |        |                              |               |
| Cleanup, network host removed |                      |        |                              |               |
