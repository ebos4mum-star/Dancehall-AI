# Progression (XP, levels, streaks, quests, badges, leagues) and Apple Health import: architecture

Status: implemented and tested on Linux (unit, mock, browser with a simulated Health provider, local integration against real Deno + Postgres). **Not verified on a device**: HealthKit, haptics feel and animation feel are native-only (section 8). The server parts exist as reviewed code and proposed SQL; **nothing was deployed or applied**.

## 1. Product rules (from the owner, enforced in code and tests)

- No separate Journey tab (the five tabs are unchanged; a test checks this in the browser).
- Rewards sit in Home, Workouts, Nutrition, Progress, Friends, Group Goals and Settings.
- Nothing is rewarded for calories, weight, weight change, fasting or eating less. A meal log earns a small fixed amount once a day whatever it contains, and a quest can ask only to "log a meal".
- Exercise XP is capped per workout (45 min), per day (2 workouts, 100 XP) and per week (400 XP). A day above two hours of recorded exercise shows a rest note and earns nothing more. A league number is capped too, so doing more than the safe amount never wins.
- Planned rest days (chosen by the person, up to four a week) never break a streak. One unplanned missed day a week is forgiven automatically. Levels, badges and cosmetics are never lost. Today is "open", never "missed".
- Streak days count movement (10 minutes) or a habit tick. Food logging is not part of the streak.
- Rewards can be switched off in Settings; then nothing is shown and Pulse wears nothing.
- Leagues are optional, friends-only, mutual opt-in, blocked people never appear, and a row is a username plus one number. Group Goals stay cooperative (one shared total, no ranking).
- The XP engine never receives calories, weight, food names, notes or health samples (a test checks the input shape).

## 2. Where things are (repository)

| Piece                                                               | File                                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine (pure, self-contained, also copied to the Edge Function)     | `packages/shared/src/gamification.ts` (+ `.test.ts`, 19 tests)                                                                                                                                                                    |
| Server routes `gm/state`, `gm/sync`, `gm/league`, `gm/league/optin` | `packages/shared/src/social-server.ts` (copied to `supabase/functions/_shared/generated/` by `scripts/sync-edge-core.mjs`)                                                                                                        |
| Database (PROPOSED, not applied)                                    | `supabase/proposed/health_sync.up/down.sql`, `gamification.up/down.sql`, `tests/gamification.test.sql`, `gamification-dry-run.sh` (runs inside `pnpm db:test`)                                                                    |
| Edge routing to the new door `gm_rpc`                               | `supabase/functions/social/index.ts`                                                                                                                                                                                              |
| Client store methods (`gmSync`, `gmLeague`, `gmSetLeague`)          | `apps/mobile/src/data/types.ts`, `supabaseSocial.ts`, `mockStore.ts`                                                                                                                                                              |
| Hook, per-account prefs                                             | `apps/mobile/src/gamification/useGamification.ts`, `prefs.ts`                                                                                                                                                                     |
| UI                                                                  | `apps/mobile/src/gamification/ui.tsx`: `ProgressionCard` (Home), `MovementProgressCard` (Workouts), `MealQuestChip` (Nutrition), `BadgesCard` (Progress), `LeagueCard` and `GroupCoopNote` (Friends), `GmSettingsCard` (Settings) |
| Companion                                                           | existing original Pulse (`src/pulse`); cosmetics store `src/pulse/cosmetics.ts` and accessories drawn in `PulseFigure.tsx`                                                                                                        |
| Apple Health                                                        | `apps/mobile/src/health/` (`contract.ts`, `appleHealth.ts`, `sync.ts`, `prefs.ts`, `provider.ts`, `ui.tsx`)                                                                                                                       |
| HealthKit only in the staging build                                 | `apps/mobile/app.config.js` (dynamic layer over `app.json`) and `eas.json` profile `staging-preview`                                                                                                                              |

## 3. How XP is decided (server-authoritative)

1. The server (Edge Function `social`, route `gm/sync`) reads the signed-in person's own recent rows through `app.gm_inputs` (workout ids, times, durations, styles, meal-log days, habit days; nothing else) and runs the shared engine.
2. It records the result with `app.gm_record` into `gm_ledger`, unique per `(user, event id)`. Event ids are built from the record that earned them (`workout:<session id>`, `meal:<day>`, `habit:<day>`, `quest:<period>:<id>`, `badge:<id>`), so a retry, a second device, a replay or an import repeated cannot pay twice. The database re-validates kind, amount ceilings, and that the day is recent.
3. The client sends only its preferences (target 1 to 5 days, rest weekdays), which are normalised server-side and only change how easy a personal goal is. Anything else in the request (for example `xp` or `events`) is ignored; an integration test sends fake XP and checks nothing is recorded.
4. Without the Friends server (production today) the same engine runs on the phone over the same records, so the screens still work; nothing is ever supplied by the user.
5. Leagues read the ledger (`app.gm_league`): me plus accepted, unblocked friends who also opted in. Account deletion cascades the ledger and the opt-in.

## 4. Apple Health import

- Off everywhere except builds made with `EXPO_PUBLIC_APPLE_HEALTH=1` (the `staging-preview` profile). A production build refuses to start with the flag on. In the development mock a clearly labelled simulated provider is used.
- Nothing is asked or read until the person turns the Settings switch on; then the system permission sheet appears (READ access to workouts only; write access and background delivery are not requested; the HealthKit plugin is added only for that build, with `NSHealthUpdateUsageDescription` off and `background: false`; verified with `expo prebuild` on Linux: the entitlement file holds `com.apple.developer.healthkit` and nothing else).
- Only a workout's id, type, start and end cross the boundary. Calories, heart rate and routes are never read. An imported workout becomes a completed session `Apple Health: <type>` with `source = apple_health` and the Apple id as `external_id`.
- Duplicates are prevented four ways: skip an id already imported; skip a workout overlapping an in-app session (10-minute window); a store/database uniqueness rule on `(user, external_id)`; and the XP engine ignores an Apple Health session overlapping an in-app one. One import runs at a time.
- iOS never tells an app whether read access was granted, so "nothing imported" is explained in the screen.
- One physical workout counts once everywhere (`packages/shared/src/eligible-workouts.ts`, mirrored in SQL by `app.eligible_workouts`; both are driven by `supabase/tests/eligible-workout-cases.json`). The rule is recomputed on every read, nothing is stored to link two records, so both arrival orders, late imports, retries, edits and deletions work by themselves: an in-app record wins over an overlapping Apple Health record (start within 10 minutes of the in-app start, or during it); overlapping Apple Health records count once (earliest start); a repeat of the same in-app workout within 10 minutes counts once; separate workouts, even the same day, are never merged. Group Goals (`social_sync_group`), a friend's weekly summary, the XP inputs (`gm_inputs`, so XP and the league) and every client total (the store's `listSessions()` hides the duplicate copy; import and export ask for `includeDuplicates`) use it. The Friends screen re-syncs joined groups when it opens, so totals follow an edit or deletion without a button.

## 5. Migrations and deployments needed (all need your approval; none done)

Order on any project: `community.up.sql` (current, includes patches 1 to 3 logic), `community.storage.sql`, `social.up.sql` (now includes `social.patch2_eligible_workouts.sql`), `health_sync.up.sql`, `gamification.up.sql`, `account_deletion_purge.up.sql`. Staging already has community patch 2 and the earlier social migrations: it additionally needs `community.patch3_safety_phrases.sql` (one function) and `social.patch2_eligible_workouts.sql` (adds `app.eligible_workouts`, replaces `social_sync_group` and `social_view_friend`). Redeploy Edge Functions `community` (safety phrases), `social` (gm routes) and `account` (scheduled maintenance now also runs due account deletions). Rollbacks: `gamification.down.sql`, `health_sync.down.sql`, patch 2 re-run for patch 3. Schedule the existing `account/maintenance/reap` call (with its key) to actually delete accounts.

## 6. Account deletion execution (release blocker, code part done)

`purge_due_account_deletions` already existed (tested). The `account` function's scheduled `maintenance/reap` call now also calls it and returns only a count; a project without the function reports `purged: null` instead of failing. Code and a test exist; it takes effect only after the migration, the redeploy and a schedule. Hosted proof still needs a staging run.

## 7. Community safety consistency

The Community server and database text screens now reject the same self-harm phrases as the coach ("I don't want to be here anymore", "no reason to live", "better off without me", "end it all", and so on; typographic apostrophes are read as plain ones). One shared case list (`supabase/tests/community-cases.json`) drives both the TypeScript and SQL tests. The hosted effect needs `community.patch3_safety_phrases.sql` and a `community` redeploy.

## 8. Native-only (cannot be verified on Linux)

HealthKit itself (the permission sheet, reading real workouts, the nitro native module compiling in an EAS build, the entitlement being accepted for the App ID), haptic feel for level-ups and quests, animation smoothness and reduced-motion behaviour on a phone, VoiceOver reading of the new cards, Dynamic Type at the largest sizes, and the companion's accessories on a device. Verified here instead: engine and server behaviour, the browser journey with a simulated provider, the iOS JavaScript bundle compiles, and `expo prebuild` generates the expected iOS project settings.

## 9. Experience layer (added with the product upgrade)

One progression store feeds every screen (`apps/mobile/src/gamification/GamificationHost.tsx`, mounted once in the root layout, writes `progressionStore.ts`; screens read `useProgression()`). Rewards are diffed from a CONFIRMED answer only (`rewards.ts`: baseline silently on a new phone, milestones once, quiet decreases), requested without flooding (`coalescedSync.ts`), and celebrated through one policy (`policy.ts`: Pulse celebrations Off/Gentle/Full plus Reduce Motion). Presentation: `ui.tsx` (cards, banner, quests, week strip, badge collection, season, wardrobe, league, group goal bar), `art.tsx` (animated bar, pop, level medallion, badge art), Pulse flourishes and accessories in `src/pulse/PulseFigure.tsx`. Per-account device settings: `prefs.ts` (target, rest days, accessories taken off) and the "already shown" ledger. Nothing here adds a server field or a migration; the server contract in sections 3 to 6 is unchanged. Details and evidence: `docs/GAMIFICATION_PRODUCT_REVIEW.md` part A.
