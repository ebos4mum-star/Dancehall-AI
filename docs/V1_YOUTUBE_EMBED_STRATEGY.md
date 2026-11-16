# V1 free video: YouTube embed strategy (investigation, nothing built)

Date: 2026-11-16. Status: **investigation only. No playback code, no dependency added, no video added, nothing published, sent, deployed or built.** Builds on `docs/V1_FREE_VIDEO_RESEARCH.md` (shortlist and worksheet) and `docs/V1_VIDEO_PLAN.md`.

## 1. What I could and could not verify

| Source | Result |
| --- | --- |
| YouTube developer pages (`developers.google.com`, `.cn`), `youtube.com`, `support.google.com` | **Unreachable from this session** (name does not resolve). I could **not** read the current API Services Terms, Developer Policies, Required Minimum Functionality, IFrame API reference or any video page. |
| Search snippets about those pages | Seen, but **secondhand and unverified**. Listed in section 3 only as things to confirm. A snippet says the policies were revised as recently as 1 June 2026, so older summaries may be stale. |
| npm registry | **Verified.** `react-native-youtube-iframe` latest 2.4.1, published 2025-07-01 (about 16 months old). Peers: `react-native-webview >= 7`. Expo SDK 58 (`~58.0.25`, in this repo) pins `react-native-webview 14.0.1` (peers `react`/`react-native` `*`). |
| Apple App Review Guidelines (official page) | **Verified** text of 4.2, 4.2.2, 5.1.1(i), 5.1.2(i), 5.2.1, 5.2.2, 5.2.3 (page read to character 100,000 of 114,384; revision date not shown). |
| Any specific video's URL, embedding flag, licence, creator, duration | **None verified.** No video has been added. |

**Consequence (your decision 9):** playback must not be implemented yet. The terms and the library on iOS cannot be confirmed from here. To unblock without me guessing, either (a) a person with normal web access completes section 6, or (b) you allow `developers.google.com`, `www.youtube.com`, `support.google.com` in this session's network settings (a change you approve; I have not requested it).

## 2. Technical recommendation

**Use the official YouTube IFrame player inside `react-native-webview`, behind a provider-independent source type, as a staged, feature-flagged addition. Do not build until section 6 is complete.**

1. **Player:** `react-native-youtube-iframe` 2.4.1 is a thin wrapper over the official IFrame API (play, pause, seek, time, state events). It is the likely choice but is **stale (last release July 2025) and untested on React Native 0.88 / Expo SDK 58**. Alternative with no extra dependency: a small in-house `WebView` hosting the official iframe, which avoids an unmaintained wrapper but is more code. Decide after an on-device spike.
2. **Known iOS risk (unverified, from reports):** since late 2025 embeds can show **"Error 153, video player configuration error"** when the embedding page sends no valid HTTP Referer (reported in iOS web views). The fix is a real https `baseUrl`/origin and a Referer-friendly policy; whether the wrapper does this on SDK 58 must be tested on a real iPhone. A Referer also identifies our app to YouTube, which the policies require.
3. **Provider-independent source** (your decision 8): a class has `source: { kind: 'embed_youtube', videoId, startOffsets, attribution } | { kind: 'hosted', ... } | { kind: 'none' }` (guided text). One `ClassVideo` component picks the renderer; the session runner, logging and completion do not know the provider. Unavailable, unreviewed or unlicensed sources fall back to the guided-text class. A class cannot be published without its completed proof file (section 6).
4. **Timer:** the video is master; time is credited only while the player reports PLAYING and position advances (`docs/V1_FREE_VIDEO_RESEARCH.md` section 6). Timer ring and our controls sit **outside** the player rectangle (no overlays).
5. **Consent before first load:** a tap-to-play notice that says YouTube (Google) will receive device and network data; nothing from YouTube loads until the person taps. Use the privacy-enhanced `youtube-nocookie.com` embed host if the terms allow it for our use (to confirm).
6. **Hard rules from your decisions:** no download, cache, re-host, edit, crop, branding removal or mislabelling; every embedded class shows the creator name and a link to the original.
7. **Feature flag:** off in production builds until you approve; development builds can use it for the spike.

## 3. YouTube terms: what to confirm (all UNVERIFIED snippets)

Confirm each in the current official text and record the date and URL:
- The player may not be covered by overlays or have its appearance, controls or branding altered or obscured (our timer must be outside it).
- Embedded players must identify the client through the HTTP Referer.
- No downloading, caching, separating audio from video, or storing video outside the player.
- No nested iframe tricks that hide the source.
- Whether a **commercial** app has extra obligations (a snippet mentions a separate commercialization approval form for API data use; plain embedding without API data calls may not need it. Confirm).
- Whether the embedded-player policies allow our own play/pause/seek controls (they appear to allow calls through the official API).
- Required notices for end users (YouTube Terms of Service link, Google privacy policy link) shown in the app.

**Not confirmed, and not claimed:** that embedding any particular video is licensed for a commercial app. Embedding permission on YouTube is a platform setting by the uploader; it is not a licence for the content, music or likeness. That is why permission outreach (section 5) stays the primary route.

## 4. App Store review risks (official text verified; interpretation is mine)

| Guideline | Risk for embedded YouTube | Mitigation |
| --- | --- | --- |
| **4.2 / 4.2.2** ("beyond a repackaged website"; not "content aggregators, or a collection of links") | **Highest risk.** An app whose main content is other people's videos can be called an aggregator. | Make clear original function: the timer and block runner, effort and RPE logging, progress, streaks, programs, nutrition and weight tools, coach, household and celebrations, offline guided-text sessions, accessibility. Videos are one feature, not the product. State this in the review notes. Do not market "free YouTube classes" as the headline. |
| **5.2.1 / 5.2.2** (permitted under the service's terms; authorization on request) | Moderate. Apple can ask for proof. | Keep the terms review (section 3) and each creator's written permission on file. |
| **5.2.3** (no saving or downloading from third parties) | Low if we never cache or download. | No download button, no offline copy, no audio extraction. |
| **5.1.1(i) / 5.1.2(i)** (policy must name third parties; explicit permission before sharing) | Moderate. Our privacy text currently says no third-party sharing. | Draft in `docs/YOUTUBE_PRIVACY_DRAFT.md`; tap-to-play consent; App Privacy answers changed (not published). |
| **1.4 / health** | Low-moderate. Instructor videos contain safety claims we did not write. | Keep our own "check with a doctor" notice in the class screen; review each class for unsafe moves. |
| **Reliability (2.1)** | A deleted or blocked video would show a broken class to the reviewer. | Fallback to guided text; pre-submission check of every video from a clean device; reviewer notes list each video. |

Meaningful dance-fitness experience gate (**for your approval**): ship video classes only if there are **at least three cleared classes covering at least two of Dancehall, Afrobeats and Amapiano, including a beginner class and a warm-up or cool-down option**. Below that, ship V1 with the existing guided-text sessions and describe videos as "coming", not as a feature.

## 5. Permission outreach

Tracker and draft requests: `docs/V1_PERMISSION_TRACKER.md`. **Nothing is sent.** Written permission from the rights holder (covering commercial in-app embedding, the music, likeness, credit, takedown) is the only route that closes the rights question; the platform's embed setting is not a substitute.

## 6. Work needing a person with web access (blocks any implementation)

1. Read and save (with date) the current YouTube API Services Terms, Developer Policies, Required Minimum Functionality and IFrame API reference; confirm section 3.
2. For each candidate: complete the worksheet in `docs/V1_FREE_VIDEO_RESEARCH.md` section 8 (exact URL, creator, duration, style, embedding on, licence line, music, restrictions).
3. iPhone spike (needs a Mac or Expo dev build, which I cannot do here): confirm `react-native-youtube-iframe 2.4.1` or an in-house WebView plays an embed on SDK 58 without Error 153, supports pause/seek/time, captions, and that ads and end cards behave.

## 7. Core styles missing (for your approval)

Verified: **no cleared video exists for any style yet.** Leads only: Afrobeats beginner (charity-hosted classes, unverified), Afroletics (no authoritative URL). **No Dancehall instructor-led free class and no Amapiano instructor-led free class was found**, and no dedicated warm-up, cool-down or low-impact class in the target styles. Decision for you: launch with fewer styles under the gate in section 4, or hold video until Dancehall and Amapiano creators agree.

## 8. Remaining risks

- Rights: no verified licence for any video; creators can withdraw, change embedding or content at any time.
- Terms: could not be read this session; they changed as recently as June 2026 per a snippet.
- Technical: unmaintained wrapper, unverified Expo SDK 58 / iOS behaviour, Error 153, ads, no control over captions or quality.
- App Review: 4.2.2 aggregator perception; reviewers may ask for authorization (5.2.2).
- Privacy: current policy and App Privacy answers are wrong for embeds until updated.
- Legal: counsel has not reviewed any of this.
