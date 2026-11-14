# Nutrition Safety

Status: **rules are provisional engineering defaults. No registered dietitian or clinician has reviewed them.** Nothing here is medical advice, and no clinical approval is claimed.
Review by a registered dietitian (gates S1, N3) is required before any public release.

## 1. Food-photo estimates (accuracy)

A photograph cannot reliably reveal exact calories, ingredient quantities, hidden oils or portion weights.

- The AI proposes foods, likely ingredients and portion **ranges**; the server grounds numbers in nutrition reference data (USDA FoodData Central, Open Food Facts, curated regional entries). The model is not the source of calorie values.
- Every item is stored with `source`, `confidence`, a calorie range and a `user_edited` flag. Ranges widen as confidence drops (implemented: 15% / 25% / 40%, provisional).
- The UI labels AI values "Estimate" (implemented component), never "exact"; edited items read "Edited by you". The response schema requires `isEstimate: true`; a response without it is rejected (tested).
- Users can edit identification, ingredients and portions, add missing items, or delete an item before saving.
- Accuracy must be measured on a labeled meal set, including mixed dishes and regional foods, before launch (gate N2); results are published internally and the ranges adjusted.

## 2. Weight-management guardrails (implemented in `packages/shared/src/safety.ts`, all provisional)

- Adults 18+ only.
- Optional goals; maintenance is first-class. No guaranteed results; every goal response includes "Progress is not guaranteed and can vary".
- Goal blocked if the target BMI would be below 18.5, or if the person is already below it and the goal is loss.
- Planned loss pace is capped at 1% of body weight per week; the suggested default is 0.5%. Gain pace is capped at 0.5%. Unsafe paces are **adjusted with an explanation**, not silently accepted.
- **No single universal calorie floor.** Daily guidance is individualized: the floor is the person's own estimated resting energy (Mifflin-St Jeor), and the daily deficit is capped at 20% of their estimated maintenance energy.
- No crash diets, fasting challenges, detoxes, "cheat day" language, or restriction-as-reward framing. Weekly reviews reject guilt and shame language (tested).
- Projections (later) must show ranges and say they are uncertain.

## 3. Risk signals

The Concierge routes messages that suggest self-harm or disordered eating to support resources instead of coaching, with no billable call (implemented, minimal keyword screen with tests).
This keyword screen is **only a floor**. Before beta (gate S1): add model-based classification, country-specific support resources reviewed by a professional, a clear escalation path, and tests in `evals/`.
People with medical conditions (diabetes, kidney disease, pregnancy, eating-disorder history, medications) should be told to seek professional guidance; the app does not diagnose, treat, or adjust medication-related nutrition.

## 4. Allergens and packaged food

Allergen and ingredient data from barcodes or AI is advisory and can be wrong or outdated. The app must say so wherever allergens could appear and never state that a food is "safe" for an allergy.

## 5. Language rules

Allowed: estimates, ranges, "may", "can help", encouragement. Not allowed: "guaranteed", "burn fat fast", "detox", moral labels for food ("good/bad"), body shaming, medical claims.

## 6. Review checklist before release

- [ ] Registered dietitian has reviewed thresholds, templates and copy (S1, N3)
- [ ] Photo-estimate accuracy measured and ranges tuned (N2)
- [ ] Cultural meal set reviewed for accuracy and respect
- [ ] Support resources verified for every activated country
- [ ] Evals expanded and passing

## 7. Implemented in Batch B (local; simulated recognition)

- **Recognition is simulated.** The development build runs a deterministic mock through the real AI gateway (quota, budget, schema validation, metering). It does not look at the photo, and every screen that shows its output says so. No live AI service is connected and nothing has been spent.
- **Numbers never come from the model.** The model (mock) supplies food names and portion _ranges_; calories and macros are computed from reference data. Items that cannot be matched are flagged and block saving until the person picks a food or removes them.
- **The reference data is synthetic.** `packages/shared/src/food-data.json` holds rounded, illustrative values for 50 foods across the approved cuisines. It is marked synthetic in the file, in the database (`foods.is_synthetic`) and in the UI, and must be replaced with licensed, dietitian-reviewed data before release (gates N1, N3).
- **Always a range, always labeled.** Every item stores a calorie range (`kcal_low`/`kcal_high`), a source, a confidence and a `user_edited` flag; a test fails if any reference item would show a zero-width range. Labels: _Estimate_ (unreviewed AI value), _Reviewed by you_ (edited or confirmed), _Entered by you_, _From reference data_. Editing any value flips an item to reviewed (a database trigger enforces this).
- **Consent is separate.** Manual food logging needs only health-data consent. Photo analysis (and photo-sourced logs) also need the separate AI-photo consent, enforced in row-level security and in the app; withdrawing it leaves manual logging working.
- **Photo retention (24 hours).** Every upload gets a deletion deadline of 24 hours at upload; a successful analysis resets it to 24 hours after analysis; a failed analysis keeps the earlier deadline. Saving a photo clears the deadline; un-saving restarts the clock; a deleted photo cannot be saved. Status, result and deadlines are written only by service-role functions (`food_photo_complete`, `food_photo_fail`, `food_photo_expired`, `food_photo_mark_deleted`), and the private `food-photos` bucket is JPEG-only, 5 MB, confined to each person's folder. The on-device copy is resized, re-encoded and deleted immediately after analysis. **Not yet built:** the server job that calls `food_photo_expired`, removes the objects through the Storage API and then calls `food_photo_mark_deleted` (needs the cloud project); the development build stores no photos at all.
- **Energy guide.** The guide shown on Food and Today uses the individualized, provisional safety rules (own resting-energy floor, deficit capped relative to the person's own maintenance). It is labeled as a rough estimate, not a target, and not dietitian-reviewed. Meal plans never go below that floor and the database rejects plans under 800 kcal.
- **Food Swap** is rule-based from reference data with neutral wording (no "good/bad" foods) and compares equal portions. It is not medical or dietary advice.
