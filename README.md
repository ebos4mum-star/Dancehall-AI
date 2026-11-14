# DanceHall Fit AI

A standalone, global, AI-powered dance fitness, nutrition, weight-management and lifestyle coaching app. **Status: Phase 0B foundation plus Batches A-D, on a development mock.** No cloud backend, AI service, subscription or content exists yet.

This repository is **public during development** so its source can be read, but it is **all rights reserved**: no open-source or other licence is granted. Never commit real secrets, private health data or real food photographs.

| Path                       | Contents                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `apps/mobile`              | Expo / React Native / TypeScript app shell (Today, Dance, Food, Coach, Me)            |
| `apps/admin`               | Next.js admin shell (no sign-in or data yet)                                          |
| `packages/shared`          | Units, nutrition interfaces, entitlements, safety rules, permissions, schemas, errors |
| `packages/ai`              | AI response schemas, cost and budget logic, gateway with a mock provider              |
| `supabase`                 | Prepared for a new independent project; nothing created                               |
| `evals`, `scripts`, `docs` | Safety cases, repository checks, specification                                        |

Status: Phase 0B foundation plus Batches A-D (identity and goals, nutrition with simulated photo logging, dance fitness, and the Fit Concierge with a simulated coach) running on a development mock. No cloud project, AI service or content exists.

To go live, see [docs/LIVE_INTEGRATION.md](docs/LIVE_INTEGRATION.md). Start with [docs/MASTER_SPEC.md](docs/MASTER_SPEC.md) and [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md).

## Develop

```bash
corepack enable
pnpm install
pnpm verify   # secret scan, workspace and CI checks, script tests, format, lint, typecheck, tests
```

Copy `.env.example` to `.env.local` for local values (git-ignored). Nothing in Phase 0B needs real credentials.
