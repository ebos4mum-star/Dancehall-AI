# Weight Management Engine (Stage A, implemented)

Status: **Stage A only.** The engine is built, tested and **not shown anywhere in the app**: no screen calls it, nothing in a store calls it, and the daily plan behaves exactly as before unless a caller passes it the engine's bias. Stage B (screens) has not been approved or started. All rules and wording are provisional (`PATHWAYS_RULES_STATUS`).

## Where it lives

| File (`packages/shared/src`) | Role                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wellness.ts`                | Preferences. Adds the `strength` goal intent and six optional preference fields (pathways, danceStyles, cuisines, mobility, experience, schedule). All parsed tolerantly inside `parsePrefs`. |
| `pathways.ts`                | `resolvePathways(input)`: the engine. Pure, deterministic, no AI, no clock, no randomness.                                                                                                    |
| `evidence.ts`                | Evidence labels and the content review gate. Ships **no content**.                                                                                                                            |
| `daily-plan.ts`              | Accepts an optional `bias` from the engine. Without it the plan is unchanged.                                                                                                                 |
| `workouts.ts`                | `suggestQuickFit` accepts an optional intensity limit (additive).                                                                                                                             |
| `nutrition-plan.ts`          | Reused as is, plus an explicit `strength` explanation (no deficit, no weight target).                                                                                                         |
| `pathways.test.ts`           | 81 focused tests.                                                                                                                                                                             |

## Data flow

```
 WellnessPrefs (stored)  ─┐
 readiness: clear |       │
   cautious | unknown ────┤
 body facts (optional) ───┼──► resolvePathways() ──► EngineOutput
 habits count (optional) ─┤        │                    │
 recent: goalReached ─────┘        │                    ├─ pathways[]   id, source, role, reasons[], actions[{text, why}], notes[]
                                   │                    ├─ summary[]    the plain lines shown at the top
        reuses, never duplicates:  │                    ├─ exclusions[] what is withheld, and why
        numbersHidden()            │                    ├─ missing[]    what we do not know (never guessed)
        nutritionTargets()         │                    ├─ bias         → generateDailyPlan({ ..., bias })
        evaluateReadiness result   │                    ├─ lens         which progress indicators to show or hide
        habit limit (5)            │                    ├─ habitSuggestions[] (offered, never created)
        food-data region tags      │                    ├─ nutrition    from nutritionTargets; numbers null when hidden
                                   │                    └─ seeProfessional
```

## The eight pathways

`dance_aerobic`, `balanced_nutrition`, `strength_training`, `everyday_movement`, `cultural_eating`, `mindful_eating`, `healthy_habits`, `weight_maintenance`. They are tags and rules, not screens or products.

Every pathway has a **source**:

| Source      | Meaning                                                                                         | Changes the plan?                  |
| ----------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| `chosen`    | The person picked it.                                                                           | Yes                                |
| `from_goal` | Derived from their stated goal when they have picked none.                                      | Yes                                |
| `suggested` | Inferred from something they said (a cuisine, liking strength, tracking none, reaching a goal). | **No, never** until they choose it |

Every result is `editable`. Nothing is inferred from information the person did not give.

## Safety rules in the engine

- **Weight-loss targets are withheld** (focus becomes `weight_neutral`, with a stated reason) when there is an eating concern, pregnancy or postpartum, a cautious readiness result, **or readiness not answered**. This matches `evaluateReadiness`, which already treats unanswered questions cautiously.
- **Missing is not a finding.** With unanswered safety questions the engine says "finish the quick safety questions"; it does not claim the person's answers suggest anything and does not flag professional support. A genuine cautious result does both.
- **Calorie and protein numbers only ever come from `nutritionTargets`**, are null whenever `numbersHidden` is true, and weight, calorie and measurement progress lenses are hidden then too.
- The engine states **no minute or session targets** of its own; it only echoes goals the person set.
- **Never offered** (`NEVER_OFFERED`, tested against all output): fasting, rapid loss, extreme restriction, very-low-calorie targets, detox, fat-burning supplements, medication advice. Fasting is not a pathway. The coach's fasting refusals are untouched.
- Strength never creates a deficit or weight target.
- Pregnancy or postpartum caps suggested intensity at moderate and keeps low impact. Cautious or unknown readiness forces low impact and low intensity.
- Habit ideas stay inside the five-habit limit, never repeat the person's own, and at most three are offered.
- Honesty notes are built in: guided strength workouts are not available yet; Dancehall and reggae sessions are not in the catalogue yet; the food list is thin for some cuisines.

## Backward compatibility

- `strength` is added after `lose`, `maintain`, `fitness`. Stored values are unchanged; unknown values still fall back to the default; a stored `strength` read by an **older app version** falls back to `fitness` (it does not fail).
- **Important:** both store adapters rebuild the saved document from `parsePrefs(...)`, so any field `parsePrefs` does not return is erased on the next save. All new fields are returned by `parsePrefs` with safe defaults, and tests run the stores' read-merge-write cycle. **An older app version that saves preferences will drop the new fields**, because it does not know them. Worst-case document size is under 1.5 KB of the 2 KB cap, so no migration is needed.
- `GOAL_INTENTS` now has four values, but the Goals screen still offers the original three (`SELECTABLE_GOAL_INTENTS`). The only app change is type-level plus two unused text strings; the screen looks and behaves as before.
- The weigh-in prompt in the daily plan now also stays off for `strength` (it already did for `fitness`).
- A golden test proves the plan with a neutral engine bias is identical to the plan without it, across every mode, seed and low-impact setting.

## What Stage A does not do

No screens, no navigation, no store or adapter wiring, no onboarding change, no migration, no hosted change, no notification, no fasting, no AI, no content, no medical companion, no new celebration or log kinds.
