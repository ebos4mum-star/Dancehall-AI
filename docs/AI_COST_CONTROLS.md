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
