# Proposal: capped XP history for progression charts

Status: **proposal; partly implemented, see the update below.** Nothing here is implemented. No persistence, no SQL, no migration, no Edge Function change. It needs owner approval before any of it is built.

**Update (Round 4):** the owner approved option A (derive on the device from existing authoritative records, no new persistence, no engine change, no database change). It is implemented; options B and C remain not built. See `UX_UPGRADE.md` Round 4 for what the records could and could not support.

## 1. What is wanted

A real "XP over time" chart on Progress (and the Habit Journeys specs later), built only from XP the engine actually awarded. No invented history, no back-filling, no change to XP rules.

## 2. What already exists (verified in the repository)

- **Engine:** `computeProgression` in `packages/shared/src/gamification.ts` returns `events: GmEvent[]` (`id`, `kind`, `day`, `xp`). Event ids are built from the record that earned them (`workout:<id>`, `meal:<day>`, `habit:<day>`, `quest:<period>:<id>`, `badge:<id>`). Exercise XP is capped per workout, per day and per week inside the engine.
- **The phone** keeps only the confirmed totals (`ConfirmedState`: `totalXp`, `weekXp`, quests, badges...). It does not keep the events, which is why `xpSeries` (already built and tested in `apps/mobile/src/charts/data.ts`) has no input today.
- **Server (proposed, unapplied):** `supabase/proposed/gamification.up.sql` defines `gm_ledger`, one row per earned event: `(user_id, event_id)` unique, `kind`, `day`, `xp` (0 to 100), `created_at`. Clients have no table access; only the five `gm_*` functions through the `social` Edge Function. Account deletion cascades the ledger. So **on the server path the history already exists** once that migration is applied; there is just no read function that returns it.
- **Engine input window:** `gm_inputs` and the on-device inputs look back 75 days (500 workouts). XP for older days is not recomputable from records.

## 3. Options

| Option                                       | New persistence                                                                  | Honest history                                                                                                                                                                | Cost / risk                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **A. Derive on device from records**         | none                                                                             | the engine's events for the last 75 days, recomputed from the person's own sessions, meal days and habit ticks; identical to what the server would award for the same records | no schema change; history capped at 75 days; recomputes on every open (cheap, pure)                        |
| **B. Read-only server RPC over `gm_ledger`** | one new SQL function (`app.gm_history`) and one `gm/history` route, no new table | ledger rows are permanent, so the series can exceed 75 days from the day the ledger started                                                                                   | needs a migration and an Edge redeploy (both need approval); only exists in builds with the Friends server |
| **C. New device cache of events**            | new local key                                                                    | grows only from the day it ships                                                                                                                                              | duplicates what A already derives; can drift from the server; not recommended                              |

## 4. Recommendation

**A now, B when the gamification migration is approved, never C.**

1. **A (client only, no persistence):** expose the engine's `events` from the progression store as a derived, in-memory field and feed the existing `xpSeries`. Zero database or storage change, and no new permission. The chart is labelled "Last 75 days" and says plainly where the data starts.
2. **B (later, behind the same approval as `gamification.up.sql`):** add `app.gm_history(p_user, p_days)` returning `[{day, xp, workout, meal, habit, quest, badge}]`, aggregated per day, **capped at 180 days and at most 180 rows**, member-only through the existing `gm_rpc` door. Per-event ids are never returned (they contain session and habit ids); only daily sums by kind. The chart then reads "Last 180 days" where the server path is active.

## 5. Caps and retention

- Chart window: 75 days (A), 180 days (B). Daily aggregation. At most 180 points per chart.
- No per-event history on the device. No history older than the ledger holds.
- Retention: the ledger lives as long as the account and is cascaded by account deletion (already tested in the proposed SQL); nothing new to purge.

## 6. Privacy and safety

- History contains only XP numbers by day and by kind. It never contains calories, weight, food names, notes or health samples (the engine input shape forbids them; a test already enforces this).
- No new data leaves the phone in option A. In B the response goes only to the signed-in owner; no friend or league route reads it.
- The chart shows XP as an effort record. It does not rank, compare people, or imply a target. XP rules, caps and the rest-day rules are untouched.

## 7. Honesty rules for the chart

- Days with no XP are shown as "no XP", not as a decline.
- The series is cumulative, so it never goes down; the chart says so.
- Where history starts later than the window (new account, or the ledger began later), the chart starts there and says "history starts on <date>". It never pads earlier days.
- If the server and the device disagree, the server wins (it is authoritative) and the chart says which source it used.

## 8. Tests to write when built

- Series from known events (already covered by `charts/data.test.ts`: cumulative, never decreasing).
- The engine's events equal the ledger rows for the same fixtures (same shared cases JSON used for TypeScript and SQL).
- `gm_history` returns no table access to other users, never exceeds 180 rows, never returns event ids.
- A new-account case: no events, empty-state copy, no invented points.

## 9. Open decisions for the owner

1. Approve A now (no persistence)?
2. Approve B together with the gamification migration (needs the approvals already listed for that migration)?
3. Window length: 75/180 days, or shorter for privacy comfort?
