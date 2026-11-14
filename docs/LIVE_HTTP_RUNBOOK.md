# Running the HTTP live suite

The build sandbox's network policy blocks the project's API host, so the HTTP suite has to run from an environment that can reach `https://vvwjhbsyxetnktimgaxg.supabase.co` (your own machine, or CI with outbound access). Until it is run there, the HTTP adapter path, GoTrue sign-in and the Storage API are **not verified**. The database-level results (`supabase/live/db_live_suite.sql`) are real hosted-database tests but are not signed-in HTTP requests and do not replace this suite.

## Preconditions

1. The five migrations are applied to the development project (see `docs/LIVE_VERIFICATION.md`).
2. Two synthetic users exist in that project, created by you in the Supabase dashboard (Authentication, Users, Add user, "Auto Confirm User") with emails ending `.test`, for example `live-a@example.test` and `live-b@example.test`, and strong random passwords. This does not turn on public sign-up or any email sending. Password sign-in for existing users is part of the default email provider.
3. The project URL and the **publishable** key (`sb_publishable_...`). Never use a secret or service key; the suite refuses them.

## Run

Put the values in a git-ignored file (`apps/mobile/.env.live`, already in `.gitignore`) or in your shell:

```
LIVE_SUPABASE_URL=https://vvwjhbsyxetnktimgaxg.supabase.co
LIVE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
LIVE_USER_A_EMAIL=live-a@example.test
LIVE_USER_A_PASSWORD=...
LIVE_USER_B_EMAIL=live-b@example.test
LIVE_USER_B_PASSWORD=...
```

then `pnpm install && bash scripts/live-http.sh`. The script prints nothing secret. The suite refuses any other URL, any non-publishable key, identical users, and any email that does not end in `.test`.

## What it verifies

Per-user isolation (reads, deletes, storage), wellness persistence for every kind with idempotent retries and a new session, typed failures for rejected writes, habits and the five-habit limit, households (invite, join, shared list, a housemate never seeing health data, and the five-incorrect-codes pause), the Pulse ledger (recorded once, visible to a second session, two sessions racing on one achievement claim it exactly once), the Daily Fit Plan reflecting a logged walk once, one active challenge, data export containing only the person's own data, account deletion as a cancellable request, and the private food-photo bucket (own read and write, other user and anonymous reads refused, writes into another user's folder refused).

## Clean up afterwards

Delete the two users in the dashboard (their rows cascade). Remove any leftover test objects in the `food-photos` bucket under their folders. The suite removes the rows and objects it creates, but a failed run can leave some behind.

## Record the result

Record pass and fail counts (not credentials) in `docs/LIVE_TEST_RESULTS.md`.
