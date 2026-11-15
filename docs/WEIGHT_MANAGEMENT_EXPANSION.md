# Weight Management Expansion: audit, design and plan

Status: **proposal for owner approval. Nothing in this document has been implemented, migrated, deployed or activated.** No hosted change, no new migration, no paid AI, no build.
Audit date: 2026-11-15, against `integration/live-prep` (commit `490c66a` plus the open PR for auth refresh, photo upload and the household trigger revoke).
Hosted facts were read **read-only** from project `vvwjhbsyxetnktimgaxg`. Nothing was verified on a native iOS device, and no HTTP or Storage live suite has been run.

> All health thresholds, screening wording and content in this plan are **provisional until a registered dietitian and a clinician review them** (existing gates S1, N3, F1). No clinical approval is claimed anywhere here.

---

## A. Audit and gap analysis

### A.0 Baseline facts (verified)

| Item          | Finding                                                                                                                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted schema | **13 applied migrations, 48 `public` tables, RLS enabled on all 48** (read-only check). Matches the repository's 13 feature migrations. Seed data on hosted: 50 foods, 14 workouts, 1 program, 1 instructor.                                                      |
| Repo records  | `supabase/hosted-history.json` still lists **8 applied / 5 pending**. It is stale and should be corrected after approval (a record-keeping change, not a database change).                                                                                        |
| Stale docs    | `docs/INTEGRATION_STATUS.md` still says "no hosted project exists". It predates the project. Needs a refresh.                                                                                                                                                     |
| Navigation    | 5 tabs: Today, Dance, Food, Coach, Me. 29 route files. Secondary screens: goals, progress, challenges, privacy, food (add, camera, review, history, plan, saved, swap, household), dance (detail, session, program, schedule, history), coach (review, settings). |
| AI            | Rules-based simulated coach and weekly review. Server route exists but is **not deployed**; no provider key; paid AI is off. Photo recognition is simulated.                                                                                                      |

### A.1 Feature status

| Area                               | Status                                                      | Evidence and notes                                                                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth, consent, onboarding          | **Implemented** (hosted auth untested end-to-end on device) | 6-step onboarding, append-only consent history, 5 consent purposes, adults 18+, PAR-Q-style readiness screening that defaults to low impact when any answer is "yes" **or missing**.                                            |
| Goals, weight, safety rules        | **Implemented, provisional limits**                         | lose/maintain/gain, pace capped at 1%/week (default 0.5%), min target BMI 18.5, deficit capped at 20% of maintenance, personal floor from resting energy. Not reviewed by a professional.                                       |
| Food logging                       | **Implemented**                                             | Diary, saved meals, swaps (modes adapt when numbers are hidden), no-shame language, estimate labelling, region-aware ordering.                                                                                                  |
| Meal plans, groceries, household   | **Implemented**                                             | Plan generator, grocery list, households (invite, join, shared list, join-attempt limit). Housemates never see health data (DB-tested).                                                                                         |
| Photo food logging                 | **Partial / simulated**                                     | UI complete; recognition simulated; upload adapter now written (open PR) but only offered when an AI gateway URL exists. No analysis service.                                                                                   |
| Dance catalog, Quick Fit, sessions | **Implemented, sample content**                             | 14 text-only sample workouts, 1 program (12 sessions), guided timing engine, licensing gates for media. **Content is unreviewed (gate F1).**                                                                                    |
| Strength                           | **Partial: logging only**                                   | `strength.ts` is a content _contract_ and ships **no exercises** by design; only self-logged strength entries exist.                                                                                                            |
| Walking / movement                 | **Partial**                                                 | Manual walk logs (distance optional), daily and weekly movement goals, celebrations. **No step data**: HealthKit is intentionally not integrated (`health_platform_sync` consent exists, unused).                               |
| Habits                             | **Implemented**                                             | Up to 5 habits, weekly counts, **no streak language**.                                                                                                                                                                          |
| Wellness logs                      | **Implemented**                                             | hydration, sleep, walk, strength, measurement, hunger, recovery; optional preferences (goal intent lose/maintain/fitness, activities, equipment, diet flags, tracking detailed/light/none, eating-concern and pregnancy flags). |
| Hide numbers                       | **Implemented**                                             | `numbersHidden` hides calories, nutrients and weight when tracking is "none", or an eating concern or pregnancy/postpartum is shared. Honoured by food UI, coach and weekly review.                                             |
| Pulse celebrations                 | **Implemented**                                             | Computed only from goals the person set; **never celebrates weight, calories or measurements**; claim-once ledger (`celebrations`); gentle/full/off levels.                                                                     |
| Daily Fit Plan                     | **Implemented**                                             | Modes normal/busy/travel/comeback; reads real logs; explains itself. This is the natural host for the engine's output.                                                                                                          |
| Coach and weekly review            | **Simulated, rules-based**                                  | Safeguards in code before any billable call: self-harm, disordered eating, extreme loss, under-1,000 kcal, symptoms, minors. **Currently refuses all fasting requests** (see conflict below).                                   |
| Challenges                         | **Implemented**                                             | One active, rest days built in, personal pace.                                                                                                                                                                                  |
| Privacy export and deletion        | **Implemented** (deletion job not deployed)                 | Export of own data; 30-day cancellable request.                                                                                                                                                                                 |
| Admin app                          | **Shell**                                                   | Sections and readiness checks; not exercised in a browser here.                                                                                                                                                                 |
| Reminders / notifications          | **Missing**                                                 | No notification library installed, no permission string, no scheduling code.                                                                                                                                                    |
| Fasting                            | **Missing, and currently blocked by policy**                | Only appears as a refused topic (coach-safety, NUTRITION_SAFETY).                                                                                                                                                               |
| Evidence labelling                 | **Missing**                                                 | No content model for evidence level, sources, reviewer or review date for health guidance.                                                                                                                                      |

### A.2 Content gaps that matter for the brand and the 12 pathways

1. **No Dancehall or reggae workouts exist.** Styles are afrobeats, amapiano, hip_hop, latin, bollywood, low_impact. The `workouts.style` column has a **database check constraint** that excludes `dancehall` and `reggae`, so adding them needs a migration (approval) and, more importantly, real choreography written or reviewed by qualified, rights-cleared people. This is the largest brand gap.
2. **Food reference data is 50 synthetic, unreviewed items.** Region tags: west_african 8, caribbean 8, mediterranean 6, south_asian 6, asian 2, latin_american 2, american 2, global 31. Only 10 mixed dishes. No East African, Southern African, North African, Middle Eastern or Southeast Asian coverage. No recipes, cooking methods or culture-specific portions.
3. **Strength has no guided content** (by design, until a qualified professional authors it).
4. **No chair-dance or seated option** and no mobility-needs capture. Low impact exists (3 workouts) but is a single flag.
5. **No sleep-hygiene, stress or behavioural-coaching content**, and no stress or mood log kind.
6. **No budget input** (only a per-food `costTier`), no batch-cooking guidance.
7. **No maintenance phase**: `maintain` goals exist and the coach has a plateau reply, but no transition from loss to maintenance and no relapse-prevention content.
8. **Nothing for clinician-directed treatment** (medication or surgery).

### A.3 Reuse inventory (do not rebuild)

| Existing asset                                                            | Reuse for                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `wellness_prefs.data` (JSON, 2 KB cap, RLS, consent-gated) + `parsePrefs` | The preference model (extend, do not replace). Cap may be too small; see F.                  |
| `numbersHidden` and `useNumbersHidden`                                    | The single rule for hiding numbers. Extend, never fork.                                      |
| `generateDailyPlan` + `PlanMode`                                          | Engine output host: pathways bias what the plan suggests and explain why.                    |
| `nutritionTargets` (returns `reasons[]`, `seeProfessional`, ranges)       | Explainability pattern for every engine recommendation.                                      |
| `evaluateReadiness` (missing answers are cautious)                        | Template for fasting screening (missing answers = not cleared).                              |
| `coach-safety.ts` pre/post screens                                        | Extended with fasting and medical-companion rules, not replaced.                             |
| `instruction-media.ts` `ReviewStatus` and `strength.ts` reviewer gate     | Pattern for a **content review gate** on all new health guidance.                            |
| `habits`, `habit_checkins`, `fit_challenges`, `celebrations`              | Consistency, non-scale wins, Pulse. Add celebration kinds in code (no schema change, see F). |
| `foods.regionTags`, `costTier`, swap modes, grocery, household            | Cultural and budget pathways. Needs data, not new machinery.                                 |
| `feature_flags`                                                           | Switch each pathway on or off server-side and as an emergency stop.                          |
| `content_reviews`, `licences`, `media_assets`                             | Workout content review and licensing (dance content). Not suited to text guidance; see F.    |

### A.4 Consolidation opportunities (fewer screens, not more)

- **"Your focus" in Goals already holds preferences.** Grow it into one **"My approach"** screen (reached from Me and from Today) instead of a new onboarding app. It is the single place to change pathways, tracking style, fasting and medical-companion settings.
- **No 6th tab.** Pathways live inside Today (plan), Dance, Food, Coach and Me.
- **Fasting is one screen** under Food (plus a small Today card when enabled), not a section of its own.
- **Education is a content card type** shown in context (Food, Dance, Coach, review), not a library screen. A single "Learn" list can sit under Me if wanted later.
- Evidence badges are one component reused everywhere.

### A.5 Privacy, accessibility, medical-safety and security concerns found

| Concern                                                                                                                      | Severity      | Note                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Existing policy forbids fasting features.** `coach-safety`, `NUTRITION_SAFETY`, and prompts say "never prescribe fasting". | High (design) | Needs an explicit, reviewed policy change: the app may offer an _educational scheduler_ for three windows; it must still refuse fasting _prescriptions_, extended fasting and "fast to lose X kg" requests. Decision D3. |
| Fasting, medication and surgery data are special-category health data.                                                       | High          | Store the minimum. Prefer outcome-only storage (cleared / refer) and **no screening answers at rest**. Export and deletion must include it.                                                                              |
| Screening must not infer eligibility from silence.                                                                           | High          | Reuse the "unanswered = not cleared" rule; test it.                                                                                                                                                                      |
| Disordered-eating risk: fasting, calorie visibility and weight tracking can harm.                                            | High          | Hide-numbers default for anyone sharing an eating concern; fasting hard-blocked for that flag; no fasting duration metrics anywhere; coach risk screen already in place but keyword-only (a floor).                      |
| Medical companion could be read as dosing or treatment advice.                                                               | High          | Strict non-diagnostic allowlist, fixed templates, no AI free text on medication topics; clinician review before activation (D8).                                                                                         |
| Notifications can be pushy or leak health info on a lock screen.                                                             | Medium        | Neutral wording ("Your window opens"), no weight or calorie content, off by default, quiet hours, one-tap stop.                                                                                                          |
| Local notifications need a native dependency and an iOS permission string.                                                   | Medium        | Needs a native build; cannot be verified without a device.                                                                                                                                                               |
| Reduced motion exists; animation for new surfaces must respect it.                                                           | Medium        | `useReducedMotion` already present; every new animation uses it. Colour is never the only signal (existing rule).                                                                                                        |
| Screen-reader labels for rings and timelines (eating window, progress).                                                      | Medium        | Provide text equivalents; include in the existing accessibility sweep.                                                                                                                                                   |
| Cultural content could stereotype or label foods.                                                                            | Medium        | Region reviewers, "no good/bad foods" language already enforced; add a cultural-review gate.                                                                                                                             |
| Supabase security advisors, trigger-function execute grants.                                                                 | Low           | Addressed for `household_after_member_delete` in the open PR; every new SECURITY DEFINER function must pass the pinned allowlist test.                                                                                   |
| Repository records out of date (`hosted-history.json`, `INTEGRATION_STATUS`).                                                | Low           | Correct on approval.                                                                                                                                                                                                     |

---

## B. Unified Weight Management Engine

### B.1 Principle

One **pure, deterministic, explainable rules module** in `packages/shared` (so the app, the server route and tests share it, exactly like the safety rules today). It does not call AI. It turns the person's preferences and recent logs into:

1. a set of **active pathways** (each with a plain-language reason, editable),
2. **plan biases** consumed by the existing `generateDailyPlan`, meal planner, swaps, challenges and coach context,
3. **content cards** (education) filtered by pathway, evidence level and review status,
4. **progress lenses** (which indicators to show, which to hide).

Pathways are **tags and rules**, not products, tabs or subscriptions.

```
 Preferences (My approach)      Logs (existing tables)       Safety rules (code)
   goalIntent, activities,        sessions, food, walks,       readiness, fasting screen,
   cultural foods, budget,        sleep, hunger, weight,       eating-concern, pregnancy,
   tracking style, fasting        habits, wellness             medical-companion allowlist
        │                              │                              │
        └──────────────┬───────────────┴───────────────┬──────────────┘
                       ▼                               ▼
              ┌───────────────────────────────────────────────┐
              │  Pathway Engine  (packages/shared/pathways)   │
              │  resolvePathways() → [{id, why[], editable}]  │
              │  planBias()  contentFor()  progressLens()     │
              └───────────────┬───────────────────────────────┘
        ┌─────────┬───────────┼───────────┬─────────────┬──────────────┐
        ▼         ▼           ▼           ▼             ▼              ▼
   Daily Fit   Dance tab   Food tab   Habits &      Pulse /        Coach &
   Plan        (programs,  (plans,    wellness     celebrations   weekly review
               Quick Fit)  swaps,     logs         (existing)     (context only)
                           fasting)
```

### B.2 Engine contract (design, not code)

- `resolvePathways(prefs, safety, recent)` returns pathways ordered by relevance. Each result carries `id`, `reasons[]` (shown to the person, like `nutritionTargets().reasons`), `source: 'chosen' | 'suggested'`, and `blockedBy?` (for example fasting blocked by an eating concern, never hidden silently).
- **Suggested vs chosen:** the engine may _suggest_ a pathway from stated needs (for example mobility limits suggest Low-Impact). The person always confirms. Nothing activates silently, and nothing is inferred from health data they did not volunteer.
- `planBias()` returns weights and filters, not plans. It never produces a calorie number by itself; calorie numbers still come only from `nutritionTargets` and are hidden by `numbersHidden`.
- `progressLens()` selects which indicators appear: consistency, strength, stamina, walking, nutrition habits, sleep/energy, optional weight trend, non-scale wins, maintenance. Weight, calorie and measurement lenses are **off unless the person turns them on**, and always off when `numbersHidden`.
- All rules carry `rulesStatus: provisional` until reviewed, and every output carries the reasons that produced it. No rule uses a hidden score.
- A weight-neutral path is first-class: `goalIntent: fitness` (already supported) means no weight target is ever requested, and weight is not a default surface.

### B.3 How each pathway maps onto existing machinery

| #   | Pathway                             | Built from (existing)                                                        | New content / logic needed                                                                                              | New screens          |
| --- | ----------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Dance & Burn                        | Dance tab, 14 workouts, program, session engine, intensity and impact fields | Dancehall and reggae choreography (rights and review), progression rules across levels, intensity picker in plan        | 0                    |
| 2   | Smart Nutrition                     | Diary, targets with protein range, fiber per food, plans, swaps              | Protein and fiber education cards, plate-balance guidance, fiber target (provisional)                                   | 0                    |
| 3   | Gentle Intermittent Fasting         | Food tab, Today card pattern, `coach-safety`, readiness pattern              | Screening, three fixed schedules, window display, reminders, pause/skip/stop, policy change (see D3)                    | **1**                |
| 4   | Strength & Shape                    | Strength logging, `strength.ts` content contract and review gate             | Professionally authored routines, progression rules, body-composition education                                         | 0 to 1               |
| 5   | Everyday Movement                   | Walk logs, movement goals, celebrations, challenges                          | Step goals only after health-platform sync (later); gentle activity goals by pace                                       | 0                    |
| 6   | Healthy Habits                      | Habits, sleep, recovery, hunger logs, daily plan                             | Stress/wind-down log kind, sleep and stress education cards, behavioural prompts                                        | 0                    |
| 7   | Cultural & Traditional Eating       | `regionTags`, region-aware swaps and plans, dietary flags                    | Reviewed food data by cuisine, recipes (later), cooking methods, culturally relevant portions                           | 0                    |
| 8   | Mindful Eating                      | `hunger` log, no-shame language, hide-numbers                                | Hunger and fullness scale prompts, emotional-eating education, reflection prompts (no scoring)                          | 0                    |
| 9   | Low-Impact Fitness                  | `low_impact` workouts, readiness default, impact flag                        | Chair/seated flag and workouts, mobility capture, joint-friendly alternatives                                           | 0                    |
| 10  | Budget Nutrition                    | `costTier`, grocery list, household meals                                    | Budget preference, batch-cooking and affordable-swap rules                                                              | 0                    |
| 11  | Maintenance & Plateau               | `maintain` goals, plateau coach reply, weekly review                         | Loss-to-maintenance transition, normal-fluctuation education, relapse-prevention prompts                                | 0                    |
| 12  | Medical Weight-Management Companion | Privacy, export and deletion, consent history, coach screening               | Non-diagnostic education, appointment and question prep, protein/hydration/side-effect "talk to your clinician" content | 0 to 1 (later phase) |

**Net new screens for V1: one** (fasting). "My approach" is a re-use and growth of the existing Goals focus screen.

### B.4 Fasting design (summary; full rules in D)

- Schedules: **12:12, 14:10, 16:8 only.** Default suggestion is the least restrictive (12:12).
- Eligibility screen first; **missing answers mean not cleared**. A positive or missing answer offers a "talk to a clinician or dietitian" message, not a workaround.
- Eating window shown as a simple timeline with text equivalent. Local notifications are optional, neutral, with quiet hours, and each can be turned off in one tap.
- **Pause, skip, change or stop at any time. Ending early has no consequence, message or record.** There is no fast timer to "break", no completion count, no streak, no badge, no leaderboard.
- **Nothing about fasting duration is stored or computed.** The stored object is the chosen schedule, window start time, notification choice and eligibility outcome. Pulse never celebrates fasting.
- Education states plainly: fasting is not inherently better than a sustainable calorie deficit, and it is optional.
- Unsupported: OMAD, dry fasting, extended or alternate-day fasting, very-low-calorie windows. The coach keeps refusing these.

---

## C. User journeys and navigation

### C.1 Navigation (unchanged tabs)

| Where                | What the expansion adds                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Today**            | "Your plan today" is pathway-aware and explains why. One optional fasting-window card (only if enabled).              |
| **Dance**            | Style and intensity filters follow pathways (Dance & Burn, Low-Impact, Strength). Programs gain progression.          |
| **Food**             | Cultural filters, protein/fiber cards, budget swaps, mindful-eating prompt on review, fasting entry point.            |
| **Coach**            | Context-only updates; safeguards extended. Simulated until the owner approves the AI service.                         |
| **Me → My approach** | The one place to view and change pathways, tracking style, numbers visibility, fasting, medical companion, reminders. |

### C.2 Journeys

1. **New person, weight loss.** Onboarding (existing) → optional "Make it yours" step (skippable, 5 short questions) → suggested pathways with reasons (Dance & Burn, Smart Nutrition, Healthy Habits) → confirm or edit → Today shows a plan with "why this". Calorie visibility defaults to light; they can hide it.
2. **New person, weight-neutral fitness.** Chooses "Feel stronger and fitter". No weight prompt, no target, weight lens off. Plan emphasises consistency, strength, stamina. Pulse celebrates movement goals they set.
3. **Mobility limits or beginner.** Chooses low impact or seated; engine suggests Low-Impact Fitness; chair options first; readiness "yes or missing" already routes here.
4. **Culturally anchored eater on a budget, with a household.** Chooses cuisines and budget; swaps and plans favour familiar foods and cost tier; household grocery list reuses existing flow; no food is labelled good or bad.
5. **Curious about fasting.** My approach → Fasting → short education → screening → cleared: choose 12:12 (suggested) → optional reminders. Not cleared or unanswered: referral message and no fasting controls. Stopping at any time is one tap, no feedback.
6. **Eating-concern flag.** Numbers hidden, fasting unavailable (blocked, with a kind explanation), mindful-eating and habits emphasised, professional-support message, coach risk screen unchanged.
7. **Plateau or maintenance.** Weekly review recognises a plateau or goal reached; offers Maintenance pathway; shows normal fluctuation education; no pressure to lose more.
8. **Clinician-directed treatment (later phase).** My approach → "I'm working with a clinician" → education and question prep only. No dosing, no medication names in AI replies, a standing "your clinician decides" banner.

### C.3 Change-anytime rule

Every answer is editable in My approach, with no re-onboarding and no loss of history. Turning a pathway off removes its prompts, not the person's logs.

---

## D. Evidence and medical-safety requirements

### D.1 Evidence labels (one component, four levels)

| Label                                    | Meaning                                                                                        | Examples (to be confirmed by reviewers)                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Strong evidence**                      | Consistent findings from systematic reviews or major guidelines                                | Regular physical activity benefits; resistance training helps preserve muscle; sleep and health   |
| **Moderate or emerging**                 | Mixed or limited trials, short-term, or small populations                                      | Time-restricted eating: some trials show modest benefit, often similar to calorie reduction alone |
| **Traditional, limited evidence**        | Culturally important practices with little clinical testing; shown with respect, not as claims | Some traditional foods and preparation methods                                                    |
| **Not supported or potentially harmful** | Claims the app will not endorse and will explain                                               | Detox and cleanse claims, "fat-burning" supplements, crash diets, extended or dry fasting         |

Rules: no content ships without a label; "strong" requires named sources; labels can only be changed by a reviewer, never by code paths or AI.

### D.2 Sources to build from (reviewers confirm current editions before use)

WHO physical-activity and healthy-diet guidance; CDC and NHS adult activity and weight guidance; the Dietary Guidelines for Americans; NICE obesity guidance; ACSM position stands; Cochrane reviews on intermittent fasting and weight; the American Diabetes Association standards of care (for the fasting and medication exclusions); national dietary guidelines and food-composition tables for each cuisine (USDA FoodData Central, FAO/INFOODS regional tables, with licence checks). Each content item stores its source list and review date; sources are reconfirmed on a schedule.

### D.3 Fasting safety rules (provisional, for clinician review)

**Not offered (blocked, with a referral message) if the person indicates or leaves unanswered:**
pregnancy or trying to conceive; breastfeeding; current or past eating disorder or a concern about disordered eating; diabetes treated with insulin or sulfonylureas or any medication that can cause low blood sugar; age under 18 (already blocked app-wide); underweight BMI (below 18.5) or a recent unintentional weight loss they are worried about; a medical condition or medication where a clinician has advised regular meals or timing; "other reason to be careful".
**Never inferred from missing information:** an unanswered question means not cleared.
**Also advisable (reviewer to decide):** older adults, kidney disease, gout, a history of fainting, shift work with irregular sleep. Wording must not diagnose.
**While active:** show hydration reminders (optional); if the person reports dizziness, feeling faint or unwell, show a stop-and-seek-help message and offer to pause. Any mention of fasting longer than the three schedules in coach text is refused with the existing fixed response.
**Policy change required:** `NUTRITION_SAFETY.md`, `coach-safety.ts` and the prompt currently refuse fasting entirely. The change is narrow: scheduling and education for three windows becomes permitted; prescriptions, extended fasting, "fast to lose X", and any fasting advice to a flagged person stay refused. Tests must pin both sides.

### D.4 Medical weight-management companion (rules)

Allowed: general education about what clinician-directed treatment can involve, protein and hydration guidance in plain terms, questions to bring to appointments, a place to note appointments and how they feel, encouragement, and reminders to follow the clinician's instructions.
Never: name or recommend a medication or dose, adjust or suggest changing a dose, interpret symptoms, advise stopping or starting treatment, predict outcomes, or compare people's results. Side-effect content is limited to "contact your clinician" and a fixed urgent-care list. **No free-text AI on this pathway.** Content is fixed, reviewed templates. Activation needs clinician and legal review (D8 in section H).

### D.5 Language rules (extend the existing list)

No: detox, cleanse, miracle, "burn fat fast", "cheat day", "earn your food", "clean eating", "good or bad foods", "before and after", guaranteed outcomes, body shaming, fasting streaks or "longest fast". Yes: ranges, "may", "can help", "your pace", "no penalty". Every new string goes through the existing post-output filter and a copy test.

### D.6 Medical-content review checklist (gate before any new health guidance goes live)

- [ ] Content item has an owner, a stated purpose and a target pathway.
- [ ] Evidence level assigned; sources listed with year and link; sources reconfirmed.
- [ ] Reviewed by the right qualified person for the topic: registered dietitian (nutrition), clinician (fasting, medical companion), certified strength coach or physiotherapist (exercise), plus a cultural reviewer for cuisine content. The reviewer is **not** the author.
- [ ] No diagnosis, no dosing, no medication advice, no outcome promise, no guaranteed numbers.
- [ ] Numbers carry ranges and uncertainty; provisional values are labelled.
- [ ] Exclusions and referral wording present (pregnancy, breastfeeding, eating-disorder history, diabetes medication, under 18).
- [ ] Language checked against D.5 and the post-output filter; reading level and plain wording verified.
- [ ] Culturally respectful: no food labelled good or bad; no stereotype; foods described accurately.
- [ ] Accessibility: text equivalent for any chart or animation; reduced-motion path; labels read correctly in a screen reader.
- [ ] Country and licensing check; support resources verified for each activated country.
- [ ] Tests added or updated (rules, copy, safeguards); evals pass.
- [ ] Feature flag created, default **off**; rollback owner named.
- [ ] Reviewer name, role, evidence reference and date recorded (never personal data); next review date set.
- [ ] Owner approval recorded before the flag is turned on.

---

## E. Prioritised implementation roadmap

Each phase is independently shippable behind a feature flag (default off) and needs its own approval to start. Estimates are relative, not commitments.

### Phase 0: Foundations (no user-visible features)

Correct the stale records; adopt the engine skeleton and the **content review gate** (a code-level `reviewStatus`, as `instruction-media.ts` does); the evidence-label component; the fasting policy change drafted for review; confirm hosted facts. Decision D1 to D4 needed first.

### V1 essentials (the core of the expansion)

| #   | Item                                                                                                                                                                                                                         | Why V1                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | **Engine v1** (pure rules, explainable, tested) driving Today's plan and filters                                                                                                                                             | Coordinates everything that already exists         |
| 2   | **My approach** (grow Goals focus): optional assessment, pathway choice, tracking visibility, edit anytime                                                                                                                   | Personalisation and weight-neutral goals           |
| 3   | **Pathways that need no new content machinery**: Dance & Burn (existing styles), Smart Nutrition, Everyday Movement, Healthy Habits, Low-Impact, Maintenance and Plateau, Budget (from `costTier`), Mindful Eating (prompts) | Reuses what exists; mostly rules and reviewed copy |
| 4   | **Evidence labels and "why this" explanations** on every recommendation                                                                                                                                                      | Transparency requirement                           |
| 5   | **Hide-numbers made first-class** in My approach, applied to progress lenses                                                                                                                                                 | Safety and inclusivity                             |
| 6   | **Progress lenses** using existing logs and Pulse (consistency, walking, strength logs, sleep and energy, non-scale wins); no new celebration of weight                                                                      | Motivation without harm                            |
| 7   | **Reviewed starter content**: protein, fiber, plate balance, plateau, normal fluctuation, sleep, mindful-eating cards                                                                                                        | Needs dietitian review before activation           |

### V1.5 enhancements

| #   | Item                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | **Gentle Intermittent Fasting**: screening, three schedules, window card, optional local notifications, pause/skip/stop (needs D3, reminder dependency, a native build to verify, clinician review) |
| 9   | **Cultural & Traditional Eating**: expanded reviewed food data, region filters, cooking-method notes, portions (needs dietitian and cultural reviewers)                                             |
| 10  | **Dancehall and reggae** content and styles (needs rights, qualified choreography and one approved migration for the style constraint)                                                              |
| 11  | **Strength & Shape** guided routines (needs a qualified author and the existing strength gate)                                                                                                      |
| 12  | Chair/seated flag and mobility capture                                                                                                                                                              |
| 13  | Loss-to-maintenance transition flow and relapse-prevention prompts                                                                                                                                  |

### Later phases

14. **Medical Weight-Management Companion** (clinician and legal review; fixed-template content only; possible small storage).
15. Step-based goals through health-platform sync (owner decision, native work, privacy review).
16. Recipes and batch-cooking plans; barcode depth.
17. Instructor-led programs and richer progression (already in the roadmap as Phase 11).
18. AI personalisation of _wording only_, after the owner approves a provider and spending controls. The engine stays rules-based.

### What is intentionally not built

Fasting leaderboards, fasting badges or streaks, OMAD or extended fasting, weight-loss challenges between people, public weight sharing, supplement content, detox content, before-and-after imagery, and any AI-generated medical advice.

---

## F. Database changes requiring approval

**Nothing below has been created, applied or changed. No migration file has been written.** Hosted permissions are untouched. Each item is a separate migration to be approved individually. All are additive. None alter the 48 existing tables except where marked.

### F.0 What needs no database change (preferred)

- Pathway selection and most preferences: **stored in existing `wellness_prefs.data`** if they fit the 2 KB cap (see F.1).
- Pathway feature switches: existing `feature_flags` (adding rows is a data change, needs approval, but no schema change).
- Education content, evidence labels, review status, exclusions and rules: **versioned in code** (`packages/shared`), exactly like food and workout data. Review is gated in code and recorded in git history.
- ~~New celebration kinds are code only.~~ **Corrected 2026-11-15:** `celebrations.achievement_id` has a regex check that allows only the kinds water, habits, movement, movement_minutes and movement_weeks, so a new celebration kind needs a migration. V1 reuses the existing kinds (movement already counts dance, walking and strength).
- New foods: seed data through the existing generator and review flow, no schema change.
- Pulse never needs a fasting or weight kind.

### F.1 Migration M1: `pathway_preferences` (V1, only if the 2 KB cap is too small)

Purpose: hold the richer assessment answers (cuisines, budget band, mobility, schedule, calorie visibility, pathways chosen).
Design: one row per person: `user_id` primary key referencing `profiles` with cascade delete, `data jsonb` object check with a larger size cap (suggest 8 KB), `schema_version int`, `updated_at`. RLS on; select, insert, update and delete own row only; insert requires `health_data_processing` consent (same as `wellness_prefs`); no `anon` access; column-level grants like the existing table.
Alternative with no migration: raise nothing and keep answers minimal; or compress. I recommend M1 because mobility, cuisine and budget answers plus fasting choices will exceed 2 KB and I would rather not alter `wellness_prefs`' check constraint on a hosted table.
Privacy: included in export (privacy export extended in code) and deleted by cascade; covered by the existing owner-isolation test pattern (`99_owner_isolation`).
Compatibility: purely additive; no change to existing tables or functions.
Tests: RLS coverage, owner isolation, consent-gated insert, size cap, export and deletion.

### F.2 Migration M2: `fasting_plans` (V1.5)

Purpose: store the person's chosen schedule and eligibility outcome **only**.
Columns: `user_id` primary key (one row per person), `schedule text` check in (`'12:12'`, `'14:10'`, `'16:8'`), `window_start time` (local), `reminders boolean`, `status text` check in (`'active'`, `'paused'`, `'stopped'`), `paused_until date null`, `screening_outcome text` check in (`'cleared'`, `'not_cleared'`), `screening_version int`, `screened_at timestamptz`, `updated_at`.
Constraints: `status = 'active'` is only allowed when `screening_outcome = 'cleared'` (check constraint plus a trigger that also blocks activation when an eating concern or pregnancy flag is set in preferences).
**Deliberately absent:** screening answers, fast start/stop times, durations, completion counts, streaks. There is nothing to rank, badge or leaderboard.
RLS: own row only; insert and update require `health_data_processing`; no access for `anon`; no `SECURITY DEFINER` function needed.
Privacy: export and delete cascade; included in the owner-isolation test.
Tests: schedule check rejects 18:6, 20:4, 23:1 and other values; activation without a cleared outcome fails; cannot be read by another user; deleted with the account.

### F.3 Migration M3: widen `workouts.style` check (V1.5, needed for Dancehall and reggae)

The current check allows only afrobeats, amapiano, hip_hop, latin, bollywood, low_impact. Adding `dancehall` and `reggae` (and possibly `soca`, `dancehall_fitness`, `chair_dance`) means **replacing a check constraint on a hosted table**. It is data-compatible (it only widens) but it does touch an existing table and `workouts` has an immutability trigger on published content, so it needs care and approval. It must ship only with real, reviewed, rights-cleared content. The client enums in `workouts.ts` and the DB-contract test must change together.

### F.4 Migration M4: new consent purpose (only if wanted)

`consents.purpose` is constrained to five values. If a separate consent for the medical companion or for reminders is wanted (D9), the check constraint must be replaced (widened). Not needed for V1 or V1.5 if `health_data_processing` is judged sufficient. Recommend a separate purpose for the medical companion only.

### F.5 Later phase: medical companion storage

Preferred first step: **no server storage** (device-only appointment notes). If server storage is approved later, one minimal table (`user_id`, enrolled flag, category: medication or surgery or other, optional start date) with the strictest RLS, no free-text notes at rest unless explicitly approved, export and deletion included, and a clinician and legal review before it exists.

### F.6 Not needed

`evidence_items`, `content_pieces`, `pathway_catalogue`, `fasting_events`, `recipes` tables for V1 to V1.5. Content stays in code. A recipes table or an admin-editable content store can be proposed later if staff need to edit content without releases.

### F.7 Housekeeping that is not a schema change

Update `supabase/hosted-history.json` to the true 13 applied migrations (and then the revoke migration when approved), and refresh `docs/INTEGRATION_STATUS.md`. Requires only a repository change.

---

## G. Risks, dependencies and acceptance criteria

### G.1 Risks

| Risk                                                                    | Likelihood | Impact | Mitigation                                                                                                                                         |
| ----------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fasting harms someone vulnerable (eating disorder, diabetes medication) | Medium     | High   | Screening with missing = not cleared, hard blocks, no durations or badges, pause/stop everywhere, clinician review before launch, flag default off |
| Weight and calorie visibility harm some users                           | Medium     | High   | Weight-neutral default available, hide-numbers first-class, never celebrate weight, risk screen                                                    |
| Medical companion read as treatment advice                              | Medium     | High   | Fixed reviewed templates, no free-text AI, banner, legal and clinician review, later phase                                                         |
| Content unreviewed ships under pressure                                 | Medium     | High   | Code-level review gate, flag default off, checklist D.6, CI test that unreviewed items cannot be exposed                                           |
| Brand dilution into a generic diet app                                  | Medium     | High   | Dance-first rule: every pathway has a dance or movement expression; no new tab; copy and visual review                                             |
| Missing Dancehall and reggae content weakens the identity               | High       | Medium | Make it a V1.5 gate with owner decision D5 on who authors it and rights                                                                            |
| Scope creep (12 pathways at once)                                       | High       | Medium | Phased flags; pathways are rules, not screens                                                                                                      |
| Notifications feel pushy or leak data                                   | Medium     | Medium | Neutral wording, off by default, quiet hours, easy stop                                                                                            |
| Native work (notifications, any HealthKit) unverifiable here            | High       | Medium | State clearly; needs a device build and the owner's authorisation                                                                                  |
| Hosted drift from repository records                                    | Medium     | Medium | Correct `hosted-history.json`, add a check that compares against the hosted migration list when it can be run                                      |
| Cultural content stereotypes or inaccuracies                            | Medium     | Medium | Cultural reviewers, regional sources, "no good or bad foods" tests                                                                                 |

### G.2 Dependencies

Dietitian (nutrition and food data), clinician (fasting, medical companion, screening), certified strength coach or physiotherapist, cultural reviewers per cuisine, choreographers and rights holders (dancehall and reggae), legal and privacy counsel (special-category health data, per-country rules), the owner's decisions in section H, a native build and device for notifications and haptics checks, and, for AI wording later, an approved provider and spending limit.

### G.3 Acceptance criteria (summary; each phase adds detailed tests)

**Engine and My approach**

- All 12 pathways resolvable from preferences; each result includes human-readable reasons; a person can accept, edit or turn off each one.
- A weight-neutral user is never asked for a weight or shown a weight target by default.
- Turning off or changing a pathway removes its prompts but never deletes logs; no re-onboarding.
- `numbersHidden` hides calories, nutrients, weight and measurements on every new surface (tested per surface).
- No rule reads data the person did not volunteer; unanswered safety questions are never treated as "no".

**Fasting**

- Only 12:12, 14:10 and 16:8 can be selected, in the UI and in the database (check constraint test).
- Activation is impossible without a cleared screening outcome, and impossible with an eating-concern or pregnancy flag (UI, rules and DB tests).
- Stopping, skipping, pausing or changing is possible in one or two taps and produces no message implying failure; nothing records duration; no badge, streak or leaderboard code path exists (test searches the codebase and the celebration rules).
- Coach still refuses extended, dry and OMAD requests and "fast to lose X"; accepts schedule education questions only for cleared users.
- Notifications are off by default, have neutral text, respect quiet hours, and can be stopped in one tap.
- Education states that fasting is not inherently better than a sustainable deficit.

**Content and safety**

- Every health-guidance item has an evidence label, sources, a named reviewer role and review date; an unreviewed item cannot be rendered when its flag is on (test).
- Language filter passes for all new strings; a copy test blocks banned phrases.
- The medical companion contains no medication names, doses, symptom interpretation or outcome claims (test over all content and any generated text path).

**Experience**

- No new tab; at most one new screen in V1.5 (fasting); My approach reuses the Goals focus screen.
- Reduced motion respected on every new animation; every chart or timeline has a text equivalent; existing accessibility sweep passes for new routes in light and dark.
- Haptics only on meaningful moments (completion, saved choices), never on warnings that shame; never in `gentle` or `off` celebration levels.
- Existing 31 browser flows and all current tests still pass.

**Platform**

- No existing table altered unless item M3 is separately approved; every new table has RLS, owner-isolation and export/deletion tests; new SECURITY DEFINER functions (if any) pass the pinned allowlist test.
- No paid AI activated; no production or `main` change; no TestFlight; native behaviours are reported as **not verified** until run on a device.

---

## H. Decisions needed from you

| #   | Decision                                                                                                                                     | Recommendation                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Approve the engine approach (rules-based, explainable, pathways as tags not screens)?                                                        | Yes.                                                                                                                                      |
| D2  | Approve "My approach" as the growth of Goals focus, with no new tab?                                                                         | Yes.                                                                                                                                      |
| D3  | Allow a narrow change to the current no-fasting policy (educational scheduler for 12:12, 14:10, 16:8 only, with screening)?                  | Yes, **but only after clinician review**, and behind a flag default off. The coach must keep refusing prescriptions and extended fasting. |
| D4  | Scope of V1: items 1 to 7 above, or a smaller first slice (engine + My approach + three pathways)?                                           | Start with engine + My approach + Dance & Burn, Smart Nutrition, Low-Impact, Healthy Habits, then add the rest in order.                  |
| D5  | Dancehall and reggae content: who authors it, who owns rights, what timeline?                                                                | Treat as a V1.5 gate; commission qualified choreographers before any migration for the new styles.                                        |
| D6  | Can I propose migration M1 (`pathway_preferences`) and M2 (`fasting_plans`) for approval after you accept this plan?                         | Yes, as separate proposals with exact SQL and tests; nothing is applied until you approve each one.                                       |
| D7  | Which cuisines first for reviewed food data (the current set is West African, Caribbean, Mediterranean, South Asian, Asian, Latin American)? | West African and Caribbean first (core audience), then your next two. Needs a dietitian and cultural reviewers.                           |
| D8  | Medical companion: build in a later phase only, fixed templates, no storage first?                                                           | Yes. Do not start until a clinician and counsel have reviewed scope.                                                                      |
| D9  | Separate consent purpose for the medical companion (and possibly reminders)?                                                                 | Yes for the medical companion (migration M4 then needed); reminders can rely on `health_data_processing`.                                 |
| D10 | Reminders: allow local notifications (new native dependency and iOS permission text)?                                                        | Yes, off by default; needs a device build to verify, which you have not yet authorised.                                                   |
| D11 | Who are the qualified reviewers (dietitian, clinician, strength coach, cultural reviewers) and when?                                         | Required before any V1 content flag is turned on. I can prepare the review packs.                                                         |
| D12 | Calorie visibility default: `light` (current default), or hidden until the person opts in?                                                   | Keep `light`, but offer "no numbers" prominently in the assessment; hidden by default for anyone flagging a concern (already true).       |
| D13 | Does the product keep "lose, maintain, fitness" only, or add a strength-focus intent?                                                        | Add `strength` as a fourth intent (code only, no DB change); weight-neutral.                                                              |
| D14 | May I correct `hosted-history.json` and `INTEGRATION_STATUS.md` now (records only)?                                                          | Yes; no database effect.                                                                                                                  |

### Suggested approval path

1. You answer D1 to D14 (or any subset).
2. I write exact SQL and tests for M1 and M2 as a **proposal document only** and, separately, the fasting policy change as a draft for clinician review.
3. You approve each migration individually; I implement Phase 0 and V1 behind feature flags, through the existing PR and CI process into `integration/live-prep`.
4. Nothing is applied to the hosted project, merged, built or activated without your explicit approval at each step.
