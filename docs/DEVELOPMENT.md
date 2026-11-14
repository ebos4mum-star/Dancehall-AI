# Development

## Everyday commands

```bash
pnpm install
pnpm verify          # secret scan, workspace + CI checks, script tests, format, lint, typecheck, unit tests, database tests
pnpm db:test         # migrations + RLS tests on a throwaway Postgres database
pnpm --filter @dancehall/mobile start   # Expo dev server
```

## Database tests

`supabase/tests/run.sh` builds a fresh database, applies `shim.sql` (a test-only stand-in for Supabase's `auth` schema and API roles), every migration in order,
the test helpers, and each `*.test.sql`. It uses the standard `PG*` environment variables. In CI a Postgres 17 service container is used.

On an Ubuntu machine with the packaged Postgres (no Docker needed), one-time setup so your OS user can connect as a superuser:

```bash
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "create role $USER superuser login"
```

Tests impersonate users with `test.as_user(uuid)` (sets the role and JWT claims) and assert both what is allowed and what is refused.

## Mock authentication (development only)

With no Supabase variables set, the app uses an offline **mock store**: a "development sign-in" button, synthetic data kept on the device, and an always-visible banner.
The mock enforces the same rules as the database (consent-gated writes, adults only, goal safety limits); shared test cases keep it equal to the real trigger.
`EXPO_PUBLIC_APP_ENV=production` refuses to start in mock mode.

To use a real project later, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key only; a secret or service-role key is rejected at startup).
The Supabase adapter (`apps/mobile/src/data/supabaseStore.ts`) is written against the migrations but has **not** been run against a live project.

## Previewing the app without a simulator

```bash
cd apps/mobile && EXPO_OFFLINE=1 npx expo export --platform web --output-dir /tmp/dh-web
```

serve the output with any static server and open it at phone width. This checks layout and logic; it does not verify native behavior (haptics, secure storage, camera).

## Food data and the seed

`packages/shared/src/food-data.json` and `workout-data.json` are the single sources of the synthetic reference foods and sample workouts (used by the app and the database). After editing it run `node scripts/gen-seed.mjs` to regenerate `supabase/seed.sql`; `pnpm check:seed` (part of `pnpm verify` and CI) fails if they differ.

## Trying the food flow without a camera

In the development build, **Snap a meal → Try a sample plate (simulated)** runs the full pipeline with no photo. **Choose a photo** exercises the real resize-and-discard path with any image; the result is still simulated and says so.

## Trying the coach in the development build

The Coach tab and Daily Fit Plan run entirely on the device against a **simulated** coach (rule-based; no AI service). In **Coach, Privacy and history** you can turn personalization on or off, delete conversations, see monthly usage, and flip a "Pause all AI" switch that simulates the staff kill switch. Free-tier allowances (20 messages, 1 weekly review a month) are enforced, so you will hit them quickly while testing; **Me, Privacy and settings, Reset development data** clears usage.
