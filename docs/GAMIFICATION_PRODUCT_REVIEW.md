# Gamification product acceptance review

Review and documentation only. No product code, UI, migration or deployment was changed for this review. The only additions are this file, the screenshots in `docs/review-shots/`, and the capture script `apps/mobile/e2e/review-capture.cjs` that produced them (re-run with `pnpm export:web && node e2e/review-capture.cjs` from `apps/mobile`).

## 0. Verdict

**Today this is a fitness app with a progression layer, not yet a Duolingo-style fitness game.** The rules and the safety design are real and well tested, and Pulse is a genuinely animated, original character. But the _feeling_ of a game is mostly missing: progression is shown as plain cards and text lines, almost nothing animates when you earn something, the one celebration that exists is a level-up toast, workout completion shows no reward at all, badges and leagues have no artwork and no reveal moments, Pulse does not react to quests, streaks or badges, and there is no equip, evolution, league promotion or group-goal reward. Most of the logic is strong (levels, streaks with rest days, quests, badges, seasons, leagues, Apple Health duplicate handling); most of the _presentation_ is basic.

Two behaviour problems found by actually using the screens (section 5) matter before owner acceptance: the Home progress card does not update after you act (up to and beyond a minute, verified), and the new level-up toast and haptics ignore the person's "Pulse celebrations: Off / Gentle" setting.

## 1. How this was checked, and what each kind of evidence means

| Label                  | Meaning                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI**                 | Real taps and typing in the running web export (`apps/mobile/dist`, mock mode, 390 x 844, Chromium). Synthetic data. Not a phone.                                                                                                                                                                       |
| **Seeded**             | The same real screens, opened on persisted dev-store data with a 75-day history (generated with the dev store, then placed in the browser's storage). The history behind the screen is seeded; the screen and its logic are real. Needed because a level-11 history cannot be earned in a test session. |
| **Simulated provider** | The development Apple Health provider (`apps/mobile/src/health/provider.ts`). Real HealthKit has never run.                                                                                                                                                                                             |
| **Code only**          | Read from source. Never counted as tested.                                                                                                                                                                                                                                                              |
| **Unit / integration** | Automated tests (already reported elsewhere); named where used.                                                                                                                                                                                                                                         |

Everything below that says "screenshot" is a capture of the running app. No mock-ups or generated artwork were used. Where something could not be rendered it is marked **unverified**. File names: `ui-*` are UI captures, `seed-*` are seeded; `results.json` holds the raw observations.

## 2. Screen by screen: what a person actually sees

### Home (`apps/mobile/app/(tabs)/index.tsx`, `src/gamification/ui.tsx` `ProgressionCard`)

- **XP and level:** a white card titled "Your progress" below the hero and "Your day" cards: "Level 1", "0 XP" (the XP number counts up with `useCountUp`), a thin progress bar, "100 XP to level 2". The bar is a static width: it does not animate. ([new user](review-shots/ui-02-home-new-user-progress-card.png), [veteran](review-shots/seed-04-home-progress-card-veteran.png))
- **Streak:** one line of text ("74-day streak", or "Move for 10 minutes or tick a habit to start a streak."), then "Today is still open. 0 of 3 active days this week" or "Planned rest day. Your streak is safe." No flame, icon, counter treatment or animation.
- **Daily quests:** three rows, an empty or ticked circle, the quest name and "0 of 10". ([before](review-shots/ui-04-home-quests-before.png))
- **Pulse:** in the hero card at the top (the existing signature companion). It is not in the progression card.
- **What to do next:** the quest list, plus the existing "Your Daily Fit Plan" card below. Nothing says what the next reward is or how close it is beyond "100 XP to level 2".
- **After completing a quest:** the circle should change to a tick and a small success haptic fires (native only). There is no animation, no XP pop-up, no reward reveal, no Pulse reaction. **Verified problem:** after ticking a habit the card did not change at all ([just after](review-shots/ui-05-home-quests-after-habit-tick.png), [62 s later, no other action](review-shots/ui-05b-home-62s-after-habit-tick-no-other-action.png)); see defect R1. (A _different_, older feature did react: Pulse showed "Every habit ticked today. That is a good day." That is the pre-existing goal celebration, not XP.)

### Workouts

- **Completion** ([screen](review-shots/ui-07-workout-completion-screen.png)): "Session ended", time moving, movements finished, a "How did it feel?" choice and Save. **No XP, no streak, no quest progress, no level-up, no achievement appears anywhere on this screen** (`app/dance/session.tsx` does not use progression at all). XP only shows later, on Home, if the card refreshes.
- **Weekly card** on the Workouts tab: "This week", a bar, "1 of 3 active days this week" and the two weekly quests. ([screenshot](review-shots/ui-16-workouts-weekly-card.png), [veteran](review-shots/seed-09-workouts-weekly-card-veteran.png))
- **Level-up celebration:** only on Home (a toast). Not when a workout finishes.
- **Workout achievements:** the older "milestones" system (`src/progress/achievements.ts`) and the new badges are two separate lists on Progress; neither is announced on completion.
- **Apple Health:** imported workouts add XP, quests and streak days exactly like in-app ones, with duplicates removed, but nothing tells the person "you earned XP from your watch workout" and there is no notification. ([import result](review-shots/ui-11-settings-health-imported.png), [Home after](review-shots/ui-12-home-after-health-import.png))

### Nutrition

- **What earns XP:** logging any meal, a flat 5 XP once a day (`GM.MEAL_LOG_XP`), identical whatever the meal contains. Nothing about calories, amounts, macros or weight is read by the engine (input shape and tests: `packages/shared/src/gamification.ts`, `gamification.test.ts`).
- **Quest:** when "Log a meal" is one of today's three quests it shows as a plain card under the Food hero ([screenshot](review-shots/ui-17-nutrition-tab.png)). That is the only nutrition reward UI; no nutrition badges exist.
- **Preventing calorie-restriction incentives:** by construction, not by a check: no food number is an input; the XP promise is printed on Home ("Food amounts, calories and weight never earn or cost XP"); Apple Health imports read no calories.

### Progress

- **Lifetime level:** not on the Progress screen. It is only on Home.
- **Badges:** a plain text list of badge names, no icons or artwork, no earned dates, no locked/greyed collection, no "new" marker ([veteran](review-shots/seed-05-progress-badges.png); empty state: "Badges appear as you go").
- **Progress to next level:** only on Home.
- **Seasonal:** a bar and "3 of 18 active days this season", and "Season complete. Pulse has a new accessory." ([veteran](review-shots/seed-06-progress-season-and-wardrobe.png), [new user](review-shots/ui-18-progress-badges-new-user.png)). No seasonal artwork, theme or reveal.

### Friends and Group Goals (`app/friends.tsx`)

- **Join a league:** a switch card "Join the friends league" ([before](review-shots/ui-13-friends-league-before-join.png), [joined](review-shots/ui-14-friends-league-joined.png), [veteran](review-shots/seed-07-friends-league.png)).
- **Leaderboard:** two lines of text, "1. sample_ama · 67 XP" and "2. my_name (you) · 0 XP". No avatars, no medals, no tiers.
- **Ranking:** weekly XP from the server ledger (actions plus quests), capped (`app.gm_league`, `leagueStandings`), ties share a rank, order by XP then name. In this mock the friend's number is synthetic (derived from the name).
- **Promotion, divisions, rewards:** none.
- **Cooperative quests / completing a group goal:** there are no cooperative _quests_. Group goals exist (pre-existing) and show per-person totals ([seeded couple goal at 6 of 4 days](review-shots/seed-08-group-goal-at-target.png): "my_name (you): 6 days", "Goal: 4 days a week"). **Reaching the goal changes nothing**: no completion state, no celebration, no reward.
- **Privacy, blocking, consent:** leagues need both people to opt in and be accepted, unblocked friends; a row is a username and one number; leaving empties it (UI journey D). Proven in the real Postgres tests (`gamification.test.sql`, `social-integration`), not in the browser.

### Settings (`app/privacy.tsx`)

- **Enable or disable:** the "Show XP, streaks and quests" switch hides all rewards ([screenshot](review-shots/ui-19-settings-progress-and-rewards.png)); the browser journey confirms Home and Progress go quiet.
- **Target and rest days:** 1 to 5 active days; up to four planned rest days (same screenshot).
- **League:** managed on the Friends screen, not in Settings.
- **Apple Health:** a switch plus "Import now" ([off](review-shots/ui-10-settings-progress-and-health-off.png), [after](review-shots/ui-11-settings-health-imported.png)). Simulated here.
- **Notifications:** gamification has none (no pushes, reminders or badges on the app icon). The only related control is the existing **Pulse celebrations: Off / Gentle / Full** setting (Goals screen, "Your focus", "Pulse celebrations"), which the new features do not obey (R2).
- **Animations:** no in-app control; the app follows the phone's Reduce Motion setting only.

## 3. Pulse

1. **Looks like:** an original egg-shaped violet figure with lime emissive eyes, a lime pulse-line "heartbeat" on its chest, arms, and a trailing coral ribbon, on a stage with spotlights. It is a real rendered character in the running app ([hero](review-shots/ui-01-home-new-user-top.png), [crop](review-shots/ui-03-pulse-new-user.png)).
2. **Animated:** yes. `PulseFigure.tsx` draws it as vector paths (`react-native-svg`); `PulseStage.tsx` animates it with the native-driver `Animated` API.
3. **States:** five: `idle` (slow breathing loop), `welcome` (rises in), `dance` (alternating arm poses, during workouts), `celebrate` (bounce, glow, closed-eye smile), `encourage` (gentle tilt) (`src/pulse/machine.ts`). Eyes and chest line change per state.
4. **Reacts to:** app opening, workout start/end, the existing goal celebrations (water, habits, movement, weekly), food logged, goal set, onboarding, comeback after quiet days, and the **new level-up toast** (verified: [Level 11 toast](review-shots/seed-01-home-levelup-moment.png)). **It does not react to quest completion, streak growth, badges, season progress, league changes or Apple Health imports.**
5. **Appearance changes with progress:** only by accessories; the body never changes. There is no evolution.
6. **Accessories:** unlocked by level (headband 3, wristbands 6, cape 10) and by finishing the season (one seasonal item per season). They are **worn automatically, all at once; there is no equip, choose or preview screen.** The wardrobe is one line of text on Progress.
7. **Assets:** no image, sprite, Lottie or Rive assets. Everything, including accessories, is hand-written vector paths. See [Pulse wearing headband, wristbands, scarf and cape](review-shots/seed-03-pulse-with-accessories.png): the headband and wristbands read clearly; the scarf reads like a coral mouth/smile on the body; the cape is barely visible behind the body. They are placeholders in polish terms.
8. **Rest days and missed activity:** nothing specific. The card says "Planned rest day. Your streak is safe." Pulse stays in whatever state the app gives it. The old comeback behaviour (Pulse `encourage` after quiet days) is separate from progression and says nothing about streaks.

Brief reference: `docs/CHARACTER_BRIEF_PULSE.md` planned an evolution toward "The Dance Hall"; nothing of that exists, and its earlier "no streak counters" rule was replaced by the approved streak design.

## 4. Mechanics status

Legend: **A** fully implemented with interactive UI; **B** implemented but visually basic; **C** backend/logic only; **D** partial; **E** not implemented.

| Mechanic                             | Status                             | Notes                                                                                                                                               |
| ------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| XP and lifetime levels               | **B**                              | Real rules and server ledger; Home card and one count-up number. Not shown on Progress or Workouts. Stale-display defect R1.                        |
| Personalised streaks with rest days  | **B**                              | Rules complete (rest days, weekly forgiveness); display is one text line. No celebration.                                                           |
| Daily and weekly quests              | **B**                              | Rows with ticks; weekly on Workouts, daily on Home, one on Food. Haptic only. R1.                                                                   |
| Achievements and badges              | **B**                              | Seven badges as text. No art, no reveal, no collection screen, no "new". Older milestones live separately.                                          |
| Optional Friends league              | **B**                              | Opt-in, mutual, private, capped. Two text lines. **Promotion and rewards: E.**                                                                      |
| Cooperative Group Goals              | **D**                              | Group totals existed before. No cooperative quests, **no completion reward or celebration (E)**.                                                    |
| Pulse as animated companion          | **A**                              | Five animated states, real UI. (Pre-existing.)                                                                                                      |
| Pulse reacting to game events        | **D**                              | Level-up only. Not quests, streaks, badges, imports.                                                                                                |
| Cosmetics                            | **B**                              | Seven accessories, auto-worn, simple strokes. **Equip choice: E.**                                                                                  |
| Companion evolution                  | **E**                              | None.                                                                                                                                               |
| Seasonal challenges                  | **B**                              | Four original seasons, progress bar, one cosmetic. No themed visuals or reveal.                                                                     |
| Apple Health automatic rewards       | **B** (UI) / native **unverified** | Settings switch, import, duplicate handling all work with the simulated provider. HealthKit never run. No "you earned" feedback.                    |
| Animated XP bar                      | **E**                              | Static width; only the number counts up.                                                                                                            |
| Level-up celebration                 | **B**                              | Toast with Pulse (celebrate) and a haptic, 2.6 s. Home only.                                                                                        |
| Reward reveal animations             | **E**                              | None for badges, cosmetics, seasons, leagues.                                                                                                       |
| Streak celebrations                  | **E**                              | None. A 7 or 30-day streak only adds a name to the badge list.                                                                                      |
| Quest completion feedback            | **D**                              | Tick change and haptic only; stale display R1.                                                                                                      |
| Badge collection view                | **B**                              | Text list on Progress.                                                                                                                              |
| League rankings                      | **B**                              | Text list.                                                                                                                                          |
| Haptics                              | **D**                              | Level-up, quest tick, settings taps. None for badges, imports, season. Ignores the celebrations setting. Native feel unverified.                    |
| Reduced motion                       | **B**                              | XP count-up and Pulse follow the OS setting. No in-app switch; nothing else animates. Not separately tested for the new cards.                      |
| Offline feedback and sync            | **D**                              | If the server is unreachable the app silently shows its own computation from the same records. No offline indicator. League shows an error message. |
| No separate Journey tab              | **A**                              | Five tabs; asserted in `e2e/gamification.cjs`.                                                                                                      |
| Privacy and healthy-engagement rules | **A** with gaps                    | See section 7.                                                                                                                                      |

## 5. Defects and inconsistencies found by this review (not fixed, awaiting your approval)

- **R1 (High): the Home progress card goes stale.** `src/gamification/useGamification.ts` shows the server's answer in preference to the on-device computation, and asks the server for a fresh answer at most once a minute, only when the underlying data changes. A change made within a minute of the last answer is never re-requested, so the card keeps old numbers. Observed: habit ticked, card still "Level 1, 0 XP, start a streak" one second and 63 seconds later ([results.json](review-shots/results.json) `staleCheck`); the same tick showed as 5 XP only after a later action. This breaks the core feedback loop (act, see reward) for every XP, quest and streak change, in mock and hosted builds.
- **R2 (Medium): the level-up toast and quest haptic ignore the "Pulse celebrations" setting.** `CelebrationWatcher.tsx` honours Off / Gentle / Full; `ProgressionCard` calls `showMoment` and `haptics` directly. Someone who chose Off still gets them.
- **R3 (Medium, design): no reward on workout completion.** The moment a person is most primed to feel a reward shows none.
- **R4 (Low): level-up fires on first open after a reinstall or on a new phone** (the "last congratulated level" is stored per device), congratulating an old level.
- **R5 (Low): two parallel achievement systems** (older milestones and new badges) with different looks and no cross-reference.
- **Observed, pre-existing, outside gamification:** on the Food tab the secondary buttons "Add food" and "Scan a barcode" are dark text on a dark hero and hard to read ([screenshot](review-shots/ui-17-nutrition-tab.png)).

## 6. Journeys: what was demonstrated and how

| Journey                                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | How (UI / seeded / simulated / direct) |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **A.** New user, first workout, XP, next level, achievement   | **Partly.** Account and a real guided session were done through the UI and saved ([screens](review-shots/ui-07-workout-completion-screen.png), [after](review-shots/ui-09-home-after-first-workout.png)). A 4-second test session correctly earned **0 XP** (sessions under 5 minutes earn nothing). XP from a workout was not earned through the UI (a real 5-minute session was not run); that path is covered by `gamification.test.ts` (unit) and the Apple Health import below. No new badge or achievement was earned or announced; the older "first session" milestone was not captured. | UI, with unit tests for the XP         |
| **B.** Daily quests, streak, celebration, Home                | **Partly, and exposed R1.** Habit created and ticked through the UI; the habit quest was not among the day's three, the card never updated, no streak appeared, no celebration.                                                                                                                                                                                                                                                                                                                                                                                                                 | UI                                     |
| **C.** Apple Health import, no duplicate reward, progression  | **Passed.** Switch on: "Imported 2 workouts", XP 5 to 95, second import "No new workouts to import", XP unchanged ([results.json](review-shots/results.json)).                                                                                                                                                                                                                                                                                                                                                                                                                                  | UI + **simulated provider**            |
| **D.** Join league, earn points, ranking, leave               | **Passed for join, ranking display and leave** (rows appear, rows disappear on leaving). The friend's score is **synthetic** in the mock. Real ranking and privacy are proven only in the Postgres/Deno tests.                                                                                                                                                                                                                                                                                                                                                                                  | UI + mock backend                      |
| **E.** Complete a cooperative group goal, reward, celebration | **Cannot be shown: no reward or celebration exists.** A seeded couple goal at 6 of 4 days shows plain totals ([screenshot](review-shots/seed-08-group-goal-at-target.png)).                                                                                                                                                                                                                                                                                                                                                                                                                     | Seeded                                 |
| **F.** Unlock and equip a cosmetic, Pulse changes             | **Partly.** Unlock and visible change shown on seeded level-11 data ([before](review-shots/ui-03-pulse-new-user.png), [after](review-shots/seed-03-pulse-with-accessories.png)). **No equip step exists**, and no reveal when something unlocks.                                                                                                                                                                                                                                                                                                                                                | Seeded                                 |
| **G.** Complete a seasonal challenge, reward, progress        | **Shown only on seeded data** ("Season complete. Pulse has a new accessory.", scarf worn). The new user's partial progress (3 of 18) was real. No reveal.                                                                                                                                                                                                                                                                                                                                                                                                                                       | Seeded + UI                            |

## 7. Accessibility and privacy findings

- Good: all new controls are at least 44 pt; selection uses a tick and text, not colour alone; progress bars and quest rows have accessible labels; no calorie/weight input; rewards switch off fully; leagues opt-in, mutual, capped, usernames and one number only; no notifications.
- Gaps: R2 (ignores celebrations setting); no in-app motion control (OS setting only); the Pulse accessories are decorative and not described to screen readers; badges and quests on Progress/Home have not been read with VoiceOver (unverified); count-up and toast timing on a phone unverified.
- The earlier real-database tests prove the privacy rules (ledger service-only, league mutual opt-in, blocking, deletion cascade); the browser cannot.

## 8. Prioritised improvements before owner acceptance (proposals only; none started)

1. **Fix R1** so every action shows its reward immediately (prefer the local computation when it is ahead, refresh the server number in the background).
2. **Make the completion moment a reward:** on the workout summary and after a quest, show earned XP, quest ticks, streak change and any level-up, with Pulse reacting (celebrate/encourage) and a haptic.
3. **Honour the celebrations setting** for the level-up toast and haptics (R2).
4. **Animate the XP bar** (fill with an ease) and add a short reveal for new badges, cosmetics and seasons.
5. **Badge collection with artwork:** icons, locked and earned states, a "new" marker, earned dates.
6. **Streak visuals and a milestone celebration** (without loss framing; rest days shown as a calm state).
7. **Cosmetics:** an equip/choose screen, a preview, and redrawn accessories (the scarf and cape read poorly); a first evolution step if wanted.
8. **Leagues:** a visual board (avatars, you highlighted), a weekly summary moment, and the promotion/reward model if still wanted.
9. **Group goals:** a completion state, a shared celebration and a cooperative quest.
10. **Apple Health feedback:** a one-line "Imported 2 workouts, +80 XP" moment.
11. Level and next-level progress on Progress as well as Home; seasonal themed visuals.

## 9. Needs native iPhone testing

HealthKit (permission sheet, real workouts, native module); haptic feel and timing for level-up and quest ticks; animation smoothness and the toast timing; VoiceOver reading of the new cards and the toast; Dynamic Type at the largest sizes on the new cards and the 44 pt rest-day pills; Reduce Motion behaviour on the count-up and Pulse; how the accessories look on a real display.
