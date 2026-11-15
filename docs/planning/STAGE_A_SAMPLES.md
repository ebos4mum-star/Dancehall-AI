# Stage A sample outputs

These are the **real, unedited outputs of the engine** (`resolvePathways`, rules version 1) for six different people, generated from the code, not written by hand. They show the structure and wording a screen would use in Stage B. **No screen shows any of this yet.** All wording is provisional and unreviewed by a dietitian, clinician or exercise professional. Calorie and protein figures are not computed by the engine: they come from the existing `nutritionTargets` and are shown here only so you can see when they are withheld.

## A. Lose weight, new to exercise, loves Dancehall and Caribbean food

_Goal: lose. Experience: new. Styles: dancehall, afrobeats. Cuisine: Caribbean. Safety answers complete and clear. Body details shared._

**What the person sees at the top**

> Your plan is built around: Dance and aerobic activity, Balanced nutrition, Healthy habits and Everyday movement. You can change any of it.
>
> You might also like: Foods you grew up with. Nothing changes until you choose it.
>
> A gentle, steady pace with safety limits. Nothing here promises a result.

**Pathways** (focus: `weight_loss`, numbers hidden: false)

- **Dance and aerobic activity** (primary, from_goal): It fits your goal to lose weight at a gentle, steady pace.
  - Try Afrobeats sessions. _Why: These match the styles you chose._
  - Note: Dancehall sessions are not in the catalogue yet, so other styles are shown for now.
- **Balanced nutrition** (supporting, from_goal): It fits your goal to lose weight at a gentle, steady pace.
  - Build balanced plates: protein, vegetables, and starchy foods or whole grains. _Why: A balanced plate is a gentle default that needs no counting._
  - Add fibre-rich foods such as beans, vegetables and fruit. _Why: Fibre helps you feel satisfied, and it adds variety._
  - A general protein range is about 64 to 96 g a day. _Why: It is an estimate from your details, not a target you must hit. A dietitian can personalise it._
- **Healthy habits** (supporting, from_goal): It fits your goal to lose weight at a gentle, steady pace.
  - Pick one or two small habits to start with. _Why: Small habits take almost no time and add up. You can have up to five._
- **Everyday movement** (supporting, from_goal): It fits your goal to lose weight at a gentle, steady pace.
  - A short walk counts. _Why: Walking is an easy way to move on days dance is not the plan. You log it by hand; there is no step counting yet._
- **Foods you grew up with** (supporting, suggested, needs your OK): You told us you eat Caribbean foods. This is only a suggestion. Nothing changes until you choose it.
  - Build plates around Caribbean foods you already enjoy. _Why: No food is labelled good or bad. The aim is balance, portions you are happy with, and foods that fit your life._

**Habit ideas** (offered, never created for them): Dance to one song you love; Add a vegetable to one meal; Drink a glass of water

**Daily plan adjustments**: impact `any`, seated `false`, intensity limit `low`, styles `afrobeats`, strength prompt `false`, weigh-in prompts `true`

- Workout reason: You chose Afrobeats, so those come first. Dancehall sessions are not in the catalogue yet, so we show other styles for now. You are new to this, so sessions start easy.
- Meal reason: You chose Caribbean foods, and swap ideas favour them.

**Progress shown**: consistency, non_scale_wins, dance_stamina, walking, nutrition_habits, sleep_energy, weight_trend, calories  
**Progress hidden**: strength, maintenance, measurements

**Nutrition numbers** (from the existing `nutritionTargets`): mode `estimate`, calories guide 1679 (maintenance 2099, floor 1527, weekly change -0.4 kg), protein 64 to 96 g.

**What we do not know**: You have not chosen your own pathways yet, so these come from your goal. Choose any you like.

**Professional support suggested**: false

---

## B. Build strength, West African food, dumbbells at home

_Goal: strength. Chose pathways: strength training, balanced nutrition, foods you grew up with. Experience: some. Equipment: dumbbells._

**What the person sees at the top**

> Your plan is built around: Strength training, Balanced nutrition and Foods you grew up with. You can change any of it.
>
> Your goal does not use a weight target, so progress is about how you feel and what you do.

**Pathways** (focus: `weight_neutral`, numbers hidden: false)

- **Strength training** (primary, chosen): You chose this pathway.
  - Log your strength sessions (dumbbells). _Why: Guided strength workouts are not available yet, so you log self-directed sessions._
  - Make it a little harder only when the current level feels comfortable and your body feels fine. _Why: Gradual change is a common general principle. This guidance has not been professionally reviewed yet._
  - Keep easy or rest days between harder days. _Why: Recovery is part of getting stronger._
  - Note: Guided strength routines are not available yet.
- **Balanced nutrition** (supporting, chosen): You chose this pathway.
  - Build balanced plates: protein, vegetables, and starchy foods or whole grains. _Why: A balanced plate is a gentle default that needs no counting._
  - Add fibre-rich foods such as beans, vegetables and fruit. _Why: Fibre helps you feel satisfied, and it adds variety._
  - Eat enough to fuel training, with protein spread through the day. _Why: Building strength needs enough food, so there is no deficit and no weight target here._
  - A general protein range is about 64 to 96 g a day. _Why: It is an estimate from your details, not a target you must hit. A dietitian can personalise it._
- **Foods you grew up with** (supporting, chosen): You chose this pathway.
  - Build plates around West African foods you already enjoy. _Why: No food is labelled good or bad. The aim is balance, portions you are happy with, and foods that fit your life._

**Habit ideas** (offered, never created for them): Do a short strength session; Add a vegetable to one meal

**Daily plan adjustments**: impact `any`, seated `false`, intensity limit `moderate`, styles `none`, strength prompt `true`, weigh-in prompts `false`

- Meal reason: You chose West African foods, and swap ideas favour them.

**Progress shown**: consistency, non_scale_wins, strength, nutrition_habits, weight_trend, calories, measurements  
**Progress hidden**: dance_stamina, walking, sleep_energy, maintenance

**Nutrition numbers** (from the existing `nutritionTargets`): mode `estimate`, calories guide 2099 (maintenance 2099, floor 1527, weekly change 0 kg), protein 64 to 96 g.

**Professional support suggested**: false

---

## C. Fitness only, no numbers at all

_Goal: improve fitness. Tracking: none (no calorie or weight numbers). Likes walking. Evening schedule._

**What the person sees at the top**

> Your plan is built around: Dance and aerobic activity, Everyday movement and Healthy habits. You can change any of it.
>
> You might also like: Mindful eating. Nothing changes until you choose it.
>
> Your goal does not use a weight target, so progress is about how you feel and what you do.

**Pathways** (focus: `weight_neutral`, numbers hidden: true)

- **Dance and aerobic activity** (primary, from_goal): It fits your goal to improve your fitness.
  - Try a short dance session you enjoy. _Why: Dance counts as aerobic activity and is easier to keep up when it is fun._
- **Everyday movement** (supporting, from_goal): It fits your goal to improve your fitness.
  - A short walk counts. _Why: Walking is an easy way to move on days dance is not the plan. You log it by hand; there is no step counting yet._
- **Healthy habits** (supporting, from_goal): It fits your goal to improve your fitness.
  - Pick one or two small habits to start with. _Why: Small habits take almost no time and add up. You can have up to five._
- **Mindful eating** (supporting, suggested, needs your OK): You chose not to track numbers, and mindful eating is a calm, number-free way to notice how meals feel. This is only a suggestion. Nothing changes until you choose it.
  - Check in with hunger and fullness before or after a meal. _Why: Hungry, comfortable or full: there is no right answer, and it can make eating calmer._

**Habit ideas** (offered, never created for them): Wind down before bed; Dance to one song you love; Take a short walk outside

**Daily plan adjustments**: impact `any`, seated `false`, intensity limit `none`, styles `none`, strength prompt `false`, weigh-in prompts `false`

**Progress shown**: consistency, non_scale_wins, dance_stamina, walking, sleep_energy  
**Progress hidden**: strength, nutrition_habits, maintenance, weight_trend, calories, measurements

**Nutrition numbers** (from the existing `nutritionTargets`): mode `general`, calories none shown, protein none shown.

**What we do not know**: You have not chosen your own pathways yet, so these come from your goal. Choose any you like. We do not know your movement experience, so we do not limit session intensity. Tell us and we will match it.

**Professional support suggested**: false

---

## D. Keeping steady after reaching a goal

_Goal: maintain. Reached the goal they set. Detailed tracking._

**What the person sees at the top**

> Your plan is built around: Keeping steady, Dance and aerobic activity, Balanced nutrition and Healthy habits. You can change any of it.
>
> The focus is keeping steady while you enjoy moving and eating well.

**Pathways** (focus: `maintenance`, numbers hidden: false)

- **Keeping steady** (primary, from_goal): It fits your goal to keep your weight steady.
  - Keep movement and meals regular, and adjust in small steps. _Why: Small adjustments last longer than big swings._
  - Weight moves up and down day to day, so look at the trend, weekly at most. _Why: Normal fluctuation is not a setback._
- **Dance and aerobic activity** (supporting, from_goal): It fits your goal to keep your weight steady.
  - Try a short dance session you enjoy. _Why: Dance counts as aerobic activity and is easier to keep up when it is fun._
- **Balanced nutrition** (supporting, from_goal): It fits your goal to keep your weight steady.
  - Build balanced plates: protein, vegetables, and starchy foods or whole grains. _Why: A balanced plate is a gentle default that needs no counting._
  - Add fibre-rich foods such as beans, vegetables and fruit. _Why: Fibre helps you feel satisfied, and it adds variety._
  - A general protein range is about 64 to 96 g a day. _Why: It is an estimate from your details, not a target you must hit. A dietitian can personalise it._
- **Healthy habits** (supporting, from_goal): It fits your goal to keep your weight steady.
  - Pick one or two small habits to start with. _Why: Small habits take almost no time and add up. You can have up to five._

**Habit ideas** (offered, never created for them): Weekly check-in with yourself; Dance to one song you love; Add a vegetable to one meal

**Daily plan adjustments**: impact `any`, seated `false`, intensity limit `none`, styles `none`, strength prompt `false`, weigh-in prompts `true`

**Progress shown**: consistency, non_scale_wins, dance_stamina, nutrition_habits, sleep_energy, maintenance, weight_trend, calories, measurements  
**Progress hidden**: strength, walking

**Nutrition numbers** (from the existing `nutritionTargets`): mode `estimate`, calories guide 2099 (maintenance 2099, floor 1527, weekly change 0 kg), protein 64 to 96 g.

**What we do not know**: You have not chosen your own pathways yet, so these come from your goal. Choose any you like. We do not know your movement experience, so we do not limit session intensity. Tell us and we will match it.

**Professional support suggested**: false

---

## E. Lose-weight goal, but food can feel difficult

_Goal: lose. Shared an eating concern. Chose mindful eating and healthy habits._

**What the person sees at the top**

> Your plan is built around: Healthy habits and Mindful eating. You can change any of it.
>
> You told us food can feel difficult, so we are not offering weight-loss targets. Movement, sleep, water and habits are all still here, and a doctor or a dietitian who works with eating concerns can support you.

**Pathways** (focus: `weight_neutral`, numbers hidden: true)

- **Healthy habits** (primary, chosen): You chose this pathway.
  - Pick one or two small habits to start with. _Why: Small habits take almost no time and add up. You can have up to five._
- **Mindful eating** (supporting, chosen): You chose this pathway.
  - Notice how a meal felt, with no scoring. _Why: A gentle reflection, without numbers or targets._
  - Note: Because you told us food can feel difficult, we keep this to gentle reflection. A doctor or a dietitian who works with eating concerns can support you.

**Habit ideas** (offered, never created for them): Drink a glass of water; Wind down before bed; Pause and check in before a meal

**Daily plan adjustments**: impact `any`, seated `false`, intensity limit `none`, styles `none`, strength prompt `false`, weigh-in prompts `false`

**Progress shown**: consistency, non_scale_wins, sleep_energy  
**Progress hidden**: dance_stamina, strength, walking, nutrition_habits, maintenance, weight_trend, calories, measurements

**Nutrition numbers** (from the existing `nutritionTargets`): mode `professional`, calories none shown, protein none shown.

**Withheld for safety**: You told us food can feel difficult, so we are not offering weight-loss targets. Movement, sleep, water and habits are all still here, and a doctor or a dietitian who works with eating concerns can support you.

**What we do not know**: We do not know your movement experience, so we do not limit session intensity. Tell us and we will match it.

**Professional support suggested**: true

---

## F. Needs seated, low-impact movement; safety answers not completed

_Goal: lose. Mobility: seated. Wants Reggae. Quick safety questions not answered yet._

**What the person sees at the top**

> Your plan is built around: Dance and aerobic activity, Balanced nutrition, Healthy habits and Everyday movement. You can change any of it.
>
> We have not seen your quick safety answers yet, so we are not offering weight-loss targets until you complete them.

**Pathways** (focus: `weight_neutral`, numbers hidden: false)

- **Dance and aerobic activity** (primary, from_goal): It fits your goal to lose weight at a gentle, steady pace.
  - Try a short dance session you enjoy. _Why: Dance counts as aerobic activity and is easier to keep up when it is fun._
  - Use the seated and low-impact versions. _Why: You asked for gentler movement._
  - Note: Reggae sessions are not in the catalogue yet, so other styles are shown for now.
- **Balanced nutrition** (supporting, from_goal): It fits your goal to lose weight at a gentle, steady pace.
  - Build balanced plates: protein, vegetables, and starchy foods or whole grains. _Why: A balanced plate is a gentle default that needs no counting._
  - Add fibre-rich foods such as beans, vegetables and fruit. _Why: Fibre helps you feel satisfied, and it adds variety._
  - Note: No weight-loss targets are offered right now. See the note at the top.
- **Healthy habits** (supporting, from_goal): It fits your goal to lose weight at a gentle, steady pace.
  - Pick one or two small habits to start with. _Why: Small habits take almost no time and add up. You can have up to five._
- **Everyday movement** (supporting, from_goal): It fits your goal to lose weight at a gentle, steady pace.
  - A short walk counts. _Why: Walking is an easy way to move on days dance is not the plan. You log it by hand; there is no step counting yet._

**Habit ideas** (offered, never created for them): Dance to one song you love; Add a vegetable to one meal; Drink a glass of water

**Daily plan adjustments**: impact `low`, seated `true`, intensity limit `low`, styles `none`, strength prompt `false`, weigh-in prompts `false`

- Workout reason: Reggae sessions are not in the catalogue yet, so we show other styles for now. You asked for gentler movement, so low-impact options come first.

**Progress shown**: consistency, non_scale_wins, dance_stamina, walking, nutrition_habits, sleep_energy, calories  
**Progress hidden**: strength, maintenance, weight_trend, measurements

**Nutrition numbers** (from the existing `nutritionTargets`): mode `general`, calories none shown, protein none shown.

**Withheld for safety**: We have not seen your quick safety answers yet, so we are not offering weight-loss targets until you complete them.

**What we do not know**: You have not chosen your own pathways yet, so these come from your goal. Choose any you like. We do not know your movement experience, so we do not limit session intensity. Tell us and we will match it. We have not seen your quick safety answers, so we start with low-impact options until you complete them.

**Professional support suggested**: false

---
