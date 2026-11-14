# Supabase (prepared locally, no cloud project exists)

No Supabase cloud project has been created and nothing here connects to one. These files are for a **new, independent** project
(United States region, owned by the DanceHall Fit AI owner and never shared with any other product).

- `migrations/`: SQL migrations, applied in file-name order.
  - `20261201000100_identity_consent.sql`: profiles, private profile (adults only), append-only consents, onboarding function.
  - `20261201000200_weight_goals_readiness.sql`: weight history, weekly/monthly/yearly goals with database-enforced safety limits, readiness screening.
  - `20261202000100_food_nutrition.sql`: reference foods, food diary (items with ranges and estimate flags), photo analyses with 24-hour retention, private photo bucket policies, saved meals, budget meal plans.
  - `20261203000100_dance_catalog.sql`: staff roles and MFA permissions, audit log (append-only, hash-chained), licences and territorial clearance, instructors, workout catalog with publish gates, media, reviews, programs, and private workout sessions.
  - `20261204000100_coach.sql`: AI kill-switch flags, usage events, atomic budget and quota functions, conversations, confirmed actions, Daily Fit Plans, weekly reviews, retention function.
  - `20261205000100_integration.sql`: user AI pause, account-deletion requests and related integration functions.
  - `20261205000200_deletion_config.sql`: `app_config` (configurable account-deletion grace period).
  - `20261206000100_fit_challenges.sql`: free solo Fit Challenges (7/14/30 days) with a database-enforced rest-day cap and owner-only RLS.
- `seed.sql`: GENERATED from `packages/shared/src/food-data.json` and `workout-data.json` (synthetic data) by `scripts/gen-seed.mjs`; `pnpm check:seed` fails if it is stale.
- `tests/`: plain-SQL tests run by `tests/run.sh` on a throwaway database. `shim.sql` stands in for Supabase's `auth` and `storage` schemas and API roles
  (test-only). `goal-cases.json` is shared with the TypeScript tests so the app and the database apply identical goal rules.
- `functions/`: Edge Functions (none yet).

`tests/concurrency.sh` races separate sessions to prove the budget and quota cannot be oversubscribed.

Run the tests: `pnpm db:test` (see [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md)).

Rules for every migration: RLS enabled in the same file that creates the table; explicit grants (nothing exposed by default, column-level where possible);
`SECURITY DEFINER` functions pin `search_path`; health data is owner-only; writes to health data require consent; the service-role key never ships in a client.
