# AI Cost Controls

Status: the gateway's decision logic is implemented in `packages/ai` and tested with a mock provider. **No live AI service is connected and nothing has been spent.**

## Hard limits to understand first

- The USD $50 ceiling applies to **AI API spend**, not other operating costs.
- Application-side controls **cannot guarantee an absolute provider billing limit.** Concurrent requests, retries, delayed provider billing and usage that fails to be recorded can push real spend past the configured ceiling.
  The gateway reduces this by reserving a worst-case cost before each call, but it cannot remove it.
- Therefore the application ceiling **must be paired with** the provider's own spend limit and alerts wherever the provider offers them, set below the application ceiling. Whether the chosen plan supports this must be confirmed before enabling AI (gate A1g).

## Design (server-side only)

1. **No keys in the app.** The mobile app never holds a provider key or calls a provider. Keys are Edge Function secrets.
2. **Order of checks** for every request:
   1. Global kill switch, then per-feature kill switch (free, always win).
   2. Safety screen (crisis / disordered-eating signals get support resources instead of a billable call).
   3. Feature flag, entitlement tier and per-user monthly allowance.
   4. Budget reservation of the worst-case cost (`input tokens x price + max output tokens x price`). Refused with `budget_exhausted` if committed spend plus the reservation exceeds the ceiling.
   5. Provider call, then structured-output validation (zod). Invalid output is rejected and not shown; its cost is still recorded.
   6. Settle the reservation with the actual cost, record a usage event, emit alerts.
3. **Structured responses only**: food photo, concierge and weekly review each have a schema; unknown shapes are rejected.
4. **Per-feature accounting**: every call writes a usage event (user, feature, model, tokens, cost, outcome, time). Outcomes: `ok`, `schema_rejected`, `provider_error`, `risk_referral`.
5. **Quotas by tier**: `PROPOSED_AI_ALLOWANCES` in `packages/shared`. These are placeholders to tune from measured beta cost, not commitments.
6. **Alerts** at 50%, 80%, 90% and 100% of the ceiling (`ALERT_THRESHOLDS`); delivery channel (admin dashboard, email) is decided in Phase 5.
7. **Automatic rejection** of new billable requests once committed spend reaches the ceiling, until the next month or an owner-approved increase.
8. **Kill switches** are feature flags in the database, changeable by staff with `flags.manage`, each change audited.
9. **Mock responses** (`MockAiProvider`) are the default in development and CI (`AI_PROVIDER=mock`).

## Cost-reduction levers (to apply before and during the beta)

- Use the smallest adequate model per feature; route routine chat to a smaller model.
- Cache stable prompt prefixes; keep prompts short; send resized images only.
- Ground nutrition numbers in reference data instead of asking the model for them.
- Batch weekly reviews; skip users with no activity.
- Per-user daily burst limits in addition to monthly allowances.

## Open items

- `PLACEHOLDER_PRICES` in `packages/ai/src/cost.ts` are fake. Replace with the provider's current published prices before any live call.
- Choose provider-side limit values (suggest 80% of the application ceiling) once the provider is chosen.
- Persist the budget in Postgres with row locking (the in-memory state is for logic and tests only).

## Implemented in Batch D (local)

- **The gateway now runs real coach traffic** (chat and weekly reviews) as well as food photos, against the mock provider only. No live AI service is connected and nothing has been spent.
- **Safety runs before cost.** Crisis, extreme-restriction, symptom and under-18 messages get a fixed safe reply with no provider call, no cost and no quota use, so a person is never blocked from safety information by an allowance, budget or kill switch on normal chat. Unsafe or pressuring model output (guilt, streak pressure, diagnoses, very low calorie prescriptions, weight competition) and any proposed change that breaks its strict schema is rejected after the call; the cost is still recorded (`output_rejected`, `schema_rejected`).
- **Database enforcement** (migration `20261204000100_coach.sql`): `ai_usage_events` (append-only, owner-readable, detached rather than deleted when an account is deleted), `ai_user_usage` and `ai_budget` (server-only), and four service-only functions: `ai_budget_reserve`, `ai_budget_settle`, `ai_quota_consume`, `ai_quota_refund`. The reservation and quota updates take a row lock, so concurrent requests cannot oversubscribe them.
- **Concurrency is tested for real:** `supabase/tests/concurrency.sh` races 10 separate database sessions: 60 simultaneous reservations against a $5 ceiling grant exactly 5, and 60 simultaneous quota requests against a limit of 3 grant exactly 3. A deliberately non-atomic version of the function was caught by it (8 granted instead of 5).
- **Kill switches:** `feature_flags` rows `ai.kill_all` and `ai.kill.<feature>` (all start off), changeable only by staff with `flags.manage` and MFA, every change audited. In the development build a switch in Coach privacy stands in for it. Everything rule-based (the Daily Fit Plan, workouts, food logging) keeps working while AI is paused.
- **Allowances (proposed, free tier):** 20 coach messages, 1 weekly review and 5 photo analyses per month. Pro allowances are larger. These are placeholders to tune from measured cost.
- **Still application-side only:** as above, these controls cannot guarantee the provider's bill. Set the provider's own limit (see LIVE_INTEGRATION.md).
