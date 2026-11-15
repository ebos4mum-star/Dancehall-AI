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

## Draft packs and staged foods (Stage D)

- **Draft workout packs** (`packages/shared/src/draft-packs.ts`): original structures with timings, transitions, instructions, easier and seated versions, in the five requested packs: Dancehall (2 sessions), reggae (2), chair dance (3), low-impact dance (1, seated-capable) and beginner strength (2 sessions, 7 exercises). They run in the existing player, seated mode and strength player. Each carries a `draft` marker listing what it still needs (credited author and rights, independent fitness review, licensed or royalty-free music at the target tempo, practitioner tempo confirmation, cultural review for Dancehall and reggae). They have no provenance, so they never look reviewed; the gate rejects them from the bundle and the seed script refuses them. Visible only in development and review builds, labelled "Draft, not reviewed", and left out of automatic suggestions. No music is included.
- **Staged foods** (`packages/shared/src/food-staged.json`): 34 Jamaican, Caribbean and West African foods whose values and serving weights were read unchanged from the USDA FoodData Central SR Legacy release (April 2018) by `scripts/import-fdc-sr.mjs`, with source ID, edition, retrieval date, attribution and the source's licence statement. Not typed in, not reviewed: they need a registered dietitian and a cultural reviewer, are never bundled or seeded, and appear (labelled) only in development and review builds. Foods missing from the source (for example ackee) are not included. Refresh with the commands in the script header; extend by adding rows to `scripts/food-import-manifest.json`. The Caribbean and West African composition tables are better regional sources and are the next step once their licences are confirmed.
- **Promotion**: when a reviewer approves an item, replace its `draft` or `staged` marker with real provenance; the gate then judges it as reviewed content. Hosted seeding stays a separate approval, and the hosted foreign keys mean a preview build must not be pointed at a live backend.

## Use what you have (Stage E)

- **What it is**: a card on the Dance tab (no new tab or screen) where the person picks the household items they have: sturdy chair, wall, towel, water bottles, backpack, stairs, or none. A strength session is built only from exercises that need nothing else, at their level, with sets, repetitions or holds, rest and timers, and runs in the existing strength player, clock, resume and logging. History is separate: the items are a saved preference, so changing them changes only the next session.
- **Rules** (`home-equipment.ts`, pinned by tests across every combination of items, level, seated, balance and length): every item an exercise needs must be chosen (a seated session counts the chair as the seat); seated sessions use only exercises done seated; balance support removes exercises that need standing balance; nothing harder than the chosen level; a substitute is never harder than what it replaces. Exercise text may never mention standing on or anchoring anything, dips, jumping or furniture other than a sturdy chair held or sat on; bottle and backpack exercises need a plain-words load note; stairs exercises use only the bottom step beside a handrail and never carry a load.
- **Safety checks**: each item has checks (`home-items.ts`), shown with a list of things never to use. A session that uses any item asks the person to confirm the checks before it can start.
- **Personalisation**: level from experience, seated and balance from the mobility preferences, three sets for the strength goal (never for beginners), items from the saved preference. The strength pathway in the engine names the person's items when the session exists.
- **Demonstrations**: `exercise-demos.ts` is the contract (licensed, approved, captioned, loading). None exist, so the player says there is no video demonstration and shows the written steps; no playback renderer is built yet.
- **Content status**: the 33 exercises in `home-exercises.ts` are unreviewed drafts, preview-only like the other drafts. A normal build shows no card. An exercise professional must review the item limits, repetitions and easier versions before anything is published.

## Demonstrations and the review queue (Stage F)

- **One demonstration player** (`apps/mobile/src/demo/DemoPlayer.tsx`) for dance blocks, chair dance, strength exercises and "Use what you have". The rules are in `demo-media.ts` (what may be shown) and `demo-playback.ts` (a pure state machine); the component only draws them. Play, pause, replay, speed (0.5×, 0.75×, 1×), captions (timed cues or the transcript) with an audio description when there is one, a preview on the detail screen before starting, and in the session beside the written steps. Nothing autoplays or loops; with reduced motion nothing moves until Play is pressed. A clip that cannot load falls back to the written steps with a plain message.
- **Approved, draft and none are kept apart**: only a clip that is approved by an independent exercise professional, licensed for the country and date, captioned and attributed can ever ship (the bundled-content gate enforces it). A draft clip resolves only in development and review builds and is labelled "Draft media, not approved for release". No clip exists, so a normal build shows the written steps and says there is no demonstration. The fixture clips are placeholders (a labelled frame, plus a synthetic test pattern served only by the browser test server); they are never a demonstration.
- **Review queue**: every draft names what is outstanding (exercise safety, choreography authenticity and rights, cultural review, media rights; for foods, a dietitian and a cultural review) and who has to do it, in the app (on the draft's detail screen) and in `docs/review/REVIEW_QUEUE.md`, which is generated from the content and checked by a test (`UPDATE_REVIEW_QUEUE=1 pnpm --filter @dancehall/shared test` regenerates it). Nothing is ever shown as reviewed.
- **Not built**: a licensed demonstration, music, or any approved media. `pnpm --filter @dancehall/mobile export:ios:check` confirms the iOS JavaScript bundle compiles; it does not run the app.

## Animated trainer and release preparation (Stage G)

- **Animated trainer, technical integration.** A clip of kind `animation` (`uri: trainer:<motion ids joined with +>`) plays in the same demonstration player as video. The rig (`trainer-rig.ts`) is pure 3D maths: forward kinematics with fixed bone lengths, feet planted, a camera with front, three-quarter and side views. Motions (`trainer-motions.ts`) are keyframes with smooth easing, a crossfade between movements in a chain, a smooth start and finish from rest, a beginner modification (half-size movements) and, where one exists, a seated version. The player adds view selection, speed, pause, replay, captions, one-second stepping, and in reduced motion shows the pose in whole-second steps. `TrainerSurface` draws the figure with SVG on every platform. Tests pin the geometry (bones keep their length, nothing goes through the floor, seated figures sit on the seat), smoothness (no joint turns more than 12 degrees between frames at 30 frames a second, including between movements) and that the beginner version is always gentler.
- **Placeholder assets only.** The figure and its motions are original, generated in code: a plain stick figure doing generic movement patterns (march, bounce, side step, sit-to-stand, seated knee lift and so on). They are labelled drafts and their captions say they are not the choreography, not a recording of anyone and not a reviewed demonstration. A motion is attached to a block or exercise only when it plainly matches; otherwise there is no animation and the player says so. A rigged character (for example glTF with skeletal animation) would replace `TrainerSurface` and keep the clip format, the views, the variants and the controls. No character asset, music or choreography from a third party is used.
- **Technical readiness** is computed for every draft (`docs/review/REVIEW_QUEUE.md`): a complete sequence with timing, difficulty, easier and seated versions and safety instructions, or for a food a traceable source, serving and values. It is not approval; every item still lists its outstanding external reviews.
- **Release preparation**: `docs/RELEASE_SEQUENCE.md` and `supabase/proposed/` (M3 v2 up and down scripts, a rollback preparation that keeps people's history, and tests), rehearsed by `pnpm db:test`. `scripts/seed-lib.mjs` refuses fixtures, drafts, staged foods, protected-style workouts without a complete independent review, and styles the database cannot store yet; reviewed workouts would be seeded as drafts so the database still decides publication.

## Intentionally empty

No Dancehall, reggae, chair-dance or strength workouts and no reviewed regional foods are bundled (the drafts and staged foods above are preview-only). A normal build shows none of the new styles; the regression suite asserts this.

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
