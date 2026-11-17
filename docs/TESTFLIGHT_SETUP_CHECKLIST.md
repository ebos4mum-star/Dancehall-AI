# TestFlight setup checklist (Apple and GitHub)

Release path: GitHub → GitHub Actions → Xcode → App Store Connect → TestFlight. EAS is not used. App name stays **DanceHall Fit AI** in this document and in the project (the on-device display name in `app.json` is unchanged; no rebranding).

Nothing here has been done or verified: the Apple account and the repository's Actions settings are not reachable from the build environment. **Do every step yourself, on your own machine and in your own browser. Never paste a private key, `.p12`, `.p8`, certificate password or key into chat, an issue, a pull request or a file in the repository.** Secrets go straight from your machine into GitHub (steps 7 and 8), and nobody else needs to see them.

Check for what already exists first (step 0) and reuse it when it is valid. Create something new only when step 0 shows it is missing or unusable.

## 0. Look for existing assets (read only; changes nothing)

| #   | Where                                                                                   | Look for                                                                                                                                             | If found and valid                                                                      | If not                                                    |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0a  | Your Mac, Terminal: `security find-identity -v -p codesigning`                          | a line `Apple Distribution: <your organization> (<TEAM ID>)`. Note the Team ID in brackets                                                           | reuse it (step 2: export it)                                                            | create one (step 2)                                       |
| 0b  | developer.apple.com, Account, Certificates, Identifiers & Profiles, Certificates        | an **Apple Distribution** certificate that has not expired. Apple allows only a few per team, so reuse before creating                               | note its expiry; you can only export it as `.p12` from a Mac that holds its private key | if no Mac holds the private key, create a new certificate |
| 0c  | Same area, Identifiers                                                                  | an explicit App ID `com.dancehallfit.app`, and whether **HealthKit** is ticked under Capabilities                                                    | reuse; if HealthKit is not ticked, tick it (step 3)                                     | register it (step 3)                                      |
| 0d  | Same area, Profiles                                                                     | an **App Store Connect** distribution profile for that App ID                                                                                        | if it predates ticking HealthKit, open it, Edit, Save, Download (step 4)                | create one (step 4)                                       |
| 0e  | appstoreconnect.apple.com, Apps                                                         | an app record for the bundle ID, and whether the name you want is free                                                                               | reuse                                                                                   | create one (step 5)                                       |
| 0f  | App Store Connect, Users and Access, Integrations, App Store Connect API                | existing team keys (a `.p8` can be downloaded only once, when created)                                                                               | reuse only if you still hold its `.p8`                                                  | create one (step 6)                                       |
| 0g  | GitHub, repository Settings, Secrets and variables, Actions; and Settings, Environments | which secret and variable **names** already exist (values are never shown), and whether `testflight-build` or `testflight-upload` environments exist | reuse names that match section 8 exactly; delete or rename stray ones                   | create (steps 7 and 8)                                    |

## 1. Apple Developer organization

Apple Developer Program account enrolled as an **organization** and in good standing; you are Account Holder or Admin. Membership details show the **Team ID** (10 letters and digits). You will store it as a GitHub variable (not a secret).

## 2. Apple Distribution certificate (reuse if 0a/0b found one you can export; otherwise use the scripts)

Run these **on your Mac**, in Terminal, from a clone of this repository (the scripts never touch the repository; the private key lives in `~/.dancehall-signing/`, mode 600, outside Git). They print no key and no password.

```bash
# 1. Look for a reusable identity (read only: changes, revokes and exports nothing)
bash scripts/release/signing-prep/make-csr.sh check

# 2. Only if nothing reusable exists: create a private key and the CSR
bash scripts/release/signing-prep/make-csr.sh create
#    -> upload ~/Downloads/DanceHallFitAI_Distribution.csr on Apple's page (Certificates, +, Apple Distribution, Continue, Choose File)
#    -> download the issued .cer

# 3. After downloading the .cer: check it (right type, your team, not expired, matches the key) and create the password-protected .p12
bash scripts/release/signing-prep/make-p12.sh ~/Downloads/<the downloaded file>.cer
#    -> ~/.dancehall-signing/distribution.p12 (mode 600); you type the password twice, hidden
```

The `.p12` is built with the older encryption algorithms that macOS `security import` (used by the build workflow) accepts; the default of newer OpenSSL versions is refused by it. The scripts refuse to overwrite an existing key, CSR or `.p12`. Keep `distribution.key`, `distribution.p12` and its password in your password manager or an encrypted backup. The certificate is team-wide, so it can also sign your other apps; this flow does not touch their signing.

Reuse path instead (an identity with its private key is already in your Mac's login keychain): Keychain Access, category **My Certificates**, find `Apple Distribution: FlexApp software Inc. (9RA6G4GC6Q)`; expand it (the private key must appear beneath it); right-click the certificate, **Export**, format **Personal Information Exchange (.p12)**, set a strong password.

Optional: importing the issued `.cer` into Keychain Access is **not** needed for this pipeline (the `.p12` carries both parts). If you want it in your keychain too, double-click the `.cer` only if you also keep the key in the keychain.

## 3. App ID with HealthKit

Identifiers, **+** (or open the existing one): App IDs, App, **Explicit**, bundle ID `com.dancehallfit.app`, description DanceHall Fit AI. Capabilities: tick **HealthKit** (leave the HealthKit sub-options unticked: the app only reads workouts and the build carries only the base entitlement). Save. Changing capabilities invalidates existing profiles for this App ID, so do this before step 4.

## 4. App Store provisioning profile (must include HealthKit)

Profiles, **+**, Distribution, **App Store Connect**, choose the App ID from step 3, choose the certificate from step 2, name it as you like (yours is `MyWeightLossPal_AppStore`; the workflow reads the name from the profile file, so it is not a variable), Generate, **Download** the `.mobileprovision`. The build refuses a profile that is not App Store type, does not include HealthKit, belongs to another team or bundle ID, is expired, or does not list the imported certificate.

## 5. App Store Connect app record

Apps, **+**, New App: platform iOS; name (must be unique in the store; the name here can differ from the on-device name and can change later); primary language; bundle ID `com.dancehallfit.app` from the list (it appears after step 3); SKU of your choice; user access as you prefer. Version `0.1.0` is created by the first upload. Export compliance: the app declares `ITSAppUsesNonExemptEncryption = false` (only HTTPS and the operating system's encryption), so App Store Connect will not ask per build. **That is your legal declaration; confirm it is true.** App Privacy answers, privacy policy URL and support URL are not needed to start internal testing; they are needed before external testers or the store.

## 6. App Store Connect API key (for the upload workflow only)

Users and Access, Integrations, **App Store Connect API**, Team Keys, **+**: name `github-testflight-upload`, access **App Manager** (a narrower role may also be able to upload builds; that has not been verified here). Download the `.p8` **once** and keep it. Note the **Key ID** and the **Issuer ID** shown on that page.

## 7. GitHub environments (Settings, Environments)

Create two environments. For each: **Required reviewers**: add yourself (leave "Prevent self-review" off if you are the only reviewer, otherwise nobody can approve); **Deployment branches and tags**: **Selected branches and tags**, add `main` only (the workflows are always dispatched from `main`; the commit built is an explicit input that the workflow checks is on the release branch).

- `testflight-build`
- `testflight-upload`

Also check Settings, Actions, General: **Workflow permissions: Read repository contents**; fork pull request workflows require approval.

## 8. Secrets and variables (names exact; values entered by you on your machine)

From a terminal on your Mac with the GitHub CLI signed in, so values never pass through chat. Replace `OWNER/REPO` with this repository.

```bash
# Build environment: secrets
base64 -i distribution.p12 | gh secret set IOS_DISTRIBUTION_CERT_P12_BASE64 --env testflight-build --repo OWNER/REPO
gh secret set IOS_DISTRIBUTION_CERT_PASSWORD --env testflight-build --repo OWNER/REPO       # prompts for the value, not echoed
base64 -i "DanceHall_Fit_AI_App_Store.mobileprovision" | gh secret set IOS_APPSTORE_PROFILE_BASE64 --env testflight-build --repo OWNER/REPO
openssl rand -base64 48 | tr -d '\n' | tee /dev/tty | gh secret set RELEASE_ARTIFACT_PASSPHRASE --env testflight-build --repo OWNER/REPO   # then store the printed value in your password manager

# The same passphrase must exist in the upload environment (paste it when prompted)
gh secret set RELEASE_ARTIFACT_PASSPHRASE --env testflight-upload --repo OWNER/REPO
gh secret set ASC_API_KEY_P8 --env testflight-upload --repo OWNER/REPO < AuthKey_XXXXXXXXXX.p8

# Variables (not secrets)
gh variable set APPLE_TEAM_ID --env testflight-build --repo OWNER/REPO --body "9RA6G4GC6Q"
gh variable set STAGING_SUPABASE_URL --env testflight-build --repo OWNER/REPO --body "https://<staging project ref>.supabase.co"
gh variable set STAGING_SUPABASE_PUBLISHABLE_KEY --env testflight-build --repo OWNER/REPO       # prompts; publishable key only (sb_publishable_...)
gh variable set STAGING_SUPABASE_URL --env testflight-upload --repo OWNER/REPO --body "https://<staging project ref>.supabase.co"
gh variable set ASC_API_KEY_ID --env testflight-upload --repo OWNER/REPO --body "<Key ID>"
gh variable set ASC_API_ISSUER_ID --env testflight-upload --repo OWNER/REPO --body "<Issuer ID>"
```

(The repository's file scan and the guards refuse a Supabase **secret** or **service-role** key anywhere in this flow; use the **publishable** key only. The staging URL and key come from the Supabase dashboard, Project Settings, API; the build accepts only the designated staging project, checked against a pinned digest, so a development or production project is rejected even if stored by mistake.)

| Environment         | Secrets                                                                                                                            | Variables                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `testflight-build`  | `IOS_DISTRIBUTION_CERT_P12_BASE64`, `IOS_DISTRIBUTION_CERT_PASSWORD`, `IOS_APPSTORE_PROFILE_BASE64`, `RELEASE_ARTIFACT_PASSPHRASE` | `APPLE_TEAM_ID`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY` |
| `testflight-upload` | `ASC_API_KEY_P8`, `RELEASE_ARTIFACT_PASSPHRASE` (same value)                                                                       | `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`, `STAGING_SUPABASE_URL`               |

When done, delete `distribution.p12`, the `.p8` and the profile from loose folders (keep the `.p12` and its password in a password manager or keychain as your backup), and never commit them.

## 8a. Pre-flight checks on your Mac before you enter anything (read only; nothing is printed that is secret)

```bash
# The profile: team, bundle ID, HealthKit, not a development/ad hoc profile, expiry
security cms -D -i ~/Downloads/MyWeightLossPal_AppStore.mobileprovision > /tmp/p.plist
for k in Name TeamIdentifier:0 Entitlements:application-identifier Entitlements:com.apple.developer.healthkit Entitlements:get-task-allow ExpirationDate; do
  printf '%s = ' "$k"; /usr/libexec/PlistBuddy -c "Print :$k" /tmp/p.plist 2>&1 | head -n 1; done
/usr/libexec/PlistBuddy -c "Print :ProvisionedDevices" /tmp/p.plist >/dev/null 2>&1 && echo "HAS A DEVICE LIST: wrong profile type" || echo "no device list (good: App Store type)"
rm -f /tmp/p.plist
# Expected: TeamIdentifier 9RA6G4GC6Q; application-identifier 9RA6G4GC6Q.com.dancehallfit.app; healthkit = true; get-task-allow = false; a future ExpirationDate

# The .p12: certificate type, team, expiry (asks for the .p12 password locally; the password is never printed)
openssl pkcs12 -in /path/to/your.p12 -nokeys -clcerts | openssl x509 -noout -subject -enddate
# Expected: subject contains "Apple Distribution: FlexApp software Inc. (9RA6G4GC6Q)"
```

If the healthkit line says the key does not exist, the profile was made before HealthKit was ticked on the App ID: edit the profile (or the App ID, then the profile), Save, Download again.

## 9. Internal testers

App Store Connect, Users and Access: invite each tester (they need an Apple ID and a role that can see the app). TestFlight, **Internal Testing**, **+**: group `Internal testers`, add the testers, and after the first build has processed, add that build to the group. Testers install the TestFlight app and need an iPhone on iOS 16.4 or newer.

## 10. After setup: run order (each step needs your approval; none has been run)

1. The workflow-only pull request is merged to `main` (see `RELEASE_WORKFLOW_PR.md`).
2. Build workflow (signed IPA, stops there). Approve `testflight-build` when GitHub asks.
3. Upload workflow with `dry_run=true` (validation only). Approve `testflight-upload`.
4. Upload workflow with `dry_run=false`. Approve `testflight-upload` again.

Commands are in `TESTFLIGHT_RELEASE_READINESS.md` section 5.
