# Migration setup checklist (owner actions)

Placeholders only. Never paste real keys into this repository (it is public) or into chat.
Nothing here has been run for you: no project, build, or paid service has been created.

## 0. Isolation (do first)

- [ ] Use a **new, dedicated** Supabase project for DanceHall Fit. Do not reuse any other app's project or credentials.
- [ ] Confirm the dev environment has no unrelated credentials. Remove inherited `STRIPE_*` / `EXPO_PUBLIC_STRIPE_*` variables from the environment settings. DanceHall does not use Stripe (in-app purchases are planned via RevenueCat, later).
- [ ] The app only reads the variables in `.env.example`. Unrelated `EXPO_PUBLIC_*` values are never read.

## 1. Supabase project (owner creates it)

- [ ] Create the project; note the **project URL** (`https://<project-ref>.supabase.co`).
- [ ] Copy the **publishable** key (`sb_publishable_...`). Never use the secret/service-role key in the app (the app refuses it).
- [ ] Authentication → Providers → Email: enable email OTP; set the email template to include `{{ .Token }}` (the app uses a 6-digit code).
- [ ] Authentication → URL configuration: set the site URL; add redirect `dancehallfit://`.
- [ ] Authentication → Rate limits: keep defaults at minimum; the app adds a 30 s resend cooldown.

## 2. Migrations (apply in order, from `supabase/migrations/`)

1. `20261201000100_identity_consent.sql`
2. `20261201000200_weight_goals_readiness.sql`
3. `20261202000100_food_nutrition.sql`
4. `20261203000100_dance_catalog.sql`
5. `20261204000100_coach.sql`
6. `20261205000100_integration.sql`
7. `20261205000200_deletion_config.sql`
8. `20261206000100_fit_challenges.sql`

The development project has all eight applied (verified: the live schema fingerprint matches a database built from these files) plus the synthetic reference data from `supabase/seed.sql`, loaded outside the migration history.

- [ ] Link with the Supabase CLI (`supabase link --project-ref <project-ref>`), review with `supabase db push --dry-run`, then apply.
- [ ] Load `supabase/seed.sql` only if the catalogue is not populated by a migration.
- [ ] Run `pnpm db:test` locally before applying.
- [ ] Confirm Row Level Security is enabled on every table (Supabase advisors → security).

## 3. Local app configuration

- [ ] `cp .env.example apps/mobile/.env.local` and fill in:
  - `EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<placeholder>`
  - `EXPO_PUBLIC_APP_ENV=development`
- [ ] `pnpm --filter @dancehall/mobile test` and `pnpm verify` pass.

## 4. iOS build (owner-triggered; not run by automation)

- [ ] Apple Developer Program membership; register bundle ID `com.dancehallfit.app`.
- [ ] Free Expo account; `eas login`; `eas init` (links the project; writes a project ID to `app.json`).
- [ ] Create EAS environment variables (not in git): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for `preview` and `production`.
- [ ] `eas build --platform ios --profile preview` (internal), then `production` for TestFlight.
- [ ] Server secrets (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, ...) go in Supabase Edge Function secrets only.

## 5. Connecting the new project (exact steps, after you create it)

1. Supabase dashboard, Project Settings, API: copy the **Project URL** and the **publishable** key. Do not copy `service_role` / secret keys.
2. Create `apps/mobile/.env.local` (git-ignored) with exactly:
   ```
   EXPO_PUBLIC_APP_ENV=development
   EXPO_PUBLIC_AUTH_MODE=supabase
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<value>
   ```
   Leave `EXPO_PUBLIC_AI_API_URL` unset: paid AI stays disabled and AI calls report "unavailable".
3. Apply migrations (section 2), then confirm in the SQL editor that every table has RLS:
   `select tablename from pg_tables where schemaname='public' and not rowsecurity;` returns no rows.
4. Confirm the private bucket exists: Storage shows `food-photos` as private.
5. Start the app (`pnpm --filter @dancehall/mobile start`), sign in with your own email, enter the 6-digit code, complete onboarding.
   In the Table editor you should see rows in `profiles`, `profile_private`, `consents` and `goals` for your user only.
6. If the app shows "App configuration problem", the URL or key is missing, not https, or is a secret key. It never falls back silently.

## 6. Authentication settings (dashboard only, owner action)

The connected tooling can run SQL and migrations but cannot change Auth settings, so these are set by hand in the Supabase dashboard, Authentication section. The app uses email one-time codes only: no passwords, no social or phone login.

- [ ] **Sign In / Providers, Email:** enabled. **Confirm email:** on. **Email OTP length:** 6. **Email OTP expiry:** 3600 s (default is fine).
- [ ] **Sign In / Providers:** every other provider (Phone, Google, Apple and so on) disabled. **Allow anonymous sign-ins:** off.
- [ ] **Email Templates:** both **Confirm signup** (used the first time someone signs in) and **Magic Link** (used when they come back) must show the code. Use a body such as: `Your DanceHall Fit code is {{ .Token }}`. Without `{{ .Token }}` the app has no code to ask for.
- [ ] **URL Configuration:** set the Site URL; add `dancehallfit://` to Redirect URLs (the code flow does not need it, but it keeps future links working).
- [ ] **Emails:** Supabase's built-in email sender allows only a few messages per hour. For more than a couple of test sign-ins, set up custom SMTP under Authentication, Emails, SMTP Settings.
- [ ] **Network access for live tests from the cloud dev session:** allow the project's `*.supabase.co` host in the environment's network policy (the session currently receives a 403 policy denial for it). Not needed for building the app or for your own phone.

Check: start the app with `.env.local` set, enter your email, receive a 6-digit code, enter it, finish onboarding. In Table editor you should see your rows in `profiles`, `profile_private`, `consents` and `goals`.
