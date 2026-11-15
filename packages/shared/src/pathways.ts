import { CURATED_FOODS } from './food-data';
import { CUISINES, regionTagsFor } from './cuisines';
import { homeWorkoutsAvailable } from './home-equipment';
import { HOME_ITEMS } from './home-items';
import { calorieNeeds, type ActiveWeightGoal, type ReadinessKind } from './calorie-needs';
import type { NutritionTargets, TargetInput } from './nutrition-plan';
import {
  DANCE_STYLES,
  WORKOUTS,
  isSeatedSuitable,
  type DanceStyle,
  type Intensity,
} from './workouts';
import {
  numbersHidden,
  weightTrackingOn,
  type CuisinePref,
  type GoalIntent,
  type PathwayId,
  type StylePref,
  type WellnessPrefs,
} from './wellness';

/**
 * The Weight Management Engine: one pure, deterministic, explainable rules module that coordinates what the app already has (wellness preferences, the daily plan,
 * nutrition targets, habits, strength logging, Pulse). It makes NO AI call, has no clock and no randomness, and every output carries the plain-language reason for it.
 *
 * Principles (each is tested):
 *  - Pathways are tags and rules, not screens or products. The person always keeps control: every pathway is editable.
 *  - A pathway the person chose is `chosen`; one derived from their stated goal is `from_goal`; one inferred from a stated preference is only `suggested`, and a
 *    suggestion never changes the plan until they choose it.
 *  - Nothing is inferred from information the person did not give. Missing information is listed in `missing`, never guessed. Unknown readiness is treated
 *    cautiously (gentle, low-impact start, no deficit numbers), exactly as the readiness screening already does.
 *  - Weight, calorie and body numbers are never produced here. Calorie and protein figures come only from `nutritionTargets`, and are null whenever the person's
 *    numbers are hidden. The engine states no weekly minute or session targets of its own.
 *  - Never offered, under any input: fasting, crash or very-low-calorie targets, rapid-loss incentives, detox or fat-burning claims, medical advice or medication
 *    guidance. Fasting is not a pathway and nothing here enables it.
 *
 * PROVISIONAL: the rules and wording are engineering defaults that no registered dietitian, clinician or exercise professional has reviewed. See PATHWAYS_RULES_STATUS.
 */
export const PATHWAYS_RULES_VERSION = 1;
export const PATHWAYS_RULES_STATUS = {
  reviewedByProfessional: false,
  note: 'Provisional engineering defaults. Not reviewed by a registered dietitian, clinician or exercise professional.',
} as const;

/** What can never be rewarded, shown as progress, or offered. Exported so tests can assert the engine never names them. */
export const NEVER_OFFERED = [
  'fasting',
  'rapid_weight_loss',
  'extreme_restriction',
  'very_low_calorie_target',
  'detox_or_cleanse',
  'fat_burning_supplement',
  'medication_advice',
] as const;

export const PATHWAY_TITLES: Record<PathwayId, string> = {
  dance_aerobic: 'Dance and aerobic activity',
  balanced_nutrition: 'Balanced nutrition',
  strength_training: 'Strength training',
  everyday_movement: 'Everyday movement',
  cultural_eating: 'Foods you grew up with',
  mindful_eating: 'Mindful eating',
  healthy_habits: 'Healthy habits',
  weight_maintenance: 'Keeping steady',
};
const STYLE_LABELS: Record<StylePref, string> = {
  dancehall: 'Dancehall',
  reggae: 'Reggae',
  afrobeats: 'Afrobeats',
  amapiano: 'Amapiano',
  hip_hop: 'Hip hop',
  latin: 'Latin',
  bollywood: 'Bollywood',
  soca: 'Soca',
};
const CUISINE_LABELS: Record<CuisinePref, string> = Object.fromEntries(
  Object.values(CUISINES).map((c) => [c.id, c.label]),
) as Record<CuisinePref, string>;
const list = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export type ReadinessState = ReadinessKind;
export type PathwaySource = 'chosen' | 'from_goal' | 'suggested';
export type EngineFocus = 'weight_loss' | 'maintenance' | 'weight_neutral';

export interface EngineInput {
  prefs: WellnessPrefs;
  /** From `evaluateReadiness`: clear, cautious (any "yes"), or unknown (not answered). Absent is treated as unknown. */
  readiness?: ReadinessState;
  /** Body facts for `nutritionTargets`. Optional; without them no numbers are produced. */
  body?: Pick<TargetInput, 'weightKg' | 'heightCm' | 'ageYears' | 'sex' | 'activity' | 'targetKg'>;
  habits?: { active: number; max?: number; names?: readonly string[] };
  recent?: { goalReached?: boolean };
  /** The person's stored weight goal (type, target, planned pace), if any. Lets the one calorie engine follow it for accounts that predate the Gain Weight goal. */
  weightGoal?: ActiveWeightGoal | null;
  /** An active weight goal exists. Keeps weight tracking on for people who never chose either way (see `weightTrackingOn`). */
  hasActiveWeightGoal?: boolean;
}

export interface PathwayAction {
  id: string;
  text: string;
  /** Why this is suggested, in plain language. */
  why: string;
}
export interface PathwayResult {
  id: PathwayId;
  title: string;
  source: PathwaySource;
  role: 'primary' | 'supporting';
  /** Why this pathway is in the person's plan. */
  reasons: string[];
  actions: PathwayAction[];
  /** Safety or honesty notes for this pathway (for example "guided sessions are not available yet"). */
  notes: string[];
  /** Only `suggested` pathways need confirming, and they change nothing until chosen. */
  needsConfirmation: boolean;
  /** Always true: the person can change or remove any pathway. */
  editable: true;
}
export interface Exclusion {
  id: 'weight_loss_targets';
  reason: string;
}
export interface HabitSuggestion {
  name: string;
  why: string;
  pathway: PathwayId;
}
export interface PlanBias {
  /** `low` when mobility needs, a cautious or unknown readiness, or pregnancy/postpartum call for low-impact movement. */
  impact: 'low' | 'any';
  seated: boolean;
  /** The highest session intensity to suggest, or null for no limit (experience not told). */
  intensityCeiling: Intensity | null;
  /** Preferred styles that exist in the catalogue, in the person's order. */
  styles: DanceStyle[];
  includeStrengthPrompt: boolean;
  /** Offer weigh-in prompts. False for weight-neutral goals, hidden numbers, and whenever weight-loss targets are withheld. */
  showWeightPrompts: boolean;
  workoutWhy: string | null;
  mealWhy: string | null;
}

export const LENS_IDS = [
  'consistency',
  'non_scale_wins',
  'dance_stamina',
  'strength',
  'walking',
  'nutrition_habits',
  'sleep_energy',
  'maintenance',
  'weight_trend',
  'calories',
  'measurements',
] as const;
export type LensId = (typeof LENS_IDS)[number];
export interface ProgressLens {
  show: LensId[];
  hidden: Array<{ id: LensId; reason: string }>;
}

export interface EngineOutput {
  rulesVersion: number;
  provisional: true;
  intent: GoalIntent;
  focus: EngineFocus;
  numbersHidden: boolean;
  pathways: PathwayResult[];
  exclusions: Exclusion[];
  /** The short, plain-language explanation shown at the top. */
  summary: string[];
  /** What the engine does not know and would use if the person chose to share it. Never guessed. */
  missing: Array<{ key: 'pathways' | 'experience' | 'readiness'; why: string }>;
  bias: PlanBias;
  lens: ProgressLens;
  habitSuggestions: HabitSuggestion[];
  /** Calorie and protein guidance from `nutritionTargets`. Null without body facts. Numbers are null whenever the person's numbers are hidden. */
  nutrition: NutritionTargets | null;
  seeProfessional: boolean;
}

/** Applied pathways come first within a goal. Order is fixed so output is deterministic. */
const ORDER: Record<GoalIntent, readonly PathwayId[]> = {
  lose: [
    'dance_aerobic',
    'balanced_nutrition',
    'healthy_habits',
    'everyday_movement',
    'strength_training',
    'cultural_eating',
    'mindful_eating',
    'weight_maintenance',
  ],
  maintain: [
    'weight_maintenance',
    'dance_aerobic',
    'balanced_nutrition',
    'healthy_habits',
    'everyday_movement',
    'strength_training',
    'cultural_eating',
    'mindful_eating',
  ],
  fitness: [
    'dance_aerobic',
    'everyday_movement',
    'healthy_habits',
    'strength_training',
    'balanced_nutrition',
    'cultural_eating',
    'mindful_eating',
    'weight_maintenance',
  ],
  strength: [
    'strength_training',
    'balanced_nutrition',
    'dance_aerobic',
    'healthy_habits',
    'everyday_movement',
    'cultural_eating',
    'mindful_eating',
    'weight_maintenance',
  ],
  gain: [
    'strength_training',
    'balanced_nutrition',
    'healthy_habits',
    'dance_aerobic',
    'everyday_movement',
    'cultural_eating',
    'mindful_eating',
    'weight_maintenance',
  ],
};
const FROM_GOAL: Record<GoalIntent, readonly PathwayId[]> = {
  lose: ['dance_aerobic', 'balanced_nutrition', 'healthy_habits', 'everyday_movement'],
  maintain: ['weight_maintenance', 'dance_aerobic', 'balanced_nutrition', 'healthy_habits'],
  fitness: ['dance_aerobic', 'everyday_movement', 'healthy_habits'],
  strength: ['strength_training', 'balanced_nutrition', 'dance_aerobic', 'healthy_habits'],
  gain: ['strength_training', 'balanced_nutrition', 'healthy_habits'],
};
const INTENSITY_BY_EXPERIENCE = { new: 'low', some: 'moderate', regular: 'high' } as const;
const MIN_FOODS_FOR_COVERAGE = 5;
/** A gentle plan offers a few habit ideas at a time, never a long list. */
const MAX_HABIT_IDEAS = 3;

/** Foods in the reference data that count as this cuisine (itself, its parent or its children: see cuisines.ts). */
const foodsFor = (c: CuisinePref): number => {
  const tags = regionTagsFor([c]);
  return CURATED_FOODS.filter((f) => f.regionTags.some((t) => tags.includes(t))).length;
};

const HABIT_TEMPLATES: Record<PathwayId, ReadonlyArray<{ name: string; why: string }>> = {
  healthy_habits: [
    {
      name: 'Drink a glass of water',
      why: 'Small habits add up, and water is an easy one to start with.',
    },
    {
      name: 'Wind down before bed',
      why: 'A regular wind-down can make it easier to settle to sleep.',
    },
  ],
  everyday_movement: [
    {
      name: 'Take a short walk outside',
      why: 'Short walks count as movement and are easy to fit into a day.',
    },
  ],
  balanced_nutrition: [
    {
      name: 'Add a vegetable to one meal',
      why: 'A gentle way to add fibre and variety without changing everything.',
    },
  ],
  mindful_eating: [
    {
      name: 'Pause and check in before a meal',
      why: 'Noticing hunger and fullness can make eating feel calmer. There is no right answer.',
    },
  ],
  strength_training: [
    {
      name: 'Do a short strength session',
      why: 'Regular, easy sessions build strength better than rare hard ones.',
    },
  ],
  dance_aerobic: [
    {
      name: 'Dance to one song you love',
      why: 'One song is enough to feel the difference, and it keeps movement fun.',
    },
  ],
  weight_maintenance: [
    {
      name: 'Weekly check-in with yourself',
      why: 'A calm weekly look works better than daily checking, because weight moves up and down day to day.',
    },
  ],
  cultural_eating: [],
};

/** Resolves the person's pathways, explanations, plan bias and progress lens. Pure and deterministic: the same input always gives the same output. */
export function resolvePathways(input: EngineInput): EngineOutput {
  const prefs = input.prefs;
  const readiness: ReadinessState = input.readiness ?? 'unknown';
  const hidden = numbersHidden(prefs);
  const intent = prefs.goalIntent;
  const caution = prefs.eatingConcern || prefs.pregnantOrPostpartum || readiness !== 'clear';
  /** Weight is only ever shown or asked for when the person tracks it (opt-in) and their numbers are not hidden. */
  const weightOn = weightTrackingOn(prefs, input.hasActiveWeightGoal === true);

  // ---- nutrition numbers: only ever from calorieNeeds (one engine for the whole app), and never when numbers are hidden ----
  const nutrition: NutritionTargets | null = input.body
    ? calorieNeeds({ prefs, readiness, body: input.body, activeGoal: input.weightGoal ?? null })
    : null;

  // ---- focus: weight-loss framing is withheld whenever there is any reason for caution ----
  const professionalNutrition = nutrition?.mode === 'professional';
  const exclusions: Exclusion[] = [];
  let focus: EngineFocus;
  if (intent === 'lose') {
    if (caution || professionalNutrition) {
      focus = 'weight_neutral';
      exclusions.push({
        id: 'weight_loss_targets',
        reason: prefs.eatingConcern
          ? 'You told us food can feel difficult, so we are not offering weight-loss targets. Movement, sleep, water and habits are all still here, and a doctor or a dietitian who works with eating concerns can support you.'
          : prefs.pregnantOrPostpartum
            ? 'Nutrition needs change during pregnancy and after birth, so we are not offering weight-loss targets. A midwife, doctor or dietitian can advise you.'
            : readiness === 'cautious'
              ? 'Your safety answers suggest checking with a health professional before changing how you eat or move, so we are not offering weight-loss targets for now.'
              : readiness === 'unknown'
                ? 'We have not seen your quick safety answers yet, so we are not offering weight-loss targets until you complete them.'
                : 'We are not offering weight-loss targets for your details. A health professional can give personal guidance.',
      });
    } else focus = 'weight_loss';
  } else if (intent === 'maintain') focus = 'maintenance';
  else focus = 'weight_neutral';

  // ---- which pathways ----
  const chosen = prefs.pathways;
  const applied = new Map<PathwayId, PathwaySource>();
  /** Which goal brought a pathway in, so its explanation can name it. */
  const goalFor = new Map<PathwayId, GoalIntent>();
  for (const id of chosen) applied.set(id, 'chosen');
  if (chosen.length === 0) {
    for (const id of FROM_GOAL[intent]) {
      applied.set(id, 'from_goal');
      goalFor.set(id, intent);
    }
    for (const g of prefs.secondaryGoals)
      for (const id of FROM_GOAL[g])
        if (!applied.has(id)) {
          applied.set(id, 'from_goal');
          goalFor.set(id, g);
        }
  }

  const suggested = new Map<PathwayId, string>();
  const suggest = (id: PathwayId, why: string) => {
    if (!applied.has(id) && !suggested.has(id)) suggested.set(id, why);
  };
  if (prefs.cuisines.length > 0)
    suggest(
      'cultural_eating',
      `You told us you eat ${list(prefs.cuisines.map((c) => CUISINE_LABELS[c]))} foods.`,
    );
  if (prefs.activities.includes('strength'))
    suggest('strength_training', 'You told us you like strength work.');
  if (prefs.activities.includes('walking'))
    suggest('everyday_movement', 'You told us you like walking.');
  if (prefs.tracking === 'none' && !prefs.eatingConcern)
    suggest(
      'mindful_eating',
      'You chose not to track numbers, and mindful eating is a calm, number-free way to notice how meals feel.',
    );
  if (input.recent?.goalReached)
    suggest('weight_maintenance', 'You reached a goal you set, so keeping steady may fit next.');

  const rank = (id: PathwayId) => ORDER[intent].indexOf(id);
  const ids = [...applied.keys(), ...suggested.keys()].sort((a, b) => rank(a) - rank(b));
  const habitRoom = Math.max(0, (input.habits?.max ?? 5) - (input.habits?.active ?? 0));

  const pathways: PathwayResult[] = ids.map((id, index) => {
    const source: PathwaySource = applied.get(id) ?? 'suggested';
    const built = buildPathway(id, source, suggested.get(id), {
      prefs,
      goal: goalFor.get(id) ?? intent,
      second: goalFor.has(id) && goalFor.get(id) !== intent,
      intent,
      focus,
      hidden,
      readiness,
      nutrition,
      habitRoom,
    });
    return {
      id,
      title: PATHWAY_TITLES[id],
      source,
      role: index === 0 && source !== 'suggested' ? 'primary' : 'supporting',
      reasons: built.reasons,
      actions: built.actions,
      notes: built.notes,
      needsConfirmation: source === 'suggested',
      editable: true,
    };
  });
  const active = pathways.filter((p) => p.source !== 'suggested').map((p) => p.id);
  const has = (id: PathwayId) => active.includes(id);

  // ---- plan bias (only applied pathways and stated preferences matter; suggestions never do) ----
  const mobilityNeed = prefs.mobility.length > 0;
  const lowImpact = mobilityNeed || readiness !== 'clear' || prefs.pregnantOrPostpartum;
  let ceiling: Intensity | null = prefs.experience
    ? INTENSITY_BY_EXPERIENCE[prefs.experience]
    : null;
  if (readiness !== 'clear') ceiling = 'low';
  else if (prefs.pregnantOrPostpartum && (ceiling === null || ceiling === 'high'))
    ceiling = 'moderate';
  const styles = prefs.danceStyles.filter((s): s is StylePref & DanceStyle =>
    (DANCE_STYLES as readonly string[]).includes(s),
  );
  const missingStyles = prefs.danceStyles.filter((s) => !styles.includes(s as never));
  const bias: PlanBias = {
    impact: lowImpact ? 'low' : 'any',
    seated: prefs.mobility.includes('seated'),
    intensityCeiling: ceiling,
    styles: styles as DanceStyle[],
    includeStrengthPrompt: has('strength_training'),
    showWeightPrompts: !hidden && weightOn && exclusions.length === 0,
    workoutWhy: workoutWhy(prefs, styles, missingStyles, lowImpact, readiness, ceiling),
    mealWhy:
      prefs.cuisines.length > 0
        ? `You chose ${list(prefs.cuisines.map((c) => CUISINE_LABELS[c]))} foods, and swap ideas favour them.`
        : null,
  };

  // ---- progress lens ----
  const lens = progressLens({ prefs, active, hidden, weightOn });

  // ---- habit templates, within the five-habit limit and without repeating the person's own ----
  const have = new Set((input.habits?.names ?? []).map((n) => n.trim().toLowerCase()));
  const evening = prefs.schedule === 'evening';
  const habitSuggestions: HabitSuggestion[] = [];
  for (const id of active) {
    for (const t of HABIT_TEMPLATES[id]) {
      if (have.has(t.name.toLowerCase())) continue;
      if (habitSuggestions.some((h) => h.name === t.name)) continue;
      habitSuggestions.push({ ...t, pathway: id });
    }
  }
  habitSuggestions.sort(
    (a, b) =>
      Number(evening && b.name.startsWith('Wind down')) -
        Number(evening && a.name.startsWith('Wind down')) || 0,
  );
  habitSuggestions.splice(Math.min(habitRoom, MAX_HABIT_IDEAS));

  // ---- what we do not know ----
  const missing: EngineOutput['missing'] = [];
  if (chosen.length === 0)
    missing.push({
      key: 'pathways',
      why: 'You have not chosen your own pathways yet, so these come from your goal. Choose any you like.',
    });
  if (prefs.experience === null)
    missing.push({
      key: 'experience',
      why: 'We do not know your movement experience, so we do not limit session intensity. Tell us and we will match it.',
    });
  if (readiness === 'unknown')
    missing.push({
      key: 'readiness',
      why: 'We have not seen your quick safety answers, so we start with low-impact options until you complete them.',
    });

  const seeProfessional =
    prefs.eatingConcern ||
    prefs.pregnantOrPostpartum ||
    readiness === 'cautious' ||
    (nutrition?.seeProfessional ?? false);

  return {
    rulesVersion: PATHWAYS_RULES_VERSION,
    provisional: true,
    intent,
    focus,
    numbersHidden: hidden,
    pathways,
    exclusions,
    summary: summarise({ prefs, pathways, focus, readiness, exclusions }),
    missing,
    bias,
    lens,
    habitSuggestions,
    nutrition,
    seeProfessional,
  };
}

function workoutWhy(
  prefs: WellnessPrefs,
  styles: readonly string[],
  missingStyles: readonly string[],
  lowImpact: boolean,
  readiness: ReadinessState,
  ceiling: Intensity | null,
): string | null {
  const parts: string[] = [];
  if (styles.length > 0)
    parts.push(
      `You chose ${list(styles.map((s) => STYLE_LABELS[s as StylePref]))}, so those come first.`,
    );
  if (missingStyles.length > 0)
    parts.push(
      `${list(missingStyles.map((s) => STYLE_LABELS[s as StylePref]))} sessions are not in the catalogue yet, so we show other styles for now.`,
    );
  if (prefs.mobility.includes('seated'))
    parts.push(
      WORKOUTS.some(isSeatedSuitable)
        ? 'You asked for seated options, so sessions you can do seated come first.'
        : 'Seated sessions are not in the catalogue yet, so low-impact sessions are shown for now.',
    );
  else if (prefs.mobility.length > 0)
    parts.push('You asked for gentler movement, so low-impact options come first.');
  else if (readiness !== 'clear' && lowImpact)
    parts.push('Low-impact options come first until your safety questions say otherwise.');
  if (prefs.experience === 'new' && ceiling === 'low')
    parts.push('You are new to this, so sessions start easy.');
  return parts.length > 0 ? parts.join(' ') : null;
}

interface BuildCtx {
  prefs: WellnessPrefs;
  /** The goal that brought this pathway in (the primary goal unless it came from a second goal). */
  goal: GoalIntent;
  second: boolean;
  intent: GoalIntent;
  focus: EngineFocus;
  hidden: boolean;
  readiness: ReadinessState;
  nutrition: NutritionTargets | null;
  habitRoom: number;
}

function buildPathway(
  id: PathwayId,
  source: PathwaySource,
  suggestedWhy: string | undefined,
  c: BuildCtx,
): { reasons: string[]; actions: PathwayAction[]; notes: string[] } {
  const { prefs } = c;
  const reasons: string[] = [];
  const actions: PathwayAction[] = [];
  const notes: string[] = [];
  const why =
    source === 'chosen'
      ? 'You chose this pathway.'
      : source === 'from_goal'
        ? c.second
          ? `You chose this as a second goal: to ${GOAL_PHRASE[c.goal]}.`
          : `It fits your goal to ${GOAL_PHRASE[c.goal]}.`
        : (suggestedWhy ?? 'Suggested from what you told us.');
  reasons.push(why);
  if (source === 'suggested')
    reasons.push('This is only a suggestion. Nothing changes until you choose it.');
  const caution = prefs.eatingConcern || prefs.pregnantOrPostpartum || c.readiness !== 'clear';

  switch (id) {
    case 'dance_aerobic': {
      const present = prefs.danceStyles.filter((s) =>
        (DANCE_STYLES as readonly string[]).includes(s),
      );
      const absent = prefs.danceStyles.filter((s) => !present.includes(s));
      actions.push({
        id: 'dance.session',
        text:
          present.length > 0
            ? `Try ${list(present.map((s) => STYLE_LABELS[s]))} sessions`
            : 'Try a short dance session you enjoy',
        why:
          present.length > 0
            ? 'These match the styles you chose.'
            : 'Dance counts as aerobic activity and is easier to keep up when it is fun.',
      });
      if (absent.length > 0)
        notes.push(
          `${list(absent.map((s) => STYLE_LABELS[s]))} sessions are not in the catalogue yet, so other styles are shown for now.`,
        );
      if (prefs.mobility.includes('seated') && !WORKOUTS.some(isSeatedSuitable))
        notes.push(
          'Sessions you can do seated are not in the catalogue yet, so low-impact sessions are shown for now.',
        );
      if (prefs.mobility.length > 0 || caution)
        actions.push({
          id: 'dance.low_impact',
          text:
            prefs.mobility.includes('seated') && WORKOUTS.some(isSeatedSuitable)
              ? 'Choose sessions you can do seated'
              : 'Start with the low-impact versions',
          why:
            prefs.mobility.length > 0
              ? 'You asked for gentler movement.'
              : 'We start gently until your safety answers say otherwise.',
        });
      if (prefs.exerciseMinutesPerWeek !== null)
        actions.push({
          id: 'dance.weekly_goal',
          text: `Work toward your ${prefs.exerciseMinutesPerWeek} minutes a week`,
          why: 'This is the goal you set. You can change it any time.',
        });
      break;
    }
    case 'balanced_nutrition': {
      actions.push({
        id: 'nutrition.plate',
        text: 'Build balanced plates: protein, vegetables, and starchy foods or whole grains',
        why: 'A balanced plate is a gentle default that needs no counting.',
      });
      actions.push({
        id: 'nutrition.fibre',
        text: 'Add fibre-rich foods such as beans, vegetables and fruit',
        why: 'Fibre helps you feel satisfied, and it adds variety.',
      });
      if (c.intent === 'strength')
        actions.push({
          id: 'nutrition.fuel',
          text: 'Eat enough to fuel training, with protein spread through the day',
          why: 'Building strength needs enough food, so there is no deficit and no weight target here.',
        });
      const p = c.nutrition?.proteinG;
      if (p && !c.hidden)
        actions.push({
          id: 'nutrition.protein_range',
          text: `A general protein range is about ${p.low} to ${p.high} g a day`,
          why: 'It is an estimate from your details, not a target you must hit. A dietitian can personalise it.',
        });
      if (c.focus === 'weight_neutral' && c.intent === 'lose')
        notes.push('No weight-loss targets are offered right now. See the note at the top.');
      if (c.hidden) notes.push('Your calorie, nutrient and weight numbers are hidden.');
      break;
    }
    case 'strength_training': {
      actions.push({
        id: 'strength.log',
        text:
          prefs.equipment.includes('none') || prefs.equipment.length === 0
            ? 'Log your strength sessions (bodyweight is fine)'
            : `Log your strength sessions (${list(prefs.equipment.filter((e) => e !== 'none'))})`,
        why: homeWorkoutsAvailable()
          ? 'You can also log self-directed sessions by hand.'
          : 'Guided strength workouts are not available yet, so you log self-directed sessions.',
      });
      if (homeWorkoutsAvailable())
        actions.push({
          id: 'strength.home',
          text:
            prefs.homeItems.length > 0
              ? `Try a short strength session with what you have (${list(prefs.homeItems.map((i) => HOME_ITEMS[i].label.toLowerCase()))})`
              : 'Try a short strength session with no equipment, or tell us what you have at home',
          why: 'It is built only from exercises that fit the items you chose, your level and any seated or balance needs. You can change your items at any time and your history stays.',
        });
      actions.push({
        id: 'strength.progress',
        text: 'Make it a little harder only when the current level feels comfortable and your body feels fine',
        why: 'Gradual change is a common general principle. This guidance has not been professionally reviewed yet.',
      });
      actions.push({
        id: 'strength.rest',
        text: 'Keep easy or rest days between harder days',
        why: 'Recovery is part of getting stronger.',
      });
      if (!homeWorkoutsAvailable()) notes.push('Guided strength routines are not available yet.');
      if (caution)
        notes.push('Check with a health professional before starting new strength training.');
      break;
    }
    case 'everyday_movement': {
      actions.push({
        id: 'move.walk',
        text:
          prefs.dailyMovementMinutes !== null
            ? `A short walk counts toward your ${prefs.dailyMovementMinutes}-minute daily movement goal`
            : 'A short walk counts',
        why: 'Walking is an easy way to move on days dance is not the plan. You log it by hand; there is no step counting yet.',
      });
      break;
    }
    case 'cultural_eating': {
      const names = prefs.cuisines.map((x) => CUISINE_LABELS[x]);
      actions.push({
        id: 'culture.plate',
        text:
          names.length > 0
            ? `Build plates around ${list(names)} foods you already enjoy`
            : 'Build plates around foods you already enjoy',
        why: 'No food is labelled good or bad. The aim is balance, portions you are happy with, and foods that fit your life.',
      });
      for (const cu of prefs.cuisines) {
        const n = foodsFor(cu);
        if (n < MIN_FOODS_FOR_COVERAGE)
          notes.push(
            `Our food list has only ${n} ${CUISINE_LABELS[cu]} example${n === 1 ? '' : 's'} so far, so swap ideas for it are limited.`,
          );
      }
      break;
    }
    case 'mindful_eating': {
      if (prefs.eatingConcern) {
        actions.push({
          id: 'mindful.reflect',
          text: 'Notice how a meal felt, with no scoring',
          why: 'A gentle reflection, without numbers or targets.',
        });
        notes.push(
          'Because you told us food can feel difficult, we keep this to gentle reflection. A doctor or a dietitian who works with eating concerns can support you.',
        );
      } else
        actions.push({
          id: 'mindful.checkin',
          text: 'Check in with hunger and fullness before or after a meal',
          why: 'Hungry, comfortable or full: there is no right answer, and it can make eating calmer.',
        });
      break;
    }
    case 'healthy_habits': {
      actions.push({
        id: 'habits.start_small',
        text:
          c.habitRoom > 0
            ? 'Pick one or two small habits to start with'
            : 'You already have five habits. Swap one if you want to try something new',
        why: 'Small habits take almost no time and add up. You can have up to five.',
      });
      break;
    }
    case 'weight_maintenance': {
      actions.push({
        id: 'maint.steady',
        text: 'Keep movement and meals regular, and adjust in small steps',
        why: 'Small adjustments last longer than big swings.',
      });
      actions.push({
        id: 'maint.fluctuation',
        text: c.hidden
          ? 'Judge progress by energy, routine and how you feel'
          : 'Weight moves up and down day to day, so look at the trend, weekly at most',
        why: 'Normal fluctuation is not a setback.',
      });
      break;
    }
  }
  return { reasons, actions, notes };
}

const GOAL_TITLE: Record<GoalIntent, string> = {
  lose: 'lose weight gently',
  maintain: 'keep your weight steady',
  fitness: 'improve fitness',
  strength: 'build strength',
  gain: 'gain weight gently',
};
const GOAL_PHRASE: Record<GoalIntent, string> = {
  lose: 'lose weight at a gentle, steady pace',
  maintain: 'keep your weight steady',
  fitness: 'improve your fitness',
  strength: 'build strength',
  gain: 'gain weight at a gentle, steady pace',
};

function summarise(a: {
  prefs: WellnessPrefs;
  pathways: PathwayResult[];
  focus: EngineFocus;
  readiness: ReadinessState;
  exclusions: Exclusion[];
}): string[] {
  const out: string[] = [];
  const applied = a.pathways.filter((p) => p.source !== 'suggested').map((p) => p.title);
  if (applied.length > 0)
    out.push(`Your plan is built around: ${list(applied)}. You can change any of it.`);
  const sug = a.pathways.filter((p) => p.source === 'suggested').map((p) => p.title);
  if (sug.length > 0)
    out.push(`You might also like: ${list(sug)}. Nothing changes until you choose it.`);
  if (a.prefs.secondaryGoals.length > 0)
    out.push(
      `You are also working on: ${list(a.prefs.secondaryGoals.map((g) => GOAL_TITLE[g]))}. Their activities are part of your plan.`,
    );
  if (a.prefs.secondaryGoals.includes('lose') && a.prefs.goalIntent !== 'lose')
    out.push(
      'Weight-loss targets follow your main goal only. Choose Lose weight as your main goal if you want a gentle weight-loss pace.',
    );
  if (a.focus === 'weight_loss')
    out.push('A gentle, steady pace with safety limits. Nothing here promises a result.');
  else if (a.focus === 'maintenance')
    out.push('The focus is keeping steady while you enjoy moving and eating well.');
  else if (a.prefs.goalIntent === 'gain')
    out.push(
      'The focus is nourishing meals and strength work at a gentle pace. A weight target is optional, and any calorie estimate is provisional.',
    );
  else if (a.exclusions.length === 0)
    out.push(
      'Your goal does not use a weight target, so progress is about how you feel and what you do.',
    );
  for (const e of a.exclusions) out.push(e.reason);
  if (a.readiness === 'unknown' && a.exclusions.length === 0)
    out.push('We start with low-impact options until you finish the quick safety questions.');
  return out;
}

function progressLens(a: {
  prefs: WellnessPrefs;
  active: readonly PathwayId[];
  hidden: boolean;
  weightOn: boolean;
}): ProgressLens {
  const { prefs, active, hidden, weightOn } = a;
  const has = (id: PathwayId) => active.includes(id);
  const show: LensId[] = [];
  const off: Array<{ id: LensId; reason: string }> = [];
  const decide = (id: LensId, on: boolean, reason: string) =>
    on ? show.push(id) : off.push({ id, reason });

  decide('consistency', true, '');
  decide('non_scale_wins', true, '');
  decide('dance_stamina', has('dance_aerobic'), 'Dance is not one of your pathways.');
  decide(
    'strength',
    has('strength_training') || prefs.activities.includes('strength'),
    'Strength is not one of your pathways.',
  );
  decide(
    'walking',
    has('everyday_movement') || prefs.activities.includes('walking'),
    'Walking is not one of your pathways.',
  );
  decide(
    'nutrition_habits',
    (has('balanced_nutrition') || has('cultural_eating') || has('mindful_eating')) &&
      prefs.tracking !== 'none' &&
      !prefs.eatingConcern,
    'Not shown because you chose no tracking, shared a concern about food, or have no nutrition pathway.',
  );
  decide('sleep_energy', has('healthy_habits'), 'Healthy habits is not one of your pathways.');
  decide('maintenance', has('weight_maintenance'), 'Keeping steady is not one of your pathways.');
  decide(
    'weight_trend',
    !hidden && weightOn,
    hidden
      ? 'Your weight numbers are hidden.'
      : 'Weight tracking is off. You can turn it on any time in My approach.',
  );
  decide('calories', !hidden, 'Your calorie numbers are hidden.');
  decide(
    'measurements',
    !hidden && prefs.tracking === 'detailed',
    hidden
      ? 'Your body numbers are hidden.'
      : 'Measurements appear only with detailed tracking, which is optional.',
  );
  const rank = (id: LensId) => LENS_IDS.indexOf(id);
  show.sort((x, y) => rank(x) - rank(y));
  off.sort((x, y) => rank(x.id) - rank(y.id));
  return { show, hidden: off };
}
