# Accounts: browse first, PIN to protect, and how recovery must work

## What is built and working now

- **Browse first.** The app opens as a guest. The catalogue, workout details, the reference foods and the browsing tabs need no account and create no data.
- **Account gates.** Starting a workout, scheduling, saving progress, goals, challenges, the coach, logging food, meal plans and account settings ask for an account, say why, and bring the person back to what they were doing. A guest never sees those screens (they are not rendered); a test checks that every screen that needs an account is wrapped, and none that should be public is.
- **PIN, no email, no password.** Six digits, typed twice. Obvious PINs (repeats, runs, simple patterns, the most common) are refused with a reason. The PIN is **an app lock**, not a cloud credential (see below).
- **Local verification.** A salted scrypt hash (16 MiB) in the phone's Keychain (readable only while unlocked, never copied to another device or backup). The wrong-attempt counter is written before each check, so killing the app mid-guess cannot reset it. Four free attempts, then 30 s, 1 min, 5 min, 15 min, 60 min, and after ten failures the PIN stops working on that phone (the person can sign out of it; nothing in their account is deleted). A damaged counter is treated as strict, never as a reset.
- **Face ID or Touch ID** as an optional convenience where supported. It never replaces the PIN: a failed, cancelled or unavailable biometric falls back to the PIN pad, and the phone's own passcode fallback is switched off so there is one fallback with one lockout.
- **Locking.** The app locks when it opens and after a minute in the background; the locked app is hidden from screen readers.
- **Interruptions.** Nothing is saved until setup finishes. If the app closes after the account exists but before a PIN, the next start goes straight to PIN setup; if it closes during onboarding, the PIN unlocks it and onboarding resumes; the original action is kept (validated, expiring after a day) and used once. A session that ended with a PIN still on the phone is shown plainly.
- **Return addresses are validated**: only the app's own screens, never another site or the account screens.

## What is not available yet, and why

This build can create an account only where the data store can (the development build, which keeps data on the phone and says so). **A cloud account cannot be created or recovered yet**, because that needs backend and authentication-provider changes that have not been authorized. The app says so and creates nothing: there is no fake cloud identity and no bypass of Supabase authentication. Existing Supabase sessions, row-level security and every table are unchanged; the work adds no table and no migration.

## Why a PIN and two security questions cannot recover a cloud account

- A six-digit PIN has 10^6 possibilities (about 20 bits). Two security-question answers are usually guessable or public, and in practice add perhaps 10 to 15 bits each. Together that is on the order of 30 bits, which a patient online attacker defeats if the account can be targeted, and which anyone who obtains a stored verifier defeats offline in seconds whatever the hash.
- Knowledge-based answers are also discouraged as an authenticator by NIST and OWASP. Throttling helps against online guessing but does not make a low-entropy secret strong, and recovery is the highest-value attack on an account.
- So the PIN stays a local lock, and recovery needs an independent factor with real entropy.

## The smallest additional no-email requirement (needs your approval)

**A Recovery Key**: 120 or more random bits generated on the phone, shown once at account creation as grouped characters for the person to write down or keep in a password manager, never stored in plain text by the app or the server. Recovery on a lost or replacement phone would then need the Recovery Key **and** the two security-question answers (the questions stay the visible, friendly part of the experience). It needs no email, no SMS provider and no third party.

Alternatives considered: a verified phone number (SMS code) needs a paid SMS provider and stores a phone number; an iCloud-synced passkey is Apple-only and Supabase has no native passkey sign-in, so it would need custom server code. The Recovery Key is the smallest.

**Question for you:** approve adding the Recovery Key to the recovery experience (questions plus key)? Recovery is not implemented until you answer.

## How the cloud identity and recovery would work (nothing here is applied)

1. **Account creation**: an Edge Function (public sign-up stays off) creates the Supabase user with the admin API using a non-routable synthetic identifier and a random 256-bit **device secret** that no person ever sees or chooses. The phone keeps it in the Keychain (this device only). The app signs in with it and gets an ordinary Supabase session, so `auth.uid()` and every RLS policy work exactly as today. Apple App Attest, checked by the function, plus per-IP and per-device rate limits, stop scripted account creation.
2. **Recovery**: an Edge Function checks the Recovery Key (HMAC with a server-side secret, constant-time compare) and the two answers (Argon2id with a per-account salt and the same secret), with a per-account and per-IP attempt limit and a cooling-off period. On success it rotates the device secret (every other phone is signed out), signs the new phone in, asks for a new PIN, and issues a new Recovery Key. Verifiers are stored in a table no client role can read.
3. **Without the Recovery Key** the account cannot be recovered. That is the honest cost of not allowing weak recovery.

Backend work this needs, each requiring separate authorization: Auth settings (sign-up off, how the synthetic identifier is accepted, rate limits), two Edge Functions and their secrets, one service-only table and its migration, App Attest configuration.

## Honest limits of the local PIN

Someone who can read the phone's secure storage (a compromised or jailbroken device) could guess six digits offline, so the PIN is a lock for an unlocked-by-owner phone, not a defence against a compromised one. Biometric enrolment changes are not tracked. The lockout clock uses the phone's clock, bounded so a changed clock cannot lengthen a lock without limit.

## Tests

Unit: PIN policy, lockout schedule, setup state machine, return-address safety and pending-action expiry (shared); vault (never stores the PIN, fresh salts, counting before checking, lockouts across restarts, hard stop, damaged counter, change, clear) and biometrics with a fake module (mobile); structural checks that account screens are wrapped, guest tabs read no account data, the store refuses every account operation when signed out, and the PIN is never logged or put in ordinary storage. Browser (`node e2e/account.cjs`): guest browsing, every gate, weak and mismatched PINs, cancel, interrupted setup and onboarding, returning to the original workout, lock and throttling across a reload, ten failures, change PIN and lock now, a session that ended, and a crafted return address. Face ID and Touch ID cannot run in a browser or on this Linux build machine; they are covered with a fake module and are **not verified on a device**.
