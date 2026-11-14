# DanceHall Fit AI: Master Specification

Status: **Phase 0B (foundation only).** This document records the approved scope. Nothing below is implemented unless the "Status" column says so.
Nothing here claims a completed legal, clinical, licensing or store review. Those are listed as **gates**.

## 1. Product

DanceHall Fit AI is a standalone, global, AI-powered dance fitness, nutrition, weight-management and lifestyle coaching app.
Approved configuration is in [DECISIONS.md](DECISIONS.md): adults 18+, English with localization-ready strings, metric and imperial units, iOS first and Android ready,
Expo / React Native / TypeScript mobile app, Next.js admin portal, a new dedicated Supabase project (US region), a USD $50 monthly AI spending ceiling,
Pro test price USD $9.99/month, Household Pro planned (price undecided).

**Permanently excluded:** money-staking, deposit forfeiture, cash penalties and any financial-commitment challenge. The schema, flags and permissions contain no place to record them
(a unit test keeps them out of the feature flags and permissions).

## 2. How to read the tables

- **V1** = the focused paid beta (Phases 1-7). **Later** = after the beta proves out. Expensive expansion waits for beta results.
- **Phase** numbers refer to [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
- **Gate** codes are defined in section 4. A feature cannot ship publicly until its gates are recorded as passed by a named person.
- **Status** is `Foundation` (a supporting piece exists in Phase 0B) or `Not started`.

## 3. Features

### A. Dance Fitness

| ID  | Feature                                                                                   | Ver.                  | Phase                         | Gates             | Status                                                                                                              |
| --- | ----------------------------------------------------------------------------------------- | --------------------- | ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| A1  | Global dance workout library (Afrobeats, Amapiano, hip-hop, Latin, Bollywood, low-impact) | V1 (small launch set) | 3                             | L1, L2, F1        | Foundation (catalog, filters and 14 sample text outlines, Batch C; no licensed content yet)                         |
| A2  | Quick Fit workouts of 5, 10 or 15 minutes                                                 | V1                    | 3                             | F1                | Implemented locally (Batch C; sample text outlines only)                                                            |
| A3  | Personalized dance fitness plans                                                          | V1                    | 3 (rules), 5 (AI adjustments) | F1, S1            | Foundation (readiness-aware Quick Fit and a rule-based Daily Fit Plan, Batches C and D)                             |
| A4  | Beginner, intermediate and advanced levels                                                | V1                    | 3                             | F1                | Implemented locally (Batch C; sample text outlines only)                                                            |
| A5  | Workout scheduling and history                                                            | V1                    | 3                             | none              | Implemented locally (Batch C; sample text outlines only)                                                            |
| A6  | Activity and workout completion tracking                                                  | V1                    | 3                             | P1                | Implemented locally (Batch C; sample text outlines only)                                                            |
| A7  | Instructor-led 4-, 6- and 8-week programs                                                 | Later                 | 11                            | L1, L3, F1, C1    | Foundation (program structure and a sample 4-week outline, Batch C; instructor-led programs need signed agreements) |
| A8  | Dance Party Mode with workout playlists                                                   | Later                 | 11                            | L2 (music rights) | Not started                                                                                                         |
| A9  | Travel and Busy-Day workout adaptations                                                   | V1                    | 5                             | F1                | Implemented locally (Busy-Day and Travel plan modes, Batch D)                                                       |
| A10 | Accessible, low-impact alternatives                                                       | V1                    | 3                             | F1                | Implemented locally (a low-impact version of every block, Batch C)                                                  |
| A11 | Licensed music and video content                                                          | V1                    | 3                             | L1, L2            | Foundation (licence register, territorial clearance and publish gates, Batch C; nothing is licensed)                |
| A12 | Warm-ups, recovery guidance, exercise-safety screening                                    | V1                    | 2-3                           | F1                | Implemented locally (warm-up, cool-down and safety notes required; readiness screening, Batches A and C)            |

### B. AI Nutrition

| ID  | Feature                                                                                                  | Ver.                    | Phase | Gates                        | Status                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------- | ----- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | AI Camera Calorie Counter (estimates, always labeled and editable)                                       | V1                      | 4     | N1, N2, P2, A1g              | Implemented locally (Batch B; simulated recognition, not real AI)                                                                             |
| B2  | Multiple-food recognition from one photo                                                                 | V1                      | 4     | N2                           | Implemented locally (Batch B; simulated recognition, not real AI)                                                                             |
| B3  | Estimated calories and macronutrients, grounded in reference data                                        | V1                      | 4     | N1, N2                       | Implemented locally (Batch B; values come from SYNTHETIC reference data)                                                                      |
| B4  | Editable food identification, ingredients and portions                                                   | V1                      | 4     | N2                           | Implemented locally (Batch B)                                                                                                                 |
| B5  | Manual food logging                                                                                      | V1                      | 4     | P1                           | Implemented locally (Batch B)                                                                                                                 |
| B6  | Packaged-food barcode scanner                                                                            | V1                      | 4     | N1 (Open Food Facts licence) | Not started                                                                                                                                   |
| B7  | Personalized meal planning                                                                               | V1                      | 4-5   | N1, N3                       | Foundation (rule-based plan builder and saved plans, Batch B; not AI)                                                                         |
| B8  | AI Food Swap                                                                                             | V1                      | 5     | N3                           | Implemented locally (Batch B; rule-based, no AI)                                                                                              |
| B9  | AI Fridge-to-Meal (photo or typed ingredients)                                                           | V1.5                    | 5     | N2, N3                       | Not started                                                                                                                                   |
| B10 | Cultural meal intelligence (African, Caribbean, American, Latin American, Indian, Mediterranean, others) | V1 (starter set), grows | 4+    | N1, N3                       | Foundation (regional tags on sample foods, Batch B; starter set is synthetic)                                                                 |
| B11 | Budget-based meal planning                                                                               | Later                   | 9     | N3                           | Foundation (budget levels in meal plans, Batch B)                                                                                             |
| B12 | Smart Grocery Assistant, grocery lists, pantry management                                                | Later                   | 9     | none                         | Partially implemented locally (shopping list built from a saved meal plan, tick-off and share; pantry and shared household lists not started) |
| B13 | Meal substitutions and recipes                                                                           | V1                      | 4     | N3                           | Not started                                                                                                                                   |
| B14 | Eat Out Smart restaurant menu assistance                                                                 | Later                   | 9     | N2                           | Not started                                                                                                                                   |
| B15 | Frequently eaten meals and saved recipes                                                                 | V1                      | 4     | P1                           | Implemented locally (saved meals, Batch B)                                                                                                    |
| B16 | Optional voice-based food-log corrections                                                                | Later                   | 12    | P2, A1g                      | Not started                                                                                                                                   |

**Accuracy rule (B1-B4):** a photograph cannot reliably reveal exact calories, ingredient quantities, hidden oils or portion weights. Every AI-derived value is shown as a range with a confidence level,
labeled "Estimate", editable, and grounded in nutrition reference data. See [NUTRITION_SAFETY.md](NUTRITION_SAFETY.md).

### C. AI Fit Concierge

One unified assistant over the person's approved fitness, nutrition, goals and lifestyle data. No disconnected per-feature assistants.

| ID  | Feature                                           | Ver.  | Phase | Gates       | Status                                                                                |
| --- | ------------------------------------------------- | ----- | ----- | ----------- | ------------------------------------------------------------------------------------- |
| C1  | Personalized conversational coaching              | V1    | 5     | S1, P2, A1g | Implemented locally (Batch D; simulated coach, not live AI)                           |
| C2  | Daily Fit Plan adjustments                        | V1    | 5     | S1          | Implemented locally (rule-based Daily Fit Plan plus confirmed coach changes, Batch D) |
| C3  | Workout recommendations                           | V1    | 5     | F1          | Implemented locally (Batch D; simulated coach, not live AI)                           |
| C4  | Meal planning and substitutions                   | V1    | 5     | N3          | Foundation (coach-proposed food swaps added to the plan after confirmation, Batch D)  |
| C5  | Lifestyle and habit guidance                      | V1    | 5     | S1          | Implemented locally (habit ideas in the plan, Batch D)                                |
| C6  | Weekly progress reviews                           | V1    | 5     | S1          | Implemented locally (Batch D; simulated coach, not live AI)                           |
| C7  | Comeback Plan after missed activity               | V1    | 5     | S1          | Implemented locally (detection, gentle 3-session return, Batch D)                     |
| C8  | Travel and Busy-Day Mode                          | V1.5  | 5     | F1          | Implemented locally (Busy-Day and Travel plan modes, Batch D)                         |
| C9  | Voice coaching                                    | Later | 12    | P2, A1g     | Not started                                                                           |
| C10 | Context-aware suggestions                         | V1    | 5     | P2          | Implemented locally (consent-gated, minimal context, Batch D)                         |
| C11 | User-confirmed changes to saved plans and records | V1    | 5     | none        | Implemented locally (nothing changes until confirmed, Batch D)                        |
| C12 | Transparent recommendations ("because...")        | V1    | 5     | none        | Implemented locally ("Why this?" and "What I used", Batch D)                          |
| C13 | Safe, non-judgmental communication                | V1    | 5     | S1          | Implemented locally (provisional safeguards, unreviewed, Batch D)                     |

### D. Weight Management and Progress

| ID  | Feature                                            | Ver.  | Phase | Gates            | Status                                                                                                                                                                                              |
| --- | -------------------------------------------------- | ----- | ----- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Optional weight-loss and weight-maintenance goals  | V1    | 2     | N3, S1           | Implemented locally (Batch A; mock data, not live)                                                                                                                                                  |
| D2  | Weekly, monthly and yearly weight goals            | V1    | 2     | N3, S1           | Implemented locally (Batch A; mock data, not live)                                                                                                                                                  |
| D3  | Imperial or metric measurements chosen by the user | V1    | 2     | none             | Implemented locally (Batch A; mock data, not live)                                                                                                                                                  |
| D4  | Weight history and trends                          | V1    | 2     | P1               | Implemented locally (Batch A; mock data, not live)                                                                                                                                                  |
| D5  | Activity progress                                  | V1    | 3     | P1               | Implemented locally (weekly activity totals, Batch C)                                                                                                                                               |
| D6  | Habit tracking                                     | V1    | 2-3   | P1               | Implemented locally (derived weekly view plus up to 5 personal habits ticked per day, archive not delete, no streaks; migration 20261207000100 is committed but not yet applied to the dev project) |
| D7  | Weekly AI progress reviews                         | V1    | 5     | S1               | Implemented locally (Batch D; simulated coach, not live AI)                                                                                                                                         |
| D8  | Optional weight projections with uncertainty       | V1.5  | 5     | N3, S1           | Not started                                                                                                                                                                                         |
| D9  | Non-scale achievements                             | V1    | 3     | none             | Implemented locally (11 cumulative, never-lost milestones derived from activity; none involve body weight)                                                                                          |
| D10 | Private milestone celebrations                     | V1    | 3     | none             | Implemented locally (private celebration card with haptic, on-device only; never shared)                                                                                                            |
| D11 | Flexible goal adjustment                           | V1    | 2     | S1               | Implemented locally (Batch A; mock data, not live)                                                                                                                                                  |
| D12 | Optional supported health-platform integration     | Later | 9     | P2, store review | Not started                                                                                                                                                                                         |

Weight goals must not encourage extreme restriction, guaranteed results or unsafe exercise. See [NUTRITION_SAFETY.md](NUTRITION_SAFETY.md) and [FITNESS_SAFETY.md](FITNESS_SAFETY.md).

### E. Community and Growth

| ID  | Feature                                | Ver.                                  | Phase | Gates             | Status                                                                                                                                                           |
| --- | -------------------------------------- | ------------------------------------- | ----- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Free 7-, 14- and 30-day Fit Challenges | Later                                 | 8     | M1                | Partially implemented locally (free solo 7/14/30-day challenge with rest-day cap, new table with RLS; friends, teams and rankings blocked on moderation gate M1) |
| E2  | Dance Buddies                          | Later                                 | 8     | M1, P3            | Not started                                                                                                                                                      |
| E3  | Private teams and team activity goals  | Later                                 | 8     | M1, P3            | Not started                                                                                                                                                      |
| E4  | Invitations and referral links         | Later                                 | 8     | P3                | Not started                                                                                                                                                      |
| E5  | Dance-to-Share clips                   | Later                                 | 8     | M1, M2, L3        | Not started                                                                                                                                                      |
| E6  | Personal Milestone Stories             | Later                                 | 8     | P3                | Not started                                                                                                                                                      |
| E7  | Community Milestone Events             | Later                                 | 11    | M1, C1            | Not started                                                                                                                                                      |
| E8  | Optional sponsored challenges          | Later                                 | 11    | legal review (C2) | Not started                                                                                                                                                      |
| E9  | Privacy-preserving achievement sharing | Later                                 | 8     | P3                | Not started                                                                                                                                                      |
| E10 | Reporting, blocking and moderation     | Later (required before any E feature) | 8     | M1                | Foundation (moderation role and admin area prepared)                                                                                                             |

### F. Family and Household

| ID  | Feature                                               | Ver.  | Phase | Gates                 | Status                                                                                                                                                                   |
| --- | ----------------------------------------------------- | ----- | ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1x | Family and couple fitness                             | Later | 10    | P3, H1                | Not started                                                                                                                                                              |
| F2x | Household meal planning                               | Later | 10    | P3, H1                | Not started                                                                                                                                                              |
| F3x | Shared grocery lists                                  | Later | 9-10  | H1                    | Partially implemented locally (grocery list scales to how many people you cook for, stored on the device; no shared accounts, so real shared lists are blocked on H1/P3) |
| F4x | Household challenges                                  | Later | 10    | M1, H1                | Not started                                                                                                                                                              |
| F5x | Individual private health profiles inside a household | Later | 10    | P3, H1                | Not started                                                                                                                                                              |
| F6x | Explicit permissions for shared information           | Later | 10    | P3, H1                | Not started                                                                                                                                                              |
| F7x | Household Pro subscription concept                    | Later | 10    | B1s, pricing decision | Not started                                                                                                                                                              |

Individual weight, food and health records stay private unless explicitly shared, per category and per person, and sharing can be withdrawn.

### G. Monetization and Operations

| ID  | Feature                                                              | Ver.  | Phase | Gates    | Status                                                                                                                        |
| --- | -------------------------------------------------------------------- | ----- | ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| G1  | Free tier                                                            | V1    | 6     | none     | Foundation (tier model)                                                                                                       |
| G2  | Pro subscription (test price USD $9.99/month)                        | V1    | 6     | B1s, B2s | Foundation (entitlement interfaces)                                                                                           |
| G3  | Subscription entitlements (server-written)                           | V1    | 6     | B1s      | Foundation (types, expiry logic, tests)                                                                                       |
| G4  | Usage-based AI allowances                                            | V1    | 5-6   | none     | Implemented locally (metered through the gateway; atomic database quota and budget functions with concurrency tests, Batch D) |
| G5  | Future Household Pro                                                 | Later | 10    | B1s      | Foundation (tier reserved)                                                                                                    |
| G6  | Admin portal                                                         | V1    | 6     | none     | Foundation (Next.js shell, sections, permissions)                                                                             |
| G7  | Content and licensing management                                     | V1    | 3     | none     | Foundation (licensing records, publish gates and admin views, Batch C)                                                        |
| G8  | Fitness and nutrition review workflows                               | V1    | 3-4   | none     | Foundation (independent fitness review records, Batch C)                                                                      |
| G9  | User support                                                         | V1    | 6     | P2       | Foundation (support role: account state only)                                                                                 |
| G10 | Moderation                                                           | Later | 8     | M1       | Foundation (role and area)                                                                                                    |
| G11 | Feature flags                                                        | V1    | 1     | none     | Foundation (AI kill switches in the database with staff-only, audited changes, Batch D)                                       |
| G12 | Privacy and consent management                                       | V1    | 1-2   | P1, P2   | Foundation; consent capture and withdrawal implemented locally (Batch A)                                                      |
| G13 | Subscription and retention analytics (privacy-preserving, aggregate) | V1.5  | 7     | P2       | Not started                                                                                                                   |
| G14 | AI cost tracking and alerts                                          | V1    | 5     | none     | Foundation (usage events, atomic budget reservation; alert delivery not built, Batch D)                                       |

## 4. Validation gates

Each gate is a condition a named person must record as satisfied. None has been satisfied in Phase 0B.

| Gate    | Condition                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1      | Health data private by default: RLS enabled on every table, owner-only policies, structural RLS test passing.                                                                          |
| P2      | Explicit, purpose-specific consent for sensitive processing (including AI processing) recorded and withdrawable; privacy notice reviewed by qualified counsel for each launch country. |
| P3      | Sharing controls (per category, per person, revocable) implemented and tested.                                                                                                         |
| S1      | Safety rules reviewed and replaced or confirmed by a registered dietitian or qualified clinician; evals passing.                                                                       |
| F1      | Fitness programming reviewed by a certified fitness professional; low-impact alternative exists for each routine.                                                                      |
| N1      | Nutrition data licences confirmed (USDA FoodData Central terms; Open Food Facts ODbL attribution and share-alike obligations understood).                                              |
| N2      | Photo-estimate accuracy measured on a labeled test set; estimates ranged, labeled and editable.                                                                                        |
| N3      | Nutrition guidance templates reviewed by a registered dietitian.                                                                                                                       |
| L1      | Workout video rights (shoot, performer releases, instructor agreements) cleared in writing, by territory.                                                                              |
| L2      | Music rights (composition and recording, or commissioned/royalty-free with written terms) cleared, by territory.                                                                       |
| L3      | Instructor and participant likeness and user-clip licence terms cleared.                                                                                                               |
| M1      | Reporting, blocking, moderation queue, escalation and takedown process operating.                                                                                                      |
| M2      | Clip scanning and review process for user-shared media.                                                                                                                                |
| H1      | Household privacy model reviewed (including safety scenarios such as coercive control).                                                                                                |
| B1s     | App Store / Google Play subscription configuration, receipts and restore flows tested in each store's sandbox.                                                                         |
| B2s     | Country-by-country billing, tax and pricing eligibility reviewed.                                                                                                                      |
| A1g     | Owner approves paid AI use; provider-side spend limit configured; gateway budget and kill switches verified.                                                                           |
| C1 / C2 | Community-event and sponsorship legal terms reviewed by qualified counsel.                                                                                                             |

## 5. Global readiness

No country is enabled by default. A country needs all activation gates recorded (see [GLOBAL_READINESS.md](GLOBAL_READINESS.md)).

## 6. Non-goals and constraints

- No original dance pose-estimation prototype.
- No real-money staking or financial commitment of any kind.
- No claims of clinical efficacy, diagnosis or treatment; no guaranteed outcomes.
- No public user-generated content before the moderation gates (M1, M2).

## 7. Outstanding product decisions

See "Open decisions" in [DECISIONS.md](DECISIONS.md).
