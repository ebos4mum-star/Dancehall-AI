# Consolidated native iPhone and Simulator test plan (one round)

Status: **prepared, NOT RUN.** This environment is Linux: no Xcode, no Simulator, no iPhone. Nothing here starts a build, uploads to EAS or TestFlight, changes Apple signing, or touches hosted Supabase. It supersedes nothing: it consolidates `NATIVE_IOS_TEST.md` (account, lock, Friends), `GATE_6C_IPHONE_CHECKLIST.md`, `FRIENDS_IPHONE_TEST.md` and `UX_UPGRADE.md` section 9 into one pass.

Everything below that says "browser verified" means headless Chromium proved the rule reaches the page (HTML attributes, state, text). It does **not** prove native keyboard behaviour, haptics, HealthKit, gesture feel, VoiceOver or performance. Those are only proven by the checks in this document.

## 1. What the Mac needs

Figures marked (estimate) are planning numbers; confirm on the Mac with the commands shown. Exact Xcode and runtime versions must be taken from Expo's SDK 58 release notes at install time: they cannot be verified from this environment.

| Need                                   | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free disk                              | Plan for **at least 80 GB free** (60 GB is a hard minimum) (estimate). Rough parts: Xcode and components 30 to 40 GB; each iOS Simulator runtime about 6 to 10 GB; build caches (DerivedData, Pods) 5 to 15 GB; `node_modules` plus the pnpm store 3 to 5 GB. Check with `df -h /` and `xcrun simctl runtime list`.                                                                                                                                         |
| Xcode                                  | A release that supports Expo SDK 58 / React Native 0.88 (confirm in the SDK 58 notes). Open it once to accept the licence. `xcode-select -p` must print its path.                                                                                                                                                                                                                                                                                           |
| Components                             | Command Line Tools; the iOS platform and **iOS Simulator runtime** (the newest, and optionally the oldest your deployment target supports; `app.json` sets no explicit iOS deployment target, so Expo SDK 58's default applies, check it in the generated project); CocoaPods (installed by the Expo build, or `sudo gem install cocoapods`).                                                                                                               |
| Tooling                                | Node **>= 22.12** (the repository's `engines`), `corepack enable` then pnpm **10.28.0** (the `packageManager` pin), Watchman optional.                                                                                                                                                                                                                                                                                                                      |
| Simulators                             | One iPhone for the main run; a **second** iPhone simulator for the two-account Friends and Group Goals checks. Do not erase or reset any simulator.                                                                                                                                                                                                                                                                                                         |
| Physical iPhone (strongly recommended) | Needed for haptics, the camera and barcode scan, real Face ID, Apple Watch workouts, and real performance. Needs your own signing set up in Xcode (this plan does not touch it).                                                                                                                                                                                                                                                                            |
| Native modules in the app              | `@kingstinct/react-native-healthkit 16.2.0` with `react-native-nitro-modules 0.37.2` (HealthKit; compiles only in a dev-client or `run:ios` build, never Expo Go), `expo-haptics`, `expo-camera`, `expo-local-authentication` (Face ID), `expo-secure-store` (Keychain), `expo-image-picker`, `expo-video`, `expo-screen-capture`, `react-native-svg`, `react-native-screens`, `react-native-safe-area-context`. New Architecture is enabled in `app.json`. |
| Accounts                               | An Apple ID signed in to Xcode (free is enough for Simulator; a device needs your own provisioning). No App Store Connect, no TestFlight.                                                                                                                                                                                                                                                                                                                   |

### Staging configuration (local run only)

```bash
cd Dancehall-AI && git fetch origin && git checkout claude/ecstatic-meitner-8you9v && git pull --ff-only
pnpm install
cp scripts/friends-staging.env.example .friends-staging.env     # git-ignored; paste the STAGING publishable key only (sb_publishable_...), never a secret key
bash scripts/friends-staging-ios.sh --community --health         # iOS Simulator (add --device for a connected iPhone)
```

The launcher refuses any project except staging (`bxhnrjulksganzydgrgm`), refuses secret keys, sets `EXPO_PUBLIC_APP_ENV=preview`, builds locally with `expo run:ios`, and uploads nothing. **New in this round:** `--health` (sets `EXPO_PUBLIC_APPLE_HEALTH=1`, which makes `app.config.js` add the HealthKit module with read-only workouts and no write or background access); before this flag the launcher produced a build with no Apple Health at all. `--community` sets `EXPO_PUBLIC_COMMUNITY=1`. Both flags are off by default and are covered by `scripts/friends-staging-ios.test.mjs`.

**Server state on staging (from `STAGING_STATUS.md` and `GAMIFICATION_ARCHITECTURE.md`):** accounts, Friends and Community (Read only mode) are present. **Not applied and not deployed on staging:** `gamification.up.sql` and `health_sync.up.sql`, `social.patch2_eligible_workouts.sql`, `community.patch3_safety_phrases.sql`, and the matching redeploys of `social`, `community` and `account`. Consequence for this round: progression runs from the **on-device engine** (the same engine and records; fully testable), but these are **server-side items that cannot be tested until you approve staging changes**: the friends league (needs the `gm` routes), the server-side one-workout-counts-once rule for Group Goals totals, the newer Community safety phrases, and the XP total coming from the server. The on-device XP history and badge timeline in this round do not need any of them.

## 2. Simulator versus physical iPhone

| Area                                                                                                  | Simulator                                                                                                                 | Physical iPhone                                       |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Screens, navigation, safe areas, keyboard types and Return keys, scroll-to-field, interactive dismiss | yes (turn **I/O > Keyboard > Connect Hardware Keyboard** off to see the software keyboard)                                | final confirmation                                    |
| Dynamic Type, Reduce Motion, Dark/Light                                                               | yes (Settings, Accessibility; or Xcode's Environment Overrides)                                                           | yes                                                   |
| VoiceOver                                                                                             | partial (use the Accessibility Inspector audit plus Simulator VoiceOver)                                                  | **required** for reading order and gestures           |
| Haptics                                                                                               | **no** (no Taptic Engine)                                                                                                 | **required**                                          |
| Camera, barcode, photo capture                                                                        | **no** (use the photo library picker only)                                                                                | **required**                                          |
| Face ID                                                                                               | yes (**Features > Face ID**, Enrolled, Matching/Non-matching)                                                             | final confirmation                                    |
| Apple Health permission sheet and import                                                              | partial: workouts must be added by hand in the Simulator's Health app, so the flow is testable but real Watch data is not | **required** for real workouts and the denial wording |
| Performance (scene parallax, chart scrub, scrolling)                                                  | **not representative**                                                                                                    | **required**, ideally an older model                  |
| Two-account Friends                                                                                   | yes (two simulators)                                                                                                      | optional                                              |

## 3. Test plan

Each item: ☐ pass / ☐ fail + note. **S** = Simulator is enough, **D** = physical iPhone needed. Start every area with a fresh app launch.

### A. Every screen opens and behaves (S)

For each route: opens without a crash or blank screen, safe areas respected, the scene or header is present, content scrolls, Back works, no text clipped at default size.

- Tabs: Today (`/`), Dance (`/(tabs)/dance`), Food, Coach, Me.
- Onboarding (`/onboarding`, steps 1 to 5), `/sign-in`, `/account/start`, `/account/pin`, `/account/questions`, `/account/recovery-key`, `/account/recover`, `/account/rotate`.
- Dance: `/dance/[id]` (a workout), `/dance/session` (guided), `/dance/history`, `/dance/program`, `/dance/schedule`.
- Food: `/food/add`, `/food/camera`, `/food/barcode`, `/food/fridge`, `/food/history`, `/food/household`, `/food/plan`, `/food/review`, `/food/saved`, `/food/swap`.
- Coach: `/coach/review`, `/coach/settings`.
- Other: `/progress`, `/goals`, `/challenges`, `/privacy`, `/friends`, `/community`, and an unknown URL (`+not-found`).

### B. Keyboard and input behaviour (S, then D)

Use the browser matrix in `UX_UPGRADE.md` section 5 as the expected values. On the device or Simulator, for each field: the keyboard type is right, the Return key label matches (Next, Done, Search, Send), capitalisation and autocorrect match (names capitalise words; usernames, codes, search and numbers never autocorrect), Next moves to the next field, the last field closes the keyboard, the focused field is never hidden behind the keyboard, dragging the list down dismisses it, and a hardware keyboard Return behaves the same.

- Onboarding: name, date of birth (no capitalisation or autocorrect), country search, height, weight.
- Coach composer: grows to about 120 px, Return **sends** (iOS uses `submitBehavior`), Send button works, long text scrolls inside the box.
- Friends: claim and add username (Send); Household: name and join code (Return runs create/join); Food: search (Search key), fridge item (Done); Goals numeric fields; Progress "hours slept".
- Record: anything odd, especially a field that autocorrects when it should not.

### C. Storybook artwork and animation (S for look, D for smoothness)

- All nine worlds look right and text over art stays readable: Today, Dance, Food, Coach (study nook), Me, Friends (200 px), Progress, Community (200 px), Onboarding (five chapters with emblem and lantern).
- Onboarding step change turns like a page; Back reverses without a glitch.
- Parallax sparkles, ridges and fog: no flicker at the scene edges; frame rate smooth while scrolling a long Progress screen (**D**; ideally also an older iPhone).
- Reduce Motion on: no bar growth, no parallax, no sway; the thinking pose is still.

### D. Pulse interactions (S, D for feel)

- Tap Pulse on Today: waves; rapid tapping stops reacting after a few taps (about 4 per 20 s) and never stacks.
- Planned rest day with nothing recorded: one calm reaction, no pressure text.
- Coach: while a reply loads Pulse shows the thinking pose (raised hand, lifted brow, dots); returns to rest when the reply arrives; **celebrations Off** keeps Pulse at rest; Reduce Motion shows the still pose with three dots.
- Idle blink occurs rarely and never with Reduce Motion.
- Celebrations Off/Gentle/Full change reactions, toasts and haptics as described in Settings.

### E. Haptics (D only)

- Chart scrub ticks while dragging; Pulse tap tick; quest/success pattern; milestone two-beat; error pattern.
- **Off:** none anywhere. **Gentle:** only select, success, error. **Full:** all. Note any haptic that fires when it should not.

### F. Charts and gestures (S for correctness, D for feel)

- Home and Dance: 7-day bars. Progress: weeks/months bars, 5-week calendar, calories/protein line (gaps for unlogged days, hidden when numbers are hidden), **XP over time** (Running total / Each day, 60 days, Show values, Previous/Next), **Milestones**.
- Drag across a chart: reads each point; vertical page scroll still works from the chart (**D**: the key risk is a drag that fights scrolling).
- Every chart: Show values list, readout under the chart, no clipping with 60 bars.

### G. VoiceOver and Dynamic Type (D required)

- VoiceOver: each chart announces its description; each bar, calendar day and badge row is reachable and reads day plus value or date plus basis; "Say hi to Pulse" is a button; scenes are skipped; onboarding progress reads "Step n of 5"; Milestones rows read name plus "Earned/Recorded/Earlier" sentence; focus order is top to bottom everywhere.
- Dynamic Type at the largest accessibility size on Today, Onboarding, Coach (hero and composer), Friends/Community banners, Progress cards, Milestones: no clipped or overlapping text, buttons stay tappable (44 pt).
- Run the Accessibility Inspector audit on Today, Progress, Coach, Onboarding step 1.

### H. Gamification (S)

- Quests, XP count-up, level-up, badge, streak milestone, season, wardrobe equip/take off, rest-day behaviour, celebrations settings.
- **XP history (young account):** a new account with a few days of records shows "History starts on ...", no padded zeros, a line that never goes down, "Each day" equals what you earned, and a note that weekly quest XP is shown on the last day of its week.
- **Milestones:** with a new account, badges earned during the test show **Earned <date>** only when your records cover your whole history; a badge that appears while you use the app but cannot be replayed shows **Recorded <date>**; a badge that was already present on first launch shows no date. The first launch day must never appear as an "Earned" date.
- Long-history (more than 60 days) and delayed-sync states are verified in the browser with seeded data and unit tests; they cannot be produced quickly on a fresh phone and are not part of this round unless you have an old account.
- Airplane mode: progression still shows from on-device records; the XP card does not show a server total that is behind without saying so.

### I. Apple Health (S partial, D for real data)

Build with `--health`. Production builds refuse the flag.

- Nothing is asked until the Settings switch is turned on; then the system permission sheet appears (read access to workouts only; no write access requested).
- Simulator: add a workout in the Health app, run the import: it appears once as "Apple Health: <type>", counts once toward XP and Group Goals totals, and importing again adds nothing; a workout overlapping an in-app session counts once.
- Denied or no data: the screen explains that iOS does not say whether access was granted.
- **D:** a real Apple Watch workout imports; calories, heart rate and routes are never read.

### J. Friends, Community and Group Goals (S with two simulators)

- Friends (staging): create two accounts, claim names, request/accept, share a weekly summary, revoke, block; nothing food or weight related is ever shown.
- Group Goals: create a goal, both join, add workouts; totals follow edits and deletions; **the server-side duplicate-workout rule needs `social.patch2` on staging (not applied); test the client-side totals only and record that the server rule is pending.**
- League: needs the `gm` routes (not on staging): expect it to be unavailable; confirm it fails gracefully with no crash.
- Community: Read only mode: browse, report, block work; posting is refused with a clear message; guidelines; sample-post labelling; photos need `text_only` or `open`, which needs your separate approval.

### K. Account and privacy flows (S, Face ID D)

Follow `NATIVE_IOS_TEST.md` section 2 and `GATE_6C_IPHONE_CHECKLIST.md`: create account with no email, two security questions, PIN twice, Recovery Key shown once, lock on relaunch, wrong PIN refusal and lockout, Face ID, restart persistence (Keychain), airplane mode, sign out and back in, recovery with the 24-hour wait, rotation, consent toggles, data export (system share sheet), account deletion request, privacy screen.

### L. Offline and delayed sync (S)

Airplane mode during: logging a meal, completing a workout, opening Progress; then back online. Records appear, XP and the XP chart update to the same totals, and no duplicate XP appears.

## 4. Evidence to bring back

For each failure: area, device or Simulator model and iOS version, steps, screenshot or screen recording, and for keyboard items the field name. Send the pass/fail list and any Xcode build warning about HealthKit or nitro modules.

## 5. Readiness

See `UX_UPGRADE.md` "Round 4: analytics and readiness" for the verdict and the list of genuine remaining blockers.
