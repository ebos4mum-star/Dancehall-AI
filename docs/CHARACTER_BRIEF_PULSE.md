# Character design brief: Pulse (working name)

Status: **design brief for owner review. Nothing in it has been built, purchased or commissioned.** No final character assets exist, no screen has changed, and no spending is authorized. Every cost figure is a rough estimate to be re-checked before any approval request.

Owner decision recorded: **Concept B, Pulse, is the initial signature companion, with a planned evolution toward Concept C, The Dance Hall.** Palette is the provisional one in `UI_UX_DESIGN_DIRECTION.md` section 2. That document stays authoritative; this brief refines its section 3 (character stages) and section 6 (animation system).

> **The name "Pulse" is a working name only. It is not legally cleared.** See section 9.

## 1. Silhouette, materials, colors, personality

**Concept.** Pulse is an abstract, non-human companion: a luminous, softly rounded "energy form" built around a heartbeat-and-rhythm motif. It is deliberately not a mascot animal, not a baby figure and not a realistic person. That keeps it adult-sophisticated, globally neutral (no ethnicity, gender or age read) and unrelated to the later user avatar.

**Silhouette (readable at 48 px).**

- A tall, rounded teardrop-capsule body with a slight lean, so the pose reads as "ready to move".
- Two short, tapered limb-like extensions that can become arms or ribbons. No fingers, no feet; motion comes from the torso, a pair of arm forms and a trailing "pulse ribbon".
- One signature feature: a **pulse line** across the chest that animates like a rhythm trace and is the main carrier of emotion.
- Face: minimal. Two soft eye shapes and no mouth by default. Expression comes mainly from eye shape, body posture and the pulse line, not from a detailed cartoon face. A faint, small mouth arc is allowed in `celebrate` only. This avoids exaggerated cartoon faces.

**Materials (stylized 3D look, restrained).**

- Body: satin, softly translucent resin in Soft Violet `#9D80EB` shading toward Midnight Plum `#24143D` at the base.
- Pulse line and eyes: emissive Electric Lime `#B8F244`.
- Warm Coral `#FF785E`: rim accent and celebration glow only.
- Warm Ivory `#F7F4EE`: specular highlights and eye catch-lights.
- No metallic chrome, glitter, heavy bloom, particles that persist, or lens flares. One soft contact shadow.

**Personality.** Warm, rhythmic, encouraging, calm confidence. It celebrates consistency and participation rather than weight or perfection, and it never shames, pressures or implies medical expertise. Voice and behavior follow `FITNESS_SAFETY.md`, `NUTRITION_SAFETY.md` and the guilt-language filter. Pulse reacts; it does not nag, and it never appears to judge a missed day.

**Emotional range (all within a restrained vocabulary):** calm, curious, welcoming, joyful, supportive, thoughtful.

**Global fit.** No text on the character, no culture-specific gestures, no religious or national symbols, and no skin or hair. Dance moves are generic rhythm movement; style-specific dance is shown by the environment and music, not by caricature.

**Accessibility of the art itself.** Pulse is decoration plus feedback, never the only carrier of information. Every state has a text label or announcement (section 5). Lime is never used as text color on light backgrounds (contrast 1.2:1); Pulse's lime elements sit on plum or violet fields.

## 2. The five animation states

The design spec's state vocabulary is `enter, idle, greet, celebrate, encourage, think, rest`. Owner-requested states map as: **welcome = enter + greet**. `dance` is new and is added to the typed interface. `think` and `rest` remain reserved (not in the first scope).

| State         | Trigger                                                          | Motion (summary)                                                                                                    | Loop?               | Target length    |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------- |
| **idle**      | Default on any screen                                            | Slow breathing scale (about 1-2 %), occasional blink, pulse line at a calm resting rhythm                           | Yes, seamless       | 4-6 s            |
| **welcome**   | App open, first view of Today each day, onboarding               | Rises into frame, turns toward the viewer, small open-arm gesture, pulse line brightens once, returns to idle       | No (one-shot)       | 2.0-2.5 s        |
| **dance**     | Dance tab hero, workout start and active workout header          | Rhythmic sway, step-and-bounce, arm-ribbon flow; pulse line synced to a fixed tempo                                 | Yes, 2 or 4 bars    | 4-8 s loop       |
| **celebrate** | Workout completed, goal milestone, consistency milestone         | Short jump, ribbon swirl, coral rim glow, pulse line flares once; no confetti storm (one restrained accent burst)   | No (one-shot)       | 1.5-2.0 s        |
| **encourage** | Missed days, a tough day, return after a break, rest-day message | Gentle lean forward, soft nod, a small supportive gesture; warm and calm, never sad or disappointed in expression   | No (one-shot, soft) | 2.0 s            |

Rules for every state:

- Each one-shot returns to `idle` by an authored transition clip, not a hard cut.
- No flashing; no luminance change faster than 3 per second.
- Pulse is never animated continuously next to body text that someone is reading (idle is slow and low amplitude; see fallbacks).
- Haptics follow `haptics.ts`: light on tap, success on `celebrate`; none on `idle` or `encourage` loops.
- `celebrate` is reserved for meaningful achievements, not every tap, so it stays special.

### State machine

A small, typed, framework-independent state machine owns transitions (the "stage API" the spec already requires):

```ts
type PulseState = 'idle' | 'welcome' | 'dance' | 'celebrate' | 'encourage';
// reserved: 'think' | 'rest'
type PulseEvent =
  | { type: 'appOpened' } | { type: 'workoutStarted' } | { type: 'workoutEnded' }
  | { type: 'milestone' } | { type: 'comeback' } | { type: 'settled' };
```

- One-shot states auto-transition to `idle` on `settled`. `dance` persists until `workoutEnded`.
- A priority rule prevents interruptions: `celebrate` > `encourage` > `welcome` > `dance` > `idle`. A queued state is dropped, not stacked, if it is older than a few seconds.
- The machine emits a **text description** for every state (used for accessibility labels) and exposes `reducedMotion` and `performanceTier` inputs so the renderer, not the logic, chooses the fallback.
- Pure logic with unit tests (no renderer dependency), consistent with the existing store and test style. The renderer is a swappable adapter, which is also what makes the later avatar and a later switch of technology cheap.

## 3. Pulse across the five tabs

Pulse appears **large only where it earns it** and otherwise stays small or absent, so it never competes with health information.

| Tab       | Presence                                                              | States used                                          | Notes                                                                                                                          |
| --------- | --------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Today** | Hero, roughly 35-40 % of screen height at the top                     | `welcome` (first view of the day), `idle`, `celebrate` | The reference composition (section 4).                                                                                          |
| **Dance** | Hero on the tab, small header chip during workouts                    | `dance`, `celebrate` on completion                   | Instructions and safety controls stay conventional and readable; Pulse never covers them. Most energetic tab.                  |
| **Food**  | Small companion beside the primary camera action                      | `idle`; brief `celebrate` only for a logged-goal milestone | The camera calorie counter stays the primary action. No animation near nutrition numbers; nutrition clarity beats decoration. |
| **Coach** | Compact avatar in the conversation header; reacts to message tone     | `idle`, `encourage`, brief `welcome`                 | Never interrupts chat or scroll; simulated replies stay labeled "simulated"; never implies medical expertise.                  |
| **Me**    | Small, in the identity area; foundation for the later avatar          | `idle`, `celebrate` on achievements                  | Celebrates consistency, energy, participation; never weight-based. Placeholder slot reserved for the future avatar (section 7). |

The same character, scaled and cropped, appears everywhere (one asset family, different crops), which supports a consistent identity and a small total asset size.

## 4. Today-screen composition

Top to bottom (safe-area aware, tested at the smallest supported iPhone width and with large text):

1. **Hero stage (approx. 35-40 % height).** Midnight Plum environment with a soft Soft Violet gradient glow behind Pulse; a few static, low-contrast rhythm arcs as depth (not animated continuously). Pulse centered-right, leaning toward the content. A reserved **empty slot** to the left or below for a future second character (the user's avatar).
2. **Greeting.** Personalized, Ivory text on plum (contrast passes), one short line; never mentions weight or compares to others. Pulse's gaze and gesture point at it during `welcome`.
3. **Daily Fit Plan card** (primary action). Ivory card on the plum field, plum text, lime button with plum label.
4. **Recommended workout** card (Dance tab entry), then **nutrition progress** rings, then **goal summary**.
5. **Comeback variant.** After missed days the hero uses `encourage`, the greeting is supportive, and the primary action is a gentle short session. No streak counters, no loss framing.

Light mode uses Warm Ivory content surfaces under the plum hero; dark mode uses plum surfaces throughout. The hero is the only large dark area in light mode.

## 5. Reduced-motion and low-performance fallbacks

The renderer receives `reducedMotion` (from `useReducedMotion`) and a `performanceTier`; the state machine is unchanged.

| Condition                                              | Behavior                                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reduced motion on**                                  | No looping or large movement. Each state shows a **single authored still pose** that conveys it (welcoming open arms, dancing mid-step, celebratory pose, supportive lean), with a brief crossfade (or none) between them. `celebrate` is a still pose plus a non-motion cue (static glow, text, success haptic if haptics enabled). |
| **Reduced transparency on**                            | Replace translucent and glow effects with solid fills; contrast unchanged.                                                                                     |
| **Low-performance tier** (older device, Low Power Mode, thermal pressure, or measured dropped frames) | Lower frame rate (12-15 fps frame sequences) or still poses with a simple transform; `dance` becomes a two-pose alternation at a slow rate; no real-time effects. |
| **Asset failed to load or still downloading**          | Show the still `idle` pose immediately (small, bundled, a few KB), then upgrade when the animation is ready. No spinner and no blank hero.                     |
| **Screen reader**                                      | Pulse is exposed as one decorative-with-label element: "Pulse, your coach, is cheering" style label that updates on state change (announced politely, not repeatedly). Controls never depend on Pulse. |
| **Large text / small screens**                         | Hero shrinks and Pulse crops; text never overlaps the character.                                                                                               |

Every fallback must **still communicate the state**, per the spec's rule that the reduced-motion alternative be a static or single-frame equivalent that still communicates.

## 6. Animation technology evaluation

Question: how do we get a premium, animated, stylized-3D-looking companion cheaply, accessibly and maintainably on iPhone, open-source first, with no paid service?

### Options

| Option                                                                 | Summary                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Pre-rendered assets driven by our own state machine** (recommended to prototype) | Author Pulse once in Blender (free, open source), render each state to transparent image sequences or alpha video, and play them via the typed state machine. |
| **B. Skia** (`@shopify/react-native-skia`, open source)                | Draw or composite Pulse in real time on a GPU canvas; vector or layered 2D with shader effects.                                                          |
| **C. Real-time 3D** (three.js / expo-gl / react-three-fiber, or a glTF runtime) | Ship a rigged 3D model and animate it live on device.                                                                                       |
| *Reference: vector state-machine runtimes (Rive, Lottie)*              | Rive has an open-source runtime and built-in state machines; its authoring editor is a vendor tool with free and paid tiers. Lottie is open source but needs After Effects (paid) for good authoring. A 2D-leaning alternative to A, not a 3D-look one. |

### Comparison (qualitative; to be confirmed by a prototype, not by these estimates)

| Criterion                | A. Pre-rendered + state machine                                               | B. Skia                                                         | C. Real-time 3D                                                      |
| ------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Mobile performance**   | Best and most predictable: playback only, no shading cost; battery-friendly    | Good for 2D/layered; cost grows with shader effects              | Highest cost: GPU, battery, thermals; worst on older devices         |
| **Asset size**           | Largest per state (frames or video); manageable with few states, one-time crops, compressed video/WebP, remote download | Smallest (vectors, layers, shaders)                              | Small-medium for model plus clips; textures dominate                 |
| **Animation quality**    | Highest "premium 3D" look per effort (offline lighting, soft shadows, materials) | Good stylized 2D look; true 3D materials are hard to fake        | Highest flexibility (view angles, lighting); easy to look cheap without strong art/tech direction |
| **Dev complexity**       | Low in app code (playback plus state machine); the work is art production       | Medium: build and animate layered art in code                    | High: pipeline, rig, runtime, lighting, memory, compatibility        |
| **Accessibility**        | Easy: still poses are just frame 0 of each clip; reduced-motion fallback is free | Good; stills are straightforward                                 | Needs a separate still-pose path; more risk of motion and jank       |
| **Maintenance cost**     | Each new pose or state means a re-render; cheap if the Blender scene is kept; pose cost grows with avatar variety | Moderate: code owns the art                                      | Highest: rig, runtime and device regressions; but best for avatars later |
| **Open source / cost**   | Blender, FFmpeg, expo-video or image libs: free                                  | Free (MIT)                                                       | Free libraries; costs are in expertise and device testing            |

### Recommendation

1. **Prototype Option A first** (as the owner suggested). Keep the **renderer behind an adapter** (`PulseStage` interface) so the first renderer can be replaced without touching screens or the state machine.
2. **Do not choose real-time 3D now.** Revisit it only when the Dance Hall avatar experience needs free camera angles and customizable outfits (section 7); at that point it earns its cost.
3. **Skia is a reasonable supplement**, not the character renderer: use it for hero background ambience, progress rings and glow where a cheap GPU effect helps.
4. A prototype must settle open questions before any production asset order: **alpha playback on iOS** (HEVC with alpha vs. PNG/WebP sequences, and what the chosen Expo/React Native video or image stack supports reliably), **bundle size** per state at 1x/2x/3x, and **frame-rate and memory** on an older iPhone. These are unverified assumptions, flagged deliberately.
5. Size budget (proposed target): first-launch bundle for Pulse under about 3-5 MB (still poses plus `idle`); remaining states downloadable on demand. Revisit with measurements.

## 7. Future transition: Pulse to The Dance Hall avatar experience

**Principle:** build the interfaces now; build the avatar system later. Nothing below is implemented or commissioned.

- **Stage architecture now.** A `CharacterStage` contract renders one or more "performers" from `{ id, kind: 'companion' | 'userAvatar', state, reducedMotion, performanceTier }`. Today only `companion: pulse` exists. The reserved second slot on Today and the identity slot on Me are layout placeholders that stay empty and invisible until an avatar exists.
- **Data model hook (future).** A nullable `avatar_config` (appearance, outfit, accessory ids) is reserved conceptually in the profile model. **No schema change is proposed now.**
- **Evolution path.**
  1. **Pulse only** (initial): signature companion.
  2. **Pulse plus a basic user avatar** (static or lightly animated, a small preset set) in Me and Dance, using the same stage contract.
  3. **The Dance Hall**: a shared stage where Pulse hosts and the user's avatar dances; customizable outfits and accessories; this is when real-time 3D or a glTF-based runtime is re-evaluated, with a skeleton shared by Pulse and the avatars.
- **Pulse stays Pulse.** Even in The Dance Hall, Pulse remains the host and guide, and the user's avatar is never forced to look like a human template. Avatar options must be inclusive across body types, ages, abilities, skin tones, hair textures and cultural dress, without body-shaming or weight-reflecting defaults.
- **Design constraint for assets now:** model Pulse on a simple, shared rig convention (center of mass, arm and ribbon anchor points) so a later real-time model can reuse the motion language.

## 8. Initial implementation scope and budget

Intent: develop economically. **Proposed ceiling: $300. No spending is requested or authorized by this document; each expense needs separate approval.**

**Free path (default).** Blender (modeling, rigging, rendering), FFmpeg, open-source fonts and libraries, our own state machine and tests. Primary cost is labor: someone with Blender character-animation skill.

| Item (all estimates, not quotes)                                              | Estimated cost             |
| ----------------------------------------------------------------------------- | -------------------------- |
| Tools (Blender, FFmpeg, open-source runtime libraries)                         | $0                         |
| Prototype and measurement spike (this repo, Option A, placeholder-free technical test using throwaway geometry that is not shown to users) | $0 (development time only) |
| Optional paid items, only if separately approved: a freelance Blender artist for modeling, rig and the five states; stock music or sound for celebration (not needed initially); a licence for a reference asset | Unknown; **5 polished states by a professional will likely exceed $300**. A realistic ceiling check is needed before any commitment. |

Honest note: $300 is tight for a professionally modeled, rigged and animated character. Likely outcomes: (a) the $300 ceiling funds a simpler Pulse (fewer states polished, stills for the rest); (b) a higher ceiling for the production assets; or (c) the owner or a collaborator authors the assets in free software. Choosing between these is an owner decision; I will bring a priced quote-style comparison, with no commitment, before anything is bought.

**Suggested sequence (each step needs owner go-ahead):**

1. Approve this brief or send changes.
2. Technical spike: prove alpha playback, bundle size and fallbacks on an iPhone with throwaway geometry (free).
3. Typed `PulseState` machine, `CharacterStage` interface and tests (free; no visual change to existing screens).
4. Owner decision on the production route for the final art (section 8 options a-c) and any budget.
5. Production of the five states, then integration into Today first.

## 9. Preliminary name and trademark availability review

**This is a quick web review for planning. It is not a clearance search, not legal advice and not a legal opinion. The name must not be described as cleared.** Searches covered public web results only, not the USPTO TSDR database, WIPO, EUIPO or other registries directly, and none of the results below was verified at its source register.

Findings (web results, November 2026):

- **App Store crowding.** Many fitness and wellness apps already use "Pulse" in the name, for example _Pulse: AI Fitness Coach_ (an AI coaching app), _Pulse - Community Fitness_, _Pulse AI_ (a wellness-companion app), _Fit Pulse AI_, and _FITIV Pulse AI Workout Tracker_. Several are AI-coach apps in the same space as DanceHall Fit AI. The closest dance-and-AI-coach app found was named differently (_ACE_).
- **Marks.** Web aggregators list U.S. PULSE filings including Pulse Labs, Inc. (Classes 9 and 44, one registered PULSE mark; class coverage of that mark unverified), Pulse Mindfulness, Inc. (Classes 9 and 41; pending), Studio Pulse, LLC (a pending Class 41 PULSE application for fitness classes), and Pulse Global Limited (PULSE FITNESS, Class 28; UK filings in Classes 9 and 41). These come from third-party aggregators and must be verified at the register.
- **Generic quality.** "Pulse" is a common English word with a strong descriptive/suggestive link to fitness and heart rate, which usually means a weaker, crowded mark and a higher collision risk.

**Assessment.**

- **As an app or brand name: high risk. Do not use "Pulse" as the product, app-store or logo name.**
- **As an in-app character name only (never the brand, logo, app name, domain or store keyword): lower risk, but not zero.** Risk rises if the character name is used in marketing, merchandise or a standalone product.
- Other points: "Pulse" is the working name only; no domain, handle or app-store name has been checked or reserved.

**Recommended next steps (all need owner approval; none taken):**

1. Keep "Pulse" internal and replaceable. Make the name a single constant and a design token, so renaming is a one-line change. Show it to users only after clearance.
2. Prepare 5-10 alternative names that evoke rhythm and warmth and are more distinctive (coined or compound words), and screen them the same way.
3. When a name is shortlisted, have a trademark attorney run a proper search (USPTO, relevant countries, app stores, domains, social handles) for Classes 9, 41, 42, 44 and 28 as applicable, before any public use or filing. This is a paid service, so it needs your separate approval; typical attorney clearance runs from a few hundred dollars upward (unverified estimate).
4. The product name "DanceHall Fit AI" was **not** reviewed here and needs the same check.

## 10. Open decisions for the owner

1. Approve or amend the silhouette, materials and personality in section 1 (concept art has not been made).
2. Approve the five states and the state machine in section 2, including the addition of `dance` to the spec's state set.
3. Approve a free technical spike (section 6, point 4).
4. Choose the production route and any budget for the final art (section 8). Note the $300 constraint.
5. Decide how to handle the name: keep "Pulse" as a working name, or begin screening alternatives (section 9).

## 11. Explicitly not done

No final character assets, concept art, renders, prototypes, dependency changes, schema changes, screen changes, purchases or paid-service signups. No other repository or infrastructure was touched; this work used only the DanceHall repository.
