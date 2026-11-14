# Decisions

## Approved by the owner

| Decision                    | Value                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Product                     | DanceHall Fit AI                                                                                                 |
| Repository                  | `ebos4mum-star/Dancehall-AI`, **public during development** (owner-approved, to conserve GitHub Actions minutes) |
| Audience                    | Adults 18+                                                                                                       |
| Beta target                 | Global / multiple countries; each country must pass activation gates                                             |
| Language                    | English first, localization-ready                                                                                |
| Units                       | Metric and imperial, user-selected; stored canonically as metric                                                 |
| Backend                     | New dedicated Supabase project, US region (not created yet)                                                      |
| Monthly AI spending ceiling | USD $50 (AI API spend only)                                                                                      |
| Pro test price              | USD $9.99/month                                                                                                  |
| Household Pro               | Planned, price undecided                                                                                         |
| Platforms                   | iOS first, Android ready                                                                                         |
| Stack                       | Expo / React Native / TypeScript; Next.js admin                                                                  |
| Excluded                    | Money-staking, deposit forfeiture, cash penalties                                                                |

## Technical decisions made in Phase 0B

1. **pnpm workspaces**, hoisted linker (Expo/Metro resolves native modules most reliably that way). Node 22.
2. **Source-only shared packages** (no build step); extensionless imports.
3. **Vitest** for pure logic; no React Native component test runner yet (added when screens carry logic).
4. **Zod 4** for validation and AI response schemas.
5. **Canonical metric storage**; conversion only at the edges.
6. **Safety rules in code**, individualized, with thresholds labeled provisional until professional review.
7. **Mock-first AI**: the gateway is built and tested against a mock provider; no provider SDK is installed.
8. **Single routed Edge Function** planned instead of many, to keep secrets and deploys simple.
9. **No custom illustration library yet**: a vector icon set is used as a placeholder; custom illustrations wait for owner-approved identity.
10. **CI**: standard Ubuntu runner, no secrets, no schedules, no native builds (see GITHUB_ACTIONS.md).
11. **Separation from other products**: this project shares no code dependency, infrastructure, accounts, credentials or data with any other product, including the owner's separate production app (a CI check fails on references to it). Only general engineering approaches were reused.

## Open decisions (owner)

1. ~~Licence~~ Decided: all rights reserved.
2. **App identifiers**: iOS bundle identifier and Android package name (need the developer-account owner/legal entity).
3. **Legal entity** and the Apple/Google developer accounts to use.
4. **Brand identity**: logo, final palette, typography, illustration style (approval required before major implementation).
5. **Beta countries** and the activation order.
6. ~~Food photo retention~~ Design decided (24 hours after successful analysis unless saved); counsel must validate it, and retention exceptions (for example failed analyses, abuse reports, legal holds) must be documented.
7. **AI provider and models**, and whether provider-side limits are available on the chosen plan.
8. **Subscription service** and Pro pricing beyond the USD $9.99 test.
9. **Video host** and the content production plan (own shoots vs. commissioned vs. licensed).
10. **Music plan**: commissioned, royalty-free with written terms, or licensed catalogue.
11. **Professional reviewers**: registered dietitian, certified fitness professional, privacy counsel.
12. **Supabase organization** ownership and who holds the admin accounts.
13. **Household Pro** price and whether it relies on store family sharing.
14. **Data-export format** and deletion timing commitments.
