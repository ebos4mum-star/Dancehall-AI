# Content pipeline (Stage C1 + C2)

What exists in code, what is deliberately empty, and how reviewed content gets in.

## Implemented
- **Style registry** (`packages/shared/src/workouts.ts`): `LIVE_STYLES` (match the DB constraint; a parity test enforces it), `PENDING_STYLES` (dancehall, reggae, chair_dance) and `STYLE_DEFS`. Chair dance is its own style; `seatedSuitable` plus per-block `seatedAlt` lets any workout offer a seated version.
- **Seated handling**: filter, detail switch, in-session toggle. `suggestQuickFit({seated})` never relaxes the impact limit and says honestly when the catalogue has nothing seated.
- **Strength through the existing session screens**: sets, reps, rest, counted sets that wait for "Done with this set", easier versions, saved as the existing `strength` wellness entry. No new screen.
- **Progression suggestion** (`progression.ts`): never pushes, offers "easier" when recent sessions felt very hard. Thresholds are provisional until a professional reviews them.
- **Cuisine taxonomy** (`cuisines.ts`): Jamaican, Caribbean, West African, East African, Southern African first. Used by My approach, meal-plan regions and swap ranking.
- **Provenance gates** (`content-gate.ts`, `food-provenance.ts`): protected styles need credits, rights, independent professional review, tempo and (dancehall/reggae) cultural review; foods need a published source, licence, dietitian review and a plausible Atwater energy check. `scripts/gen-seed.mjs` refuses fixtures, provenance-less protected content and non-DB styles.
- **Internal fixtures** (`fixtures.ts`): placeholder content labelled "[Internal fixture]". Only active when `EXPO_PUBLIC_CONTENT_FIXTURES=1` in a development/preview build; production config throws; never in the bundle.

## Intentionally empty
No Dancehall, reggae, chair-dance or strength workouts and no reviewed regional foods are bundled. A normal build shows none of the new styles; the regression suite asserts this.

## Adding reviewed content
1. Add the entry with full provenance (credits, rightsRef, reviewer, tempo, cultural review where required).
2. `pnpm test` runs `bundledContentProblems`; it must be empty.
3. Hosted seeding and the style migration (M3 v2) need separate approval.

## Checks
```
pnpm verify
pnpm export:web && node e2e/regression.cjs
pnpm export:web:fixtures && node e2e/fixtures.cjs
```
Not verified here: native iOS, live HTTP, Storage, professional content reviews.
