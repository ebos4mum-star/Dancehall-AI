# Walkthrough 2026-11-15

27 real screenshots (Playwright, 390x844 @2x) of the Expo web export in development mock mode (synthetic data, no Supabase).
Covers sign-in (dev), 5-step onboarding, Today, Dance, Food, Coach, Me and child screens (goals, progress, challenges, privacy, workout detail, guided session, food add/camera/history/plan/swap/household, coach review/settings).

Reproduce: `pnpm e2e:web` build, then `cd apps/mobile && SHOTS_DIR=../../docs/preview/walkthrough-2026-11-15 node e2e/walkthrough.cjs`.
