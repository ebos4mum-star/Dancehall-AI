# Pulse celebrations (daily, weekly, monthly, yearly)

Approved feature. Built on the existing animated Pulse moment system (`apps/mobile/src/pulse`: the `celebrate` state, `MomentHost`, haptics, reduced motion). It does **not** use generic badges or static banners.

## What is celebrated

All from the person's own records and the goals they set. Pure logic: `packages/shared/src/celebrations.ts`.

| Period  | Achievement                                                                                       | Needs                                      |
| ------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Daily   | Water goal reached (their own goal, or the general guide)                                         | logged water                               |
| Daily   | Every active habit ticked                                                                         | at least one habit                         |
| Daily   | Moved today: 10 minutes or more of dance, walking and strength together                           | recorded movement                          |
| Weekly  | Weekly movement-minutes goal reached (Monday week, dance + walks + strength)                      | the person's own weekly minutes goal       |
| Monthly | Weekly goal met in at least 3 weeks that start in the month                                       | the same weekly goal                       |
| Yearly  | Weekly goal met in at least 26 weeks that start in the year                                       | the same weekly goal                       |

The monthly and yearly thresholds and the 10-minute daily bar are **provisional defaults**, all in one object (`CELEBRATION_RULES`), pending owner approval of the goal model. Existing challenge celebrations are unchanged and not duplicated.

## Rules it follows

- Real data only; nothing is estimated, and nothing is celebrated from nothing.
- **Once per achievement.** Each has a stable id (`daily:water:2026-06-17`). A per-person ledger on the device is written _before_ anything is shown, so re-renders, retries and quick successive changes cannot repeat it. Deleting a log and re-adding it does not celebrate again.
- **No retroactive flood.** The first run on a device only records what is already achieved. A corrupt ledger behaves the same way.
- One Pulse moment at a time; if several are earned together they are shown biggest period first, spaced out, at most three per evaluation.
- Never celebrates weight, calories, measurements or any food number, and never mentions a missed day, a streak or a shortfall. Weight-goal celebrations are **not** included: they need owner approval and the same safety rules as weight goals (no numbers for eating-concern, pregnancy/postpartum or numbers-off settings).
- Reduced motion is honored by Pulse itself (the figure does not move); haptics are brief and success-only.

## Known limits (follow-ups)

- The ledger is per device, so a second device can celebrate an achievement the first already showed. A synced ledger would need a new table and migration.
- There is no separate on/off switch for celebrations yet; it follows the existing reduced-motion setting. A switch in settings is a small follow-up.
- Monthly and yearly celebrations need the person to have set a weekly movement goal (Goals, "Your focus").
- Weight-goal and body-measurement celebrations are intentionally absent.
