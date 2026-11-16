# Privacy policy and support page: requirements and publication

Date: 2026-11-16. **No privacy-policy or support URL exists.** The repository contains no public address of any kind (only the placeholder sign-in domain `accounts.dancehall.invalid`, which is deliberately not real, and the app identifier `com.dancehallfit.app`). Nothing below is live. None of this text has had legal review.

## 1. What must be published

| Item                                            | Needed by                                                                                     | Notes                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Privacy policy page** at a stable `https` URL | App Store Connect (required field) and in the app (Guideline 5.1.1(i))                        | Must stay reachable for as long as the app is on sale. |
| **Support page** at a stable `https` URL        | App Store Connect Support URL (required) and in-app contact (Guideline 1.2 published contact) |                                                        |
| **Support mailbox**                             | Community contact, appeals, privacy requests                                                  | A real, monitored address.                             |
| **Marketing URL**                               | Optional                                                                                      | Only if you have a site.                               |
| **Terms of use**                                | Optional for Apple (the standard Apple terms apply if you provide none); needed for Community | Draft: `docs/COMMUNITY_TERMS.md`.                      |
| **App Privacy answers** in App Store Connect    | Required                                                                                      | Must match the policy and the app (section 3).         |

## 2. Public URLs: what is decided and what is not

Nothing is decided and nothing is invented. You need to choose:

1. **A domain** you control (the app identifier suggests a `dancehallfit` name, but no domain is registered or confirmed in the repository). Candidate page addresses, once a domain exists, would be `https://<your-domain>/privacy` and `https://<your-domain>/support`. These are placeholders for planning, not live addresses.
2. **Where the pages are hosted:** a static page host, or a simple site. A free static host is enough for two pages; I have not verified any provider's terms or limits. Hosting under an address that belongs to the repository's GitHub account is possible but ties the policy URL to that account; prefer your own domain.
3. **Who maintains the pages** and how changes are approved (a policy change should go through review).

## 3. Privacy policy content required (based on what the app actually does)

Write it from the facts below. Each must be true on the day of publication; update it whenever the app changes.

- **Data the app handles:** account identifier (a synthetic, email-free identifier; no real name or email is required); a PIN that stays on the device (verify before stating: PIN verification is on-device, recovery uses a Recovery Key and security answers that are never sent in clear); profile and goals; weight and body measurements the person chooses to log; food logs and meal photos; wellness and readiness answers; workout sessions; consent choices; Community username, posts, photos and reports.
- **How and why:** to provide the features; health data only with consent and never shared with Community; meal photos are resized on the device and processed only with consent; Community photos are reviewed by a person before they appear and stripped of location data.
- **Third parties and processors:** Supabase (hosting, database, storage, authentication) and Apple (app distribution and, if used, push); an email provider for urgent moderator alerts carries **no member data** (counts only). No analytics, advertising, tracking or crash-reporting service is in the app today. If an AI provider is ever added it must be named here and consented to first (Guideline 5.1.2(i)).
- **Retention and deletion:** how long each kind of data is kept; how to delete your account in the app (Me, Privacy and settings, Delete my account); the waiting period (**30 days, provisional, until you confirm**); what happens to backups, Community content and files; how to withdraw each consent.
- **Rights and contact:** how to ask for a copy of your data (the app has an export), correction and deletion; the support mailbox; response expectations stated carefully (no promises you have not staffed).
- **Children:** the app is for adults 18 and over.
- **United States specifics:** state privacy rights and any notice requirements, to be set by counsel.
- **Changes and effective date.**

## 4. Support page content required

Contact mailbox; how to report content or a person in Community (the Report and Block buttons) and what happens next; how to appeal a moderation decision; how to delete your account; safety resources (emergency number, local crisis line); a statement that nothing here is medical advice; the app's version and how to find it.

## 5. Support mailbox configuration

1. Choose the address (for example `support@<your-domain>`) once the domain exists. Do not publish one that is not receiving mail.
2. Receiving: a mailbox or forwarding that reaches the **primary moderator and the backup**. Evaluate the cost and terms of the receiving option you pick (forwarding at the registrar is usually free; a hosted mailbox may not be). Do not activate a paid service without approval.
3. Sending: SPF, DKIM and DMARC on the domain so replies and alerts are not marked as spam. The urgent-alert plan already uses the free tier of the email provider chosen for sign-in codes; confirm its terms (see `docs/COMMUNITY_STAGING_READINESS.md` section 8).
4. Send a test message to the address from an outside account and answer it before listing it anywhere.
5. Set the same address everywhere: `EXPO_PUBLIC_SUPPORT_EMAIL` (app), the support page, the policy, App Store Connect.

## 6. Build configuration (already prepared in code)

The app reads three optional public settings and shows nothing for any that is unset:

- `EXPO_PUBLIC_SUPPORT_EMAIL` (shown in Community, for everyone)
- `EXPO_PUBLIC_PRIVACY_POLICY_URL` (a **Read our privacy policy** button on Privacy and settings)
- `EXPO_PUBLIC_SUPPORT_URL` (a **Support and contact** button on the same screen)

URLs must be `https`; anything else makes the build refuse to start. Set them on the production build profile only when the pages are live.

## 7. What is needed to publish (checklist)

- [ ] Domain chosen and registered (owner)
- [ ] Hosting chosen (owner), terms checked
- [ ] Privacy policy written from section 3 and reviewed by counsel
- [ ] Support page written from section 4
- [ ] Support mailbox created, receiving, tested; primary and backup both receive it
- [ ] Both URLs open on a phone over cellular without signing in
- [ ] URLs and email set in the build profile and in App Store Connect
- [ ] App Privacy answers entered and checked against the policy
- [ ] A named person owns keeping the pages accurate
