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
