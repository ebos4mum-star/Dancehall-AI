# V1 verification plan (nothing here has been run on hosted staging beyond what `docs/CLAUDE_HANDOFF.md` records)

Staging project: `bxhnrjulksganzydgrgm` only. Every staging script calls `assertStagingRef` and needs `STAGING_REF`, `STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT` and `STAGING_PUBLISHABLE_KEY` (publishable key only). Never use production or development.

## 1. What can run while staging stays `read_only`

| Check                                                                                                                                  | Command                                                                             | Needs                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-only HTTP subset (writes refused, forged token 401, guest feed 200, GET 405, no messaging route, status shows video/comments off) | `READONLY_SUBSET=1 node scripts/staging/community-v1-checks.mjs`                    | Publishable key; the script still reads `STAGING_V1_USERS` and `PHOTO_DIR` at start, so give it a placeholder file/folder (already passed once) |
| Guest rate limit (expect HTTP 429 to start)                                                                                            | `node scripts/staging/guest-limit-and-expiry.mjs guest-burst`                       | Run from the owner's own single-address connection. Not provable from this container (rotating egress address)                                  |
| Expired token refused on member routes                                                                                                 | `EXPIRED_TOKEN_FILE=<file> node scripts/staging/guest-limit-and-expiry.mjs expired` | One synthetic member token older than 1 hour (needs one synthetic account, see section 2)                                                       |

These are read-only. The first two need no synthetic account. Claude's container can run only the first, and only after a network-host approval for `bxhnrjulksganzydgrgm.supabase.co`.

## 2. What needs temporary open mode

`community-v1-checks.mjs` (upload, immediate publish, likes, video refusal, report, block, auth) and `PHOTO_MODE=published node scripts/staging/photo-checks.mjs` both refuse to run unless the stored mode is `open` **and** the `COMMUNITY_FLOOR_MODE` secret is `open`. Both are hosted settings: **approval required**.

### Safe open-mode procedure (owner approves each step; one sitting, under about an hour)

1. Record the baseline: stored mode `read_only`, floor secret `read_only`, video/comments off, 0 synthetic users, audit chain valid.
2. Create the synthetic accounts: 2 members (`m1`, `m3`) and 1 moderator with authenticator MFA. Use a bcrypt hash in SQL, never a clear password. Put credentials in a git-ignored file that is shredded afterwards. Use generated images only.
3. Owner sets floor secret `COMMUNITY_FLOOR_MODE=open` in the dashboard. A moderator at AAL2 sets the stored mode to `open` (`app.community_set_mode` through the function's moderator route).
4. Run, in order: `node scripts/staging/community-v1-checks.mjs`, then `PHOTO_MODE=published node scripts/staging/photo-checks.mjs`. Save the PASS/FAIL output (no secrets are printed).
5. **Always restore, even if a check failed:** stored mode back to `read_only` first, then floor secret back to `read_only`. Confirm with `READONLY_SUBSET=1 node scripts/staging/community-v1-checks.mjs`.
6. Clean up: delete the synthetic posts, uploaded storage objects, reports, blocks, then the users, identities and sessions, and moderator rows. Confirm counts are all 0 and the audit chain still verifies. Remove the temporary network host from the Default environment. Shred the credentials file.

Failure rule: if any step errors, stop, do step 5, then step 6. Do not leave open mode on overnight.

## 3. Native iPhone verification (not run; needs a Mac with Xcode and the owner)

Use `docs/NATIVE_IOS_TEST.md` section 2 as the checklist (Keychain, Face ID/PIN lock, VoiceOver, Dynamic Type, barcode camera, haptics, notification permission, offline behaviour, Friends). Order:

1. `docs/NATIVE_IOS_TEST.md` section 0 prerequisites, then `cp scripts/friends-staging.env.example .friends-staging.env` and paste the staging publishable key.
2. `bash scripts/friends-staging-ios.sh` (Simulator) and then `--device` for the real iPhone (the owner's own Xcode signing; the script touches nothing). This runs locally: no EAS, no upload.
3. Friends two-account steps: `docs/FRIENDS_IPHONE_TEST.md` Track A, then Track B only after staging approval.
4. Send back the results as listed in section 3 of the runbook.

**Community on a phone:** `bash scripts/friends-staging-ios.sh --community` (add `--device` for an iPhone) now switches Community on for that local run only; it needs staging in open mode (inside the section 2 window), otherwise the feed shows as paused. Production flags are untouched (a production build still refuses Community and Friends). Photo-only items worth checking: picker permission wording, upload, immediate publish and Like.

## 4. First native iPhone build: staging-only EAS profile (prepared, not started)

Profile `staging-preview` in `apps/mobile/eas.json`: internal distribution, `EXPO_PUBLIC_APP_ENV=preview`, `AUTH_MODE=supabase`, `CLOUD_ACCOUNTS=1`, `SOCIAL=1` (Friends), `COMMUNITY=1`, and `environment: "staging"`. It has no credentials and no URLs; the staging URL and publishable key come from an EAS environment named `staging`. No other profile enables Friends or Community, a production build refuses both flags (`resolveConfig`), and tests lock all of this (`buildConfig.test.ts`, `cloudBoundary.test.ts`). Bundle ID `com.dancehallfit.app`, slug `dancehall-fit-ai`, scheme `dancehallfit` and signing are unchanged.

Remaining requirements before the first build (all owner actions, none started):

1. Expo account with `eas-cli` logged in on a machine you control; run `eas init` in `apps/mobile` (adds `extra.eas.projectId` and `owner` to `app.json`; no EAS project exists yet).
2. EAS environment `staging` (expo.dev, project, Environment variables) with `EXPO_PUBLIC_SUPABASE_URL=https://bxhnrjulksganzydgrgm.supabase.co` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging publishable key>` (Supabase dashboard, Settings, API). Never a secret key, never the development or production project.
3. Apple Developer team, with EAS-managed or your own signing, and your iPhone registered for internal distribution (`eas device:create`). Claude makes no signing changes.
4. Your explicit go-ahead for `eas build --profile staging-preview --platform ios`. Never `--auto-submit`; `submit` stays production-only and unused.
5. Community on the phone only posts while staging is open (approved window, floor secret and stored mode both `open`). While `read_only` the feed reads but posting shows as paused.

Optional, not required for staging: `EXPO_PUBLIC_SUPPORT_EMAIL`, privacy and support URLs. Open Food Facts stays off.

## 5. Remaining launch checklist (one list)

Owner approvals / actions

- [ ] Approve the open-mode window in section 2 (floor secret, stored mode, synthetic accounts, network host).
- [ ] Run guest-burst from your own connection; provide one old token for the expired check.
- [ ] Native iPhone pass on a Mac (section 3); decide on Community-on-phone.
- [ ] Support email, privacy-policy URL and support URL (`EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_SUPPORT_URL`).
- [ ] Legal/counsel review (Community terms, guidelines, photo-first wording); dietitian/cultural review of foods and recipes.
- [ ] Decide on image moderation for App Store 1.2 (paid; photos cannot be scanned automatically).
- [ ] Approve production migrations (`community.up.sql`, `community.storage.sql`, `social.up.sql`, `account_deletion_purge.up.sql`) and scheduling the account-deletion executor.
- [ ] Decide Friends enablement and Open Food Facts activation for shared builds.
- [ ] App Store items in `docs/APP_STORE_READINESS.md` (2.1.2 reviewer access, 5.1.2 policy link, App Privacy answers).
- [ ] Cleared instructional workout video (separate from user video).
- [ ] Only after all of the above: approve the first EAS/TestFlight build.

Blocked for Claude: all hosted staging steps (approval), all native steps (no Mac).
