# Walkthrough 2026-11-15

27 real screenshots of the web export (mock auth, synthetic data, 390x844 @2x, light), captured by `apps/mobile/e2e/walkthrough.cjs` from the PR 51 head.
Order: sign-in (dev), onboarding 1-5, Today, Dance, Food, Coach, Me, Goals, Progress, Challenges, Privacy, Dance history, Food add/camera/history/plan/saved/swap/household, Coach review/settings, workout detail, guided session.
Reproduce: `cd apps/mobile && EXPO_PUBLIC_AUTH_MODE=mock pnpm export:web && SHOTS_DIR=../../docs/preview/walkthrough-2026-11-15 node e2e/walkthrough.cjs`.
Known gap: the script could not click a workout card, so shot 26 is not the workout detail screen.
