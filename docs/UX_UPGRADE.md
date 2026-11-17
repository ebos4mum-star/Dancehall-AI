# Premium UX, storybook and interactive experience upgrade: report

Evidence: `docs/review-shots/charts-*.png`, `results-charts.json` (script `apps/mobile/e2e/charts.cjs`, real web export, mock mode, synthetic history shifted to end today, normal and Reduce Motion runs). Earlier `after-*.png` shots are the "before" for gamification surfaces.
Scope kept: no Habit Journeys, no branding change, no new tab, no reward-rule change, no Apple Health change, no Supabase/migration/Edge Function/EAS work, nothing merged to main.

## Phase 1: audit findings (summary)

- **Hierarchy/illustration:** every tab already had a storybook hero (`HeroScene`/`SceneBackdrop`) for today/dance/food/coach/me. Gaps: Friends had no hero; Community and Progress reused the generic "me" scene; Progress had no charts anywhere; Home had no activity history.
- **Charts:** none existed (only a goal bar and the group bars). **Data available:** completed sessions, food logs, weights, habit check-ins, confirmed progression totals. **Not available:** XP event history on device, earned-on dates, fibre.
- **Keyboard/input:** all text fields go through three wrappers (`TextField`, onboarding `BigField`, the Coach box). None declared field kind, so names, usernames, search and numbers shared one default, there was no Next/Done progression, and a focused field could sit under the keyboard in long scroll screens. The Coach box was single-line.
- **Haptics:** a few ad-hoc calls with no policy; Pulse "Off" did not silence them.
- **Gestures:** none required; nothing relied on a gesture alone.

## Phase 2: design system additions

- Scene worlds are now seven (`today, dance, food, coach, me, friends, progress`): shared lighting/palette/floor, one prop layer each (friends: campfire, lanterns, two silhouettes; progress: hills, path, flag, sun). Art direction unchanged: plum/violet/lime/coral, no new colours.
- New reusable components (`src/charts/ui.tsx`): `ChartCard` (title, meaning line, live readout, "Show values"), `BarChart`, `LineChart`, `ProgressRing`, `CalendarGrid`, plus `useScrub` (drag to explore) and `slotAt`. Existing: `EmptyState` (Pulse + honest text), skeletons, `Notice`, `Pop`/`AnimatedBar`.
- Haptic vocabulary (`src/ui/feedback.ts`): select / success / milestone / reveal / error; Off plays nothing, Gentle plays select+success+error, Full plays all. Tested.

## Phase 3: charts

See `docs/CHART_SPECS.md` (sources, rules, gaps, Habit Journeys specs).

## Phase 5: Pulse

- Tap Pulse on Home: a small wave (`tapped` event, only while idle). Rate-limited by `tapAllowed`: 1.2 s apart, max 4 per 20 s. Silent when celebrations are Off. Accessible as a button "Say hi to Pulse".
- Planned rest day with nothing recorded: one gentle `restDay` reaction (reuses the existing calm "encourage" pose; no pressure text). Missed activity keeps the existing supportive `comeback`.
- No evolution, no new states (the approved five are unchanged); cosmetics behaviour unchanged.

## Phase 6: gamification

Unchanged: server-authoritative engine, rewards, no league promotion. Calendar/chart displays are display-only.

## Phase 8: keyboard and input system

- `inputBehavior` (pure, tested): names → words, no autocorrect; usernames/codes/email → no capitalisation, no autocorrect; search → "search" return key; numeric/decimal → numeric pad, "done"; multiline → newline; otherwise Next on a field with a follower, Done on the last. Explicit props always win.
- `FormFocusProvider` + `useFormField`: fields register in mount order, Next focuses the next field, the screen's own submit handler wins.
- `Screen`: scrolls the focused field clear of the keyboard, interactive dismissal on iOS (on-drag elsewhere), taps still reach buttons while the keyboard is up.
- Coach composer: multiline (grows to 120 px), Send submits, sentence capitalisation.
- Call sites declared: display name (name), country (search), friend username claim/add (username, Send), fridge/swap/add food (search/Done), guest search, community username.
- Static test fails the build if a raw `TextInput` appears outside the three wrappers or a name/username/search field omits its `kind`.

## Phase 9: accessibility and performance

Charts: described in words, tappable per point, 44 pt targets, live-region readout, no colour-only meaning (calendar uses check / moon / ring), Reduce Motion respected. Animations use native-driver transforms; SVG redraw only on selection change. Browser cannot measure native performance.

## Screen-by-screen

| Screen                | Before                 | After                                                                                      | Chart data          | Keyboard                 | Test evidence                            |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------ | ------------------- | ------------------------ | ---------------------------------------- |
| Home                  | hero, quests, plan     | + 7-day movement chart; tap Pulse; rest-day reaction                                       | sessions            | n/a                      | `charts-*-home.png`, results-charts.json |
| Workouts              | hero, movement card    | + 7-day chart                                                                              | sessions            | n/a                      | unit + build                             |
| Food                  | plate card             | + 14-day calories/protein (hidden when numbers hidden)                                     | food logs           | search/Done fields typed | `charts-*-progress-nutrition.png`        |
| Progress              | recap, rewards, period | scene `progress`; movement over time (weeks/months); active-days calendar; nutrition chart | sessions, food logs | n/a                      | `charts-*-progress-*.png`                |
| Friends               | no hero                | friends scene hero; username fields typed, Send submits                                    | existing            | username kind            | `charts-*-scene-friends.png`             |
| Community             | generic scene          | friends scene                                                                              | n/a                 | username kind            | build                                    |
| Coach                 | single-line box        | multiline composer                                                                         | n/a                 | multiline/send           | `inputBehavior.test.ts`                  |
| Onboarding / Settings | default inputs         | name / search kinds, Next/Done                                                             | n/a                 | typed                    | `inputBehavior.test.ts`                  |

## Not done / product decisions

1. XP progression line and dated milestone timeline need engine data not stored on device.
2. Fibre chart needs fibre in the food model.
3. Per-screen new illustrated art for Onboarding, Coach and Community beyond the existing heroes was not commissioned; current scenes are reused (Community now uses `friends`).
4. Bottom sheets / swipe gestures were deliberately not added (no non-gesture need identified; every chart action already has a button alternative).

## Native iPhone checklist (browser cannot verify)

- [ ] Keyboard: type per field (name capitalises words; username no caps/autocorrect; search shows Search key; numbers show numeric pad); Next moves to the next field; Done dismisses; focused field never hidden; Coach composer grows and Send submits; dragging the list dismisses the keyboard.
- [ ] Haptics: chart scrub ticks, Pulse tap tick, none with celebrations Off, only select/success/error with Gentle.
- [ ] Chart drag-to-scrub does not fight vertical scrolling; bars/cells readable with VoiceOver (each announces day and value); "Show values" works.
- [ ] Dynamic Type at largest: chart cards, calendar and hero text do not clip.
- [ ] Reduce Motion on: bars/rings appear without animation; Pulse tap shows the still pose.
- [ ] HealthKit, performance profiling (unchanged scope, still native-only).

---

# Round 2: completing the storybook experience (after e67a3b4)

Evidence (real running app, web export, mock mode, synthetic data): `docs/review-shots/story-*.png`, `results-storybook.json`, `results-inputs.json`, `results-charts.json`; scripts `e2e/storybook.cjs`, `e2e/inputs.cjs`, `e2e/charts.cjs`. The baseline `after-*.png` and `apps/mobile/shots/*` are untouched.

## 1. Screen-by-screen completion status

| Chapter    | Status                          | What is there now                                                                                                                                                               | Honest gap                                                                        |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Home       | Complete for this scope         | storybook hero, tap-to-react Pulse, rest-day reaction, 7-day chart                                                                                                              | none identified                                                                   |
| Workouts   | Complete for this scope         | dance scene hero, 7-day chart                                                                                                                                                   | exercise-demo art is outside this scope                                           |
| Nutrition  | Complete for this scope         | food scene hero, logged calories/protein chart with gaps                                                                                                                        | no fibre (not in model)                                                           |
| Progress   | Complete for this scope         | new `progress` landscape hero (captured from the top: `story-progress-top.png`), movement/calendar/nutrition charts                                                             | no XP history chart (not stored on device)                                        |
| Friends    | Improved, art modest            | `friends` scene hero (campfire, lanterns, two silhouettes)                                                                                                                      | the 148 px banner crops the campfire, so the scene reads subtly                   |
| Community  | Improved, art modest            | new `community` village-square scene (notice board, bunting, lanterns)                                                                                                          | bunting sits behind the title scrim and is faint; a taller banner would show more |
| Onboarding | Complete for this scope         | new `onboard` world: a trail with a lantern marking progress, a chapter emblem per step (signpost, shield, ruler, heart, summit flag), steps turn like pages (`StepTransition`) | art is vector, not hand-illustrated production art                                |
| AI Coach   | Complete for this scope         | study-nook scene (shelf, lamp, tea) with a legibility scrim; a slim scene header with Pulse once a chat exists; composer Enter sends                                            | live "thinking" pose for Pulse not added (no new states approved)                 |
| Settings   | Unchanged beyond keyboard types |                                                                                                                                                                                 |                                                                                   |

## 2. Storybook art and animation inventory

- **Scene worlds (9):** today, dance, food, coach (now with study nook), me, friends, progress, community, onboard (5 chapters). One shared sky/lighting/floor/curtain frame; one palette (plum, violet, lime, coral, ivory).
- **Character:** Pulse only, identity unchanged. Poses: idle, welcome, dance, celebrate, encourage. New this round: a rare, brief blink while idle (every 3.8 to 7 s, 140 ms; never with Reduce Motion, never in another state).
- **Transitions:** onboarding step turn (fade plus 14 px rise, Reduce Motion: none); chart bars and rings (grow/fill, Reduce Motion: none); press feedback via `Tappable` (a 3% dip and a slight dim; Reduce Motion: dim only).
- **Not added, by choice:** parallax, decorative gesture animation, extra Pulse states, evolution.

## 3. Actual running screenshots

`story-onboarding-1-about-you` … `5-goal`, `story-coach-empty`, `story-coach-thinking`, `story-coach-chat`, `story-community`, `story-friends`, `story-progress-top`, and the earlier `charts-*` set (normal and Reduce Motion).

## 4. Interaction improvements and decisions

- **Touch feedback:** only `Button` had pressed feedback among about 63 pressables. Added shared `Tappable` and applied it to the selectable cards (`IconChoice`, onboarding yes/no cards, Coach quick prompts). Other pressables can adopt it incrementally.
- **Bottom sheets:** none exist in the app (no `Modal`/sheet usage; the only overlay is the lock screen), so there was nothing to retrofit. Not adding sheets without a use case.
- **Card expansion/selection:** charts expand their values inline ("Show values"); `Disclosure` already exists for other sections.
- **Chart gestures:** drag-to-scrub plus per-point buttons and Previous/Next, so every gesture has a button alternative.
- **Loading/success states:** skeletons and `Notice` already existed; no new success animation was added (haptic vocabulary covers success).
- **Keyboard-aware overlays:** `Screen` scroll-to-field and the Coach `KeyboardAvoidingView`; no other keyboard overlays exist.

## 5. Interaction and keyboard verification matrix

"Browser" means the HTML attributes React Native Web derived from our rules, and the Enter-key focus behaviour, in headless Chromium. It does **not** show how the iOS keyboard looks or behaves. Every row below is **native iOS: NOT VERIFIED** until a device run.

Defects this verification found and fixed: date-of-birth field had sentence capitalisation and autocorrect on (fixed at the rule level: symbol keyboards never get prose behaviour); Household invite code had autocorrect on; Household name showed "Next" to an unrelated action (Return now submits create/join); Coach Return did not send on web (React Native Web needs `blurOnSubmit` for multiline; iOS uses `submitBehavior`).

| Screen                   | Field                                          | Keyboard  | Return key | Capitalise | Autocorrect |
| ------------------------ | ---------------------------------------------- | --------- | ---------- | ---------- | ----------- |
| `/onboarding` step 1     | Country or region                              | text      | search     | none       | off         |
| `/onboarding` step 1     | Date of birth                                  | text      | next       | none       | off         |
| `/onboarding` step 1     | What should we call you?                       | text      | next       | words      | off         |
| `/onboarding` step 3     | Current weight (kg)                            | decimal   | done       | none       | off         |
| `/onboarding` step 3     | Height (cm)                                    | decimal   | done       | none       | off         |
| `/coach` (chat composer) | Ask your coach                                 | multiline | send       | sentences  | on          |
| `/`                      | New habit                                      | text      | done       | sentences  | on          |
| `/dance`                 | Walk length                                    | decimal   | done       | none       | off         |
| `/dance`                 | Distance (optional)                            | decimal   | done       | none       | off         |
| `/dance`                 | Strength session length                        | decimal   | done       | none       | off         |
| `/coach`                 | Ask your coach…                                | multiline | send       | sentences  | on          |
| `/progress`              | Hours slept                                    | decimal   | done       | none       | off         |
| `/goals`                 | Minutes a week you would like to move (optiona | numeric   | done       | none       | off         |
| `/goals`                 | Daily water goal in ml (optional)              | numeric   | done       | none       | off         |
| `/goals`                 | Daily movement goal                            | numeric   | done       | none       | off         |
| `/goals`                 | Weeks a month you want to reach your weekly go | numeric   | done       | none       | off         |
| `/goals`                 | Weeks a year you want to reach your weekly goa | numeric   | done       | none       | off         |
| `/privacy`               | Display name                                   | text      | done       | words      | off         |
| `/friends`               | Their public name                              | text      | send       | none       | off         |
| `/friends`               | Name it                                        | text      | done       | sentences  | on          |
| `/food/add`              | Search foods                                   | text      | search     | none       | off         |
| `/food/fridge`           | What do you have?                              | text      | done       | none       | off         |
| `/food/swap`             | Search foods                                   | text      | search     | none       | off         |
| `/food/household`        | Household name                                 | text      | done       | sentences  | on          |
| `/food/household`        | Invite code                                    | text      | done       | characters | off         |
| `/food/barcode`          | Or type the number under the barcode           | numeric   | done       | none       | off         |

Browser results: Enter on the onboarding name field moved focus to "Date of birth" (verified). Coach Enter sends: Enter. Enter progression across numeric goal/walk fields moves to the next field or dismisses on the last, as designed.
**Not in the browser matrix (screens that only render for signed-out or special states, or inputs created after an interaction):** `/account/*` (PIN, recovery key, security questions, rotate), sign-in, the barcode scan sheet, group-goal creation, community composer and its report dialogs, food add-item quantity editors. These are covered by the static audit (`inputBehavior.test.ts`: every input goes through the shared wrappers and declares its kind) and the existing a11y sweep, and need native verification.

## 6. Accessibility findings

- a11y sweep: no findings (run three times; one run crashed with a Node error unrelated to the app and was not reproduced).
- New: every chart is described in words with a "Show values" list; onboarding emblems are decorative (the step is announced by the existing progress label); scene art is hidden from screen readers; Pulse tap is a labelled button ("Say hi to Pulse") with 44 pt target; calendar uses a check, a moon and an outline rather than colour alone.
- Open: the scene art relies on contrast with the scrim for text; the Friends and Community banners should be re-checked at the largest Dynamic Type on a device.

## 7. Explicit social integration result

`pnpm test:social-integration` with real Deno and a local Postgres 16: **17 tests, 17 passed, 0 failed, 0 skipped**. (The first rerun in this round was skipped because Postgres was stopped; it was started and the suite rerun.) Community integration: 26/26 passed, 0 skipped. `pnpm db:test`: passed. My earlier report of "31 passed" for the community suite was from an environment where the database might not have been running; the numbers above are the confirmed ones.

## 8. Data honesty, XP and privacy confirmation

- Charts still read only recorded sessions and food logs; unlogged days are gaps; comparisons need 3 logged days in both weeks; no XP history, badge dates or fibre are invented (`charts/data.test.ts`).
- No changes this round to `packages/shared`, `supabase/`, `src/gamification`, `src/privacy` or `src/health` (`git diff` over those paths is empty). XP rules and privacy safeguards are unchanged.

## 9. Remaining native-only checks (before the consolidated iPhone round)

- [ ] Every row of the keyboard matrix on a real iPhone (keyboard type, Return key label, capitalisation, autocorrect, Next focus, scroll-to-field, interactive dismiss, Coach grow and Send).
- [ ] Haptics (chart ticks, Pulse tap, Off/Gentle/Full).
- [ ] Chart drag versus vertical scroll; VoiceOver on bars, cells and chart points.
- [ ] Largest Dynamic Type on onboarding, Coach hero, Friends/Community banners.
- [ ] Scene and Pulse frame rate on an older device; Reduce Motion behaviour.
- [ ] HealthKit (unchanged scope).

## 10. Product decisions needing approval

1. Taller Friends and Community banners (to show the full scene) versus the current compact banners.
2. Commission hand-illustrated production art to replace the vector scenes (current art is original vector work, not final illustration).
3. Whether to store XP events (capped) on the device to enable an XP progression chart.
4. Whether to add dated badges to enable a milestone timeline.
5. A distinct Pulse "thinking/listening" pose for the Coach (needs a new state; the five approved states are unchanged).

---

# Round 3: approved polish (after 34c9c7c)

Evidence (real running app, web export, mock mode): `docs/review-shots/story-friends.png`, `story-community.png`, `story-coach-think-normal.png`, `story-coach-think-reduced.png`, `story-coach-chat.png`, onboarding and Progress captures; `results-think.json`; scripts `e2e/storybook.cjs`, `e2e/pulse-think.cjs`. Baselines untouched.

## What was improved

1. **Taller Friends and Community banners (approved decision 1).** `Banner` gained a `height` option (default 148). Friends and Community use 200 with a slightly larger Pulse. The campfire, lanterns, village houses, notice board and bunting are now inside the visible area. Banner text keeps its scrim and still wraps cleanly.
2. **Scene art quality (decision 2).** Every world now has depth layers: two atmospheric ridges, a world-specific horizon (village rooftops with lit windows, pine trees for friends, speaker stacks for dance, a skyline for today), a low fog band, a vignette and a far sparkle layer that drifts opposite to the glow (a quiet parallax; native-driver transform; still with Reduce Motion). Friends and Community props were brightened. Text legibility is unchanged because scrims were kept.
3. **Pulse thinking pose (decision 3).** New state `think` for the AI Coach: one hand raised beside the head, one lifted brow, eyes glancing up and aside, three thought dots that appear one after another. Motion is a slow small sway. **Reduce Motion:** a still pose with all three dots visible (verified: the transform does not change over time). **Celebrations Off:** Pulse stays at rest (the Coach only sends `thinking` when the setting is not Off; covered by a source test). Priority: never hides a welcome, encouragement or celebration; a tap does not interrupt it. Pulse's silhouette, colours, ribbon and cosmetics are unchanged. The Coach header strip was enlarged (116 px) so the pose is readable.
   - My first version put the hand across the face and read as a "nose"; it was redrawn after looking at the screenshot.
4. **XP history architecture proposal (decision 4):** `docs/PROPOSAL_XP_HISTORY.md`. Documentation only: derive on device from records now (no persistence), a read-only capped server function later, never a separate cache. No persistence or database change was made.
5. **Badge timestamp and milestone timeline proposal (decision 5):** `docs/PROPOSAL_BADGE_TIMELINE.md`. Documentation only: dates are shown only when provable (qualified/recorded), back-filled items are explicitly undated, nothing fabricated. No change made.

## Verification this round

- Typecheck, lint, format, all unit suites (mobile 729 passed, shared 984, ai 116, admin 27), edge/secrets/script checks: pass.
- Browser: route sweep, a11y sweep (no findings), reduced-motion, 36/36 regression, walkthrough, gamification upgrade, charts, storybook captures: pass. iOS bundle export: pass.
- Pulse think: label announced as "thinking it over"; moves in normal mode, still with Reduce Motion.
- Social integration 17/17, community integration 26/26, db tests pass (local Postgres 16 started for the run), none skipped.
- No change to `packages/shared`, `supabase/`, gamification, privacy or health code: XP rules, caps and privacy safeguards are untouched.
- Tooling note: `dist-review/` (a design-review build used only to hold the thinking pose still for a screenshot) was added to the lint and format ignore lists.

## What remains incomplete

- The art is still original **vector** work. Depth, layering and subtle motion are much improved, but it is not hand-illustrated production art; that remains a commissioning decision.
- Characters: Pulse is the only character. Expressions are authored per state; no new characters were added.
- Only Home, Coach, Friends, Community, Onboarding and Progress heroes were visually reviewed in the browser this round; the dance, food and me worlds got the shared depth layers but were not re-photographed.
- The thinking pose could not be triggered by a real Coach reply in the browser (the mock replies instantly); it is verified through the review build, the state-machine tests and the source test. Real timing needs the live Coach on a device.
- XP history and badge timeline: proposals only, awaiting your decisions (listed in each proposal).

## Native-only checks still required

Everything in the earlier checklist (keyboard matrix on a real iPhone, haptics, chart drag versus scroll, VoiceOver, Dynamic Type, HealthKit) plus:

- [ ] Parallax sparkle layer, ridges and fog: frame rate on an older iPhone, and that nothing flickers at the scene edges.
- [ ] The thinking pose in the Coach header on a device at the largest Dynamic Type, with Reduce Motion on, and with celebrations Off.
- [ ] Friends and Community 200 px banners: text legibility and Pulse overlap on the smallest supported iPhone.

---

# Round 4: analytics and readiness (after eae3472)

Evidence (real running app, web export, mock mode, synthetic records shifted to end today): `story-xp-long-*.png`, `story-xp-young-*.png`, `story-milestones-long-*.png`, `story-milestones-young-*.png` (normal and Reduce Motion), `results-analytics.json`; script `e2e/analytics.cjs`. Baselines untouched.

## Decisions applied

1. XP history is derived on the phone from the engine's own events. **No new XP persistence, no engine change, no database change, no migration.**
2. Historical XP is never invented: where coverage is incomplete the card says so in plain words.
3. Badge dates use the approved three-way model. **A first-sync timestamp is never shown as an achievement date.**

## Feasibility check (done before building)

The engine already returns dated events (`GmState.events`) from the person's records. Verified limits that shaped the design:

- Workout, meal and habit XP carry the real record day. Quest XP is replayed by the engine for 60 days. So **the last 60 days are complete for every kind of XP**; older XP is real but cannot be dated by day on the phone.
- **Badge XP is stamped with the day the engine ran** (`day: input.today`), so putting it on the chart would put every badge on the sync day. It is therefore kept off the daily line and disclosed ("Badge bonuses (N XP) are not placed on a day").
- **Weekly quests are dated on the last day of their week** by the engine's replay. This is shown as a note under the chart.
- A quest replay uses today's habit count for the "tick a habit" quest. That is the engine's own rule (and the server's); it was not changed.
  Both improvements were feasible without schema changes, so both were implemented.

## What was built

- `src/gamification/history.ts` (pure): `xpHistory` (running total and daily series), `historyIsComplete`, `qualifiedBadgeDays`, `badgeMilestones`.
- **XP over time** card on Progress (existing `ChartCard`, `LineChart`, `BarChart`): Running total / Each day, last 60 days, touch exploration, Previous/Next, Show values, spoken description, Reduce Motion respected.
  - Coverage states shown in words: complete, **young** ("History starts on ..."; days before the first record are gaps, never zero), **partial** ("N XP earned before then is included in the starting total but is not shown day by day"; never spread over days), **syncing** (the server total is behind this phone's records), **offline** (no confirmed total).
  - The running total ends at exactly the engine total minus badge bonuses (tested).
- **Milestones** (badge timeline) on Progress:
  - **Earned <date>** (qualified): only when the records cover the whole history (first record inside the 60-day window and the confirmed activity XP equals what the phone derives) and the app's own rules, replayed on the records known by each day, first award the badge on that day. Exact by construction (tested for every badge).
  - **Recorded <date>**: only for a badge that appeared _after_ this phone's baseline; the day this phone first saw it, with the sentence "it may have been earned earlier".
  - **Earlier**: no date. The default for anything else, including every badge present at a phone's first sync.
  - Rows are text-first, with a rail (lime = earned, violet ring = recorded, grey ring = earlier), no colour-only meaning.
- **One device-storage addition (not a database change, not a new store):** the existing per-account "seen" ledger gained `badgeRecorded` (badge id to local day) to remember when this phone first saw a badge. It is optional, backward compatible with older saves, cleaned on read, and written only for badges appearing after the baseline. Everything else is in memory only.
- Chart fix found while verifying: a 60-bar chart overflowed its card with unreadable labels. Dense charts now use thin bars and three axis labels.

## Verification

- 28 new unit tests (`history.test.ts`): accuracy against the engine total at several lengths; monotonic running total; badge XP never on a day; partial coverage (180-day history, server ahead by 400 XP); young account gap; empty; syncing; offline; a late import lands on its real day not the arrival day (and the engine's retroactive quest XP is accounted for); determinism; qualified dates equal the first engine award day for every badge (replayed on records up to that day and up to the day before); `historyIsComplete` boundaries; "earlier" never carries a date over all combinations; first-sync badges get no recorded date; a later badge is recorded once; a badge removed and returned keeps its first day; saved data is cleaned.
- Browser (normal and Reduce Motion): long-history seed shows the partial-coverage note and **zero** earned dates with "date is not known"; young seed shows "History starts on", earned dates, and the "records cover your whole history" sentence.
- Bugs found and fixed during verification: cumulative-event date derivation disagreed with the engine (replaced by an engine replay); a 60-bar chart overflowed; a screenshot scrolled to the wrong heading.

## Limits stated plainly (also on screen)

- Daily detail is 60 days. XP earlier than that is included in the starting total, not charted by day.
- Qualified badge dates use today's settings (planned rest days, weekly target) because the engine does not store settings history.
- Recorded dates exist only from the day this build is installed; badges earned before that are Earned (if provable) or Earlier.
- Weekly quest XP is dated on the last day of its week.

## Simulator and native readiness

See `docs/NATIVE_TEST_PLAN.md` (every screen, keyboard, art, Pulse, haptics, charts, VoiceOver and Dynamic Type, gamification, Apple Health, Friends/Community/Group Goals, account and privacy, offline; Mac requirements; staging configuration). The local launcher gained an optional `--health` flag (tested); without it a launcher build contained no Apple Health.

### Is the app ready for one consolidated native iPhone round?

**Yes for the client-side app.** No known code defect blocks it. Genuine remaining blockers, and only these:

1. **A Mac with Xcode and an iOS Simulator runtime (plus ideally a physical iPhone) is needed.** Nothing native can run in this environment. This is an owner action, not a code gap.
2. **Haptics, camera and barcode scanning, real Apple Watch workouts, real VoiceOver feel and real performance can only be proven on a physical iPhone.** The Simulator cannot cover them.
3. **Server-side items cannot be tested on staging until you approve staging changes** (they are not applied or deployed there): the friends league and server XP total (`gamification.up.sql`, `health_sync.up.sql`, `social` function), the server-side one-workout-counts-once rule for Group Goals (`social.patch2`), the newer Community safety phrases (`community.patch3`), and Community photos (needs `text_only`/`open`). They do not block the client-side round; decide whether to include them or defer them.
   Not blockers: the earlier art and product decisions (production illustration, a Pulse pose beyond thinking), which are polish.
