# Cloud accounts: what must be authorised, how to activate, how to roll back

**Status: code complete and tested locally. Nothing below has been done.** No hosted migration, Edge Function, secret or Auth setting has been applied or changed, and no production account exists. Each step needs separate approval. Do not describe cloud registration or recovery as live until step 7 has passed against the approved project (`vvwjhbsyxetnktimgaxg`, development only).

## 0. What ships in this change

| Piece                                                                                    | Where                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Migration (tables in the unexposed `app` schema, `acct_*` functions, session revocation) | `supabase/migrations/20261214000100_account_recovery.sql` (listed as pending in `hosted-history.json`) |
| Edge Function                                                                            | `supabase/functions/account/index.ts` + generated `supabase/functions/_shared/generated/*`             |
| Shared account logic, tests                                                              | `packages/shared/src/account-*.ts`, `recovery-key.ts`, `security-questions.ts`                         |
| App                                                                                      | `apps/mobile/src/account/cloud/*`, `app/account/{questions,recovery-key,recover,rotate}.tsx`           |

The migration is independent of `20261213000100_household_trigger_revoke.sql` (still pending, not applied here) and of M3 v2 (not touched). Hosted history lists 13 before 14; apply them in that order, or push with `--include-all` if only 14 is approved.

## 1. Review

Have a second person read the migration, `account-core.ts` and the Edge Function. Re-run `pnpm verify` and the local database job; the same account suite runs against the real SQL functions.

## 2. Apply the migration (needs approval)

1. Dry run on a throwaway Postgres: `bash supabase/tests/run.sh` and `bash supabase/tests/replica.sh` (both already in CI).
2. Apply `20261214000100_account_recovery.sql` to the approved project.
3. Check: the four `app.acct_*` tables exist with RLS on; `has_function_privilege('authenticated', 'public.acct_status(jsonb)', 'execute')` is false; the catalog fingerprint changes only by these objects.
4. Confirm the `postgres` role can delete from `auth.sessions` and `auth.refresh_tokens` (the revocation function relies on it): `select app.revoke_user_sessions(gen_random_uuid())` must not raise.

## 3. Authentication settings (needs approval; none changed here)

- **Keep public sign-up off** (Authentication → Providers → Email → "Allow new users to sign up" off). Accounts are created only by the function with the admin API. The Email provider itself must stay **enabled**, because password sign-in is how the phone proves its device secret. No email is ever sent: users are created with the address pre-confirmed.
- **JWT expiry: set to 900 seconds (15 minutes).** After recovery revokes sessions, an already-issued access token still works until it expires; a short expiry bounds that window. Keep refresh-token rotation and reuse detection on (the defaults).
- **Rate limits:** review the sign-in and token limits. Brute-forcing a 256-bit secret is not a concern; the limits protect the service.
- **Verify the synthetic identifier is accepted.** Admin creation with an `@accounts.dancehall.invalid` address is expected to work. **This is unverified.** If GoTrue rejects the domain, use a domain the project controls whose mail goes nowhere, and change `identifier` in `account-core.ts`, regenerate the copy, and re-run the suites.
- Leave the developer email-code sign-in alone: it only works in development builds and cannot create users once sign-up is off.

## 4. Deploy the Edge Function and its secrets (needs approval)

```bash
supabase secrets set ACCOUNT_PEPPER="$(openssl rand -base64 48)" MAINTENANCE_KEY="$(openssl rand -hex 32)" --project-ref vvwjhbsyxetnktimgaxg
supabase functions deploy account --no-verify-jwt --project-ref vvwjhbsyxetnktimgaxg
```

- `--no-verify-jwt` is required: the unauthenticated operations (create, start recovery) carry only the publishable key, which is not a JWT. The function checks the signed-in user itself (`auth.getUser`) for the three operations that need one (`status`, `rotate`, `recover/cancel`).
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function by the platform. They never go in the app, the repository or a build profile.
- **Back up `ACCOUNT_PEPPER` somewhere safe.** Losing it makes every stored recovery verifier unusable (people could no longer recover; sessions and data are unaffected).
- Optional: `ACCOUNT_COOLING_OFF_HOURS` (default 24). For the live test below only, set it low, then **restore 24**.
- The function was written for Deno and **has not been run on the Edge runtime**: the first deploy may need small import fixes.

## 5. Schedule the reaper (needs approval)

An unfinished provisioning older than 10 minutes must be deleted. Call `POST /functions/v1/account/maintenance/reap` with header `x-maintenance-key: <MAINTENANCE_KEY>` every 10 minutes from Supabase's scheduler (pg_cron + pg_net) or any external scheduler. It also prunes finished transactions and old rate-limit buckets.

## 6. Switch the app on

Set `EXPO_PUBLIC_CLOUD_ACCOUNTS=1` for the build. It is off by default in every Supabase build, and no EAS profile sets it (a unit test enforces this), so an unauthorised build never offers a flow that cannot work. A build with it on but the function not deployed fails with "could not reach the account service. Nothing was changed."

## 7. Verify against the project (the only evidence that counts)

Using two throwaway accounts on the approved development project:

1. Create account → key shown → sign-in succeeds → `profiles` row exists, own rows readable, the other account's rows not.
2. Interrupt (airplane mode) mid-creation → retry → exactly one `auth.users` row and one `app.acct_recovery` row.
3. Recover on a second device → cooling-off respected (use a short `ACCOUNT_COOLING_OFF_HOURS` for the test only) → same user id, same history, new key, old phone's next token refresh fails.
4. Wrong answers ×5 → lock; the same generic message as a wrong key.
5. Rotate the key; the old one fails.
6. Delete the test users and confirm cascade removed their `app.acct_*` rows.

Record the results in `docs/LIVE_VERIFICATION.md`. Until this is done, say "implemented and tested locally" and nothing stronger.

## Rollback

1. Unset `EXPO_PUBLIC_CLOUD_ACCOUNTS` in new builds (existing builds' create and recover screens will report the service unavailable).
2. `supabase functions delete account --project-ref vvwjhbsyxetnktimgaxg`
3. Remove the scheduled reaper.
4. Optional data removal (accounts made through this flow keep working with Supabase directly, but can no longer be recovered; deleting their users deletes their data):

```sql
drop function if exists public.acct_provision_begin(jsonb), public.acct_provision_attach(jsonb), public.acct_provision_finalize(jsonb),
  public.acct_provision_abort(jsonb), public.acct_stale_pending(jsonb), public.acct_hit(jsonb), public.acct_by_digest(jsonb),
  public.acct_tx_open(jsonb), public.acct_tx_verify(jsonb), public.acct_tx_complete(jsonb), public.acct_tx_revert(jsonb),
  public.acct_cancel_recoveries(jsonb), public.acct_rotate(jsonb), public.acct_status(jsonb), public.acct_revoke_sessions(jsonb),
  public.acct_prune(jsonb), app.revoke_user_sessions(uuid);
drop table if exists app.acct_tx, app.acct_recovery, app.acct_provisioning, app.acct_hits;
```

5. Revert the Auth changes (JWT expiry) if they were made only for this feature.

## Remaining risks

- **Unverified live:** identifier acceptance, the Edge runtime, which forwarded-address header the platform sets (rate limits per network depend on it; per-account lockouts do not), `postgres` deleting from `auth.sessions`, secure storage and the share sheet on a device, scrypt time on older phones (about one to a few seconds in JavaScript).
- **No out-of-band notification** of a started recovery (no email by design); the cooling-off and owner cancel depend on the owner having a signed-in phone or noticing.
- **Key plus answers together is the whole credential.**
- **Access tokens outlive revocation** until the (short) JWT expiry.
- **Password-manager saving is user-initiated through the share sheet**, not automatic; native Associated Domains / Credential Manager integration is not included.
- Losing the pepper, or the key and its backup, is not recoverable.
