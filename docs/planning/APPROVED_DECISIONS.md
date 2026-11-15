# Approved decisions (weight-management expansion)

Recorded from the owner's message of 2026-11-15. Anything not listed here is **not** approved.

## Approved

1. Design one unified, explainable Weight Management Engine in `packages/shared`, reusing the existing planning, nutrition, wellness-preference, habit and Pulse systems.
2. Dancehall and reggae stay central. Prepare the workout-style constraint change as a **proposal** and identify how original or properly licensed choreography can be incorporated.
3. V1 priorities: personalised goals, dance fitness, smart nutrition, everyday movement, strength foundations, cultural eating, mindful eating, habits and weight maintenance. Reuse existing screens wherever possible.
4. Draft the exact SQL for pathway preferences and fasting plans, **without applying it**.
5. Correct `supabase/hosted-history.json` and `docs/INTEGRATION_STATUS.md` to the independently verified hosted state: 13 migrations, 48 public tables with RLS. (Done; see "Records corrected" below.)
6. Evaluate local notifications. **No native dependency and no device build.**
7. Fasting stays behind a feature flag and the current coach restrictions are preserved. 12:12, 14:10 and 16:8 are designed as optional schedules only. Fasting is not enabled until the policy, screening and clinical content are reviewed and explicitly approved.
8. Clinician-directed treatment support is a later phase. No medication recommendations, prescriptions or treatment adjustments, ever, in this product.
9. PR #45 and its existing changes are preserved and not merged until required checks pass. Planning documents stay separate from implementation decisions.
10. No migrations, hosted-database changes, production deploys, paid services, TestFlight uploads or merges into `main` without explicit authorisation.

## Not approved (still needs an explicit yes)

- Creating or applying any migration, including the revoke migration already in PR #45 (it is a repository file; applying it to the hosted project is a separate authorisation).
- Any change to the hosted project's data or permissions, including inserting feature-flag rows or new foods.
- Adding `expo-notifications` or any native dependency; any device or EAS build.
- Enabling fasting for anyone; changing the coach's fasting refusals.
- Starting the V1 build. The sequence is for review first.
- Adding a fourth goal intent for strength (`goalIntent: 'strength'`). It is code-only but changes a stored value, so it is raised as a question in the sequence.

## Records corrected (decision 5)

- `supabase/hosted-history.json`: 13 applied (hosted versions and file hashes), pending is only `20261213000100_household_trigger_revoke.sql`. Evidence: on 2026-11-15 a read-only catalog query of the hosted project was compared with a clean local build of the 13 migrations plus seed; columns, constraints, functions (including a hash of each function body), indexes, policies, triggers and RLS all matched. The fingerprint does **not** cover grants, so execute privileges were not part of that comparison. Byte-equality of the hosted migration statements for the last five was not read back.
- `docs/INTEGRATION_STATUS.md`: hosted row now reads "schema verified, behaviour not run". Short status notes were added to `LIVE_VERIFICATION.md`, `MIGRATION_SETUP_CHECKLIST.md` and `SECURITY_DEFINER_REVIEW.md`, which described the older 8-migration state. These three are historical records, so they were annotated rather than rewritten.
