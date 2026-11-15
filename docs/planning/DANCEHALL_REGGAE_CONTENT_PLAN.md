# Dancehall and reggae content plan

Status: **proposal.** No choreography, music, instructor or style has been added. This is not legal advice; rights, contracts and per-country music licensing need qualified counsel before any commitment.

## Why this is the largest brand gap

The catalogue has 14 sample workouts in six styles (afrobeats, amapiano, hip_hop, latin, bollywood, low_impact) and **none in Dancehall or reggae**. Those styles are also impossible to store today (database check, proposal M3). The brand promise needs real content, not a label.

## What the product already provides (reuse, do not rebuild)

| Need                | Existing mechanism                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Who made it         | `instructors` table; workouts carry `instructorId`; likeness and consent can be recorded                                                                      |
| Rights per country  | `licences`, `media_assets`, and `app.licence_allows` / `workout_playable_media` (media plays only when every asset is licensed for the person's country)      |
| Independent review  | `content_reviews` (fitness and safety types); a non-synthetic workout cannot be published without an approved fitness review by someone other than the author |
| Publishing control  | Draft-first creation, publish permission, structure check (blocks, safety notes), audit log                                                                   |
| Text-only fallback  | Guided text outlines with timing already work with **no** audio or video, so content can launch before any music licence                                      |
| Low-impact variants | `impact` and `lowImpact` fields, readiness routing, `low_impact` style                                                                                        |

## Ways to obtain content (cheapest and safest first)

| Option                                                      | Choreography                                                                                                                                       | Music                                                                                                                                   | Pros                                                                                                       | Cons / risks                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **1. Original choreography, guided text, user's own music** | Commissioned from qualified Dancehall and reggae dancers or instructors under a written agreement (assignment of rights, credit, likeness consent) | None supplied; the app shows a tempo range and counts                                                                                   | No music licence at all; fastest; keeps the existing text-only pipeline; authentic if led by practitioners | Less immersive; the app cannot play the music                                                |
| **2. Original choreography + production-music library**     | As above                                                                                                                                           | A royalty-free or production-music library with in-app and sync use confirmed in writing, including worldwide use and subscription apps | Immersive; predictable cost                                                                                | Few authentic riddim-style tracks; licence terms vary widely; per-country limits             |
| **3. Original choreography + commissioned original tracks** | As above                                                                                                                                           | Producers paid to create original tracks (master and publishing assigned or licensed to the app)                                        | Distinctive, authentic, fully owned                                                                        | Highest up-front cost; needs producer and artist agreements                                  |
| **4. Licensed catalogue tracks**                            | As above                                                                                                                                           | Sync and master licences from publishers and labels (and collecting societies where applicable)                                         | Recognisable music                                                                                         | Expensive, slow, territory-limited; risk of takedown; not a V1 option                        |
| **5. Third-party licensed instructor content**              | Existing classes licensed from a studio                                                                                                            | Whatever that studio cleared                                                                                                            | Fast to scale                                                                                              | Needs proof of the studio's rights; likeness consent for every dancer; review still required |

**Recommendation:** start with **Option 1** (it fits the existing text-only pipeline and needs no music rights), add **Option 3** for a small flagship set once a producer partner exists, and treat Option 4 as out of scope. Never use music or choreography whose rights are unclear, and never copy a specific named viral routine without written permission.

## Authenticity and respect

- Lead with practitioners from the culture, credited by name (with consent).
- Describe moves with their own vocabulary where the practitioners agree, and teach the history briefly and accurately; do not caricature.
- Do not reduce the styles to calorie numbers in the copy ("burn" language is limited by the existing language rules).
- Likeness, name and image use need written consent and a stated term.

## Safety requirements specific to these styles (for the exercise-professional reviewer)

Dancehall and reggae movement can involve deep knee and hip flexion, fast hip rotation, repeated lower-body bounce and floor-adjacent positions. Each workout needs: a warm-up and cool-down, a low-impact and a seated variant, joint-friendly modifications for the knees, hips and lower back, intensity options, and a pause-any-time note. The existing `safety` notes and review gate apply unchanged.

## Minimum launch set (proposal)

1. Four workouts: two Dancehall (beginner 10 min; intermediate 15 min), one reggae low-tempo flow (beginner 15 min, low impact), one seated Dancehall-inspired flow (10 min).
2. One four-week beginner program that mixes them with the existing styles.
3. Tempo range shown per workout; guided-text timing and cues; optional music added only when Option 2 or 3 is in place.

## Gate sequence (nothing skips a gate)

1. **Owner decision** (below) on authors, budget, option(s) and timeline.
2. Written agreements: choreography, likeness, any music.
3. Draft workouts entered as drafts through the existing admin path (this needs M3 to be applied first so the style value is storable, **which is why M3 is applied only when the first reviewed workout is ready**).
4. Fitness and safety review by a qualified, independent professional (gate F1) and a cultural review by practitioners.
5. Licence and media records created; country coverage confirmed.
6. Publish behind a flag; verify on a device build (not available yet).

## Decisions needed

1. Option 1 first, as recommended, or a different mix?
2. Who authors the first set and under what agreement (names, budget, timeline)?
3. Will you provide or source producer partners for original tracks?
4. Which countries are in scope for the first licence set?
5. Who is the qualified exercise reviewer and who are the cultural reviewers?
