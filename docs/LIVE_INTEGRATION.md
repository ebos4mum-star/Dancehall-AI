# Live integration: the minimum steps

Nothing in this document has been done. No cloud project, account, key, build or charge exists. It lists what the owner must do (and what can then be built) to move from the development build to a live, testable app.
Costs are rough and must be re-checked on each vendor's current pricing page before committing.

> **Do not use the Supabase connection attached to the AI assistant's session.** It is signed in to a different product's organization. DanceHall Fit AI needs its own account, organization and project.

## Order of work (smallest path to a real iPhone test)

| #   | Step                                                       | Who                                      | Needs a computer?                 | Approx. cost                   |
| --- | ---------------------------------------------------------- | ---------------------------------------- | --------------------------------- | ------------------------------ |
| 1   | Create a separate Supabase organization and project        | Owner                                    | No (phone browser works)          | Free to start                  |
| 2   | Apply the migrations and seed                              | Owner (+ assistant provides exact files) | Easier with one, possible without | Free                           |
| 3   | Configure authentication and an email sender               | Owner                                    | No                                | Free tier                      |
| 4   | Create Apple Developer and Expo accounts, build a test app | Owner + assistant                        | No (cloud build)                  | Apple $99/year; Expo free tier |
| 5   | Build the server AI gateway and photo job (needs 1-3)      | Assistant, with owner-approved secrets   | No                                | Development time only          |
| 6   | Create an AI provider workspace with a spending limit      | Owner                                    | No                                | Pay per use; capped            |
| 7   | Replace the synthetic food data with licensed data         | Owner (licences, reviewer) + assistant   | No                                | Free sources; reviewer fees    |

Steps 1-4 give a real, on-device test of everything except photo analysis and the coach (those are simulated until step 5). Steps 5-7 are what make AI features real.

## 1. A dedicated Supabase project

1. Sign up at supabase.com with the account that should own DanceHall Fit AI. Create a **new organization** (for example "DanceHall Fit AI"). Do not reuse another product's organization.
2. Create a project: name `dancehall-fit-ai-dev`, region **US East** (as decided), a long random database password stored in your password manager (it is only ever used by you and by CI secrets, never committed). Start on the Free plan with **synthetic test data only**.
3. In _Project Settings, API_, copy the **Project URL** and the **publishable (anon) key**. These two values are safe in the app. The **service-role / secret key must never be put in the app, in git, or in any `EXPO_PUBLIC_*` variable** (the app refuses to start if it sees one).
4. In _Settings, API / Data API_: expose only the `public` schema; turn off GraphQL; keep "automatically expose new tables" off. Migrations grant exactly what is needed.
5. Plan limits to know: the Free plan pauses a project after about a week of inactivity and has no automatic backups. **Move to Pro (about $25/month plus compute) before any real person's health data is stored.**
6. Create separate `dev` and, later, `prod` projects. Never point the dev app at prod.

### 2. Apply the database

Apply, in file-name order: `supabase/migrations/20261201000100_identity_consent.sql`, `20261201000200_weight_goals_readiness.sql`, `20261202000100_food_nutrition.sql`, `20261203000100_dance_catalog.sql`, `20261204000100_coach.sql`; then `supabase/seed.sql` (synthetic foods and sample workouts).

- **With a computer:** install the Supabase CLI, `supabase link --project-ref <ref>`, `supabase db push`, then run `seed.sql` from the SQL editor.
- **Phone only:** paste each file into the SQL editor in order. (Alternative the assistant can add on request: a manual-only GitHub workflow that applies migrations using a database URL kept as a protected secret.)
- After applying: open _Advisors_ (security and performance) and read every warning; confirm every table shows RLS enabled; confirm the `food-photos` bucket exists and is **private**.
- **First staff account** (owner): sign up in the app, enrol an authenticator (TOTP) under your account, then in the SQL editor run `insert into public.staff_roles (user_id, role) values ('<your-user-id>', 'admin');`. Staff permissions only work with a verified second factor.
- The migrations were tested on Postgres 16 locally and 17 in CI, not on a live Supabase project. Expect small fixes on first apply; budget a short session for it.

## 3. Live authentication

1. _Authentication, Providers_: enable **Email** (one-time code). Turn on "Confirm email".
2. _Authentication, URL configuration_: set the Site URL and add the app's redirect scheme `dancehallfit://`.
3. _Authentication, Email templates_: make the magic-link / OTP template show the 6-digit code (`{{ .Token }}`), which is what the app's sign-in screen asks for.
4. **Custom email sender.** Supabase's built-in email has a very low hourly limit and is for testing only. Create a Resend account (free tier is enough for a small beta), verify a sending domain (SPF/DKIM), and enter its SMTP details under _Authentication, SMTP settings_.
5. _Authentication, Multi-Factor_: enable TOTP (needed for staff).
6. Optional hardening: CAPTCHA on sign-up, stricter rate limits.
7. **Sign in with Apple** is required on iOS if any other social sign-in is added, needs the Apple Developer Program, and is **not built yet**. Email codes work without it.
8. In the app's `.env.local` (git-ignored, copy from `.env.example`): `EXPO_PUBLIC_AUTH_MODE=supabase`, `EXPO_PUBLIC_SUPABASE_URL=...`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...`, `EXPO_PUBLIC_APP_ENV=development`.

**What works against a live project today:** sign-in, onboarding, consent, goals, weights, food diary, saved meals, meal plans and workout sessions (the Supabase adapter covers these but has never run live).
**What does not yet:** photo analysis, the coach, the Daily Fit Plan and weekly reviews. Their screens show a "not available" state until step 5 adds the server pieces and adapter methods (the database tables for all of them already exist).

## 4. Testing on an iPhone

| Route                                             | What you need                                                                                                | Pros / cons                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **A. EAS cloud build + TestFlight** (recommended) | Apple Developer Program ($99/year), free Expo account, a bundle identifier, the iPhone                       | No computer or Mac needed; a real native app with camera, haptics and secure storage. Takes setup and review time.   |
| B. Expo Go via a tunnel                           | A computer (or always-on dev machine) running `expo start --tunnel`, free Expo account, Expo Go on the phone | Fastest to try; needs a running dev server, and Expo Go must support the project's SDK (check the App Store version) |
| C. Hosted web preview                             | Any static host                                                                                              | Layout only: no native camera, haptics or secure storage                                                             |

For route A the assistant must first add (all local, no cost): a bundle identifier in `app.json` (owner decision tied to the Apple developer entity), `eas.json`, and the App Privacy answers (health and fitness data, photos, identifiers) for App Store Connect. **Already done:** the camera and photo-picker permission descriptions in `app.json`; the app requests no microphone.
Before any real person uses a build: complete the privacy and consent review (gate P2), the health-claims copy review, and the store-compliance review for subscriptions.

## 5. Server-side real AI food recognition

Target flow (the gateway logic, safety rules, schemas, quotas and budget already exist and are tested against a mock):

1. The app resizes the photo (max 1024 px JPEG) and uploads it to `food-photos/<user-id>/<analysis-id>.jpg`, then inserts a `food_photo_analyses` row (RLS requires both the health-data and the AI-photo consents).
2. The app calls one Edge Function route, e.g. `POST /api/ai/food-photo { analysisId }`.
3. The function: verifies the JWT; reads kill-switch flags; checks consent in the database; takes a quota unit (`ai_quota_consume`) and reserves worst-case cost (`ai_budget_reserve`); creates a short-lived signed URL for the image; calls the provider with the image and the system prompt; **validates the reply against the same zod schema**; grounds each item in reference data (numbers come from the database, never the model); records a usage event; settles the budget (`ai_budget_settle`); and calls `food_photo_complete` (or `food_photo_fail` plus `ai_quota_refund`).
4. The app shows the editable estimate with its ranges and the "Estimate" label, exactly as in the development build.

To build this the assistant needs: an Edge Function project folder, the shared packages made importable by Deno, a Postgres-backed implementation of the gateway's usage and budget ports (the SQL functions are done), and adapter methods for `analyzeMealPhoto`, the coach, plans and reviews. It also needs the provider key stored as an Edge Function secret (`supabase secrets set ANTHROPIC_API_KEY=...`, entered by you; never pasted into chat or committed).
Before launch: replace `PLACEHOLDER_PRICES` with the provider's current prices; choose the model per feature; measure accuracy on a labelled meal set made of consented or synthetic photos (never real users' photos) and have a registered dietitian review the ranges (gates N2, S1); review the provider's data-retention terms.

## 6. Provider spending controls

The $50/month figure is an **application** ceiling. It cannot guarantee the provider's bill (concurrency, retries, delayed billing, unrecorded usage). So:

1. Create a separate provider workspace/project per environment (dev, prod) with its own API key.
2. In the provider console set a **hard monthly spend limit at or below the application ceiling** (for example $45 against the app's $50) and email alerts at 50%, 80% and 100%, where the plan offers them. Confirm what the plan actually supports before relying on it.
3. Keep the app-side layers on: per-person monthly allowances, the atomic budget reservation, kill switches (`ai.kill_all`, per feature) and alerts at 50/80/90/100%.
4. Review `ai_usage_events` weekly during the beta; investigate any cost per active person above plan.
5. Rotate the key immediately if it is ever exposed; keys live only in Edge Function secrets.

## 7. Licensed nutrition reference data

- **USDA FoodData Central:** free API key from api.data.gov; the data is public domain, so it can be imported in bulk (Foundation, SR Legacy and FNDDS datasets). Credit the source in the app.
- **Open Food Facts (barcodes, packaged foods):** open data under the ODbL, which requires attribution and imposes share-alike on derived databases. Keep it in its own table and take legal advice before merging it with anything else.
- **Regional foods** (African, Caribbean, South Asian, Latin American and others): USDA coverage is thin. Options are national or FAO/INFOODS composition tables (check each licence) or entries curated by a registered dietitian. Plan to have a dietitian approve the first ~200 most-logged foods.
- Migration path: add source columns (`fdc_id`, data type, portions) to `foods`, write an import script, flip `is_synthetic` to false only for reviewed rows, and make production builds hide any synthetic row (a test should enforce this). Gates N1 and N3.

## 8. Secure food-photo retention and deletion

Already in place: private bucket (JPEG, 5 MB, own folder only); 24-hour deadline on every upload, reset to 24 hours after a successful analysis, kept for failures; "save" keeps a photo, un-saving restarts the clock; service-only functions `food_photo_expired` and `food_photo_mark_deleted`; all tested.
Still to do (needs the live project):

1. A scheduled job (hourly) that calls `food_photo_expired()`, removes each object **through the Storage API** (deleting rows in SQL does not remove files), then calls `food_photo_mark_deleted`. Use Supabase's scheduler (pg_cron with an HTTP call to an Edge Function), not a GitHub Actions schedule.
2. A monitor: alert if any unsaved photo is older than 25 hours (`select count(*) from food_photo_analyses where deleted_at is null and saved = false and delete_after < now() - interval '1 hour'`).
3. Short-lived signed URLs only (about 60 seconds) and no CDN caching of the bucket.
4. Account deletion must also remove all of a person's objects before the account row.
5. A staging test: upload, analyze, advance the clock, confirm the object is gone, confirm a saved photo survives, confirm another user can never read it.
6. Counsel to validate the 24-hour design and the documented retention exceptions (backups, abuse reports, legal holds) per launch country.

## Minimum owner actions, in order

1. Create the new Supabase organization and `dev` project; send the assistant only the project reference and confirmation (not keys).
2. Apply migrations and seed (or authorize the migration workflow); enrol MFA and add yourself as admin.
3. Configure email auth with a Resend sender; try sign-in in the app against the live project.
4. Decide the iOS bundle identifier and legal entity; create Apple Developer and Expo accounts; authorize an EAS test build.
5. Create the AI provider workspace with a hard monthly limit; enter its key as an Edge Function secret yourself.
6. Authorize step 5 (server gateway and photo job) so the assistant can build and test it against the live dev project.
7. Engage a registered dietitian and privacy counsel; choose the nutrition data sources.

## Open decisions

Coach conversation retention (90 days is the development default), deletion grace period and export format, whether failed photo analyses are deleted within 24 hours (implemented that way), beta countries, subscription service and pricing beyond the $9.99 test, music and video production plan, and the final visual identity (character artwork is a replaceable slot).
