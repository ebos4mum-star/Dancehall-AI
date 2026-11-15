# V1 implementation sequence (for review; nothing started)

Status: **for the owner's review. No implementation has begun.** Scope follows `APPROVED_DECISIONS.md`: personalised goals, dance fitness, smart nutrition, everyday movement, strength foundations, cultural eating, mindful eating, habits and weight maintenance, reusing existing screens.
Excluded from V1 (still approved only as designs or later phases): fasting (flagged off, not enabled), the medical companion, native local notifications, step data, new log or celebration kinds, Dancehall and reggae workouts (separate content plan).

## Legend

| Tag                             | Meaning                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **[E] Existing infrastructure** | Can be built now from code and data already in the repository. No new content, no approval beyond starting the build. |
| **[C] Needs content**           | Logic can be built, but user-visible words, data or routines need qualified review before the surface is switched on. |
| **[A] Needs your approval**     | Touches the hosted project, a native dependency, a stored value or a policy. Not started without a specific yes.      |

All V1 surfaces ship behind one build-time flag (default **off** in builds), so partially finished work is never shown to people. No hosted flag rows are needed for V1.

## What V1 can use as-is (verified in the audit)

| Need                                  | Existing piece                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preferences and where they are stored | `wellness_prefs` (JSON, 2,048-byte cap, RLS, consent-gated). Measured: today's worst case 596 bytes; the V1 additions' worst case 546 bytes (about 1,140 together). **V1 fits without a migration if answers stay compact.** |
| Hide-numbers rule                     | `numbersHidden` and `useNumbersHidden`                                                                                                                                                                                       |
| Daily plan                            | `generateDailyPlan` (modes normal, busy, travel, comeback)                                                                                                                                                                   |
| Nutrition numbers with reasons        | `nutritionTargets` (returns `reasons[]`, protein range, `seeProfessional`)                                                                                                                                                   |
| Cultural and cost data                | `foods.regionTags`, `costTier`, region-aware swaps and plans                                                                                                                                                                 |
| Strength                              | logging of strength entries, `strength.ts` content contract and review gate                                                                                                                                                  |
| Walking and movement                  | walk logs, daily and weekly movement goals, challenges                                                                                                                                                                       |
| Hunger, sleep, recovery               | existing wellness log kinds                                                                                                                                                                                                  |
| Habits and celebrations               | habits (max 5), celebrations ledger, **five** celebration kinds                                                                                                                                                              |
| Safety screens                        | `evaluateReadiness`, coach pre-output and post-output filters (fasting refusals unchanged)                                                                                                                                   |
| Screens                               | Today, Dance, Food, Coach, Me; Goals ("Your focus"); Progress; Challenges; food review                                                                                                                                       |

## Stage A: engine core (all [E], no screens, no content, no approvals)

| #   | Build                                                                                                                                                                                                                                                                                                                   | Notes and tests                                                                                                                                                          | Size |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| A1  | **Pathway registry and `resolvePathways`** in `packages/shared`: the nine V1 pathways as ids with human-readable `reasons[]`, `source: chosen \| suggested`, and explicit `blockedBy` when a safety flag applies. Pure, no AI.                                                                                          | Unit tests for each pathway, for "suggested never activates silently", and for "nothing inferred from data the person did not volunteer".                                | M    |
| A2  | **Preferences v2** extending `parsePrefs` (tolerant, defaults, backward compatible): pathways, styles, cuisines, mobility flags, experience, schedule, sleep window, calorie visibility.                                                                                                                                | Round-trip with old documents; worst-case size test must stay under 1.5 KB so there is headroom under the 2 KB cap; DB-contract test stays green. **Question Q1 below.** | S    |
| A3  | **Evidence label and content registry** with a code-level review gate (same pattern as `instruction-media.ts`): an item with no reviewer, sources or date cannot be returned. Banned-language test extending the existing coach filters (detox, "burn fat fast", streak and fasting-duration language, good/bad foods). | Tests: unreviewed item never rendered; every item has a label; language filter passes.                                                                                   | M    |
| A4  | **Progress lens selector**: which indicators appear given pathways and `numbersHidden` (consistency, walking, strength logs, sleep and energy, nutrition habits, maintenance, optional weight, non-scale wins). Weight and calorie lenses off unless chosen, and always off when numbers are hidden.                    | Tests per lens; hidden-numbers invariants across every lens.                                                                                                             | M    |
| A5  | **`planBias()` into `generateDailyPlan`**: pathways bias what is suggested and add the "why" lines. With default preferences the plan is **unchanged** (golden test).                                                                                                                                                   | Regression: current plan tests unchanged; new tests per pathway.                                                                                                         | M    |

Checkpoint **CP1** (review): you read engine outputs for sample people (generated explanations, not screens) before any UI work.

## Stage B: existing screens, extended ([E] logic, [C] words)

No new tab. No new screen. Reuse in this order:

| #   | Surface                                                                    | Change                                                                                                                                                                                                                                                                    | Needs                                                                           |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| B1  | **Goals "Your focus" becomes "My approach"** (`apps/mobile/app/goals.tsx`) | Pathway chips with reasons, style and cuisine pickers, mobility flags, calorie visibility, "why these" panel, edit anytime. Entry from Me and from a skippable "Make it yours" card on Today. **Onboarding is left unchanged**, so the completed experience is preserved. | [E]; strings [C]                                                                |
| B2  | **Today**                                                                  | Plan card shows "why this" and pathway chips; weight-neutral users see no weight prompt.                                                                                                                                                                                  | [E]                                                                             |
| B3  | **Dance tab**                                                              | Order and filter by chosen styles, mobility and experience using existing `style`, `level`, `intensity`, `impact` fields; intensity picker; progression suggestion from existing levels.                                                                                  | [E]                                                                             |
| B4  | **Strength foundations** (Dance tab and Progress, no new screen)           | Self-directed logging stays; add education cards and progression rules text. **Guided routines are not built** until a qualified author exists.                                                                                                                           | logic [E]; routines and cards [C] (certified strength coach or physiotherapist) |
| B5  | **Food tab**                                                               | Protein and fiber cards, plate-balance guidance, cuisine filters on swaps and plans, mindful prompt on the review screen (a hunger and fullness check using the existing hunger log, no scoring).                                                                         | [E]; cards [C] (registered dietitian)                                           |
| B6  | **Habits**                                                                 | Pathway-suggested habit templates inside the existing five-habit cap.                                                                                                                                                                                                     | [E]; names and tips [C]                                                         |
| B7  | **Progress**                                                               | Lenses from A4, non-scale wins computed from existing logs, Pulse celebrations **only with the existing five kinds** (movement already counts dance, walking and strength).                                                                                               | [E]                                                                             |
| B8  | **Maintenance**                                                            | A gentle transition when a goal is reached or a plateau is detected: offer maintenance, show normal-fluctuation education, relapse-prevention prompts. Uses existing `maintain` goals and weekly review.                                                                  | [E]; copy [C]                                                                   |

Checkpoint **CP2** (review): browser walkthrough in mock mode (the existing 31-flow harness, light and dark, reduced motion) before any content is switched on. This is **not** a native test.

## Stage C: content that needs qualified review ([C], blocks switching surfaces on)

| #   | Pack                                                                                                                             | Reviewer                                               | Notes                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| C1  | Smart nutrition education: protein, fiber, plate balance, energy-balance basics, adequate nutrition                              | Registered dietitian                                   | Evidence labels and sources per item                                       |
| C2  | Cultural food data v1: West African and Caribbean first, then two more cuisines you choose; recipes and cooking methods are V1.5 | Registered dietitian + cultural reviewers              | Real data replaces synthetic rows. **Needs a hosted seed insert (see D2)** |
| C3  | Mindful eating prompts: hunger and fullness, emotional-eating education, reflection without judgement                            | Dietitian or clinician with eating-behaviour expertise | Must never encourage restriction; coexists with the eating-concern flag    |
| C4  | Strength foundations: movement patterns, progression, rest, muscle-preservation education                                        | Certified strength coach or physiotherapist            | Existing contract and review gate apply                                    |
| C5  | Habits and sleep education                                                                                                       | Dietitian or clinician                                 | Short, practical, evidence-labelled                                        |
| C6  | Maintenance and plateau education                                                                                                | Dietitian                                              | Normal fluctuation, sustainable adjustments, relapse prevention            |
| C7  | Dance progression copy                                                                                                           | Exercise professional                                  | Dancehall and reggae follow the separate content plan                      |

I can prepare **review packs** (draft text, sources, checklist from the expansion document section D.6) for each, but cannot supply the reviewers.

## Stage D: items that need your explicit approval ([A])

| #   | Item                                                                                       | Why it needs approval                                                                                                                                                                                                                                 | Blocks                                                    |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| D1  | Migrations M1, M2, M3 (proposals drafted and tested locally)                               | New objects or a changed constraint on the hosted schema                                                                                                                                                                                              | M1 not needed for V1; M2 fasting; M3 Dancehall and reggae |
| D2  | **Hosted seed for new foods**                                                              | `food_log_items.food_id` has a foreign key to `public.foods`; the app bundles food data locally, but on the hosted project a logged item for a food that is not in `public.foods` would be rejected. Inserting reviewed foods is a hosted data change | C2 on the hosted project (mock mode unaffected)           |
| D3  | Applying `20261213000100_household_trigger_revoke.sql` (from PR #45) to the hosted project | Hosted permission change                                                                                                                                                                                                                              | None of V1                                                |
| D4  | Native dependency for notifications and any device build                                   | Native config; cannot be verified without a device                                                                                                                                                                                                    | Reminders beyond in-app cards                             |
| D5  | Enabling fasting; any change to the coach's fasting refusals                               | Policy and clinical review                                                                                                                                                                                                                            | Fasting                                                   |
| D6  | New celebration kind, or a stress or mood log kind                                         | Database check constraints would need a migration                                                                                                                                                                                                     | Not in V1                                                 |
| D7  | Hosted feature-flag rows (for example `fasting.enabled`)                                   | Hosted data change                                                                                                                                                                                                                                    | Not in V1                                                 |
| D8  | Any paid AI, device build, TestFlight, production, `main`                                  | Standing boundaries                                                                                                                                                                                                                                   | n/a                                                       |

## Order of work and dependencies

```
 A1 ─┬─ A2 ─┐
     ├─ A3 ─┼─ A5 ──► CP1 ──► B1 ─► B2 ─► B3 ─► B5 ─► B6 ─► B7 ─► B8 ──► CP2
     └─ A4 ─┘                          │
                                       └─► B4 (logic only)
 C1 … C7 run in parallel with Stage A/B; a surface is switched on only when its pack is reviewed.
 D2 is needed before C2 is used on the hosted project. D1–D8 are never started without your yes.
```

Rough sizing: Stage A is five medium or small steps; Stage B is eight steps of which B1 and B5 are the largest; Stage C depends on reviewer availability and is likely the long pole. I am deliberately not giving dates.

## What each pathway gets in V1

| Pathway              | Built from existing                                  | Needs content                    | Held back                                            |
| -------------------- | ---------------------------------------------------- | -------------------------------- | ---------------------------------------------------- |
| Personalised goals   | Prefs, goals, My approach, plan "why"                | Strings                          | Strength as a fourth intent (Q1)                     |
| Dance fitness        | Catalogue, programs, filters, intensity, progression | Progression copy                 | Dancehall and reggae (content plan and M3)           |
| Smart nutrition      | Targets, diary, plans, swaps                         | Education cards (C1)             | Fiber target numbers until reviewed                  |
| Everyday movement    | Walk logs, movement goals, challenges, Pulse         | None                             | Step data (needs health-platform sync)               |
| Strength foundations | Logging, contract, progression logic                 | Authored routines and cards (C4) | **Guided routines** until a qualified author exists  |
| Cultural eating      | `regionTags`, region-aware swaps and plans           | Reviewed food data (C2)          | Recipes and cooking methods (V1.5); hosted seed (D2) |
| Mindful eating       | Hunger log, review screen, no-shame language         | Prompts (C3)                     | None                                                 |
| Habits               | Habits, sleep, hunger, recovery logs                 | Templates and tips (C5)          | Stress log (D6)                                      |
| Weight maintenance   | `maintain` goals, plateau reply, weekly review       | Education (C6)                   | None                                                 |

Low-impact fitness stays as it is today and is not changed. Budget nutrition is **not** on your V1 list: its main building blocks (`costTier`, grocery list, household) already exist, and a budget preference would be a few lines in A2 and B5. Say if you want it included.

## Safeguards carried through every step

- Hidden numbers are honoured on every new surface (a test per surface).
- A weight-neutral person is never asked for a weight or shown a weight target by default.
- Nothing is inferred from information the person did not give; unanswered safety questions are never treated as "no".
- No new tab, no new screen in V1; reduced-motion respected; every chart or progress visual has a text equivalent; haptics only on meaningful completions and never in `gentle` or `off` celebration levels.
- Existing tests and the 31 browser flows must still pass at every step.
- No AI is added. The engine is rules. Paid AI stays off.
- Everything is reported as **not verified on a device** until a device build exists.

## Review questions for you

1. **Q1:** add `strength` as a fourth `goalIntent` (code only; changes a stored value, so it needs your yes)? Recommended: yes.
2. **Q2:** keep onboarding unchanged and offer "Make it yours" from Today and Me (recommended), or add a step to onboarding?
3. **Q3:** include budget nutrition in V1 (small), or hold it?
4. **Q4:** which two cuisines after West African and Caribbean for the first reviewed food set?
5. **Q5:** who are the reviewers for C1 to C6, and should I start preparing the review packs now?
6. **Q6:** is the build-time flag approach (no hosted rows) acceptable for V1?
7. **Q7:** approve building the pure reminder planner and in-app reminder card now (no dependency), per the notifications evaluation?
8. **Q8:** after you review this, shall I start at **Stage A only**, stop at CP1, and show you the engine's explanations before touching any screen?
