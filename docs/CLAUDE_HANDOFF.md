# Claude handoff: Locked In Fitness (formerly DanceHall Fit AI)

Written when the previous account hit its usage limit. Read this first, then `docs/V1_COMPLETION.md`, `docs/STAGING_STATUS.md`, `docs/COMMUNITY_PATCH2_STAGING_PLAN.md`.

## Where things are

- Repository: https://github.com/ebos4mum-star/Dancehall-AI.git
- Branch: `feature/overnight-nutrition-fitness` (all work lives here; the tip commit is the one that added this file; `git log -1` shows it). Last code/test commit before the handoff docs: `d0e0e3a`.
- `main` and `integration/live-prep` are untouched. No PR, no merge.
- Monorepo (pnpm): `packages/shared`, `packages/ai`, `apps/mobile` (Expo SDK 58, expo-router), `apps/admin`, `supabase/` (migrations, `proposed/`, functions, tests), `scripts/`.

## Completed V1 features (automated and browser-verified only)

Account/auth/PIN/privacy/export/deletion; nutrition diary, copy/repeat meals, saved meals, "My products"; recipes, Fridge-to-Meal (starter chips), weekly plan, grocery list; barcode (my products, offline memory, consent gate, 12/min cap; Open Food Facts code ready but OFF); workouts, energy double-count protection, week/month summaries; Friends and Group Goals (staging only); Community (see below); 44pt switch rows; Friends retry state. Tests at last full run: shared 915, mobile 609, ai 116, admin 27, scripts 43; local Community end-to-end 26/26; SQL dry runs pass.

## Approved product decisions (do not reopen)

- Community: photos and captions publish immediately; no staff approval, no first-post review, nothing held. Text is published or rejected with a reason. Rejected: self-harm/eating-disorder content, links/contact details, dangerous health claims (cure, detox, miracle, starvation), diet-drug promotion (names and "diet pills"), harassment. Ordinary weight, calorie and personal weight-loss talk is allowed; the 1.5 kg/week rule was removed.
- Public like counts (number only, never who). The reaction is the old "Encourage", labelled Like.
- No user video uploads (hard-off in server code and database), no comments, no private messaging.
- Kept: reporting (serious reasons hide a post at once and queue it), mutual blocking, upload validation (type, size, metadata stripped), rate limits, post-publication removal, usernames only, no private health/nutrition/workout data in Community.
- Friends off in production/shared builds (`EXPO_PUBLIC_SOCIAL`); Community public feed default off; Apple Health excluded; Open Food Facts off until owner approves; no paid services; no invented support email.
- Instructional workout video is a separate requirement (none cleared; YouTube embed plan awaits terms/permissions).

## Staging (project `<staging-ref>` ONLY)

- Community stored mode: **`read_only`** (verified again at handoff), video off, comments off. `COMMUNITY_FLOOR_MODE` secret is owner-set to `read_only`. Never switch to open without the owner.
- Patch 2 **APPLIED**: `supabase/proposed/community.patch2_photo_immediate.sql` (SHA-256 `70fb1a2d6cca5694f169bf2ee6ede9d31cf0d3664c25e76852f09ee904b9c1de`, pinned commit `887b7801ab50d5471dd5f2f15d2b99f81ea76387`, hash-verified loader; temporary `http` extension dropped). Replaces exactly `app.community_screen`, `app.community_create_post`, `app.community_feed`; staging definitions match a fresh local build. Rollback: `community.patch2_photo_immediate.down.sql` (verified locally).
- Edge Function `community` **v10** (hash `c6debb97e9d8e9541c723f336acaa07b28cade6f4a2861a852180a168fbf6940`, shared code pinned to `887b7801…`). `social` v4 (hash `09f95127…`), `account` v1 (hash `ac596a31…`).
- Applied on staging: all repository migrations, `community.up.sql` (earlier version) + `community.storage.sql`, `account_deletion_purge`, `social_up`, `social_patch1_view_dedupe`, `community_patch2_photo_immediate`.
- NOT applied anywhere else: production and development Supabase (`<development-ref>`) have none of the proposed SQL. Production needs `community.up.sql` (current, includes patch 2), `community.storage.sql`, `social.up.sql`, `account_deletion_purge.up.sql`, each with explicit owner approval. The account-deletion executor is not scheduled.
- Audit log chain: 10 of 10 valid. Staging is clean of synthetic data (users, identities, sessions, staff, members, posts all 0). Temporary network host removed from the Default environment. Scratch credentials shredded. Unused environment `dancehall-ai-staging-http` still exists (no delete tool).

## Verified on staging

- 18/18 database-level checks on the live staging functions, run in a transaction that rolled back: photo publishes at once, ordinary weight/calorie talk and capitals publish, nothing held, diet-drug/dangerous claim/harassment rejected, public like counts, no self-like, video and comments refused, report hides a published photo (author still sees it), block works, no ids/emails in the feed.
- HTTP read-only subset (all pass): writes refused without sign-in (401, or 503 while Read only), forged token 401, guest feed 200, GET 405, no messaging route 404, member post and upload ticket 503 while Read only, status reports video/comments off.
- Earlier phases (see `docs/STAGING_STATUS.md`): photo security suite, member/MFA checks, Friends suite 95/95 + 5/5.

## Remaining HTTP tests (not yet run)

1. Open-mode HTTP suite `scripts/staging/community-v1-checks.mjs` (upload, immediate publish, likes, video refusal, report, block, auth). Needs stored mode AND the floor secret `open`. The tool to set the floor secret was denied by the auto-mode classifier; the owner must set `COMMUNITY_FLOOR_MODE=open` in the dashboard (or allow the tool), then restore `read_only`. Also `PHOTO_MODE=published node scripts/staging/photo-checks.mjs`.
2. Guest rate limit from one machine: `guest-limit-and-expiry.mjs guest-burst` showed 100x HTTP 200 here (rotating egress address); proven locally only.
3. Expired token: `guest-limit-and-expiry.mjs expired` needs a member token more than an hour old. Not run. Proven locally (tokens expired seconds ago refused on every member route).
   Needed to run these: add host `<staging-ref>.supabase.co` to the Default environment, set `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`, use the publishable key from `get_publishable_keys` only, create synthetic accounts with bcrypt hashes (never put clear passwords in SQL), delete them and remove the host afterwards.

## Launch blockers and approvals needed

- Native iPhone testing (none has happened; Linux container only, no Xcode/macOS): Keychain, Face ID/PIN lock, VoiceOver, true Dynamic Type, camera barcode scanner, haptics, Friends on a phone. Runbooks: `docs/NATIVE_IOS_TEST.md`, `docs/FRIENDS_IPHONE_TEST.md`.
- Support email and privacy/support URLs (none configured), legal/counsel review (Community terms, guidelines, photo-first wording), dietitian/cultural review of foods and recipes.
- Production migrations and scheduling the account-deletion executor; Friends enablement in shared builds; Open Food Facts activation (support address, API usage form, privacy wording).
- Photos cannot be scanned automatically; App Store guideline 1.2 may question that (an image-moderation service would be a paid addition and needs approval). Auth leaked-password protection needs a paid plan.
- App Store items in `docs/APP_STORE_READINESS.md` (2.1.2 reviewer access, 5.1.2 policy link, App Privacy answers); cleared instructional video content.

## Next steps for the next Claude session

1. `git clone https://github.com/ebos4mum-star/Dancehall-AI.git && cd Dancehall-AI && git checkout feature/overnight-nutrition-fitness && pnpm install`. Confirm `git log -1` shows the handoff commit.
2. `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm check:edge && pnpm check:secrets && pnpm test:scripts && pnpm db:test` (local Deno for the community integration test: set `DENO_BIN`).
3. Ask the owner to set `COMMUNITY_FLOOR_MODE=open` (dashboard), then run the open-mode suite (item 1 above), restore `read_only`, clean up.
4. On a Mac with the owner's approval: native iPhone verification, then (only with explicit approval) any EAS/TestFlight step. Not allowed without approval: EAS, TestFlight, App Store, production changes, PR/merge, development Supabase, other apps (Nadiya, Swipe a Need).
