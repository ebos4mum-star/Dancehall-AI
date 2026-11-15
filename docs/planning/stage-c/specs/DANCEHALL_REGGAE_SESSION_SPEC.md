# Specification: Dancehall and reggae-inspired dance fitness sessions

**This is a specification, not content.** It contains **no choreography, no named moves, no music and no claim of cultural authority.** The movements, their names, the history and the cues must be written by Dancehall and reggae practitioners and credited to them. Nothing here has been reviewed by anyone, and no licence or agreement exists. All numbers are placeholders for the exercise professional and practitioners to set.

## 1. What a session must contain (the existing workout format)

Each session is one entry in the existing format (`WorkoutDef`), authored by the practitioner and entered as a draft:

| Field                 | Rule                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`               | Original; no trademarked or borrowed routine names; 1 to 80 characters.                                                                                                                                                                            |
| `style`               | `dancehall` or `reggae` (needs the style migration, separately approved).                                                                                                                                                                          |
| `level`               | beginner, intermediate or advanced, set by the exercise professional against the criteria below.                                                                                                                                                   |
| `minutes`             | Quick Fit lengths 5, 10 or 15 first, then 20 and 30. The catalogue's existing coverage test needs at least two per Quick Fit length across the library.                                                                                            |
| `intensity`, `impact` | Honest labels set by the exercise professional. Impact is how hard on the joints; intensity is how hard it feels. Reggae-inspired low-tempo sessions are expected to include low-impact options; that is for the reviewer to confirm, not assumed. |
| `summary`             | Up to 400 characters, plain, no calorie or "burn" language.                                                                                                                                                                                        |
| `blocks`              | At least one warm-up, one main and one cool-down block. Every block has `seconds`, a `cue`, and a **`lowImpactAlt`** (required by the existing structure check). Where practical the alternative also says how to do it **seated**.                |
| `safety`              | At least the three standard notes already used in the catalogue, plus any movement-specific notes the reviewer requires.                                                                                                                           |
| `equipment`           | `none` unless the author specifies otherwise.                                                                                                                                                                                                      |

**Additional authoring fields** (proposed, optional, additive; validated only for non-sample content): `tempoBpm: [min, max]` (confirmed by practitioners), `credits` (names with consent), `rightsRef` (reference to the signed agreement), `culturalReviewRef` (reference to the practitioner review record).

## 2. Level criteria (placeholders for the exercise professional)

| Level        | Structure to specify                                                                                            | To be decided by the reviewer                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Beginner     | Short blocks, one idea at a time, long warm-up, a low-impact alternative that is a full workout, no floor work. | Maximum bounce, range of knee and hip movement, session length.   |
| Intermediate | Two ideas combined, moderate tempo, optional higher range of movement.                                          | Progression rule from beginner; what "comfortable" means in cues. |
| Advanced     | Longer main block, faster transitions; still always with a low-impact alternative.                              | Which elements need a "stop if" note; recovery spacing.           |

## 3. Minimum first set (proposal, for discussion; counts are not commitments)

1. Dancehall beginner, 10 minutes, with seated alternative.
2. Dancehall intermediate, 15 minutes.
3. Reggae-inspired low-tempo flow, beginner, 15 minutes, low impact.
4. A four-week beginner program mixing these with the existing styles (the existing program format).

## 4. Cultural context (short, practitioner-written)

One short context card per style, written and credited by practitioners and reviewed by at least one more: what the style is, where it comes from, how to describe it respectfully. It carries the evidence label **traditional** (cultural knowledge), never a health claim. No stereotyping, no "exotic" framing, no calorie or "burn" copy.

## 5. Music and media

Default: **no music is supplied** and the session runs in guided text with counts and a tempo range, so there is nothing to license. Music (library, commissioned or catalogue) and any video or dancer likeness each need the agreements listed in `docs/planning/DANCEHALL_REGGAE_CONTENT_PLAN.md` and an entry in the existing licence records before the hybrid player could use them. Until then the player falls back to guided text automatically.

## 6. What I will and will not do

I will: build the pipeline, write the validators, and test it with fixtures. I will **not** write movements, names, history or cues, and will not claim any session is authentic, licensed, cleared or reviewed.

## 7. Inputs required before release

See `ASSETS_AND_REVIEWS_REQUIRED.md`, packs 2 and 3.
