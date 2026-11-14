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

**Optional hardening, `household_join` (separate migration, not proposed for the first apply).** Invite codes have about 40 bits of entropy and the RPC has no attempt limit; Supabase's API rate limits and the 48-hour single-use expiry bound the risk. A per-user attempt counter would remove it. Low priority.

## Exact hosted changes to authorize first

Only these three additive migrations (contents pinned by `supabase/hosted-history.json` ordering; files in `supabase/migrations/`):

1. `20261207000100_habits.sql`: tables `habits`, `habit_checkins`, one trigger, one index each.
2. `20261208000100_household.sql`: five tables, helper functions in `app`, five RPCs in `public`, one trigger.
3. `20261209000100_wellness.sql`: `wellness_entries`, `wellness_prefs`.

No existing object is altered or dropped. Verified locally: clean database (all 15 SQL test files), and a replica of the hosted eight-migration state with only these three applied on top (`bash supabase/tests/replica.sh`: the replica first matches the hosted catalog fingerprint, the result equals a clean build of all 11 migrations, and all SQL tests pass on it).
