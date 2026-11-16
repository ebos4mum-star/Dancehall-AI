# Staging status

Staging project: `bxhnrjulksganzydgrgm` (designated by the owner). Development `vvwjhbsyxetnktimgaxg` was not touched. Production does not exist yet. `main` is unchanged.

## Guard
`scripts/staging/guard.mjs` allows only the designated staging ref and refuses the development ref and any unknown ref. Its tests pass (9).

## Isolation
The project was empty before setup (no users, no tables, no functions). Identity was checked read-only before any change.

## Migrations applied (19, SHA-256 verified, pinned to commit ac889a6cfbc30b6fc5d97a2f465a57f5d2529bda)
Identity/consent, weight and goals, food, dance catalog, coach, integration, deletion config, challenges, habits, household (and join limit, trigger revoke), wellness, celebrations, account recovery (and replay fix), community, community storage, and the proposed account-deletion executor. The temporary `http` loader extension was removed afterwards.

## Real database tests (`supabase/staging/real-db-checks.sql`)
Run in three rolled-back parts: 24 + 14 + 6 = **44 passed, 0 failed**. After the runs staging held no users, posts, audit rows, staff rows or orphan files.
Covered: members and anonymous callers cannot reach Community tables or functions; username rules; text and weight-claim moderation; comments and video refused by the database; private, verified, owner-only photo uploads held before publication; moderator needs a second factor; audit chain verifies; urgent child-safety reports hide at once; muting; Read only mode; the account-deletion executor (waits, deletes only the due account, cascades, queues storage files); owner isolation on health data.
Community defaults: mode open, video off, comments off. Security advisors show no Community findings.

## Not tested (cannot be reached from this environment)
HTTP checks, the Edge Function, real MFA tokens, signed links, concurrency. The `community` Edge Function is **not deployed**.

## Unresolved
- EAS variables could not be read (no Expo credentials here).
- Owner to run on their own machine: `STAGING_REF=bxhnrjulksganzydgrgm STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT STAGING_PUBLISHABLE_KEY=<publishable key> node scripts/staging/check-access.mjs db`
- Function deployment needs owner-entered secrets.

---

# Phase 2: Community Edge Function in staging (2026-11-16)

Project reference verified (`get_project` returned `bxhnrjulksganzydgrgm`) before the mode change and before the deployment. Development project untouched. `main` untouched. No PR.

## Actions taken
| Step | Result | Evidence |
| --- | --- | --- |
| Stored mode set to Read only | DONE | migration `staging_community_mode_read_only`; read back `mode=read_only, video_enabled=false, comments_enabled=false` |
| Secrets `COMMUNITY_PEPPER`, `COMMUNITY_MAINTENANCE_KEY`, `COMMUNITY_FLOOR_MODE` | STORED (entered by the owner in the Supabase prompt; values never seen, printed or committed) | tool replied `stored: true` for each. **The value of `COMMUNITY_FLOOR_MODE` is unverified by me**; check C1b below confirms the effective mode |
| `COMMUNITY_COMMENTS`, `COMMUNITY_ALERTS`, `COMMUNITY_DEBUG` | left UNSET | comments and alerts stay off at API level |
| Function `community` deployed | DONE, version 1, ACTIVE, `verify_jwt=false` (the function verifies every token itself; guests need none) | id `ce5f33b0-f9df-4ff5-8d03-18f48383be03`, ezbr sha256 `c1bde39d0e33c7a98b058d00dd24991ba115bd5c10d2a582f4302689db5359c8` |
| Code provenance | `index.ts` with its three shared imports pinned to GitHub commit `1016225b2d9de3d32f4f32a0d966ed43cd2d0e2c` (same code as `supabase/functions/community/` at that commit; only the import paths differ) | |
| Synthetic seed data | one synthetic member `staging_seed` and one published synthetic post (`00000000-0000-4000-8000-0000000000b1`) so browse, report and block can be tested. No real data | removable with a delete of that user |

## Results
**Not one HTTP test could be run from this environment**: the egress proxy refuses `bxhnrjulksganzydgrgm.supabase.co` (`connect_rejected`), so none of the function's endpoints were called. I am not reporting any of them as passed.

| # | Check | Status | Evidence / what is needed |
| --- | --- | --- | --- |
| R1 | Stored mode is Read only | **PASS** | SQL read-back above |
| R2 | Video and comments disabled in the database | **PASS** | `video_enabled=false`, `comments_enabled=false`; also DB tests T5/T6 (44/44) |
| R3 | Comments and alerts disabled at API level | **PASS (by configuration)** | env vars unset; unverified over HTTP (check C1c) |
| R4 | Effective mode Read only over HTTP | **BLOCKED** | `check-access.mjs function` check C1b |
| R5 | Guests can browse approved content | **BLOCKED** | `member-checks.mjs` D1 |
| R6 | Guests cannot post | **BLOCKED** | D2; `check-access.mjs function` C2 |
| R7 | Members cannot post in Read only | **BLOCKED** | E1, I3 |
| R8 | JWT verification, forged, revoked token | **BLOCKED** | F1, F2, F5 (F6 expired token needs time) |
| R9 | Moderator MFA (aal1 refused, aal2 allowed) | **PARTLY**: database level PASS (T8, DB tests); HTTP level **BLOCKED** | needs a staff account with an enrolled second factor (below) |
| R10 | Reporting, blocking | **BLOCKED** over HTTP; database level PASS (T9) | G1, G2 |
| R11 | Private photo access, signed links | **BLOCKED**, and cannot be run in Read only | photos are refused in Read only by design. Testing them needs your approval to switch staging to `text_only`/`open` temporarily; I have not done so |
| R12 | Account deletion through the real API | **BLOCKED** (request) ; executor DB-level PASS (T10) | J1, J2 |
| R13 | HTTP rate limits, concurrency, error handling | **BLOCKED** | H1-H3, I1-I3 |
| R14 | Unauthorized writes, exposed media, MFA bypass | **No evidence of any**; nothing could be exercised over HTTP, so this is not a pass | |

## Commands for your machine (staging only; secrets in your environment, never pasted into chat)
```bash
export STAGING_REF=bxhnrjulksganzydgrgm
export STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT
export STAGING_PUBLISHABLE_KEY=<staging publishable key>
node scripts/staging/check-access.mjs db
node scripts/staging/check-access.mjs function
```
Stop at the first FAIL and send me the output. Then create one throwaway test member (Supabase dashboard, Authentication, Add user, auto-confirm) and run:
```bash
export STAGING_MEMBER_EMAIL=<test member email>
export STAGING_MEMBER_PASSWORD=<test member password>
node scripts/staging/member-checks.mjs
```
`member-checks.mjs` signs the member out globally (F5), so run it only with a throwaway account. The script prints PASS/FAIL per check and no secrets.

Moderator MFA over HTTP (manual): add a second throwaway member as a moderator (`insert into public.staff_roles (user_id, role) values ('<id>', 'moderator')` in the staging SQL editor), sign in, call `mod/queue` with the password-only token (expect 401/403), enrol a TOTP factor in the dashboard flow, sign in again at aal2, call `mod/queue` (expect 200 and no account ids). I have not run this.

## Remaining decisions
1. Permission to switch staging to `text_only` temporarily to test photo privacy and signed links, then back to Read only.
2. Whether to allow `*.supabase.co` for this sandbox session so I can run the HTTP tests myself (network setting you control).
