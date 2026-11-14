# Visual design system, Phase 1 (Today reference)

Status: **implemented for Today only, awaiting owner review.** Dance, Food, Coach, Me and child screens are unchanged except the shared tab bar. Source of truth for direction: `UI_UX_DESIGN_DIRECTION.md` and `CHARACTER_BRIEF_PULSE.md`.

## Palette and type

Midnight Plum `#24143D`, Electric Lime `#B8F244`, Warm Coral `#FF785E`, Warm Ivory `#F7F4EE`, Soft Violet `#9D80EB` (`theme/tokens.ts`, contrast-tested). Lime, coral and violet are never text on light surfaces. Hierarchy: hero greeting 32/38 extra-bold, screen title 28, card heading 20, body 16, caption 13. One typeface (system/Inter), no decorative fonts.

## Components (reusable)

| Piece               | Where                       | Rule                                                                                                                                                                               |
| ------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pulse state machine | `src/pulse/machine.ts`      | Five states (idle, welcome, dance, celebrate, encourage), priority celebrate > encourage > welcome > dance > idle, lower requests dropped, one-shots settle to idle. Pure, tested. |
| Pulse figure        | `src/pulse/PulseFigure.tsx` | Layered vector art (satin body, emissive eyes and chest pulse line, coral rim only when celebrating, ribbon). One authored still pose per state.                                   |
| Pulse stage         | `src/pulse/PulseStage.tsx`  | Transform and opacity only, native driver. Reduced motion shows the still pose. `usePulse()` owns the machine.                                                                     |
| Hero scene          | `src/scene/HeroScene.tsx`   | Four static depth layers plus one slow drifting glow. Decorative, hidden from screen readers. Left of stage left free for a future avatar.                                         |
| Next up             | `PlanCard` (`NextUpBlock`)  | One block, one action, from the existing plan. Primary-coloured fill with onPrimary text.                                                                                          |
| Tab bar             | `app/(tabs)/_layout.tsx`    | Active tab: lime pill, plum filled icon (shape and fill, not colour alone).                                                                                                        |

## Motion rules

Animate only to explain, confirm or delight. Welcome once per local day (rise, 2.4 s). Celebrate only for a genuinely new recorded accomplishment, never on first load (two hops, 1.9 s, success haptic). Encourage only on a comeback (soft lean, 2 s). Idle is a 2.4 s in/out breathing at 2.5 percent, stops on unmount. No flashing, no looping motion next to body copy beyond that breathing. Reduced motion: no movement at all; every state still has its still pose and a text label.

## Haptics

Light tap on a deliberate action, success on a real accomplishment, warning on a guarded action. Nothing on idle or encourage. Web has no haptics (silently ignored).

## State treatments

Loading: skeleton card. Empty: plain, kind sentence ("Nothing recorded yet, and that is fine"). Success: Pulse celebrate plus a text line. Error: warning notice with the cause, action stays available. Missing data is never drawn as zero progress.

## Assets and licences

- Pulse, the hero scene and all icons in Phase 1 are original vector code in this repository (react-native-svg) plus the Ionicons set already in the app (MIT). No third-party artwork, no AI-generated imagery, no paid assets.
- **Real photography: none used.** Pexels, Unsplash and Pixabay were not reachable from the build environment (egress blocked), so no image could be fetched or licence-checked. No placeholder photos were inserted. When photography is sourced, each image needs: source URL, photographer, licence name and URL, date checked, attribution text if required, and a statement that it is stock and does not depict a DanceHall instructor or a real workout in the app.
- Quality limit: Pulse is a polished 2.5D vector character, not the Blender-rendered 3D asset the brief prefers. It is a faithful first renderer behind the stage interface and can be swapped for rendered assets without touching screens.

## Phase 2: the world system across every screen

One shared layer, applied everywhere, so each screen is part of the same world without per-screen artwork.

| Piece             | Where                                    | Use                                                                                                                                                                                                |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| World scenes      | `scene/SceneBackdrop.tsx`                | Five environments (today hall, dance stage, food kitchen, coach conversation, me growth steps) sharing sky, rhythm arcs, curtains, spotlight and a lime-rimmed floor. Unique SVG ids per instance. |
| `HeroCard world=` | `ui/Depth.tsx`                           | The big tab heroes sit on their world's scene.                                                                                                                                                     |
| `CharacterStage`  | `ui/Depth.tsx`                           | Renders Pulse in a given state. `artwork` replaces Pulse with a rendered image later without touching screens.                                                                                     |
| `Screen banner=`  | `ui/Screen.tsx`, `scene/WorldBanner.tsx` | Compact world header (scene, Pulse, one supportive line, legibility scrim) on child screens.                                                                                                       |
| Pulse moments     | `pulse/moment.ts`, `MomentHost`          | Short celebration for real accomplishments (meal saved, goal set, challenge started, onboarding finished). One at a time, tap to dismiss, reduced-motion safe.                                     |
| Empty states      | `ui/EmptyState.tsx`                      | Pulse plus a plain, kind sentence and one next step.                                                                                                                                               |
| Transitions       | `app/_layout.tsx`                        | Slide in; none with reduced motion.                                                                                                                                                                |

Screen coverage (every Expo Router screen): sign-in and onboarding steps 1-5 (banner, progress bar, step-specific Pulse); Today (hero, Next up, done today); Dance tab, workout detail, guided session (Pulse dances while running), completion (celebrate), history, programs, schedule; Food tab, add, camera, review, history, plans, saved, swap, household; Coach tab (Pulse reacts to replies), weekly review, privacy; Me tab, goals, progress, challenges, privacy and settings. Not implemented in the product and therefore not designed: friends, HealthKit, barcode scanning, account sign-up.
