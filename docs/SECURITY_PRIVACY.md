# Security and Privacy

Status: requirements and design. Controls marked "implemented" exist in code today; everything else is a requirement for the phase named. **No privacy, security or legal review has been done.**

## 1. Public repository rules

This repository is public by owner decision. Public visibility is never permission to expose confidential information.

- Commit only code and documentation suitable for public disclosure.
- Never commit real keys, tokens, passwords, service-role credentials, `.env` files (only `.env.example` with placeholders), private user data or real food photographs. Use synthetic test data.
- **Implemented:** `scripts/check-secrets.mjs` scans tracked and untracked files for secret shapes and tracked `.env` files, prints file, line and rule only (never the value), and runs in CI; its patterns are tested.
- **Implemented:** least-privilege workflow permissions (`contents: read`), no secrets available to CI, `pull_request_target` forbidden by a CI-config check.
- Changing the repository to private later does **not** erase anything already copied, cloned or forked. Treat anything committed as permanently public.
- If a secret is ever committed: revoke it at the provider immediately, then clean history. Removal from git is not revocation.
- Avoid publishing internal production details (project references, dashboards, account identifiers, real admin emails).

## 2. Separation from other products

DanceHall Fit AI is independent of the owner's other production application. Never share: Supabase projects or databases, auth users, keys or secrets, infrastructure, business logic, admin accounts, payment or subscription configuration, or customer information.
**Implemented:** `scripts/check-workspace.mjs` fails if any package depends on another product or if files reference that product's infrastructure. Only general engineering approaches (RLS testing, feature flags, MFA-gated staff permissions, audit logging, automated tests) were reused.

## 3. Data classification

| Class                 | Examples                                                                                           | Rule                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sensitive health data | weight, measurements, food logs and photos, goals, readiness answers, conversations with the coach | Private by default; owner-only; explicit consent; never used for advertising; never shown to staff without an audited, justified path |
| Personal              | birth date, country, display name, email                                                           | Owner-only except display name where sharing allows                                                                                   |
| Operational           | entitlements, usage events, flags                                                                  | Server-written                                                                                                                        |
| Public content        | published workouts, recipes                                                                        | Readable by signed-in users                                                                                                           |

## 4. Required controls

**Database (Phase 1)**

- RLS enabled on every table in the migration that creates it; a structural test fails if any table lacks RLS.
- Explicit grants; nothing exposed by default; only the `public` schema reachable by the Data API; helpers in a private schema.
- Owner-only policies keyed on `auth.uid()`; protected columns (entitlement, usage, roles) not client-writable.
- `SECURITY DEFINER` functions pin `search_path`.
- Append-only, hash-chained audit log for staff actions and configuration changes.
- Staff roles and permissions require a verified second factor (aal2). **Implemented in shared logic:** no role, including admin, passes a permission check without MFA, and no permission grants access to health records.

**Sharing (Phase 8, 10)**

- Household and social sharing is opt-in per category and per person, revocable, and defaults to nothing shared. Team and challenge views show activity totals only.
- Review household sharing for safety scenarios (including coercive control) before launch (gate H1).

**Storage**

- Private buckets, per-user folders, no public read, size and type limits, signed URLs, retention limit for food photos (open decision).

**Client**

- Only the public URL and publishable key ship in the app; secret and service-role keys are rejected at startup. Sessions use secure storage. No analytics SDK that receives health data.

**AI**

- Server-side only; consent for AI processing recorded per purpose; images and prompts are not used to train models by us; provider data-retention terms reviewed before launch; prompts exclude direct identifiers.

## 5. Consent and rights

- Consent purposes (in `packages/shared`): health data processing, AI processing of food photos, AI coach personalization, health-platform sync, social sharing. Each is separate, versioned, and withdrawable.
- Data export and deletion: self-service export of all the person's records; account deletion that removes health data and storage objects within a stated period (period and format are open decisions). Deletion must cascade to backups on their normal rotation, and be documented.
- Age: adults 18+ only. Under-18 birth dates are rejected (implemented); age signals found later lead to account closure.

## 6. International rollout responsibilities

Health-related data is regulated differently by country and state (for example the EU/UK GDPR special-category rules, US state consumer-health-data laws, and others). Before activating any country, qualified counsel must confirm: lawful basis and consent wording, data-transfer mechanism (data is hosted in the US), local representative or registration duties, breach notification duties, and retention rules.
No country is active by default (see GLOBAL_READINESS.md). This document is not legal advice.

## 7. Incident basics (to formalize before beta)

Named owner for incidents, a way to rotate every secret quickly, a breach-notification checklist per activated country, and a published contact for security reports.
