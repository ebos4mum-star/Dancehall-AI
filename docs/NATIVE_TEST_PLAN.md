# Consolidated native iPhone testing plan (one round)

Status: **prepared, NOT RUN.** This environment is Linux with no Xcode, Simulator or iPhone. Nothing here starts a build, uploads to EAS or TestFlight, changes Apple signing, or touches a hosted project. It consolidates `NATIVE_IOS_TEST.md`, `GATE_6C_IPHONE_CHECKLIST.md`, `FRIENDS_IPHONE_TEST.md` and `UX_UPGRADE.md`. Staging work it depends on is in `STAGING_DEPLOYMENT_CHECKLIST.md`.

"Browser verified" elsewhere in the docs means headless Chromium proved a rule reaches the page (attributes, state, text). It does **not** prove native keyboards, haptics, HealthKit, gesture feel, VoiceOver or performance. Those are proven only by this plan.

The round has three parts, run in this order: **Part 2 Simulator** (client-side, needs no staging change), **Part 3 physical iPhone** (things a Simulator cannot show), **Part 4 staging integration** (only after you authorize the staging deployment; until then those items run in the app's on-device fallback and the server-only ones are deferred).

## Part 0. Minimum Mac requirements

Figures marked (estimate) are planning numbers; confirm with the commands shown. Expo's SDK 58 minimums were reported by a web search of Expo's SDK 58 reference (`docs.expo.dev/versions/v58.0.0`); **this environment could not open that page, so confirm the values there before installing.**

| Need                  | Minimum                                                                                                                                                                                                                                                                                                                                                                                                | Recommended / notes                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free disk             | **60 GB** (hard minimum) (estimate)                                                                                                                                                                                                                                                                                                                                                                    | **80 to 100 GB**: Xcode and components 30 to 40 GB; each Simulator runtime about 6 to 10 GB; DerivedData and Pods 5 to 15 GB; `node_modules` plus the pnpm store 3 to 5 GB. Check `df -h /` and `xcrun simctl runtime list`.                                                                             |
| Xcode                 | **26.4 or newer** (Expo SDK 58 table, as reported)                                                                                                                                                                                                                                                                                                                                                     | Open once to accept the licence; `xcode-select -p` must print its path. The macOS version Xcode 26.4 requires is set by Apple's Xcode release notes (not verifiable here). Apple's App Store floor (Xcode 26, iOS 26 SDK from April 2026) matters only for store builds, which this round does not make. |
| iOS deployment target | **iOS 16.4** (Expo SDK 58 table, as reported); `app.json` sets no explicit target                                                                                                                                                                                                                                                                                                                      | Test on the newest Simulator runtime and, if you can, the oldest you want to support.                                                                                                                                                                                                                    |
| Components            | Command Line Tools; the iOS platform and **iOS Simulator runtime**; CocoaPods (installed by the Expo build or `sudo gem install cocoapods`)                                                                                                                                                                                                                                                            | Do not erase or reset any simulator.                                                                                                                                                                                                                                                                     |
| Node and pnpm         | **Node 22.13 or newer** (Expo SDK 58 table; the repository's `engines` says 22.12, so use 22.13+); `corepack enable`; pnpm **10.28.0**                                                                                                                                                                                                                                                                 | Watchman optional.                                                                                                                                                                                                                                                                                       |
| Simulators            | one iPhone                                                                                                                                                                                                                                                                                                                                                                                             | a second iPhone Simulator for two-account Friends and Group Goals                                                                                                                                                                                                                                        |
| Physical iPhone       | needed for Part 3                                                                                                                                                                                                                                                                                                                                                                                      | your own signing in Xcode; this plan never touches it                                                                                                                                                                                                                                                    |
| Native modules        | `@kingstinct/react-native-healthkit 16.2.0` with `react-native-nitro-modules 0.37.2` (HealthKit; only in a `run:ios` or dev-client build, never Expo Go), `expo-haptics`, `expo-camera`, `expo-local-authentication`, `expo-secure-store`, `expo-image-picker`, `expo-video`, `expo-screen-capture`, `react-native-svg`, `react-native-screens`, `react-native-safe-area-context`; New Architecture on | first build is slow (CocoaPods and native compile): allow time and disk. A third-party article mentions an iOS 27 scene-lifecycle change for SDK 58; watch the first launch for lifecycle warnings (unverified).                                                                                         |
| Accounts              | Apple ID signed in to Xcode (free is enough for the Simulator)                                                                                                                                                                                                                                                                                                                                         | no App Store Connect, no TestFlight, no EAS                                                                                                                                                                                                                                                              |

## Part 1. Setup (commands for your Mac; none have been run)

```bash
xcode-select -p && xcrun simctl list devices available && node -v && corepack enable && pnpm -v
git clone https://github.com/ebos4mum-star/Dancehall-AI.git && cd Dancehall-AI
git fetch origin && git checkout claude/ecstatic-meitner-8you9v && git pull --ff-only && git status -sb      # clean, on that branch
pnpm install
cp scripts/friends-staging.env.example .friends-staging.env     # git-ignored; paste the STAGING publishable key only (sb_publishable_...), never a secret key
bash scripts/friends-staging-ios.sh --community --health         # iOS Simulator; add --device for a connected iPhone
```

The launcher refuses any project except staging, secret keys and http URLs, sets the preview environment, builds locally and uploads nothing. `--community` turns Community on and `--health` turns the Apple Health module and import on, for this run only (before `--health` existed, a launcher build had no Apple Health). After the build, confirm the Health setup described in `STAGING_DEPLOYMENT_CHECKLIST.md` section 10 (entitlement `com.apple.developer.healthkit` only; usage text present; no write usage text; no background mode).

Watch items to record from the very first launch: build warnings about HealthKit or nitro modules, scene-lifecycle warnings, and how long the app takes to become interactive.

## Part 2. Simulator tests (S)

Each item: ☐ pass / ☐ fail + note. Use the newest runtime; repeat the starred items on the oldest.

**2.1 Every screen opens and behaves** (safe areas, scene or header present, scrolls, Back works, nothing clipped at default size, no crash or blank)

- Tabs: Today, Dance, Food, Coach, Me.
- Onboarding steps 1 to 5; `/sign-in`; `/account/start`, `/pin`, `/questions`, `/recovery-key`, `/recover`, `/rotate`.
- Dance: a workout detail, guided session, history, program, schedule.
- Food: add, camera (permission prompt only), barcode (permission prompt only), fridge, history, household, plan, review, saved, swap.
- Coach: chat, review, settings.
- Other: Progress, Goals, Challenges, Privacy, Friends, Community, and an unknown URL.

**2.2 Keyboard and input** (turn off I/O > Keyboard > Connect Hardware Keyboard to see the software keyboard; expected values are in the matrix in `UX_UPGRADE.md` section 5). For every field: correct keyboard type; Return key label (Next, Done, Search, Send); capitalisation and autocorrect right (names capitalise words; usernames, codes, search, numbers and the date of birth never autocorrect); Next moves on; the last field closes the keyboard; the focused field is never hidden; dragging the list down dismisses it; a hardware keyboard behaves the same.

- Onboarding: name, date of birth, country search, height, weight.
- Coach composer: grows to about 120 px, **Return sends** (iOS `submitBehavior`), the Send button works, long text scrolls inside the box.
- Friends username claim and add (Send); Household name and join code (Return runs create or join); Food search (Search), fridge item (Done); Goals numbers; Progress hours slept.

**2.3 Storybook art and animation**

- All nine worlds read well and text over art stays readable: Today, Dance, Food, Coach, Me, Friends, Progress, Community, Onboarding (five chapters with emblem and lantern).
- The onboarding step change turns like a page; Back reverses cleanly.
- Reduce Motion on: no bar growth, no parallax or sway; the thinking pose is still.
- Smoothness is judged on a device (Part 3), not here.

**2.4 Pulse**

- Tap Pulse on Today: waves; rapid taps stop reacting after about 4 in 20 s.
- Planned rest day with nothing recorded: one calm reaction, no pressure text.
- Coach: while a reply loads Pulse shows the thinking pose and returns to rest after; celebrations **Off** keeps Pulse at rest; Reduce Motion shows the still pose with three dots.
- Idle blink is rare and never under Reduce Motion. Celebrations Off, Gentle and Full change reactions and toasts as Settings says.

**2.5 Charts and gestures** (correctness here; feel in Part 3)

- Home and Dance 7-day bars; Progress weeks and months, 5-week calendar, calories and protein line (gaps for unlogged days; hidden when numbers are hidden), **XP over time** (Running total and Each day, 60 days), **Milestones**.
- Drag across a chart reads each point; Show values, Previous and Next work; a 60-bar chart fits the card; no clipping.
- **XP history (new account):** shows "History starts on ...", a line that never goes down, "Each day" matches what you earned, a note that weekly quest XP is shown on the last day of its week and that badge bonuses are not placed on a day.
- **Milestones (new account):**
  - **Earned <date>** appears only when no setting could change the date.
  - **Estimated <date>** appears with a range and the name of the setting it depends on (rest days or weekly goal) when it could differ.
  - **Recorded <date>** appears for a badge that showed up while you used the app but cannot be proven.
  - A badge already present on first launch shows no date. **The first-launch day must never appear as a date.**
  - Change your planned rest days or weekly goal in Settings and open Progress again: an Earned date must not move; an Estimated one may.

**2.6 Gamification (on-device engine)**
Quests, XP count-up, level-up, badge, streak milestone, season, wardrobe equip and take off, rest-day behaviour, the celebrations settings. Before the staging deployment the totals come from the on-device engine; that is expected.

**2.7 Apple Health (Simulator, partial)** with a `--health` build

- Nothing is asked until the Settings switch is on; then the permission sheet appears (read access to workouts only; no write access).
- Add a workout by hand in the Simulator's Health app, then import: it appears once as "Apple Health: <type>", counts once toward XP, and importing again adds nothing; one that overlaps an in-app session counts once.
- Denied or no data: the screen explains that iOS does not say whether access was granted.

**2.8 Account and privacy** (the staging `account` function is already deployed, so this works today)
Create an account with no email, two security questions, PIN twice, Recovery Key shown once; relaunch shows the PIN lock; a wrong PIN is refused and repeated wrong PINs lock out; Face ID via **Features > Face ID** (Enrolled, Matching, Non-matching); sign out and in; recovery with the 24-hour wait; rotation; consent toggles; data export (share sheet); account deletion request; privacy screen. Follow `NATIVE_IOS_TEST.md` section 2 and `GATE_6C_IPHONE_CHECKLIST.md`.

**2.9 Offline and delayed sync**
Airplane mode while logging a meal, completing a workout and opening Progress; then back online. Records appear, the XP chart and total agree, no duplicate XP. While offline or syncing the XP card says so rather than showing a server total that is behind.

**2.10 Accessibility audit (Simulator part)** Accessibility Inspector audit on Today, Progress, Coach, Onboarding step 1; Dynamic Type through the Simulator's Environment Overrides, largest accessibility size on Today, Onboarding, Coach, Friends and Community, Progress and Milestones: no clipped or overlapping text, 44 pt targets.

## Part 3. Physical iPhone tests (D)

Only a physical iPhone can show these. Use your own signing in Xcode; build with `bash scripts/friends-staging-ios.sh --device --community --health`.

- **Haptics:** chart scrub ticks; Pulse tap tick; quest and success pattern; milestone two-beat; error pattern. **Off:** none anywhere. **Gentle:** only select, success, error. **Full:** all. Note any haptic that fires when it should not.
- **Camera, barcode and photos:** the camera permission flow, barcode scan, photo capture and picker; denial paths. (The Simulator has no camera.)
- **Face ID:** real enrolment, success, cancel falls back to the PIN, after a restart still signed in (Keychain).
- **Apple Health with real data:** a real Apple Watch workout imports once; calories, heart rate and routes are never read; denial wording; the Health permission sheet.
- **VoiceOver (required):** each chart announces its description; each bar, calendar day, and milestone row is reachable and reads day plus value or date plus basis (Earned, Estimated, Recorded, Earlier); "Say hi to Pulse" is a button; scenes are skipped; onboarding progress reads "Step n of 5"; focus order top to bottom everywhere; the Coach composer and Send are operable.
- **Dynamic Type at the largest accessibility size, on the device,** across the same screens as 2.10.
- **Performance and feel:**
  - Scene parallax, ridges and fog: no flicker; smooth while scrolling a long Progress screen (ideally also on an older iPhone).
  - **Chart drag versus vertical scroll:** a drag across a chart must not fight page scrolling.
  - **Progression recompute (watch item below):** with a few weeks of records, tapping through Today, Dance and Progress must not stall; note any pause after logging a workout or habit.
  - Thermal state and battery after ten minutes of use.
- **Reduce Motion, Dark mode, Increase Contrast** on the device.
- **Share sheet** for data export; **airplane mode** end to end.

### Watch item found while preparing this round: progression recompute cost

On a fast Linux desktop, one full progression computation (`computeGamification`) takes about **260 ms** for a 60-day history with a workout every day, almost all of it in the 60-day quest replay. The cause is in the shared code: `localDateKey` builds a new `Intl.DateTimeFormat` on every call and the engine calls it per session for each of about 100 replayed days. The app recomputes whenever records change (`GamificationHost`), so a heavy user on an older iPhone could feel a pause after logging something. **This is unmeasured on a device and may be fine.** If Part 3 shows a stall, a result-identical fix (reuse one formatter per time zone) exists and **was measured here: 243 ms down to 28 ms (about 8.5 times faster) with a byte-identical result** (applied in the tests only, to keep the engine cross-checks fast). Applying it for real touches the shared engine files that are copied into the Edge Functions (`pnpm check:edge`), so it needs your approval and a staging redeploy; I have not made it. The badge and XP history screens added this round do **not** replay the engine (the badge analysis takes about 15 to 40 ms for the same history).

## Part 4. Staging integration tests (needs the authorizations in `STAGING_DEPLOYMENT_CHECKLIST.md` section 0)

Until A1 and A2 are done, staging has no gamification server and the old `social` function: progression runs on the phone and the league is unavailable. Test these after the deployment (and record the "before" behaviour first):

| Area                                                                                                                                                   | Before the deployment (expected)                                             | After the deployment (expected)                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Progression total                                                                                                                                      | computed on the phone; badge timeline and XP chart work                      | same screens; the total now comes from the server (`fromServer`); the XP card still agrees (or says it is syncing)                                                       |
| Friends league                                                                                                                                         | unavailable; the card fails gracefully                                       | opt in on two accounts that are friends: each sees a username and one number, never health, food or weight                                                               |
| Group Goals totals                                                                                                                                     | client-side totals only                                                      | an Apple Health copy of an in-app workout counts once, in either import order; editing or deleting a workout moves the total; separate workouts the same day never merge |
| Friends basics                                                                                                                                         | works (request, accept, sharing, block, revoke)                              | unchanged                                                                                                                                                                |
| Community (Read only)                                                                                                                                  | browse, report, block; posting refused with a clear message                  | a post containing a self-harm phrase is refused with the safe message; everything else unchanged                                                                         |
| Account deletion                                                                                                                                       | the request and waiting period work                                          | the maintenance call returns `purged` as a number; a due deletion removes the account and its ledger rows                                                                |
| Apple Health                                                                                                                                           | works against the on-device engine                                           | imported workouts are stored once (unique per source id) and count once in XP and group totals                                                                           |
| Isolation                                                                                                                                              | Community stays Read only; no production or development project is contacted | same                                                                                                                                                                     |
| Run `scripts/staging/gm-boundary-checks.mjs before` and `after` as described in the checklist, and the Friends and Community smoke tests listed there. |

## Part 5. Evidence to bring back

For each failure: area, device or Simulator model and iOS version, steps, a screenshot or screen recording, and for keyboard items the field name. Send the pass/fail list, the first-launch watch items, and any performance observation from Part 3. Your pass/fail record then becomes the "native verified" evidence; until then every Part 2 to 4 item is **not verified**.

## Part 6. Who needs to do or authorize what

| Before                             | You provide or authorize                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulator round (Parts 1 and 2)    | a Mac meeting Part 0; the staging publishable key in your local `.friends-staging.env`. **No staging change is needed.**                                                           |
| Physical iPhone round (Part 3)     | an iPhone and your own Xcode signing. No EAS or TestFlight build.                                                                                                                  |
| Staging integration round (Part 4) | authorizations A1 and A2 (and A3 or A4 only if Claude runs HTTP checks or creates synthetic accounts); A5 before any shared build; see `STAGING_DEPLOYMENT_CHECKLIST.md` section 0 |
