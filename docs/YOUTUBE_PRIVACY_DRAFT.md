# Draft privacy and App Privacy changes for embedded YouTube playback (DRAFT, not published, not legally reviewed)

Applies only if embedded video ships. Based on App Review 5.1.1(i) and 5.1.2(i) (verified text). Google's own data practices and YouTube's requirements for embedders are **not verified** here; confirm against their pages before use.

## Privacy policy: text to add
> **Videos from YouTube.** Some classes are played from YouTube using YouTube's own player. Nothing from YouTube loads until you tap Play. When you do, your device connects to YouTube (a Google service), which can receive your device and network information, such as your IP address and device details, and may set or read identifiers on your device. Google handles that data under its own privacy policy and YouTube's Terms of Service, not ours. We do not tell YouTube who you are, and we do not pass it your health, food or progress data. If you do not want this, use the guided session instead, which works without YouTube. We do not download or store these videos.

Replace the current statement that the app has no third-party sharing with one that names this case. Link to YouTube Terms of Service and the Google Privacy Policy.

## In-app consent (tap to play)
Before the first video loads: a short notice, "This class plays from YouTube. YouTube (Google) will receive technical data from your device. [Play] [Use guided session instead] [Privacy]". Remember the choice, with a way to withdraw it in Settings. Declining must not block any other feature.

## App Store Connect: App Privacy (to review with counsel)
- Likely disclosures: Identifiers / Usage data / Diagnostics may be collected **by a third party (YouTube)** when playback is used; mark "not linked to the user's identity" only if that is accurate for the embed (to confirm).
- Tracking: answer after confirming whether the embed performs cross-app tracking; if it does, App Tracking Transparency applies. Do not assert "no tracking" until verified.

## Other updates
- Review notes: list each embedded video with creator, link and the creator's written permission.
- Data safety / DPIA record: add Google as a recipient for embedded playback.
- No change to authentication, PIN or recovery flows.
