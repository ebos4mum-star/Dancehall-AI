# Review pack: strength foundations (DRAFT, not for publication)

**Reviewers:** a certified strength coach or a physiotherapist (and an exercise physiologist for the readiness and progression rules). The reviewer must not be the author.
**Status:** preparation only. **No strength workout or exercise is shipped.** The existing contract in `packages/shared/src/strength.ts` requires qualified authorship and review before any guided strength content can be offered; the app today offers self-directed logging only.

## What the engine already says (provisional wording, for the reviewer to correct or replace)

- "Log your strength sessions" with the equipment the person has (bodyweight, dumbbells, bands), and "Guided strength workouts are not available yet."
- "Make it a little harder only when the current level feels comfortable and your body feels fine" (flagged in the text as not professionally reviewed).
- "Keep easy or rest days between harder days."
- A note to check with a health professional before new strength training when there is any caution flag.
- The daily plan's existing prompt: "a short strength session, if you like".

The engine states **no** set, repetition, load or weekly-frequency targets of its own.

## Questions for the reviewer (none is assumed)

1. What is a safe, general progression principle for adults new to strength training, in plain language and without prescribing numbers? Is the current wording acceptable?
2. Which movement patterns should an introductory set cover (the contract lists squat, hinge, lunge, push, pull, carry, core), and what are acceptable bodyweight, dumbbell and band versions of each?
3. For each movement: setup cues, common errors, a regression (easier) and a progression (harder), and joint-friendly and seated variants.
4. What warm-up and cool-down should accompany sessions? What rest guidance is appropriate?
5. Which warning signs mean stop and seek advice, in wording that does not diagnose?
6. What should be said about pregnancy and postpartum, older adults, joint problems, and people returning after a gap, without giving individual medical advice?
7. How should "muscle preservation" and "body composition" be explained honestly, with evidence levels and without promising results?
8. Should the app suggest any frequency at all, or leave it to the person's own goal? (The existing plan text says two short sessions a week is a common general guide, not a requirement; the reviewer should confirm or remove it.)

## Proposed content structure

Per exercise: `id, name, patterns[], equipment, level, cues[], commonMistakes[], easier, harder, jointFriendlyAlternative, safety[]`, then workouts composed of exercises with timing. The existing gate requires an independent, approved review before any of it is offered.

## Evidence and sources to check against current editions (reviewer confirms)

Position stands and guidelines from recognised exercise-science bodies (for example ACSM), WHO physical-activity guidance, national physical-activity guidelines, and systematic reviews on resistance training. Each statement carries its own evidence label.

## Dependencies

A qualified author and reviewer (not available yet); the existing review gate; optionally media rights if demonstrations are filmed (separate licensing process).

## Checklist

Same as the D.6 checklist: independent review, sources, no diagnosis or outcome promises, regressions and joint-friendly versions for every movement, safety notes, language filter, accessibility, flag off by default, owner approval before activation.
