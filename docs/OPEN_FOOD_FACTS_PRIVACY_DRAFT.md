# Open Food Facts lookups: draft privacy wording (DRAFT, not published, not legally reviewed)

Applies only if the owner switches barcode lookups on (`EXPO_PUBLIC_BARCODE_PROVIDER=open_food_facts`). Production keeps it off until approved. Facts below come from Open Food Facts' own pages read on 2026-11-16 (API introduction and "Terms of use, contribution and re-use") and from how the app is built; the policy text itself still needs counsel.

## What the app does (facts)

- A lookup sends **the barcode number**, and unavoidably **the phone's network (IP) address and the app name and contact in the User-Agent**, to `world.openfoodfacts.org`. Nothing else: no name, account, device id, meals, weight or health data. No cookies, no key.
- Nothing is sent until the person taps "Allow barcode lookups" (stored on the phone, per person; they can switch it off in Privacy). Without it the app uses only the person's own saved products, the offline memory of earlier lookups, and manual entry.
- At most 12 lookups in any rolling minute (their published limit is 15 reads per minute per IP address), repeats answered from memory, failures never remembered.
- Open Food Facts states it does not guarantee accuracy (crowd-sourced data), that its database is under the Open Database License, individual contents under the Database Contents License, and product photos under CC BY-SA (the app uses no photos). It asks to be credited with a link to the product page, which the app shows ("View or correct this product on Open Food Facts") along with "Product data from Open Food Facts (open database, ODbL licence)".
- Their terms say personal information they collect "will not be sold or transmitted to third parties" and give a contact for data rights (`privacy@openfoodfacts.org`); they publish their own Privacy Policy.

## Proposed policy paragraph

> **Barcode lookups.** If you choose "Allow barcode lookups", the barcode you scan is sent to Open Food Facts (a free, public food database run by a non-profit) to find the product. Their servers also receive your phone's network address. We send nothing else to them: not your name, account, meals, weight or health information. Open Food Facts handles that data under its own privacy policy and terms. Product details come from volunteers and can be wrong; check the label. You can turn lookups off at any time in Privacy, and you can always add food by hand. Products you type in yourself and earlier lookups stay on your phone.

## App Store Connect "App Privacy" (to review with counsel)

- Data sent to a third party when lookups are on: **Identifiers/Usage-type data (IP address)** and **the barcode** (not linked to the person's identity by the app). Not used for tracking and not combined with other data. Re-check the exact categories in Apple's questionnaire; do not assert "no data collected" while lookups are available.
- Guideline 5.1.2(i): permission is asked before the first lookup (done in the app); the policy must name the third party (this paragraph).

## Share-alike and attribution (for counsel)

The ODbL's share-alike applies to derivative **databases** that are redistributed. The app keeps a small on-device memory of looked-up records for the same person and does not redistribute them; counsel should confirm this reading before launch. Credit and the product link are shown wherever Open Food Facts data is used.
