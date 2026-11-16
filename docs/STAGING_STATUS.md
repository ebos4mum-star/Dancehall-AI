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

---

# Phase 3: staging HTTP and security tests (2026-11-16)

This phase supersedes the BLOCKED entries in the Phase 2 table where it gives a result. Everything below ran against `bxhnrjulksganzydgrgm` only, through the real HTTPS API, with synthetic accounts (`*@staging-test.example`, passwords random, kept only in a local scratch file, never printed or committed). Development and production were not touched. No PR, no merge, no `main` change.

**Network access:** the owner approved it. The host `bxhnrjulksganzydgrgm.supabase.co` (nothing else) was added to the owner's Default environment (an extra, unused environment named `dancehall-ai-staging-http` also exists and can be deleted). Remove the host from Default when testing is finished.

**Baseline recorded before any change:** database mode `read_only`, video off, comments off. `COMMUNITY_FLOOR_MODE` was set by the owner in the dashboard; its effective value was confirmed over HTTP as `read_only` (C1b). **I changed neither the mode nor the floor in this phase.**

## Mode question for the photo tests
**`text_only` does NOT permit the photo tests.** In `packages/shared/src/community-server.ts` (lines 826-838) any upload route or photo post is refused with `media_paused` whenever the floor is not `open`, and the stored mode is combined with the floor using the stricter of the two. Photo privacy, signed links and unauthorized-access tests therefore need **both** the stored mode `open` and the floor secret set to a non-restricting value (for example `open`), with video and comments still off. I have not done this and am asking first (see the decisions below). Restoring requires the owner to re-enter `COMMUNITY_FLOOR_MODE=read_only` in the dashboard.

## Results (PASS = ran over HTTP and behaved correctly)
| Check | Result | Evidence |
| --- | --- | --- |
| Effective mode Read only, comments and video off, over HTTP | **PASS** | `check-access.mjs function` C1, C1b, C1c, C1d |
| Database door and tables closed to the publishable key; app schema hidden; purge not callable; bucket private; public sign-up off | **PASS** | `check-access.mjs db`, 12 of 12 |
| Guests refused on every member and staff route; wrong method 405; maintenance needs its key; no key or id in responses | **PASS** | `check-access.mjs function`, 15 of 15 (guest writes return 503 "paused" before sign-in in Read only, so the test was corrected to accept it; nothing is written either way) |
| Guest browses approved content | **PASS** | D1 (synthetic post visible); D1b no account id or email in the feed |
| Guest cannot post | **PASS** | D2 (503) |
| Signed-in member cannot post, comment, or request photo or video uploads in Read only | **PASS** | E1 to E4 |
| JWT: garbage token, forged signature refused; valid token accepted; revoked (signed-out) session refused | **PASS** | F1, F2, F4, F5 |
| Expired token | **BLOCKED** | cannot be forced; needs a saved token tried after its one-hour expiry (F6). Same verification path as F1/F5 |
| Member cannot reach moderator routes or change the mode | **PASS** | F3, F3b (403) |
| Moderator MFA through the API | **PASS** | `mfa-checks.mjs`, 12 of 12: password-only (aal1) moderator refused on `mod/queue` and `mod/mode`; after enrolling TOTP (aal2) the queue returns 200 with no account ids; the old aal1 token is still refused; a non-staff member is refused even at aal2 |
| Reporting, repeat report indistinguishable | **PASS** | G1, G1b |
| Blocking and unblocking | **PASS** | G2, G2b |
| Errors: bad JSON 400, oversize 413, unknown route 404, never 500 | **PASS** | H1 to H3 |
| Rate limits and concurrency (members) | **PASS** | I2 (150 member reads in parallel: 429s, no 5xx), I3 (30 parallel writes all refused), I4 (25 reports: limited to the 10 a minute, no errors) |
| Rate limit for guests | **BLOCKED / INCONCLUSIVE here** | this environment's egress rotates its network address, so guest requests were spread over many buckets (observed in `community_burst`: many distinct hashed keys, each far under 90). Run a guest burst from one machine |
| Account deletion through the real API | **PASS** | `request_account_deletion` returned 200 for synthetic members; each was scheduled 30 days ahead (nothing deleted early). Then one synthetic account was made due and the server-only executor ran: exactly 1 purged, the other synthetic accounts and the seed intact, and the purged account could no longer sign in (400). The executor is not wired to an HTTP route, so that step ran in SQL as the server role |
| Private photo access, signed URLs, unauthorized photo access | **BLOCKED** | needs mode `open` (see above); awaiting your approval |
| Unauthorized write, private-data exposure, MFA bypass | **None observed** | stop conditions never triggered |

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

| Area | Result |
| --- | --- |
| Effective mode open, video and comments still disabled over HTTP | PASS |
| Authorized member gets an upload ticket; path is random and carries no account id | PASS |
| Upload to the signed upload link works | PASS |
| Private bucket: public URL, the uploader's own token and another member's token cannot read the object directly; another member cannot list it | PASS |
| Another member cannot commit or attach someone else's upload; an unverified upload cannot be attached | PASS |
| Photo post is HELD; invisible to guests and other members; visible to the author only, with a signed link; no account id or email in any feed | PASS |
| Signed link serves the image; the hidden metadata marker (fake GPS EXIF) was stripped from the stored copy | PASS |
| Signed link lifetime exactly 600 s; tampered link refused; link does not open any other file | PASS |
| Moderation: member cannot use the queue, cannot approve their own post; moderator with password only (no second factor) cannot approve; post stays hidden after those attempts | PASS (no moderation bypass, no MFA bypass) |
| Moderator at aal2 sees the held photo with a signed link and no account id, approves; guests then see it with a working link | PASS |
| Deletion: another member cannot delete someone's post; owner can; it leaves the feed; the photo object is gone from storage (bucket holds only the files of the remaining posts) | PASS |
| Text file renamed `.jpg` refused at commit (`wrong_type`); file over 8 MB refused (the bucket's own size limit rejects the upload, so commit finds nothing) | PASS |
| Video upload ticket refused (`video_disabled`); comments refused (403) | PASS |
| Signed-link expiry after 600 s (an actual expired fetch) | see "Pending" below |
| **P10e: after deletion, the old signed link no longer serves the deleted photo** | **FAIL as written; see finding 1** |

## Findings
1. **A deleted photo's earlier signed link kept serving for a short time.** The storage object was confirmed deleted (SQL: the bucket holds only the 2 files of the 2 remaining posts), yet the signed link that had been fetched moments earlier still returned 200. This is almost certainly CDN caching (the test upload and the server's re-upload use the default 3600 s cache control), so it is bounded by the link's 600 s lifetime plus cache. It only affects someone who already holds a valid link. Recommendation: before any real use, upload with `cacheControl: 'no-store'` or a short `max-age` in the server's `upload(...)` call, and re-test. Not changed in this phase.
2. In this phase no unauthorized access, private-data exposure, moderation bypass or MFA bypass was observed.

## Restore status
- Database mode: **restored to `read_only`** and verified.
- Effective mode over HTTP now: **`read_only`** (`check-access.mjs function` C1b PASS; member text posts and photo tickets return 503).
- `COMMUNITY_FLOOR_MODE`: still `open` until the owner sets it back to `read_only` (evidence: guest writes currently return 401 rather than 503, which is the floor-open behaviour). Cleanup has NOT been done and waits for this.
