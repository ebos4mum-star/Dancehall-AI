# V1 completion report (pre-TestFlight)

Branch `feature/overnight-nutrition-fitness`. Verified on Linux only (unit, integration, lint, typecheck, browser web-export checks, hosted staging scripts). **Nothing here was tested on an iPhone, simulator, Xcode or macOS.**

## Classification checklist (prioritized)

### Complete and verified (automated and/or browser, not native)

- Account, sign-in, PIN, privacy settings, consent, data export (now also includes Friends overview and on-device saved products), account deletion (staging `account` function).
- Nutrition diary, copy/repeat meals, saved meals, recipes, Fridge-to-Meal (now with starter ingredient chips), weekly meal plan, grocery list.
- Barcode: my products, offline memory, consent gate, 12/min cap; saved products list with remove (new). Open Food Facts stays OFF by default and in production.
- Workouts, energy double-count protection, week/month progress summaries.
- Friends and Group Goals: server routes, rules, leak guard, hosted staging suite 95/95 + 5/5; Friends screen now shows Retry on a load error.
- Accessibility: all switch rows are 44pt touch targets (browser sweep).
- Mobile 609, shared 912, ai 116, admin 27 tests pass; lint, typecheck, format, secret scan and edge-copy checks pass.

### Implemented but requiring integration

- AI coach in hosted mode needs an AI gateway; without it a paused notice shows and the rule-based plan works.
- Open Food Facts live lookup: code and tests done; needs owner approval steps below.

### Incomplete

- No known incomplete approved V1 feature. V1 instructional video content: none cleared (see external).

### Blocked by native iOS testing

- Keychain session storage, Face ID / PIN lock, VoiceOver, true Dynamic Type, camera barcode scanner, haptics, notification permission, offline behavior on device, Friends against staging on a phone (`docs/FRIENDS_IPHONE_TEST.md`, `docs/NATIVE_IOS_TEST.md`).

### Blocked by external approval or configuration

- Support email and privacy-policy / support URLs (none configured; none invented).
- Legal/counsel review; dietitian and cultural review of foods and recipes.
- Applying community, social and account-deletion migrations outside staging, and scheduling the deletion executor (hosted migration approval).
- Open Food Facts activation (support address, API usage form, privacy wording approval, preview first).
- Auth leaked-password protection (needs paid plan and approval).
- Friends enablement in shared builds (off by default; production build refuses it).
- Community stays `read_only`; open tests: guest rate-limit from one machine, expired-token test.
- App Store items in `docs/APP_STORE_READINESS.md` (2.1.2 reviewer access, 2.1.3, 5.1.2 policy link).
- Video: YouTube embed plan awaits terms verification/permissions.

## 1. Completed features

See "Complete and verified".

## 2. Remaining defects

None known in approved V1 scope after this pass. Coach gateway absence and Friends-off-by-default are by design.

## 3. Native iPhone-only tests

See "Blocked by native iOS testing".

## 4. External approvals / configuration

See "Blocked by external approval or configuration".

## 5. Staging vs production

Staging (`bxhnrjulksganzydgrgm`) has `community` v6, `social` v1, `account` v1 and the social migrations; Community `read_only`, Friends available only in staging builds. Production has none of these applied; Friends, Open Food Facts and Community posting are off.

## 6. Blockers before TestFlight

Native iPhone verification pass; support email and policy URLs; legal review; hosted migration approval for production; owner decision on Friends/OFF activation; reviewer access plan (App Store 2.1.2).
