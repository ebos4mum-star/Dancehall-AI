# Evals

Fixed, **synthetic** test cases for safety behaviour. They contain no real people, health records or photographs.

- `cases/safety.json`: weight-goal limits, readiness screening, and risk-signal routing. Run by `packages/ai/src/evals.test.ts` as part of `pnpm test`.
- Cases that need a live model (e.g. food-photo accuracy on a labeled meal set) are added only after AI use is authorized, and are run manually, never from CI.

When a safety bug is found, add a case here first.
