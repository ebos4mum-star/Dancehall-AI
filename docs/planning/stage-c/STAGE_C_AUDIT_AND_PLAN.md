# Stage C audit and plan: Dancehall, reggae, strength, chair dance and cultural nutrition

Status: **audit and proposal for owner approval. Nothing in Stage C has been built.** No code changed, no migration created or applied, no hosted data touched, no content written. Migration `20261213000100` remains unapplied and unauthorised. No professional, clinical or cultural review has taken place, and none is claimed.
Audited on `integration/live-prep` at `dffef86` (PRs 45 to 48 merged).

## 1. Audit

### 1.1 Workout library

| Fact               | Finding                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size               | 14 sample workouts, 1 sample 4-week program (12 sessions), 1 placeholder instructor.                                                                                                          |
| Styles             | afrobeats 3, low_impact 3, amapiano 2, hip_hop 2, latin 2, bollywood 2. **No Dancehall, no reggae, no chair dance.**                                                                          |
| Levels             | beginner 7, intermediate 5, advanced 2 (both advanced are 30 minutes).                                                                                                                        |
| Impact / intensity | impact low 7, moderate 5, high 2; intensity moderate 7, high 4, low 3.                                                                                                                        |
| Origin             | All 14 are `original_text`, generic movements, **sample content, flagged synthetic**, no music, video or instructor.                                                                          |
| Equipment          | All `none`. No strength workouts exist.                                                                                                                                                       |
| Gap found          | **No 10-minute session is both low impact and low intensity**, and there is no seated session. Every block does have a `lowImpactAlt`, and some of those mention seated versions in one line. |

### 1.2 Content architecture (how content reaches people)

- **The app reads workouts from a bundled JSON file** (`workout-data.json`) in **both** mock and Supabase modes. The database `workouts` table holds a copy seeded from the same JSON (`scripts/gen-seed.mjs`), which CI keeps in sync (`check:seed`).
- **Foreign keys make the database copy matter.** `workout_sessions.workout_id` references `workouts(id)`, and `food_log_items.food_id` and `meal_plan_items.food_id` reference `foods(id)`. A person logging a session or food that exists only in the bundle would be **rejected by the hosted database** until the row is seeded there. Every new workout and food therefore needs an approved hosted data seed before it works live.
- **Publication gates already exist in the database.** A non-synthetic workout can only publish with an approved fitness review by someone other than its author, a safety note, a valid structure (warm-up, main, cool-down, low-impact version per block) and cleared licences for any media (`content_reviews`, `licences`, `media_assets`, trigger `app.workout_guard`). Sample content is marked synthetic and is labelled in the app.
- **The bundle has no equivalent gate.** Whatever is in the JSON is shown. The review gate for bundled content is a code convention (the sample notice, the `is_synthetic` flag), not an enforced rule. Stage C should add one (see C1).
- **Media is not wired to real assets.** The hybrid player supports real-dancer and 3D tracks and chooses guided text whenever licences or tracks are missing. There are no tracks, so guided text is always used.
- **Strength:** the content contract and review gate exist (`strength.ts`) but both registries are empty by design; the only strength feature is self-directed logging, and the Dance tab shows a card saying guided strength is not available yet.

### 1.3 Database constraints that touch Stage C

| Constraint                                                                                                                                          | Effect                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workouts.style` check lists six styles                                                                                                             | **Dancehall, reggae and chair dance cannot be stored.** Needs a migration (drafted, tested locally, not applied).                                                              |
| `workouts.equipment` is free text                                                                                                                   | No migration needed to describe equipment, but the client does not filter by it yet.                                                                                           |
| `workout_sessions.style` is free text                                                                                                               | History needs no change.                                                                                                                                                       |
| `foods.region_tags` is a free text array; `foods.source` checks three values (`curated`, `usda_fdc`, `open_food_facts`); `attribution` is free text | New regions need no migration. A reviewed food can use `source = 'curated'` with an `attribution`. A new `source` value (for example a regional table) would need a migration. |
| `foods.id` pattern `^[a-z0-9-]{2,60}$`; kcal, macro and cost ranges                                                                                 | New foods must fit; values must come from a licensed or dietitian-curated source.                                                                                              |
| `sql-parity.test.ts` reads the style list from the **original** migration text                                                                      | It will fail the moment the style constraint changes. It must be changed to read the latest definition, in the same PR as the migration.                                       |
| `dance.test.ts` requires **every style in `DANCE_STYLES` to have at least one workout**                                                             | A style cannot be added to the client list before content exists. This is a useful gate, and it couples the style value, the content and the migration.                        |

### 1.4 Screens and the engine

- **Dance tab:** a style carousel built from `DANCE_STYLES` with a per-style visual table (`STYLE_META`) and labels (`style.*`); filters for level, intensity, minutes, low impact. Adding a style needs entries in all three places.
- **Session player** (`dance/session.tsx`): block timing with a low-impact toggle that switches cues without moving the clock. No set-and-rep mode, so strength sessions do not fit it as is.
- **My approach** already offers Dancehall and reggae as preferences, and the engine says plainly that they "are not in the catalogue yet". **`bias.seated` is computed but nothing uses it**: seated needs currently only trigger low impact.
- **Food:** add, swap, plan, saved and household screens read the bundled 50-item food list. Region tags drive swap ordering and the engine's "thin coverage" note.

### 1.5 Food database

- 50 items, **all synthetic and unreviewed** (the file's own notice says so). Regions: west_african 8, caribbean 8, mediterranean 6, south_asian 6, asian 2, latin_american 2, american 2, global 31. 10 mixed dishes.
- **Not present at all:** East African, Southern African, North African, Middle Eastern, Southeast Asian foods; most Jamaican and wider Caribbean staples; many West African staples; cooking-method or portion variants; recipes.
- Cost tier exists on every item; fibre is stored per 100 g.
- **No nutrient value in this plan is authored by me.** Candidate foods are listed in `specs/CULTURAL_FOODS_CANDIDATES.md` without numbers; the values must come from a licensed or dietitian-curated source.

### 1.6 Opportunities to reuse rather than add

- One engine, one My approach card: styles, cuisines, mobility, experience and secondary goals are already preferences and already shape the plan.
- The existing review gates (`content_reviews`, `strength.ts`, `instruction-media.ts`) are the release mechanism. Stage C adds a code-side gate for bundled content, not a new system.
- No new tab and, if the decision below is accepted, no new screen for strength.

### 1.7 Privacy, accessibility, medical-safety and security notes

- Culturally specific content carries a risk of stereotyping or misattribution, which is why practitioners and cultural reviewers are on the critical path.
- Dancehall and reggae movement can involve deep knee and hip flexion and fast hip rotation: low-impact and seated versions must be authored with the first sessions, not later.
- Strength guidance and progression are health guidance: independent qualified review before anything is shown.
- Seed data and FK dependencies mean a content release is also a **hosted data change**: it needs approval each time.
- Accessibility: new sessions need text equivalents for every cue (guided text already is text), reduced-motion respect in any new animation, and screen-reader labels for any new tile.

## 2. What can be built now, and what cannot

**Can be built now (no content, no hosted change):** the pipeline that makes content safe to add. **Cannot be shipped until the inputs below exist:** the content itself.

| Item                                                                | Needs content?       | Needs approval?                   |
| ------------------------------------------------------------------- | -------------------- | --------------------------------- |
| Style single-source registry; parity test reads latest constraint   | No                   | Starting Stage C                  |
| Seated and chair-dance honoured by the engine and plan              | No (honest fallback) | Decision D1                       |
| Next-level suggestion from the person's own history                 | No                   | Wording and threshold review      |
| Cuisine list extended (East and Southern African) in code           | No                   | Decision D5                       |
| Content spec fields and validators (tempo, credits, rights, review) | No                   | No                                |
| Bundled-content review gate (unreviewed items cannot ship)          | No                   | No                                |
| Strength pipeline (loader through the existing gate, session mode)  | No                   | Decision D4                       |
| Dancehall, reggae and chair sessions and programs                   | **Yes**              | Authors, rights, review, M3, seed |
| Strength exercises and routines                                     | **Yes**              | Qualified author and review       |
| Reviewed African, Caribbean and other foods                         | **Yes**              | Dietitian, cultural review, seed  |

## 3. Implementation plan

Nothing starts until you approve. Each step ships behind the existing build-time flag convention, with tests, and goes through the usual PR and CI.

### C1: Foundations (no content, no hosted change)

| #    | Build                                                                                                                                                                                                                                                                                                | Tests                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| C1.1 | **Style registry.** One definition per style (id, label key, visual) so adding a style is a single change plus content. `sql-parity.test.ts` reads the **latest** style constraint across migrations. A new style still cannot enter `DANCE_STYLES` until a workout exists (existing coverage test). | Parity test for current and proposed constraint; coverage test unchanged            |
| C1.2 | **Seated and chair dance.** Wire `bias.seated`: prefer `chair_dance` sessions when any exist, otherwise low-impact sessions, and say honestly in the plan reason that seated sessions are not in the catalogue yet. Player toggle copy mentions the seated option where a block provides one.        | Plan tests with and without seated content; golden test for default users unchanged |
| C1.3 | **Next-level suggestion.** A pure function over the person's completed sessions: when they have done a provisional number of sessions at a level and found them manageable, offer (never push) the next level, and say that staying put is fine. No performance claims, no scores.                   | Determinism, no suggestion for new users, never below beginner, wording filter      |
| C1.4 | **Cuisines.** Add `east_african` and `southern_african` to the cuisine preferences (code only; stored values stay tolerant). The engine's coverage note already tells people when a cuisine has few examples.                                                                                        | Preference parse and compatibility tests                                            |
| C1.5 | **Content spec fields and validators.** Optional, additive fields on a workout (tempo range, credits, rights reference, cultural review reference). Validators enforce them for any non-sample content; sample content is unaffected.                                                                | Validator tests; seed check unchanged                                               |
| C1.6 | **Bundled-content gate.** A code check that fails CI if a non-sample workout or food lacks its review and rights references, so bundled content cannot ship unreviewed. Mirrors the database rule.                                                                                                   | CI failure demonstrated on a fixture                                                |
| C1.7 | **Food metadata.** Optional `sourceRef` and `reviewRef` on foods; validator requires both before a food may be marked non-synthetic. **No nutrient values are written.**                                                                                                                             | Validator tests; seed check unchanged                                               |

### C2: Strength foundations pipeline (no content)

Loader for a strength data file through the existing `activeStrengthWorkouts` gate (empty until a qualified author and reviewer exist). Session experience: **reuse `dance/session.tsx`** with a set-and-rest mode converted from the strength contract's blocks, rather than a new screen (decision D4). The Dance tab card keeps saying guided strength is not available until content passes the gate. Tests: contract and gate tests exist; add loader, conversion and "empty registry shows the card" tests.

### C3: Content release (blocked on inputs, not started by this approval)

Per pack, when authored and independently reviewed: add the JSON; add the style to `DANCE_STYLES`, labels and visuals; apply the style migration (separately approved); seed the hosted project (separately approved); record reviews and licences through the existing admin path; turn on the flag; verify on a device. Packs, in suggested order: (1) chair dance and low-impact, (2) Dancehall beginner, (3) reggae beginner, (4) intermediate and advanced, (5) strength foundations, (6) reviewed foods by cuisine, (7) four-week programs.

## 4. Database changes (all proposals; **none created, none applied**)

| #                     | Change                                                                                                                                                                                                                                 | Needed when                                                | Notes                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M3 v2**             | Replace `workouts_style_check` with the existing six styles plus `dancehall`, `reggae` and `chair_dance`. Revised from the earlier draft (soca removed, since you did not ask for it). Exact SQL is in `SQL_PROPOSALS_NOT_APPLIED.md`. | With the first reviewed workout in a new style (C3)        | Applied cleanly on a scratch local database on top of all 14 migrations; the dance catalog, sessions, RLS and definer tests pass with it. It only adds values, so every existing row stays valid. It touches an existing table, so it needs your separate approval. |
| **Hosted data seeds** | Data-only inserts into `workouts`, `programs`, `program_workouts`, `foods` (and the instructor and review records through the admin path), generated from the JSON by `gen-seed`.                                                      | Per content pack, before it is usable live (FK dependency) | Hosted data change: separate approval **each time**. Never a schema change.                                                                                                                                                                                         |
| No migration          | Chair dance (it is a style value), seated mode, cuisines, regions, food provenance (`source = 'curated'` plus `attribution`), strength (code gate plus existing logging).                                                              | n/a                                                        | Avoids new schema. A new `source` value for a regional composition table is the only food-side migration that could be wanted; it is **not** proposed.                                                                                                              |
| Unchanged             | The household-trigger revoke `20261213000100`; M1 and M2 from the earlier proposals.                                                                                                                                                   | n/a                                                        | The revoke remains unauthorised for hosted execution.                                                                                                                                                                                                               |

## 5. Risks and dependencies

| Risk                                                              | Mitigation                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Inauthentic or stereotyped Dancehall and reggae content           | Practitioners author and are credited; I write structure and specifications only; cultural review and counsel are gates. |
| Unreviewed health guidance shipped by accident                    | Code gate on bundled content (C1.6), database gate, flags off by default, CI check.                                      |
| New content unusable on the hosted project                        | FK dependency documented; seeds are a planned, approved step per pack.                                                   |
| Style added before content                                        | Existing coverage test and the new registry make this a CI failure.                                                      |
| Seated users silently get high-impact sessions                    | C1.2 keeps impact low always and states the limitation.                                                                  |
| Scope: five content packs at once                                 | Packs are independent and ordered; C1 and C2 deliver value without content.                                              |
| Dependence on external people (practitioners, reviewers, counsel) | Critical path; see `ASSETS_AND_REVIEWS_REQUIRED.md`.                                                                     |

## 6. Acceptance criteria

- C1 to C2 merge with no content, no migration, no hosted change, and every existing test, the 36 browser flows, the accessibility sweep and reduced-motion check still pass.
- Default users' plans are unchanged (golden tests); weight-neutral behaviour and hidden-number handling are unchanged.
- A style cannot enter the client list without a workout; the parity test passes before and after the migration lands.
- Non-sample content without review, rights and credit references fails CI.
- Seated preference never yields a high-impact suggestion and says honestly what is missing.
- Nothing is reported as verified on a device, over HTTP or Storage, or by a professional.

## 7. Decisions needed from you

| #   | Decision                                                                                                                                                 | Recommendation                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | Chair dance as its own **style** (`chair_dance`) or as a seated flag on any session?                                                                     | Style now (simple, authorable, already in the migration). A per-block seated alternative can follow.    |
| D2  | May I author **sample, clearly labelled, unreviewed** Dancehall and reggae sessions for development, or wait for practitioners?                          | **Wait.** Invented moves risk inauthenticity. I will test the pipeline with fixtures only.              |
| D3  | Who authors the first Dancehall and reggae sessions, under what agreement and budget, with which music option?                                           | Option 1 from the content plan (original choreography, guided text, tempo guidance, no music licence).  |
| D4  | Strength sessions: reuse the dance session screen in a set-and-rest mode, or build a new screen?                                                         | Reuse (no new screen).                                                                                  |
| D5  | Which cuisines come first for reviewed foods, and may I add East and Southern African to the code list now?                                              | West African and Caribbean first; add the two code entries.                                             |
| D6  | Source for food values (USDA FoodData Central, FAO/INFOODS regional tables, national tables, dietitian-curated) and whether to keep `source = 'curated'` | Dietitian chooses per cuisine; keep `curated` plus `attribution`; no migration.                         |
| D7  | Next-level suggestion: approve building it with provisional wording, to be reviewed by an exercise professional before it is shown?                      | Yes, behind the flag; no threshold shown to people.                                                     |
| D8  | May sample (synthetic) content appear in any build, or only in development?                                                                              | Development and review builds only; production builds hide it (the bundled-content gate enforces this). |
| D9  | Approve starting **C1 and C2** (no content, no migration, no hosted change)?                                                                             | Yes, after you review this plan.                                                                        |
| D10 | Who are the reviewers and practitioners, and when?                                                                                                       | Needed before any C3 pack starts.                                                                       |
