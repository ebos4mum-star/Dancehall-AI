# Implementation Roadmap

Only **Phase 0B** is complete. Every later phase needs the owner's explicit approval before it starts. Order favors a focused paid beta (Phases 1-7) before expensive expansion.

| Phase | Name                           | Scope                                                                                                                                                                     | New external cost                              | Exit criteria                                      |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| 0B    | Repository foundation          | Monorepo, shared logic, AI gateway reference logic with mocks, mobile and admin shells, CI, docs.                                                                         | none                                           | `pnpm verify` green                                |
| 1     | Backend foundation             | Create the dedicated Supabase project; auth; profiles and private health tables; consents; feature flags; staff roles and MFA; audit log; export and deletion; RLS tests. | Supabase (free tier to start)                  | RLS structural test and access tests pass; gate P1 |
| 2     | Onboarding and goals           | Sign-up, age and country, units, consent screens, readiness screening, goals with safety rules, weight entries, Today screen.                                             | none                                           | Gate S1 provisional rules wired; usability pass    |
| 3     | Dance fitness                  | Workout content model, small licensed launch library, Quick Fit, plans, history, habits, milestones, licensing records in admin.                                          | Video hosting; music and video rights          | Gates L1, L2, F1                                   |
| 4     | Nutrition                      | Food search, barcode, manual logging, editable photo estimates (mock first), recipes, swaps, cultural starter set.                                                        | Nutrition data (free sources); AI usage        | Gates N1, N2                                       |
| 5     | AI Fit Concierge               | Unified assistant, daily adjustments, weekly reviews, Comeback Plan, usage metering live.                                                                                 | AI (ceiling USD $50/month)                     | Gates S1, A1g, P2                                  |
| 6     | Subscriptions and admin        | Free/Pro tiers, store billing sandbox, entitlements, admin content/flags/support/cost views.                                                                              | Subscription service; store developer accounts | Gates B1s                                          |
| 7     | Paid beta                      | Invite-only adults 18+, a small set of activated countries, measured cost per user, support process.                                                                      | Store fees; reviews                            | Gates for each activated country                   |
| 8     | Community                      | Challenges, buddies, teams, invitations, optional sharing, reporting and moderation.                                                                                      | Moderation tooling                             | Gates M1, M2, P3                                   |
| 9     | Grocery and extended nutrition | Grocery lists, pantry, budget plans, Eat Out Smart, barcode depth, optional health-platform sync.                                                                         | Possibly commercial food data                  | Gates N1, N2, P2                                   |
| 10    | Household                      | Couple/family plans, shared lists, household challenges, Household Pro.                                                                                                   | none                                           | Gates H1, P3, B1s                                  |
| 11    | Programs and events            | Instructor-led 4/6/8-week programs, Dance Party Mode, community milestone events, optional sponsored challenges.                                                          | Instructor and music rights                    | Gates L1-L3, C1/C2                                 |
| 12    | Voice                          | Voice coaching and voice food-log corrections.                                                                                                                            | AI voice usage                                 | Gates P2, A1g                                      |

## Dependencies that are not engineering work

- Legal: terms, privacy notice, health disclaimers, per-country review.
- Professionals: registered dietitian (S1, N3), certified fitness professional (F1).
- Rights: video, music and instructor agreements (L1-L3).
- Accounts: Apple Developer, Google Play, subscription service, Supabase organization, AI provider workspace with a provider-side spend limit.

Phases 8-12 keep every approved feature on the roadmap; they are deferred, not removed.
