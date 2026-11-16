# Overnight implementation status (branch `feature/overnight-nutrition-fitness`)

Date: 2026-11-16. Base: `claude/app-store-readiness` (includes the signed-photo cache fix and all Community security work). No PR, no merge, nothing deployed, no hosted change, no `main` or `integration/live-prep` change, no Apple Health or HealthKit.

Levels used below: **built** (code exists) · **locally tested** (automated tests pass here) · **staging-tested** (run against the staging project) · **deployed** · **available to users**. Nothing in this branch is deployed or available to users.

## 1. Fully implemented (built and locally tested)

| Feature                                                                                                                                                                                                                                                                                                             | Where                                                                                             | Tests                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Repeat a meal, or copy a whole day onto today (new entries, originals untouched, estimate labels kept)                                                                                                                                                                                                              | `apps/mobile/src/food/copy.ts`, buttons on `app/food/history.tsx`                                 | `copy.test.ts` (9), `foodStore.test.ts` repeat flow             |
| Recipes (23 sample recipes, African, Caribbean, South Asian, Mediterranean, Asian, global), nutrition computed from ingredients with ranges                                                                                                                                                                         | `packages/shared/src/recipes.ts`                                                                  | `recipes.test.ts`                                               |
| Fridge to meal: typed foods to ranked recipes, missing items, vegan/vegetarian only when every ingredient is a plain food, excluded words (not allergy protection), region preference                                                                                                                               | `recipes.ts`, screen `app/food/fridge.tsx` (food tab shortcut)                                    | `recipes.test.ts`, `recipeFlow.test.ts`                         |
| Ingredient substitutions scaled to similar calories; the recipe is rebuilt and nutrition recomputed                                                                                                                                                                                                                 | `substitutesFor`, `substituteIn`, fridge screen                                                   | `recipes.test.ts`, `recipeFlow.test.ts`                         |
| Weekly meal plans from recipes (3 or 7 days, portions in quarter steps, never below the person's floor), saved through the existing plan path so shopping lists and household sharing work unchanged                                                                                                                | `planWeekFromRecipes`, `recipePlanToDraft`, "Build the plan from: Recipes" in `app/food/plan.tsx` | `recipes.test.ts`, `recipeFlow.test.ts` (grocery totals add up) |
| Conservative workout-energy estimates (net MET, low end, 0.9 factor, ranges) and protection against double counting: the daily guide already assumes typical movement, so only half of any excess above it, capped at 300 kcal, is offered as information, never added to a target; duplicate sessions counted once | `activity-energy.ts`                                                                              | `activity-energy.test.ts` (14)                                  |
| Week and month summaries (days logged, averages only over logged days, movement, rough workout energy with a range, weight change from two entries); missing is shown as missing                                                                                                                                    | `period-summary.ts`, `apps/mobile/src/progress/PeriodCard.tsx` on the Progress screen             | `activity-energy.test.ts`                                       |
| Friends: request, accept, decline, withdraw, remove, block, unblock; blocked and unknown look identical                                                                                                                                                                                                             | `packages/shared/src/social-engine.ts`, `app/friends.tsx`                                         | `social-engine.test.ts` (24)                                    |
| Optional, per-friend, revocable sharing of one thing only: a weekly activity summary. Food, weight, body and health data cannot be shared (no category, no code path; a test is a tripwire)                                                                                                                         | same                                                                                              | same, `socialStore.test.ts`                                     |
| Group challenges, couple goals (exactly two) and family goals (up to six); invitations need a yes; only accepted friends can be invited; leaving deletes the person's numbers; blocking removes people from owned groups; account removal erases everything                                                         | same                                                                                              | same                                                            |
| Nutrition totals match across the diary, history, weekly bars and the period summary, including after edits and deletes                                                                                                                                                                                             | `consistency.test.ts`                                                                             | 2                                                               |

## 2. Already existing and reused (not rebuilt)

Calorie targets and safety limits, goals, diary with add/edit/delete, saved meals, recent foods, portions, protein, fibre and plate guidance (Food tab), barcode flow with missing-product fallback, grocery lists and household sharing, swaps, weight log and chart, weekly recap, rule-based coach, challenges, habits.

## 3. Simulated or disabled

- **Food photo recognition**: the provider-independent boundary exists (`analyzeMealPhoto`); in the mock it is SIMULATED and labelled so; no live provider, no photo leaves the device.
- **Barcode database**: Open Food Facts is OFF by default (offline sample list in development). Live lookups have NOT been tested and are not claimed; see `docs/OPEN_FOOD_FACTS_CHECKLIST.md`.
- **Friends and groups**: ON only in the development mock (`EXPO_PUBLIC_SOCIAL`); OFF in Supabase builds unless set; a production build refuses to start with it on. Sample members (`sample_*`) answer at once so it can be tried alone. They are synthetic.
- **Recipes and foods**: synthetic development content, labelled "not reviewed by a dietitian".

## 4. Blocked by external services or approvals

- Hosted social backend: needs the migration approved and applied, plus a server route (Edge Function) that verifies the JWT and calls `public.social_rpc`; that route is NOT written.
- Real AI photo recognition: needs your approval of a provider, privacy review and a server gateway.
- Live barcode database, dietitian and cultural review of foods and recipes, counsel review of sharing text.
- Cache-control fix for stored photos: separate staging deploy authorization.

## 5. Files and screens changed

New screens: `app/food/fridge.tsx`, `app/friends.tsx`. Changed: `app/food/history.tsx`, `app/food/plan.tsx`, `app/progress.tsx`, `app/(tabs)/food.tsx`, `app/(tabs)/me.tsx`, `app/_layout.tsx`, `src/i18n/en.ts`. New logic: `packages/shared/src/{recipes,activity-energy,period-summary,social-engine}.ts` (+tests), `apps/mobile/src/food/copy.ts`, `src/progress/PeriodCard.tsx`, mock store social methods, `social` build flag (`src/lib/env.ts`, `createStore.ts`), gate entries for `/food/fridge` and `/friends`.

## 6. Migrations prepared, NOT applied

`supabase/proposed/social.up.sql`, `social.down.sql`, `tests/social.test.sql`, `social-dry-run.sh` (wired into `supabase/tests/run.sh`). Six tables with deny-all RLS, server-only functions, one door `public.social_rpc`, a CHECK that limits sharing to `activity_summary`, and cascades for account deletion. Requires `community.up.sql` first (public usernames). Rehearsed only on a throwaway local database.

## 7. Test results (all run locally in this session)

- `pnpm check:secrets`, `check:edge`, `test:scripts`, `format:check`, `lint`, `typecheck`: pass.
- Unit and integration: shared 843 passed (4 skipped), mobile 592 passed (19 skipped), AI 116, admin 27.
- Database: `pnpm db:test` passes, including the new social dry run (privileges, sharing limits, friends, blocking, groups, deletion, rollback and reapply).
- iOS JavaScript bundle exports; the web export renders the new screens in a browser (checked visually and by text).
- Not run: on-device iPhone testing, live Supabase, live barcode, live AI, screen-reader and Dynamic Type passes of the new screens.
- Skipped tests are the pre-existing skips (live-integration suites needing credentials).

## 8. Commits and branch

Branch `feature/overnight-nutrition-fitness`, pushed to origin. Commits (oldest first): repeat/copy; recipes, fridge and plans; gate; workout energy and summaries; social engine, mock and screen; social schema proposal and consistency tests; this report.

## 9. Remaining privacy or security concerns

- Group numbers are self-reported by the app; the server cannot verify them. Fine for friendly goals, not for prizes (none offered; paid challenges and wagering are not implemented).
- Friends are found by public Community username, so hosted use depends on Community's username system being live, while public Community stays off.
- `activity_summary` reads workout sessions; the proposed SQL function is the only reader and requires the owner's explicit per-friend share.
- Recipe diet tags are conservative but unreviewed; they say "check labels". Excluded words are not allergy protection (the screen says so).
- Workout energy is a rough estimate shown with a range and is never added to a calorie target.
- Open items carried over from Community staging: guest rate-limit test from one machine, expired-token test, deletion-executor scheduling, hosted verification of the photo cache-control fix.

## 10. Recommended next steps

1. Review `docs/STAGING_STATUS.md` Phase 6 and approve a staging deploy of the cache fix.
2. Decide whether friends should use Community usernames in production or their own handle; approve or change `supabase/proposed/social.up.sql`; then the server route can be written and tested in staging.
3. Dietitian and cultural review of foods and recipes before any user-visible launch.
4. Try the new screens on an iPhone build (needs your approval) and run an accessibility pass.
5. Choose and approve an AI photo provider (or keep simulated recognition off for V1).
