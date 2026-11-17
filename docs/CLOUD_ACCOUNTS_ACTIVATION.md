# Cloud accounts: controlled hosted activation proposal

**Status: a proposal. Nothing below has been done.** No hosted migration, Edge Function, secret or Auth setting has been applied or changed, no account exists, and M3 v2 and `20261213000100_household_trigger_revoke.sql` are not touched. Every gate needs the owner's explicit approval **for that gate**, and a later gate never starts because an earlier one passed. Target: the approved development project `<development-ref>` only. Until Gate 5 passes, say "implemented and tested locally", nothing stronger.

## What ships in the code

| Piece                                                                    | Where                                                                                        |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Migration (unexposed `app` tables, service-role-only `acct_*` functions) | `supabase/migrations/20261214000100_account_recovery.sql` (pending in `hosted-history.json`) |
| Rollback (tested: removes only these objects, migration re-applies)      | `supabase/rollback/20261214000100_account_recovery.down.sql`                                 |
| Edge Function                                                            | `supabase/functions/account/index.ts` + generated `_shared/generated/*`                      |
| App                                                                      | `apps/mobile/src/account/cloud/*`, `app/account/{questions,recovery-key,recover,rotate}.tsx` |

14 sorts after the still-pending 13 (`20261213000100`). They are independent; if only 14 is approved, push it with `--include-all`.

## Gate 0: pre-flight, read-only (no approval beyond "go")

1. Re-read the project (read-only): 13 migrations applied, 0 users, RLS on all public tables, fingerprint equals the replica (`docs/LIVE_VERIFICATION.md` method).
2. Confirm the local evidence is current: `pnpm verify`, the CI `Database tests` job (runs the account suite against the real SQL functions and the rollback), `pnpm check:edge`.
3. A second person reads the migration, `account-core.ts` and the function.

**Exit:** nothing changed; the list of unknowns in Gate 1 to 3 is the only uncertainty.

## Gate 1: migration (reversible; reachable by no client)

Approve: apply `20261214000100_account_recovery.sql`. Impact: four tables in the unexposed `app` schema and 17 functions that only the service role can execute. No existing table, policy or function changes.

- Check after: `app.acct_*` tables exist with RLS on; `has_function_privilege('authenticated', 'public.acct_status(jsonb)', 'execute')` and the same for `anon` are false; `select app.revoke_user_sessions(gen_random_uuid())` runs without error (proves `postgres` may delete from `auth.sessions` and `auth.refresh_tokens`); public table count and policy count unchanged; fingerprint differs only by these objects.
- **Rollback:** `supabase/rollback/20261214000100_account_recovery.down.sql`.

## Gate 2: Auth settings

Approve each setting separately; record the previous value first.

1. **Public sign-up off** (Providers → Email → "Allow new users to sign up"). Email provider stays **enabled** (password sign-in is how a phone proves its device secret). No email is ever sent: users are created pre-confirmed.
2. **JWT expiry 900 s.** After a recovery revokes sessions, an issued access token works until it expires; this bounds that. Keep refresh-token rotation and reuse detection on.
3. Review sign-in and token rate limits (not a concern for a 256-bit secret; they protect the service).
4. **Identifier acceptance is an open question the docs do not answer.** The Auth server may reject `@accounts.dancehall.invalid` (reserved TLD) at admin creation. This is tested for the first time in Gate 4. If it is rejected, set the function secret `ACCOUNT_IDENTIFIER_DOMAIN` to a domain the project controls whose mail goes nowhere (no code change), and re-run Gate 4.

**Rollback:** restore the recorded values.

## Gate 3: Edge Function deployment (flag still off, no app can reach it)

```bash
supabase secrets set ACCOUNT_PEPPER="$(openssl rand -base64 48)" MAINTENANCE_KEY="$(openssl rand -hex 32)" --project-ref <development-ref>
supabase functions deploy account --no-verify-jwt --project-ref <development-ref>
```

- `--no-verify-jwt` is required: create and start-recovery carry only the publishable key, which is not a JWT. The function itself authenticates the signed-in user (`auth.getUser`) for `status`, `rotate` and `recover/cancel`, and refuses anything else with 401.
- **Store `ACCOUNT_PEPPER` in a password manager first.** Losing it makes every stored recovery verifier unusable.
- Leave `ACCOUNT_COOLING_OFF_HOURS` unset (24). A value under one hour is ignored unless `ACCOUNT_ALLOW_SHORT_COOLING_OFF=1`; use that pair **only** for Gate 5 and remove both afterwards.
- The function has never run on the Edge (Deno) runtime; the first deploy may need small import fixes. That is the point of doing it with the flag off.
- Schedule the reaper (every 10 minutes): `POST /functions/v1/account/maintenance/reap` with header `x-maintenance-key`. Without it, an abandoned half-made account stays until someone deletes it.
- Check which forwarded-address header the platform sets (send one request and look at what the function sees): per-network limits depend on it; per-account lockouts and the service-wide sign-up cap do not.

**Rollback:** `supabase functions delete account`; unset the secrets; remove the schedule.

## Gate 4: test accounts and the first safe test

**First safe hosted test (one call, one throwaway account):** with Gates 1 to 3 done and the dev project at 0 users, send one `provision` request (script in the owner's shell, throwaway device secret and key, made-up answers). Expected: `200` with an identifier; a `signInWithPassword` with the device secret returns a session; `select id from profiles` returns exactly that user's row and a query for any other id returns nothing; repeating the same request returns the same identifier and `auth.users` still has one row. **Then delete that user** (dashboard or admin API); confirm its `app.acct_*` rows are gone (cascade). This single test answers the three biggest unknowns together: the identifier is accepted, the function runs on the Edge, and the session is a normal RLS-compatible session. If it fails, nothing else is attempted.

Then two throwaway accounts (A, B) for isolation: A cannot read B's rows; A's recovery calls cannot touch B.

## Gate 5: live verification (short cooling-off allowed only here)

Set `ACCOUNT_COOLING_OFF_HOURS=0.05` and `ACCOUNT_ALLOW_SHORT_COOLING_OFF=1` for the test, then remove both.

1. Interrupt creation (drop the connection after sending) and retry: exactly one `auth.users` row and one `app.acct_recovery` row.
2. Recover on a second client: wrong key and wrong answer return the same body; five wrong answers lock; the wait is enforced (an early `complete` returns 425); success gives the same user id and history; the first client's refresh token is refused; its access token dies within the JWT expiry.
3. Rotate: wrong answers refused, right answers replace the key, the old key fails.
4. Throttling: the 21st provision from one address within an hour is refused. The service-wide cap (300 an hour) is covered by the local suite, not by a live test.
5. Delete the test users; confirm cascades. Restore cooling-off to 24 and remove the allow flag.

Record results in `docs/LIVE_VERIFICATION.md`. Only now may anyone say cloud registration or recovery is verified on the development project.

## Gate 6A and 6B (done in code; no build created)

**6A, live mobile-client check:** `apps/mobile/src/account/cloud/accountLive.test.ts` (skipped by default; guarded to the project named in `DH_LIVE_APPROVED_REF`) runs the app's own account service, Edge API client and Supabase store against the development project with one throwaway account, records every request and console call, and proves: no email is needed, the PIN, answers and Recovery Keys never leave the device, and nothing sensitive is logged. Passed live; the account was deleted and its records verified gone.

**6B, `preview-cloud` EAS profile:** the only profile with `EXPO_PUBLIC_CLOUD_ACCOUNTS=1`. It is an internal preview build with no `extends`, no `autoIncrement`, no channel and no submit entry. It takes the project URL and publishable key from the EAS `preview` **environment** (`"environment": "preview"`), because the public repository must not contain the project hostname. **Owner step before any build:** create `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the EAS `preview` environment (publishable key only). The default, preview and production profiles are unchanged. A production build refuses to start with the flag on (`resolveConfig`), and tests enforce that only `preview-cloud` enables it.

## Gate 6: enable the mobile flag

Set `EXPO_PUBLIC_CLOUD_ACCOUNTS=1` in a **development or preview** build only. It is off by default. Among the EAS profiles only `preview-cloud` sets it (a unit test enforces this); `development`, `preview` and `production` never do, and a production build refuses to start with it on. Native checks (Keychain item storage, share sheet, Face ID, scrypt time on an older phone) need a Mac, simulator or an authorised build and are **not** covered by Gates 0 to 5. No TestFlight upload and no production profile are part of this proposal.

Gate 6C (the iPhone test) follows `docs/GATE_6C_IPHONE_CHECKLIST.md`.

## Replay fix (found in the live Gate 5 test; APPLIED to the development project, verified live)

An identical replay of a completed `recover/complete` request returned success but re-ran the secret update and the session revocation, which signed out a new device that had already signed in. `supabase/migrations/20261215000100_account_recovery_replay_fix.sql` records when a completion's follow-up work was fully applied (`applied_at`); a replay of a fully applied completion now does nothing and returns the identifier, while a replay of one that was not finished (the function died after marking it done) still completes the work.

Applied in this order (done on the development project: migration version `20261115191325`, then the function redeployed from the merged commit; live regression passed: three identical replays left the recovered device's session valid, and a replay of an unfinished completion finished the work once). Order used, each step needing approval: (1) apply the migration (backward compatible: the deployed function ignores the new fields); (2) redeploy the `account` function from the commit that includes the fix; (3) re-run the replay check of the Gate 5 harness (`recover2` phase, replay section) to confirm the new device's refresh token survives an identical replay. Rollback: `supabase/rollback/20261215000100_account_recovery_replay_fix.down.sql` (tested in CI before the first migration's rollback).

## Rollback summary

Flag off in new builds; delete the function and schedule; run the down script; restore Auth settings. Accounts already made keep working with Supabase directly but cannot be recovered; deleting them deletes their data and is a separate decision.

## Remaining risks

- **Unverified live:** identifier acceptance, the Edge runtime, the forwarded-address header, `postgres` deleting from `auth.sessions`, device storage and share sheet, scrypt cost on older phones.
- **No out-of-band alert** of a started recovery; the cooling-off and owner cancel depend on the owner having a signed-in phone or noticing. Someone holding the key and the answers can take the account after the wait.
- **Key plus answers together is the whole credential.**
- **Access tokens outlive revocation** until the (short) JWT expiry.
- A flood can briefly stop NEW sign-ups (the service-wide cap); it cannot stop recovery.
- **Password-manager saving is user-initiated through the share sheet**, not automatic; native Associated Domains / Credential Manager integration is not included.
- Losing the pepper, or the key and its backup, is not recoverable.
