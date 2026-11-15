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

## 8. Fit Concierge safeguards (Batch D; provisional, not professionally reviewed)

All of this is enforced in code and tested, and none of it has been reviewed by a registered dietitian or clinician (gate S1).

- **Before any AI call:** messages about self-harm or disordered eating, very fast weight loss (for example "10 kg in a week"), fasting, juice cleanses, crash diets or under 1,000 kcal, symptoms such as chest pain or fainting, and signs the person is under 18 receive a fixed, calm reply that points to a professional or emergency help. They are never coached on and never cost anything.
- **After the AI call:** replies containing guilt, shame, "earn your food" or "make up for it" language, streak pressure, weight competition, diagnoses, guarantees, detox/fast-fat-loss claims, or a calorie prescription below 1,200 a day are discarded and not shown. Negated forms ("there is nothing to make up") are allowed.
- **No target numbers from a model.** A coach cannot set a weight target. A suggested goal change carries only a type and timeframe; on confirmation the same goal safety rules as everywhere else choose a gentle pace and can still refuse (BMI floor, pace cap).
- **Confirmation before any change:** every proposed change (schedule a workout, switch the plan mode, add a habit, a food swap idea, a gentler goal) waits for the person's Apply; Not now changes nothing; each decision is recorded.
- **Weight is only a direction.** The coach sees "steady / drifting down / drifting up", never exact weights, and always says weight varies day to day.
- **Tone:** no guilt, punishment, weight-loss competition or manipulative streaks. Missed days lead to a "welcome back" offer of three short low-impact sessions with nothing to make up. Weekly reviews celebrate consistency, effort and non-scale wins.
- **The energy guide** shown with food totals is a rough estimate (the person's own resting energy as a floor, deficit capped relative to their maintenance), clearly labeled and not a target.

## 9. Daily calorie needs: one engine, five goals (provisional, not professionally reviewed)

**One calculation path.** `nutritionTargets` (`packages/shared/src/nutrition-plan.ts`) is the only place energy is calculated. `calorieNeeds` / `calorieNeedsFromRecords` (`calorie-needs.ts`) wrap it, and Goals, Food, Today, the meal planner and the coach all read from it (the old second calculator, `energyGuideFor`, was removed; a test fails if the raw formula is called anywhere else). Method: Mifflin-St Jeor resting energy times a self-reported activity factor gives estimated maintenance. Exercise is already inside the activity factor, so **workout calories are never added on top**.

| Goal            | Goal-based estimate                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lose Weight     | Unchanged: deficit capped at 20% of maintenance, never below resting energy, 1%/week pace cap, BMI floor 18.5. Withheld for cautious or unanswered readiness, pregnancy, eating concern.                                                                                                                                                                                          |
| Maintain Weight | Estimated maintenance (unchanged).                                                                                                                                                                                                                                                                                                                                                |
| Gain Weight     | **New.** A small surplus, **never more than 10% of estimated maintenance** (a conservative provisional ceiling set by the product owner; **not clinically validated, not reviewed by a dietitian**). Pace at most 0.5%/week, default 0.25%/week. Surplus is withheld (maintenance still shown) at BMI 25 or over, for a target at that BMI, for cautious or unanswered readiness. |
| Improve Fitness | Estimated maintenance (unchanged).                                                                                                                                                                                                                                                                                                                                                |
| Build Strength  | Estimated maintenance (unchanged); no deficit, no weight target.                                                                                                                                                                                                                                                                                                                  |

**Safety that applies to every goal:** adults only; no calorie or protein numbers for pregnancy/postpartum, eating concern, or tracking turned off. **Fixed:** the Food, Today, planner and coach path used to skip the cautious-readiness check; it now cannot, because there is only one path.

**Weight tracking stays optional for Gain Weight.** Choosing it does not switch tracking on or prompt for weight; an estimate needs one recorded weight. When something needed is missing the app lists exactly what (`missing`) and shows no number.

**Older accounts keep working.** `goalIntent` gains the value `gain` (stored in the existing `wellness_prefs` JSON; no migration). A new `goalChosen` flag records an explicit pick. Only while it is false and the goal is the default `fitness` does a stored weight goal decide the estimate, which keeps accounts created before Gain Weight existed on the estimate they already had. Nothing stored is rewritten, and changing goals never touches weights, goals, logs or sessions.

**Not verified:** nothing here has had dietitian or clinician review, and an older app version reads a stored `gain` as `fitness`.
