# Supabase (prepared locally, no cloud project exists)

No Supabase cloud project has been created and nothing here connects to one. These files are for a **new, independent** project
(United States region, owned by the DanceHall Fit AI owner and never shared with any other product).

- `migrations/`: SQL migrations, applied in file-name order.
  - `20261201000100_identity_consent.sql`: profiles, private profile (adults only), append-only consents, onboarding function.
  - `20261201000200_weight_goals_readiness.sql`: weight history, weekly/monthly/yearly goals with database-enforced safety limits, readiness screening.
- `tests/`: plain-SQL tests run by `tests/run.sh` on a throwaway database. `shim.sql` stands in for Supabase's `auth` schema and API roles
  (test-only). `goal-cases.json` is shared with the TypeScript tests so the app and the database apply identical goal rules.
- `functions/`: Edge Functions (none yet).

Run the tests: `pnpm db:test` (see [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md)).

Rules for every migration: RLS enabled in the same file that creates the table; explicit grants (nothing exposed by default, column-level where possible);
`SECURITY DEFINER` functions pin `search_path`; health data is owner-only; writes to health data require consent; the service-role key never ships in a client.
