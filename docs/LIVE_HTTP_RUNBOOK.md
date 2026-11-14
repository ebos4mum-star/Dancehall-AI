# Running the HTTP live suite

The build sandbox's network policy blocks the project's API host, so the HTTP suite has to run from an environment that can reach `https://<approved-project-ref>.supabase.co` (your own machine, or CI with outbound access). Until it is run there, the HTTP adapter path, GoTrue sign-in and the Storage API are **not verified**. The database-level results (`supabase/live/db_live_suite.sql`) are real hosted-database tests but are not signed-in HTTP requests and do not replace this suite.

## Preconditions

1. The development project has the migrations in `supabase/hosted-history.json` applied (see `docs/LIVE_VERIFICATION.md`). The photo-upload tests need `food-photos` (migration `20261202000100`, already applied).
2. A machine that can reach `https://<approved-project-ref>.supabase.co` (your computer, not the build sandbox). Only that project is ever contacted; the suite's guard refuses any other URL.
3. Node 22.12+, pnpm, and `pnpm install` run in the repository.

## Create two temporary test users (no privileged key involved)

The service-role / secret key is **never** used, never typed into a script and never needed: the users are created by you in the dashboard, and the suites sign in with ordinary passwords using the **publishable** key only.

1. Copy the publishable key (`sb_publishable_...`) from _Project Settings, API_. Then generate the env file. Passwords are random, written with mode 600 to the git-ignored `apps/mobile/.env.live`, and **not printed**:

   ```bash
   LIVE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... bash scripts/live-test-users.sh init
   ```

   It prints the two synthetic emails (`live-a-<id>@example.test`, `live-b-<id>@example.test`; the `.test` domain can never be a real address).

2. In the dashboard: _Authentication, Users, Add user, Create new user_. Enter each email, paste the matching password (view it privately with `bash scripts/live-test-users.sh show-passwords`), and tick **Auto Confirm User**. This does not enable public sign-up or send any email.
3. Do not paste the passwords or the env file into chat, issues, PRs or CI logs.

## Run

```bash
bash scripts/live-http.sh
```

The script checks the project is reachable, exports `LIVE_SUPABASE=1` and runs only `apps/mobile/src/data/live`. It prints nothing secret, and it refuses any other URL, any non-publishable key, identical users and any email not ending in `.test`.

## What it verifies

Per-user isolation (reads, deletes, storage), wellness persistence for every kind with idempotent retries and a new session, typed failures for rejected writes, habits and the five-habit limit, households (invite, join, shared list, a housemate never seeing health data, and the five-incorrect-codes pause), the Pulse ledger (recorded once, visible to a second session, two sessions racing on one achievement claim it exactly once), the Daily Fit Plan reflecting a logged walk once, one active challenge, data export containing only the person's own data, account deletion as a cancellable request, and the private food-photo bucket (own read and write, other user and anonymous reads refused, writes into another user's folder refused), and the bucket's own limits (a PNG and an over-5 MB JPEG are refused by Storage itself, and an unauthenticated upload is refused).

## Clean up afterwards

```bash
bash scripts/live-test-users.sh clean
```

This securely deletes the env file. Then delete the two users in the dashboard (their rows cascade) and remove any leftover test objects in the `food-photos` bucket under their folders. The suite removes the rows and objects it creates, but a failed run can leave some behind. Users are temporary: do not keep them between sessions.

## Not covered by this suite

- Photo **analysis** through the server route (no AI gateway is deployed and no paid AI is enabled). The app's upload adapter is only offered when `EXPO_PUBLIC_AI_API_URL` is set, so against a bare project the camera still shows "not available yet". Its upload, validation and cleanup logic is covered offline (`supabasePhoto.test.ts`); the bucket's server-side limits are covered by the live Storage test above.
- Native behaviour: token refresh start/stop on foreground/background, the camera, secure storage. These need a real device (see `docs/LIVE_VERIFICATION.md`).

## Record the result

Record pass and fail counts (not credentials) in `docs/LIVE_TEST_RESULTS.md`.
