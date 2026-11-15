# Gate 6C: iPhone test of cloud accounts (preview-cloud build)

Scope: the `preview-cloud` internal build against the **development** Supabase project only. No TestFlight, no production profile, no `main`. The 24-hour recovery wait stays at 24 hours; no Auth, migration, Edge Function or secret change is part of this gate.

## A. Owner pre-flight (before any build)

Nothing here is automated; Claude has no EAS access from its container.

1. In the EAS project, open **Environment variables, environment `preview`**. Confirm both exist (names only; never paste values into chat or the repo):
   - `EXPO_PUBLIC_SUPABASE_URL`: its host must be the **development** project (`<dev-ref>.supabase.co`), not a production project.
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: must start `sb_publishable_`. Never a `sb_secret_` or service-role key (the app also refuses those at start-up).
   - If a variable is missing, create it in the `preview` environment only (visibility: plain text or sensitive is fine; these are public client values). If one exists with a different project, stop and say so; do not overwrite it blindly.
   - Optional hardening: no `production` environment variable should contain the development URL, and `production` must not contain `EXPO_PUBLIC_CLOUD_ACCOUNTS`.
2. Confirm the test iPhone is registered for internal distribution (`eas device:create`) and Developer Mode is on.
3. Confirm Supabase Auth public sign-up is still disabled and the account function is still version 7 (read-only look in the dashboard).
4. Give Claude explicit approval for exactly one build: `eas build --profile preview-cloud --platform ios`. Claude does not build without it.

Why this matters: a missing URL or key makes the build compile but the app fail at start-up (`Supabase mode needs EXPO_PUBLIC_SUPABASE_URL ...`), wasting a build. The `preview` profile (flag off) also reads the `preview` environment, so that environment must hold the development project only.

## B. Install

- [ ] Install from the internal-distribution link on the registered iPhone.
- [ ] App opens (no configuration error screen). Browse-first screens work signed out.

## C. Account creation (no email anywhere)

- [ ] Start "create account": no email, phone or name field is asked for.
- [ ] Choose two security questions and answers; set a 6-digit PIN.
- [ ] A Recovery Key (36 characters) is shown **once**. Save it in a password manager or write it down.
- [ ] Confirm the backup; the key no longer appears anywhere in the app afterwards.
- [ ] Settings shows the account as signed in; backup state "confirmed".

## D. Native storage and lock (the parts only a phone proves)

- [ ] Force-quit and relaunch: still signed in, PIN lock appears, correct PIN opens the app.
- [ ] Wrong PIN is refused; repeated wrong PINs hit the lockout.
- [ ] Face ID (if offered) unlocks; cancelling it falls back to PIN.
- [ ] Restart the phone, open the app: still signed in after PIN (Keychain survived).
- [ ] Airplane mode: app opens to the lock screen and local features work; no crash.
- [ ] Note how long account creation takes on this phone (scrypt cost); record the device model and iOS version.

## E. Recovery Key, share sheet, rotation

- [ ] Share/copy the Recovery Key through the share sheet at creation; nothing else leaks into the pasteboard afterwards.
- [ ] Replace the Recovery Key using the security answers; the new key is shown once and the old one is invalidated.
- [ ] A wrong answer cannot replace the key.

## F. Recovery with the 24-hour wait

- [ ] Start recovery using the key and answers: the screen states a **24-hour** wait (not shorter).
- [ ] Signed-in owner sees the pending recovery and **cancels** it; the draft clears.
- [ ] Do not wait out the 24 hours in this gate unless you choose to; completion was proven in Gate 5.

## G. Isolation and environment

- [ ] The app only talks to the development project (the Supabase dashboard's Auth logs show the test user only).
- [ ] Production cloud accounts remain disabled; no production build or submit was run.

## H. Cleanup and report

- [ ] Sign out and delete the app's local data; ask Claude to delete the test account and verify its records are gone (the dashboard shows the user id).
- [ ] Record results (pass/fail per line, device, iOS version, timings) in `docs/LIVE_VERIFICATION.md`. Do not paste keys, PINs, answers or tokens.

Any failure: stop, do not retry with real data, and report the step and what the screen said.
