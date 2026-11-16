# Community: staging-readiness package

**Status: preparation only.** No project exists, no migration is applied, no function is deployed, no secret is set, no email is sent, and Community is off everywhere. Every step below needs your approval before anyone performs it. A person (you, or someone you appoint) performs the hosted steps; nothing here should be run by an assistant against a hosted project.

> Do **not** use the Supabase connection attached to the assistant's session. It belongs to a different product's organization (see `docs/LIVE_INTEGRATION.md`). Staging must be a new project in DanceHall Fit AI's own organization, **separate from the development project and from production**.

Decisions this package assumes (from you): invite-only first test, internal test accounts, synthetic content only; text and photos in scope; **video stays disabled**; every photo reviewed before publication; one primary moderator plus one backup, both with authenticator MFA; internal targets of 4 hours (urgent) and 48 hours (ordinary), not public promises; urgent alerts through the existing email provider if its terms allow, no paid service; appeals through a dedicated support mailbox (address to be confirmed); no public access.

Facts about vendor limits and prices below came from search snippets, because `supabase.com` and `resend.com` are not reachable from the assistant's session. **Treat every figure marked (verify) as unconfirmed** and check the vendor page before relying on it.

---

## 1. Supabase project requirements

| Item                       | Requirement                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                    | A **new** project named for staging (for example `dancehall-staging`) in the DanceHall Fit AI organization. Never the dev project, never production.                                                                                                                                                                                  |
| Region                     | A United States region (initial market). Pick one and record it; storage and database share it. Region cannot be changed later.                                                                                                                                                                                                       |
| Plan                       | **Free is enough** for an invite-only test of a few accounts. Note (verify): Free projects pause after about a week of inactivity and have no managed backups; staging data is synthetic and disposable, so that is acceptable. Pro (about $25 a month, verify) is only needed if pausing becomes a nuisance or limits below are hit. |
| Auth                       | Email provider enabled; **public sign-up off**; JWT expiry 900 seconds; refresh-token rotation and reuse detection on; **TOTP multi-factor enabled** (verify that it is available on the plan and switched on; it is the basis of moderator security).                                                                                |
| Storage                    | Standard Storage. One private bucket (section 6).                                                                                                                                                                                                                                                                                     |
| Edge Functions             | Two functions: `account` (so the app's PIN-first sign-up works) and `community`. Both deployed with `--no-verify-jwt` (guests carry only the publishable key, which is not a JWT; each function verifies the caller itself).                                                                                                          |
| Extensions                 | `pg_cron` and `pg_net` only if the scheduled jobs are run from the database (section 5); otherwise none.                                                                                                                                                                                                                              |
| Limits to confirm (verify) | Edge Function memory (documented as about 256 MB), CPU time per request (documented figures differ: 2 s in older pages, 200 ms in a newer one), wall-clock (150 s free), request size, storage and database size on Free.                                                                                                             |

## 2. Migration order and rollback

The staging database is brand new, so it gets every repository migration in order. The Community schema is added as one new migration after them (created at deploy time from the reviewed proposal; it is not in `supabase/migrations/` yet and must not be added until you approve staging).

| #    | File                                                                  | Purpose                                                   | Rollback                                                                |
| ---- | --------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1-13 | `20261201000100` to `20261213000100` (13 files, in name order)        | Product schema                                            | Staging only: delete the project (no per-file down scripts exist)       |
| 14   | `20261214000100_account_recovery.sql`                                 | Email-free accounts (service-role functions)              | `supabase/rollback/20261214000100_account_recovery.down.sql`            |
| 15   | `20261215000100_account_recovery_replay_fix.sql`                      | Fix to 14                                                 | `supabase/rollback/20261215000100_account_recovery_replay_fix.down.sql` |
| 16   | `20261216000100_community.sql` = `supabase/proposed/community.up.sql` | Community tables, functions, the single service-role door | `supabase/proposed/community.down.sql` (destroys all Community content) |
| 17   | `supabase/proposed/community.storage.sql`                             | Private photo bucket, 8 MB, image types only              | Empty the bucket with the Storage API, then delete it                   |

Order rules: 16 needs the `staff_roles`, audit and `app` objects from 1-13 and 14; 17 needs Storage (present on every project). Apply 1-15 first and run the structural checks (section 9, items A1-A4) **before** applying 16.

Rollback plan, least to most drastic:

1. **Read only** from the moderation console (no deploy needed), or set `COMMUNITY_FLOOR_MODE=read_only` on the function (works even if the database is unreachable).
2. Set the app build flag off (new builds) and delete the `community` function (`supabase functions delete community`); remove the scheduled jobs.
3. Run `community.down.sql`, empty and delete the bucket.
4. Delete the staging project. Because it is separate and synthetic, nothing else is affected.

The local rehearsal of apply, test, rollback and re-apply is `bash supabase/proposed/community-dry-run.sh`. Run it again unchanged on the day, as proof that the file you apply is the file that was tested.

## 3. Edge Function deployment and configuration

Commands for the person doing the deploy (do not run until approved; replace `<STAGING_REF>` with the staging project's reference, never the development project's):

```bash
supabase functions deploy account   --no-verify-jwt --project-ref <STAGING_REF>
supabase functions deploy community --no-verify-jwt --project-ref <STAGING_REF>
```

- The flat bundle for each function is checked by `node scripts/edge-bundle.mjs <dir> community`; it fails on an unresolved import, an unpinned `npm:` import or a secret-looking value.
- `pnpm check:edge` confirms the shared copies are current.
- The `community` function has been type-checked and run under a real Deno runtime locally (`pnpm test:community-integration`). It has **never run on Supabase's runtime**; the first deploy may need small import fixes, which is the purpose of staging.
- First deploy with `COMMUNITY_FLOOR_MODE=read_only` so that nothing can be posted until the checks in section 9 pass.
- Leave `COMMUNITY_DEBUG` **unset**.

## 4. Secrets and environment variables (names only; never put values in chat, git or a ticket)

Generate each value on the person's own machine and keep it in a password manager before setting it.

| Name                                                                                                                                                    | Where                                    | What it is                                              | How made                               | Notes                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `ACCOUNT_PEPPER`                                                                                                                                        | `account` function secret                | Keys recovery verifiers                                 | 48 random bytes, base64                | Lose it and recoveries stop working. Back up first.             |
| `MAINTENANCE_KEY`                                                                                                                                       | `account` function secret                | Authorises its scheduled reaper                         | 32 random bytes, hex                   |                                                                 |
| `COMMUNITY_PEPPER`                                                                                                                                      | `community` function secret              | Keys the hash of a guest's network address              | 32+ random bytes, base64               | Distinct from the account pepper                                |
| `COMMUNITY_MAINTENANCE_KEY`                                                                                                                             | `community` function secret              | Authorises `maintenance/prune` and `maintenance/alerts` | 32 random bytes, hex                   |                                                                 |
| `COMMUNITY_FLOOR_MODE`                                                                                                                                  | `community` function config              | `read_only` or `text_only` kill switch                  | set by hand                            | Start as `read_only`                                            |
| `COMMUNITY_ALERTS`, `COMMUNITY_ALERT_RECIPIENTS`, `COMMUNITY_ALERT_FROM`, `COMMUNITY_ALERT_API_URL`, `COMMUNITY_ALERT_API_KEY`, `COMMUNITY_CONSOLE_URL` | `community` function                     | Urgent email alerts (section 8)                         | key from the email provider, send-only | **All unset until you approve alerts**                          |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                                                                                                             | provided by the platform to the function | Server access                                           | automatic                              | Never copied anywhere else, never in the app or admin console   |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                                                                      | a **staging** build profile              | Public project address and publishable key              | from the staging project               | Not secrets; must never be the service key (the app refuses it) |
| `EXPO_PUBLIC_COMMUNITY=1`, `EXPO_PUBLIC_SUPPORT_EMAIL`                                                                                                  | the same staging profile only            | Offers Community; shows the appeals address             | set by hand                            | A production build with the flag throws on start                |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                                                                      | admin console (staging host or local)    | Lets the console reach staging                          | public values                          |                                                                 |

Not needed: any paid provider key, any AI key, any Open Food Facts setting.

## 5. Scheduled jobs (free)

Two calls, both `POST` with the header `x-maintenance-key`:

- `community/maintenance/prune` every 15 minutes: deletes stale uploads and files orphaned by deletions.
- `community/maintenance/alerts` every hour: sends a reminder while urgent items stay open (does nothing while alerts are off).
- `account/maintenance/reap` every 10 minutes (existing requirement).

Run them from `pg_cron` + `pg_net` inside the staging project, storing the keys in Vault. Alternatives: a scheduler on the owner's own machine during the short test. The repository's CI configuration is deliberately restricted (`scripts/check-ci-config.mjs`), so do not add a workflow for this.

## 6. Auth, MFA and storage setup

**Auth settings** (record each previous value first; apply separately): public sign-up off; JWT expiry 900 s; refresh-token rotation and reuse detection on; TOTP MFA enabled. The `@accounts.dancehall.invalid` identifier may be refused by the Auth server (an open question from the account rollout); if so, set `ACCOUNT_IDENTIFIER_DOMAIN` as described in `docs/CLOUD_ACCOUNTS_ACTIVATION.md`.

**Storage:** apply `community.storage.sql`. Expected result: bucket `community-media`, `public = false`, 8 MB limit, image types only, and **no policy** on `storage.objects` for `anon` or `authenticated`. Only the function (service role) creates signed upload links, reads files and makes short-lived view links.

**Moderator and backup accounts** (done by you or your delegate; staff use real email addresses, unlike the PIN-first members):

1. In the dashboard, add two users (primary and backup) with strong unique passwords.
2. In the SQL editor, run `insert into public.staff_roles (user_id, role) values ('<primary-uuid>', 'moderator'), ('<backup-uuid>', 'moderator');`. Role `moderator` grants only `moderation.review`.
3. Each person opens the moderation console, uses **First time? Set up my authenticator**, adds the key to an authenticator app and confirms a code. Set-up is refused once a verified factor exists, so a stolen password cannot add a second device.
4. Each person signs in again with password plus code; the banner must show the queue (a password-only sign-in must stay locked).
5. Keep a recovery route: the owner can remove a lost factor from the dashboard and the person re-enrols.

**Test members:** 4-6 synthetic accounts created through the `account` function (the app's own sign-up) or the Auth admin API, with made-up usernames and no personal data. No real person's content is used.

## 7. Photo processing and memory limits

**Question: could the function's photo processing exceed Supabase's memory limit? Short answer: not for a legitimate photo, and the paths that could are now closed.**

What happens to one photo: the function reads the stored file, checks its type, size and pixel count, rewrites the picture without metadata, writes it back and records the result. Videos are disabled, so no video is ever read.

Measured under Deno 2.9.6 with an 8 MB JPEG (the cap): about 49 MB baseline, **about 139 MB peak resident memory** over 20 consecutive checks (this includes the test's own buffers and uncollected garbage, so it overstates a single request), and about **5.6 ms** of CPU per check. Against a documented ~256 MB limit that is comfortable for one request, but it is not comfortable if several large files were processed at the same time or if a 25 MB file were ever read.

Risks found, and what was changed locally (all tested, no paid service):

1. **The bucket allowed up to 25 MB and video types** (left over from the earlier video plan). A client could upload a 25 MB file declared as a photo and ask the function to check it. **Fixed:** the bucket is now 8 MB and image types only, so the platform refuses larger files before our code runs.
2. **The function downloaded before checking size.** **Fixed:** it now asks Storage for the stored size first (a HEAD request on a 30-second signed link) and rejects anything over the cap, deleting it, **without reading it into memory**. Integration test: a 9 MB upload is refused and the function made zero downloads.
3. **Several checks could run at once in one instance.** **Fixed:** at most 2 photo checks hold a file in memory per function instance; a third gets `503 busy` with `Retry-After: 5` and the app retries. Worst case is about 2 files, not N.
4. **Decompression bombs:** a small file can claim enormous dimensions. The function reads the declared pixel count without decoding and refuses over 24 million pixels; it never decodes the image.
5. **Video** (when enabled later) is the real memory risk (25 MB held and scanned byte by byte). It stays off, and enabling it requires its own migration, processing design and review.

If staging shows memory errors anyway (Supabase reports them as `546 WORKER_LIMIT`): lower the photo cap from 8 MB to 5 MB (one constant plus the bucket limit); lower the concurrency cap to 1; have the app resize photos harder before upload (it already re-encodes them). If the free plan's limits are still too tight, the next step is a decision for you (Pro plan), not something to enable automatically.

## 8. Email alerts (urgent reports)

- What is built: on an urgent report (self-harm, a possible child, private information) the function emails the primary and backup moderators; an hourly reminder follows while urgent items stay open. Emails contain **counts and a console link only**, never a username or content. Throttled to one immediate email per 15 minutes. A failed email never changes what a member sees. **Off by default.**
- Provider: `docs/LIVE_INTEGRATION.md` already plans **Resend's free tier** for sign-in codes. The sender in code is a generic "POST JSON with a bearer key" sender that matches Resend's send API; no provider is hard-wired. Using it needs: a verified sending domain, a **send-only API key** (separate from the SMTP credentials used by Auth), the recipients, and the variables in section 4.
- Terms to verify before approving (verify): free plan about 100 emails a day and 3,000 a month, 1-3 domains, no charge; that transactional alert emails to the team are within the terms; whether the same account and domain can serve both sign-in codes and alerts. The expected volume (a handful a day at most) is far below the free limits.
- Fallback with no provider: the console banner plus a routine of checking it. This is weaker (no out-of-hours signal), which is why the automatic photo pause and Read only exist.
- Do **not** activate any paid tier. If the free plan is not allowed for this use, stop and ask.

## 9. Estimated costs and provider dependencies

| Item                              | Cost during the invite-only test    | Notes                                                                                                                                                                              |
| --------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase staging project          | **$0** on Free (verify)             | About $25 a month on Pro if needed (verify). Two projects per organization on Free is typical (verify), so check the count.                                                        |
| Edge Functions, Storage, database | $0 at this scale                    | A few accounts, a few synthetic photos                                                                                                                                             |
| Resend                            | **$0** on Free (verify)             | Paid tier is about $20 a month (verify): do not enable                                                                                                                             |
| Deno, local tooling, CI           | $0                                  |                                                                                                                                                                                    |
| Domain / DNS                      | $0 if the existing domain is reused | Needed for the email sender's SPF/DKIM                                                                                                                                             |
| Authenticator app                 | $0                                  | Any standard app                                                                                                                                                                   |
| Native test build                 | Needs your separate approval        | EAS or Xcode build is required to try the app on a phone; the earlier rule (no EAS build without approval) still applies. The admin console and function can be tested without it. |

Dependencies: a Supabase account/organization (yours), a Resend account and verified domain (existing plan), the support mailbox (to be created), two moderator people, an authenticator app each. No paid dependency is required.

## 10. Security and privacy tests to run against real Supabase

Run in order, record each result (pass / fail / not applicable) in a copy of this table. Use synthetic data. Stop at the first failure in A or B.

**A. Before applying the Community migration (after migrations 1-15)**

- A1. All public tables have RLS on (`pnpm db:test` logic; or the dashboard's security advisor shows no table without RLS).
- A2. `anon` and `authenticated` cannot execute any `acct_*` function.
- A3. Public sign-up is off: a sign-up request is refused.
- A4. The first Auth admin-created email-free identifier is accepted (or the fallback domain is set).

**B. Immediately after applying Community (function not yet deployed)**

- B1. `POST /rest/v1/rpc/community_rpc` with the **publishable key** and with a signed-in member's token returns an authorization error (this is the most important check: the door must be service-role only).
- B2. `anon` and `authenticated` cannot `select` or `insert` any `community_*` table through the REST API.
- B3. `app` is not an exposed schema.
- B4. Run the security and performance advisors; no new high-severity finding. Record all warnings.
- B5. The storage bucket is private; an unauthenticated request for a (test) object is refused; no policy mentions `community-media`.

**C. After deploying with `COMMUNITY_FLOOR_MODE=read_only`**

- C1. A guest can read the feed with only the publishable key; a bad token reads as a guest.
- C2. Every member route returns 401 without a valid token and for a forged or expired token.
- C3. Posting, commenting and uploads return `paused`.
- C4. Logs show no request body, no token, no key (check the function's log output).
- C5. Response headers and bodies contain no user id, synthetic address or storage path with an account id.
- C6. Memory: run 20 sequential 8 MB photo commits and 5 concurrent ones; no `546` errors; busy responses appear only above 2 concurrent; record peak memory if the dashboard shows it.

**D. Open the test (switch to `open`, invite-only, synthetic content)**

- D1. A test member picks a username, changes it once, and is refused a second change; look-alike names are refused.
- D2. Text post publishes; unsafe text is refused without echo; a weight-claim post is held.
- D3. Photo: upload, check, post; it is held; guests and other members cannot see it; its author sees it; the signed link works, expires and fails when altered.
- D4. The stored file has no location or camera metadata (inspect an uploaded test image that contained them).
- D5. A disguised file (for example an HTML file named `.jpg`) is rejected and deleted; a 9 MB file is refused.
- D6. Video upload is refused (`video_disabled`); status reports `videoEnabled: false`.
- D7. Primary moderator: password-only sign-in is refused; with the authenticator code the queue loads; approve publishes; remove deletes the file from the bucket.
- D8. Backup moderator can do the same; the audit log names each separately.
- D9. A non-staff member with MFA enrolled is refused moderation routes; a staff member at password-only level is refused.
- D10. Mute, suspend and release behave as in the local tests; blocking is mutual and silent.
- D11. Read only from the console stops new posts and comments; reading, reporting and deleting continue; reopening works; **everything else in the app (goals, food, workouts, account) keeps working throughout.**
- D12. Daily and per-minute limits trigger; a guest hammering the feed is limited.
- D13. Urgent alert (once approved): one email with counts only to both moderators; none for ordinary reports; none while alerts are off; the hourly reminder works.
- D14. Leave Community removes the member's posts, name and files; the account and its non-Community data remain.
- D15. Request deletion of a test account and complete it; afterwards no Community rows and no files remain (run `maintenance/prune` and check the bucket).
- D16. Existing privacy rules unchanged: no health data in any Community response; moderators never see health records; Share My Achievement posts only title, style and (if chosen) minutes.
- D17. The appeals mailbox receives a test message and a named person can answer it.

## 11. Stop and rollback criteria

**Stop the test immediately (switch to Read only first, investigate second) if any of these happens:**

1. Any Community request returns another person's data, an account id, a synthetic sign-in address, a key or a file the caller should not see.
2. B1 or B2 fails (clients can reach the database door or tables).
3. A password-only or non-staff session reaches any moderation route.
4. A published photo is reachable without a valid signed link, or a link does not expire.
5. A photo is published without moderator approval.
6. An unexpected cost, plan limit or suspension notice from either vendor.
7. A deletion leaves Community data or files behind.
8. Repeated `546` or out-of-memory errors in the photo path that the mitigations in section 7 do not fix.
9. An urgent item stays unreviewed past the 4-hour internal target during a staffed test window, or either moderator is unavailable with items waiting and no cover.
10. Any real personal content appears in a staging post.

**Roll back** with the order in section 2: Read only, then function off and jobs removed, then `community.down.sql` and the bucket, then delete the project. After a stop, nothing restarts without a written note of cause and fix and your approval.

## 12. What needs your approval

1. Create the separate **staging project** (name, region, who owns the organization).
2. **Apply** migrations 1-17 to it, in the order above.
3. **Deploy** `account` and `community` to it, with `COMMUNITY_FLOOR_MODE=read_only` at first.
4. Set the **secrets** (generated by the person doing it, never shared in chat).
5. Name the **moderator, backup and escalation contact**, and approve creating their accounts.
6. **Email alerts:** confirm Resend's free terms allow this use and approve switching alerts on (or choose the console-only fallback for the test).
7. Confirm the **support mailbox** address and who answers it.
8. A **staging app build** for a phone (needs your EAS/Xcode approval), or approve testing through the admin console and a web export only.
9. The scope of invitees (internal accounts only) and the test window.

Until those approvals, nothing is created, applied, deployed or enabled.
