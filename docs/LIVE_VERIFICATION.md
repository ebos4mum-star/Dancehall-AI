# Live verification of the development project

Status as of this document: **read-only inspection done; nothing was applied, created or changed on the hosted project.**

## 1. Project access status

- Project ID `vvwjhbsyxetnktimgaxg`, region `us-east-2`, Postgres 17, status `ACTIVE_HEALTHY`, created 2026-11-14.
- The Supabase connection available to the development environment **can reach this exact project ID**. Only calls naming this ID were made (project details, migration list, table list, edge-function list, catalog queries, security advisors). No other project was listed or accessed, and no project was created.
- **Discrepancy to confirm:** the project is named `ebos4mum@gmail.com's Project` in organization slug `kzvcczbyzgxuwugwnscx`, not `dancehall-fit-ai-dev`. Its contents are unambiguously DanceHall (see below), so it is treated as the intended project, but the owner should confirm the organization and may want to rename it.
- Real sign-in (email one-time code), SMTP and the app's `.env.local` have not been configured against it.

## 2. Reconciliation (read-only)

| Item           | Hosted project                                                                                                                                                                            | Repository                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Migrations     | 8 applied: identity_consent, weight_goals_readiness, food_nutrition, dance_catalog, coach, integration, deletion_config, fit_challenges (versions `20261114150446`..`20261114150755`)     | 11 files; **pending: habits, household, wellness**                       |
| Schema         | Seven catalog fingerprints (columns, constraints, functions incl. `app.*`, indexes, policies, triggers, RLS) are **identical** to a local database built from the first 8 repo migrations | no drift in the applied part                                             |
| Tables         | 37 public tables, RLS enabled on all 37, 102 policies, 18 public and 30 `app` functions, 25 triggers                                                                                      | matches                                                                  |
| Seed data      | 50 foods, 1 instructor, 14 workouts, 1 program with 12 entries, 4 feature flags (all AI kill switches `false`), `account_deletion_grace_days = 30`                                        | matches `seed.sql` (synthetic, unreviewed)                               |
| User data      | 0 auth users, 0 rows in every user table, 0 storage objects                                                                                                                               | nothing to preserve                                                      |
| Storage        | one bucket, `food-photos`, **private**                                                                                                                                                    | matches                                                                  |
| Edge functions | none deployed                                                                                                                                                                             | `supabase/functions` is a placeholder; the AI route is not deployed      |
| Jobs           | no `pg_cron`/`pg_net`; no scheduled jobs                                                                                                                                                  | retention, photo-expiry and deletion jobs are server code, not scheduled |

Security advisor (hosted): 5 warnings, all "signed-in users can execute a SECURITY DEFINER function": `audit_verify`, `cancel_account_deletion`, `complete_onboarding`, `request_account_deletion`, `workout_playable_media`. The grants exist in the repo migrations on purpose (user-callable RPCs that check `auth.uid()` or the caller inside). **Owner/reviewer decision:** confirm each is intended, `docs/SECURITY_DEFINER_REVIEW.md` reviews each against its definition and recommends **no hosted change**; an optional `audit_verify` tightening is documented there. No change was made.

## 3. Non-destructive migration plan (not executed)

The three pending migrations are purely additive: new tables, indexes, triggers, policies, grants and functions. They contain no `alter`, `drop`, `update` or `delete` of existing objects, and the hosted tables they reference (`profiles`, `consents`, `app.has_consent`) exist.

Order and contents:

1. `20261207000100_habits.sql`: `habits`, `habit_checkins`.
2. `20261208000100_household.sql`: five household tables, membership helper functions, five RPCs.
3. `20261209000100_wellness.sql`: `wellness_entries`, `wellness_prefs`.

Before: take a database backup or a Supabase branch if available (the project has no user data, so this is a precaution); re-run the fingerprint query (below) and confirm it still matches.
Apply (needs explicit owner approval): one migration at a time, in the order above, as a named migration with the exact repository SQL, stopping at the first error.
After each: re-run `supabase/tests`-equivalent checks that can run hosted (RLS enabled on the new tables, advisor output, policy count), then the live suite (section 4).
Rollback (no data exists yet): drop only the objects that migration created. Do not touch earlier migrations.

**History reconciliation (not executed).** The record of what is applied is `supabase/hosted-history.json`: eight hosted rows (versions `20261114150446` to `20261114150755`) mapped by name to eight repository files, each pinned by SHA-256 (`scripts/migration-history.test.mjs` fails if an applied migration is edited, a record stops matching a file, or a pending file sorts before an applied one). The hosted rows are real history and are never rewritten or deleted. Two ways to apply the three pending files; choose one:

- **A. By name through the dashboard or MCP (recommended, simplest).** Apply the three files, one at a time, as migrations named `habits`, `household`, `wellness`. Each gets a new hosted version at apply time; the history then holds eleven rows whose names match the repository one-to-one. No history repair, no renaming. Afterwards update `hosted-history.json` (applied list and fingerprint) in a PR.
- **B. Supabase CLI `db push`.** The CLI matches by version, and the repository file versions (`20261201...`) differ from the hosted ones (`20261114...`), so a plain `db push` would try to re-run the eight applied migrations and fail. To use it safely, first `git mv` the eight applied files to their hosted versions (contents unchanged, so the pinned hashes still hold; the order stays the same because `20261114...` sorts before `20261207...`), update `hosted-history.json` `file` fields, and run `db push --dry-run` to confirm it lists only the three pending files. This keeps hosted history exactly as it is. Do **not** use `migration repair --status reverted`, which deletes real history rows.

Either way, before and after every apply: run the fingerprint query in section 6 and compare with the baseline (before) and with `bash supabase/tests/replica.sh`'s clean-build result (after).

Fingerprint query (read-only, run on both databases and compare): see section 6.

## 4. Controlled live testing (prepared, not run)

`apps/mobile/src/data/live/live.test.ts` runs the **real Supabase adapters** against the hosted project. It is skipped unless explicitly enabled and refuses any URL but the exact project above, any key that is not `sb_publishable_`, and identical users. Run order: apply approved migrations first, then:

1. In the dashboard create **two synthetic test users** (for example `live-a@example.test`, `live-b@example.test`) with passwords, email confirmation off for these two only. This does not activate real sign-in in the app (the app still uses mock mode unless `EXPO_PUBLIC_AUTH_MODE=supabase`).
2. `LIVE_SUPABASE=1 LIVE_SUPABASE_URL=https://<approved-project-ref>.supabase.co LIVE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... LIVE_USER_A_EMAIL=... LIVE_USER_A_PASSWORD=... LIVE_USER_B_EMAIL=... LIVE_USER_B_PASSWORD=... pnpm --filter @dancehall/mobile test -- live`
3. Credentials stay in the shell environment; never commit them. The suite removes the rows and objects it creates.

What it verifies: user isolation (B cannot read or delete A's wellness, weight, food or challenges), wellness persistence and idempotent retry, typed failure for a rejected write, Daily Fit Plan reflecting a logged walk exactly once, one active challenge at a time, data export including wellness, account deletion as an idempotent, cancellable request (never executed), and storage privacy (private bucket, no cross-user read or write, anonymous read blocked).

Not covered live, and why:

- **Coach wellness context:** needs the server AI route, which is not deployed. It is covered offline (fake client) in `supabase-ports.test.ts`.
- **Photo analysis and real deletion execution:** server jobs, not deployed.
- **Native behavior:** needs a device or simulator.

## 5. Safe next steps, in order

1. Owner confirms the project/organization identity (section 1) and the five advisor warnings (section 2).
2. Owner approves applying the three additive migrations (section 3); apply one at a time.
3. Owner creates the two test users; run the live suite (section 4) and record the result.
4. Only then set `EXPO_PUBLIC_AUTH_MODE=supabase` locally (git-ignored `.env.local`) for a controlled device or simulator pass. Paid AI, the AI route, payments and HealthKit stay off.

## 6. Fingerprint query

```sql
select 'columns' k, count(*) n, md5(string_agg(t,'|' order by t)) h from (select table_name||':'||string_agg(column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,''), ',' order by ordinal_position) t from information_schema.columns where table_schema='public' and table_name in (select tablename from pg_tables where schemaname='public') group by table_name) x
union all select 'policies', count(*), md5(string_agg(tablename||policyname||cmd||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename,policyname)) from pg_policies where schemaname='public'
union all select 'functions', count(*), md5(string_agg(n.nspname||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(p.prosrc),'|' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app')
union all select 'constraints', count(*), md5(string_agg(conrelid::regclass::text||conname||pg_get_constraintdef(c.oid),'|' order by conrelid::regclass::text,conname)) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'
union all select 'indexes', count(*), md5(string_agg(indexdef,'|' order by indexname)) from pg_indexes where schemaname='public'
union all select 'triggers', count(*), md5(string_agg(c.relname||t.tgname,'|' order by c.relname,t.tgname)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public'
union all select 'rls', count(*), md5(string_agg(tablename||rowsecurity::text,'|' order by tablename)) from pg_tables where schemaname='public'
order by 1;
```

Baseline for the 8 applied migrations: columns `93d0c410…` (37), constraints `d02ed905…` (238), functions `22933198…` (48), indexes `d6ecf422…` (66), policies `5c0451a6…` (102), rls `055280a0…` (37), triggers `8f61fb1a…` (25).
