# First approved content release: sequence and rollback

Everything here has been rehearsed **locally** on throwaway Postgres databases (`pnpm db:test` runs `supabase/proposed/dry-run.sh`). Nothing has been applied to a hosted project. Each numbered gate needs your separate, explicit authorization, and each step can be undone as described.

**Read-only check of the approved development project (2026-11-15):** `workouts_style_check` allows exactly the six original styles; 14 workouts (all synthetic), 50 foods, 0 workout sessions, 0 food items, 0 users. The foreign keys that matter are `workout_sessions.workout_id`, `program_workouts.workout_id`, `content_reviews` and `media_assets` (workouts) and `food_log_items.food_id`, `meal_plan_items.food_id` (foods). The migration `20261213000100` is not applied.

## Why the order matters (all shown by the local tests)

- A session or food item that points at a workout or food that is **not in the hosted tables fails with a foreign-key error**. So hosted seeds go in **before** any app build offers that content.
- A new-style workout cannot be stored until M3 v2 is applied, so M3 v2 goes in **before** the seed.
- After M3 v2, new-style workouts are stored as **non-synthetic drafts**. The database still refuses to publish one without a cleared likeness licence, an approved fitness review by someone other than the author, and valid media licences, and people cannot see drafts. M3 v2 adds no content and publishes nothing.
- A workout referenced by a logged session cannot be deleted, so rollback has a preparation step that keeps people's history.

## Sequence

| #   | Step                                                                                                                                                                                                                                                                                                        | Needs                                | Undo                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 0   | **Content is approved.** For each item to release, the reviewer records the evidence named in `docs/review/REVIEW_QUEUE.md`.                                                                                                                                                                                | The external reviews                 | n/a (nothing is deployed)                                                                              |
| 1   | **Content PR.** Replace each approved item's `draft` or `staged` marker with its real provenance, move it into the bundled data, and add the matching migration file for M3 v2. CI must show `bundledContentProblems` empty and `pnpm check:seed` passing with `--allow-new-styles`. Nothing is hosted yet. | Step 0                               | Revert the PR                                                                                          |
| 2   | **Gate A: apply M3 v2** (`supabase/proposed/m3v2_workout_styles.up.sql`, added as a migration in step 1). Only adds values to one check constraint; every existing row stays valid. Then update `supabase/hosted-history.json` and re-read the hosted catalog.                                              | **Your authorization A**             | `m3v2_rollback_prep.sql` (only if new-style workouts were seeded), then `m3v2_workout_styles.down.sql` |
| 3   | **Gate B: seed the approved content** with `node scripts/gen-seed.mjs --allow-new-styles`. Reviewed workouts are inserted as drafts; reviewed foods carry source and attribution. Unreviewed items cannot be generated (the script refuses them).                                                           | **Your authorization B**             | Workouts: the rollback preparation above. Foods: rows are append-only (see below)                      |
| 4   | **Publish through the database's own flow:** licences, an independent fitness review, then publish.                                                                                                                                                                                                         | Staff with the right roles and MFA   | Unpublish (a status change)                                                                            |
| 5   | **Release the app build** that offers the content, only after steps 2 to 4.                                                                                                                                                                                                                                 | Your approval; a separate store step | Ship the next build without it                                                                         |

`20261213000100_household_trigger_revoke.sql` is independent of all of this and needs its own authorization (Gate C).

## Rollback in detail

1. **Workouts:** run `supabase/proposed/m3v2_rollback_prep.sql` (one transaction: clears the catalogue link on sessions that used a new-style workout, keeping their title, style label, minutes and dates; removes programme slots; deletes the new-style workouts), then `m3v2_workout_styles.down.sql`. The down script refuses while any new-style workout exists, so it can never leave the table inconsistent.
2. **Foods:** hosted food rows are not deleted if people have logged them (the foreign key would block it, correctly). To withdraw a food, ship an app build without it. Rows nobody has logged can be deleted.
3. **Seeds are idempotent** (`on conflict do nothing` for workouts and reviewed foods), so a repeated seed changes nothing.

## What the local rehearsal proves (and does not)

It proves the schema change, the constraint, the foreign keys, visibility, the publishing guards, the rollback and its history preservation on a database built from the repository's own migrations, which match the hosted catalog (fingerprint recorded in `supabase/hosted-history.json`). It does not prove hosted behaviour over HTTP, Storage, or the dashboard flow for publishing.
