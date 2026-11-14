# UI/UX design direction (authoritative)

Status: **approved direction, owner-issued product requirement** for all current and future development. Where another document or the current code disagrees, this document wins; reconcile the other one. The _specific_ character, Today-screen look and final palette values still need owner approval before substantial visual work (section 10).

**Design style: Premium Hybrid 3D Animated Fitness World.** DanceHall Fit AI should feel like a living, interactive fitness experience rather than an ordinary health tracker. Every major screen should feel: **premium, alive, motivating, personal, intuitive, accessible.** The app should be recognizable through its visual identity and interaction quality, not merely its logo.

## 1. Identity

Combine: premium modern fitness UI; high-quality stylized 3D characters; animated storybook environments; interactive illustrations; purposeful microanimations; meaningful haptics; emotional storytelling; clear, accessible health and nutrition information. Playful and emotionally engaging, yet sophisticated enough for adults.

Avoid: childish cartoon interfaces, generic fitness dashboards, excessive gradients, static screens without personality.

## 2. Visual language

Provisional palette (owner-specified; final values subject to approval):

| Name          | Hex       | Intended role                                                  |
| ------------- | --------- | -------------------------------------------------------------- |
| Midnight Plum | `#24143D` | Text on light, dark-mode surfaces, hero backgrounds            |
| Electric Lime | `#B8F244` | Primary action and success accent, mostly on plum              |
| Warm Coral    | `#FF785E` | Warmth, celebration, secondary accent                          |
| Warm Ivory    | `#F7F4EE` | Light-mode background                                          |
| Soft Violet   | `#9D80EB` | Depth, illustration, decorative and non-text UI (see contrast) |

Contrast notes (WCAG ratios computed from these exact values; every text pairing must be re-verified by `tokens.test.ts` before it ships):

- Plum on Ivory 15.4:1 and Plum on Lime 12.7:1: safe for all text. Plum on Coral 6.5:1 and Plum on Violet 5.4:1: safe for text.
- **Lime on Ivory 1.2:1, Coral on Ivory 2.4:1, Violet on Ivory 2.9:1: never use as text or as the only indicator on a light background.** Put plum text on a lime/coral/violet fill, or use these colors only on plum surfaces and as decoration with a text or shape alternative.
- Dark mode uses Midnight Plum surfaces with Ivory text; light and dark must both be supported.

Surfaces: rich depth, rounded corners, subtle shadows, polished typography, restrained glass-like effects only where they do not reduce legibility. Reduced-motion and reduced-transparency alternatives are required.

## 3. Signature 3D experience (architecture only for now)

- **A. Signature animated AI fitness coach**: one memorable, friendly 3D character that welcomes, introduces activities, celebrates achievements and guides the journey.
- **B. Customizable user avatar** (appearance, hairstyles, outfits, accessories): eventually.

Both belong in the design architecture. **Do not** build the avatar creator, commission or purchase 3D assets, add paid animation services, or pick the final character design without separate owner approval. Start with reusable **character stages** and **animation interfaces** (a typed set of states such as `enter`, `idle`, `greet`, `celebrate`, `encourage`, `think`, `rest`, that a placeholder-free stage can render once an approved asset exists). Do not ship generic placeholder illustrations or unapproved 3D assets.

## 4. The five tabs

| Tab       | Role                                                                   | Direction                                                                                                                                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today** | Living Fitness Dashboard (signature, the reference for the other tabs) | Prominent animated character environment, personalized greeting, Daily Fit Plan, workout recommendations, nutrition progress, goal summaries. Welcoming, alive, personal.                                                                                                                                                    |
| **Dance** | Cinematic Fitness Experience (most energetic)                          | Expressive workout cards, motion, vibrant dance-style environments, animated transitions, guided workouts, rewarding completion. Instructions and safety controls stay readable and conventional.                                                                                                                            |
| **Food**  | Beautiful AI Nutrition Experience                                      | Real food photography for actual meal recognition; refined food illustrations for meal-planning content. **The camera calorie counter is the primary action.** Animated nutrition summaries, editable calorie estimates, food swaps, meal plans, clear portion controls. Never sacrifice nutritional clarity for decoration. |
| **Coach** | Interactive AI Companion                                               | Conversational, supported by an expressive animated coach that responds warmly and explains recommendations. Reactions and transitions never interrupt chat and never imply medical expertise; simulated replies stay labeled as simulated.                                                                                  |
| **Me**    | Personal Progress and Identity                                         | Polished progress charts, achievements, goal history, avatar identity elements. Celebrate consistency, energy, participation and completed activities, not only weight. Sensitive health data stays private.                                                                                                                 |

## 5. Human-psychology requirements (apply everywhere)

Recognition (relevant personalization) · Encouragement (reward meaningful progress without guilt or shame) · Belonging (welcoming, social dance fitness) · Agency (users control goals, preferences, personal information) · Recovery (missed days trigger supportive comeback experiences, never punishment) · Delight (occasional memorable animations and character reactions for meaningful achievements).

**Prohibited:** manipulative streaks, weight-based competition, guilt, pressure. These are consistent with `FITNESS_SAFETY.md` and `NUTRITION_SAFETY.md` and are already enforced in code for AI text (guilt-language filter) and the comeback flow.

## 6. Animation and interaction system

Reusable building blocks, all honoring reduced motion (`useReducedMotion`) and cheap on low-end devices (native driver / transform and opacity only):

- Character entrance and idle states (stage API from section 3).
- Animated screen transitions.
- Interactive card feedback (press scale, depth).
- Progress-ring animations; count-up numbers.
- Workout-completion celebrations.
- Contextual haptics (`haptics.ts`): light for selection, success for completion, warning for guarded actions; never on every tap.
- Motion-aware onboarding.
- Reduced-motion alternatives: a static or single-frame equivalent that still communicates the state.

Rules: purposeful, performant, accessible; **do not animate every element continuously**; no looping motion near text a person is reading; nothing flashes.

## 7. Storybook presentation (selective)

Use cinematic, animated storybook presentation for: onboarding, the Today hero, workout introductions, challenges, milestone celebrations, character-driven coaching moments.

Use clean, conventional controls for: forms, food logs, charts, settings, privacy, subscriptions. Emotion where it helps; usability everywhere else.

## 8. Accessibility baseline

WCAG AA text contrast minimum (verified in tests); 44pt touch targets; screen-reader labels and roles on every control; dynamic type; light and dark mode; reduced motion and reduced transparency; no information carried by color or animation alone; haptics are never the only feedback.

## 9. Current implementation audit (retain, not rebuild)

Audit scope: only enough to know what to keep. Source: `apps/mobile/src/ui`, `src/theme`, `src/a11y`.

| Existing piece                                                                                                                                   | Verdict                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme/tokens.ts`, `useTheme`, contrast tests                                                                                                    | **Retain structure and tests.** Palette values are the earlier crimson/violet/gold foundation (its header says the identity needs approval) and **must be remapped to section 2 in the visual phase**; the new pairings above must pass the same contrast tests. |
| `ui/motion.tsx` (`usePressScale`, `useCountUp`, `Reveal`, `Floating`, `Ring`), `FadeIn`, `a11y/useReducedMotion`                                 | **Retain.** Already cover press feedback, count-up, progress ring, entrance and ambient float with reduced-motion handling.                                                                                                                                      |
| `ui/haptics.ts`                                                                                                                                  | **Retain.** Extend with named celebration patterns later.                                                                                                                                                                                                        |
| `ui/Depth.tsx` (`DepthCard`, `HeroCard`, `CharacterStage`)                                                                                       | **Retain and extend.** `CharacterStage` is the seam for the section 3 character; today it hosts a placeholder orb, not an approved character.                                                                                                                    |
| `AppText`, `Button`, `Card`, `Choice`, `TextField`, `Banner`, `EmptyState`, `EstimateBadge`, `ProgressBar`, `WeightChart`, `Screen`, `DevBanner` | **Retain** as the conventional-controls layer (forms, logs, charts, settings). Restyle through tokens, not rewrites.                                                                                                                                             |
| `dance/ui.tsx`                                                                                                                                   | **Retain**; the Dance cinematic treatment builds on it.                                                                                                                                                                                                          |

Gaps to fill in the visual phase: approved character and stage states, screen-transition set, completion celebration, milestone and comeback scenes, real food photography handling in the camera flow, refined food illustrations for meal plans, avatar identity slot on Me. Known stale copy to fix then: the Today "Coming to your day" card and the onboarding coach-consent note still say features are "not available yet".

## 10. Process and approvals

1. This document is the specification. Functional screens are preserved while live integration finishes; **no full redesign interrupts that work.**
2. **Owner approval is required before substantial visual implementation** of: the signature character concept, the Today-screen visual direction, the final palette values, any 3D asset or animation service, and the avatar creator.
3. Proposed **visual implementation phase** (after live integration), starting with Today as the reference for the other tabs:
   1. Present for approval: character concept (2-3 directions, stylized, adult-appropriate), Today-screen composition, final palette and type.
   2. Token remap + contrast tests; character stage state machine with reduced-motion fallbacks (no asset yet).
   3. Today screen build with the approved character; extract patterns.
   4. Dance, then Food (camera first), Coach, Me, applying the Today patterns.
   5. Onboarding storybook, milestone and comeback scenes.
   6. Accessibility, performance (low-end device) and visual regression pass; extend the browser regression in `apps/mobile/e2e`.
4. Keep this document current; a change to the direction is an owner decision.
