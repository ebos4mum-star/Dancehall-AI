# Instructional media, the guided player and audio

Status of every part, stated plainly. Nothing here claims that real dancer video, rigged 3D dancers, licensed music or reviewed choreography exist: none do yet.

## What the player does today (fully implemented, tested, running in the browser)

- **Before the session**: title, style, time, level, impact, equipment, guide, a movement-by-movement preview, safety guidance, a low-impact switch, sound controls and a **Start** action.
- **Preparation countdown** (3, 2, 1) with a large numeral (a non-audio cue), pause and skip.
- **During**: a stage with the movement name and instruction on a solid panel (never over the timer or controls), a timer ring, segmented progress, the upcoming movement, previous / pause / resume / next, and **End session with confirmation**.
- **After**: actual time moved, movements finished (an early end does not count the movement in progress), effort picker, save. A session that is ended early is labelled as such and is saved only if the person chooses; a workout that was only opened or started records nothing.
- **Timing engine** (`packages/shared/src/session-clock.ts`): a wall-clock meter credits whole elapsed seconds (never animation frames); a throttled poll catches up, but at most 5 s per poll, so a suspended app cannot count as exercise; pausing, backgrounding and returning drop the partial second; a restored session returns paused with no added time; finishing twice is a no-op; the save is guarded by `once`.
- **Cues** (`apps/mobile/src/audio/cues.ts`) are derived from state changes (countdown, go, new movement, last three seconds, finish) and drive haptics plus optional speech.
- **Voice cues**: working on web (browser speech synthesis). On iOS and Android they are reported unavailable until a native speech module is evaluated and added; haptics, numerals and the timer still guide.
- **Volume and mute**: voice volume and mute persist; music controls exist but are disabled with an explanation.

## Presentation modes: asset-ready architecture

`packages/shared/src/instruction-media.ts` defines the contract:

- `InstructionalTrack`: workout, presentation (`real_dancer` | `dancer_3d`), licence id, review status, attribution, uri, per-movement difficulty / impact / low-impact availability, and a rig id for 3D.
- **Sequence and timing always come from the workout's blocks.** A track must match them exactly (`sequenceMatches`) or it is rejected as `sequence_mismatch`. Switching presentation can never reorder or retime a session.
- `resolvePresentation` offers a mode only when the track is licensed for the country and date, **approved**, matching, loadable and (with low impact on) has an authored low-impact version for every movement. Otherwise the mode is listed as **Unavailable with the reason**, and the player shows guided text.
- `src/player/catalog.ts` holds the (empty) catalogue and a renderer registry. A track with no registered renderer is treated as unable to load, so an unplayable mode is never advertised.
- No 3D runtime or video dependency was added. Before one is, it needs evaluation against Expo SDK 58 (candidates: `expo-video` for real footage; a glTF renderer such as `expo-gl` + three for 3D) for native performance and bundle size, and should not be enabled to show placeholder models.

Pulse stays a separate role (companion, small, never over the instruction, timer or controls).

## Missing production assets and reviews (blocks "production-ready")

| Missing                                                                                                                              | Needed for                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Owner-supplied or licensed **real instructor footage** per workout (Afrobeats, Amapiano, Latin, etc.), with likeness licences        | Real dancer mode                                                  |
| **Rigged 3D dance animation** and a character rig, authored to the same movement sequence                                            | 3D dancer mode                                                    |
| **Licensed or original workout music** with usage rights, and beat/timing metadata if beat-synchronised choreography is ever claimed | Music; "beat-synchronised" claims are NOT made                    |
| **Professionally reviewed choreography**, modifications and safety content (a different person from the author)                      | Publishing any workout beyond sample content                      |
| Native speech module evaluated for iOS/Android                                                                                       | Spoken cues off the web                                           |
| Real-device testing (iPhone)                                                                                                         | Native audio interruption handling, haptics, background behaviour |

Shortest authored session is 5 minutes, so no shorter workout is shown. No rest or transition intervals are authored in the current workout data, so none are shown; the engine's segment model supports them when content exists.
