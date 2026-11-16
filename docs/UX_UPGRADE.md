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
