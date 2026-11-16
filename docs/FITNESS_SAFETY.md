# Fitness Safety

Status: **provisional.** No certified fitness professional or clinician has reviewed this, and no approval is claimed. Review (gate F1) is required before any public release.

## 1. Readiness screening (implemented: rules and tests; screens in Phase 2)

- A PAR-Q-style screening at onboarding asks seven yes/no questions (heart condition or advice to limit activity, chest pain, dizziness or loss of balance, bone or joint problems, blood-pressure or heart medication, pregnancy or recent birth, any other reason for care).
- Any "yes", or any unanswered question, routes the person to **low-impact defaults** and a recommendation to speak with a health professional first. A "yes" never diagnoses anything and never locks the person out.
- The result is stored privately (health data, owner-only).
- The screening is repeated when circumstances may change (after a long break, after reported pain) and can be updated by the person at any time.

> **Update (owner decision, progression phase):** achievements stay permanent, and the earlier "no streaks" rule is replaced by streaks that are safe by design: planned rest days never break them, one miss a week is forgiven, XP and league numbers are capped, nothing is rewarded for food amounts or weight, and a rest note replaces further reward after a very long day. See `docs/GAMIFICATION_ARCHITECTURE.md`.

## 2. Programming rules

- Every workout has a warm-up and a cool-down/recovery section; Quick Fit sessions (5, 10, 15 minutes) include a short warm-up.
- Every routine has a **low-impact alternative** and clear levels (beginner, intermediate, advanced). Impact and intensity are shown before starting.
- Progression is gradual; plans never ramp volume sharply or schedule hard sessions on consecutive days for beginners.
- "Stop if you feel pain, dizziness or chest discomfort" is shown before every session; the app offers an easy way to stop, shorten or switch to low impact.
- No exercise is used as punishment for eating. Missed days produce a Comeback Plan, not guilt.
- Travel and Busy-Day adaptations reduce time and equipment, not safety steps.
- Activity targets for weight goals never push beyond the person's chosen level.

## 3. Content requirements

- All routines are reviewed by a certified fitness professional and recorded in `content_reviews` before publication (admin workflow, Phase 3).
- Instructors demonstrate modifications; videos include floor space and footwear guidance.
- Instructor-led programs (4/6/8 weeks) need an instructor agreement and professional review (gates L1, L3, F1).

## 4. Claims

No medical claims, no promises of results, no "spot reduction" claims. Use "can help" and "may". Include a visible disclaimer that the app is not a substitute for medical advice.

## 5. Open items

- Pregnancy and postpartum content needs specialist review before any such content exists.
- Content for older adults, people with limited mobility and injury returners is deferred until reviewed.
- Insurance and liability review for fitness content (owner decision).

## 6. Implemented in Batch C (local; sample text outlines)

- **Structure is enforced, not just recommended.** A workout cannot be published unless it has a warm-up, a main section, a cool-down, a duration for every block, **a low-impact version of every block**, and safety notes. This is checked in the database (`app.blocks_problems`, tested) and mirrored in shared code and the admin checklist.
- **Low-impact is a full alternative.** It can be switched on before starting or mid-session without losing your place. When the readiness screening routed someone to low-impact options, Quick Fit suggestions are limited to low-impact workouts and the low-impact version is switched on by default (they can turn it off). High-impact workouts say so before you start.
- **Guided sessions** run from text and a timer: pause, skip, previous, and end early. Only time actually spent exercising is recorded (paused and skipped time is not).
- **Gentle tracking.** Activity totals show sessions, minutes and active days per week with no streaks to lose and no penalties for rest days; effort is a self-rated "easy / moderate / hard / very hard".
- **The sample content is not reviewed.** The 14 outlines are original, generic and text-only, and are marked as samples in the data, the database (`is_synthetic`, immutable) and every screen. They cannot pass the public-release checklist; real routines need review by a certified fitness professional who is not the author (gate F1).
- **Not built:** adaptive plan progression, pregnancy/postpartum or injury-return content, and any video or music guidance.

## 7. Strength training (contract only)

- `packages/shared/src/strength.ts` defines the exercise and workout contract and the activation gate (`strengthWorkoutProblems`). **No exercises or workouts are shipped.** A workout can be offered as guided content only when it and every exercise in it have form cues, an easier version, safety notes, a warm-up and cool-down, valid sets, and approval by an independent qualified reviewer with a review record (gate F1). Media needs separate licensing.
- Until such content exists the app offers self-directed strength logging (minutes and style, optional) that counts as movement in the Daily Fit Plan, challenges and the weekly review, and the Dance tab says guided strength is not available.
