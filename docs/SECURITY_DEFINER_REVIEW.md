# SECURITY DEFINER review (development project `vvwjhbsyxetnktimgaxg`)

Reviewed against the actual function definitions (identical on the hosted project and in the repository, per the catalog fingerprint), their grants, owners and search paths. Nothing was changed on the hosted project.

## What the advisor reports

"Signed-in users can execute a SECURITY DEFINER function" for five functions in the exposed `public` schema. The advisor flags every such function regardless of what it does inside; it cannot tell whether the function checks its caller.

## Findings

All 18 `public` functions on the hosted project are owned by `postgres`, pin `search_path = ""` (an empty path, so no object can be shadowed), and are executable only by `service_role` plus, for the five below, `authenticated`. `anon` and PUBLIC have no execute on any of them.

| Function                       | Why it is definer                                                    | Caller check inside                                                                                                                                                                                                                             | Verdict                                                    |
| ------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `complete_onboarding()`        | Writes `profiles.onboarded_at`, which users have no column grant for | `auth.uid()` must be present; acts only on that user's profile; requires a complete profile and health-data consent                                                                                                                             | **Keep.** Self-scoped.                                     |
| `request_account_deletion()`   | Users have no insert grant on `account_deletion_requests` (tested)   | `auth.uid()` required; inserts for the caller only; idempotent (one pending request)                                                                                                                                                            | **Keep.** Self-scoped.                                     |
| `cancel_account_deletion()`    | Same                                                                 | `auth.uid()` required; updates only the caller's pending row (returns false for anyone else)                                                                                                                                                    | **Keep.** Self-scoped.                                     |
| `workout_playable_media(text)` | `media_assets` storage paths are not directly selectable             | Returns rows only for a **published** workout and only when **every** asset is licensed for the caller's country (`app.licence_allows`, `app.user_country`); otherwise nothing                                                                  | **Keep.** This is the licensing gate itself.               |
| `audit_verify()`               | Needs to read `audit_log` end to end                                 | If called by a signed-in user, requires `app.has_permission('audit.view')`, which needs an **aal2 (MFA) session and an admin staff role**; otherwise raises `permission denied` before reading anything. The server (`service_role`) is allowed | **Keep (recommended), with an optional tightening below.** |

After the pending household migration the advisor will report **five more** (`household_create`, `household_create_invite`, `household_join`, `household_leave`, `household_remove_member`). Reviewed the same way: each pins an empty `search_path`, uses `auth.uid()`, and only ever touches the caller's own membership or a household they own (`app.is_household_owner`); invites are 10 characters of a random UUID, hashed at rest, single use, 48 hours. These are all **intended**. Only `app` (not exposed over the API) holds the membership helper functions.

New regression test: `supabase/tests/14_definer_review.test.sql` pins this exact set of ten user-callable definer functions, requires an empty `search_path` and no anon/PUBLIC execute on every definer function in `public`, and re-proves the denials (anonymous and non-staff `audit_verify`, another person's deletion request, onboarding of an empty profile). A new user-callable definer function now fails CI until it is reviewed and added.

## Proposed hosted security changes

**Recommended: none.** Each flagged function is intentionally user-callable and checks its caller. Revoking them would break onboarding, account deletion, licensed-media playback and (after the pending migration) households. The five advisor warnings (ten after household) should be recorded as accepted, with this document as the rationale.

**Optional, `audit_verify` only (owner decision).** Only staff with MFA can use it today, and no client calls it. If you prefer least privilege over the staff path:

```sql
revoke execute on function public.audit_verify() from authenticated;
-- service_role keeps execute; staff would verify through a server route instead.
```

Consequences: removes one advisor warning; staff can no longer call it directly from a signed-in admin session; the test in `06_dance_catalog.test.sql` that checks an "authorized reader" (staff, aal2) would have to change to use the server role. Not applied and not committed as a migration.

**Household invite attempts (prepared as `20261211000100_household_join_limit.sql`, not applied).** Invite codes have about 40 bits of entropy, are hashed at rest, single use and expire after 48 hours. The migration adds a per-person limit: 5 incorrect codes in 15 minutes pause joining for that person (even a correct code) until the window passes; a correct join clears their count, and a typo or two is unaffected. Because an exception would roll back the record of a failed attempt, an incorrect or used code now **returns `null`** (the app maps it to "invalid invite") and only the limit raises (`too_many_attempts`). The function keeps its name, arguments, owner, empty `search_path` and grants, so the reviewed allowlist is unchanged; the new `household_join_attempts` table lets a person read only their own rows and nobody write directly. It is additive (one table, one in-place function replacement) and tested locally, in the replica path and in the mock store. Limit: an attacker with many accounts is bounded by sign-up limits rather than by this counter.

## Exact hosted changes to authorize first

Only the migrations listed as `pending` in `supabase/hosted-history.json` (files in `supabase/migrations/`), applied one at a time in file order:

1. `20261207000100_habits.sql`: tables `habits`, `habit_checkins`, one trigger, one index each.
2. `20261208000100_household.sql`: five tables, helper functions in `app`, five RPCs in `public`, one trigger.
3. `20261209000100_wellness.sql`: `wellness_entries`, `wellness_prefs`.
4. `20261211000100_household_join_limit.sql`: `household_join_attempts`; replaces `household_join` in place (see above).
5. `20261212000100_celebrations.sql`: `celebrations`; no functions, nothing `SECURITY DEFINER`.

No existing table or data is altered or dropped; the only replaced object is `household_join` (same signature, owner, search path and grants). Verified locally: clean database (all 15 SQL test files), and a replica of the hosted eight-migration state with only these applied on top (`bash supabase/tests/replica.sh`: the replica first matches the hosted catalog fingerprint, the result equals a clean build of all 13 migrations, and all SQL tests pass on it).

## Hosted result and trigger-function grant (2026-11-14)

All 13 migrations are applied to the development project and the 127-check hosted database suite passed (127 passed, 0 failed; see `docs/LIVE_TEST_RESULTS.md`).

**Finding: `app.household_after_member_delete()` is executable by `PUBLIC`.** It is the only `SECURITY DEFINER` trigger function that keeps the default `PUBLIC` execute grant (`audit_row` and `handle_new_user` revoke it). Measured on the hosted project: `anon` and `authenticated` both hold `EXECUTE`; `anon` has no `USAGE` on schema `app`, `authenticated` does.

**Risk: low, not exploitable today.** A function that returns `trigger` cannot be called directly. Measured as `authenticated`: `select app.household_after_member_delete()` fails with `0A000 trigger functions can only be called as triggers`. The grant is still wrong in principle (a definer function should not be callable by roles that never need it) and it is the one deviation from the pattern used by the other definer functions.

**Proposed minimal, backward-compatible correction (not applied, not added to `supabase/migrations/`, needs your approval):**

```sql
revoke execute on function app.household_after_member_delete() from public, anon, authenticated;
```

Why it is safe: a trigger fires with the privileges of the function's owner (it is `SECURITY DEFINER`) and the `EXECUTE` check happens when the trigger is created, not each time it fires, so member deletion, leaving, owner hand-over and account-deletion cascades behave exactly as before. Evidence, all local: with the revoke applied after all 13 migrations, `has_function_privilege` is false for `anon` and `authenticated`, and all 16 SQL test files pass (including `12_household`, `14_definer_review` and `99_owner_isolation`). If approved, ship it as one new migration (for example `20261213000100_revoke_household_trigger_execute.sql`) with a one-line assertion added to `14_definer_review.test.sql`, apply it through the same one-at-a-time procedure, and add it to `hosted-history.json`.

Also seen, and unchanged: the ordinary (non-definer) trigger and helper functions in `app` (`set_updated_at`, `habit_limit`, `validate_goal` and similar) carry the default `PUBLIC` execute grant as well. They are not `SECURITY DEFINER`, `anon` cannot reach schema `app`, and trigger functions cannot be called directly, so no correction is proposed for them. The pure helpers (`app.safety_limits`, `app.valid_territories`, `app.blocks_problems`, `app.audit_stamp`) are callable by `authenticated`; they read no user data.
