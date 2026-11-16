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
