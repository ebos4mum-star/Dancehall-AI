# Review pack: cultural and traditional eating (DRAFT, not for publication)

**Reviewers:** a registered dietitian, plus at least one cultural reviewer for each cuisine (West African and Caribbean first; two more cuisines to be chosen by the owner).
**Status:** preparation only. Nothing in this pack is approved, shown to users, or loaded into the app. The food reference data in the app today is 50 **synthetic, unreviewed** items.

## Scope of the first pass

1. **Food reference data**: replace synthetic rows for West African and Caribbean foods with reviewed entries (names, typical portions, nutrient values, cost tier).
2. **Plate guidance** that works with familiar dishes (stews, soups, rice dishes, provisions, legumes, fish and meat dishes), without labelling any food good or bad.
3. **Practical swaps** that keep the dish and change an ingredient or portion, not "replace your food with something else".
4. **Cooking-method notes** (frying, stewing, steaming, oil and salt amounts) framed as options.
5. **Education cards** drafted later, only after the data is reviewed.

## Current coverage (from the repository's food data)

west_african 8, caribbean 8, mediterranean 6, south_asian 6, asian 2, latin_american 2, global 31; 10 mixed dishes in total. The engine already tells a person plainly when their cuisine has fewer than five examples.

## Questions for the dietitian (answers decide the content; none is assumed)

- Which source should supply nutrient values for each cuisine (for example USDA FoodData Central, regional or national composition tables, or entries the dietitian curates)? What are the licence terms for each?
- How should mixed dishes be recorded (per dish, per ingredient, or both), and what portion units are normal for each cuisine?
- What range of portions should the app show, and how should it handle dishes whose preparation varies widely?
- Which general statements about balance, protein and fibre are acceptable to show, with what wording and at what evidence level?
- Which dietary patterns (vegetarian, vegan, halal, kosher, gluten free, dairy free) need explicit handling in swaps and plans?
- Are there allergen or safety warnings that must accompany particular dishes?

## Questions for each cultural reviewer

- Are dish names, spellings and regional variants correct and respectful? Which names are local, and which are misleading to others?
- Is anything presented as "traditional" that is not, or described in a way that stereotypes?
- Which dishes are eaten on which occasions, and should any be framed differently (celebration meals, fasting traditions or religious observance, which the app must handle with care and never contradict)?
- Which foods or practices carry meaning that the app should not simplify?

## Proposed structure for each eventual content item

`id, pathway, title, body, evidence level (strong, moderate, traditional, unsupported), sources[], reviewer role, evidence reference, review date, reviewer is not author`. A traditional practice with little clinical testing is labelled **traditional** and shown with respect, never as a health claim.

## Sources to check against current editions (reviewers confirm)

National and WHO dietary guidance; FAO/INFOODS regional food-composition tables; USDA FoodData Central; national food-composition tables for the cuisines in scope. Each needs its licence confirmed before any bulk use.

## Language rules (apply to every item)

No "good or bad foods", "clean eating", detox, cleanse, "cheat day", "earn your food", guilt or body shaming. Ranges, "may", "can help", "your pace".

## Dependencies and blockers

Reviewed data requires an approved **hosted seed** (logged items reference the `foods` table), which needs the owner's explicit authorisation. Recipes and cooking methods are a later enhancement.

## Checklist (from the expansion document, D.6)

- [ ] Owner, purpose and pathway stated
- [ ] Evidence level and named sources, with year and link
- [ ] Independent review by the right qualified person (dietitian) and cultural reviewer
- [ ] No diagnosis, medication advice, outcome promise or guaranteed numbers
- [ ] Ranges and uncertainty shown; provisional values labelled
- [ ] Referral wording present (pregnancy, breastfeeding, eating-disorder history, diabetes medication)
- [ ] Language filter and copy tests pass
- [ ] Culturally respectful, accurate, no good or bad foods
- [ ] Accessible (text equivalents, reduced motion)
- [ ] Country and licensing check
- [ ] Tests updated; flag created **off**; owner approval recorded before it is turned on
