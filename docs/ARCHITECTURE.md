# Architecture

Status: design plus Phase 0B foundation code. No backend exists yet.

```
 Expo app (iOS first, Android ready)        Admin portal (Next.js)
   user login token + public key only          staff login + MFA, no service key
            \                                      /
             +--- Dedicated Supabase project (US) ---+
             |  Postgres + RLS · Auth · private Storage |
             +------------------+----------------------+
                                |
                  Edge Function `api` (server-side secrets)
        AI gateway · nutrition lookup · subscription webhooks · media signing
                                |
        AI provider · USDA FoodData Central · Open Food Facts · RevenueCat · video host
```

Principles: clients are untrusted; the database enforces the rules; secrets live only on the server; entitlements and usage are written only by server code; AI output is validated before use.

## Repository layout

| Path              | Contents                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile`     | Expo Router app: five tabs (Today, Dance, Food, Coach, Me), design tokens, accessible UI components, English strings file.                                                  |
| `apps/admin`      | Next.js shell with prepared areas: content, licensing, moderation, flags, AI costs, audit. No data, no sign-in yet.                                                         |
| `packages/shared` | Types and logic used by every app: unit conversion, nutrition interfaces and maths, entitlements, safety rules, staff permissions, country activation, zod schemas, errors. |
| `packages/ai`     | AI response schemas, cost and budget logic, gateway reference implementation, mock provider. No network code.                                                               |
| `supabase/`       | Migrations, tests and functions (empty until Phase 1).                                                                                                                      |
| `evals/`          | Synthetic safety cases run in `pnpm test`.                                                                                                                                  |
| `scripts/`        | Secret scan, workspace check, CI-config check, with tests.                                                                                                                  |

Source packages are consumed directly as TypeScript (no build step). Imports are extensionless so Metro and Next both resolve them.

## Mobile

Expo Router with a five-tab shell. Placeholder screens show honest empty states that say what is missing; no invented classes, meals or people. Design tokens are pure data, unit-tested for WCAG AA
contrast in light and dark. Reduced-motion is respected (animations collapse when the system setting is on); haptics are used only on deliberate actions; touch targets are at least 44 points.
The app will hold only the public Supabase URL and publishable key. Sessions will use secure storage (Phase 1). Strings are in `src/i18n` so languages can be added later.

## Data model (planned for Phase 1+; every table has RLS)

| Area               | Tables (planned)                                                                                                                               | Default access                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Identity           | `profiles` (display name, country, units, locale, time zone), `profile_private` (birth date, height, sex)                                      | Owner only; display name visible only where sharing allows  |
| Consent            | `consents` (purpose, version, granted_at, withdrawn_at)                                                                                        | Owner reads and withdraws; server writes records            |
| Goals and measures | `goals`, `weight_entries`, `measurements`                                                                                                      | Owner only                                                  |
| Activity           | `workout_sessions`, `activity_entries`, `habits`, `habit_checkins`                                                                             | Owner only                                                  |
| Food               | `food_logs`, `food_log_items` (source, confidence, `user_edited`, kcal range), `saved_meals`, `recipes_saved`, `pantry_items`, `grocery_lists` | Owner only (grocery lists shareable)                        |
| Reference          | `foods` (reference nutrition with source), `recipes`, `workouts`, `programs`, `instructors`, `media_assets`                                    | Published rows readable by signed-in users                  |
| Licensing          | `licences` (asset, territory, rights, start/end), `content_reviews` (reviewer, role, outcome)                                                  | Staff only                                                  |
| AI                 | `ai_conversations`, `ai_messages`, `ai_usage_events`, `ai_quotas`                                                                              | Owner reads own conversations; usage written by server only |
| Billing            | `entitlements`, `subscription_events`                                                                                                          | Owner reads own; server writes only                         |
| Social             | `buddy_links`, `teams`, `team_members`, `challenges`, `challenge_entries`, `invitations`, `shares`, `reports`, `blocks`                        | Participants see activity totals only                       |
| Household          | `households`, `household_members`, `sharing_grants` (category, grantor, grantee, revocable)                                                    | Members see only what each person granted                   |
| Operations         | `staff_roles`, `audit_log` (append-only, hash-chained), `feature_flags`, `country_activations`, `moderation_actions`                           | Staff with MFA, by permission                               |

Storage: private buckets, per-user folders, no public read, food photos deleted after a retention period (to be decided, see DECISIONS.md), signed URLs for video.

## Services connecting

- **AI:** every call goes through the gateway in the `api` function (see AI_COST_CONTROLS.md). The gateway checks flags, kill switches, entitlement, quota and budget, calls the provider, validates structured output, and records usage.
- **Nutrition:** photo and text results are matched to reference data (USDA FoodData Central, Open Food Facts, curated regional entries). The model proposes foods and portion ranges; reference data supplies the numbers.
- **Subscriptions:** the store is the source of truth. A subscription service sends webhooks to the server, which writes `entitlements`. Clients never write entitlements.
- **Workout video:** hosted by a video service; the app receives short-lived signed URLs only for content whose licence record is cleared for the user's country.
- **Admin portal:** signs in as staff (MFA required), uses permission checks in the database, never holds the service-role key.

## Testing approach

Pure logic is tested with unit tests (Vitest). Database policy tests will run on plain Postgres in CI from Phase 1. No CI job calls a paid or external service.

## Batch B additions (nutrition, local)

- **Reference foods** (`foods`, seeded) are readable by signed-in users and written only by trusted code. Diary tables (`food_logs`, `food_log_items`), `saved_meals`, `meal_plans`/`meal_plan_items` and `food_photo_analyses` are owner-only with consent-gated writes.
- **Photo analysis flow (target design):** the app resizes the photo, uploads it to the private bucket, calls the server AI gateway, which validates structured output and grounds items in reference data, then the original is deleted 24 hours after analysis unless saved. In the development build the same gateway runs in-process against a mock provider and nothing is uploaded.
- **App layers:** `DataStore` (mock or Supabase) for persistence; pure logic in `packages/shared` (items, ranges, search, grounding, swaps, planner, energy guide); a `DraftProvider` holds the meal being composed so photo, manual and saved-meal entry share one review screen.
- **UI kit:** `ui/motion.tsx` (press feedback, count-up, reveal, floating, ring) and `ui/Depth.tsx` (depth cards, hero card, `CharacterStage` slot for future 3D artwork). All animation respects reduced motion.

## Batch C additions (dance fitness, local)

- **Tables:** `staff_roles` (+ `app.has_permission`, MFA required), tamper-evident `audit_log`, `licences`, `instructors`, `workouts`, `media_assets`, `content_reviews`, `programs`/`program_workouts`, and the private `workout_sessions`. The sample catalog is seeded from `workout-data.json`.
- **App:** the catalog comes from the shared package (as with foods); sessions go through the `DataStore`. A pure session engine (`session-engine.ts`) drives the guided timer; `playbackFor` decides between licensed media and the text session.
- **Dance UI:** gradient workout cards, a style carousel, filters (style, level, intensity, duration, low impact), Quick Fit pills, workout detail with safety information, a guided session screen, schedule, activity history, a sample program, and Today and Progress integration.
