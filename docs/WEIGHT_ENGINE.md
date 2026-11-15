# Weight Management Engine (Stage A, implemented)

Status: **Stage A (engine) and Stage B (connected to the Goals screen and the daily plan) are implemented.** All rules and wording are provisional (`PATHWAYS_RULES_STATUS`) and unreviewed by a dietitian, clinician or exercise professional. Nothing here has been verified on a native device or against a live Supabase project.

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

## Stage B: what is connected

- **Goals screen = My approach.** The existing Goals screen (no new tab, no new route) now offers four primary goals (lose weight, maintain weight, improve fitness, build strength), an optional collapsed "Also working on" for compatible secondary goals, a "Track my weight" switch, and a My approach card that shows the engine's summary, every pathway with its reasons and a "Why:" for each action, up to three habit ideas (added only when the person taps Add), what progress will show, and optional pickers (dance styles, foods, movement needs, experience, usual time). Every control saves immediately and the card recalculates.
- **Editing.** Choosing a pathway makes it "Your choice" (starting from what is in the plan now, so nothing else is dropped); "Go back to suggestions from my goals" clears the choices. A suggested pathway changes nothing until added. The last pathway cannot be removed.
- **Compatible goals.** Lose and maintain are never combined; every other pairing is allowed (`GOAL_COMPATIBILITY`). Stored secondary goals are cleaned on every read, so changing the primary goal never leaves an invalid pair. Weight-loss targets follow the primary goal only; the summary says so when lose is a secondary goal.
- **Daily plan.** Both plan builders (the mock store and the Supabase coach adapter) pass the engine's bias to `generateDailyPlan`. The plan itself is still generated by the existing function.
- **Weight is opt-in.** `weightTrackingOn` and `showWeight` are the one rule. An explicit choice wins. With no choice, behaviour is what it was: on for the lose and maintain goals or while an active weight goal exists; off for improve fitness and build strength. `showWeight` also requires that the person's numbers are not hidden (`numbersHidden`), so hidden numbers always win. With weight off, Today shows no weight card, no weight-goal progress and no weigh-in prompt; Progress shows no weight chart, entry or history and no body-measurement card (one quiet line says tracking is off); the Me row reads "Your progress" instead of "Weight progress"; the weekly recap leaves out goal percentages. Nothing is deleted: turning tracking back on shows the person's earlier entries again.
- **Behaviour change to know about.** Before Stage B every person saw the Today weight card. Now people whose goal is improve fitness (or build strength) and who have no active weight goal do not, until they turn on "Track my weight". Their entries are kept.
- **Readiness.** `readinessState` maps a stored screening to clear, cautious or unknown for both plan builders. No screening on record is unknown, which the engine treats cautiously, as the readiness screening already does.

## What Stage B does not do

No migration, hosted change, native dependency, notification, fasting, AI, published content, Dancehall or reggae sessions, or medical companion. The Supabase adapter path was exercised only with fakes; the browser regression ran in mock mode.

## What Stage A does not do

No screens, no navigation, no store or adapter wiring, no onboarding change, no migration, no hosted change, no notification, no fasting, no AI, no content, no medical companion, no new celebration or log kinds.
