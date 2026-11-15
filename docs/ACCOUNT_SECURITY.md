# Accounts: browse first, PIN to lock, cloud identity and Recovery Key recovery

## The experience, in order

- **Browse first.** The app opens as a guest. The catalogue, workout details, the reference foods and the browsing tabs need no account and create no data.
- **Account gates.** Starting a workout, scheduling, saving progress, goals, challenges, the coach, logging food, meal plans and account settings ask for an account, say why, and bring the person back to what they were doing. A guest never sees those screens (they are not rendered); a test checks that every screen that needs an account is wrapped, and none that should be public is.
- **PIN, no email, no password.** Six digits, typed twice. Obvious PINs (repeats, runs, simple patterns, the most common) are refused with a reason. The PIN is **an app lock**, not a cloud credential (see below).
- **Local verification.** A salted scrypt hash (16 MiB) in the phone's Keychain (readable only while unlocked, never copied to another device or backup). The wrong-attempt counter is written before each check, so killing the app mid-guess cannot reset it. Four free attempts, then 30 s, 1 min, 5 min, 15 min, 60 min, and after ten failures the PIN stops working on that phone (the person can sign out of it; nothing in their account is deleted). A damaged counter is treated as strict, never as a reset.
- **Face ID or Touch ID** as an optional convenience where supported. It never replaces the PIN: a failed, cancelled or unavailable biometric falls back to the PIN pad, and the phone's own passcode fallback is switched off so there is one fallback with one lockout.
- **Locking.** The app locks when it opens and after a minute in the background; the locked app is hidden from screen readers.
- **Setup order.** Create account → two security questions → the account is made and the Recovery Key shown and backed up (confirmation required) → six-digit PIN → optional Face ID or Touch ID → onboarding → what the person was doing.
- **Interruptions.** The account's setup is resumable (see below). If the app closes after the account exists but before the key is confirmed, the next start goes to the key; before a PIN, to PIN setup; if it closes during onboarding, the PIN unlocks it and onboarding resumes; the original action is kept (validated, expiring after a day) and used once. A session that ended with a PIN still on the phone is signed in again by the stored device credential, or shown plainly if the account no longer accepts this phone.
- **Return addresses are validated**: only the app's own screens, never another site or the account screens.

## Cloud accounts and recovery (implemented as code; NOT live)

This is the design that replaces the earlier proposal. **None of it is applied to any hosted project**: the migration, the Edge Function and the authentication settings need separate authorisation, and `docs/CLOUD_ACCOUNTS_ACTIVATION.md` lists exactly what to do. Everything below has been tested on a local Postgres and with a local simulation, **not** against the hosted Supabase project.

### Identity: a real Supabase user, proved by a device secret, never by the PIN

- Creating an account calls the `account` Edge Function, which uses the admin API (service-role key held only by the function) to create a Supabase Auth user with a **synthetic, non-routable identifier** (`u<128 random bits>@accounts.dancehall.invalid`) and a **random 256-bit device secret** as its password. Nobody sees or types either. Public sign-up stays off.
- The phone stores the identifier and secret in the Keychain/Keystore (readable only while unlocked, this device only) and signs in with Supabase's own `signInWithPassword`. The session is an ordinary GoTrue session, so `auth.uid()`, every row-level-security policy and every existing table work unchanged. No custom token scheme was invented.
- The **PIN is never sent anywhere** and is not the Supabase secret. It is only the lock on the phone. Changing the PIN changes nothing about identity.

### Provisioning is idempotent and recoverable

The phone writes `{requestId, device secret, Recovery Key, proofs}` to secure storage **before** calling the server. A retry uses the same `requestId`: the server returns the account it already made (if the secret differs it refuses, so an interrupted setup cannot be taken over), finishes a half-made one, and never makes a second. If the user was created but the recovery record could not be written, nothing is reported as success; a retry finishes it, and a scheduled reaper deletes anything abandoned. The app reports "created" only after the server did and this phone signed in; if sign-in fails the screen says so and a retry only signs in.

### Recovery Key (the independent factor with real entropy)

- **160 random bits** from the phone's CSPRNG, shown as 36 characters (Crockford base32 in nine groups of four, with a four-character checksum so a typo is caught on the phone). Unique per account.
- The server **never receives it**. The phone sends a one-way digest; the server stores `HMAC-SHA-256(server pepper, digest)`. Even a leaked copy of the table is useless for guessing keys offline (160 bits) and, without the pepper, for anything.
- It can be **replaced while signed in** (with the answers) and is **replaced automatically by every recovery**; the old one stops working at once.

### Two security questions (an additional factor, never sufficient alone)

Two different questions from a fixed catalogue of twelve; answers normalised the same way everywhere (Unicode, case, punctuation, spacing). They are stretched on the phone with **scrypt (N=2^15, r=8, p=1, per-account random salt)** and only that proof leaves the phone; the server stores an HMAC of it. Answers are never stored in plain text or logged. Wrong answers do not say which was wrong. Without the key the server cannot even find the account, so answers alone prove nothing; the key alone proves nothing without the answers.

### Lost-phone recovery

1. "Recover my account": the person types the key (checksum-checked on the phone).
2. The server returns two questions and a salt **whether or not the key belongs to an account** (decoys are derived from the key digest and a server secret, stable across repeats, same shape), plus a single-use transaction id that expires in 15 minutes.
3. The person answers; the phone sends the proof. A wrong answer **burns the transaction** (one guess per transaction), counts against the account (five failures lock recovery for an hour), and returns the same generic failure as a wrong key.
4. Success starts a **cooling-off (24 hours by default)**. The real owner, if still signed in on another phone, sees it on Me → Security and can cancel it.
5. After the wait the phone makes a **new device secret and a new Recovery Key**, the server replaces the old secret, **revokes every session and refresh token** (secure default: all other phones are signed out), rotates the key, and the phone signs in as **the same user id**. It then chooses a new PIN and is offered Face ID or Touch ID, and must save the new key. History is restored because it never left the account.
6. Completing is single-use and bound to a secret only that phone holds; an identical retry after a lost reply returns the same result, anything different fails. Every state change is one database function = one transaction with row locks, tested under concurrency.

Rate limits: per-network buckets (hashed address) on every unauthenticated operation, independent of whether the key exists, plus the per-account failure counter. If both the key and the backup are lost, **recovery may be impossible; there is no email or support fallback**, by design.

### What the server stores

Per account: the user id, a keyed hash of the key digest, two question ids, the answer salt, a keyed hash of the answer proof, a failure counter and lock time, and transaction rows. No key, PIN or answer in any form that can be read back, no email, no phone number. Tables live in the unexposed `app` schema with every API role locked out; the only entry points are `acct_*` functions callable by the service role alone.

### Saving the Recovery Key: password managers and the manual path

- **Share sheet (user-initiated):** "Save with another app" opens the phone's own share sheet so the person can send the key to a password manager or secure notes app. This is **not** automatic and **not** deep platform integration. Apple's AuthenticationServices saves a username and password for an associated web domain, and Android's Credential Manager needs a native module; neither exists in this project, and arbitrary secret storage and sync cannot be assumed. Adding either is a native-build change that is not part of this PR.
- **Copy** is an explicit tap; the app clears the clipboard after a minute only if it still holds the key (some keyboards keep their own history; the screen says so).
- **Write it down**, with a warning against screenshots. Screenshots and screen recording are blocked on this screen where the phone allows it (`expo-screen-capture`).
- Continuing requires an explicit "I have saved my Recovery Key" confirmation, which **erases the key from the phone**. Until then the key is kept in secure storage so an interrupted setup resumes at the same key. A key can be replaced later from Me → Security.

### Limits we are honest about

- **No out-of-band alert.** With no email, nobody is told when a recovery starts. The cooling-off only helps if the owner still has a signed-in phone or notices. Someone who holds the key **and** the answers can take the account after the wait if the owner never cancels.
- **Key plus answers is the whole credential**: a person who stores both together loses the separation the design relies on. The screens say so.
- A stolen, unlocked and compromised phone holds the device secret; the PIN does not defend against that (it is a lock for an owner-unlocked phone).
- Access tokens already issued stay valid until they expire after a revocation. Set the project's JWT expiry short (15 minutes recommended) so a signed-out phone loses access quickly.
- With the pepper **and** a leaked database an attacker could guess answers offline at scrypt cost, but still cannot produce the 160-bit key that recovery also demands.
- The synthetic identifier's acceptance by GoTrue, the platform's forwarded-address header, `postgres`'s right to delete from `auth.sessions`, and the whole service are **unverified against the hosted project**.

## Honest limits of the local PIN

Someone who can read the phone's secure storage (a compromised or jailbroken device) could guess six digits offline, so the PIN is a lock for an unlocked-by-owner phone, not a defence against a compromised one. Biometric enrolment changes are not tracked. The lockout clock uses the phone's clock, bounded so a changed clock cannot lengthen a lock without limit.

## Tests

Shared: recovery key (length, checksum, uniqueness, parsing look-alikes, digest), security answers (normalisation, pair validation, proof independent of order and formatting, salt dependence, production cost), and one **account suite** run against **both** the in-memory reference and the real SQL functions on local Postgres: provisioning, idempotent retry, takeover refusal, interrupted and abandoned setup and the reaper, input validation, rate limits, key and answers both required, generic failures, enumeration resistance (decoys have the same shape and are stable), burned transactions, lockout and its end, replay, concurrent verifies and completions (exactly one wins), expiry, owner cancel, revocation and secret-update failures reverting cleanly, rotation and its lockout, status isolation between accounts.

SQL (`16_account_recovery.test.sql`): tables locked from every API role, RLS on, every `acct_*` function service-role only with a pinned search path, anonymous and signed-in callers refused, session revocation deletes only that user's sessions, cascade on account deletion, constraints.

Mobile: the account service end to end against the local simulation (create, resume after network failure or a lost reply, sign-in failure, backup confirmation erases the key, answers never stored, recovery on a "new phone", cooling-off, retry after a lost final reply, cancel, rotation, credential restore versus refusal), boundary tests (no service-role key, the PIN never reaches the cloud code, nothing logs, no email or password fields, the key is never saved automatically, no build profile enables cloud accounts), and the browser suite for create, resume, recover and rotate.

**Not tested live**: nothing here has run against the hosted Supabase project, a real Auth server, the Edge runtime (Deno), a native keychain, the share sheet, Face ID or a real clock of 24 hours. The development build simulates the server in the browser's storage and says so on screen.
