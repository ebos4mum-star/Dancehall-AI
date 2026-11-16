# V1 instructor-led video classes: audit, implementation plan, hosting, rights and production plan

Date: 2026-11-16. **Status: plan for the owner's approval. Nothing has been built, bought, hosted, shot, licensed or published, and no video exists.** Direction approved by the owner: **Option A, real instructor-led dance workout videos for the first App Store release.** No AI-generated instructors, no unlicensed commercial music or video.

Figures marked _(assumption)_ are my planning ranges, not quotes. Figures marked _(verify)_ came from search snippets because the vendors' own sites could not be opened from this environment (`supabase.com`, `cloudflare.com`, `mux.com` and `bunny.net` do not resolve here). Replace both kinds with real quotes and current pricing pages before committing money.

---

## 1. Audit: what the workout experience and player can do today

**The session screen** (`apps/mobile/app/dance/session.tsx`, `src/player/*`) is a mature guided workout:

- Preview, 3-2-1 countdown, timed blocks with a ring, segmented progress, next-movement preview, pause, previous, next, end with confirmation, low-impact switch, effort picker, save, optional share.
- A wall-clock engine (`packages/shared/src/session-clock.ts`): it credits whole elapsed seconds, catches up at most 5 s per poll, pauses on backgrounding, and recovers an interrupted session. Logged time is therefore the time actually exercised.
- Haptic cues always; spoken cues only on web (native speech module not added).
- Logging, history, achievements, calorie estimate and completion all hang off this engine.

**The video seam already exists, and it is empty on purpose:**

- `InstructionalTrack` (`packages/shared/src/instruction-media.ts`): a recorded track for a workout, with a licence id, review status, attribution (instructor id), a `uri`, and one entry **per workout block** (`seconds`, difficulty, impact, `hasLowImpactVersion`).
- `resolvePresentation`: offers a recorded track **only if** it is licensed for the country and date, approved by a reviewer, **matches the workout's block sequence and durations exactly**, loads, and (with low impact on) has a low-impact version of every block. Otherwise it falls back to guided text and says why. The picker (`PresentationPicker`) lists "Real dancer" as Available or Unavailable with the reason. When a track is available it becomes the default presentation.
- `src/player/catalog.ts`: a **stage renderer registry**. `StageRendererProps = { track, positionS, playing, reducedMotion, onError }`. The contract is explicit: _renderers follow the canonical clock, they never drive it._ `session.tsx` already renders the registered renderer inside the hero stage with `positionS={doneS}` and `playing={status === 'running'}`.
- **No renderer is registered for `real_dancer`, and `INSTRUCTION_TRACKS` is empty.** A track with no renderer is reported "unable to load", so nothing unplayable is ever advertised.
- Licensing, review and publication gates: licence register, reviewer roles (exercise professional, not the author), bundled-content gate that fails CI if an unapproved clip is bundled, admin readiness checks.
- Playback building blocks: `expo-video` (~58) is installed and already used for the movement demonstration player (`src/demo/DemoPlayer.tsx`: play, pause, seek, rate, time updates, error callback) and Community video. Caption support exists for demonstration clips (`CaptionCue`, `activeCaption`, a captions toggle) but not yet for tracks.

**What is missing for streamed class video:**

1. A `real_dancer` renderer that streams video and slaves it to the canonical clock (sync policy, buffering and error handling).
2. Captions for tracks (the track type has none) and a captions toggle in the session.
3. A way to get a **short-lived streaming address** for a track (private, not a public link).
4. Class definitions authored **from the recorded video** (blocks whose seconds match the video timeline), with the approved review and licence records.
5. Voice handling: spoken cues (web) must not double up with the instructor's voice.
6. Policy for a video that stalls (the timer must not credit time while the class is not playing).
7. Tests for the above and an on-device test (web cannot play HLS natively in every browser, so a phone is required).

**Two design facts that matter:**

- Block timing is the contract. The recorded class has to be cut and cued so each block starts at a known second and lasts exactly its authored length. The timer then and the video agree by construction, and logging, skip and previous keep working with no new logic.
- Licensing by territory: `licenceAllows` needs a country unless the licence covers `*`. A guest has no country, so a US-only licence would hide the video from guests. Prefer a **worldwide licence** (or restrict the App Store listing to the territories you license).

---

## 2. Smallest implementation plan (nothing started)

No new screens. Same session screen, same picker, same completion flow.

| #   | Piece                                                                                                                                                                                                                                                                                                                                                                                                                   | Size | Notes                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------- |
| 1   | **`real_dancer` stage renderer** using `expo-video` and HLS, registered in `catalog.ts`. Pure sync rule in `packages/shared` (`decideVideoSync`): play/pause follows `playing`; if video time and `positionS` differ by more than about 1 s, seek; never drives the clock.                                                                                                                                              | M    | Unit-tested with a fake player.                                   |
| 2   | **Stall policy:** extend `StageRendererProps` with `onStall(boolean)`. A buffering video pauses the session (reuses the runner's pause), resumes when ready. Persistent failure falls back to guided text via the existing `missing` mechanism.                                                                                                                                                                         | S    | Keeps credited time honest.                                       |
| 3   | **Captions:** add `captionCues` to `InstructionalTrack`, an overlay below the video reusing `activeCaption`, and an On/Off row in the existing audio panel. Default **on**.                                                                                                                                                                                                                                             | S    | Captions are required for a class to be approved (existing rule). |
| 4   | **Voice handling:** when a recorded track is active, mute app speech cues (haptics stay). Instructor audio comes from the video.                                                                                                                                                                                                                                                                                        | S    |                                                                   |
| 5   | **Playback address function:** a small Edge Function route (`playback`) that checks the track against a server-side allow-list of **approved** classes, checks licence and territory, and returns a short-lived signed HLS address using the video host's signing key (a function secret, never in the app). Rate-limited like the Community function. Guests allowed (guest-first), limited by hashed network address. | M    | Provider-specific part is one small adapter.                      |
| 6   | **Class definitions:** 8 workout definitions authored from the final edits, plus 8 `InstructionalTrack` records (per-block seconds, impact, low-impact flags, captions, instructor, licence id, review record). A validation script checks `sequenceMatches`, video duration within 1 s of the block total, caption coverage and review/licence completeness before anything is published.                              | M    | Content work as much as code.                                     |
| 7   | **Catalogue source:** metadata for approved classes shipped in the app (small JSON) in V1; moving to the database later is optional. Video bytes are never bundled.                                                                                                                                                                                                                                                     | S    | Satisfies "stream, don't bundle".                                 |
| 8   | **Tests and QA:** shared unit tests, renderer tests with a fake player, session integration tests (pause, skip, previous, low-impact, stall, error fallback), and a real-device test matrix (cellular and Wi-Fi, background and return, interruptions, airplane mode mid-class, VoiceOver, captions, Dynamic Type).                                                                                                     | M-L  | The device pass cannot be skipped.                                |
| 9   | **Store readiness:** review notes and listing updated to describe exactly what ships; the "unreviewed outlines" removed from production.                                                                                                                                                                                                                                                                                | S    |                                                                   |

**Rough size** _(assumption)_: about 2-3 engineer-weeks, dominated by the device test pass and the playback function. It can run in parallel with production because the player can be tested against a licensed **test clip you own** or one we are explicitly permitted to use (not a stock clip of unknown terms).

**Not in V1:** downloads for offline use (rights, storage and DRM questions), live classes, picture-in-picture, AirPlay casting, multi-angle, personalised or AI-generated instruction, music-only mode, background audio. Each can follow later.

**Streaming behaviour:** adaptive HLS (several quality levels) so it works on cellular; the preview shows the class length and a short "uses mobile data when you stream" line in the existing preview text; if the connection fails the person keeps the written steps and the timer. Apple's current guidelines no longer carry the old cellular-video rule (2.5.7 reads "intentionally omitted"), but HLS is still the right technology for adaptive streaming on iOS.

---

## 3. Hosting, storage, bandwidth and playback technology

**Requirements:** adaptive HLS; private/signed playback so licensed classes cannot be hot-linked; WebVTT or cue captions; simple pricing at small scale; no long contract; the masters stay in **your** storage so you are never locked in; works with `expo-video` (native AVPlayer, HLS supported natively on iOS).

**Library size:** about 95 minutes. Stored in adaptive HLS at a typical ladder, roughly 1.1-1.8 GB _(assumption)_.

**Delivery arithmetic (my assumption of usage, for planning):**

- Pilot, 100 members, 3 classes a week, 12 min each: about 15,600 minutes delivered a month.
- Beta, 1,000 members, same behaviour: about 156,000 minutes a month.
- At roughly 1 Mbps average delivered, one minute is about 7.5 MB, so 156,000 minutes is about 1.2 TB _(assumption)_.

| Option                                                                                                                          | Storage                                                                                                                                             | Delivery                                                  | Signed playback / captions                                                   | Estimated monthly cost at pilot / beta                                                     | Notes                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Cloudflare Stream**                                                                                                           | $5 per 1,000 minutes stored (prepaid) _(verify)_                                                                                                    | $1 per 1,000 minutes delivered _(verify)_                 | Signed URLs and captions listed as features; confirm current docs _(verify)_ | about $5 + $16 = **$21** / about $5 + $156 = **$161**                                      | Simple, predictable per-minute model; encoding reported free _(verify)_                                    |
| **Mux Video**                                                                                                                   | Free plan reported at 10 stored videos and about 100,000 delivery minutes a month, no card _(verify)_; paid plans from about $20 a month _(verify)_ | Per-minute above the free allowance (rates unconfirmed)   | Signed playback (JWT) and caption upload are standard features _(verify)_    | pilot **$0 if the free plan really allows 8 videos**; beta likely paid (rates unconfirmed) | Eight videos fit the reported 10-video free cap; good developer tools; price risk grows with delivery      |
| **Bunny Stream**                                                                                                                | about $0.01 per GB per month _(verify)_                                                                                                             | about $0.01 per GB _(verify)_                             | Token authentication and captions: **not confirmed** _(verify)_              | about $0.02 + $1.2 = **about $1.2** / about $0.02 + $12 = **about $12**                    | Cheapest at scale if its token security and captions meet the requirements; confirm minimum monthly charge |
| **Self-managed HLS** (encode once on a laptop with ffmpeg; files on object storage behind a CDN; signed URLs from our function) | a few cents a month                                                                                                                                 | CDN egress                                                | You build signing and captions                                               | under $5 / likely under $20                                                                | Lowest cost, most work and most to maintain; reasonable for 8 fixed videos                                 |
| **Supabase Storage**                                                                                                            | Free 1 GB (not enough) _(verify)_                                                                                                                   | Pro includes a bandwidth allowance then per-GB _(verify)_ | Signed URLs yes; **no HLS or adaptive encoding**, progressive MP4 only       | not recommended                                                                            | Weak for streaming on cellular                                                                             |
| **YouTube / Vimeo / social embeds**                                                                                             | n/a                                                                                                                                                 | n/a                                                       | n/a                                                                          | n/a                                                                                        | Not suitable: terms and ads, and Apple 5.2.2/5.2.3 on third-party content                                  |

**Recommendation:** use a managed streaming service so we do not build encoding and delivery. **Cloudflare Stream is the default** (predictable, per-minute, signed URLs, captions), **Mux's free plan is a reasonable zero-cost pilot** if its current terms allow, and **Bunny is the cost-optimised alternative** if its token security and captions are confirmed. The app and the playback function are written against "an HLS address and a signed token", so switching providers is one adapter. Keep the original masters, captions and music stems in storage you own. **I will not create an account or spend anything until you choose.**

Technology: HLS in `expo-video` (AVPlayer on iOS). Subtitles: I could not confirm `expo-video`'s subtitle API for this SDK from documentation, so the plan renders captions **in the app from cue files** (already how demonstration clips work), which works with any host and is testable. Verify on a device before committing.

---

## 4. Rights, permissions and safety review (what must exist before any class is published)

Nothing below exists today. Have a lawyer draft and review it (see `docs/LEGAL_REVIEW_PACKAGE.md`). Do not describe any of it as approved until it is.

**Instructor agreement** (each instructor and each performer):

- Name, image, voice and likeness for the app, store listing, marketing and social, for the term of the app's life plus a wind-down; territories (worldwide preferred); exclusivity (or none); fee and any royalty; credit; takedown and what happens when the relationship ends (including removal and replacement of classes).
- **No AI use of the person:** no cloning, synthesis, training or re-voicing of their face, body, voice or movement without separate written consent. This also blocks substituting an AI instructor for the approved human-led classes.
- Warranties that they own or can license the choreography, that they are an adult, and insurance/indemnity terms.
- Who owns the footage, the choreography, and derivative cuts; moral rights and re-edit rights.

**Choreography:** original, or licensed in writing from its owner; no copied routines from commercial videos; dance styles (dancehall, Afrobeats, amapiano) are cultural traditions, so name and credit sources and have a practitioner from the tradition review authenticity (the existing gate already requires a cultural review for Dancehall).

**Music:** exactly one of these routes per track, in writing:

1. **Commissioned original** music under work-for-hire or full assignment, with the composer's and performers' releases; or
2. **Production-music library** licence covering synchronization into video, in-app distribution, streaming, worldwide, a term at least as long as the app's, and use in paid or free apps. Keep the licence document and the track registration; some libraries claim monetization on platforms, so confirm in-app use is covered; or
3. **Instructor- or artist-owned** music with a written licence covering both the composition and the sound recording.
   Never chart music, unlicensed samples, or "royalty-free" tracks without checking the licence text. Cue sheets and licence PDFs go in the licence register.

**Releases and clearances:** performer releases for everyone on camera; location release; no visible third-party logos, artwork or trademarks; no children; no minors in the background.

**Fitness-safety review (gate F1), per class:** a certified fitness professional who is **not** the author reviews each class and the authored block list: warm-up and cool-down adequacy, intensity progression, joint-safe movements and impact, beginner clarity and pacing, form cues spoken before speed, low-impact alternatives actually performed (second performer on screen), rest and hydration prompts, surface and space guidance, "stop if you feel unwell" language, and advice for people who are pregnant, injured or returning to exercise to see a professional. The review record (name, credential, date, evidence reference) is stored and required by the publication gate. Our nutrition and weight messaging stays provisional and non-medical.

**Accessibility:** accurate captions (reviewed against the spoken script), on by default; clear spoken description of each movement (so the video is usable without watching, with the written steps as the alternative); good contrast for on-screen text; Dynamic Type for in-app text.

---

## 5. Production plan and estimated costs

**The eight classes** (about 95 finished minutes): Warm-up (5), Cool-down (5), Dancehall (10), Afrobeats (10), Amapiano (10), Low-impact (10), Dancehall (20), Afrobeats (20). Each: one lead instructor and one performer showing the low-impact version, beginner-first spoken guidance, on-screen block name and timer, captions, original or licensed music mixed under the voice.

**Route options**

| Route                                    | What it is                                                                                                                                                                                          | Estimated total _(assumption)_ | Timeline _(assumption)_ | Pros                                                    | Risks                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **1. You commission freelancers**        | You hire an instructor/choreographer, a second performer, a small crew (camera, sound), rent a studio for 2 days, edit and caption in-house or with a freelance editor, commission or license music | **about $16,000 - $59,000**    | 8-12 weeks              | Most control, best price-to-quality, you own the assets | You manage the shoot and rights; schedule risk                                                                 |
| **2. Production company, turnkey**       | One company handles casting, shoot, edit, captions and music                                                                                                                                        | **about $25,000 - $80,000+**   | 8-12 weeks              | One accountable party                                   | Higher cost; check they assign rights to you                                                                   |
| **3. License existing classes**          | License finished dance-fitness classes from a rights holder                                                                                                                                         | **unknown, needs quotes**      | Fastest, if available   | Speed                                                   | Rarely exclusive; branding and style control limited; rights terms must permit in-app streaming and your edits |
| **4. Smaller launch library (fallback)** | 5 classes (warm-up, cool-down, Dancehall, Afrobeats, low-impact, 10 min each)                                                                                                                       | about 60% of Route 1 or 2      | 6-10 weeks              | Cheaper and faster                                      | Thin for a first release; Apple may still judge on usefulness (Guideline 4.2)                                  |

**Route 1 cost build-up** _(assumption: typical US freelance and small-studio ranges; replace with quotes)_

| Item                                                                     | Low               | High              |
| ------------------------------------------------------------------------ | ----------------- | ----------------- |
| Instructor and choreography fee (project buyout, one or two instructors) | $1,500            | $5,000            |
| Second performer (low-impact), 2 days                                    | $600              | $1,600            |
| Crew (camera, sound, assistant), 2 days                                  | $4,000            | $10,000           |
| Studio rental, 2 days                                                    | $1,000            | $3,000            |
| Editing, colour, titles for 8 classes                                    | $4,000            | $12,000           |
| Captions: transcription and timing review                                | $100              | $300              |
| Music: library licence, or commissioned originals                        | $500              | $12,000           |
| Fitness-professional review, about 20-30 hours                           | $1,500            | $6,000            |
| Legal: agreements and music/likeness review                              | $2,000            | $6,000            |
| Production insurance                                                     | $500              | $1,500            |
| Hosting, first year (see section 3)                                      | $0                | $2,000            |
| **Total**                                                                | **about $15,700** | **about $59,400** |

**Steps and owners**

1. Approve route, budget and target date (owner).
2. Choose hosting (owner approves; no account created before).
3. Shortlist instructors; agree terms; lawyer drafts agreements (owner, counsel).
4. Choose a music route and license or commission tracks (owner, counsel).
5. Script each class as a timeline of blocks with exact seconds, spoken cues and low-impact versions (instructor with fitness reviewer; the block list becomes the workout definition).
6. Pre-production review of the scripts by the fitness professional.
7. Shoot with a click track or timing sheet so blocks land on the authored seconds; capture a clean voice track.
8. Edit, mix, caption; produce HLS renditions on the host.
9. Final fitness review of the finished video, cultural review for dancehall, rights file complete, licence records entered.
10. Engineering integration per section 2; publish gate passes; device testing.
11. Store listing and review notes written from what actually ships.

**Honesty rules until the classes exist:** the app, listing and review notes must not claim video classes, instructor-led workouts, music or "dance classes". Until then the experience is described as guided text with a timer. No placeholder, stock or generated class is published.

---

## 6. Decisions needed from you

1. **Production route** (1, 2, 3 or the fallback 4), a **target launch date**, and a **budget ceiling**.
2. **Instructor(s):** who, and permission to start conversations. (No agreements are signed or promised by this plan.)
3. **Music route** (commissioned, library, or instructor-owned).
4. **Hosting choice** (Cloudflare Stream default, Mux free pilot, Bunny, or self-managed), and approval to open an account only after you choose.
5. **Territories:** worldwide licences (recommended, so guests with no country still see the video), or limit the App Store listing to the territories you license.
6. **Engineering go-ahead** for the plan in section 2, including whether to start it in parallel with production using a clip you own for testing.
7. **Counsel:** engage a lawyer for the instructor, choreography and music agreements.

Nothing is purchased, hosted, built or published until you approve.
