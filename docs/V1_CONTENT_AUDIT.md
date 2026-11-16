# Dance content audit and the smallest credible V1 package

Date: 2026-11-16. Method: a search of the whole repository for media and audio files, a read of the workout data, the player and audio code, and the content, licensing and media documents. Nothing was purchased, generated or published.

> **Decision (2026-11-16): the owner approved Option A, real instructor-led dance workout videos for the first App Store release.** The detailed plan, hosting comparison, rights requirements and production options are in `docs/V1_VIDEO_PLAN.md`. This audit is the starting point; the library below is the planned content, **not content that exists**.

**Bottom line:** DanceHall Fit AI today contains **no workout video, no music, no instructor, no choreography recording and no licensed media of any kind**. What exists is a working _guided timer_ for written workout outlines. That is not a dance class and must not be described as one. A real V1 needs recorded, licensed, professionally reviewed content.

## 1. What actually exists

| Asset                                        | Present?                              | Evidence                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workout **video** (real dancer or 3D dancer) | **None**                              | Search of the repository for `.mp4 .mov .m4v` finds no files. `DEMO_CLIPS = []` (`packages/shared/src/demo-media.ts`). `docs/INSTRUCTIONAL_MEDIA.md`: "No clip exists, so a normal build shows the written steps and says there is no demonstration."                         |
| **Music / audio**                            | **None**                              | No `.mp3 .m4a .wav .aac` files. `MUSIC_CATALOG` is empty so `musicAvailable()` is false (`apps/mobile/src/audio/settings.ts`). `docs/CONTENT_LICENSING.md`: "nothing is licensed or purchased".                                                                               |
| **Spoken cues**                              | Web only                              | `apps/mobile/src/audio/voice.ts`: browser speech synthesis on web; on iOS and Android it reports itself unavailable and the player relies on text and haptic cues.                                                                                                            |
| **Animations**                               | Placeholders, development builds only | 37 generic stick-figure motions in code (march, sit-to-stand, squat, hip hinge and similar), attached only where a motion plainly matches; labelled drafts, "not the choreography". Not shipped in production builds. They are not dance.                                     |
| **Licensed media**                           | **None**                              | The licence register exists as database and admin foundations, with no records. No instructor agreement, music licence, performer release or location clearance exists.                                                                                                       |
| **Instructors**                              | One placeholder record                | "Sample Instructor (placeholder)" in `workout-data.json`.                                                                                                                                                                                                                     |
| **Workouts**                                 | 14 written outlines                   | 5-30 minute outlines in six styles: afrobeats, amapiano, hip-hop, latin, bollywood, low-impact. File notice: "SAMPLE text-only workout outlines for development… not professionally reviewed… no video, music or instructor likeness". `contentOrigin: original_text`.        |
| **Programs**                                 | 1                                     | "Sample 4-week starter (text only)".                                                                                                                                                                                                                                          |
| **Draft strength and home packs**            | Development and review builds only    | Labelled "Draft, not reviewed"; the content gate fails CI if a draft is ever bundled.                                                                                                                                                                                         |
| **A functioning session**                    | Yes, as a guided timer                | Pre-count, timed blocks with written cues, low-impact alternates, pause and skip, haptics, completion logging, history, achievements, optional share. It runs on the written outlines. It is genuinely functional software, but it is a timer with instructions, not a class. |
| **Review and licensing machinery**           | Built, empty                          | Presentation resolver (real dancer, 3D dancer, guided text), review states, licence register, publication-readiness gates, admin content checks, `expo-video` dependency for playback. Everything is in place to _accept_ real content; there is none.                        |

**Honest wording for the app and listing today** (already how the in-app text reads): "Guided text: step-by-step instructions with a timer" and "No demonstration has been recorded for this workout yet." Titles such as "Afrobeats Party Cardio" promise more than the content delivers; with no video or music behind them they should not appear in a production build as classes.

## 2. What is missing for a real dance-fitness experience

1. **Recorded instruction:** a real instructor performing and cueing the choreography on camera, with a low-impact option shown.
2. **Music** the product has the right to use: composition and master rights for in-app, synchronized use, or original or production-library music with written worldwide terms.
3. **Written rights** for every person and asset: instructor name, image, voice and likeness; choreography ownership or licence; performer and location releases.
4. **Professional review** of every class by a certified fitness professional (gate F1), recorded.
5. **Captions and accessibility** (captions, audio-description alternative via the written steps, reduced-motion support already exists in the player).
6. **A hosting and delivery decision:** where the video files live and how they are served.
7. **Store-listing honesty:** screenshots and description that show only what ships.

## 3. The smallest credible V1 content package (proposal, for your approval)

Goal: a launch library that a reviewer and a customer would recognise as dance fitness, with every class genuinely playable and clearly licensed. Nothing below is commissioned, purchased or started.

**Library (about 95 finished minutes, 8 classes)**

| #   | Class                                       | Length | Notes                 |
| --- | ------------------------------------------- | ------ | --------------------- |
| 1   | Warm-up                                     | 5 min  | shared by every class |
| 2   | Cool-down and stretch                       | 5 min  | shared                |
| 3   | Dancehall                                   | 10 min | the brand style       |
| 4   | Afrobeats                                   | 10 min |                       |
| 5   | Amapiano                                    | 10 min |                       |
| 6   | Low-impact (seated or standing, no jumping) | 10 min | the accessible class  |
| 7   | Dancehall                                   | 20 min | longer session        |
| 8   | Afrobeats                                   | 20 min | longer session        |

**Per class:** one instructor on camera with a second performer showing the low-impact version; on-screen block timer and captions; cues spoken in the video; music mixed in the video (so no separate music player is needed for V1); matching written steps already in the app as the text fallback.

**Rights and review (must exist before any class is published):** one or two instructor agreements; choreography ownership clauses; performer, location and trademark releases; music either commissioned, or licensed from a production library, under written terms for worldwide in-app use (not chart music); a licence record for every asset in the register; a recorded review by a certified fitness professional per class; legal advice on the agreements.

**Engineering needed (small, because the player and gates exist):** an upload and publishing path for approved clips; signed playback links or a bundling decision; caption files; turning on the approved-content gate for these classes; removing the unreviewed outlines from production. No new screens.

**Hosting estimate (arithmetic, not a quote):** 95 minutes at 1.5 Mbps is about 1.1 GB; at 2 Mbps about 1.4 GB. That exceeds the 1 GB storage on Supabase's Free plan (unconfirmed; verify), so serving it likely needs a paid storage or CDN decision or in-app bundling (which affects app size). Decide before shooting.

**Costs and timeline:** I cannot give honest numbers. They depend on whether you shoot yourselves, hire a production, commission music, and on instructor terms. Obtain two or three quotes for: a one- or two-day studio shoot with editing and captions; music commissioning or a production-library licence; a fitness-professional review; and legal drafting.

**A smaller fallback** (not recommended, since you want a real dance-fitness experience at launch): ship three classes (Dancehall, Afrobeats, low-impact, 10 minutes each) and say plainly that more are coming. Even this needs the same rights and review.

**Not acceptable for V1:** presenting the written outlines, stick-figure motions or the guided timer as dance classes; using chart music or any uncleared recording; generating instructor likenesses or music without your approval and a rights position.

## 4. Decisions needed from you

1. Production route: your own shoot, a hired production, or licensed existing content.
2. Instructor(s) and the agreement terms.
3. Music route: commissioned, production library, or instructor-owned.
4. Hosting: bundle in the app, or approve a paid storage/CDN service (not activated without your approval).
5. Budget and target date for the launch library.
6. Interim wording for the store listing and review notes until the library exists.
