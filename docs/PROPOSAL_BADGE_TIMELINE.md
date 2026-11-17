# Proposal: accurate badge-earned timestamps and milestone timelines

Status: **proposal; partly implemented, see the update below.** Nothing is implemented. No database or storage change, and no date is invented. It needs owner approval before any build.

**Update (Round 4):** the owner approved the three-way model (Earned/qualified, Recorded, Earlier) and that a first-sync timestamp is never an achievement date. Implemented device-only with no database change: qualified dates come from replaying the engine on the records and are shown only when the history is complete; the recorded day is kept in the existing per-account seen ledger. The server column and `gm_milestones` function in this proposal are NOT built and need separate approval. See `UX_UPGRADE.md` Round 4.

## 1. What is wanted

A "milestones" timeline (badges, streak milestones, a completed season) showing **when** each was earned, accurate or honestly undated.

## 2. What exists today (verified)

- Badges are `badge:<id>` events in the engine (`+25 XP` once each). The phone stores only the **list** of earned badges and a "seen" ledger (`badgesSeen`, `streakMilestoneSeen`, `seasonDoneSeen` in `apps/mobile/src/gamification/prefs.ts`/`rewards.ts`), with no dates.
- Server (proposed, unapplied): `gm_ledger` stores each `badge:<id>` with `day` (the day the engine assigned) and `created_at` (when it was recorded). So a server-recorded timestamp exists going forward.
- **The catch:** the engine assigns the day when it first evaluates the records. A person who has 30 days of history on the first run would get badges that were truly earned weeks earlier, all stamped with the first-run day. Showing that day as "earned on" would be false.

## 3. Principle

Show only a date we can prove, and say what kind of date it is. Three kinds:

| Basis       | Meaning                                                                                                                                         | Shown as                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `qualified` | The engine can replay the records and name the day the condition was first met (streak lengths, count-based badges, season goal)                | "Earned 12 Oct"                                    |
| `recorded`  | First seen by a sync _after_ the person's baseline, so recording time is within a day of earning, but the exact qualifying day is not derivable | "Recorded 12 Oct"                                  |
| `earlier`   | Present at the first sync (back-filled), or older than any record                                                                               | no date: "Earned before you started tracking here" |

The timeline never shows a date for an `earlier` item and never converts one basis to another.

## 4. Design

**Engine (shared, pure, tested; no storage):** add `qualifiedOn(badgeId, records)`, deterministic, replaying the same 75-day window the engine already uses. Where a badge's rule cannot be replayed to a day, it returns `null`.

**Device-only path (no server):** extend the existing "seen" ledger (device storage, already per account) from `badgesSeen: string[]` to a map `{ id: { seenOn: 'YYYY-MM-DD', basis } }`. The first confirmed answer on a new phone is the existing silent baseline, so everything present then is marked `earlier` (never dated). Anything that appears later is `recorded` with today's local day, upgraded to `qualified` when the engine can replay it. This is a device-preference change only (needs approval; no database).

**Server path (needs the gamification migration plus one small addition):** add two columns to `gm_ledger`: `earned_on date null` (set from the engine's `qualifiedOn`, otherwise null) and `basis text not null check (basis in ('qualified','recorded','earlier'))`. Rule applied at insert: if the ledger was empty for that user before this sync, every badge in it is `earlier` with `earned_on` null; otherwise `recorded` (or `qualified` with `earned_on` when provided). The existing `created_at` is the recording time. Existing rows (none yet, since the migration is unapplied) need no back-fill; if the migration is applied first, existing badge rows are marked `earlier`. A new read function `app.gm_milestones(p_user)` returns `[{id, kind, earnedOn, basis}]` for the signed-in owner only.

**Milestones included:** badges; streak milestones (7/14/30...) from the streak engine; season completion. Quests are not on the timeline (they repeat daily and weekly and belong in the XP chart).

## 5. Timeline presentation (when built)

- Newest first; dated items under month headings; one undated group "Earned before you started tracking here".
- Each row: badge art, name, a plain sentence, the date with its basis word (Earned/Recorded). Text alternatives for every row; no colour-only meaning; Reduce Motion respected; no streak-loss or shame wording.
- Empty state is honest: "Your first milestone will appear here."

## 6. Privacy, safety, rules

- Only badge ids, dates and basis words. No health, food or weight data. Never shown to friends or in leagues. Account deletion cascades the ledger rows.
- No XP rule, cap or badge condition changes. The timeline reads results only.

## 7. Tests to write when built

- `qualifiedOn` matches fixtures for streak and count badges, returns `null` where not replayable.
- First-ever sync marks every badge `earlier`; a later new badge is `recorded`/`qualified`.
- Replays, retries and a second device do not change an existing row's date or basis (unique key already prevents duplicates).
- No date is ever produced for an `earlier` item (property test).
- SQL: new columns obey the check constraint; `gm_milestones` returns only the caller's rows.

## 8. Open decisions for the owner

1. Approve the device-only change (dated "seen" ledger) now, with no database?
2. Approve the two ledger columns and `gm_milestones` together with the gamification migration?
3. Wording for undated items ("Earned before you started tracking here")?
4. Should season completion and streak milestones appear on the same timeline as badges?
