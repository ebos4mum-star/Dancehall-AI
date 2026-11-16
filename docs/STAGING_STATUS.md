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

| Step                                                                            | Result                                                                                                                                                                                                  | Evidence                                                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored mode set to Read only                                                    | DONE                                                                                                                                                                                                    | migration `staging_community_mode_read_only`; read back `mode=read_only, video_enabled=false, comments_enabled=false`                          |
| Secrets `COMMUNITY_PEPPER`, `COMMUNITY_MAINTENANCE_KEY`, `COMMUNITY_FLOOR_MODE` | STORED (entered by the owner in the Supabase prompt; values never seen, printed or committed)                                                                                                           | tool replied `stored: true` for each. **The value of `COMMUNITY_FLOOR_MODE` is unverified by me**; check C1b below confirms the effective mode |
| `COMMUNITY_COMMENTS`, `COMMUNITY_ALERTS`, `COMMUNITY_DEBUG`                     | left UNSET                                                                                                                                                                                              | comments and alerts stay off at API level                                                                                                      |
| Function `community` deployed                                                   | DONE, version 1, ACTIVE, `verify_jwt=false` (the function verifies every token itself; guests need none)                                                                                                | id `ce5f33b0-f9df-4ff5-8d03-18f48383be03`, ezbr sha256 `c1bde39d0e33c7a98b058d00dd24991ba115bd5c10d2a582f4302689db5359c8`                      |
| Code provenance                                                                 | `index.ts` with its three shared imports pinned to GitHub commit `1016225b2d9de3d32f4f32a0d966ed43cd2d0e2c` (same code as `supabase/functions/community/` at that commit; only the import paths differ) |                                                                                                                                                |
| Synthetic seed data                                                             | one synthetic member `staging_seed` and one published synthetic post (`00000000-0000-4000-8000-0000000000b1`) so browse, report and block can be tested. No real data                                   | removable with a delete of that user                                                                                                           |

## Results

**Not one HTTP test could be run from this environment**: the egress proxy refuses `bxhnrjulksganzydgrgm.supabase.co` (`connect_rejected`), so none of the function's endpoints were called. I am not reporting any of them as passed.

| #   | Check                                          | Status                                                                              | Evidence / what is needed                                                                                                                           |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Stored mode is Read only                       | **PASS**                                                                            | SQL read-back above                                                                                                                                 |
| R2  | Video and comments disabled in the database    | **PASS**                                                                            | `video_enabled=false`, `comments_enabled=false`; also DB tests T5/T6 (44/44)                                                                        |
| R3  | Comments and alerts disabled at API level      | **PASS (by configuration)**                                                         | env vars unset; unverified over HTTP (check C1c)                                                                                                    |
| R4  | Effective mode Read only over HTTP             | **BLOCKED**                                                                         | `check-access.mjs function` check C1b                                                                                                               |
| R5  | Guests can browse approved content             | **BLOCKED**                                                                         | `member-checks.mjs` D1                                                                                                                              |
| R6  | Guests cannot post                             | **BLOCKED**                                                                         | D2; `check-access.mjs function` C2                                                                                                                  |
| R7  | Members cannot post in Read only               | **BLOCKED**                                                                         | E1, I3                                                                                                                                              |
| R8  | JWT verification, forged, revoked token        | **BLOCKED**                                                                         | F1, F2, F5 (F6 expired token needs time)                                                                                                            |
| R9  | Moderator MFA (aal1 refused, aal2 allowed)     | **PARTLY**: database level PASS (T8, DB tests); HTTP level **BLOCKED**              | needs a staff account with an enrolled second factor (below)                                                                                        |
| R10 | Reporting, blocking                            | **BLOCKED** over HTTP; database level PASS (T9)                                     | G1, G2                                                                                                                                              |
| R11 | Private photo access, signed links             | **BLOCKED**, and cannot be run in Read only                                         | photos are refused in Read only by design. Testing them needs your approval to switch staging to `text_only`/`open` temporarily; I have not done so |
| R12 | Account deletion through the real API          | **BLOCKED** (request) ; executor DB-level PASS (T10)                                | J1, J2                                                                                                                                              |
| R13 | HTTP rate limits, concurrency, error handling  | **BLOCKED**                                                                         | H1-H3, I1-I3                                                                                                                                        |
| R14 | Unauthorized writes, exposed media, MFA bypass | **No evidence of any**; nothing could be exercised over HTTP, so this is not a pass |                                                                                                                                                     |

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

---

# Phase 3: staging HTTP and security tests (2026-11-16)

This phase supersedes the BLOCKED entries in the Phase 2 table where it gives a result. Everything below ran against `bxhnrjulksganzydgrgm` only, through the real HTTPS API, with synthetic accounts (`*@staging-test.example`, passwords random, kept only in a local scratch file, never printed or committed). Development and production were not touched. No PR, no merge, no `main` change.

**Network access:** the owner approved it. The host `bxhnrjulksganzydgrgm.supabase.co` (nothing else) was added to the owner's Default environment (an extra, unused environment named `dancehall-ai-staging-http` also exists and can be deleted). Remove the host from Default when testing is finished.

**Baseline recorded before any change:** database mode `read_only`, video off, comments off. `COMMUNITY_FLOOR_MODE` was set by the owner in the dashboard; its effective value was confirmed over HTTP as `read_only` (C1b). **I changed neither the mode nor the floor in this phase.**

## Mode question for the photo tests

**`text_only` does NOT permit the photo tests.** In `packages/shared/src/community-server.ts` (lines 826-838) any upload route or photo post is refused with `media_paused` whenever the floor is not `open`, and the stored mode is combined with the floor using the stricter of the two. Photo privacy, signed links and unauthorized-access tests therefore need **both** the stored mode `open` and the floor secret set to a non-restricting value (for example `open`), with video and comments still off. I have not done this and am asking first (see the decisions below). Restoring requires the owner to re-enter `COMMUNITY_FLOOR_MODE=read_only` in the dashboard.

## Results (PASS = ran over HTTP and behaved correctly)

| Check                                                                                                                             | Result                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective mode Read only, comments and video off, over HTTP                                                                       | **PASS**                        | `check-access.mjs function` C1, C1b, C1c, C1d                                                                                                                                                                                                                                                                                                                                                                       |
| Database door and tables closed to the publishable key; app schema hidden; purge not callable; bucket private; public sign-up off | **PASS**                        | `check-access.mjs db`, 12 of 12                                                                                                                                                                                                                                                                                                                                                                                     |
| Guests refused on every member and staff route; wrong method 405; maintenance needs its key; no key or id in responses            | **PASS**                        | `check-access.mjs function`, 15 of 15 (guest writes return 503 "paused" before sign-in in Read only, so the test was corrected to accept it; nothing is written either way)                                                                                                                                                                                                                                         |
| Guest browses approved content                                                                                                    | **PASS**                        | D1 (synthetic post visible); D1b no account id or email in the feed                                                                                                                                                                                                                                                                                                                                                 |
| Guest cannot post                                                                                                                 | **PASS**                        | D2 (503)                                                                                                                                                                                                                                                                                                                                                                                                            |
| Signed-in member cannot post, comment, or request photo or video uploads in Read only                                             | **PASS**                        | E1 to E4                                                                                                                                                                                                                                                                                                                                                                                                            |
| JWT: garbage token, forged signature refused; valid token accepted; revoked (signed-out) session refused                          | **PASS**                        | F1, F2, F4, F5                                                                                                                                                                                                                                                                                                                                                                                                      |
| Expired token                                                                                                                     | **BLOCKED**                     | cannot be forced; needs a saved token tried after its one-hour expiry (F6). Same verification path as F1/F5                                                                                                                                                                                                                                                                                                         |
| Member cannot reach moderator routes or change the mode                                                                           | **PASS**                        | F3, F3b (403)                                                                                                                                                                                                                                                                                                                                                                                                       |
| Moderator MFA through the API                                                                                                     | **PASS**                        | `mfa-checks.mjs`, 12 of 12: password-only (aal1) moderator refused on `mod/queue` and `mod/mode`; after enrolling TOTP (aal2) the queue returns 200 with no account ids; the old aal1 token is still refused; a non-staff member is refused even at aal2                                                                                                                                                            |
| Reporting, repeat report indistinguishable                                                                                        | **PASS**                        | G1, G1b                                                                                                                                                                                                                                                                                                                                                                                                             |
| Blocking and unblocking                                                                                                           | **PASS**                        | G2, G2b                                                                                                                                                                                                                                                                                                                                                                                                             |
| Errors: bad JSON 400, oversize 413, unknown route 404, never 500                                                                  | **PASS**                        | H1 to H3                                                                                                                                                                                                                                                                                                                                                                                                            |
| Rate limits and concurrency (members)                                                                                             | **PASS**                        | I2 (150 member reads in parallel: 429s, no 5xx), I3 (30 parallel writes all refused), I4 (25 reports: limited to the 10 a minute, no errors)                                                                                                                                                                                                                                                                        |
| Rate limit for guests                                                                                                             | **BLOCKED / INCONCLUSIVE here** | this environment's egress rotates its network address, so guest requests were spread over many buckets (observed in `community_burst`: many distinct hashed keys, each far under 90). Run a guest burst from one machine                                                                                                                                                                                            |
| Account deletion through the real API                                                                                             | **PASS**                        | `request_account_deletion` returned 200 for synthetic members; each was scheduled 30 days ahead (nothing deleted early). Then one synthetic account was made due and the server-only executor ran: exactly 1 purged, the other synthetic accounts and the seed intact, and the purged account could no longer sign in (400). The executor is not wired to an HTTP route, so that step ran in SQL as the server role |
| Private photo access, signed URLs, unauthorized photo access                                                                      | **BLOCKED**                     | needs mode `open` (see above); awaiting your approval                                                                                                                                                                                                                                                                                                                                                               |
| Unauthorized write, private-data exposure, MFA bypass                                                                             | **None observed**               | stop conditions never triggered                                                                                                                                                                                                                                                                                                                                                                                     |

## Findings and notes

1. Guest rate limiting is per hashed network address and fails closed to a single shared bucket when the address header is missing. Behind a rotating proxy it cannot be demonstrated; confirm from a single machine.
2. In Read only a guest write returns 503 "paused" rather than 401, because the pause is checked before sign-in. Safe, but the status differs from the 401 the earlier test expected.
3. Test data left in staging: synthetic members `stg_member_one`, `staging_seed`, a moderator account with an enrolled TOTP factor, one synthetic post, a few synthetic reports and a 30-day deletion request on one account. Remove when finished.

## Reproduce on your Mac

```bash
export STAGING_REF=bxhnrjulksganzydgrgm STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT STAGING_PUBLISHABLE_KEY=<staging publishable key>
node scripts/staging/check-access.mjs db && node scripts/staging/check-access.mjs function
STAGING_MEMBER_EMAIL=<throwaway> STAGING_MEMBER_PASSWORD=<throwaway> node scripts/staging/member-checks.mjs
STAGING_MOD_EMAIL=<moderator> STAGING_MOD_PASSWORD=<pw> STAGING_MEMBER_EMAIL=<non-staff> STAGING_MEMBER_PASSWORD=<pw> node scripts/staging/mfa-checks.mjs
```

## Remaining App Store blockers (unchanged by these tests)

Community must stay off in the App Store build (it is). Still open from `docs/APP_STORE_READINESS.md`: published privacy and support URLs, reviewed legal text, a working production account backend, V1 dance video content (none cleared), App Privacy answers, and the exact review notes. This phase adds no new blocker; the unverified items are the guest rate limit, the expired-token check and the photo tests above.

## Decisions needed

1. Approve switching staging to stored mode `open` AND setting `COMMUNITY_FLOOR_MODE` to a non-restricting value (you would enter it in the dashboard), with video and comments still disabled, only for the photo tests, restored to `read_only` immediately afterwards and re-verified over HTTP? Staging is not public.
2. Approve deleting the synthetic test accounts and data, and removing the staging host from Default, once testing ends?

---

# Phase 4: photo security tests (2026-11-16)

Project `bxhnrjulksganzydgrgm` only (reference verified before opening). Synthetic accounts and generated test images only. Development and production untouched.

**Settings recorded before change:** database mode `read_only`, video off, comments off, `COMMUNITY_FLOOR_MODE` = `read_only` (owner-entered; not readable by me).
**Accepted value that allows photos:** `open`. The function treats only `text_only` and `read_only` as restrictions; anything else is `open` (index.ts lines 120-122). `text_only` does not allow photos (server refuses all upload routes and photo posts with `media_paused` unless the floor is `open`).
**Sequence:** owner set `COMMUNITY_FLOOR_MODE=open`; database mode set to `open` (the status route then reported `open`, proving both layers were open); tests run; **database mode restored to `read_only` immediately afterwards** (read back: `read_only`, video false, comments false).

## Results (`scripts/staging/photo-checks.mjs`, real HTTPS API)

The first run failed 8 checks; 7 were because the moderator's second factor could not be enrolled (an earlier test factor already existed), one test-design issue. After removing that synthetic moderator's old factor (staging test data) the full run was repeated: 41 of 42 passed. The remaining failure is analysed below.

| Area                                                                                                                                                                             | Result                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Effective mode open, video and comments still disabled over HTTP                                                                                                                 | PASS                                       |
| Authorized member gets an upload ticket; path is random and carries no account id                                                                                                | PASS                                       |
| Upload to the signed upload link works                                                                                                                                           | PASS                                       |
| Private bucket: public URL, the uploader's own token and another member's token cannot read the object directly; another member cannot list it                                   | PASS                                       |
| Another member cannot commit or attach someone else's upload; an unverified upload cannot be attached                                                                            | PASS                                       |
| Photo post is HELD; invisible to guests and other members; visible to the author only, with a signed link; no account id or email in any feed                                    | PASS                                       |
| Signed link serves the image; the hidden metadata marker (fake GPS EXIF) was stripped from the stored copy                                                                       | PASS                                       |
| Signed link lifetime exactly 600 s; tampered link refused; link does not open any other file                                                                                     | PASS                                       |
| Moderation: member cannot use the queue, cannot approve their own post; moderator with password only (no second factor) cannot approve; post stays hidden after those attempts   | PASS (no moderation bypass, no MFA bypass) |
| Moderator at aal2 sees the held photo with a signed link and no account id, approves; guests then see it with a working link                                                     | PASS                                       |
| Deletion: another member cannot delete someone's post; owner can; it leaves the feed; the photo object is gone from storage (bucket holds only the files of the remaining posts) | PASS                                       |
| Text file renamed `.jpg` refused at commit (`wrong_type`); file over 8 MB refused (the bucket's own size limit rejects the upload, so commit finds nothing)                      | PASS                                       |
| Video upload ticket refused (`video_disabled`); comments refused (403)                                                                                                           | PASS                                       |
| Signed-link expiry after 600 s (an actual expired fetch)                                                                                                                         | see "Pending" below                        |
| **P10e: after deletion, the old signed link no longer serves the deleted photo**                                                                                                 | **FAIL as written; see finding 1**         |

## Findings

1. **A deleted photo's earlier signed link kept serving for a short time.** The storage object was confirmed deleted (SQL: the bucket holds only the 2 files of the 2 remaining posts), yet the signed link that had been fetched moments earlier still returned 200. This is almost certainly CDN caching (the test upload and the server's re-upload use the default 3600 s cache control), so it is bounded by the link's 600 s lifetime plus cache. It only affects someone who already holds a valid link. Recommendation: before any real use, upload with `cacheControl: 'no-store'` or a short `max-age` in the server's `upload(...)` call, and re-test. Not changed in this phase.
2. In this phase no unauthorized access, private-data exposure, moderation bypass or MFA bypass was observed.

## Restore status

- Database mode: **restored to `read_only`** and verified.
- Effective mode over HTTP now: **`read_only`** (`check-access.mjs function` C1b PASS; member text posts and photo tickets return 503).
- `COMMUNITY_FLOOR_MODE`: still `open` until the owner sets it back to `read_only` (evidence: guest writes currently return 401 rather than 503, which is the floor-open behaviour). Cleanup has NOT been done and waits for this.

---

# Phase 5: final verification and cleanup (2026-11-16)

## Final verification

| Check                                      | Result                                                    | Evidence                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMMUNITY_FLOOR_MODE` back to `read_only` | **PASS (non-mutating evidence; no database flip needed)** | With the floor `open`, a guest `post` returned 401; after the owner's restore it returns 503 "paused" (the floor is checked before sign-in). `check-access.mjs function` 15 of 15 |
| Effective mode over HTTP                   | **PASS**                                                  | status route: `mode read_only`, `commentsEnabled false`, `videoEnabled false` (C1b to C1d)                                                                                        |
| Database                                   | **PASS**                                                  | `mode=read_only, video_enabled=false, comments_enabled=false`                                                                                                                     |
| `check-access.mjs db`                      | **PASS**                                                  | all checks passed after cleanup                                                                                                                                                   |
| Signed link after its 600 s lifetime       | **PASS**                                                  | the link saved at approval time (age 624 s, token `exp` passed) returned **400** with a JSON error, not the image, including with a changed query string                          |

## Signed-link caching finding: investigated, NOT resolved

- A published photo's signed link returns `cf-cache-status: MISS` on the first fetch and `HIT` on the second, with no `Cache-Control` header: the CDN keeps a copy keyed by the exact link.
- The server's re-upload (`supabase/functions/community/index.ts` line 74) passes no `cacheControl`, so the storage default (3600 s) applies. The earlier test uploads set 3600 s explicitly.
- After a post is deleted and its file removed, a link that was already fetched can still be served from that cache while its token is valid (up to 600 s after it was issued). Once the token has expired the cache no longer serves it (400 above), so the exposure is bounded by the token lifetime, and only for someone who already holds a link.
- Proposed fix, **not applied and not tested** (changing the function was not authorized in this phase): upload the cleaned photo with a short or no-store cache control (`cacheControl: '0'` / `no-store`) and, if needed, a shorter view lifetime; then re-test delete-then-fetch on staging. Status: **OPEN**.

## Cleanup performed (synthetic data only, staging only)

- Deleted through the API: the owner deleted their two photo posts, which removed their files (bucket now holds 0 objects).
- Deleted in SQL after a guard that every user was synthetic: all posts, reports, report resolutions, upload and orphan records, rate-limit counters, deletion requests, and the synthetic accounts (`m1`, `m3`, moderator, seed member) with their identities, sessions, second-factor enrolments, community profiles, usernames, blocks and staff role.
- Read-back counts: users 0, community members 0, posts 0, uploads 0, reports 0, staff 0, storage objects 0, deletion requests 0.
- **Preserved:** all 19 migrations, structure, functions, the deployed `community` function, secrets and settings (mode `read_only`, video and comments off).
- **Kept on purpose:** 4 rows in `audit_log` (the tamper-evident record of the synthetic moderator's test actions). They hold no personal data. Deleting them would break the audit chain.
- Local scratch credentials and test images were shredded.

## Environment cleanup

- Staging host `bxhnrjulksganzydgrgm.supabase.co` **removed from the Default environment** (allowed hosts are back to the original four).
- The unused environment `dancehall-ai-staging-http` could **not** be deleted by me: no tool for deleting environments is available here. Delete it in Settings, Environments.

## Final staging security status

Staging holds no test data, is in Read-only mode (database and floor), with comments and video disabled at database and API level. No unauthorized access, private-data exposure, moderation bypass or MFA bypass was observed in any phase.

## Remaining issues

1. **Signed-link cache after deletion** (above): open until a fix is tested.
2. Guest rate limit not demonstrated (rotating egress address in this sandbox); run a guest burst from one machine.
3. Expired member access token (one hour) not exercised; revoked and forged tokens were.
4. `COMMUNITY_FLOOR_MODE` and secret values cannot be read back by me; the floor was confirmed by behaviour only.
5. Account-deletion executor has no HTTP route or schedule yet; the 30-day wait is provisional.
6. App Store blockers unchanged (see `docs/APP_STORE_READINESS.md`): privacy and support URLs, legal review, production accounts, cleared V1 video, App Privacy answers.

---

# Phase 6: signed-photo cache fix (code only, 2026-11-16)

**Status: FIX CODED AND UNIT-TESTED. NOT DEPLOYED. NOT VERIFIED ON HOSTED STAGING. The finding is not resolved and immediate revocation is not claimed.**

- Cause: the Edge Function stores the cleaned photo with the storage client's default cache control (3600 s) and a CDN keeps serving a link that was already fetched.
- Change: `storageUploadOptions(mime)` in `packages/shared/src/community-media.ts` (generated into `supabase/functions/_shared/generated/`) sets `cacheControl: '0'`, which the storage client sends as `Cache-Control: max-age=0` (revalidate before reuse). The Edge Function's only upload call uses it. The hosted staging function still runs the old code, pinned to commit `1016225`.
- Regression tests: stored files never use the default cache policy and the function has no hand-written upload options (mutation-checked: re-introducing hand-written options fails the test); signed links expire within 600 s; deleting a post, or a moderator removing one, removes the file; real-storage model: a removed file is never signed again; members and password-only staff cannot remove content. Existing private-storage, 600 s expiry and moderation tests all still pass (shared 50 server tests, mobile 565, scripts 40).
- Still to do, with separate authorization: deploy the function to staging and repeat delete-then-fetch to see whether the CDN honours the header. Only that test can show how quickly a deleted photo stops being served; the signed link's own 600 s lifetime remains the guaranteed upper bound.
- Audit log untouched; Community left in Read-only mode.
- Remaining tasks, unchanged: guest rate-limit test from a single machine, expired (one-hour) member token test, scheduling the account-deletion executor.

---

# Phase 7: cache-fix deployment and live delete-then-fetch test (2026-11-16)

Project `bxhnrjulksganzydgrgm` only (reference verified before each step). Development and production untouched. No PR. Friends was NOT deployed and its migration was NOT applied.

## Deployment

| Item                                         | Result                                                                                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `community` function                         | **PASS**: version 3 to **version 4**, code hash `c1bde39d...` to `cd229287...`; built from pinned commit `447464bbfa8fb0496ecaf6b7f5a535d7c790b6c6` (contains `storageUploadOptions`, `cacheControl: '0'`) |
| Read-only checks on version 4 before opening | **PASS** (`check-access.mjs function` 15 of 15)                                                                                                                                                            |

## Controlled test (floor `open` set by the owner, database mode `open`, then restored)

Baseline recorded first: database `read_only`, video/comments off, floor `read_only`. Floor verified open over HTTP (guest writes returned 401 instead of 503). Database restored to `read_only` immediately after the run (read back: `read_only`, false, false).

**Photo suite (`scripts/staging/photo-checks.mjs`): 42 of 42 PASS.** Includes: private bucket, signed link lifetime exactly 600 s, tampered link refused, held photos invisible, moderator second factor required, member cannot approve, text file and over-size refused, video and comments refused.

**Delete-then-fetch evidence (one photo, one run):**

| Step                                     | HTTP    | Headers observed                                                       |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------- |
| signed link, 1st fetch (published photo) | 200     | `cf-cache-status: MISS`                                                |
| signed link, 2nd fetch                   | 200     | `cf-cache-status: REVALIDATED` (the earlier run, old code, gave `HIT`) |
| owner deletes the post                   | 200     |                                                                        |
| same link, fetched again after deletion  | **400** | `cf-cache-status: BYPASS`                                              |

`Cache-Control` itself is not exposed on these responses (`null`), so the effect is inferred from `cf-cache-status`.

## Immediate photo revocation: **PASS for the tested case, not a general guarantee**

The previously fetched link stopped serving at once after deletion (400, BYPASS) and the CDN revalidated rather than serving a copy. Not tested: other CDN locations, a link first fetched long before deletion, or many deletions. The link's own 600 s lifetime remains the guaranteed upper bound.

## Cleanup and restore

- Floor restored to `read_only` by the owner; effective mode over HTTP verified **`read_only`**, comments and video disabled (C1b to C1d); guest writes 503 again. Database `read_only/false/false`.
- Deleted (synthetic only, after a guard that every user was synthetic): the test posts (the owner's delete removed the file), reports, uploads, orphan records, rate-limit counters, and 3 accounts with identities, sessions, usernames and staff role.
- Read-back: users 0, identities 0, sessions 0, second-factor 0, members 0, posts 0, uploads 0, reports 0, staff 0, storage objects 0.
- **Audit chain preserved:** 8 rows, 8 valid hashes (7 of 7 before cleanup; the cascade added one entry).
- `check-access.mjs db` and `function`: all pass after cleanup. Local scratch credentials shredded.
- Staging host removed from the Default environment.

## Remaining blockers

1. Friends: migration `social.up.sql` and function `social` are not applied or deployed; they need your approval (they also need `community.up.sql`, already applied on staging, and applied nowhere else).
2. Guest rate-limit test from one machine; expired member-token test; scheduling the account-deletion executor.
3. Open Food Facts live lookups untested; no dietitian or cultural review of foods and recipes.
4. App Store items in `docs/APP_STORE_READINESS.md` (privacy and support URLs, legal review, production accounts, cleared V1 video, App Privacy answers).

---

# Phase 8: Friends and Group Goals on staging (2026-11-16)

Project `bxhnrjulksganzydgrgm` only (reference verified before each hosted change). Development and production untouched. No PR. Public Community left in Read only; no Community secret or floor setting was changed.

## What was applied and deployed

| Item                                    | Result                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review                                  | `social.up.sql` creates only new objects (6 tables, 23 `app` functions, one door `public.social_rpc`); it alters no existing table, policy, function or grant. Dependencies confirmed present on staging: `community_members`, `community_burst`, `app.community_claim_username`/`community_profile`, `workout_sessions`, `profiles`; no social objects existed before |
| Migration `social_up`                   | **APPLIED** (hash-verified loader, pinned commit `1444af20f4d20e86814d3577c71d2c7d9bcd1a68`, file SHA-256 `fa16d8b9...`). The temporary `http` extension was dropped in the same migration                                                                                                                                                                             |
| Migration `social_patch1_view_dedupe`   | **APPLIED** (file `social.patch1_view_dedupe.sql`, commit `84719b41...`, SHA-256 `86757a16...`): replaces one function, same signature and grants, found by the hosted tests (see findings). Already folded into `social.up.sql`. **This goes beyond the reviewed file, so please review it**                                                                          |
| Post-migration checks                   | 6 tables, RLS on all 6 with a deny-all policy, 0 grants to `anon`/`authenticated`, the door executable by `service_role` only, user-callable definer list unchanged (the same 10 reviewed functions), no `social` finding in the security advisors                                                                                                                     |
| Function `social`                       | **DEPLOYED, version 1**, `verify_jwt=false` (the function verifies every token itself), code hash `09f95127...`, shared code pinned to commit `1444af20...`                                                                                                                                                                                                            |
| Function `community`                    | **Unchanged** (hash `cd229287...`, same as the cache-fix deployment)                                                                                                                                                                                                                                                                                                   |
| Production, development, other projects | not touched                                                                                                                                                                                                                                                                                                                                                            |

## Hosted test results (real HTTPS API, synthetic accounts, `scripts/staging/social-checks.mjs`)

The first run was cut short by my own rate-limit pacing (a legitimate member hits 12 requests or 30 writes a minute) and by one real inconsistency (finding 1). After the patch and pacing the full suite ran: **94 PASS, 1 FAIL**; the one failure (R3) was a test-design error (the test account was genuinely the target's friend, so removing her was legitimate). The corrected R3 check, run against the same state, **PASSES** (403 `not_friends`, the friendship between the other two survived). The deletion phase then ran: **5 of 5 PASS**. R3 corrected was not re-run inside one single full suite.

| Area                                                                                                                                                                                                                                                         | Result                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Only POST; bad JSON 400; oversized 413; unknown route 404; no token, garbage, forged signature and the publishable key alone all 401                                                                                                                         | **PASS**                                       |
| Social tables, the database door and the `app` functions unreachable by a signed-in member through the data API                                                                                                                                              | **PASS** (all refused)                         |
| Community feed untouched, still Read only, comments and video off                                                                                                                                                                                            | **PASS** (status route and `check-access.mjs`) |
| Friends works with the Community feed not enabled (names claimed through the social function; Community stays Read only)                                                                                                                                     | **PASS**                                       |
| Claim a public name; staff look-alike and invalid names refused; second claim and taken names refused                                                                                                                                                        | **PASS**                                       |
| Request, repeat refused, withdraw, decline, accept, self and unknown refused, only the asked person can answer, strangers see nothing                                                                                                                        | **PASS**                                       |
| Shares nothing by default; food, food_diary, weight, weight_entries, health, photo, location, meals and "activity" all refused and nothing stored                                                                                                            | **PASS**                                       |
| Weekly summary shared only after explicit consent, to one friend, one way; other friends and strangers see nothing                                                                                                                                           | **PASS**                                       |
| Revocation immediate (single toggle and "stop sharing with everyone", which withdrew exactly 2 choices)                                                                                                                                                      | **PASS**                                       |
| Server-calculated progress from completed workouts (duplicate recorded 4 minutes apart counted once; planned workout ignored): ama 50, kofi 40, repeatable                                                                                                   | **PASS**                                       |
| Remove friend; block severs friendship for both and hides each; a blocked person's request is byte-identical to an unknown name; unblock then re-friend with nothing shared                                                                                  | **PASS**                                       |
| Challenge: only friends invited; invitees see only the invitation and cannot report; strangers cannot sync, leave or see it; join and decline; ownership passes to the remaining member when the owner leaves; leaver's numbers gone; empty group disappears | **PASS**                                       |
| Couple goal needs exactly one invitee and a target; family goal with several invitees, all joined members see the same family                                                                                                                                | **PASS**                                       |
| Rate limits: 45 parallel writes by one member gave 429s and no 5xx, another member unaffected; request spam limited                                                                                                                                          | **PASS**                                       |
| A body naming other account ids changes nothing (identity is the token)                                                                                                                                                                                      | **PASS** (corrected check)                     |
| Account deletion: request through the API, server-side executor, then friendship, memberships, group totals, name and sign-in all gone while others are intact                                                                                               | **PASS** (5 of 5)                              |
| No internal id, email, or private value (the seeded weight 71.37 and the food marker) in any API response; a UUID appears only as a group `id`                                                                                                               | **PASS**                                       |

## Security findings

1. **Inconsistency, FIXED (patch 1):** the friend's weekly summary counted a repeated workout twice while the server sync counted it once (minutes 80 versus 50). Not a privacy issue; fixed in staging, in `social.up.sql`, and covered by a new SQL test.
2. **Pre-existing, not changed:** the security advisor now warns that Auth "leaked password protection" is disabled. It is a project Auth setting I was told not to change; it matters little for the PIN-first, device-secret sign-in, but should be reviewed before launch.
3. Group numbers are now computed by the server from `workout_sessions`, but workouts themselves are self-recorded by the member; fine for friendly goals, not for prizes (none are offered).
4. Friends depends on the Community username system and the existing rate limiter; it does not depend on Community mode or its routes.
5. No test could read another member's food, weight or health data; no internal identifier was returned.

## Cleanup and verification

- Deleted (synthetic only, after a guard that every user was synthetic): 7 accounts with identities, profiles, public names, all friendships, blocks, shares, groups, invitations and numbers, plus the seeded workouts, weight, and food records, rate-limit counters, retired-name holds and deletion requests.
- Read-back: users 0, identities 0, sessions 0, profiles 0, community members 0, social rows 0, workouts 0, weights 0, food logs and items 0, posts 0, storage objects 0.
- **Audit chain preserved:** 8 rows, 8 valid hashes.
- Community: database `read_only`, comments and video off; `check-access.mjs` function and db checks pass; `http` extension not installed.
- Staging host removed from the Default environment; local scratch credentials shredded.

## Remaining launch blockers for Friends

1. **Hosted builds keep Friends disabled** (`EXPO_PUBLIC_SOCIAL` off by default; production refuses it). Turning it on for a build needs your decision and an on-device test.
2. Development and production databases do not have `community.up.sql` or `social.up.sql`; they need separate approval.
3. No dietitian/legal review of the sharing text; counsel review of friend and group privacy wording.
4. Guest rate-limit test from one machine, expired-token test and account-deletion scheduling (Community items) are still open.
5. Auth leaked-password protection (finding 2).

---

# Phase 9: Friends final verification (2026-11-16)

Project `bxhnrjulksganzydgrgm` only. Development and production untouched. No PR, no build uploaded. Community floor and every Community setting left as they were (database `read_only`, comments and video off).

## 1. Review of `social_patch1_view_dedupe`

The patch (`supabase/proposed/social.patch1_view_dedupe.sql`) is byte-identical to the function body now in `social.up.sql` (checked with a diff). The diff against the version applied first (`git diff 1444af20 HEAD -- supabase/proposed/social.up.sql`) changes exactly one statement inside `app.social_view_friend`:

- **Changed:** the `select` that totals a friend's last seven days of completed workouts now skips a repeat of the same workout recorded within ten minutes of another (the rule `app.social_sync_group` already used), and rounds minutes the same way.
- **Not changed:** the function header (`security definer`, `search_path=''`), all gates ahead of the query (the viewer must be an accepted friend, no block either way, the owner's explicit `activity_summary` share must exist), the return shape (`username` plus `activity` only), and which table is read (`workout_sessions`, the friend's own rows only; the new sub-query is restricted to the same `user_id`). No new data, no cross-person join, no grant, policy or RLS change. `create or replace` keeps the existing grants.
- **Confirmed on staging after applying it:** anon and signed-in users still cannot execute the function, `service_role` can, RLS is on for all 6 tables, clients hold no table grants.

## 5. Deployed and applied versus the reviewed source: IDENTICAL (differences documented)

| Item                                                                                                                                                                                                    | Result                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24 database functions (23 `app.social_*` plus `public.social_rpc`), definitions normalised and hashed, staging versus a local database built from the repository (`community.up.sql` + `social.up.sql`) | **all 24 identical**. Local is PostgreSQL 16, staging 17: the hashes still match                                                                                                                                       |
| Columns, constraints, RLS flags and policies, table grants, function execute rights / definer / `search_path`, indexes (six signature hashes)                                                           | **all 6 identical**                                                                                                                                                                                                    |
| Function `social` version 1 versus `supabase/functions/social/index.ts`                                                                                                                                 | identical after removing comments, whitespace and trailing commas; the only deliberate difference is that the relative import is replaced by the same file pinned to commit `1444af20f4d20e86814d3577c71d2c7d9bcd1a68` |
| The pinned shared code (`social-server.ts`) versus the current source                                                                                                                                   | **byte-identical** (same SHA-256; no change to the social function or its shared code since the deployed commit)                                                                                                       |
| Applied migration history                                                                                                                                                                               | `social_up` (file SHA-256 `fa16d8b9...`) then `social_patch1_view_dedupe` (`86757a16...`); the first applied file lacks the patch, which is why the patch exists; the live definitions equal the current file          |

## 3. Clean full-suite rerun (existing deployment, 7 synthetic accounts, real HTTPS API)

**`social-checks.mjs main`: 95 of 95 PASS, 0 FAIL, in one run.** Then the account-deletion phase: server-side executor run for the account that requested deletion, **`after-delete`: 5 of 5 PASS**. Total 100 of 100.
Highlights confirmed in this run: the weekly summary now shows **2 sessions, 50 minutes** (duplicate counted once, previously 80); the corrected spoof check passes inside the suite (a non-friend sending other accounts' ids gets 403 and the unrelated friendship survives); no internal id, email or private value (seeded weight 71.37 and a food marker) in any response; Community status still `read_only`, comments and video disabled; `check-access.mjs` function and db checks pass.
Item 2 (permanent test): the flawed check is corrected in `scripts/staging/social-checks.mjs` (R3). The local end-to-end suite (`pnpm test:social-integration`, 11 scenarios) already used a non-friend and is unchanged.

## 6. Cleanup

All synthetic users, public names, friendships, blocks, shares, groups, invitations, numbers, seeded workouts, weight and food records, deletion requests, rate-limit counters and retired-name holds deleted. Read-back: users 0, identities 0, sessions 0, profiles 0, community members 0, social rows 0, workouts 0, weights 0, food items 0, posts 0, storage objects 0, deletion requests 0. **Audit chain: 8 rows, 8 valid.** `http` extension not installed. Staging host removed from the Default environment; local credentials shredded.

## 7. Auth "leaked password protection" warning (not changed)

- **What it is:** a Supabase Auth setting that rejects a new or changed password found in the public HaveIBeenPwned "Pwned Passwords" list, to stop credential stuffing with breached passwords.
- **Availability:** the official Supabase documentation states it is **available on the Pro plan and above**. This organisation is on the free plan (it has only free projects), so **the option cannot be switched on without a paid upgrade**, which you have not approved.
- **Does it matter for DanceHall?** Very little. The app has no user-chosen passwords: the Auth password of each account is a 256-bit random device secret (43 URL-safe characters) generated on the phone and held in secure storage (see `docs/ACCOUNT_SECURITY.md`); the PIN is an app lock only and is never sent. A random secret would never appear in a breach list, and the check would not reject it. Public sign-up is disabled, so nobody can choose a weak password.
- **Options:** (a) leave it off and accept the advisor warning as informational (recommended for now; no cost, no user impact); (b) upgrade the organisation to Pro (paid) and switch it on for defence in depth, and also set a minimum password length; (c) when you decide to launch, review the advisor list as a whole, because the other findings are the intentional user-callable functions already reviewed.
- **Approval:** changing it is a project Auth setting and, because it needs a paid plan, **it requires your approval**. I did not change it and will not without it.

## 8. Mobile Friends: prepared for a development-only iPhone test

`docs/FRIENDS_IPHONE_TEST.md` (checklist and exact commands). Friends stays off in every shared build: a new test pins that no EAS profile sets `EXPO_PUBLIC_SOCIAL` and that a production build given the flag refuses to start. Track A (local screens with the labelled sample members, run from your Mac with `expo run:ios`, no EAS and no upload) can be done now. Track B (the iPhone against the staging backend) is **blocked**: staging has no `account` Edge Function, so an app build cannot create a signed-in account there. No build was made or uploaded, and nothing was activated in production.

## Final results

| Area                                                              | Result                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Patch review (scope, RLS, grants, isolation)                      | **PASS**                                                                          |
| Deployed function and applied migration match the reviewed source | **PASS** (differences documented above)                                           |
| Clean full hosted Friends suite                                   | **PASS** (95/95 main, 5/5 deletion)                                               |
| Community floor Read only, comments and video off                 | **PASS**                                                                          |
| Cleanup and audit chain                                           | **PASS** (0 test records, 8/8 valid)                                              |
| Auth leaked-password option                                       | **BLOCKED** by plan (needs a paid plan and your approval); explained, not changed |
| iPhone test against staging                                       | **BLOCKED** (no account function on staging); local Track A prepared              |

## Remaining blockers and exact next steps

1. Run Track A on your iPhone from your Mac (`docs/FRIENDS_IPHONE_TEST.md`) and send me the results.
2. For a hosted iPhone test: approve deploying the `account` function to staging only (and say whether to also apply its migration there; staging already has the account migration set); then I run the app flow against staging and clean up.
3. Decide when Friends may be switched on in any shared build (`EXPO_PUBLIC_SOCIAL=1` for that build only). Production keeps refusing it until a code change you approve.
4. Review and approve applying `community.up.sql` and `social.up.sql` (plus the patch folded in) to any non-staging database before use; not done.
5. Legal review of the friend and group privacy wording; Open Food Facts live test; Community open items (guest rate limit, expired token, deletion scheduling).
6. Auth leaked-password option: decide (leave off, or approve a plan upgrade).

---

# Phase 10: staging account integration, Friends with the app's real code, live barcode (2026-11-16)

Project `bxhnrjulksganzydgrgm` only (reference verified before each hosted change). Development Supabase, production, `main` and `integration/live-prep` untouched. No PR, no EAS build, no TestFlight. Public Community stayed Read only throughout (database `read_only`, comments and video off; no Community secret or floor setting touched).

## 1. `account` function deployed to staging

| Item                   | Result                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencies           | the account database layer was already on staging from the 19 approved migrations (17 `app.acct_*` functions, service-role only, no client grants); no further migration was needed or applied                                                                                                                                          |
| Secrets                | `ACCOUNT_PEPPER` and `MAINTENANCE_KEY` entered by you in the dashboard prompt (never seen by me). Optional settings left at their defaults (24-hour recovery wait, `accounts.dancehall.invalid` identifier domain)                                                                                                                      |
| Deployed               | function `account`, **version 1**, `verify_jwt=false` (it authorises each action itself, as on development), code hash `ac596a31...`, shared code pinned to commit `434cabb2149abb2ae2760ea2d7c2cf88123797f9`; the function file is the repository's `supabase/functions/account/index.ts` with comments removed and its imports pinned |
| Isolation              | the function uses only the platform-provided URL and service key of the project it is deployed to (staging). It holds no development or production reference                                                                                                                                                                            |
| Boundary checks        | `status` and `rotate` without a token 401; GET 405; maintenance with a wrong key 401; `check-access.mjs` function and db checks pass; Community status `read_only`, comments and video disabled                                                                                                                                         |
| Account security model | unchanged (PIN-first, email-free, 24-hour recovery wait, Recovery Key, security answers)                                                                                                                                                                                                                                                |

## 2. Friends with the app's REAL code on staging (not a device)

`apps/mobile/src/data/live/friendsStaging.test.ts` drives the app's real account service (create account, device secret, sign-in, no email), the real Supabase store and its social adapter, and the deployed `account` and `social` functions. Guarded to the staging reference (the development reference and any other project are refused). Synthetic accounts only.

- **Phase `main`: 37 of 37 PASS.** Three real accounts created and signed in with no email; claiming a public name (staff look-alike refused, a person without a name cannot ask); request, accept, decline, remove; C blocks A, and A's request to C is byte-identical to a request for an unknown name; nothing shared by default; food, weight, health, food_diary and weight_entries all refused as share categories; consent-based weekly summary shows the server-calculated 30 minutes to the chosen friend only, holds no food, weight or health data, and withdrawal is immediate; challenge, couple goal and family goal created and accepted; progress calculated by the server (30 and 40 minutes); a stranger cannot sync a group; the second account's own records exclude the first one's weight and food; a direct database query by one member for another's weight and food returns nothing (row-level security); the social tables are closed to a signed-in client (error 42501); account deletion requested through the real app code.
- **Server-side deletion executor** then ran for that account. **Phase `after`: 5 of 5 PASS** (friendship gone, gone from every group and total, nobody can view it, its old access token is refused by the `social` function, none of its private records remain). A first version of that last check expected the phone's stored session to vanish; a stored token stays cryptographically valid until it expires, which is normal, so the check was corrected to the meaningful one (the server refuses it).
- Cleanup: all synthetic accounts, names, friendships, groups, numbers, workouts, weight and food records, consents, account provisioning rows and rate-limit counters deleted. Read-back all 0. **Audit chain 8 of 8 valid.** Staging host removed from the Default environment.

## Real device versus simulator

- **Real iPhone: NOT TESTED.** There is no iPhone, no iOS Simulator and no macOS in this environment, so nothing here ran on a phone or simulator. The Friends flows were exercised by the app's real TypeScript code (account service, store, social adapter) over the real network against staging, which proves the backend, the authentication path and the data rules, but not the screens, the Keychain, Face ID, VoiceOver or layout.
- What the owner still runs: `docs/FRIENDS_IPHONE_TEST.md`, Track B (now possible from your Mac: staging `account` v1 and `social` v1 are deployed). Production Friends stays disabled: no EAS profile sets the flag (a test pins that) and a production build given the flag refuses to start.

## 4. Open Food Facts live tests (read-only, no paid service)

7 of 7 PASS against the real service (details in `docs/OPEN_FOOD_FACTS_CHECKLIST.md`). Two **findings fixed**: (1) the adapter's 700 ms spacing allowed about 85 requests a minute against Open Food Facts' published **15 reads a minute per IP**, so it now keeps to 12 in any rolling minute and answers "rate limited" without sending; (2) their documentation asks for a User-Agent of the form `AppName/Version (ContactEmail)`, so the adapter now sends the public support address when the owner has set one (set `EXPO_PUBLIC_SUPPORT_EMAIL` before enabling). The feature stays OFF by default and in production.

## Remaining blockers

1. On-device (or Simulator) test of Friends and everything else on a Mac, Track B (the owner).
2. Open Food Facts: owner to set a support address, approve the privacy wording, read their terms page and fill their API usage form, then preview-first activation.
3. Friends disabled in shared builds until you decide; `community.up.sql` and `social.up.sql` not applied outside staging; legal review of the wording.
4. Community open items: guest rate-limit test, expired-token test, deletion-executor scheduling. Auth leaked-password option (paid plan).
5. Dietitian and cultural review of foods and recipes.
