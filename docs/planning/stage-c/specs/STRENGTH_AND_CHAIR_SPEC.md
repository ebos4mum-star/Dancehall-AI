# Specification: strength foundations and chair dance / low-impact alternatives

**A specification, not content.** No exercise, routine, progression rule or seated sequence is written here, and none has been reviewed by a qualified professional. Numbers are placeholders for the qualified reviewer. The repository already enforces this: strength content cannot be shown until an independent reviewer has approved it (`packages/shared/src/strength.ts`), and its registries are empty.

## 1. Strength foundations

Uses the existing contract. Movement patterns: squat, hinge, lunge, push, pull, carry, core. Equipment: none, dumbbells, bands (the same options the person already picks in My approach).

| Item               | Specification                                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exercise record    | `id`, `name`, `pattern`, `equipment`, ordered `cues`, a required `regression`, an optional `progression`, `safety` notes, `contentOrigin`, review status and reviewer record. A joint-friendly or seated alternative should be named in the regression where the reviewer agrees. |
| Workout record     | `level` (beginner or intermediate), minutes, equipment, a warm-up, a cool-down, blocks of sets with reps or seconds and rest, safety notes, review status and reviewer. Sets, reps, loads and rest are the reviewer's decisions.                                                  |
| Foundation set     | One beginner bodyweight workout covering each pattern; a dumbbell and a band variant; a short "strength snack" for busy days. Whether and how many is for the reviewer and owner to decide.                                                                                       |
| Progression        | Written by the reviewer in plain words with no numeric targets in the engine. The engine only echoes goals the person set. A next-level suggestion (see the plan) never prescribes loads.                                                                                         |
| Session experience | Reuse the existing session screen with a set-and-rest mode (decision D4). Guided text only; no video. The existing Dance-tab notice stays until content passes the gate.                                                                                                          |
| Logging            | Unchanged: strength sessions are still logged with the existing wellness entry. No new table.                                                                                                                                                                                     |
| Education cards    | Muscle preservation, body composition and recovery, evidence-labelled, only after review. Must never promise results.                                                                                                                                                             |

## 2. Chair dance and low-impact alternatives

| Item                 | Specification                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Representation       | Proposal (decision D1): a `chair_dance` **style** (needs the style migration). A seated flag on every session is the alternative but needs a seated text for every block of every workout.                                           |
| Session architecture | The same format as other sessions: warm-up, main and cool-down blocks, each with a cue and a low-impact alternative, safety notes. Range of movement, pacing and any support (stable chair, no wheels) are the reviewer's decisions. |
| Audience             | Anyone who wants or needs seated movement. It must not read as lesser: the existing copy for low impact ("a full workout, not a lesser one") is the model.                                                                           |
| Engine behaviour     | People who choose "Seated options" in My approach get seated sessions first when they exist; otherwise low-impact sessions, with the plan saying honestly that seated sessions are not in the catalogue yet.                         |
| Minimum first set    | A 10-minute seated session in a Dancehall or reggae feel and a 5-minute seated reset; whether these are Dancehall-inspired depends on the practitioners.                                                                             |
| Balance support      | General guidance only (hold a stable surface if the reviewer agrees); anything individual is left to a health professional.                                                                                                          |
| Mobility needs       | The engine already captures low-impact, seated and balance-support preferences. The reviewer decides what each means in cues.                                                                                                        |

## 3. Reviewers and assets

A certified strength coach or physiotherapist (and an exercise physiologist for the readiness and progression rules); the draft review pack is `docs/planning/review-packs/STRENGTH_TRAINING.md`. Any filmed demonstrations need likeness and rights agreements; the default is guided text.
