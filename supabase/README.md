# Supabase (prepared, not created)

No Supabase project exists yet and nothing here connects to one. This folder holds the local files for a **new, independent** project
(United States region, approved for DanceHall Fit AI only). It must never share a project, database, auth users or keys with any other product.

- `migrations/`: SQL migrations. Empty until Phase 1 is authorized. The planned data model and RLS rules are specified in
  [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) and [docs/SECURITY_PRIVACY.md](../docs/SECURITY_PRIVACY.md).
- `tests/`: database tests, including a structural test that fails if any table lacks row-level security. Added with the first migration.
- `functions/`: Edge Functions. The AI gateway design is in [docs/AI_COST_CONTROLS.md](../docs/AI_COST_CONTROLS.md); its reference logic and mock provider
  already live in `packages/ai` and are unit-tested without any network access.

Rules for every future migration: RLS enabled on every table in the same migration that creates it; explicit grants (nothing exposed by default);
`SECURITY DEFINER` functions pin `search_path`; health data is owner-only; the service-role key never ships in a client.
