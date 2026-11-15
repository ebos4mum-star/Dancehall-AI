# Candidate foods for cultural nutrition (names only: NO nutrition values)

**A candidate list for a registered dietitian and cultural reviewers to correct, not data.** I have deliberately written **no calories, macros, portions or health claims.** Nutrient values must come from a licensed or dietitian-curated source and be recorded with provenance. Nothing here is in the app, the bundle or the hosted project. The existing 50 foods are synthetic and unreviewed.

## 1. How a food would enter (existing format, no new columns)

`id` (kebab-case, 2 to 60 characters), `name`, `category` (grain, protein, legume, vegetable, fruit, dairy, fat, snack, drink, mixed_dish), `regionTags`, per-100 g values, a typical serving and label, `costTier` (1 to 3), `aliases`, plus the proposed optional `sourceRef` and `reviewRef`. A food may be marked non-synthetic only when both references exist. In the database a reviewed food would use `source = 'curated'` with an `attribution`; no migration.

## 2. Candidates by region (for review; the reviewer may remove, rename, split or add)

| Region tag                         | Candidate foods (names as commonly used; local names and spellings to be confirmed by reviewers)                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caribbean` (Jamaican and wider)   | Ackee and saltfish; callaloo; steamed cabbage; escovitch fish; curried goat (already present, to be reviewed); jerk chicken (present); rice and peas (present); gungo peas; red peas soup; run down; bammy; festival; dumplings; breadfruit; green banana; cassava; sweet potato; pumpkin; pepperpot or similar stews; mackerel and saltfish dishes; cornmeal porridge. |
| `west_african`                     | Jollof rice (present); fufu and soups (egusi present); banku; kenkey; waakye; kontomire (cocoyam leaf) stew; okra soup; ogbono; efo riro; moi moi; akara; suya; pounded yam; garri; groundnut stew; fried and boiled plantain (present); yam (present).                                                                                                                 |
| `east_african`                     | Ugali; sukuma wiki; injera; shiro; misir wot; githeri; nyama choma; chapati (shared with South Asian); matoke; mandazi.                                                                                                                                                                                                                                                 |
| `southern_african`                 | Pap and sauce; morogo; boerewors; samp and beans; bunny-chow-style dishes (cultural reviewers to advise on naming).                                                                                                                                                                                                                                                     |
| `north_african` / `middle_eastern` | Couscous; tagine-style dishes; shakshuka; ful medames; tabbouleh (to be split by cuisine by the reviewer).                                                                                                                                                                                                                                                              |
| `latin_american`                   | Black beans and rice; arepas; empanadas; ceviche; tamales (existing coverage is 2 items).                                                                                                                                                                                                                                                                               |
| `south_asian` and `asian`          | Dal variants; sabzi; idli and dosa; congee; stir-fried vegetable dishes; miso soup (existing coverage is thin for `asian`).                                                                                                                                                                                                                                             |
| Staples across regions             | Cassava, sweet potato, taro, millet, sorghum, teff, cowpeas and other legumes, leafy greens, fish and seafood, fruits such as mango and papaya.                                                                                                                                                                                                                         |

## 3. What the dietitian and cultural reviewers decide

Which foods and names stay; how to record mixed dishes (per dish, per ingredient, or both) and their usual variations; typical portion units for each cuisine; allergen and safety notes; which statements about balance, protein and fibre may be shown and at what evidence level; the source and licence for each value. They also advise on respectful framing: **no food is labelled good or bad**, and traditional foods are not presented as problems.

## 4. Sources to check (reviewers confirm current editions and licences)

USDA FoodData Central (public domain); FAO/INFOODS regional composition tables; national food-composition tables for each cuisine; dietitian-curated entries with attribution. Open Food Facts has share-alike terms that need legal advice before it is combined with anything else.

## 5. Release dependency

Reviewed foods work in mock mode as soon as they are in the bundle. **On the hosted project they need an approved data seed first**, because logged items reference the `foods` table; until then a logged item for a new food would be rejected there.
