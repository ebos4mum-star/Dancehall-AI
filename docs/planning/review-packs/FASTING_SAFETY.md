# Review pack: fasting safety (LATER PHASE, DRAFT, not for publication)

**Reviewers:** a clinician (primary), a registered dietitian, and a clinician or dietitian with eating-behaviour expertise. The reviewer must not be the author.
**Status:** preparation only. **Fasting is not built, not enabled, and not reachable in the app.** The coach still refuses fasting requests and that behaviour is unchanged. No independent clinical or professional review of anything below has taken place, and nothing here claims one. This pack exists so a later phase can start from a reviewed position instead of from scratch.

## What is and is not on the table

- **Only** optional time-restricted eating windows of 12:12, 14:10 and 16:8, as an educational scheduler with reminders.
- **Never:** one-meal-a-day, dry fasting, extended or alternate-day fasting, very-low-calorie windows, fasting targets, fasting challenges, durations, streaks, badges, leaderboards, or any penalty or message for ending early.
- **Education must say plainly** that fasting is not inherently better than a sustainable calorie deficit, and that it is optional. (Whether that statement and its evidence label are acceptable is a question for the reviewer, not an assumption.)

## What exists in the repository today (all inactive)

- The coach's fasting refusals (`packages/shared/src/coach-safety.ts`, `docs/NUTRITION_SAFETY.md`): unchanged and still enforced.
- A **proposal** for a minimal `fasting_plans` table, not a migration and not applied (`docs/planning/SQL_PROPOSALS_NOT_APPLIED.md`, M2). It stores only the chosen schedule and the screening **outcome**, never answers or durations, and is protected by a server-side flag that is created off.
- The engine's eating-concern and pregnancy handling, which already withholds weight-loss targets. The engine never outputs fasting, and a test searches its whole output for it.

## Decisions the clinician must make (none is assumed)

1. **Who should not be offered a fasting schedule at all, and who should be referred to individual advice?** Draft list to confirm, correct or replace: pregnancy or trying to conceive; breastfeeding; a current or past eating disorder or a concern about disordered eating; diabetes treated with insulin or medicines that can cause low blood sugar; underweight; a clinician's advice to eat at regular times; other medical conditions or medicines where timing matters; under 18 (already excluded app-wide). Also whether older adults, kidney disease, gout, a history of fainting or irregular shift work should be added.
2. **How should screening be worded** so that a "yes" or an unanswered question never reads as a diagnosis and never offers a workaround? The current rule, to be confirmed: an unanswered question means not cleared.
3. **What should happen if someone reports dizziness, feeling faint or unwell while using a schedule?** (Draft: stop and seek help, offer to pause. Wording to be written by the reviewer.)
4. **Should hydration reminders be offered, and with what wording?**
5. **Is a 12:12 default the right least-restrictive suggestion?** And should 14:10 and 16:8 sit behind additional education?
6. **What should the app say about medicines and meals?** (The app must never advise changing, timing or stopping a medicine. Likely answer: nothing beyond "ask your clinician".)
7. **How should the app handle religious or cultural fasting** (for example observed fasts) without contradicting or prescribing?

## Evidence summary the dietitian and clinician must write (draft questions, no claims)

- What does the current evidence say about time-restricted eating for weight and health, in which populations, over what time frames, and how does it compare with an equivalent calorie reduction? Which evidence label applies (strong, moderate or emerging, traditional, unsupported)?
- Which sources are acceptable (systematic reviews, major guidelines), with years and links?
- Which statements must be avoided because the evidence does not support them?

## Notification and privacy requirements (design, not built)

Off by default; neutral lock-screen text with no weight, calorie, fasting duration or body words; quiet hours; one-tap stop for each reminder and for all; no tracking of whether reminders were opened. Local notifications need a native dependency and a device build, neither of which is approved (`docs/planning/LOCAL_NOTIFICATIONS_EVALUATION.md`). Fasting data is special-category health data: it must be minimal, exportable and deleted with the account.

## Code changes that a later phase would need (for planning only)

Narrow the coach policy so scheduling education for the three windows is permitted for cleared people while prescriptions, extended fasting and "fast to lose X" stay refused; pin both sides with tests; add the screening module with the unanswered-is-not-cleared rule; one screen under Food; the M2 migration (separately approved); the feature flag, created off. **None of this starts without the review and an explicit approval.**

## Gates before any activation

Independent clinician and dietitian review recorded; screening and education approved; policy change approved; flag created off and turned on only by the owner; native notification work separately approved; device verification; counsel sign-off per country.

## Checklist (from the expansion document, D.6)

- [ ] Independent review by a clinician and a dietitian, recorded
- [ ] Evidence level and named sources for every statement
- [ ] Exclusions and referral wording approved
- [ ] No diagnosis, dosing, medicine advice or outcome promise
- [ ] Language checked (no streaks, durations, badges, "longest fast", competition)
- [ ] Policy change drafted, reviewed, approved
- [ ] Tests pin the refusals and the screening rule
- [ ] Flag off by default; owner approval recorded before activation
