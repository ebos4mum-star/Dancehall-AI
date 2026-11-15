# Edge Functions

**`account`** (code only, not deployed): email-free cloud accounts and lost-phone recovery. See `docs/CLOUD_ACCOUNTS_ACTIVATION.md`. Its shared logic is generated into `_shared/generated/` from `packages/shared` by `node scripts/sync-edge-core.mjs` (checked by `pnpm check:edge`); do not edit those copies.

## Planned

One routed function (`api`) is planned, holding all provider secrets server-side. Routes: AI gateway, nutrition lookup, subscription webhooks, media signing.
Not implemented in Phase 0B. See docs/AI_COST_CONTROLS.md.
