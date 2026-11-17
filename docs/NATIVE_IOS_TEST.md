# Native iOS verification: runbook for your Mac (not yet run)

Status: **NOT RUN.** The build environment is Linux with no Xcode, no iOS Simulator and no iPhone, and no Mac is connected to this session, so nothing in this file has been executed natively. Nothing here creates an EAS or TestFlight build, changes signing, resets a simulator or erases data.

## 0. Prerequisites (once)

```bash
xcode-select -p                      # Xcode installed
xcrun simctl list devices available  # at least one iPhone simulator (do NOT erase or reset any)
node -v && corepack enable && pnpm -v
git clone https://github.com/ebos4mum-star/Dancehall-AI.git   # or use your existing checkout
cd Dancehall-AI && git fetch origin && git checkout feature/overnight-nutrition-fitness && git pull --ff-only
git branch --show-current && git status -sb      # must say feature/overnight-nutrition-fitness, clean
pnpm install
```

## 1. Launch against staging with Friends on (this run only)

```bash
cp scripts/friends-staging.env.example .friends-staging.env      # git-ignored
# edit .friends-staging.env: paste the STAGING publishable key (Supabase dashboard, project <staging-ref>, Settings, API). Never a secret key.
bash scripts/friends-staging-ios.sh            # iOS Simulator
bash scripts/friends-staging-ios.sh --device   # a connected iPhone (needs your own signing set up in Xcode; the script does not touch it)
```

The launcher refuses any project except staging, refuses secret keys, and runs `expo run:ios` locally. For a second account, run it again on another simulator: `xcrun simctl boot "<other iPhone>"` then `npx expo run:ios --device "<other iPhone>"` from `apps/mobile` with the same variables exported (`set -a; . ../../.friends-staging.env; set +a; export EXPO_PUBLIC_APP_ENV=preview EXPO_PUBLIC_AUTH_MODE=supabase EXPO_PUBLIC_CLOUD_ACCOUNTS=1 EXPO_PUBLIC_SOCIAL=1`).

## 2. Checklist (tick and note anything odd; every item is native-only unless marked)

**Account and lock**

- [ ] Create account: no email field; two security questions; 6-digit PIN twice; the 36-character Recovery Key is shown once and is gone after you confirm the backup.
- [ ] Force-quit and relaunch: still signed in, PIN lock appears, the right PIN opens it, a wrong PIN is refused, repeated wrong PINs lock out.
- [ ] Face ID (physical iPhone; the Simulator can use Features, Face ID, Matching Face): offered, unlocks, cancelling falls back to the PIN.
- [ ] Restart the simulator or phone: still signed in after the PIN (credential survived in the Keychain).
- [ ] Airplane mode: opens to the lock screen, local features work, no crash.
- [ ] Sign out then sign in again from the stored device credential.

**Friends (staging backend)**

- [ ] Me tab shows "Friends and goals"; choose a public name (a look-alike such as `adm1n` is refused).
- [ ] With the second account: send a request, accept, decline, withdraw, remove.
- [ ] Block: the blocked person's request looks the same as a request to an unknown name; unblock.
- [ ] Share the weekly summary with one friend: the friend sees it; turn it off or tap "Stop sharing with everyone": it disappears at once.
- [ ] Confirm no food, weight or health value appears anywhere on the Friends screens.
- [ ] Challenge (with a friend), couple goal (exactly one friend), family goal (several); "Update my numbers" after completing a workout shows the server-calculated minutes; leave a group and your numbers disappear.
- [ ] Account deletion (Privacy, Delete my account). The wait is provisional; afterwards tell me and I run the staging executor and confirm the other account no longer sees you.

**Nutrition and progress**

- [ ] Food tab: log a meal; edit and delete an item; History shows "Log again today" and "Copy this day to today".
- [ ] Fridge to meal (Food shortcut): type `jollof rice, grilled chicken, salad`; recipes appear with what is missing; swap an ingredient; "Log this meal" opens the review screen with the same calories.
- [ ] Meal plan: choose Recipes, 7 days, save; open the shopping list.
- [ ] Progress: the "Your week / Your month" card; workout energy is a range with the "not added to your guide" note; hide-numbers setting hides the figures.
- [ ] Barcode (**physical iPhone only**: the Simulator has no camera): by default lookups are OFF and the screen offers manual entry. Only if you set `EXPO_PUBLIC_BARCODE_PROVIDER=open_food_facts` for a test run: the consent screen appears before any lookup, scanning a real barcode shows the product with its credit and the link, withdrawing in Privacy asks again. Typing the number under the barcode works in the Simulator.

**Layout and accessibility**

- [ ] Safe areas: no content under the notch or home indicator on an iPhone with a Dynamic Island and on a small iPhone (SE).
- [ ] Dynamic Type: Settings, Accessibility, Display and Text Size, Larger Text at the largest size and the largest Accessibility sizes: Friends, Fridge to meal, Progress and Food stay readable, nothing clipped or overlapping, buttons still reachable.
- [ ] VoiceOver (physical iPhone, or Simulator Accessibility Inspector): each sharing and invite row reads as one switch with its state, buttons have names, navigation order follows the screen, the 44-point targets are easy to hit.
- [ ] Reduce Motion and Dark mode: screens still legible.
- [ ] Back navigation works from every new screen; no dead ends.

## 3. What to send back

For each unchecked or odd item: iOS version, device or simulator name, what you did, what you expected, what happened, and a screenshot. I fix real defects, re-run the automated tests, push to `feature/overnight-nutrition-fitness`, then clear the staging accounts. No data is sent anywhere except to the staging project.

## 4. Letting me run it on your Mac (optional)

In the Claude desktop app on the Mac: Settings, Claude Code, Remote Control: share the repository folder. In this session I can then request that folder and run the commands above myself, with your approval at each prompt. I will not reset or erase any simulator, change signing, or create an EAS or TestFlight build.

## 5. Not done and not allowed here

EAS build, TestFlight, App Store, production, the development Supabase project, `main`, `integration/live-prep`, Apple Health.
