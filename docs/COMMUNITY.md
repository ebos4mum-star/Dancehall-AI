# Community and Share My Achievement

Status: **built locally, off in production.** Nothing here is applied to a hosted project. The public feed must not be enabled until the launch checklist below is complete and the owner approves.

## What exists

- One chronological feed (`/community`); guests browse, members post, comment and Encourage. One Share Progress action, one Encourage reaction, flat comments.
- Post types: text, motivational story, milestone, optional before/after photos, short video (30 s).
- Public usernames only (3-20 chars, no real names, no digit/hex strings, reserved/brand/abusive/eating-disorder names refused). Member-only actions reuse the PIN-first account gate (`community_post`, `community_join`).
- Report, block (mutual and silent), delete own content, delete account removes everything.
- Share My Achievement: from workout completion and the achievements list. Shows a preview, minutes off by default, and needs an explicit "everyone can see this" confirmation. Never auto-posts. Health data is never in the payload (whitelist: title, style, optional minutes).
- Not built, by design: follows, DMs, hashtags, algorithmic feed, leaderboards, rich profiles.

## Safeguards (shared rules in `packages/shared/src/community.ts`, mirrored in SQL)

- Text screening: blocks self-harm, eating-disorder content, emails, links, phone numbers, mentions, contact solicitation; holds weight-loss claims, health numbers, health claims, shouting. Self-harm text shows support information.
- Photos and videos are always held for review. Reports: 3 distinct reporters, or one report for private information / self-harm, hide content at once.
- Daily limits for posts, comments, reactions, reports. Suspension by staff.
- Encourage counts are visible to the author only (no popularity signal).
- Public projections never contain account ids or synthetic auth emails.

## Server design (all local, NOT DEPLOYED, NOT APPLIED)

- **Database proposal:** `supabase/proposed/community.up.sql` (+ `.down.sql`, `community.storage.sql`). Tables have RLS on with deny-all policies and no client privileges. Every operation is an `app.community_*` function. The `app` schema is not exposed; the Edge Function reaches the allow-listed functions through a single service-role-only door, `public.community_rpc`.
- **Edge Function:** `supabase/functions/community/index.ts`, with logic in `packages/shared/src/community-server.ts` (generated copy in `_shared/generated`). Verified JWT identity (never from the request body), field-by-field validation, per-member and per-network rate limits before any work, generic errors, short-lived signed links for media. Staff routes need a verified second factor and are re-checked in the database.
- **Media:** private bucket, no client policy. The member gets a one-time signed upload link, then the server downloads the file, checks its real type (not the claimed one), size, pixel count and video length, strips location/camera metadata from images, refuses videos with a saved location, and only then lets a post attach it. File paths carry no account identifier. Every photo and video is still reviewed by a person before publication. Video is checked but **not transcoded** (see dependencies).
- **Usernames:** changeable; first change free, then every 30 days; the released name is held for 90 days; look-alikes of staff, the app and other members are refused (`usernameSkeleton`).
- **Moderation:** audit-logged actions, report handling that resolves rather than deletes, removal that deletes files, member restrictions (muted/suspended, optional end), backlog counts and targets, manual and automatic modes.
- **Admin console:** `apps/admin` Moderation page. Staff sign-in is password + authenticator code against the project's Auth service; with no project configured it offers a clearly labelled demo with made-up items.

## Verification (local)

- `bash supabase/proposed/community-dry-run.sh`: database privileges, TS/SQL rule parity, behaviour, uploads, moderation, restrictions, modes, rate limits, deletion, rollback, re-apply, on a throwaway Postgres.
- `pnpm -r test`: shared (rules, engine, media, server), mobile (store, Edge Function client), admin (queue rules, console rendering, staff sign-in).

## Documents prepared for review

`COMMUNITY_GUIDELINES.md`, `COMMUNITY_PRIVACY_DISCLOSURE.md`, `COMMUNITY_TERMS.md`, `COMMUNITY_MINORS_POLICY.md`, `COMMUNITY_MODERATION.md`. All are drafts for the owner and a lawyer.

## Launch checklist (all open)

1. Owner approval to apply `community.up.sql` and `community.storage.sql` to a **staging** project first; run the dry-run's checks there; security review of the applied schema.
2. Owner approval to deploy the `community` Edge Function to staging, with `COMMUNITY_PEPPER` and `COMMUNITY_MAINTENANCE_KEY` set, and a scheduled call to `maintenance/prune`.
3. Create the moderator's staff account with an enrolled authenticator factor; confirm a non-staff account and a password-only staff session are refused.
4. Name the moderator, backup and escalation contact; decide targets and appeals.
5. Legal review of the Guidelines, privacy disclosure, Terms and minors policy; safeguarding review of the word lists.
6. Decide on video processing (below) and out-of-hours alerts (below).
7. Device test of upload, posting, username change and leaving on a real phone.
8. Build with `EXPO_PUBLIC_COMMUNITY=1` only after 1 to 7. Production builds with the flag still throw.

## Dependencies needing an external provider or an operating decision

- **Video transcoding and deeper inspection.** The server checks type, size, length and saved location, but cannot re-encode video or detect content. A transcoding/inspection service (a paid or self-hosted worker) would remove embedded metadata and standardise formats. Until then every video is human-reviewed and videos with saved locations are refused.
- **Automated image/video safety scanning** (for example nudity or CSAM hashing). Not built; every file is human-reviewed. Some jurisdictions expect hash-matching for child-safety content; counsel must advise. This is a paid or regulated service.
- **Out-of-hours alerts** to the moderator or escalation contact for urgent reports (email/SMS/push provider). Not built; the console banner is the only signal.
- **Staff account setup**: the moderator account and authenticator enrolment are done in the Auth dashboard by the owner.
- **Word lists** reviewed by a safeguarding adviser; **translations** for non-English launches.
- **Hosted storage region and retention** decisions.

## Decisions needed

See `COMMUNITY_MODERATION.md` ("Decisions needed") and the checklist above. Product decisions already made: usernames are changeable; authors see their own Encourage counts and there are no public rankings; text, photos, before/after and short videos are in V1, all media reviewed before publication; one moderator with MFA.

## Integration testing (local, no hosted project)

`pnpm test:community-integration` runs the whole request path on one machine: a phone-like client, the real `community` Edge Function under a **real Deno runtime** (built as the same flat bundle a deploy would use), supabase-js, a local stand-in for Supabase Auth, REST and private Storage (`scripts/community-integration/platform.mjs`, strict about signatures and expiry, every database call run as the `service_role` role), and a real Postgres with all migrations plus `community.up.sql`. It needs Postgres and Deno (`DENO_BIN`, or `deno` on PATH) and skips with a reason otherwise. 23 scenarios pass, covering:

- guest browsing, bad/forged/expired tokens, body limits;
- username claim and change, look-alikes, the held old name, cooldown;
- unsafe text refused without echo, held text, explicit confirmation, author-only Encourage counts;
- uploads: one-time signed link, real-type check, metadata removed from the stored file, no account id in any path, held posts invisible to others, signed links that tamper-fail and expire, a disguised HTML file rejected and deleted, nobody else's upload can be committed or attached, video refused while disabled;
- moderation: ordinary member, staff without a second factor, non-staff with one, forged and expired tokens all refused; moderator and backup both act; approved media becomes public; removed media is deleted from storage; the audit log names each moderator and holds no notes or content;
- abuse: mute, suspend, release; daily post limit; per-network request limit; quiet repeat reports; mutual silent blocks;
- Read only and text only switches, and the Community-only configuration floor that works with the database down while the normal instance is unaffected;
- urgent email alerts: nothing sent by default; when configured, one email to moderator and backup with counts only, throttled, plus a scheduled reminder;
- leaving Community, and an account deleted by cascade followed by maintenance leaving no file in storage;
- a scan of every response for account ids, synthetic sign-in addresses and keys.

What the stand-in is **not**: real Supabase. Real PostgREST error formats, real Auth (including MFA enrolment and `aal` claims minted by GoTrue), real Storage policies, and Edge runtime limits are verified only in a controlled hosted test (see below). The first run of this harness found one real defect in the stand-in's response encoding, and the Deno type-check of the bundle passed.

## Remaining security gaps before a controlled hosted test

1. **Real Auth behaviour.** The function trusts `aal` from a token the Auth service has just validated; confirm on staging that a password-only staff session carries `aal1` and a TOTP-verified one `aal2`, and that the Auth `getUser` call rejects revoked sessions.
2. **Real Storage.** Confirm on staging that the bucket is private with no policy, that signed upload/view links behave as in the stand-in, and that file-size limits are enforced by the platform as well as by the server.
3. **Edge limits.** Photos (8 MB cap, image types only at the bucket) are checked after a size pre-check, at most 2 at a time per instance; measured peak about 139 MB for an 8 MB photo. Confirm on the real runtime. See `COMMUNITY_STAGING_READINESS.md` section 7.
4. **Rate limits** are database-backed fixed windows keyed by a hashed network address (guests) or account. A distributed attack across many addresses is only slowed by the daily per-account limits and the automatic pause. Consider a platform-level limit as well.
5. **Video** stays disabled (there is no API to enable it; it needs an approved migration). Needed first: metadata removal, safe processing and moderation requirements.
6. **Image safety scanning** is a launch dependency to evaluate, not built. Every file is human-reviewed first.
7. **Email alerts** are off until a provider is approved; the sender has never been exercised against a real provider.
8. **Word lists, translations and legal review** (United States) are outstanding.
9. **Privacy of the audit log.** It records the acting moderator and target identifiers; retention and access need counsel's view.
10. **The admin console** has been tested with a stand-in Auth flow only; run it against staging with a real moderator account.
11. The aal1 token for a staff member is held in memory during sign-in only; no persistent staff session exists.

## Decisions required before a controlled hosted test

1. Approve a **staging** Supabase project (separate from production) for applying `community.up.sql` and `community.storage.sql` and deploying the function. Production stays untouched.
2. Name the **primary moderator, backup and escalation contact**, and create their staff accounts with authenticator factors.
3. Approve an **email provider** for urgent alerts (or decide to rely on checking the console for the test).
4. Set the public **support email** for appeals (`EXPO_PUBLIC_SUPPORT_EMAIL`).
5. Confirm the provisional **4-hour / 48-hour** targets are what you want to measure against (they are not promises).
6. Counsel's answers on the **United States** questions in the minors, privacy and terms drafts, before any real members are invited.
7. Whether the controlled test is invite-only, text and photos only (video stays off).

## Staging

The hosted-test preparation package is `docs/COMMUNITY_STAGING_READINESS.md` (project requirements, migration order and rollback, deployment, secrets by name, Auth/MFA/storage, moderator setup, alerts, costs, real-Supabase tests, stop criteria, approvals needed).
