# Content review queue

_Generated from the content by `packages/shared/src/review-requirements.ts`. Do not edit by hand: run `UPDATE_REVIEW_QUEUE=1 pnpm --filter @dancehall/shared test` after changing content._

**Nothing below has been reviewed.** Every item is an unreviewed draft: it is never bundled, never seeded and visible only in development and review builds, labelled as a draft. No professional, cultural or rights review has taken place, and no music or demonstration media is licensed.

## How an item gets published

1. The reviewer does the work in the requirement and leaves the record named in it (credits and rights reference, review role, evidence reference and date, cultural reference; for foods, the licence confirmation and dietitian reference). The reviewer must not be the author.
2. A developer replaces the item’s `draft` (or `staged`) marker with that provenance. The bundled-content gate (`bundledContentProblems`) then judges it as reviewed content, and CI fails if any record is missing or incomplete.
3. Hosted seeding and the style migration are separate approvals; nothing here applies them.

## Summary

| Pack | Items | Technically complete | Safety | Choreography | Cultural | Media rights | Dietitian |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Dancehall | 2 | 2 | 2 | 2 | 2 | 2 | 0 |
| Reggae | 2 | 2 | 2 | 2 | 2 | 2 | 0 |
| Chair dance | 3 | 3 | 3 | 3 | 0 | 3 | 0 |
| Low-impact dance | 1 | 1 | 1 | 1 | 0 | 1 | 0 |
| Beginner strength | 9 | 9 | 9 | 0 | 0 | 0 | 0 |
| Use what you have (household exercises) | 33 | 33 | 33 | 0 | 0 | 0 | 0 |
| Jamaican, Caribbean and West African foods | 34 | 34 | 0 | 0 | 34 | 0 | 34 |

Total: 84 items, 84 technically complete, 84 needing external approval. Technically complete means everything code can check is in place (sequence, timing, difficulty, easier and seated versions, safety instructions, or for a food a traceable source, serving and values). It is not approval: every item still needs the outstanding reviews.

Counts for each requirement are outstanding items.

**Demonstrations.** 85 of 102 workout blocks and exercises have a placeholder trainer animation (a generic movement pattern drawn by code, labelled as a draft). None is a reviewed demonstration, choreography or recording of anyone. All 102 still need a real demonstration (a rigged animated trainer or video) that is licensed, captioned and approved before release; until then the written steps are the instructions.

## Dancehall

- **Exercise safety review.** By: An exercise physiologist, certified strength coach or physiotherapist who is not the author. Confirm the movements, timing, intensity, impact, easier and seated versions and safety notes suit the stated level. Record the reviewer’s role, evidence reference and date; the reviewer must not be the author.
- **Choreography authenticity and rights.** By: The credited choreographer, with practitioners of the style. Confirm the choreography is original or licensed, correctly credited, covered by a signed rights agreement, and an honest representation of the style. Record the credits and the rights reference.
- **Cultural review.** By: Qualified practitioners from the culture of the style. Confirm the movement, vocabulary, framing and music do not misrepresent or appropriate the culture. Record the cultural review reference.
- **Media rights.** By: The rights owner and whoever clears licences. A licensed or royalty-free track at the session’s target tempo, with its licence recorded; no music is included. Any draft demonstration clip also needs a cleared licence, captions and approval.

| Item | Id | Technical | Outstanding |
| --- | --- | --- | --- |
| Dancehall Foundations | `draft-dancehall-foundations-10` | complete | Exercise safety review; Choreography authenticity and rights; Cultural review; Media rights |
| Dancehall Cardio Builder | `draft-dancehall-builder-15` | complete | Exercise safety review; Choreography authenticity and rights; Cultural review; Media rights |

## Reggae

- **Exercise safety review.** By: An exercise physiologist, certified strength coach or physiotherapist who is not the author. Confirm the movements, timing, intensity, impact, easier and seated versions and safety notes suit the stated level. Record the reviewer’s role, evidence reference and date; the reviewer must not be the author.
- **Choreography authenticity and rights.** By: The credited choreographer, with practitioners of the style. Confirm the choreography is original or licensed, correctly credited, covered by a signed rights agreement, and an honest representation of the style. Record the credits and the rights reference.
- **Cultural review.** By: Qualified practitioners from the culture of the style. Confirm the movement, vocabulary, framing and music do not misrepresent or appropriate the culture. Record the cultural review reference.
- **Media rights.** By: The rights owner and whoever clears licences. A licensed or royalty-free track at the session’s target tempo, with its licence recorded; no music is included. Any draft demonstration clip also needs a cleared licence, captions and approval.

| Item | Id | Technical | Outstanding |
| --- | --- | --- | --- |
| Reggae Sway Flow | `draft-reggae-sway-10` | complete | Exercise safety review; Choreography authenticity and rights; Cultural review; Media rights |
| Reggae Steady Groove | `draft-reggae-groove-15` | complete | Exercise safety review; Choreography authenticity and rights; Cultural review; Media rights |

## Chair dance

- **Exercise safety review.** By: An exercise physiologist, certified strength coach or physiotherapist who is not the author. Confirm the movements, timing, intensity, impact, easier and seated versions and safety notes suit the stated level. Record the reviewer’s role, evidence reference and date; the reviewer must not be the author.
- **Choreography authenticity and rights.** By: The credited choreographer, with practitioners of the style. Confirm the choreography is original or licensed, correctly credited, covered by a signed rights agreement, and an honest representation of the style. Record the credits and the rights reference.
- **Media rights.** By: The rights owner and whoever clears licences. A licensed or royalty-free track at the session’s target tempo, with its licence recorded; no music is included. Any draft demonstration clip also needs a cleared licence, captions and approval.

| Item | Id | Technical | Outstanding |
| --- | --- | --- | --- |
| Chair Dance Quick Start | `draft-chair-dance-5` | complete | Exercise safety review; Choreography authenticity and rights; Media rights |
| Chair Dance Groove | `draft-chair-dance-10` | complete | Exercise safety review; Choreography authenticity and rights; Media rights |
| Chair Dance Energy | `draft-chair-dance-15` | complete | Exercise safety review; Choreography authenticity and rights; Media rights |

## Low-impact dance

- **Exercise safety review.** By: An exercise physiologist, certified strength coach or physiotherapist who is not the author. Confirm the movements, timing, intensity, impact, easier and seated versions and safety notes suit the stated level. Record the reviewer’s role, evidence reference and date; the reviewer must not be the author.
- **Choreography authenticity and rights.** By: The credited choreographer. Confirm the choreography is original or licensed, correctly credited, covered by a signed rights agreement, and an honest representation of the style. Record the credits and the rights reference.
- **Media rights.** By: The rights owner and whoever clears licences. A licensed or royalty-free track at the session’s target tempo, with its licence recorded; no music is included. Any draft demonstration clip also needs a cleared licence, captions and approval.

| Item | Id | Technical | Outstanding |
| --- | --- | --- | --- |
| Low-Impact Dance Groove | `draft-low-impact-groove-10` | complete | Exercise safety review; Choreography authenticity and rights; Media rights |

## Beginner strength

- **Exercise safety review.** By: An exercise physiologist, certified strength coach or physiotherapist who is not the author. Confirm the sets, repetitions, rest, warm-up, cool-down and progression for the stated level. Record the reviewer’s role, evidence reference and date; the reviewer must not be the author.

| Item | Id | Technical | Outstanding |
| --- | --- | --- | --- |
| Beginner Strength: Full Body | `draft-strength-beginner-full-body` | complete | Exercise safety review |
| Beginner Strength: Legs and Core | `draft-strength-beginner-lower-core` | complete | Exercise safety review |
| Chair sit-to-stand | `draft-sit-to-stand` | complete | Exercise safety review |
| Wall push-up | `draft-wall-push-up` | complete | Exercise safety review |
| Glute bridge | `draft-glute-bridge` | complete | Exercise safety review |
| Bird-dog | `draft-bird-dog` | complete | Exercise safety review |
| Standing hip hinge | `draft-hip-hinge` | complete | Exercise safety review |
| Supported split squat | `draft-supported-split-squat` | complete | Exercise safety review |
| Dead bug | `draft-dead-bug` | complete | Exercise safety review |

## Use what you have (household exercises)

- **Exercise safety review.** By: An exercise physiologist, certified strength coach or physiotherapist who is not the author. Confirm the household-item limits, the repetitions, the easier version and the stop-if note for beginners. Record the reviewer’s role, evidence reference and date; the reviewer must not be the author.

| Item | Id | Technical | Outstanding |
| --- | --- | --- | --- |
| Glute bridge | `home-glute-bridge` | complete | Exercise safety review |
| Single-leg glute bridge | `home-single-leg-bridge` | complete | Exercise safety review |
| Standing hip hinge | `home-hip-hinge` | complete | Exercise safety review |
| Bird-dog | `home-bird-dog` | complete | Exercise safety review |
| Dead bug | `home-dead-bug` | complete | Exercise safety review |
| Plank on your knees | `home-knee-plank` | complete | Exercise safety review |
| Forearm plank | `home-plank` | complete | Exercise safety review |
| Glute bridge march | `home-bridge-march` | complete | Exercise safety review |
| Chair sit-to-stand | `home-chair-sit-to-stand` | complete | Exercise safety review |
| Slow chair sit-to-stand | `home-chair-slow-sit-to-stand` | complete | Exercise safety review |
| Staggered chair sit-to-stand | `home-chair-staggered-sit-to-stand` | complete | Exercise safety review |
| Chair-supported split squat | `home-chair-split-squat` | complete | Exercise safety review |
| Seated knee extension | `home-seated-knee-extension` | complete | Exercise safety review |
| Seated knee lift | `home-seated-knee-lift` | complete | Exercise safety review |
| Seated trunk twist | `home-seated-trunk-twist` | complete | Exercise safety review |
| Wall push-up | `home-wall-push-up` | complete | Exercise safety review |
| Wall push-up, feet back | `home-wall-push-up-far` | complete | Exercise safety review |
| Wall sit | `home-wall-sit` | complete | Exercise safety review |
| Wall slide (wall angel) | `home-wall-angel` | complete | Exercise safety review |
| Towel pull-apart | `home-towel-pull-apart` | complete | Exercise safety review |
| Seated bottle press | `home-bottle-seated-press` | complete | Exercise safety review |
| Standing bottle press | `home-bottle-standing-press` | complete | Exercise safety review |
| Seated bottle row | `home-bottle-seated-row` | complete | Exercise safety review |
| Supported bottle row | `home-bottle-supported-row` | complete | Exercise safety review |
| Bottle curl | `home-bottle-curl` | complete | Exercise safety review |
| Bottle hip hinge | `home-bottle-hinge` | complete | Exercise safety review |
| Backpack squat | `home-backpack-squat` | complete | Exercise safety review |
| Slow backpack squat | `home-backpack-slow-squat` | complete | Exercise safety review |
| Seated backpack chest press | `home-backpack-press` | complete | Exercise safety review |
| Calf raise holding the rail | `home-rail-calf-raise` | complete | Exercise safety review |
| Step-up | `home-step-up` | complete | Exercise safety review |
| Slow step-up | `home-step-up-slow` | complete | Exercise safety review |
| Incline push-up on the bottom step | `home-step-incline-push-up` | complete | Exercise safety review |

## Jamaican, Caribbean and West African foods

- **Cultural review.** By: A reviewer from the cuisine’s culture. Confirm the region tags and the names people search for (aliases) are accurate and respectful.
- **Dietitian review.** By: A registered dietitian. Confirm the values from FDC 170072: Yam, cooked, boiled, drained, or baked, without salt suit the food as eaten, the serving size, and that the source’s licence allows this use. Record the licence confirmation and review reference.

| Item | Id | Technical | Outstanding |
| --- | --- | --- | --- |
| Yam, boiled | `yam-boiled` | complete | Cultural review; Dietitian review |
| Green plantain, boiled | `plantain-green-boiled` | complete | Cultural review; Dietitian review |
| Ripe plantain, baked | `plantain-yellow-baked` | complete | Cultural review; Dietitian review |
| Breadfruit, raw | `breadfruit-raw` | complete | Cultural review; Dietitian review |
| Sweet potato, boiled, no skin | `sweet-potato-boiled` | complete | Cultural review; Dietitian review |
| Taro, cooked | `taro-cooked` | complete | Cultural review; Dietitian review |
| Pumpkin, boiled | `pumpkin-boiled` | complete | Cultural review; Dietitian review |
| Chayote, boiled | `chayote-boiled` | complete | Cultural review; Dietitian review |
| Okra, boiled | `okra-boiled` | complete | Cultural review; Dietitian review |
| Amaranth leaves, boiled | `amaranth-leaves-boiled` | complete | Cultural review; Dietitian review |
| Cowpea leaves, boiled | `cowpea-leaves-boiled` | complete | Cultural review; Dietitian review |
| Sweet potato leaves, steamed | `sweet-potato-leaves-steamed` | complete | Cultural review; Dietitian review |
| Eggplant, boiled | `eggplant-boiled` | complete | Cultural review; Dietitian review |
| Pigeon peas (green), boiled | `pigeon-peas-boiled` | complete | Cultural review; Dietitian review |
| Kidney beans, boiled | `kidney-beans-boiled` | complete | Cultural review; Dietitian review |
| Black-eyed peas (cowpeas), boiled | `cowpeas-boiled` | complete | Cultural review; Dietitian review |
| Salted cod, dried (before soaking) | `salt-cod-dried` | complete | Cultural review; Dietitian review |
| Atlantic mackerel, cooked | `mackerel-atlantic-cooked` | complete | Cultural review; Dietitian review |
| Tilapia, cooked | `tilapia-cooked` | complete | Cultural review; Dietitian review |
| Goat, roasted | `goat-roasted` | complete | Cultural review; Dietitian review |
| Millet, cooked | `millet-cooked` | complete | Cultural review; Dietitian review |
| Sorghum grain (dry) | `sorghum-grain-dry` | complete | Cultural review; Dietitian review |
| Cornmeal, yellow (dry) | `cornmeal-yellow-dry` | complete | Cultural review; Dietitian review |
| Peanuts, raw | `peanuts-raw` | complete | Cultural review; Dietitian review |
| Watermelon seed kernels, dried | `watermelon-seeds-dried` | complete | Cultural review; Dietitian review |
| Palm oil | `palm-oil` | complete | Cultural review; Dietitian review |
| Coconut milk, canned | `coconut-milk-canned` | complete | Cultural review; Dietitian review |
| Hot chili pepper, red, raw | `hot-chili-pepper-red-raw` | complete | Cultural review; Dietitian review |
| Mango, raw | `mango-raw` | complete | Cultural review; Dietitian review |
| Papaya, raw | `papaya-raw` | complete | Cultural review; Dietitian review |
| Guava, raw | `guava-raw` | complete | Cultural review; Dietitian review |
| Soursop, raw | `soursop-raw` | complete | Cultural review; Dietitian review |
| Banana, raw | `banana-raw` | complete | Cultural review; Dietitian review |
| Roselle (sorrel), raw | `roselle-raw` | complete | Cultural review; Dietitian review |
