# Friends: development-only iPhone test (prepared, not run)

Nothing here uploads a build, uses TestFlight, touches production, or enables Friends for anyone but you. Friends stays OFF in every shared build profile: no EAS profile sets `EXPO_PUBLIC_SOCIAL` (a test pins this) and a production build refuses to start with it on.

## What can be tested today, and what cannot

| Track                                                 | Backend                                                       | Possible now?                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Screens and flows on a real iPhone, local data** | the development mock with clearly labelled `sample_*` members | **Yes, today**                                                                                                                                                                                                                                                   |
| **B. Friends against the hosted staging backend**     | staging `social` function + migration (deployed)              | **Blocked**: staging has no `account` Edge Function, so an app build cannot create a signed-in account there (public sign-up is off). It needs your approval to deploy the account function to staging (and a staging test account flow), or a separate decision |

## Fastest way: the guarded launcher (staging, Friends on for this run only)

```bash
cp scripts/friends-staging.env.example .friends-staging.env   # then paste the staging publishable key into it
bash scripts/friends-staging-ios.sh            # iOS Simulator
bash scripts/friends-staging-ios.sh --device   # a connected iPhone
```

It refuses any project except staging (the development project and everything else are rejected), refuses a secret key, runs `expo run:ios` locally with Xcode and uploads nothing. Friends is switched on only inside that process (preview environment).

## Track A: run it on your iPhone from your Mac (no EAS, no upload)

Requirements: Mac with Xcode, the iPhone connected by cable with Developer Mode on.

```bash
cd apps/mobile
pnpm install
EXPO_PUBLIC_APP_ENV=development npx expo run:ios --device
```

This installs a development build straight onto the phone. It uses mock sign-in and synthetic data stored only on the phone; Friends is on by default in this mode (`social` defaults on in the mock only).

Checklist (tick on the phone):

- [ ] Me tab shows "Friends and goals". Open it.
- [ ] Choose a public name (inline form; invalid and look-alike names are refused with a plain reason).
- [ ] Add `sample_ama`: she answers at once (sample members are synthetic). Add a name that does not exist: "We could not find that person."
- [ ] Open a friend: the privacy notice says only a weekly activity summary can be shared. Toggle sharing on, off; "Stop sharing with everyone" works.
- [ ] A friend who has not shared shows "They have not chosen to share".
- [ ] Block a friend: they disappear from the list and appear under Blocked; unblock works.
- [ ] Complete a workout, then create a challenge with a sample friend, tap "Update my numbers": your minutes appear.
- [ ] Couple goal needs exactly one friend; family goal accepts several.
- [ ] Leave a group: your numbers disappear.
- [ ] VoiceOver reads the toggles and buttons with meaningful labels; Dynamic Type at the largest size does not clip; Reduce Motion respected.
- [ ] Airplane mode: the screen shows a plain error, nothing crashes.
- [ ] Confirm no food, weight or health values appear anywhere on the Friends screens.
      Record device model and iOS version.

## Track B (after approval): staging backend

Needs, in this order, each with your explicit yes: (1) deploy the `account` function to staging only; (2) a staging test account created through the app's normal flow; (3) build variables set on your machine, never in the repository:

```bash
EXPO_PUBLIC_APP_ENV=preview EXPO_PUBLIC_AUTH_MODE=supabase EXPO_PUBLIC_CLOUD_ACCOUNTS=1 EXPO_PUBLIC_SOCIAL=1 \
EXPO_PUBLIC_SUPABASE_URL=https://bxhnrjulksganzydgrgm.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging publishable key> \
npx expo run:ios --device
```

Create a real account in the app (Recovery Key, PIN; no email). A second account needs a second phone or simulator: on the Mac run `npx expo run:ios` again with another simulator (`--device "iPhone 15"`). Repeat the checklist above for real sign-in, public name, requests, blocking, consent sharing, challenge, couple and family goals, and the Delete my account button (the 30-day wait is provisional; ask me to run the server-side executor on staging to prove the cleanup). Tell me when you are done and I remove every account and record from staging.

## Not done and not allowed here

No EAS build, no TestFlight, no App Store, no production profile, no Apple Health. The development Supabase project is not used.
