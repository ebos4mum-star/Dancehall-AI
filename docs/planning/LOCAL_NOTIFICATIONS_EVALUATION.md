# Local notifications: evaluation

Status: **evaluation only.** No dependency has been added, no native configuration changed, no build made, and nothing has been tested on a device. Facts about library behaviour below come from general knowledge of Expo and iOS and **must be confirmed against the current Expo SDK 58 documentation before adoption**.

## What would use them

Optional reminders only: hydration, a movement or dance nudge, a wind-down time, a weekly check-in and, if and when approved, a fasting-window reminder. Fasting is flagged off and not enabled; nothing here enables it.

## Why local rather than push

Local notifications are scheduled on the device. No server, no push token and no third-party delivery service ever sees the reminder content, so health-adjacent text never leaves the phone. No paid service is needed. Remote push would add a token store, a sender and privacy exposure for no V1 benefit.

## Requirements that matter for this product

| Requirement                                                          | Design                                                                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Off by default**, one-tap stop per reminder and for all            | A single "Reminders" switch in My approach; each type individually toggleable; "Pause all"                                                                                          |
| **Neutral lock-screen text**                                         | No weight, calories, fasting duration, or body words. Examples: "Time for a glass of water", "Your dance session is ready when you are". Nothing shaming, no streak or loss framing |
| **Quiet hours** and **no stacking**                                  | Respect a user-set quiet window; cap reminders per day; never more than the person chose                                                                                            |
| **Permission handling**                                              | Ask only when the person turns reminders on, with a plain explanation first; if denied, show how to enable in Settings and keep everything else working                             |
| **Time zones, DST and travel**                                       | Schedule from local wall-clock times; reschedule on app start and when the profile time zone or device zone changes                                                                 |
| **iOS limit** on pending local notifications (commonly stated as 64) | Schedule a rolling window (for example the next 7 days) and refresh on open; do not rely on infinite repeats for variable plans                                                     |
| **Cleanup**                                                          | Cancel all on sign-out, account deletion request, withdrawal of health-data consent, and when a feature is disabled by flag                                                         |
| **Accessibility**                                                    | Notification wording is plain text; also provide an in-app list of what is scheduled                                                                                                |
| **No tracking of responses**                                         | Do not record whether a reminder was opened, to avoid engagement pressure and extra data                                                                                            |

## What can be built now **without** any dependency

A pure module in `packages/shared` (design only for now) that, given the person's reminder preferences, quiet hours, time zone and a date range, returns the list of reminders to schedule (id, local time, neutral text key). It is fully unit-testable (DST, quiet hours, caps, cancellation rules), and the native scheduling sits behind a small port so it can be a fake in tests. This is the part that carries the product logic, and it is independent of the library choice.

## What cannot be done without approval

Adding `expo-notifications` (or any alternative), updating `app.json` plugins, an iOS build to test permissions, scheduling on a real device, background behaviour checks. All of that needs your authorisation of a native dependency and a device build, which has **not** been given.

## Alternatives considered

| Option                                 | Verdict                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `expo-notifications` local scheduling  | The expected choice; maintained with Expo; confirm the SDK 58 API and any required plugin |
| Calendar or Reminders integration      | More intrusive permission and data surface; not recommended                               |
| Remote push                            | Not needed; adds server, tokens, privacy exposure                                         |
| In-app reminders only (cards on Today) | Zero native work; works as an interim and as a fallback when permission is denied         |

## Recommendation

1. Build the pure reminder planner and the in-app "reminder card" fallback first (no dependency).
2. When you authorise a native dependency and a device build, add `expo-notifications` behind the port and verify on a real iPhone: permission flow, scheduling across a DST change, quiet hours, cancellation on sign-out, and lock-screen text.
3. Until then, report reminders as **not verified on device**.

## Decisions needed

1. Approve building the pure planner and the in-app reminder fallback now (no dependency)?
2. Which reminder types for V1 (suggested: hydration, movement, wind-down, weekly check-in)?
3. When do you want a device build authorised for native verification?
