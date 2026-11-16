# Charts: data-source inventory, honesty rules, and Habit Journeys specs (specs only)

Code: `apps/mobile/src/charts/` (`data.ts` pure builders, `ui.tsx` components, `sections.tsx` placements, `useFeedback.ts`). Tests: `data.test.ts`, `slot.test.ts`.

## Honesty rules every chart follows

1. `null` means nothing was recorded. A day without a logged meal is a **gap**, never zero calories. Zero is used only where zero is true (no active minutes).
2. No estimation, smoothing or extrapolation. Averages use only days with data and always state how many days that was.
3. Week-on-week comparison is shown only when **both** weeks have at least 3 logged days; otherwise the card says there is not enough data.
4. Bars start at zero. Lines keep a zero baseline unless a builder opts out.
5. Nutrition charts are not rendered when "hide numbers" is on (`useNumbersHidden()`), carry no targets, no good/bad colour and no moral language. Fibre is not in the food model, so it is **not charted** (the card says so).
6. Every chart has an accessible description (`describeSeries`), a "Show values" text list (`tableRows`), a live-region readout of the touched point, and per-point buttons (bars, calendar cells) or Previous/Next buttons (line), so touch exploration is never the only way in.
7. Motion: bar growth and ring fill are skipped with Reduce Motion or when Pulse celebrations are Off. Haptic `select` ticks follow the same setting (`feedback.ts`).

## Placed charts and their sources

| Screen                | Chart                                         | Source (all existing stores)                                                          | Notes                                                                                                         |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Home                  | Your week in movement (7 bars)                | `listSessions` completed sessions, minutes via `durationS` else `minutes`, local days | Hidden when nothing recorded in the 7 days                                                                    |
| Workouts (Dance tab)  | same 7-day bars                               | same                                                                                  |                                                                                                               |
| Progress              | Movement over time: Weeks (8) / Months (6)    | same                                                                                  | Monday-start weeks; note shows session count                                                                  |
| Progress              | Your active days (5-week calendar)            | completed session days + `prefs.restWeekdays`                                         | Display only; streak numbers still come from the confirmed engine state. Rest days are a calm moon, never red |
| Progress and Food tab | What you logged: calories or protein, 14 days | `listFoodLogs`                                                                        | Gaps for unlogged days; footnote with logged-day counts                                                       |
| Friends / Group Goals | existing bars (unchanged)                     | existing                                                                              |                                                                                                               |

### Documented gaps (not faked)

- **XP progression line:** `xpSeries` is implemented and tested, but the app keeps only the confirmed totals on the device, not the event history, so no XP chart is shown. It needs the engine to expose capped events (a product/engine decision).
- **Milestone timeline with dates:** badges and cosmetics carry no earned-on date today.
- **Fibre:** not part of the food model.

## Habit Journeys: reusable chart specs (NOT implemented; for the future feature)

These reuse the existing builders and components; none of this is built.

- **Counter:** a large number of days with the habit, plus "N of M days recorded"; never "failed" wording.
- **Consistency calendar:** `calendarCells` generalised with a per-habit `active` set; states active / planned-skip / open / today / future; no red.
- **Reduction trend:** `LineChart` over per-day counts with `null` for unrecorded days; baseline zero; a reduction is shown as a falling line with neutral colour; no target line unless the person set one.
- **Milestone timeline:** vertical list of dated milestones (requires a stored earned-on date); each milestone also a text row.
- **Estimated savings:** shown only when the person supplied a unit price; always labelled "estimate", always with the inputs spelled out, hidden by default if numbers are hidden.
- Shared requirements: text alternative, "Show values", gaps for missing days, Reduce Motion, no streak-loss pressure, no comparisons across periods with fewer than 3 recorded days.

## Native-only checks (cannot be verified in a browser)

Drag-to-scrub feel and scroll conflict on a real touchscreen, haptic ticks, VoiceOver reading order and actions on bars/cells, Dynamic Type at the largest sizes, chart frame rate on an older iPhone.
