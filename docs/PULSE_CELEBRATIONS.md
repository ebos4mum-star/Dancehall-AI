# Pulse celebrations (daily, weekly, monthly, yearly)

Approved feature. Built on the existing animated Pulse moment system (`apps/mobile/src/pulse`: the `celebrate` and `encourage` states, `MomentHost`, haptics, reduced motion). It does **not** use generic badges or static banners.

## Goals are the person's own

There are **no built-in thresholds**. Pure logic: `packages/shared/src/celebrations.ts`. A period with no configured goal is never celebrated. Everything is set in Goals, "Your focus" and "Pulse celebrations":

| Period  | Achievement                                                | Goal the person configures                                 |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| Daily   | Water goal reached                                         | Daily water goal (ml). The general guide is not celebrated |
| Daily   | Movement goal reached (dance + walking + strength minutes) | Daily movement goal (minutes)                              |
| Daily   | Every active habit ticked                                  | their own habits                                           |
| Weekly  | Weekly movement-minutes goal reached (Monday week)         | Minutes a week                                             |
| Monthly | Weekly goal reached in N weeks that start in the month     | Weeks a month (1 to 5); needs the weekly goal              |
| Yearly  | Weekly goal reached in N weeks that start in the year      | Weeks a year (1 to 53); needs the weekly goal              |

Weight, calories, measurements and any food number are never celebrated, and weight-loss or calorie-restriction goals have no celebration at all. A missed day, week or goal is never mentioned.

## Intensity (a preference, synced with the other preferences)

`off`, `gentle` or `full` (default `full`, the approved animated experience):

- **Full:** the animated Pulse celebration with a brief haptic.
- **Gentle:** the same Pulse in its calm `encourage` state with the message, no haptic.
- **Off:** nothing is shown. Goals reached while off are still remembered as handled, so turning celebrations back on never replays them.
- Reduced motion is honored by Pulse itself (the figure does not move) in every mode.

## Once per achievement, on every device

Each achievement has a stable id (`daily:water:2026-06-17`, `weekly:movement_minutes:2026-06-15`, `monthly:movement_weeks:2026-06`, `yearly:movement_weeks:2026`) that does **not** include the goal value, so editing a goal cannot earn the same period's achievement twice. The runner (`apps/mobile/src/celebrations/run.ts`):

1. reads the device ledger and the synced ledger and uses their **union**, so a second or restored device sees what was already handled;
2. treats a brand-new ledger (nothing local, nothing synced) as "record what is already achieved, celebrate nothing retroactively";
3. writes what it handled to the device and then to the synced ledger **before** anything is shown, so a refresh, retry or quick successive change cannot repeat it;
4. falls back to the device ledger if the synced one is unreachable, and uploads what only the device knows next time, with duplicates ignored.

The synced ledger is the `celebrations` table (migration `20261212000100_celebrations.sql`, **prepared, not applied to any hosted project**): one insert-only row per achievement (`achievement_id`, `mode`), first writer wins, owner-only under RLS, health-data consent required to write, cascade-deleted with the account, included in the data export. The id format is constrained so it cannot reference weight, calories or food. The mock store mirrors it, so the whole path is testable offline.

Verified: shared engine, runner (restoration, first sync, two devices racing, offline then upload, retries, off then on), mock store, Supabase adapter, SQL (RLS, consent, first-write-wins, no forging or rewriting, id and mode checks, isolation, deletion cascade), and the browser (no celebration without a goal, no retroactive celebration, Off shows nothing and does not replay, a weekly goal reached after it was set celebrates once).

## Claim before display (two devices, one achievement)

The runner records handled achievements in the synced ledger **before** showing anything, and shows only the ids that call actually recorded (`recordCelebrations` returns the newly recorded ids; with ignore-duplicates the database returns only inserted rows, so a loser gets nothing back). Two devices handling the same new achievement at the same instant therefore cannot both show it: the database's unique key picks one. Verified in the runner with an interleaved fake ledger (two and five devices racing), in the mock store and adapter, and in SQL (`on conflict do nothing returning` claims once). The HTTP version (two real sessions racing) is in the live suite and is not yet run.

## Known limits

- If the synced ledger is unreachable (offline), the device ledger decides, so a second device that is also offline can show the same achievement once; when both reconnect the ledger keeps one record.
- Until the migration is applied everywhere, the ledger is device-only (the app handles an unreachable or missing synced ledger).
- Weight-goal and body-measurement celebrations are intentionally absent; adding them needs owner approval and the same safety rules as weight goals.
