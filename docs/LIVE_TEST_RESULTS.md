# Live test results (development project `vvwjhbsyxetnktimgaxg`)

Counts and outcomes only; no credentials.

| Date       | Suite                                                              | Result                   | Notes                                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-14 | Migrations household, wellness, household_join_limit, celebrations | applied, each verified   | Each applied through the Supabase connector after approval; each checked with its `verify_NN` script (ALL OK). `verify_05_final`: 48/48 tables with RLS, catalog hashes equal a clean build of all 13, 13 history rows. |
| 2026-11-14 | `supabase/live/db_live_suite.sql` (database level)                 | **127 passed, 0 failed** | One transaction, synthetic identities, always rolled back; afterwards 0 synthetic users and 0 rows in the new tables.                                                                                                   |
| 2026-11-14 | HTTP adapter suite (`scripts/live-http.sh`)                        | **NOT RUN (blocked)**    | See below.                                                                                                                                                                                                              |
| 2026-11-14 | Storage API (inside the HTTP suite)                                | **NOT RUN (blocked)**    | See below.                                                                                                                                                                                                              |
| 2026-11-14 | Offline: typecheck, lint, unit tests, SQL tests, replica           | all pass                 | shared 220, admin 4, ai 102, mobile 389 (17 skipped are the opt-in live tests), script tests 20, SQL test files 16/16, replica fingerprint equals the hosted catalog.                                                   |

## Why the HTTP and Storage suites did not run

Two independent blockers. Neither is a code defect.

1. **Network.** The build sandbox's egress proxy answers `CONNECT <approved-project-ref>.supabase.co:443` with `403` (policy denial, not a timeout), so GoTrue, PostgREST and the Storage API are unreachable from here. `scripts/live-http.sh` stops at its reachability check for the same reason.
2. **No test users.** The project has 0 users (`auth.users` is empty). The suite needs two synthetic `.test` users with passwords, which the runbook has the owner create in the Dashboard (Authentication, Users, Add user, Auto Confirm). They were not created by the assistant.

Simplest supported alternative: follow `docs/LIVE_HTTP_RUNBOOK.md` from your own machine or from CI with outbound access: create the two users, put the project URL, the publishable key and the two logins in the git-ignored `apps/mobile/.env.live`, then `pnpm install && bash scripts/live-http.sh`. The publishable key is public by design and is available from the project's API settings. Paste only the pass and fail counts back here. If you would rather run it in this session, the sandbox's network allowlist needs `<approved-project-ref>.supabase.co` added (an environment setting you approve), and the two users must exist first.

## What the database-level suite did and did not prove

Proven on the hosted database (as the `authenticated` and `anon` roles with real JWT claims): RLS isolation between users, grants, constraints, triggers, the household RPCs including the five-incorrect-codes pause, the celebrations ledger, deletion requests, `SECURITY DEFINER` allowlist, and the private `food-photos` bucket's policies (read from the catalog).

Not proven until the HTTP suite runs: sign-in and session refresh against GoTrue, PostgREST routing and error mapping in the supabase-js adapters, and actual Storage uploads, downloads, other-user and anonymous refusal, and deletion.
