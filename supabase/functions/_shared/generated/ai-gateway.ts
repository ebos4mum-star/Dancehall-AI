// GENERATED from packages/ai/src/edge.ts by scripts/build-ai-function.mjs. Do not edit: change the source and run `node scripts/build-ai-function.mjs`.
// packages/shared/src/config.ts
var MIN_USER_AGE_YEARS = 18;
var DEFAULT_AI_MONTHLY_BUDGET_USD = 50;
var FEATURE_FLAGS = [
  "ai_gateway",
  "ai_food_photo",
  "ai_concierge",
  "ai_voice",
  "barcode_scanner",
  "social_challenges",
  "dance_to_share",
  "households",
  "sponsored_challenges",
  "subscriptions"
];
var DEFAULT_FEATURE_FLAGS = Object.freeze(
  Object.fromEntries(FEATURE_FLAGS.map((f) => [f, false]))
);

// packages/shared/src/entitlements.ts
var PROPOSED_AI_ALLOWANCES = {
  free: {
    food_photo: 5,
    fridge_to_meal: 2,
    meal_plan: 1,
    food_swap: 10,
    menu_assist: 2,
    concierge_chat: 20,
    weekly_review: 1,
    voice: 0
  },
  pro: {
    food_photo: 120,
    fridge_to_meal: 30,
    meal_plan: 8,
    food_swap: 100,
    menu_assist: 30,
    concierge_chat: 300,
    weekly_review: 5,
    voice: 60
  },
  household_pro: {
    food_photo: 120,
    fridge_to_meal: 30,
    meal_plan: 8,
    food_swap: 100,
    menu_assist: 30,
    concierge_chat: 300,
    weekly_review: 5,
    voice: 60
  }
};
var FREE_ENTITLEMENT = { tier: "free", expiresAt: null, source: "none" };
function activeTier(e, now = /* @__PURE__ */ new Date()) {
  if (e.tier === "free") return "free";
  if (e.expiresAt === null) return "free";
  return new Date(e.expiresAt).getTime() > now.getTime() ? e.tier : "free";
}
function monthlyAllowance(tier, feature) {
  return PROPOSED_AI_ALLOWANCES[tier][feature];
}
function checkAiAccess(args) {
  if (!args.flags.ai_gateway) return { allowed: false, reason: "feature_flag_off", remaining: 0 };
  const limit = monthlyAllowance(activeTier(args.entitlement, args.now), args.feature);
  if (limit === 0) return { allowed: false, reason: "not_in_tier", remaining: 0 };
  const remaining = Math.max(0, limit - args.usedThisMonth);
  return remaining === 0 ? { allowed: false, reason: "quota_used", remaining: 0 } : { allowed: true, remaining };
}

// packages/shared/src/errors.ts
var HTTP_STATUS = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  quota_exceeded: 429,
  budget_exhausted: 503,
  feature_disabled: 503,
  ai_paused: 409,
  safety_blocked: 422,
  country_unavailable: 451,
  upstream_failure: 502,
  internal: 500
};
var AppError = class extends Error {
  code;
  /** Safe to show to the user; never contains secrets or internal detail. */
  userMessage;
  constructor(code, userMessage, options) {
    super(`${code}: ${userMessage}`, options);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
  }
  get httpStatus() {
    return HTTP_STATUS[this.code];
  }
};
function toAppError(e) {
  if (e instanceof AppError) return e;
  return new AppError("internal", "Something went wrong. Please try again.", { cause: e });
}

// packages/shared/src/roles.ts
var PERMISSIONS = [
  "content.edit",
  "content.publish",
  "licensing.manage",
  "moderation.review",
  "nutrition.review",
  "fitness.review",
  "support.lookup",
  "flags.manage",
  "ai_costs.view",
  "audit.view",
  "staff.manage",
  "analytics.view"
];
var ROLE_PERMISSIONS = {
  admin: [...PERMISSIONS],
  content_editor: ["content.edit"],
  licensing_manager: ["licensing.manage", "content.publish"],
  moderator: ["moderation.review"],
  nutrition_reviewer: ["nutrition.review", "content.edit"],
  fitness_reviewer: ["fitness.review", "content.edit"],
  support: ["support.lookup"],
  analyst: ["analytics.view", "ai_costs.view"]
};

// packages/shared/src/safety.ts
var PROVISIONAL_LIMITS = {
  /** Lowest target BMI the app will help someone work toward. */
  minTargetBmi: 18.5,
  /** Hard cap on planned weekly loss, as a fraction of current body weight. */
  maxWeeklyLossFraction: 0.01,
  /** Gentler default shown as the suggested pace. */
  suggestedWeeklyLossFraction: 5e-3,
  /** Cap on planned weekly gain, as a fraction of body weight. */
  maxWeeklyGainFraction: 5e-3,
  /** Planned daily deficit never exceeds this fraction of estimated maintenance energy. */
  maxDeficitFraction: 0.2,
  /**
   * Gain Weight: the planned daily surplus never exceeds this fraction of estimated maintenance energy. A conservative PROVISIONAL ceiling chosen by the product owner:
   * it is not clinically validated and has not been reviewed by a registered dietitian or clinician.
   */
  maxSurplusFraction: 0.1,
  /** Gentle default pace when a person chooses Gain Weight without a target: a quarter of a percent of body weight per week (half the hard cap). */
  suggestedWeeklyGainFraction: 25e-4,
  /**
   * Gain Weight: at or above this BMI (for the person or for their target) the estimate still appears, with the same surplus ceiling, but it carries a plain note and a
   * suggestion to ask a professional. BMI is a rough screening number that cannot see muscle, frame size or body composition, so it NEVER decides on its own whether
   * someone gets calorie guidance. Not a clinical threshold.
   */
  bmiNoteForGain: 25
};
var bmi = (weightKg, heightCm) => weightKg / (heightCm / 100) ** 2;
function evaluateWeightGoal(input) {
  const { ageYears, heightCm, currentKg, targetKg } = input;
  if (![ageYears, heightCm, currentKg, targetKg].every((n) => Number.isFinite(n) && n > 0)) {
    return {
      status: "block",
      reasons: ["We need valid age, height and weight to suggest a goal."]
    };
  }
  if (ageYears < MIN_USER_AGE_YEARS) {
    return { status: "block", reasons: ["Weight goals are available to adults aged 18 and over."] };
  }
  const L = PROVISIONAL_LIMITS;
  const losing = targetKg < currentKg;
  if (losing && bmi(currentKg, heightCm) < L.minTargetBmi) {
    return {
      status: "block",
      reasons: [
        "Based on what you entered, a weight-loss goal is not a good fit right now. Talking with a health professional can help."
      ]
    };
  }
  if (losing && bmi(targetKg, heightCm) < L.minTargetBmi) {
    return {
      status: "block",
      reasons: ["That target is below a healthy range for your height. Try a higher target."]
    };
  }
  const planned = input.plannedWeeklyChangeKg ?? (losing ? -currentKg * L.suggestedWeeklyLossFraction : targetKg > currentKg ? currentKg * L.maxWeeklyGainFraction : 0);
  const reasons2 = [];
  let weekly = planned;
  if (planned < 0 && -planned > currentKg * L.maxWeeklyLossFraction) {
    weekly = -currentKg * L.maxWeeklyLossFraction;
    reasons2.push("We lowered the pace to keep it steady and sustainable.");
  }
  if (planned > 0 && planned > currentKg * L.maxWeeklyGainFraction) {
    weekly = currentKg * L.maxWeeklyGainFraction;
    reasons2.push("We lowered the pace to keep it steady and sustainable.");
  }
  if (losing && weekly > 0 || !losing && targetKg > currentKg && weekly < 0) {
    weekly = 0;
    reasons2.push("The pace did not match your target, so we reset it. You can adjust it any time.");
  }
  reasons2.push("Progress is not guaranteed and can vary from week to week.");
  const changed = weekly !== planned;
  return { status: changed ? "adjust" : "allow", reasons: reasons2, adjusted: { weeklyChangeKg: weekly } };
}
var ACTIVITY_FACTOR = {
  low: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725
};
function estimateBmrKcal(a) {
  const base2 = 10 * a.weightKg + 6.25 * a.heightCm - 5 * a.ageYears;
  const offset = a.sex === "male" ? 5 : a.sex === "female" ? -161 : -78;
  return base2 + offset;
}
function dailyCalorieGuidance(args) {
  const bmr = estimateBmrKcal(args);
  const maintenance = bmr * ACTIVITY_FACTOR[args.activity];
  const rawDelta = args.weeklyChangeKg * 7700 / 7;
  const maxDeficit = maintenance * PROVISIONAL_LIMITS.maxDeficitFraction;
  let delta = rawDelta;
  let deficitCapApplied = false;
  if (-delta > maxDeficit) {
    delta = -maxDeficit;
    deficitCapApplied = true;
  }
  let target = maintenance + delta;
  let floorApplied = false;
  if (target < bmr) {
    target = bmr;
    floorApplied = true;
  }
  return {
    maintenanceKcal: Math.round(maintenance),
    targetKcal: Math.round(target),
    floorKcal: Math.round(bmr),
    floorApplied,
    deficitCapApplied,
    reviewRequired: true
  };
}
var RISK_PATTERNS = [
  {
    category: "self_harm",
    re: /\b(kill myself|end my life|want to die|hurt myself|suicid|self[- ]?harm|cut myself|take my own life|end it all|no reason to (live|go on)|wish i (was|were) dead|better off (dead|without me)|(don'?t|do not) want to (be here|live|wake up)|(don'?t|do not) want to go on(\s*$|\s*[.,;!?]|\s+(anymore|any more)))/i
  },
  {
    category: "disordered_eating",
    re: /\b(starv(e|ing) myself|thinspo|pro[- ]?(ana|mia)\b|purg(e|ing)|make myself (throw up|vomit)|haven'?t eaten (in|for) (days|\d+ days)|eat nothing|laxatives to lose)/i
  }
];
function screenMessageForRiskSignals(text) {
  for (const p of RISK_PATTERNS) if (p.re.test(text)) return p.category;
  return null;
}

// packages/shared/src/schemas.ts
import { z } from 'npm:zod@4.6.7';
var unitSystemSchema = z.enum(["metric", "imperial"]);
var sexSchema = z.enum(["female", "male", "unspecified"]);
var countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 country code");
var timeZoneSchema = z.string().min(1).max(64);
function ageOn(birthDate, now) {
  const b2 = /* @__PURE__ */ new Date(`${birthDate}T00:00:00Z`);
  let age = now.getUTCFullYear() - b2.getUTCFullYear();
  const m = now.getUTCMonth() - b2.getUTCMonth();
  if (m < 0 || m === 0 && now.getUTCDate() < b2.getUTCDate()) age -= 1;
  return age;
}
var ageYearsOn = ageOn;
var birthDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date").refine(
  (s) => ageOn(s, /* @__PURE__ */ new Date()) >= MIN_USER_AGE_YEARS,
  `Must be ${MIN_USER_AGE_YEARS} or older`
).refine((s) => ageOn(s, /* @__PURE__ */ new Date()) <= 120, "Invalid date");
var profileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  country: countryCodeSchema,
  timeZone: timeZoneSchema,
  unitSystem: unitSystemSchema,
  locale: z.string().min(2).max(10).default("en")
});
var weightEntrySchema = z.object({
  /** Canonical kilograms. The UI converts from the user's unit before this point. */
  weightKg: z.number().min(25).max(400),
  measuredAt: z.iso.datetime()
});
var goalPeriodSchema = z.enum(["weekly", "monthly", "yearly"]);
var goalTypeSchema = z.enum(["lose", "maintain", "gain"]);
var goalInputSchema = z.object({
  type: goalTypeSchema,
  period: goalPeriodSchema,
  targetKg: z.number().min(25).max(400).optional()
});
var consentPurposeSchema = z.enum([
  "health_data_processing",
  "ai_processing_of_food_photos",
  "ai_coach_personalization",
  "health_platform_sync",
  "social_sharing"
]);

// packages/shared/src/country-list.ts
var COUNTRY_OPTIONS = [
  ["AR", "Argentina"],
  ["AU", "Australia"],
  ["AT", "Austria"],
  ["BS", "Bahamas"],
  ["BB", "Barbados"],
  ["BE", "Belgium"],
  ["BR", "Brazil"],
  ["CM", "Cameroon"],
  ["CA", "Canada"],
  ["CL", "Chile"],
  ["CO", "Colombia"],
  ["CI", "C\xF4te d'Ivoire"],
  ["DK", "Denmark"],
  ["DO", "Dominican Republic"],
  ["EG", "Egypt"],
  ["ET", "Ethiopia"],
  ["FI", "Finland"],
  ["FR", "France"],
  ["DE", "Germany"],
  ["GH", "Ghana"],
  ["GR", "Greece"],
  ["GD", "Grenada"],
  ["GY", "Guyana"],
  ["HT", "Haiti"],
  ["IN", "India"],
  ["IE", "Ireland"],
  ["IT", "Italy"],
  ["JM", "Jamaica"],
  ["KE", "Kenya"],
  ["MX", "Mexico"],
  ["MA", "Morocco"],
  ["NL", "Netherlands"],
  ["NZ", "New Zealand"],
  ["NG", "Nigeria"],
  ["NO", "Norway"],
  ["PK", "Pakistan"],
  ["PE", "Peru"],
  ["PH", "Philippines"],
  ["PL", "Poland"],
  ["PT", "Portugal"],
  ["RW", "Rwanda"],
  ["SN", "Senegal"],
  ["SG", "Singapore"],
  ["ZA", "South Africa"],
  ["ES", "Spain"],
  ["LK", "Sri Lanka"],
  ["SE", "Sweden"],
  ["CH", "Switzerland"],
  ["TZ", "Tanzania"],
  ["TT", "Trinidad and Tobago"],
  ["UG", "Uganda"],
  ["AE", "United Arab Emirates"],
  ["GB", "United Kingdom"],
  ["US", "United States"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"]
].map(([code, name]) => ({ code, name }));

// packages/shared/src/progress.ts
var t = (p) => new Date(p.measuredAt).getTime();
var sortByTime = (e) => [...e].sort((a, b2) => t(a) - t(b2));

// packages/shared/src/cuisines.ts
var CUISINE_IDS = [
  "jamaican",
  "caribbean",
  "west_african",
  "east_african",
  "southern_african",
  "mediterranean",
  "south_asian",
  "asian",
  "latin_american"
];
var CUISINES = {
  jamaican: {
    id: "jamaican",
    label: "Jamaican",
    group: "caribbean",
    parent: "caribbean",
    priority: 1
  },
  caribbean: { id: "caribbean", label: "Caribbean", group: "caribbean", parent: null, priority: 1 },
  west_african: {
    id: "west_african",
    label: "West African",
    group: "african",
    parent: null,
    priority: 1
  },
  east_african: {
    id: "east_african",
    label: "East African",
    group: "african",
    parent: null,
    priority: 1
  },
  southern_african: {
    id: "southern_african",
    label: "Southern African",
    group: "african",
    parent: null,
    priority: 1
  },
  mediterranean: {
    id: "mediterranean",
    label: "Mediterranean",
    group: "other",
    parent: null,
    priority: 2
  },
  south_asian: {
    id: "south_asian",
    label: "South Asian",
    group: "other",
    parent: null,
    priority: 2
  },
  asian: { id: "asian", label: "Asian", group: "other", parent: null, priority: 2 },
  latin_american: {
    id: "latin_american",
    label: "Latin American",
    group: "other",
    parent: null,
    priority: 2
  }
};
var isCuisineId = (v) => CUISINE_IDS.includes(v);
function matchTags(id) {
  const out = /* @__PURE__ */ new Set([id]);
  const parent = CUISINES[id].parent;
  if (parent) out.add(parent);
  for (const c of CUISINE_IDS) if (CUISINES[c].parent === id) out.add(c);
  return [...out];
}
function cuisineFit(tags, id) {
  if (tags.includes(id)) return 2;
  return matchTags(id).some((t2) => tags.includes(t2)) ? 1 : 0;
}
function bestCuisineFit(tags, ids) {
  let best = 0;
  for (const id of ids)
    if (isCuisineId(id)) best = Math.max(best, cuisineFit(tags, id));
  return best;
}

// packages/shared/src/food-data.json
var food_data_default = {
  _notice: "SYNTHETIC illustrative values for development only. Rounded approximations of typical foods, NOT authoritative nutrition data. Replace with licensed reference data (USDA FoodData Central, Open Food Facts) and dietitian-reviewed regional entries before any public release (gates N1, N3). Preparation, brand and portion variation are large.",
  source: "curated",
  isSynthetic: true,
  foods: [
    {
      id: "white-rice",
      name: "White rice, cooked",
      category: "grain",
      regionTags: ["global"],
      per100g: {
        kcal: 130,
        proteinG: 2.7,
        carbsG: 28,
        fatG: 0.3,
        fiberG: 0.4
      },
      servingG: 150,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["rice"]
    },
    {
      id: "brown-rice",
      name: "Brown rice, cooked",
      category: "grain",
      regionTags: ["global"],
      per100g: {
        kcal: 123,
        proteinG: 2.7,
        carbsG: 26,
        fatG: 1,
        fiberG: 1.6
      },
      servingG: 150,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: []
    },
    {
      id: "jollof-rice",
      name: "Jollof rice",
      category: "mixed_dish",
      regionTags: ["west_african"],
      per100g: {
        kcal: 160,
        proteinG: 3,
        carbsG: 27,
        fatG: 4,
        fiberG: 1
      },
      servingG: 200,
      servingLabel: "1 plate",
      costTier: 1,
      aliases: ["jollof"]
    },
    {
      id: "fried-rice",
      name: "Fried rice",
      category: "mixed_dish",
      regionTags: ["asian", "global"],
      per100g: {
        kcal: 163,
        proteinG: 4,
        carbsG: 24,
        fatG: 5.5,
        fiberG: 1
      },
      servingG: 200,
      servingLabel: "1 plate",
      costTier: 2,
      aliases: []
    },
    {
      id: "rice-and-peas",
      name: "Rice and peas",
      category: "mixed_dish",
      regionTags: ["caribbean"],
      per100g: {
        kcal: 150,
        proteinG: 4,
        carbsG: 26,
        fatG: 3,
        fiberG: 2.5
      },
      servingG: 200,
      servingLabel: "1 plate",
      costTier: 1,
      aliases: ["rice and beans"]
    },
    {
      id: "pasta",
      name: "Pasta, cooked",
      category: "grain",
      regionTags: ["mediterranean", "global"],
      per100g: {
        kcal: 158,
        proteinG: 5.8,
        carbsG: 31,
        fatG: 0.9,
        fiberG: 1.8
      },
      servingG: 180,
      servingLabel: "1 bowl",
      costTier: 1,
      aliases: ["spaghetti"]
    },
    {
      id: "whole-wheat-bread",
      name: "Whole wheat bread",
      category: "grain",
      regionTags: ["global"],
      per100g: {
        kcal: 252,
        proteinG: 12.5,
        carbsG: 43,
        fatG: 3.5,
        fiberG: 6
      },
      servingG: 40,
      servingLabel: "1 slice",
      costTier: 1,
      aliases: ["bread", "toast"]
    },
    {
      id: "pita-bread",
      name: "Pita bread",
      category: "grain",
      regionTags: ["mediterranean"],
      per100g: {
        kcal: 275,
        proteinG: 9,
        carbsG: 55,
        fatG: 1.2,
        fiberG: 2.2
      },
      servingG: 60,
      servingLabel: "1 pita",
      costTier: 1,
      aliases: ["pita"]
    },
    {
      id: "roti",
      name: "Roti / chapati",
      category: "grain",
      regionTags: ["south_asian", "caribbean"],
      per100g: {
        kcal: 297,
        proteinG: 9,
        carbsG: 46,
        fatG: 7,
        fiberG: 5
      },
      servingG: 45,
      servingLabel: "1 roti",
      costTier: 1,
      aliases: ["chapati", "flatbread"]
    },
    {
      id: "oatmeal",
      name: "Oatmeal, cooked",
      category: "grain",
      regionTags: ["global"],
      per100g: {
        kcal: 71,
        proteinG: 2.5,
        carbsG: 12,
        fatG: 1.5,
        fiberG: 1.7
      },
      servingG: 240,
      servingLabel: "1 bowl",
      costTier: 1,
      aliases: ["porridge", "oats"]
    },
    {
      id: "boiled-egg",
      name: "Egg, boiled",
      category: "protein",
      regionTags: ["global"],
      per100g: {
        kcal: 155,
        proteinG: 13,
        carbsG: 1.1,
        fatG: 11,
        fiberG: 0
      },
      servingG: 50,
      servingLabel: "1 egg",
      costTier: 1,
      aliases: ["egg", "eggs"]
    },
    {
      id: "grilled-chicken",
      name: "Chicken breast, grilled",
      category: "protein",
      regionTags: ["global"],
      per100g: {
        kcal: 165,
        proteinG: 31,
        carbsG: 0,
        fatG: 3.6,
        fiberG: 0
      },
      servingG: 120,
      servingLabel: "1 breast",
      costTier: 2,
      aliases: ["chicken"]
    },
    {
      id: "jerk-chicken",
      name: "Jerk chicken",
      category: "protein",
      regionTags: ["caribbean"],
      per100g: {
        kcal: 190,
        proteinG: 22,
        carbsG: 4,
        fatG: 9,
        fiberG: 0.5
      },
      servingG: 130,
      servingLabel: "1 piece",
      costTier: 2,
      aliases: []
    },
    {
      id: "fried-chicken",
      name: "Fried chicken",
      category: "protein",
      regionTags: ["american", "global"],
      per100g: {
        kcal: 246,
        proteinG: 18,
        carbsG: 10,
        fatG: 15,
        fiberG: 0.4
      },
      servingG: 130,
      servingLabel: "1 piece",
      costTier: 2,
      aliases: []
    },
    {
      id: "grilled-tilapia",
      name: "Tilapia, grilled",
      category: "protein",
      regionTags: ["west_african", "global"],
      per100g: {
        kcal: 128,
        proteinG: 26,
        carbsG: 0,
        fatG: 2.7,
        fiberG: 0
      },
      servingG: 140,
      servingLabel: "1 fillet",
      costTier: 2,
      aliases: ["tilapia", "fish"]
    },
    {
      id: "baked-salmon",
      name: "Salmon, baked",
      category: "protein",
      regionTags: ["global"],
      per100g: {
        kcal: 206,
        proteinG: 22,
        carbsG: 0,
        fatG: 12,
        fiberG: 0
      },
      servingG: 140,
      servingLabel: "1 fillet",
      costTier: 3,
      aliases: ["salmon"]
    },
    {
      id: "beef-stew",
      name: "Beef stew",
      category: "mixed_dish",
      regionTags: ["west_african", "caribbean"],
      per100g: {
        kcal: 130,
        proteinG: 12,
        carbsG: 4,
        fatG: 7,
        fiberG: 0.8
      },
      servingG: 200,
      servingLabel: "1 bowl",
      costTier: 2,
      aliases: ["stew"]
    },
    {
      id: "goat-curry",
      name: "Goat curry",
      category: "mixed_dish",
      regionTags: ["caribbean", "south_asian"],
      per100g: {
        kcal: 150,
        proteinG: 14,
        carbsG: 3,
        fatG: 9,
        fiberG: 0.8
      },
      servingG: 180,
      servingLabel: "1 bowl",
      costTier: 3,
      aliases: ["curry goat"]
    },
    {
      id: "chicken-tikka-masala",
      name: "Chicken tikka masala",
      category: "mixed_dish",
      regionTags: ["south_asian"],
      per100g: {
        kcal: 140,
        proteinG: 12,
        carbsG: 6,
        fatG: 8,
        fiberG: 1
      },
      servingG: 200,
      servingLabel: "1 bowl",
      costTier: 2,
      aliases: ["tikka masala"]
    },
    {
      id: "egusi-soup",
      name: "Egusi soup",
      category: "mixed_dish",
      regionTags: ["west_african"],
      per100g: {
        kcal: 190,
        proteinG: 8,
        carbsG: 6,
        fatG: 15,
        fiberG: 2
      },
      servingG: 200,
      servingLabel: "1 bowl",
      costTier: 2,
      aliases: ["egusi"]
    },
    {
      id: "tofu",
      name: "Tofu, firm",
      category: "protein",
      regionTags: ["asian", "global"],
      per100g: {
        kcal: 76,
        proteinG: 8,
        carbsG: 1.9,
        fatG: 4.8,
        fiberG: 0.3
      },
      servingG: 100,
      servingLabel: "100 g",
      costTier: 2,
      aliases: []
    },
    {
      id: "lentils",
      name: "Lentils (dal), cooked",
      category: "legume",
      regionTags: ["south_asian", "global"],
      per100g: {
        kcal: 116,
        proteinG: 9,
        carbsG: 20,
        fatG: 0.4,
        fiberG: 7.9
      },
      servingG: 180,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["dal", "lentil"]
    },
    {
      id: "black-beans",
      name: "Black beans, cooked",
      category: "legume",
      regionTags: ["latin_american", "global"],
      per100g: {
        kcal: 132,
        proteinG: 8.9,
        carbsG: 24,
        fatG: 0.5,
        fiberG: 8.7
      },
      servingG: 170,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["beans"]
    },
    {
      id: "chickpeas",
      name: "Chickpeas, cooked",
      category: "legume",
      regionTags: ["mediterranean", "south_asian"],
      per100g: {
        kcal: 164,
        proteinG: 8.9,
        carbsG: 27,
        fatG: 2.6,
        fiberG: 7.6
      },
      servingG: 160,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["garbanzo"]
    },
    {
      id: "hummus",
      name: "Hummus",
      category: "legume",
      regionTags: ["mediterranean"],
      per100g: {
        kcal: 166,
        proteinG: 8,
        carbsG: 14,
        fatG: 10,
        fiberG: 6
      },
      servingG: 60,
      servingLabel: "4 tbsp",
      costTier: 2,
      aliases: []
    },
    {
      id: "falafel",
      name: "Falafel",
      category: "legume",
      regionTags: ["mediterranean"],
      per100g: {
        kcal: 333,
        proteinG: 13,
        carbsG: 32,
        fatG: 18,
        fiberG: 5
      },
      servingG: 80,
      servingLabel: "4 pieces",
      costTier: 2,
      aliases: []
    },
    {
      id: "spinach-cooked",
      name: "Spinach, cooked",
      category: "vegetable",
      regionTags: ["global"],
      per100g: {
        kcal: 23,
        proteinG: 3,
        carbsG: 3.6,
        fatG: 0.3,
        fiberG: 2.4
      },
      servingG: 90,
      servingLabel: "1/2 cup",
      costTier: 1,
      aliases: ["spinach", "greens"]
    },
    {
      id: "mixed-salad",
      name: "Mixed green salad",
      category: "vegetable",
      regionTags: ["global"],
      per100g: {
        kcal: 20,
        proteinG: 1.5,
        carbsG: 3.5,
        fatG: 0.2,
        fiberG: 1.8
      },
      servingG: 80,
      servingLabel: "1 side",
      costTier: 1,
      aliases: ["salad"]
    },
    {
      id: "greek-salad",
      name: "Greek salad",
      category: "mixed_dish",
      regionTags: ["mediterranean"],
      per100g: {
        kcal: 110,
        proteinG: 3,
        carbsG: 6,
        fatG: 9,
        fiberG: 1.5
      },
      servingG: 150,
      servingLabel: "1 bowl",
      costTier: 2,
      aliases: []
    },
    {
      id: "broccoli",
      name: "Broccoli, steamed",
      category: "vegetable",
      regionTags: ["global"],
      per100g: {
        kcal: 35,
        proteinG: 2.4,
        carbsG: 7,
        fatG: 0.4,
        fiberG: 3.3
      },
      servingG: 90,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["vegetables"]
    },
    {
      id: "tomato-stew",
      name: "Tomato stew (sauce)",
      category: "mixed_dish",
      regionTags: ["west_african"],
      per100g: {
        kcal: 70,
        proteinG: 1.5,
        carbsG: 7,
        fatG: 4,
        fiberG: 1.5
      },
      servingG: 100,
      servingLabel: "1/2 cup",
      costTier: 1,
      aliases: ["pepper sauce"]
    },
    {
      id: "fried-plantain",
      name: "Plantain, fried",
      category: "vegetable",
      regionTags: ["west_african", "caribbean", "latin_american"],
      per100g: {
        kcal: 236,
        proteinG: 1.5,
        carbsG: 37,
        fatG: 10,
        fiberG: 2.3
      },
      servingG: 80,
      servingLabel: "1/2 plantain",
      costTier: 1,
      aliases: ["plantain", "dodo"]
    },
    {
      id: "boiled-plantain",
      name: "Plantain, boiled",
      category: "vegetable",
      regionTags: ["west_african", "caribbean"],
      per100g: {
        kcal: 122,
        proteinG: 1.3,
        carbsG: 32,
        fatG: 0.4,
        fiberG: 2.3
      },
      servingG: 120,
      servingLabel: "1/2 plantain",
      costTier: 1,
      aliases: []
    },
    {
      id: "sweet-potato",
      name: "Sweet potato, baked",
      category: "vegetable",
      regionTags: ["global"],
      per100g: {
        kcal: 90,
        proteinG: 2,
        carbsG: 21,
        fatG: 0.2,
        fiberG: 3.3
      },
      servingG: 130,
      servingLabel: "1 medium",
      costTier: 1,
      aliases: []
    },
    {
      id: "yam-boiled",
      name: "Yam, boiled",
      category: "vegetable",
      regionTags: ["west_african", "caribbean"],
      per100g: {
        kcal: 118,
        proteinG: 1.5,
        carbsG: 28,
        fatG: 0.2,
        fiberG: 4.1
      },
      servingG: 150,
      servingLabel: "1 piece",
      costTier: 1,
      aliases: ["yam"]
    },
    {
      id: "banana",
      name: "Banana",
      category: "fruit",
      regionTags: ["global"],
      per100g: {
        kcal: 89,
        proteinG: 1.1,
        carbsG: 23,
        fatG: 0.3,
        fiberG: 2.6
      },
      servingG: 118,
      servingLabel: "1 medium",
      costTier: 1,
      aliases: []
    },
    {
      id: "mango",
      name: "Mango",
      category: "fruit",
      regionTags: ["global"],
      per100g: {
        kcal: 60,
        proteinG: 0.8,
        carbsG: 15,
        fatG: 0.4,
        fiberG: 1.6
      },
      servingG: 165,
      servingLabel: "1 cup",
      costTier: 2,
      aliases: []
    },
    {
      id: "orange",
      name: "Orange",
      category: "fruit",
      regionTags: ["global"],
      per100g: {
        kcal: 47,
        proteinG: 0.9,
        carbsG: 12,
        fatG: 0.1,
        fiberG: 2.4
      },
      servingG: 130,
      servingLabel: "1 medium",
      costTier: 1,
      aliases: []
    },
    {
      id: "apple",
      name: "Apple",
      category: "fruit",
      regionTags: ["global"],
      per100g: {
        kcal: 52,
        proteinG: 0.3,
        carbsG: 14,
        fatG: 0.2,
        fiberG: 2.4
      },
      servingG: 180,
      servingLabel: "1 medium",
      costTier: 1,
      aliases: []
    },
    {
      id: "pineapple",
      name: "Pineapple",
      category: "fruit",
      regionTags: ["global"],
      per100g: {
        kcal: 50,
        proteinG: 0.5,
        carbsG: 13,
        fatG: 0.1,
        fiberG: 1.4
      },
      servingG: 165,
      servingLabel: "1 cup",
      costTier: 2,
      aliases: []
    },
    {
      id: "plain-yogurt",
      name: "Yogurt, plain",
      category: "dairy",
      regionTags: ["global"],
      per100g: {
        kcal: 61,
        proteinG: 3.5,
        carbsG: 4.7,
        fatG: 3.3,
        fiberG: 0
      },
      servingG: 170,
      servingLabel: "1 pot",
      costTier: 1,
      aliases: ["yoghurt"]
    },
    {
      id: "milk",
      name: "Milk, whole",
      category: "dairy",
      regionTags: ["global"],
      per100g: {
        kcal: 61,
        proteinG: 3.2,
        carbsG: 4.8,
        fatG: 3.3,
        fiberG: 0
      },
      servingG: 240,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: []
    },
    {
      id: "paneer",
      name: "Paneer",
      category: "dairy",
      regionTags: ["south_asian"],
      per100g: {
        kcal: 265,
        proteinG: 18,
        carbsG: 1.2,
        fatG: 20,
        fiberG: 0
      },
      servingG: 80,
      servingLabel: "3 cubes",
      costTier: 3,
      aliases: []
    },
    {
      id: "avocado",
      name: "Avocado",
      category: "fat",
      regionTags: ["global"],
      per100g: {
        kcal: 160,
        proteinG: 2,
        carbsG: 9,
        fatG: 15,
        fiberG: 6.7
      },
      servingG: 100,
      servingLabel: "1/2 avocado",
      costTier: 3,
      aliases: []
    },
    {
      id: "peanut-butter",
      name: "Peanut butter",
      category: "fat",
      regionTags: ["global"],
      per100g: {
        kcal: 588,
        proteinG: 25,
        carbsG: 20,
        fatG: 50,
        fiberG: 6
      },
      servingG: 32,
      servingLabel: "2 tbsp",
      costTier: 2,
      aliases: []
    },
    {
      id: "mixed-nuts",
      name: "Mixed nuts",
      category: "snack",
      regionTags: ["global"],
      per100g: {
        kcal: 607,
        proteinG: 20,
        carbsG: 21,
        fatG: 54,
        fiberG: 7
      },
      servingG: 30,
      servingLabel: "1 handful",
      costTier: 3,
      aliases: ["nuts"]
    },
    {
      id: "pancakes",
      name: "Pancakes",
      category: "mixed_dish",
      regionTags: ["american"],
      per100g: {
        kcal: 227,
        proteinG: 6,
        carbsG: 28,
        fatG: 10,
        fiberG: 1
      },
      servingG: 130,
      servingLabel: "2 pancakes",
      costTier: 1,
      aliases: []
    },
    {
      id: "orange-juice",
      name: "Orange juice",
      category: "drink",
      regionTags: ["global"],
      per100g: {
        kcal: 45,
        proteinG: 0.7,
        carbsG: 10,
        fatG: 0.2,
        fiberG: 0.2
      },
      servingG: 250,
      servingLabel: "1 glass",
      costTier: 1,
      aliases: ["juice"]
    },
    {
      id: "soda",
      name: "Soda (sugary)",
      category: "drink",
      regionTags: ["global"],
      per100g: {
        kcal: 41,
        proteinG: 0,
        carbsG: 10.6,
        fatG: 0,
        fiberG: 0
      },
      servingG: 330,
      servingLabel: "1 can",
      costTier: 1,
      aliases: ["cola"]
    },
    {
      id: "water",
      name: "Water",
      category: "drink",
      regionTags: ["global"],
      per100g: {
        kcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        fiberG: 0
      },
      servingG: 250,
      servingLabel: "1 glass",
      costTier: 1,
      aliases: []
    }
  ]
};

// packages/shared/src/food-data.ts
var FOOD_DATA_NOTICE = food_data_default._notice;
var CURATED_FOODS = food_data_default.foods;
var FOOD_BY_ID = new Map(
  CURATED_FOODS.map((f) => [f.id, f])
);

// packages/shared/src/food.ts
var SPREAD = { high: 0.15, medium: 0.25, low: 0.4 };
var r1 = (n) => Math.round(n * 10) / 10;
var r0 = (n) => Math.round(n);
function itemFromFood(food, grams, opts = {}) {
  const confidence2 = opts.confidence ?? "high";
  const per = food.per100g;
  const f = grams / 100;
  const kcal = per.kcal * f;
  const lowG = opts.gramsLow ?? grams;
  const highG = opts.gramsHigh ?? grams;
  const s = SPREAD[confidence2];
  return {
    name: food.name,
    foodId: food.id,
    grams: r1(grams),
    kcal: r0(kcal),
    proteinG: r1(per.proteinG * f),
    carbsG: r1(per.carbsG * f),
    fatG: r1(per.fatG * f),
    kcalLow: r0(per.kcal * (lowG / 100) * (1 - s)),
    kcalHigh: r0(per.kcal * (highG / 100) * (1 + s)),
    source: opts.source ?? "curated",
    confidence: confidence2,
    userEdited: opts.userEdited ?? false
  };
}
function localDateKey(iso, timeZone) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  try {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(d);
    const get = (t2) => p.find((x) => x.type === t2).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
function score(f, q) {
  const names = [f.name, ...f.aliases].map((n) => n.toLowerCase());
  let best = 0;
  for (const n of names) {
    if (n === q) best = Math.max(best, 100);
    else if (n.startsWith(q)) best = Math.max(best, 80);
    else if (n.split(/[\s,/()-]+/).some((w) => w.startsWith(q))) best = Math.max(best, 60);
    else if (n.includes(q)) best = Math.max(best, 40);
  }
  if (best === 0) {
    const toks = q.split(/\s+/).filter((t2) => t2.length > 2);
    const hay = names.join(" ");
    const hit = toks.filter((t2) => hay.includes(t2)).length;
    if (toks.length > 0 && hit > 0) best = 20 + hit / toks.length * 35;
  }
  return best;
}
function matchReference(query, foods = CURATED_FOODS) {
  const q = query.trim().toLowerCase();
  const best = foods.map((f) => ({ f, s: score(f, q) })).sort((a, b2) => b2.s - a.s)[0];
  return best && best.s >= 40 ? best.f : null;
}
function groundPhotoItems(items, foods = CURATED_FOODS) {
  return items.map((m) => {
    const ref = matchReference(m.referenceQuery || m.name, foods);
    const grams = (m.gramsLow + m.gramsHigh) / 2;
    if (!ref) {
      return {
        name: m.name,
        foodId: null,
        grams: r1(grams),
        kcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        kcalLow: 0,
        kcalHigh: 0,
        source: "ai_estimate",
        confidence: "low",
        userEdited: false,
        needsMatch: true,
        likelyIngredients: m.likelyIngredients ?? []
      };
    }
    const base2 = itemFromFood(ref, grams, {
      source: "ai_estimate",
      confidence: m.confidence,
      gramsLow: m.gramsLow,
      gramsHigh: m.gramsHigh
    });
    return {
      ...base2,
      name: m.name || ref.name,
      needsMatch: false,
      likelyIngredients: m.likelyIngredients ?? []
    };
  });
}
var COMPATIBLE = {
  grain: ["grain", "legume", "vegetable"],
  protein: ["protein", "legume"],
  legume: ["legume", "protein"],
  vegetable: ["vegetable", "grain"],
  fruit: ["fruit"],
  dairy: ["dairy"],
  fat: ["fat", "snack"],
  snack: ["snack", "fruit"],
  drink: ["drink"],
  mixed_dish: ["mixed_dish"]
};
function suggestSwaps(item, mode, foods = CURATED_FOODS, limit = 3, cuisines = []) {
  const cur = item.foodId ? FOOD_BY_ID.get(item.foodId) : void 0;
  if (!cur) return [];
  const per = (f) => f.per100g;
  const out = [];
  for (const f of foods) {
    if (f.id === cur.id || !COMPATIBLE[cur.category].includes(f.category)) continue;
    if (cur.category === "drink" && f.id === "water") continue;
    const g = item.grams;
    const alt = itemFromFood(f, g, { confidence: "high" });
    const kcalDelta = alt.kcal - item.kcal;
    const pDelta = r1((per(f).proteinG - per(cur).proteinG) * (g / 100));
    const fDelta = r1(((per(f).fiberG ?? 0) - (per(cur).fiberG ?? 0)) * (g / 100));
    let ok2 = false;
    let reason = "";
    if (mode === "lighter") {
      ok2 = f.per100g.kcal <= cur.per100g.kcal * 0.85 && f.per100g.kcal > 0;
      reason = `about ${Math.abs(kcalDelta)} fewer kcal for the same weight`;
    } else if (mode === "more_protein") {
      ok2 = pDelta >= 3 && f.per100g.kcal <= cur.per100g.kcal * 1.5;
      reason = `about ${pDelta} g more protein`;
    } else if (mode === "more_fiber") {
      ok2 = fDelta >= 1.5;
      reason = `about ${fDelta} g more fiber`;
    } else {
      ok2 = f.costTier < cur.costTier && Math.abs(kcalDelta) <= Math.max(60, item.kcal * 0.25);
      reason = "usually a lower-cost option with similar energy";
    }
    if (!ok2) continue;
    out.push({
      food: f,
      grams: g,
      item: alt,
      kcalDelta,
      proteinDeltaG: pDelta,
      fiberDeltaG: fDelta,
      reason
    });
  }
  const rank = (s) => {
    const sameRegion = s.food.regionTags.some((t2) => t2 !== "global" && cur.regionTags.includes(t2)) ? 1e3 : 0;
    const sameCat = s.food.category === cur.category ? 500 : 0;
    const cuisine = bestCuisineFit(s.food.regionTags, cuisines) * 400;
    const gain = mode === "lighter" ? -s.kcalDelta : mode === "more_protein" ? s.proteinDeltaG * 10 : mode === "more_fiber" ? s.fiberDeltaG * 10 : (cur.costTier - s.food.costTier) * 100 - Math.abs(s.kcalDelta);
    return sameRegion + sameCat + cuisine + gain;
  };
  return out.sort((a, b2) => rank(b2) - rank(a)).slice(0, limit);
}

// packages/shared/src/energy-guide.ts
function energyGuideFromTargets(t2) {
  if (!t2.kcal) return null;
  return {
    guideKcal: t2.kcal.guide ?? t2.kcal.maintenance,
    maintenanceKcal: t2.kcal.maintenance,
    floorKcal: t2.kcal.floor,
    staleWeightDays: t2.weightStale && t2.weightAgeDays !== null ? t2.weightAgeDays : void 0
  };
}

// packages/shared/src/workout-data.json
var workout_data_default = {
  _notice: "SAMPLE text-only workout outlines for development. They contain no video, music or instructor likeness and are NOT professionally reviewed. Movements are generic and original. Real content needs a certified fitness professional's review (gate F1) and cleared rights (gates L1-L3) before release.",
  isSynthetic: true,
  instructors: [
    {
      id: "sample-instructor",
      displayName: "Sample Instructor (placeholder)",
      bio: "A placeholder record that stands in for a real instructor. Real instructors appear only with a signed agreement covering name, image, voice and likeness."
    }
  ],
  workouts: [
    {
      id: "qf5-afrobeats-wake-up",
      title: "Afrobeats Wake-Up",
      style: "afrobeats",
      level: "beginner",
      minutes: 5,
      intensity: "moderate",
      impact: "low",
      summary: "A five-minute bounce-and-sway session to start the day.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 30,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 30,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Bounce and sway",
          seconds: 97,
          cue: "Soft knees, bounce on the beat and let your shoulders sway side to side.",
          lowImpactAlt: "Same sway standing tall with small steps; no bounce."
        },
        {
          kind: "main",
          title: "Step-tap with arm swing",
          seconds: 98,
          cue: "Step to the side, tap the other foot in, swing the arms in a relaxed arc.",
          lowImpactAlt: "Step without the tap; keep the arm swing low."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 22,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 23,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "qf5-lowimpact-reset",
      title: "Low-Impact Reset",
      style: "low_impact",
      level: "beginner",
      minutes: 5,
      intensity: "low",
      impact: "low",
      summary: "Gentle standing movement to loosen up. Seated option throughout.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 30,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 30,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "March in place",
          seconds: 97,
          cue: "Lift the knees to a comfortable height and swing the arms.",
          lowImpactAlt: "Seated march; lift heels only."
        },
        {
          kind: "main",
          title: "Standing knee lift",
          seconds: 98,
          cue: "Lift one knee at a time while twisting gently toward it.",
          lowImpactAlt: "Tap the toe to the floor instead of lifting."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 22,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 23,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "qf10-amapiano-groove",
      title: "Amapiano Groove 10",
      style: "amapiano",
      level: "beginner",
      minutes: 10,
      intensity: "moderate",
      impact: "low",
      summary: "Relaxed, rhythmic grooves with soft knees. Ten minutes, easy to follow.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 45,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 45,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Slow groove sway",
          seconds: 110,
          cue: "Deep, relaxed sway with soft knees; let the hips lead.",
          lowImpactAlt: "Smaller sway, feet stay planted."
        },
        {
          kind: "main",
          title: "Knee-pulse step",
          seconds: 110,
          cue: "Pulse both knees in time while stepping side to side.",
          lowImpactAlt: "Shift weight side to side without pulsing."
        },
        {
          kind: "main",
          title: "Cross-step glide",
          seconds: 110,
          cue: "Cross one foot in front, glide it back, alternate sides.",
          lowImpactAlt: "Tap instead of crossing; keep steps small."
        },
        {
          kind: "main",
          title: "Shoulder roll flow",
          seconds: 110,
          cue: "Roll the shoulders back in time while keeping a steady step.",
          lowImpactAlt: "Roll the shoulders standing still."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 35,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 35,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "qf10-hiphop-bounce",
      title: "Hip-Hop Bounce 10",
      style: "hip_hop",
      level: "intermediate",
      minutes: 10,
      intensity: "high",
      impact: "moderate",
      summary: "Low stance, strong arms and quick steps in a short, punchy session.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 45,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 45,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Bounce and rock",
          seconds: 110,
          cue: "Bounce in a low stance and rock your weight forward and back.",
          lowImpactAlt: "Rock forward and back without bouncing."
        },
        {
          kind: "main",
          title: "Step-clap",
          seconds: 110,
          cue: "Step out wide, clap, step in, clap.",
          lowImpactAlt: "Step out with one foot at a time, skip the wide stance."
        },
        {
          kind: "main",
          title: "Arm-line groove",
          seconds: 110,
          cue: "Make sharp arm lines (up, across, down) over a steady bounce.",
          lowImpactAlt: "Make the arm lines slowly, standing still."
        },
        {
          kind: "main",
          title: "Quarter-turn step",
          seconds: 110,
          cue: "Step and turn a quarter each time with a pause on the beat.",
          lowImpactAlt: "Face forward and step side to side."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 35,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 35,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "qf10-latin-rhythm",
      title: "Latin Rhythm 10",
      style: "latin",
      level: "beginner",
      minutes: 10,
      intensity: "moderate",
      impact: "low",
      summary: "Side steps, hip sway and a simple cross-body walk.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 45,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 45,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Basic side step",
          seconds: 110,
          cue: "Step side, together, side, tap with relaxed hips.",
          lowImpactAlt: "Step side and tap without hip movement."
        },
        {
          kind: "main",
          title: "Forward-back rhythm",
          seconds: 110,
          cue: "Step forward, rock back, replace, with a gentle hip sway.",
          lowImpactAlt: "Smaller steps with flat feet."
        },
        {
          kind: "main",
          title: "Cross-body walk",
          seconds: 110,
          cue: "Walk a loose diagonal path across the room with a hip sway.",
          lowImpactAlt: "March in place with a slight sway."
        },
        {
          kind: "main",
          title: "Hip circle step",
          seconds: 110,
          cue: "Circle the hips slowly on every second step.",
          lowImpactAlt: "Circle the hips standing still."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 35,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 35,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "qf10-bollywood-energy",
      title: "Bollywood Energy 10",
      style: "bollywood",
      level: "intermediate",
      minutes: 10,
      intensity: "moderate",
      impact: "moderate",
      summary: "Big arm sweeps, shimmies and a slow turn.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 45,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 45,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Arm sweep side step",
          seconds: 110,
          cue: "Sweep both arms overhead as you step wide, then bring them down.",
          lowImpactAlt: "Sweep the arms at chest height with small steps."
        },
        {
          kind: "main",
          title: "Shoulder shimmy walk",
          seconds: 110,
          cue: "Walk forward four steps with a light shoulder shimmy.",
          lowImpactAlt: "Shimmy the shoulders while marching in place."
        },
        {
          kind: "main",
          title: "Spin and pose",
          seconds: 110,
          cue: "Turn once slowly and hold a tall pose for a beat.",
          lowImpactAlt: "Replace the turn with a step-and-pose."
        },
        {
          kind: "main",
          title: "Hand-flow step",
          seconds: 110,
          cue: "Float the hands in soft circles as you step side to side.",
          lowImpactAlt: "Same hand flow seated or with feet planted."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 35,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 35,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one.",
        "Take the turn slowly and keep your eyes on a fixed point to stay balanced."
      ]
    },
    {
      id: "qf15-afrobeats-burn",
      title: "Afrobeats Cardio 15",
      style: "afrobeats",
      level: "intermediate",
      minutes: 15,
      intensity: "high",
      impact: "moderate",
      summary: "A fifteen-minute cardio session built on bouncy, high-energy steps.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 67,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 68,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Bounce and sway",
          seconds: 163,
          cue: "Soft knees, bounce on the beat and let your shoulders sway side to side.",
          lowImpactAlt: "Same sway standing tall with small steps; no bounce."
        },
        {
          kind: "main",
          title: "Step-tap with arm swing",
          seconds: 163,
          cue: "Step to the side, tap the other foot in, swing the arms in a relaxed arc.",
          lowImpactAlt: "Step without the tap; keep the arm swing low."
        },
        {
          kind: "main",
          title: "Heel-toe pulse",
          seconds: 163,
          cue: "Alternate heel then toe taps forward while pulsing the chest.",
          lowImpactAlt: "Tap the heel only, feet stay close to the floor."
        },
        {
          kind: "main",
          title: "Grapevine groove",
          seconds: 166,
          cue: "Four steps to one side then back, adding a gentle hip roll.",
          lowImpactAlt: "Two steps each way with no hip roll."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 55,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 55,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "qf15-lowimpact-flow",
      title: "Low-Impact Flow 15",
      style: "low_impact",
      level: "beginner",
      minutes: 15,
      intensity: "low",
      impact: "low",
      summary: "A full quarter-hour of low-impact dance fitness with seated options.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 67,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 68,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "March in place",
          seconds: 163,
          cue: "Lift the knees to a comfortable height and swing the arms.",
          lowImpactAlt: "Seated march; lift heels only."
        },
        {
          kind: "main",
          title: "Standing knee lift",
          seconds: 163,
          cue: "Lift one knee at a time while twisting gently toward it.",
          lowImpactAlt: "Tap the toe to the floor instead of lifting."
        },
        {
          kind: "main",
          title: "Step-touch",
          seconds: 163,
          cue: "Step side to side and touch the feet together.",
          lowImpactAlt: "Same with the smallest steps."
        },
        {
          kind: "main",
          title: "Arm reach flow",
          seconds: 166,
          cue: "Reach up, out and across the body in a slow flow.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 55,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 55,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "qf15-latin-cardio",
      title: "Latin Cardio 15",
      style: "latin",
      level: "intermediate",
      minutes: 15,
      intensity: "moderate",
      impact: "moderate",
      summary: "Steady Latin-inspired cardio with forward-back rhythm and hip circles.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 67,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 68,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Basic side step",
          seconds: 163,
          cue: "Step side, together, side, tap with relaxed hips.",
          lowImpactAlt: "Step side and tap without hip movement."
        },
        {
          kind: "main",
          title: "Forward-back rhythm",
          seconds: 163,
          cue: "Step forward, rock back, replace, with a gentle hip sway.",
          lowImpactAlt: "Smaller steps with flat feet."
        },
        {
          kind: "main",
          title: "Cross-body walk",
          seconds: 163,
          cue: "Walk a loose diagonal path across the room with a hip sway.",
          lowImpactAlt: "March in place with a slight sway."
        },
        {
          kind: "main",
          title: "Hip circle step",
          seconds: 166,
          cue: "Circle the hips slowly on every second step.",
          lowImpactAlt: "Circle the hips standing still."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 55,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 55,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "w20-amapiano-slow-burn",
      title: "Amapiano Slow Burn",
      style: "amapiano",
      level: "beginner",
      minutes: 20,
      intensity: "moderate",
      impact: "low",
      summary: "Twenty minutes of deep grooves that build gradually.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 90,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 90,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Slow groove sway",
          seconds: 145,
          cue: "Deep, relaxed sway with soft knees; let the hips lead.",
          lowImpactAlt: "Smaller sway, feet stay planted."
        },
        {
          kind: "main",
          title: "Knee-pulse step",
          seconds: 145,
          cue: "Pulse both knees in time while stepping side to side.",
          lowImpactAlt: "Shift weight side to side without pulsing."
        },
        {
          kind: "main",
          title: "Cross-step glide",
          seconds: 145,
          cue: "Cross one foot in front, glide it back, alternate sides.",
          lowImpactAlt: "Tap instead of crossing; keep steps small."
        },
        {
          kind: "main",
          title: "Shoulder roll flow",
          seconds: 145,
          cue: "Roll the shoulders back in time while keeping a steady step.",
          lowImpactAlt: "Roll the shoulders standing still."
        },
        {
          kind: "main",
          title: "Slow groove sway",
          seconds: 145,
          cue: "Deep, relaxed sway with soft knees; let the hips lead.",
          lowImpactAlt: "Smaller sway, feet stay planted."
        },
        {
          kind: "main",
          title: "Knee-pulse step",
          seconds: 150,
          cue: "Pulse both knees in time while stepping side to side.",
          lowImpactAlt: "Shift weight side to side without pulsing."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 72,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 73,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "w20-bollywood-fusion",
      title: "Bollywood Fusion",
      style: "bollywood",
      level: "intermediate",
      minutes: 20,
      intensity: "moderate",
      impact: "moderate",
      summary: "Expressive arm work and footwork over twenty minutes.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 90,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 90,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Arm sweep side step",
          seconds: 145,
          cue: "Sweep both arms overhead as you step wide, then bring them down.",
          lowImpactAlt: "Sweep the arms at chest height with small steps."
        },
        {
          kind: "main",
          title: "Shoulder shimmy walk",
          seconds: 145,
          cue: "Walk forward four steps with a light shoulder shimmy.",
          lowImpactAlt: "Shimmy the shoulders while marching in place."
        },
        {
          kind: "main",
          title: "Spin and pose",
          seconds: 145,
          cue: "Turn once slowly and hold a tall pose for a beat.",
          lowImpactAlt: "Replace the turn with a step-and-pose."
        },
        {
          kind: "main",
          title: "Hand-flow step",
          seconds: 145,
          cue: "Float the hands in soft circles as you step side to side.",
          lowImpactAlt: "Same hand flow seated or with feet planted."
        },
        {
          kind: "main",
          title: "Arm sweep side step",
          seconds: 145,
          cue: "Sweep both arms overhead as you step wide, then bring them down.",
          lowImpactAlt: "Sweep the arms at chest height with small steps."
        },
        {
          kind: "main",
          title: "Shoulder shimmy walk",
          seconds: 150,
          cue: "Walk forward four steps with a light shoulder shimmy.",
          lowImpactAlt: "Shimmy the shoulders while marching in place."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 72,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 73,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "w30-afrobeats-party",
      title: "Afrobeats Party Cardio",
      style: "afrobeats",
      level: "advanced",
      minutes: 30,
      intensity: "high",
      impact: "high",
      summary: "A longer, high-energy session with fast footwork and jumps.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 135,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 135,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Bounce and sway",
          seconds: 219,
          cue: "Soft knees, bounce on the beat and let your shoulders sway side to side.",
          lowImpactAlt: "Same sway standing tall with small steps; no bounce."
        },
        {
          kind: "main",
          title: "Step-tap with arm swing",
          seconds: 219,
          cue: "Step to the side, tap the other foot in, swing the arms in a relaxed arc.",
          lowImpactAlt: "Step without the tap; keep the arm swing low."
        },
        {
          kind: "main",
          title: "Heel-toe pulse",
          seconds: 219,
          cue: "Alternate heel then toe taps forward while pulsing the chest.",
          lowImpactAlt: "Tap the heel only, feet stay close to the floor."
        },
        {
          kind: "main",
          title: "Grapevine groove",
          seconds: 219,
          cue: "Four steps to one side then back, adding a gentle hip roll.",
          lowImpactAlt: "Two steps each way with no hip roll."
        },
        {
          kind: "main",
          title: "Bounce and sway",
          seconds: 219,
          cue: "Soft knees, bounce on the beat and let your shoulders sway side to side.",
          lowImpactAlt: "Same sway standing tall with small steps; no bounce."
        },
        {
          kind: "main",
          title: "Step-tap with arm swing",
          seconds: 220,
          cue: "Step to the side, tap the other foot in, swing the arms in a relaxed arc.",
          lowImpactAlt: "Step without the tap; keep the arm swing low."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 107,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 108,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "This workout includes jumping or fast footwork. If you are new to exercise or returning after a break, start with the low-impact version.",
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "w30-hiphop-groove",
      title: "Hip-Hop Groove 30",
      style: "hip_hop",
      level: "advanced",
      minutes: 30,
      intensity: "high",
      impact: "high",
      summary: "Thirty minutes of low-stance work, quick direction changes and sharp arm lines.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 135,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 135,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "Bounce and rock",
          seconds: 219,
          cue: "Bounce in a low stance and rock your weight forward and back.",
          lowImpactAlt: "Rock forward and back without bouncing."
        },
        {
          kind: "main",
          title: "Step-clap",
          seconds: 219,
          cue: "Step out wide, clap, step in, clap.",
          lowImpactAlt: "Step out with one foot at a time, skip the wide stance."
        },
        {
          kind: "main",
          title: "Arm-line groove",
          seconds: 219,
          cue: "Make sharp arm lines (up, across, down) over a steady bounce.",
          lowImpactAlt: "Make the arm lines slowly, standing still."
        },
        {
          kind: "main",
          title: "Quarter-turn step",
          seconds: 219,
          cue: "Step and turn a quarter each time with a pause on the beat.",
          lowImpactAlt: "Face forward and step side to side."
        },
        {
          kind: "main",
          title: "Bounce and rock",
          seconds: 219,
          cue: "Bounce in a low stance and rock your weight forward and back.",
          lowImpactAlt: "Rock forward and back without bouncing."
        },
        {
          kind: "main",
          title: "Step-clap",
          seconds: 220,
          cue: "Step out wide, clap, step in, clap.",
          lowImpactAlt: "Step out with one foot at a time, skip the wide stance."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 107,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 108,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "This workout includes jumping or fast footwork. If you are new to exercise or returning after a break, start with the low-impact version.",
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    },
    {
      id: "w30-lowimpact-full-body",
      title: "Low-Impact Full Body",
      style: "low_impact",
      level: "beginner",
      minutes: 30,
      intensity: "low",
      impact: "low",
      summary: "A thirty-minute, joint-friendly session working the whole body.",
      instructorId: null,
      equipment: "none",
      contentOrigin: "original_text",
      blocks: [
        {
          kind: "warmup",
          title: "Easy march and shoulder rolls",
          seconds: 135,
          cue: "Walk in place and roll the shoulders to raise your heart rate gently.",
          lowImpactAlt: "Seated march with shoulder rolls."
        },
        {
          kind: "warmup",
          title: "Dynamic stretches",
          seconds: 135,
          cue: "Reach overhead, side-bend, and gentle hip circles.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "March in place",
          seconds: 219,
          cue: "Lift the knees to a comfortable height and swing the arms.",
          lowImpactAlt: "Seated march; lift heels only."
        },
        {
          kind: "main",
          title: "Standing knee lift",
          seconds: 219,
          cue: "Lift one knee at a time while twisting gently toward it.",
          lowImpactAlt: "Tap the toe to the floor instead of lifting."
        },
        {
          kind: "main",
          title: "Step-touch",
          seconds: 219,
          cue: "Step side to side and touch the feet together.",
          lowImpactAlt: "Same with the smallest steps."
        },
        {
          kind: "main",
          title: "Arm reach flow",
          seconds: 219,
          cue: "Reach up, out and across the body in a slow flow.",
          lowImpactAlt: "Do it seated."
        },
        {
          kind: "main",
          title: "March in place",
          seconds: 219,
          cue: "Lift the knees to a comfortable height and swing the arms.",
          lowImpactAlt: "Seated march; lift heels only."
        },
        {
          kind: "main",
          title: "Standing knee lift",
          seconds: 220,
          cue: "Lift one knee at a time while twisting gently toward it.",
          lowImpactAlt: "Tap the toe to the floor instead of lifting."
        },
        {
          kind: "cooldown",
          title: "Slow walk and breathing",
          seconds: 107,
          cue: "Walk in place slowly and breathe in through the nose, out through the mouth.",
          lowImpactAlt: "Seated, same breathing."
        },
        {
          kind: "cooldown",
          title: "Gentle stretches",
          seconds: 108,
          cue: "Hold calf, quad and chest stretches for about 20 seconds each, without bouncing.",
          lowImpactAlt: "Seated versions of each stretch."
        }
      ],
      safety: [
        "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
        "Clear a safe space, wear supportive footwear and keep water nearby.",
        "You can switch to the low-impact version at any time; it is a full workout, not a lesser one."
      ]
    }
  ],
  programs: [
    {
      id: "sample-4wk-starter",
      title: "Sample 4-week starter (text only)",
      description: "A gentle four-week outline: three sessions a week, building from short low-impact sessions to longer dance workouts. Sample structure only; instructor-led programs need signed instructor and content agreements.",
      weeks: 4,
      sessionsPerWeek: 3,
      level: "beginner",
      instructorId: "sample-instructor",
      schedule: [
        {
          week: 1,
          day: 1,
          workoutId: "qf5-lowimpact-reset"
        },
        {
          week: 1,
          day: 3,
          workoutId: "qf10-amapiano-groove"
        },
        {
          week: 1,
          day: 5,
          workoutId: "qf10-latin-rhythm"
        },
        {
          week: 2,
          day: 1,
          workoutId: "qf10-latin-rhythm"
        },
        {
          week: 2,
          day: 3,
          workoutId: "qf15-lowimpact-flow"
        },
        {
          week: 2,
          day: 5,
          workoutId: "qf5-afrobeats-wake-up"
        },
        {
          week: 3,
          day: 1,
          workoutId: "w20-amapiano-slow-burn"
        },
        {
          week: 3,
          day: 3,
          workoutId: "qf10-latin-rhythm"
        },
        {
          week: 3,
          day: 5,
          workoutId: "qf15-lowimpact-flow"
        },
        {
          week: 4,
          day: 1,
          workoutId: "w20-amapiano-slow-burn"
        },
        {
          week: 4,
          day: 3,
          workoutId: "qf15-latin-cardio"
        },
        {
          week: 4,
          day: 5,
          workoutId: "w30-lowimpact-full-body"
        }
      ]
    }
  ]
};

// packages/shared/src/workouts.ts
var LIVE_STYLES = [
  "afrobeats",
  "amapiano",
  "hip_hop",
  "latin",
  "bollywood",
  "low_impact"
];
var PENDING_STYLES = ["dancehall", "reggae", "chair_dance"];
var ALL_STYLES = [...LIVE_STYLES, ...PENDING_STYLES];
var DANCE_STYLES = [...LIVE_STYLES];
var STYLE_DEFS = {
  afrobeats: {
    id: "afrobeats",
    label: "Afrobeats",
    kind: "dance",
    protected: false,
    seatedOnly: false
  },
  amapiano: {
    id: "amapiano",
    label: "Amapiano",
    kind: "dance",
    protected: false,
    seatedOnly: false
  },
  hip_hop: { id: "hip_hop", label: "Hip hop", kind: "dance", protected: false, seatedOnly: false },
  latin: { id: "latin", label: "Latin", kind: "dance", protected: false, seatedOnly: false },
  bollywood: {
    id: "bollywood",
    label: "Bollywood",
    kind: "dance",
    protected: false,
    seatedOnly: false
  },
  low_impact: {
    id: "low_impact",
    label: "Low impact",
    kind: "accessibility",
    protected: false,
    seatedOnly: false
  },
  dancehall: {
    id: "dancehall",
    label: "Dancehall",
    kind: "dance",
    protected: true,
    seatedOnly: false
  },
  reggae: { id: "reggae", label: "Reggae", kind: "dance", protected: true, seatedOnly: false },
  chair_dance: {
    id: "chair_dance",
    label: "Chair dance",
    kind: "accessibility",
    protected: true,
    seatedOnly: true
  }
};
var INTENSITIES = ["low", "moderate", "high"];
var QUICK_FIT_MINUTES = [5, 10, 15];
var isPreviewOnly = (w) => w.fixture === true || w.draft !== void 0;
var isSeatedSuitable = (w) => STYLE_DEFS[w.style].seatedOnly || w.seatedSuitable === true;
var WORKOUT_DATA_NOTICE = workout_data_default._notice;
var WORKOUTS = workout_data_default.workouts;
var WORKOUT_BY_ID = new Map(
  WORKOUTS.map((w) => [w.id, w])
);
var INSTRUCTORS = workout_data_default.instructors;
var PROGRAMS = workout_data_default.programs;
var isQuickFit = (w) => QUICK_FIT_MINUTES.includes(w.minutes);
var hasAny = (list, v) => !list || list.length === 0 || list.includes(v);
function filterWorkouts(f, list = WORKOUTS) {
  return list.filter(
    (w) => hasAny(f.styles, w.style) && hasAny(f.levels, w.level) && hasAny(f.intensities, w.intensity) && hasAny(f.minutes, w.minutes)
  ).filter((w) => !f.quickFitOnly || isQuickFit(w)).filter((w) => !f.lowImpactOnly || w.impact === "low").filter((w) => !f.seatedOnly || isSeatedSuitable(w)).sort((a, b2) => a.minutes - b2.minutes || a.title.localeCompare(b2.title));
}
function suggestQuickFit(args, all = WORKOUTS) {
  const list = all.filter(
    (w) => !isPreviewOnly(w) || args.style !== void 0 && w.style === args.style || args.seated === true && isSeatedSuitable(w)
  );
  const seatedPool = args.seated ? filterWorkouts(
    {
      minutes: [args.minutes],
      quickFitOnly: true,
      lowImpactOnly: args.lowImpactOnly,
      intensities: args.intensities,
      seatedOnly: true
    },
    list
  ).filter((w) => !args.excludeIds?.includes(w.id)) : [];
  if (seatedPool.length > 0) {
    const styled = args.style ? seatedPool.filter((w) => w.style === args.style) : [];
    const use = styled.length > 0 ? styled : seatedPool;
    return use[(args.seed ?? 0) % use.length] ?? null;
  }
  const pool = filterWorkouts(
    {
      minutes: [args.minutes],
      quickFitOnly: true,
      lowImpactOnly: args.lowImpactOnly,
      intensities: args.intensities,
      styles: args.style ? [args.style] : void 0
    },
    list
  ).filter((w) => !args.excludeIds?.includes(w.id));
  const fallback = pool.length > 0 ? pool : filterWorkouts(
    {
      minutes: [args.minutes],
      quickFitOnly: true,
      lowImpactOnly: args.lowImpactOnly,
      intensities: args.intensities
    },
    list
  );
  const gentlest = () => {
    const all2 = filterWorkouts(
      { minutes: [args.minutes], quickFitOnly: true, lowImpactOnly: args.lowImpactOnly },
      list
    ).filter((w) => !args.excludeIds?.includes(w.id));
    const rank = (w) => INTENSITIES.indexOf(w.intensity);
    const lowest = Math.min(...all2.map(rank));
    const gentle = all2.filter((w) => rank(w) === lowest);
    const styled = args.style ? gentle.filter((w) => w.style === args.style) : [];
    return styled.length > 0 ? styled : gentle;
  };
  const chosen = fallback.length === 0 && args.intensities ? gentlest() : fallback;
  return chosen.length === 0 ? null : chosen[(args.seed ?? 0) % chosen.length] ?? null;
}
var pad = (n) => String(n).padStart(2, "0");
function addDaysIso(date, days) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// packages/shared/src/activity.ts
var pad2 = (n) => String(n).padStart(2, "0");
function weekStartOf(dateKey) {
  const d = /* @__PURE__ */ new Date(`${dateKey}T00:00:00Z`);
  const dow2 = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow2);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
var sessionMinutes = (s) => s.durationS && s.durationS > 0 ? Math.max(1, Math.round(s.durationS / 60)) : s.minutes;

// packages/shared/src/coach-safety.ts
var EXTREME_LOSS = /\b(?:lose|drop|shed)\s+(?:\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos?|lbs?|pounds?)\s+(?:in|within|by)\s+(?:a|one|1|2|two|3|three|\d+)\s*(?:day|days|week|weeks)\b/i;
var EXTREME_EATING = /\b(?:fast(?:ing)?\s+for\s+\d+|water\s+fast|juice\s+cleanse|crash\s+diet|detox|starv(?:e|ing)\b|skip\s+(?:all\s+)?(?:my\s+)?meals|stop\s+eating|eat\s+nothing)\b/i;
var LOW_KCAL_REQUEST = /\b(?:eat|have|consume|live on|diet of|plan(?: for)?)\s+(?:only\s+|just\s+)?(?:under\s+|below\s+|less than\s+)?(\d{3,4})\s*(?:kcal|calories|cals)\b/i;
var MEDICAL = /\b(?:chest pain|chest pressure|can'?t breathe|trouble breathing|fainted|passed out|severe pain|coughing blood|blood in (?:my )?(?:stool|urine)|heart attack|stroke)\b/i;
var AGE_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen";
var NOT_AN_AGE = "seconds?|minutes?|mins?|hours?|hrs?|days?|nights?|weeks?|wks?|months?|kgs?|kilos?|kilograms?|lbs?|pounds?|stones?|st|foot|feet|ft|inch(?:es)?|cm|m|metres?|meters?|reps?|sets?|miles?|kms?|steps?|percent|times?|cups?|glasses|litres?|liters?|kcal|calories|cals";
var MINOR = new RegExp(
  String.raw`\b(?:i am|i'm|im)\s+(?:only\s+|just\s+)?(?:(?:1[0-7]|[0-9])|(?:${AGE_WORDS}))(?:\s*(?:years?|yrs?|y\/?o)\b|\s*[.,;!?]|\s*$|\s+(?!(?:${NOT_AN_AGE})\b)[a-z])`,
  "i"
);
function screenCoachInput(text) {
  const risk = screenMessageForRiskSignals(text);
  if (risk) return { kind: "risk", category: risk };
  if (MEDICAL.test(text)) return { kind: "medical_symptom" };
  if (MINOR.test(text)) return { kind: "minor" };
  const low = LOW_KCAL_REQUEST.exec(text);
  if (EXTREME_LOSS.test(text) || EXTREME_EATING.test(text) || low && Number(low[1]) <= 1e3)
    return { kind: "unsafe_request" };
  return { kind: "ok" };
}
var SAFE_REDIRECT_MESSAGES = {
  risk: {
    message: "It sounds like things may be hard right now, and you deserve support from a person. Please reach out to a local support line or a health professional you trust. I am here for gentle movement and everyday habits whenever you want them.",
    supportReferral: true,
    because: ["I noticed language that suggests you may be struggling."]
  },
  medical_symptom: {
    message: "What you describe could be serious. Please stop exercising and get medical help now (call your local emergency number if it is severe or getting worse). I cannot assess symptoms, and a professional can.",
    supportReferral: true,
    because: ["Symptoms like these need a health professional, not a fitness app."]
  },
  unsafe_request: {
    message: "I cannot help with very fast weight loss, extreme restriction or fasting plans: they can harm your health and rarely last. I can help with a steady pace, regular meals, and movement you enjoy. If you are worried about your weight or eating, a registered dietitian or doctor can give you personal guidance.",
    supportReferral: true,
    because: ["Safe, sustainable changes work better than extreme ones."]
  },
  minor: {
    message: "Locked In Fitness is for adults aged 18 and over, so I cannot coach you here. A parent, carer, teacher or doctor can help you find activity and food guidance that suits your age.",
    supportReferral: false,
    because: ["This app is for adults."]
  }
};
var GUILT_AND_HYPE = /\b(?:guarantee[sd]?|will definitely lose|burn fat fast|fast fat loss|detox|cleanse|crash diet|starv(?:e|ing|ation)|cheat day|no excuses|you failed|lazy|ashamed|disappointing|punish(?:ment)?)\b|(?<!\b(?:no need to|nothing to|not have to|don'?t need to|never need to|needn'?t)\s)\b(?:earn (?:your )?(?:food|meal|dinner)|make up for|compensate for|work it off|burn off (?:that|your))\b/i;
var STREAK_PRESSURE = /\b(?:don'?t break (?:your|the) streak|keep your streak|streak (?:will be|is|gets) (?:lost|broken|reset)|you'?ll lose your streak|only \d+ (?:days?|hours?) left)\b/i;
var DIAGNOSIS = /\byou (?:have|are suffering from|probably have|likely have)\s+(?:diabetes|anorexia|bulimia|an eating disorder|depression|hypertension|high blood pressure|a thyroid)/i;
var LOW_KCAL_OUTPUT = /\b(?:under|below|less than|only|just|around|about)?\s*(\d{3,4})\s*(?:kcal|calories)\s+(?:a|per)\s+day\b/i;
var COMPETITION = /\b(?:beat|outdo|compete against|rank(?:ed)? (?:above|higher than)|leaderboard)\b.*\b(?:weight|lose|loss|kg|pounds)\b/i;
function unsafeOutputProblems(text) {
  const p = [];
  if (GUILT_AND_HYPE.test(text)) p.push("guilt, hype or extreme-diet language");
  if (STREAK_PRESSURE.test(text)) p.push("streak pressure");
  if (DIAGNOSIS.test(text)) p.push("medical diagnosis");
  if (COMPETITION.test(text)) p.push("weight competition");
  const low = LOW_KCAL_OUTPUT.exec(text);
  if (low && Number(low[1]) < 1200) p.push("very low calorie prescription");
  return p;
}

// packages/shared/src/coach-context.ts
var round50 = (n) => Math.round(n / 50) * 50;
function buildCoachContext(args) {
  let localHour = args.now.getUTCHours();
  let weekday = args.now.toLocaleDateString("en", { weekday: "long", timeZone: "UTC" });
  try {
    if (args.timeZone) {
      localHour = Number(
        new Intl.DateTimeFormat("en", {
          hour: "numeric",
          hour12: false,
          timeZone: args.timeZone
        }).format(args.now)
      ) % 24;
      weekday = args.now.toLocaleDateString("en", { weekday: "long", timeZone: args.timeZone });
    }
  } catch {
  }
  const base2 = {
    personalized: args.personalized,
    unitSystem: args.unitSystem,
    localHour,
    weekday,
    today: localDateKey(args.now, args.timeZone ?? null)
  };
  if (!args.personalized) return base2;
  const hidden = args.wellness?.numbersHidden === true;
  return {
    ...base2,
    mode: args.mode ?? null,
    lowImpact: args.lowImpact,
    goals: args.goals,
    weightTrend: hidden ? null : args.weightTrend ?? null,
    activity: args.activity,
    food: args.food ? hidden ? {
      mealsToday: args.food.mealsToday,
      lastMealItems: args.food.lastMealItems?.map((i) => ({ ...i, kcal: 0 }))
    } : {
      ...args.food,
      kcalToday: args.food.kcalToday === void 0 ? void 0 : round50(args.food.kcalToday)
    } : void 0,
    plan: args.plan ?? null,
    wellness: args.wellness,
    comeback: args.comeback ?? null,
    guideKcal: hidden || args.guideKcal === void 0 ? void 0 : round50(args.guideKcal),
    guideWeightDaysOld: hidden || args.guideKcal === void 0 || args.guideWeightDaysOld === void 0 ? void 0 : args.guideWeightDaysOld
  };
}
function classifyIntent(text) {
  const t2 = text.toLowerCase();
  const mins = /\b(5|five)\s*(?:min|minute)/.test(t2) ? 5 : /\b(10|ten)\s*(?:min|minute)/.test(t2) ? 10 : /\b(15|fifteen)\s*(?:min|minute)/.test(t2) ? 15 : void 0;
  if (/\b(travel|travelling|traveling|hotel|trip|on the road|flight|vacation|holiday)\b/.test(t2))
    return { intent: "travel" };
  if (/\b(missed|been away|fell off|haven'?t (?:worked|exercised|moved|danced)|back after|restart|start again|come ?back|get back)\b/.test(
    t2
  ))
    return { intent: "comeback" };
  if (/\b(busy|no time|short on time|only have|swamped|hectic)\b/.test(t2) && !/\bfood|meal|eat\b/.test(t2))
    return { intent: "busy", minutes: mins };
  if (/\b(plateau\w*|stuck|stalled|not losing|stopped losing|scale (?:won'?t|isn'?t|hasn'?t)|not moving)\b/.test(
    t2
  ))
    return { intent: "plateau" };
  if (/\b(why)\b.*\b(plan|suggest|asked|recommend)|\bexplain\b.*\b(plan|today)\b/.test(t2))
    return { intent: "plan_explain" };
  if (/\b(sore|tired|exhausted|worn out|achy|sleep|slept|insomnia|recover|recovery|rest day)\b/.test(
    t2
  ))
    return { intent: "recovery" };
  if (/\b(habit|habits|routine|motivat\w*|consisten\w*|stay on track|keep going)\b/.test(t2))
    return { intent: "habits" };
  if (/\b(my week|this week|weekly|week in review|how (?:was|did) (?:i|my))\b/.test(t2))
    return { intent: "weekly_review" };
  if (/\b(too (?:hard|fast|much|strict|aggressive)|goal (?:is )?(?:hard|too)|can'?t keep up|slow(?:er)? (?:down|pace)|gentler goal)\b/.test(
    t2
  ))
    return { intent: "goal_too_hard" };
  if (/\b(calor\w*|kcal|maintenance (?:calories|level)|how much (?:should i|do i) eat|how many.*\beat\b)\b/.test(
    t2
  ))
    return { intent: "calorie_needs" };
  if (/\b(protein|fib(?:re|er)|balanced (?:plate|meal|diet)|healthy plate|plate|what (?:should|can) i eat)\b/.test(
    t2
  ))
    return { intent: "nutrition_balance" };
  if (/\b(maintain|maintaining|maintenance|keep (?:my )?weight|reached my goal|hit my goal|goal weight|after (?:losing|i lose|i lost)|regain\w*)\b/.test(
    t2
  ))
    return { intent: "maintenance" };
  if (/\b(swap|instead of|alternative|replace|lighter|healthier option|substitute)\b/.test(t2))
    return { intent: "food_swap" };
  if (/\b(weigh|weight|scale|goal|progress|plateau)\b/.test(t2))
    return { intent: "weight_question" };
  if (mins || /\b(workout|dance|exercise|session|move|class)\b/.test(t2))
    return { intent: "workout_request", minutes: mins };
  if (/\b(plan|today|what should i do|what now|schedule)\b/.test(t2))
    return { intent: "plan_today" };
  return { intent: "general" };
}

// packages/shared/src/daily-plan.ts
function comebackSessions(startDate) {
  return [
    { workoutId: "qf5-lowimpact-reset", plannedFor: startDate },
    { workoutId: "qf10-latin-rhythm", plannedFor: addDaysIso(startDate, 2) },
    { workoutId: "qf10-amapiano-groove", plannedFor: addDaysIso(startDate, 4) }
  ];
}

// packages/shared/src/home-items.ts
var HOME_ITEM_IDS = [
  "chair",
  "wall",
  "towel",
  "water_bottles",
  "backpack",
  "stairs"
];

// packages/shared/src/nutrition-plan.ts
var STALE_WEIGHT_DAYS = 60;
var roundTo = (n, step) => Math.round(n / step) * step;
function waterGuideMl(weightKg) {
  if (!weightKg || weightKg <= 0) return 2e3;
  return Math.min(3e3, Math.max(1500, roundTo(weightKg * 30, 250)));
}
function nutritionTargets(i) {
  const base2 = { intent: i.intent, provisional: true, waterMl: waterGuideMl(i.weightKg) };
  let missing = [];
  const none = (mode, reasons3, seeProfessional2 = false) => ({
    ...base2,
    mode,
    kcal: null,
    proteinG: null,
    reasons: reasons3,
    seeProfessional: seeProfessional2,
    missing,
    weightAgeDays: null,
    weightStale: false
  });
  if (i.pregnantOrPostpartum)
    return none(
      "professional",
      [
        "Nutrition needs change during pregnancy and after birth, so we do not give calorie or weight-loss numbers. A midwife, doctor or dietitian can advise you.",
        "Gentle movement and water guidance are still available."
      ],
      true
    );
  if (i.eatingConcern)
    return none(
      "professional",
      [
        "You told us food can feel difficult. We will not show calorie or weight numbers. Support from a doctor or a dietitian who works with eating concerns can help.",
        "You can still use movement, sleep, water and habits."
      ],
      true
    );
  if (i.tracking === "none")
    return none("general", [
      "You chose not to track numbers, so there are no calorie or weight targets. Balanced plates and regular movement are the focus."
    ]);
  const { weightKg, heightCm, ageYears, sex, activity } = i;
  missing = [
    ...weightKg ? [] : ["weight"],
    ...heightCm ? [] : ["height"],
    ...ageYears ? [] : ["age"],
    ...sex ? [] : ["sex"],
    ...activity ? [] : ["activity"]
  ];
  if (!weightKg || !heightCm || !ageYears || !sex || !activity)
    return none("general", [
      `To see an estimate we still need your ${missing.join(", ")}. We never guess these: add them in your profile (one entry is enough, you do not have to track them over time). Until then, a balanced plate and regular movement are a good default.`
    ]);
  if (ageYears < MIN_USER_AGE_YEARS)
    return none("general", ["Locked In Fitness is for adults aged 18 and over."]);
  const reasons2 = [];
  let weekly = 0;
  let seeProfessional = false;
  let withholdGuide = false;
  let surplusCapApplied = false;
  if (i.intent === "lose") {
    if (i.readinessCautious) {
      return none(
        "professional",
        [
          "Your answers suggest checking with a health professional before changing how you eat or move. We start with gentle, low-impact options and no deficit numbers."
        ],
        true
      );
    }
    const target = i.targetKg && i.targetKg > 0 ? i.targetKg : weightKg * (1 - 0.05);
    const ev = evaluateWeightGoal({
      ageYears,
      heightCm,
      currentKg: weightKg,
      targetKg: target,
      plannedWeeklyChangeKg: i.plannedWeeklyChangeKg ?? void 0
    });
    if (ev.status === "block") return none("professional", ev.reasons, true);
    weekly = ev.adjusted?.weeklyChangeKg ?? 0;
    reasons2.push(...ev.reasons.filter((r2) => !r2.startsWith("Progress is not guaranteed")));
  } else if (i.intent === "gain") {
    const L = PROVISIONAL_LIMITS;
    const target = i.targetKg && i.targetKg > weightKg ? i.targetKg : null;
    if (i.readinessCautious) {
      withholdGuide = true;
      seeProfessional = true;
      reasons2.push(
        "Your answers suggest checking with a health professional before changing how you eat or move, so we show your estimated maintenance and no surplus for now."
      );
    } else if (i.readinessUnknown) {
      withholdGuide = true;
      missing = ["safety"];
      reasons2.push(
        "Finish the quick safety questions to see a gain estimate. Your estimated maintenance is shown for now."
      );
    } else {
      const ev = evaluateWeightGoal({
        ageYears,
        heightCm,
        currentKg: weightKg,
        targetKg: target ?? weightKg + 0.01,
        plannedWeeklyChangeKg: i.plannedWeeklyChangeKg && i.plannedWeeklyChangeKg > 0 ? i.plannedWeeklyChangeKg : weightKg * L.suggestedWeeklyGainFraction
      });
      weekly = Math.max(0, ev.adjusted?.weeklyChangeKg ?? 0);
      reasons2.push(
        "Gaining weight: a small daily surplus above your estimated maintenance, at a gentle pace, never more than 10% of maintenance. This ceiling is a conservative provisional choice. It is not clinically validated and has not been reviewed by a dietitian."
      );
      if (bmi(weightKg, heightCm) >= L.bmiNoteForGain || target !== null && bmi(target, heightCm) >= L.bmiNoteForGain) {
        seeProfessional = true;
        reasons2.push(
          "Body mass index (BMI) is only a rough screening number. It cannot see muscle, frame size or body composition, so it does not decide whether this estimate is right for you. Because the best amount and pace can differ from person to person, a doctor or registered dietitian can tailor it. The same 10% ceiling applies."
        );
      }
    }
  } else if (i.intent === "maintain") {
    reasons2.push(
      "Maintaining: the estimate is your estimated maintenance energy, so there is no deficit."
    );
  } else if (i.intent === "strength") {
    reasons2.push(
      "Building strength: the estimate is your estimated maintenance energy, so there is no deficit and no weight target. Eating enough, with protein spread through the day, supports training."
    );
  } else {
    reasons2.push(
      "Improving fitness: the estimate is your estimated maintenance energy to fuel your movement."
    );
  }
  if (weekly > 0) {
    const m = dailyCalorieGuidance({
      weightKg,
      heightCm,
      ageYears,
      sex,
      activity,
      weeklyChangeKg: 0
    }).maintenanceKcal;
    const capWeekly = m * PROVISIONAL_LIMITS.maxSurplusFraction * 7 / 7700;
    if (weekly > capWeekly) {
      weekly = capWeekly;
      surplusCapApplied = true;
    }
  }
  const g = dailyCalorieGuidance({
    weightKg,
    heightCm,
    ageYears,
    sex,
    activity,
    weeklyChangeKg: weekly
  });
  let guide = g.targetKcal;
  if (weekly > 0)
    guide = Math.min(
      guide,
      Math.floor(g.maintenanceKcal * (1 + PROVISIONAL_LIMITS.maxSurplusFraction))
    );
  if (withholdGuide) guide = null;
  if (g.deficitCapApplied)
    reasons2.push(
      `The daily deficit is capped at ${Math.round(PROVISIONAL_LIMITS.maxDeficitFraction * 100)}% of your estimated maintenance.`
    );
  if (g.floorApplied)
    reasons2.push("The guide is never set below your own estimated resting energy.");
  if (surplusCapApplied)
    reasons2.push(
      `The daily surplus is capped at ${Math.round(PROVISIONAL_LIMITS.maxSurplusFraction * 100)}% of your estimated maintenance.`
    );
  if (bmi(weightKg, heightCm) < 18.5 && i.intent === "lose") seeProfessional = true;
  const age = typeof i.weightAgeDays === "number" && i.weightAgeDays >= 0 ? Math.floor(i.weightAgeDays) : null;
  const stale = age !== null && age > STALE_WEIGHT_DAYS;
  if (stale)
    reasons2.push(
      `This estimate uses the weight you recorded about ${age} days ago. It is not a current measurement, so it may be off if your weight has changed. Update your weight whenever you like to refresh it.`
    );
  reasons2.push(
    `Method: Mifflin-St Jeor resting energy (${g.floorKcal} kcal) times an activity factor gives about ${g.maintenanceKcal} kcal to maintain. This is an estimate, not a target you must hit.`,
    "Your usual activity level already includes your regular exercise, so we do not add workout calories on top of this estimate."
  );
  return {
    ...base2,
    mode: "estimate",
    kcal: {
      guide,
      maintenance: g.maintenanceKcal,
      floor: g.floorKcal,
      weeklyChangeKg: guide === null ? 0 : Math.round(weekly * 100) / 100
    },
    proteinG: { low: Math.round(weightKg * 0.8), high: Math.round(weightKg * 1.2) },
    reasons: reasons2,
    seeProfessional,
    missing,
    weightAgeDays: age,
    weightStale: stale
  };
}

// packages/shared/src/wellness.ts
var GOAL_INTENTS = ["lose", "maintain", "fitness", "strength", "gain"];
var GOAL_COMPATIBILITY = {
  lose: ["fitness", "strength"],
  maintain: ["fitness", "strength"],
  gain: ["fitness", "strength"],
  fitness: ["lose", "maintain", "strength", "gain"],
  strength: ["lose", "maintain", "fitness", "gain"]
};
function sanitizeSecondaryGoals(primary, raw) {
  const out = [];
  for (const g of GOAL_INTENTS) {
    if (!raw.includes(g) || g === primary || !GOAL_COMPATIBILITY[primary].includes(g)) continue;
    if (out.some((o) => !GOAL_COMPATIBILITY[o].includes(g))) continue;
    out.push(g);
  }
  return out;
}
var PATHWAY_IDS = [
  "dance_aerobic",
  "balanced_nutrition",
  "strength_training",
  "everyday_movement",
  "cultural_eating",
  "mindful_eating",
  "healthy_habits",
  "weight_maintenance"
];
var STYLE_PREFS = [
  "dancehall",
  "reggae",
  "afrobeats",
  "amapiano",
  "hip_hop",
  "latin",
  "bollywood",
  "soca"
];
var CUISINE_PREFS = CUISINE_IDS;
var MOBILITY_PREFS = ["low_impact", "seated", "balance_support"];
var EXPERIENCE_LEVELS = ["new", "some", "regular"];
var SCHEDULE_PREFS = ["morning", "afternoon", "evening", "varies"];
var ACTIVITY_PREFS = ["dance", "walking", "strength"];
var EQUIPMENT_PREFS = ["none", "dumbbells", "bands"];
var DIET_PREFS = [
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten_free",
  "dairy_free"
];
var CELEBRATION_LEVELS = ["off", "gentle", "full"];
var TRACKING_STYLES = ["detailed", "light", "none"];
var DEFAULT_PREFS = {
  goalIntent: "fitness",
  goalChosen: false,
  exerciseMinutesPerWeek: null,
  activities: ["dance"],
  equipment: ["none"],
  homeItems: [],
  diet: [],
  tracking: "light",
  waterGoalMl: null,
  bedtimeRoutine: null,
  dailyMovementMinutes: null,
  monthlyGoalWeeks: null,
  yearlyGoalWeeks: null,
  celebrations: "full",
  pregnantOrPostpartum: false,
  eatingConcern: false,
  pathways: [],
  danceStyles: [],
  cuisines: [],
  mobility: [],
  experience: null,
  schedule: null,
  secondaryGoals: [],
  weightTracking: null
};
var pick = (v, all) => Array.isArray(v) ? all.filter((x) => v.includes(x)) : [];
var num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
function parsePrefs(raw) {
  const r2 = raw && typeof raw === "object" ? raw : {};
  const intent = GOAL_INTENTS.find((g) => g === r2.goalIntent) ?? DEFAULT_PREFS.goalIntent;
  const tracking = TRACKING_STYLES.find((g) => g === r2.tracking) ?? DEFAULT_PREFS.tracking;
  const acts = pick(r2.activities, ACTIVITY_PREFS);
  const equip = pick(r2.equipment, EQUIPMENT_PREFS);
  const routine = typeof r2.bedtimeRoutine === "string" && r2.bedtimeRoutine.trim() !== "" ? r2.bedtimeRoutine.trim().slice(0, 80) : null;
  return {
    goalIntent: intent,
    goalChosen: r2.goalChosen === true,
    exerciseMinutesPerWeek: num(r2.exerciseMinutesPerWeek, 0, 1e3),
    activities: acts.length > 0 ? acts : DEFAULT_PREFS.activities,
    equipment: equip.length > 0 ? equip : DEFAULT_PREFS.equipment,
    homeItems: pick(r2.homeItems, HOME_ITEM_IDS),
    diet: pick(r2.diet, DIET_PREFS),
    tracking,
    waterGoalMl: num(r2.waterGoalMl, 500, 6e3),
    bedtimeRoutine: routine,
    dailyMovementMinutes: num(r2.dailyMovementMinutes, 1, 600),
    monthlyGoalWeeks: num(r2.monthlyGoalWeeks, 1, 5),
    yearlyGoalWeeks: num(r2.yearlyGoalWeeks, 1, 53),
    celebrations: CELEBRATION_LEVELS.find((g) => g === r2.celebrations) ?? DEFAULT_PREFS.celebrations,
    pregnantOrPostpartum: r2.pregnantOrPostpartum === true,
    eatingConcern: r2.eatingConcern === true,
    pathways: pick(r2.pathways, PATHWAY_IDS),
    danceStyles: pick(r2.danceStyles, STYLE_PREFS),
    cuisines: pick(r2.cuisines, CUISINE_PREFS),
    mobility: pick(r2.mobility, MOBILITY_PREFS),
    experience: EXPERIENCE_LEVELS.find((g) => g === r2.experience) ?? null,
    schedule: SCHEDULE_PREFS.find((g) => g === r2.schedule) ?? null,
    secondaryGoals: sanitizeSecondaryGoals(intent, pick(r2.secondaryGoals, GOAL_INTENTS)),
    weightTracking: typeof r2.weightTracking === "boolean" ? r2.weightTracking : null
  };
}
var numbersHidden = (p) => p.eatingConcern || p.pregnantOrPostpartum || p.tracking === "none";
var WELLNESS_KINDS = [
  "hydration",
  "sleep",
  "walk",
  "strength",
  "measurement",
  "hunger",
  "recovery"
];
var SLEEP_QUALITY = ["rested", "ok", "tired"];
var MEASURE_SITES = ["waist", "hips", "chest", "thigh", "arm"];
var HUNGER_LEVELS = ["hungry", "comfortable", "full"];
var RECOVERY_LEVELS = ["fresh", "ok", "sore", "worn"];
var STRENGTH_KINDS = ["bodyweight", "dumbbells", "bands"];
var LABELS = {
  hydration: null,
  sleep: SLEEP_QUALITY,
  walk: null,
  strength: STRENGTH_KINDS,
  measurement: MEASURE_SITES,
  hunger: HUNGER_LEVELS,
  recovery: RECOVERY_LEVELS
};
var RANGE = {
  hydration: [1, 5e3],
  sleep: [0.5, 16],
  walk: [1, 600],
  strength: [1, 300],
  measurement: [10, 300],
  hunger: [0, 0],
  recovery: [0, 0]
};
function entryProblem(e, today) {
  if (!WELLNESS_KINDS.includes(e.kind)) return "Unknown entry type.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.day)) return "Choose a valid date.";
  if (e.day > addDay(today, 1)) return "That date is in the future.";
  const [lo, hi] = RANGE[e.kind];
  if (!Number.isFinite(e.amount) || e.amount < lo || e.amount > hi)
    return "That amount is outside the usual range.";
  const set = LABELS[e.kind];
  if (set) {
    if (!e.label || !set.includes(e.label)) {
      if (e.kind === "measurement" || e.kind === "hunger" || e.kind === "recovery" || e.label)
        return "Choose one of the listed options.";
    }
  } else if (e.label) return "This entry has no label.";
  if (e.amount2 != null) {
    if (e.kind !== "walk") return "Distance only applies to walks.";
    if (!Number.isFinite(e.amount2) || e.amount2 < 0 || e.amount2 > 100)
      return "Distance is outside the usual range.";
  }
  return null;
}
function addDay(key, n) {
  const d = /* @__PURE__ */ new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
var entriesOf = (list, kind) => list.filter((e) => e.kind === kind);
function wellnessEntryFromRow(row, today) {
  if (!row || typeof row !== "object") return null;
  const r2 = row;
  const amount = Number(r2.amount);
  const amount2 = r2.amount2 == null ? null : Number(r2.amount2);
  const entry = {
    id: String(r2.id ?? ""),
    kind: r2.kind,
    day: String(r2.day ?? ""),
    amount,
    amount2,
    label: typeof r2.label === "string" ? r2.label : null,
    createdAt: String(r2.created_at ?? r2.createdAt ?? "")
  };
  return entryProblem(entry, today) === null ? entry : null;
}
function coachWellnessContext(args) {
  const from = addDay(args.today, -6);
  const entries = args.entries.filter((e) => e.day >= from && e.day <= args.today);
  if (entries.length === 0 && !args.prefs) return void 0;
  const prefs = args.prefs ?? DEFAULT_PREFS;
  const hidden = numbersHidden(prefs);
  const sleep = entriesOf(entries, "sleep");
  const level = entriesOf(entries, "recovery").find((e) => e.day === args.today)?.label;
  return {
    walkMinutesWeek: entriesOf(entries, "walk").reduce((a, e) => a + e.amount, 0),
    strengthSessionsWeek: entriesOf(entries, "strength").length,
    sleepNightsWeek: sleep.length,
    sleepAvgHours: sleep.length >= 3 ? Math.round(sleep.reduce((a, e) => a + e.amount, 0) / sleep.length * 10) / 10 : null,
    recoveryToday: level === "fresh" || level === "ok" || level === "sore" || level === "worn" ? level : null,
    hungerCheckinsWeek: hidden ? 0 : entriesOf(entries, "hunger").length,
    intent: prefs.goalIntent,
    numbersHidden: hidden
  };
}
var WELLNESS_FAIL_CLOSED = {
  walkMinutesWeek: 0,
  strengthSessionsWeek: 0,
  sleepNightsWeek: 0,
  sleepAvgHours: null,
  recoveryToday: null,
  hungerCheckinsWeek: 0,
  intent: null,
  numbersHidden: true
};

// packages/shared/src/weekly.ts
function buildWeekFacts(args) {
  const inWeek = (iso) => weekStartOf(localDateKey(iso, args.timeZone)) === args.weekStart;
  const done2 = args.sessions.filter(
    (s) => s.status === "completed" && s.completedAt && inWeek(s.completedAt)
  );
  const days = new Set(done2.map((s) => localDateKey(s.completedAt, args.timeZone)));
  const wk = (args.wellness ?? []).filter((e) => weekStartOf(e.day) === args.weekStart);
  const walks = entriesOf(wk, "walk");
  const strength = entriesOf(wk, "strength");
  const sleep = new Map(entriesOf(wk, "sleep").map((e) => [e.day, e.amount]));
  for (const e of [...walks, ...strength]) days.add(e.day);
  const foodDays = new Set(
    args.foodLogTimes.filter(inWeek).map((t2) => localDateKey(t2, args.timeZone))
  );
  const sorted = sortByTime(args.weights);
  const near = sorted.filter(
    (w) => Date.parse(w.measuredAt) >= Date.parse(`${args.weekStart}T00:00:00Z`) - 7 * 864e5 && Date.parse(w.measuredAt) < Date.parse(`${args.weekStart}T00:00:00Z`) + 8 * 864e5
  );
  let weightTrend = null;
  if (near.length >= 2) {
    const d = near[near.length - 1].weightKg - near[0].weightKg;
    weightTrend = Math.abs(d) < 0.3 ? "steady" : d < 0 ? "down" : "up";
  }
  return {
    weekStart: args.weekStart,
    sessions: done2.length,
    minutes: done2.reduce((s, x) => s + sessionMinutes(x), 0),
    activeDays: days.size,
    foodLoggedDays: foodDays.size,
    styles: [...new Set(done2.map((s) => s.style).filter((s) => !!s))],
    lowImpactSessions: done2.filter((s) => s.lowImpact).length,
    weightTrend,
    activeGoals: args.activeGoals,
    ...wk.length > 0 && !args.hideWellnessNumbers ? {
      wellness: {
        walkDays: new Set(walks.map((e) => e.day)).size,
        walkMinutes: walks.reduce((a, e) => a + e.amount, 0),
        strengthSessions: strength.length,
        sleepNights: sleep.size,
        sleepAvgHours: sleep.size >= 3 ? Math.round([...sleep.values()].reduce((a, b2) => a + b2, 0) / sleep.size * 10) / 10 : null,
        hungerCheckins: entriesOf(wk, "hunger").length,
        waterLoggedDays: new Set(entriesOf(wk, "hydration").map((e) => e.day)).size
      }
    } : {}
  };
}

// packages/shared/src/instruction-media.ts
var movementId = (workoutId, index) => `${workoutId}:${index}`;

// packages/shared/src/calorie-needs.ts
var readinessState = (outcome) => outcome === "clear" ? "clear" : outcome === "low_impact_and_check_with_professional" ? "cautious" : "unknown";
function effectiveGoalIntent(chosen, activeGoal, goalChosen = false) {
  if (chosen === "fitness" && activeGoal && !goalChosen)
    return activeGoal.type === "maintain" ? "maintain" : activeGoal.type;
  return chosen;
}
function calorieNeeds(input) {
  const { prefs, readiness } = input;
  const intent = effectiveGoalIntent(prefs.goalIntent, input.activeGoal, prefs.goalChosen === true);
  const goalRows = input.activeGoal && input.activeGoal.type === intent ? input.activeGoal : null;
  const target = {
    intent,
    tracking: prefs.tracking,
    weightKg: input.body?.weightKg ?? null,
    weightAgeDays: input.body?.weightAgeDays ?? null,
    heightCm: input.body?.heightCm ?? null,
    ageYears: input.body?.ageYears ?? null,
    sex: input.body?.sex ?? null,
    activity: input.body?.activity ?? null,
    targetKg: goalRows?.targetKg ?? input.body?.targetKg ?? null,
    plannedWeeklyChangeKg: goalRows?.plannedWeeklyChangeKg ?? null,
    pregnantOrPostpartum: prefs.pregnantOrPostpartum,
    eatingConcern: prefs.eatingConcern
  };
  let out;
  if (readiness === "unknown" && intent === "lose") {
    const base2 = nutritionTargets({ ...target, tracking: "none" });
    out = {
      ...base2,
      reasons: ["Finish the quick safety questions to see an estimate."],
      seeProfessional: false,
      // Only when the other facts are all there: a missing weight, height and so on is still reported first.
      missing: base2.missing.length > 0 ? base2.missing : ["safety"]
    };
  } else {
    out = nutritionTargets({
      ...target,
      readinessCautious: readiness === "cautious",
      readinessUnknown: readiness === "unknown"
    });
  }
  return numbersHidden(prefs) ? { ...out, kcal: null, proteinG: null } : out;
}
function pickActiveWeightGoal(goals) {
  const g = [...goals].filter((x) => x.status === "active").sort((a, b2) => a.endDate.localeCompare(b2.endDate))[0];
  return g ? { type: g.type, targetKg: g.targetKg, plannedWeeklyChangeKg: g.plannedWeeklyChangeKg } : null;
}
function calorieNeedsFromRecords(a) {
  return calorieNeeds({
    prefs: a.prefs,
    readiness: readinessState(a.readinessOutcome),
    body: {
      weightKg: a.latestWeightKg,
      weightAgeDays: a.latestWeightAt ? Math.max(0, Math.floor((a.now.getTime() - Date.parse(a.latestWeightAt)) / 864e5)) : null,
      heightCm: a.priv?.heightCm ?? null,
      ageYears: a.priv ? ageYearsOn(a.priv.birthDate, a.now) : null,
      sex: a.priv?.sex ?? null,
      activity: a.priv?.activityLevel ?? null
    },
    activeGoal: pickActiveWeightGoal(a.goals)
  });
}

// packages/shared/src/food-provenance.ts
var PRIORITY_TAGS = new Set(
  Object.values(CUISINES).filter((c) => c.priority === 1).map((c) => c.id)
);

// packages/shared/src/plate-guidance.ts
var PLATE_MODEL = [
  { id: "veg_fruit", share: "about half", label: "Vegetables and fruit" },
  {
    id: "protein",
    share: "about a quarter",
    label: "Protein foods, such as beans, fish, eggs, poultry or tofu"
  },
  { id: "grain", share: "about a quarter", label: "Whole grains or starchy foods" }
];
var PLATE_NOTE = "A general plate picture that works with any cuisine: use the foods you grew up with. It is a guide, not a rule, and not medical advice.";

// packages/shared/src/maintenance.ts
var MAINTENANCE_EDUCATION = [
  "Weight naturally moves up and down by a kilo or two from day to day with water, food timing and sleep. The direction over weeks matters more than any single day.",
  "A calm weekly check-in works better than daily weighing. You can skip weighing altogether and still keep your habits.",
  "Keeping the habits that got you here (movement you enjoy, regular meals, sleep) matters more than any number."
];

// packages/shared/src/community.ts
var COMMUNITY_LIMITS = {
  postChars: 500,
  storyChars: 1500,
  commentChars: 300,
  noteChars: 200,
  postsPerDay: 5,
  commentsPerDay: 30,
  reactionsPerDay: 100,
  reportsPerDay: 10,
  /** A photo post is one photo, or a before-and-after pair. */
  maxPhotos: 2,
  videoSeconds: 30,
  videoMB: 25,
  photoMB: 8,
  /** Different people who must report something before it is hidden pending review. */
  autoHideReports: 3,
  feedPageMax: 30
};
var RESERVED = /* @__PURE__ */ new Set([
  "admin",
  "administrator",
  "moderator",
  "mod",
  "staff",
  "support",
  "official",
  "system",
  "root",
  "null",
  "undefined",
  "anonymous",
  "everyone",
  "deleted",
  "pulse",
  "coach",
  "team",
  "help"
]);
function usernameSkeleton(raw) {
  return raw.toLowerCase().replace(/_/g, "").replace(/rn/g, "m").replace(/vv/g, "w").replace(/[1i|]/g, "l").replace(/0/g, "o").replace(/3/g, "e").replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/7/g, "t").replace(/8/g, "b");
}
var RESERVED_SKELETONS = [...RESERVED].map(usernameSkeleton);
var DAILY = {
  post: COMMUNITY_LIMITS.postsPerDay,
  comment: COMMUNITY_LIMITS.commentsPerDay,
  reaction: COMMUNITY_LIMITS.reactionsPerDay,
  report: COMMUNITY_LIMITS.reportsPerDay
};

// packages/shared/src/community-server.ts
var STATUS = {
  unauthorized: 401,
  forbidden: 403,
  suspended: 403,
  muted: 403,
  not_found: 404,
  rate_limited: 429,
  taken: 409,
  too_similar: 409,
  cooldown: 409,
  unchanged: 409,
  already_set: 409,
  needs_username: 409,
  payload_too_large: 413,
  paused: 503,
  busy: 503,
  media_paused: 503,
  video_disabled: 503,
  comments_disabled: 403,
  too_large: 422,
  too_long: 422,
  wrong_type: 422,
  unreadable: 422,
  has_location: 422,
  too_many_pixels: 422
};
var KNOWN = /* @__PURE__ */ new Set([
  ...Object.keys(STATUS),
  "blocked",
  "not_confirmed",
  "invalid_media",
  "invalid_milestone",
  "invalid_type",
  "invalid_username",
  "invalid_action",
  "own_post",
  "own_content",
  "self",
  "invalid_input"
]);

// packages/shared/src/strength-data.json
var strength_data_default = {
  _notice: "Strength content. Empty on purpose: an exercise or routine may be added only when a qualified, independent reviewer has approved it (see strength.ts and docs/planning/review-packs/STRENGTH_TRAINING.md). Internal test fixtures live in fixtures.ts, never here.",
  exercises: [],
  workouts: []
};

// packages/shared/src/strength.ts
var STRENGTH_EXERCISES = [
  ...strength_data_default.exercises
];
var STRENGTH_WORKOUTS = [...strength_data_default.workouts];

// packages/shared/src/eligible-workouts.ts
var WORKOUT_DUPLICATE_MS = 10 * 6e4;
var IMPORT_SOURCE = "apple_health";
var seconds = (s) => s.durationS && s.durationS > 0 ? s.durationS : Math.max(0, s.minutes) * 60;
var overlaps = (a, b2) => Math.abs(a.start - b2.start) <= WORKOUT_DUPLICATE_MS || a.start >= b2.start - WORKOUT_DUPLICATE_MS && a.start <= b2.end;
function eligibleWorkouts(sessions) {
  const spans = [];
  const seen = /* @__PURE__ */ new Set();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.completedAt || seen.has(s.id)) continue;
    const end = Date.parse(s.completedAt);
    if (!Number.isFinite(end)) continue;
    seen.add(s.id);
    spans.push({ s, end, start: end - seconds(s) * 1e3 });
  }
  spans.sort((a, b2) => a.end - b2.end || a.s.id.localeCompare(b2.s.id));
  const native = spans.filter((x) => x.s.source !== IMPORT_SOURCE);
  const imported = spans.filter((x) => x.s.source === IMPORT_SOURCE);
  const keyOf = (s) => s.workoutId ?? (s.title ? s.title.toLowerCase() : s.id);
  const keptNative = [];
  for (const x of native) {
    const repeat = keptNative.some(
      (o) => keyOf(o.s) === keyOf(x.s) && Math.abs(o.end - x.end) < WORKOUT_DUPLICATE_MS
    );
    if (!repeat) keptNative.push(x);
  }
  const free = imported.filter((a) => !native.some((n) => overlaps(a, n)));
  const keptImported = free.filter(
    (a) => !free.some(
      (b2) => b2 !== a && overlaps(a, b2) && (b2.start < a.start || b2.start === a.start && b2.s.id < a.s.id)
    )
  );
  return [...keptNative, ...keptImported].sort((a, b2) => a.end - b2.end || a.s.id.localeCompare(b2.s.id)).map((x) => x.s);
}

// packages/shared/src/gamification.ts
var localDateKey2 = (iso, timeZone) => {
  const d = new Date(iso);
  try {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(d);
    const get = (t2) => p.find((x) => x.type === t2).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
};
var weekStartOf2 = (dateKey) => {
  const d = /* @__PURE__ */ new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
};
var sessionMinutes2 = (s) => s.durationS && s.durationS > 0 ? Math.max(1, Math.round(s.durationS / 60)) : s.minutes;
var GM = {
  /** XP per started 5 minutes of a counted workout, up to MAX_WORKOUT_MIN minutes. */
  XP_PER_5_MIN: 5,
  MAX_WORKOUT_MIN: 45,
  MIN_WORKOUT_MIN: 5,
  MAX_WORKOUTS_PER_DAY: 2,
  MEAL_LOG_XP: 5,
  HABIT_DAY_XP: 5,
  /** Hard ceilings on action XP (quests and badges are fixed, one-off amounts on top). */
  DAILY_ACTION_XP_CAP: 100,
  WEEKLY_ACTION_XP_CAP: 400,
  /** A day counts toward a streak with this many movement minutes (or one habit tick). */
  STREAK_MIN_MINUTES: 10,
  FREE_MISSES_PER_WEEK: 1,
  /** More than this many minutes of recorded exercise in a day shows a rest nudge. */
  REST_NUDGE_MINUTES: 120,
  MAX_LEVEL: 100
};
var DEFAULT_GM_PREFS = { enabled: true, targetDaysPerWeek: 3, restWeekdays: [0] };
var normalizePrefs = (p) => {
  const t2 = Number(p?.targetDaysPerWeek);
  const rest = Array.isArray(p?.restWeekdays) ? [...new Set(p.restWeekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : DEFAULT_GM_PREFS.restWeekdays;
  return {
    enabled: p?.enabled !== false,
    targetDaysPerWeek: Number.isFinite(t2) ? Math.min(5, Math.max(1, Math.round(t2))) : 3,
    // Never more than 4 planned rest days a week: a plan that is all rest is not a plan.
    restWeekdays: rest.slice(0, 4)
  };
};
var DAY_MS = 864e5;
var addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
var dow = (key) => (/* @__PURE__ */ new Date(`${key}T00:00:00Z`)).getUTCDay();
function countedWorkouts(input) {
  return eligibleWorkouts(input.sessions).map((s) => ({ s, min: sessionMinutes2({ durationS: s.durationS, minutes: s.minutes }) })).filter((x) => x.min >= GM.MIN_WORKOUT_MIN).map(({ s, min }) => ({
    id: s.id,
    day: localDateKey2(s.completedAt, input.timeZone),
    minutes: Math.min(min, 600),
    style: s.style ?? null,
    lowImpact: s.lowImpact === true,
    source: s.source ?? "manual"
  })).sort((a, b2) => a.day.localeCompare(b2.day) || a.id.localeCompare(b2.id));
}
var workoutXp = (minutes) => Math.min(GM.MAX_WORKOUT_MIN, Math.max(0, minutes)) >= GM.MIN_WORKOUT_MIN ? Math.ceil(Math.min(GM.MAX_WORKOUT_MIN, minutes) / 5) * GM.XP_PER_5_MIN : 0;
function actionEvents(input) {
  const workouts = countedWorkouts(input);
  const byDay = /* @__PURE__ */ new Map();
  const push = (e) => byDay.set(e.day, [...byDay.get(e.day) ?? [], e]);
  const perDay = /* @__PURE__ */ new Map();
  for (const w of workouts) {
    const n = perDay.get(w.day) ?? 0;
    perDay.set(w.day, n + 1);
    if (n >= GM.MAX_WORKOUTS_PER_DAY) continue;
    push({ id: `workout:${w.id}`, kind: "workout", day: w.day, xp: workoutXp(w.minutes) });
  }
  for (const day2 of new Set(input.mealLogDays))
    push({ id: `meal:${day2}`, kind: "meal_day", day: day2, xp: GM.MEAL_LOG_XP });
  for (const day2 of new Set(input.habitDays.map((h) => h.day)))
    push({ id: `habit:${day2}`, kind: "habit_day", day: day2, xp: GM.HABIT_DAY_XP });
  const out = [];
  const weekUsed = /* @__PURE__ */ new Map();
  for (const day2 of [...byDay.keys()].sort()) {
    const wk = weekStartOf2(day2);
    let dayLeft = GM.DAILY_ACTION_XP_CAP;
    for (const e of byDay.get(day2).sort((a, b2) => a.id.localeCompare(b2.id))) {
      const weekLeft = GM.WEEKLY_ACTION_XP_CAP - (weekUsed.get(wk) ?? 0);
      const xp = Math.max(0, Math.min(e.xp, dayLeft, weekLeft));
      dayLeft -= xp;
      weekUsed.set(wk, (weekUsed.get(wk) ?? 0) + xp);
      out.push({ ...e, xp });
    }
  }
  return out;
}
var xpToReach = (level) => 50 * level * (level - 1);
function levelOf(xp) {
  const x = Number.isFinite(xp) && xp > 0 ? xp : 0;
  const level = Math.min(GM.MAX_LEVEL, Math.max(1, Math.floor((1 + Math.sqrt(1 + x / 12.5)) / 2)));
  const base2 = xpToReach(level);
  const next = level >= GM.MAX_LEVEL ? base2 : xpToReach(level + 1);
  const span = Math.max(1, next - base2);
  return {
    level,
    xpInto: x - base2,
    xpForNext: next - base2,
    fraction: level >= GM.MAX_LEVEL ? 1 : Math.min(1, (x - base2) / span)
  };
}
function activeDaySet(input) {
  const days = /* @__PURE__ */ new Set();
  const minutes = /* @__PURE__ */ new Map();
  for (const w of countedWorkouts(input)) minutes.set(w.day, (minutes.get(w.day) ?? 0) + w.minutes);
  for (const [d, m] of minutes) if (m >= GM.STREAK_MIN_MINUTES) days.add(d);
  for (const h of input.habitDays) days.add(h.day);
  return days;
}
function streakInfo(input) {
  const prefs = normalizePrefs(input.prefs);
  const active = activeDaySet(input);
  const rest = new Set(prefs.restWeekdays);
  const sorted = [...active].sort();
  const first = sorted[0];
  let current = 0;
  let longest = 0;
  const forgivenIn = /* @__PURE__ */ new Map();
  if (first) {
    for (let d = first; d <= input.today; d = addDays(d, 1)) {
      if (active.has(d)) {
        current += 1;
        longest = Math.max(longest, current);
      } else if (rest.has(dow(d)) || d === input.today) {
      } else {
        const wk = weekStartOf2(d);
        const used = forgivenIn.get(wk) ?? 0;
        if (used < GM.FREE_MISSES_PER_WEEK) forgivenIn.set(wk, used + 1);
        else current = 0;
      }
    }
  }
  const restToday = rest.has(dow(input.today));
  const todayKind = active.has(input.today) ? "active" : restToday ? "rest" : "open";
  const wkStart = weekStartOf2(input.today);
  let activeDaysThisWeek = 0;
  for (let i = 0; i < 7; i++) if (active.has(addDays(wkStart, i))) activeDaysThisWeek += 1;
  return {
    current,
    longest,
    todayKind,
    isPlannedRestToday: restToday,
    activeDaysThisWeek,
    targetDays: prefs.targetDaysPerWeek
  };
}
function restNudge(input) {
  return countedWorkouts(input).filter((w) => w.day === input.today).reduce((n, w) => n + w.minutes, 0) >= GM.REST_NUDGE_MINUTES;
}
var DAILY_POOL = ["move_10", "habit_tick", "log_a_meal", "gentle_session"];
var hash = (s) => [...s].reduce((h, c) => h * 31 + c.charCodeAt(0) >>> 0, 7);
function dailyQuests(input) {
  const day2 = input.today;
  const eligible = DAILY_POOL.filter(
    (q) => q === "habit_tick" ? input.activeHabitCount > 0 : true
  );
  const start = hash(day2) % eligible.length;
  const picked = [0, 1, 2].map((i) => eligible[(start + i) % eligible.length]).filter((q, i, a) => a.indexOf(q) === i);
  const workouts = countedWorkouts(input).filter((w) => w.day === day2);
  const mins = workouts.reduce((n, w) => n + w.minutes, 0);
  const progress = (q) => {
    switch (q) {
      case "move_10":
        return [Math.min(mins, 10), 10];
      case "habit_tick":
        return [input.habitDays.some((h) => h.day === day2) ? 1 : 0, 1];
      case "log_a_meal":
        return [input.mealLogDays.includes(day2) ? 1 : 0, 1];
      case "gentle_session":
        return [
          workouts.some((w) => w.lowImpact || /stretch|mobility|yoga|walk/i.test(w.style ?? "")) ? 1 : 0,
          1
        ];
      default:
        return [0, 1];
    }
  };
  return picked.map((id) => {
    const [p, goal] = progress(id);
    return { id, period: "daily", periodKey: day2, progress: p, goal, done: p >= goal, xp: 10 };
  });
}
function weeklyQuests(input) {
  const wk = weekStartOf2(input.today);
  const target = normalizePrefs(input.prefs).targetDaysPerWeek;
  const active = activeDaySet(input);
  let days = 0;
  for (let i = 0; i < 7; i++) if (active.has(addDays(wk, i))) days += 1;
  const styles = new Set(
    countedWorkouts(input).filter((w) => weekStartOf2(w.day) === wk && w.style).map((w) => w.style)
  );
  return [
    {
      id: "active_days_target",
      period: "weekly",
      periodKey: wk,
      progress: Math.min(days, target),
      goal: target,
      done: days >= target,
      xp: 30
    },
    {
      id: "try_two_styles",
      period: "weekly",
      periodKey: wk,
      progress: Math.min(styles.size, 2),
      goal: 2,
      done: styles.size >= 2,
      xp: 20
    }
  ];
}
var questEventId = (q) => `quest:${q.periodKey}:${q.id}`;
function questEvents(input, lookbackDays = 60) {
  const out = [];
  const seenWeeks = /* @__PURE__ */ new Set();
  for (let i = lookbackDays; i >= 0; i--) {
    const day2 = addDays(input.today, -i);
    const at = { ...input, today: day2 };
    for (const q of dailyQuests(at))
      if (q.done) out.push({ id: questEventId(q), kind: "quest", day: day2, xp: q.xp });
    const wk = weekStartOf2(day2);
    if (!seenWeeks.has(wk) && addDays(wk, 6) <= input.today) {
      seenWeeks.add(wk);
      for (const q of weeklyQuests({ ...input, today: addDays(wk, 6) }))
        if (q.done) out.push({ id: questEventId(q), kind: "quest", day: addDays(wk, 6), xp: q.xp });
    }
  }
  for (const q of weeklyQuests(input))
    if (q.done && !out.some((e) => e.id === questEventId(q)))
      out.push({ id: questEventId(q), kind: "quest", day: input.today, xp: q.xp });
  return dedupe(out);
}
function dedupe(events) {
  const seen = /* @__PURE__ */ new Set();
  return events.filter((e) => seen.has(e.id) ? false : (seen.add(e.id), true));
}
function seasonFor(today) {
  const y = today.slice(0, 4);
  const m = Number(today.slice(5, 7));
  const table = [
    [3, 5, "bloom", "cosmetic_flower", 18, `${y}-03-01`],
    [6, 8, "sun", "cosmetic_sunglasses", 20, `${y}-06-01`],
    [9, 11, "harvest", "cosmetic_scarf", 18, `${y}-09-01`]
  ];
  for (const [a, b2, name, cosmetic, goal, from] of table)
    if (m >= a && m <= b2)
      return {
        id: `${name}-${y}`,
        from,
        to: addDays(`${y}-${String(b2 + 1).padStart(2, "0")}-01`, -1),
        goalDays: goal,
        cosmetic
      };
  const winterYear = m === 12 ? Number(y) : Number(y) - 1;
  return {
    id: `frost-${winterYear}`,
    from: `${winterYear}-12-01`,
    to: addDays(`${winterYear + 1}-03-01`, -1),
    goalDays: 20,
    cosmetic: "cosmetic_beanie"
  };
}
function seasonProgress(input) {
  const season = seasonFor(input.today);
  let n = 0;
  for (const d of activeDaySet(input)) if (d >= season.from && d <= season.to) n += 1;
  return { season, activeDays: n, done: n >= season.goalDays };
}
var COSMETICS = [
  { id: "cosmetic_headband", needs: { level: 3 } },
  { id: "cosmetic_wristbands", needs: { level: 6 } },
  { id: "cosmetic_cape", needs: { level: 10 } },
  { id: "cosmetic_flower", needs: { season: true } },
  { id: "cosmetic_sunglasses", needs: { season: true } },
  { id: "cosmetic_scarf", needs: { season: true } },
  { id: "cosmetic_beanie", needs: { season: true } }
];
function computeGamification(raw) {
  const input = { ...raw, prefs: normalizePrefs(raw.prefs) };
  const streak = streakInfo(input);
  const seasonal = seasonProgress(input);
  const base2 = dedupe([...actionEvents(input), ...questEvents(input)]);
  const questCount = base2.filter((e) => e.kind === "quest").length;
  const levelNoBadges = levelOf(base2.reduce((n, e) => n + e.xp, 0)).level;
  const badges = [];
  if (levelNoBadges >= 5) badges.push("level_5");
  if (levelNoBadges >= 10) badges.push("level_10");
  if (streak.longest >= 7) badges.push("streak_7");
  if (streak.longest >= 30) badges.push("streak_30");
  if (questCount >= 10) badges.push("quests_10");
  if (input.prefs.restWeekdays.length > 0 && streak.longest >= 14) badges.push("rest_respected");
  if (seasonal.done) badges.push("season_finisher");
  const badgeEvents = badges.map((b2) => ({
    id: `badge:${b2}`,
    kind: "badge",
    day: input.today,
    xp: 25
  }));
  const events = dedupe([...base2, ...badgeEvents]);
  const totalXp = events.reduce((n, e) => n + e.xp, 0);
  const level = levelOf(totalXp);
  const cosmetics = COSMETICS.filter(
    (c) => (c.needs.level ? level.level >= c.needs.level : false) || c.needs.season && c.id === seasonal.season.cosmetic && seasonal.done
  ).map((c) => c.id);
  const wk = weekStartOf2(input.today);
  const weekXp = events.filter((e) => e.kind !== "badge" && weekStartOf2(e.day) === wk).reduce((n, e) => n + e.xp, 0);
  return {
    enabled: input.prefs.enabled,
    events,
    totalXp,
    level,
    streak,
    restNudge: restNudge(input),
    dailyQuests: dailyQuests(input),
    weeklyQuests: weeklyQuests(input),
    badges,
    seasonal,
    cosmetics,
    weekXp
  };
}

// packages/shared/src/pathways.ts
var CUISINE_LABELS = Object.fromEntries(
  Object.values(CUISINES).map((c) => [c.id, c.label])
);

// packages/shared/src/draft-packs.ts
var NEEDS_MUSIC = "A licensed or royalty-free track at the target tempo, with its licence recorded (none is included).";
var NEEDS_FITNESS = "Independent review by an exercise professional, strength coach or physiotherapist.";
var NEEDS_AUTHOR = "A credited author or choreographer and a signed rights agreement.";
var NEEDS_TEMPO = "The practitioners confirm the tempo range by dancing it.";
var NEEDS_CULTURE = "A cultural review by qualified practitioners of the style.";
var draft = (pack, extra = []) => ({
  pack,
  needs: [NEEDS_AUTHOR, NEEDS_FITNESS, NEEDS_MUSIC, ...extra]
});
var b = (kind, title, seconds2, cue, lowImpactAlt, seatedAlt) => ({
  kind,
  title,
  seconds: seconds2,
  cue,
  lowImpactAlt,
  ...seatedAlt ? { seatedAlt } : {}
});
var SAFETY = [
  "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
  "Keep your movements within what is comfortable; you should be able to talk while you move."
];
var SAFETY_SEATED = [
  "Use a sturdy chair without wheels, on a non-slip floor, with both feet flat on the floor.",
  ...SAFETY
];
var DRAFT_NOTE = "Draft, not reviewed.";
var base = (id, title, style, minutes, extra) => ({
  id,
  title,
  style,
  level: "beginner",
  minutes,
  impact: "low",
  instructorId: null,
  equipment: "none",
  contentOrigin: "original_text",
  safety: SAFETY,
  ...extra
});
var DANCEHALL = "dancehall-foundations";
var REGGAE = "reggae-flow";
var CHAIR = "chair-dance";
var LOW = "low-impact-dance";
var STRENGTH = "beginner-strength";
var DRAFT_WORKOUTS = [
  base("draft-dancehall-foundations-10", "Dancehall Foundations", "dancehall", 10, {
    summary: `Ten minutes of bounce, side step and hip rock, built up one step at a time. ${DRAFT_NOTE}`,
    intensity: "moderate",
    tempoBpm: [90, 102],
    draft: draft(DANCEHALL, [NEEDS_TEMPO, NEEDS_CULTURE]),
    blocks: [
      b(
        "warmup",
        "Weight shifts and shoulder rolls",
        45,
        "Stand with your feet a little wider than your hips. Shift your weight slowly from one foot to the other and roll your shoulders back.",
        "Keep the shifts small and stay close to a wall or chair for balance."
      ),
      b(
        "warmup",
        "Knee bends and arm circles",
        45,
        "Bend your knees gently a few times, then circle your arms forward and back, slowly getting a little bigger.",
        "Bend only a little and keep the arm circles small."
      ),
      b(
        "main",
        "Easy bounce",
        90,
        "Soften your knees and bounce gently in time with the music, heels staying close to the floor. Let your arms hang loose and swing a little.",
        "Do a slow weight shift instead of the bounce."
      ),
      b(
        "main",
        "Side-to-side step",
        90,
        "Step to the right and bring your feet together, then step to the left. Keep your knees soft and let your arms follow the step.",
        "Take smaller steps and keep one foot on the floor."
      ),
      b(
        "main",
        "Hip rock",
        90,
        "Rock your hips gently forward and back while your chest stays tall and your knees stay soft. Keep it relaxed rather than big.",
        "Make the rock very small and hold a chair for balance."
      ),
      b(
        "main",
        "Put it together",
        150,
        "Link what you have learned: four bounces, four steps to the side, then four hip rocks. Repeat, and keep your shoulders relaxed.",
        "Do the same pattern with smaller movements and a slower pace."
      ),
      b(
        "cooldown",
        "Slow sway and breathing",
        45,
        "Slow right down to a gentle sway. Breathe in through your nose and out through your mouth.",
        "Sway very slightly, or stand still and breathe."
      ),
      b(
        "cooldown",
        "Stretch",
        45,
        "Hold a calf stretch, a hip stretch and a shoulder stretch for about fifteen seconds each, without bouncing.",
        "Do the stretches standing at a wall, or seated."
      )
    ]
  }),
  base("draft-dancehall-builder-15", "Dancehall Cardio Builder", "dancehall", 15, {
    summary: `Fifteen minutes that add a quarter turn and a longer routine to the foundations. ${DRAFT_NOTE}`,
    intensity: "moderate",
    tempoBpm: [90, 102],
    draft: draft(DANCEHALL, [NEEDS_TEMPO, NEEDS_CULTURE]),
    blocks: [
      b(
        "warmup",
        "March and reach",
        60,
        "March in place, swinging your arms, and reach overhead every fourth step.",
        "March more slowly, and keep your arms low."
      ),
      b(
        "warmup",
        "Hip circles and side bends",
        60,
        "Make slow hip circles in each direction, then bend gently from side to side.",
        "Keep the circles small and hold a chair or wall."
      ),
      b(
        "main",
        "Warm bounce",
        132,
        "Bounce gently with soft knees, letting your arms swing loosely. Stay light on your feet.",
        "Replace the bounce with a slow weight shift."
      ),
      b(
        "main",
        "Step and sweep",
        132,
        "Step to the side and sweep your arm across your body as you bring your feet together. Alternate sides.",
        "Step without the sweep, or sweep your arm only to chest height."
      ),
      b(
        "main",
        "Hip rock and knee bend",
        132,
        "Add a deeper knee bend to the hip rock. Keep your chest tall and your weight over both feet.",
        "Keep the knee bend shallow."
      ),
      b(
        "main",
        "Quarter-turn pattern",
        132,
        "Do four bounces, four steps to the side and a quarter turn, then repeat so that you face each wall in turn.",
        "Skip the turn and repeat the pattern facing the front."
      ),
      b(
        "main",
        "Full routine run-through",
        132,
        "Put every part together and run it through at an easy pace. Keep breathing and keep your shoulders loose.",
        "Run through it at half effort with smaller movements."
      ),
      b(
        "cooldown",
        "Slow walk and breathing",
        60,
        "Walk slowly in place and breathe in through your nose, out through your mouth, until your breathing settles.",
        "Stand still, or sit, and breathe slowly."
      ),
      b(
        "cooldown",
        "Stretch",
        60,
        "Hold a calf, front-of-thigh and chest stretch for about twenty seconds each, without bouncing.",
        "Do the stretches seated or at a wall."
      )
    ]
  }),
  base("draft-reggae-sway-10", "Reggae Sway Flow", "reggae", 10, {
    summary: `A slow, steady ten minutes of sway, weight shift and relaxed arm movement. ${DRAFT_NOTE}`,
    intensity: "low",
    tempoBpm: [70, 85],
    draft: draft(REGGAE, [NEEDS_TEMPO, NEEDS_CULTURE]),
    blocks: [
      b(
        "warmup",
        "Breathe and roll",
        60,
        "Stand tall, breathe slowly and roll your shoulders and neck gently.",
        "Do the same seated, or standing at a wall."
      ),
      b(
        "warmup",
        "Slow weight shift",
        60,
        "Shift your weight from foot to foot in time with the music. Let your arms hang and your knees stay soft.",
        "Keep the shift very small."
      ),
      b(
        "main",
        "Side sway",
        90,
        "Sway from side to side, letting your hips lead and your shoulders follow.",
        "Sway in a smaller range and keep both feet planted."
      ),
      b(
        "main",
        "Step and lean",
        90,
        "Step to one side, lean your upper body gently the same way, then return. Keep your movements loose and slow.",
        "Lean less and keep your feet closer together."
      ),
      b(
        "main",
        "Arm lifts on the off-beat",
        90,
        "Keep your steps steady and lift your hands lightly in between the main beats, as though you are bringing the sound up with you.",
        "Lift your hands only to waist height."
      ),
      b(
        "main",
        "Flow it together",
        90,
        "Link the sway, the step and lean, and the arm lifts, moving smoothly from one to the next.",
        "Link them with smaller movements and a slower pace."
      ),
      b(
        "cooldown",
        "Settle",
        30,
        "Let your movement slow to a gentle sway and let your breathing slow with it.",
        "Stand still and breathe slowly."
      ),
      b(
        "cooldown",
        "Stretch",
        90,
        "Hold a neck, shoulder, hip and calf stretch for about twenty seconds each, without bouncing.",
        "Do the stretches seated."
      )
    ]
  }),
  base("draft-reggae-groove-15", "Reggae Steady Groove", "reggae", 15, {
    summary: `Fifteen minutes of steady grooving with slow turns and longer flowing patterns. ${DRAFT_NOTE}`,
    intensity: "low",
    tempoBpm: [70, 85],
    draft: draft(REGGAE, [NEEDS_TEMPO, NEEDS_CULTURE]),
    blocks: [
      b(
        "warmup",
        "Breathe and sway",
        90,
        "Stand tall and breathe slowly while you sway gently. Roll your shoulders and loosen your arms.",
        "Do this seated or standing at a wall."
      ),
      b(
        "warmup",
        "Hip and knee warm-up",
        90,
        "Make slow hip circles, then bend and straighten your knees gently, getting a little deeper each time.",
        "Keep the movements small and hold a chair."
      ),
      b(
        "main",
        "Side sway",
        150,
        "Sway from side to side, letting your hips lead and your shoulders follow.",
        "Sway in a smaller range with both feet planted."
      ),
      b(
        "main",
        "Step, lean and return",
        150,
        "Step to one side and lean your upper body the same way, then return to the middle. Repeat on the other side.",
        "Lean less and take smaller steps."
      ),
      b(
        "main",
        "Slow turn",
        150,
        "Add a slow quarter turn after each pair of steps, so that you gradually face each wall in turn.",
        "Skip the turn and stay facing the front."
      ),
      b(
        "main",
        "Arms and hips together",
        150,
        "Combine the arm lifts between the beats with the hip sway, keeping everything loose and relaxed.",
        "Keep your arms low and your hips still, or the other way round."
      ),
      b(
        "cooldown",
        "Slow walk and breathing",
        60,
        "Walk slowly in place and breathe in through your nose, out through your mouth.",
        "Stand still or sit and breathe slowly."
      ),
      b(
        "cooldown",
        "Stretch",
        60,
        "Hold a calf, hip and shoulder stretch for about twenty seconds each, without bouncing.",
        "Do the stretches seated."
      )
    ]
  }),
  base("draft-chair-dance-5", "Chair Dance Quick Start", "chair_dance", 5, {
    summary: `Five minutes of seated rhythm for the upper body, hips and feet. ${DRAFT_NOTE}`,
    intensity: "low",
    tempoBpm: [90, 105],
    seatedSuitable: true,
    safety: SAFETY_SEATED,
    draft: draft(CHAIR, [NEEDS_TEMPO]),
    blocks: [
      b(
        "warmup",
        "Sit tall and roll",
        60,
        "Sit tall with your feet flat. Roll your shoulders back and turn your head gently from side to side.",
        "Make the rolls smaller and slower."
      ),
      b(
        "main",
        "Seated bounce and arm swing",
        90,
        "Press through your feet and bounce your heels lightly in time with the music while your arms swing from side to side.",
        "Tap your toes and keep your arms low."
      ),
      b(
        "main",
        "Hip sway and reach",
        90,
        "Sway your hips from side to side on the chair and reach each arm out in turn.",
        "Sway less and reach only to chest height."
      ),
      b(
        "cooldown",
        "Slow sway and breathing",
        30,
        "Slow your movement to a gentle sway and breathe in through your nose and out through your mouth.",
        "Sit still and breathe slowly."
      ),
      b(
        "cooldown",
        "Seated stretch",
        30,
        "Reach your arms overhead, then hug yourself and turn gently to each side.",
        "Keep your arms low and turn only a little."
      )
    ]
  }),
  base("draft-chair-dance-10", "Chair Dance Groove", "chair_dance", 10, {
    summary: `Ten minutes of seated dance that builds from simple taps to a full routine. ${DRAFT_NOTE}`,
    intensity: "low",
    tempoBpm: [90, 105],
    seatedSuitable: true,
    safety: SAFETY_SEATED,
    draft: draft(CHAIR, [NEEDS_TEMPO]),
    blocks: [
      b(
        "warmup",
        "Sit tall and breathe",
        60,
        "Sit tall with your feet flat. Breathe in as you lift your arms, and out as you lower them.",
        "Lift your arms only halfway."
      ),
      b(
        "warmup",
        "Shoulder and ankle rolls",
        60,
        "Roll your shoulders back, then lift one foot and circle your ankle in each direction before switching feet.",
        "Roll your shoulders only, and keep both feet down."
      ),
      b(
        "main",
        "Toe and heel taps",
        90,
        "Tap your toes, then your heels, in time with the music. Let your arms move naturally.",
        "Tap slowly and keep your arms still."
      ),
      b(
        "main",
        "Seated step-out",
        90,
        "Slide one foot out to the side and back in, alternating feet, while your shoulders sway the other way.",
        "Slide the foot out only a short way."
      ),
      b(
        "main",
        "Hip sway and arm reach",
        90,
        "Sway your hips side to side on the chair and reach each arm out in turn, following your hand with your eyes.",
        "Keep the sway small and your arms low."
      ),
      b(
        "main",
        "Seated routine",
        90,
        "Link the taps, the step-out and the sway: eight taps, eight step-outs, eight sways. Repeat at an easy pace.",
        "Do four of each instead of eight."
      ),
      b(
        "cooldown",
        "Slow sway and breathing",
        60,
        "Slow to a gentle sway and breathe in through your nose, out through your mouth.",
        "Sit still and breathe slowly."
      ),
      b(
        "cooldown",
        "Seated stretch",
        60,
        "Reach your arms overhead, hug yourself and turn gently to each side, then stretch each leg out in front of you.",
        "Keep the stretches gentle and stop at the first feeling of stretch."
      )
    ]
  }),
  base("draft-chair-dance-15", "Chair Dance Energy", "chair_dance", 15, {
    summary: `Fifteen minutes of seated dance with longer patterns and more upper-body movement. ${DRAFT_NOTE}`,
    intensity: "moderate",
    tempoBpm: [90, 110],
    seatedSuitable: true,
    safety: SAFETY_SEATED,
    draft: draft(CHAIR, [NEEDS_TEMPO]),
    blocks: [
      b(
        "warmup",
        "Sit tall and roll",
        90,
        "Sit tall, roll your shoulders and neck, and breathe slowly.",
        "Make every movement smaller."
      ),
      b(
        "warmup",
        "Marching and arm swings",
        90,
        "March your feet on the spot while seated and swing your arms gently.",
        "March slowly with your arms low."
      ),
      b(
        "main",
        "Seated bounce",
        150,
        "Press through your feet and bounce your heels in time with the music, with your arms swinging from side to side.",
        "Tap your toes instead of bouncing."
      ),
      b(
        "main",
        "Step-out and arm sweep",
        150,
        "Slide one foot out to the side and sweep the opposite arm across your body. Alternate sides.",
        "Slide the foot out only a short way and keep your arms low."
      ),
      b(
        "main",
        "Twist and reach",
        150,
        "Turn your upper body to one side and reach, then turn to the other. Keep your hips facing forward.",
        "Turn less and reach only to chest height."
      ),
      b(
        "main",
        "Full seated routine",
        150,
        "Link the bounce, the step-out and the twist into one longer pattern and repeat it, keeping your breathing easy.",
        "Do half the repeats at a slower pace."
      ),
      b(
        "cooldown",
        "Slow sway and breathing",
        60,
        "Slow to a gentle sway and breathe slowly until your breathing settles.",
        "Sit still and breathe slowly."
      ),
      b(
        "cooldown",
        "Seated stretch",
        60,
        "Reach overhead, hug yourself and turn to each side, then stretch each leg out in front of you.",
        "Keep the stretches gentle."
      )
    ]
  }),
  base("draft-low-impact-groove-10", "Low-Impact Dance Groove", "low_impact", 10, {
    summary: `Ten gentle minutes of dance with no jumping, which can also be done seated. ${DRAFT_NOTE}`,
    intensity: "low",
    tempoBpm: [85, 105],
    seatedSuitable: true,
    safety: SAFETY_SEATED,
    draft: draft(LOW),
    blocks: [
      b(
        "warmup",
        "Roll and breathe",
        60,
        "Stand tall. Roll your shoulders and neck, and breathe slowly.",
        "Make the rolls smaller.",
        "Sit tall and do the same rolls."
      ),
      b(
        "warmup",
        "Slow march",
        60,
        "March gently in place and swing your arms.",
        "March more slowly and keep your arms low.",
        "March your feet on the floor while seated."
      ),
      b(
        "main",
        "Step-touch",
        90,
        "Step to the side and bring your other foot in to touch, then go back the other way, with your arms swinging easily.",
        "Take smaller steps and keep your arms low.",
        "Slide one foot out and back, alternating, while seated."
      ),
      b(
        "main",
        "Hip sway",
        90,
        "Sway your hips from side to side with soft knees and relaxed shoulders.",
        "Keep the sway small and hold a chair.",
        "Sway your hips on the chair."
      ),
      b(
        "main",
        "Arm reaches",
        90,
        "Reach one arm out and across, then the other, keeping your steps small and easy.",
        "Reach only to chest height.",
        "Reach one arm at a time while seated."
      ),
      b(
        "main",
        "Easy routine",
        90,
        "Link the step-touch, the sway and the reaches: eight of each, then repeat at an easy pace.",
        "Do four of each.",
        "Do the same pattern seated, with four of each."
      ),
      b(
        "cooldown",
        "Slow down",
        60,
        "Slow your movement and breathe in through your nose, out through your mouth.",
        "Stand still and breathe slowly.",
        "Sit still and breathe slowly."
      ),
      b(
        "cooldown",
        "Stretch",
        60,
        "Reach overhead and hold a calf stretch and a shoulder stretch for about fifteen seconds each.",
        "Do the stretches at a wall.",
        "Do the shoulder stretch and reach overhead, seated."
      )
    ]
  })
];
var sNeeds = (extra = []) => ({
  pack: STRENGTH,
  needs: [
    NEEDS_FITNESS,
    "The strength coach or physiotherapist confirms the sets, repetitions, rest and progression for beginners.",
    ...extra
  ]
});
var sx = (id, name, pattern, cues, regression, progression, safety) => ({
  id,
  name,
  pattern,
  equipment: "none",
  cues,
  regression,
  progression,
  safety,
  contentOrigin: "original_text",
  review: "unreviewed",
  reviewer: null,
  draft: sNeeds()
});
var DRAFT_STRENGTH_EXERCISES = [
  sx(
    "draft-sit-to-stand",
    "Chair sit-to-stand",
    "squat",
    [
      "Sit near the front of a sturdy chair with your feet about hip-width apart.",
      "Lean slightly forward and stand up, pressing through your whole foot.",
      "Sit back down slowly and with control."
    ],
    "Use a higher seat, or push gently on your thighs to help you stand.",
    "Lower yourself more slowly, taking about three seconds to sit.",
    ["Stop if you feel pain in your knees or hips, or feel dizzy."]
  ),
  sx(
    "draft-wall-push-up",
    "Wall push-up",
    "push",
    [
      "Stand an arm\u2019s length from a wall with your hands on it at chest height, a little wider than your shoulders.",
      "Bend your elbows to bring your chest toward the wall, keeping your body in a straight line.",
      "Press back to the start."
    ],
    "Stand closer to the wall and bend your elbows less.",
    "Stand further from the wall, or use a sturdy countertop.",
    ["Stop if you feel pain in your shoulders, wrists or elbows."]
  ),
  sx(
    "draft-glute-bridge",
    "Glute bridge",
    "hinge",
    [
      "Lie on your back with your knees bent and your feet flat on the floor.",
      "Press through your feet and lift your hips until your body is in a line from shoulders to knees.",
      "Lower slowly."
    ],
    "Lift your hips only a short way, and pause briefly at the top.",
    "Hold the top position for three seconds before lowering.",
    ["Stop if you feel pain in your lower back, and keep your neck relaxed."]
  ),
  sx(
    "draft-bird-dog",
    "Bird-dog",
    "core",
    [
      "Start on your hands and knees with your back flat.",
      "Slide one leg straight back and reach the opposite arm forward.",
      "Return to the start and switch sides."
    ],
    "Lift only an arm, or only a leg, at a time.",
    "Hold each lift for three seconds.",
    ["Stop if you feel pain in your wrists, knees or lower back."]
  ),
  sx(
    "draft-hip-hinge",
    "Standing hip hinge",
    "hinge",
    [
      "Stand with your feet hip-width apart and your hands on your thighs.",
      "Push your hips back with a flat back and slide your hands down toward your knees.",
      "Squeeze your hips forward to stand tall."
    ],
    "Hinge only a short way, with your hands on a counter or chair back.",
    null,
    ["Stop if you feel pain in your lower back or the back of your knees."]
  ),
  sx(
    "draft-supported-split-squat",
    "Supported split squat",
    "lunge",
    [
      "Hold a counter or chair back and step one foot back.",
      "Bend both knees to lower a short way, keeping your chest tall.",
      "Press through your front foot to stand and repeat before switching legs."
    ],
    "Take a shorter step and lower only a little.",
    "Lower a little further, still holding the support.",
    ["Stop if you feel pain in your knees or hips, and always keep a hand on the support."]
  ),
  sx(
    "draft-dead-bug",
    "Dead bug",
    "core",
    [
      "Lie on your back with your knees bent over your hips and your arms reaching up.",
      "Slowly lower one arm and the opposite leg toward the floor, keeping your lower back gently pressed down.",
      "Return and switch sides, counting one repetition for each side."
    ],
    "Lower only the arm, or tap one foot to the floor and back.",
    "Lower the arm and leg further.",
    ["Stop if you feel pain in your lower back or neck."]
  )
];
var sw = (id, title, minutes, blocks, warmup, cooldown) => ({
  id,
  title,
  level: "beginner",
  minutes,
  equipment: "none",
  warmup,
  cooldown,
  blocks,
  safety: [
    "Stop if you feel chest pain, dizziness or unusual shortness of breath, and speak to a health professional.",
    "Some effort is normal, but sharp or joint pain is not: stop that exercise and use the easier version or skip it."
  ],
  contentOrigin: "original_text",
  review: "unreviewed",
  reviewer: null,
  draft: sNeeds()
});
var DRAFT_STRENGTH_WORKOUTS = [
  sw(
    "draft-strength-beginner-full-body",
    "Beginner Strength: Full Body",
    14,
    [
      { exerciseId: "draft-sit-to-stand", sets: 2, reps: 8, seconds: null, restSeconds: 45 },
      { exerciseId: "draft-wall-push-up", sets: 2, reps: 8, seconds: null, restSeconds: 45 },
      { exerciseId: "draft-glute-bridge", sets: 2, reps: 10, seconds: null, restSeconds: 45 },
      { exerciseId: "draft-bird-dog", sets: 2, reps: 6, seconds: null, restSeconds: 45 }
    ],
    {
      title: "Warm-up",
      seconds: 120,
      cue: "March gently in place, roll your shoulders and circle your hips. Build up slowly."
    },
    {
      title: "Cool-down",
      seconds: 120,
      cue: "Slow your breathing. Hold a calf, hip and chest stretch for about twenty seconds each."
    }
  ),
  sw(
    "draft-strength-beginner-lower-core",
    "Beginner Strength: Legs and Core",
    12,
    [
      { exerciseId: "draft-sit-to-stand", sets: 2, reps: 8, seconds: null, restSeconds: 45 },
      { exerciseId: "draft-hip-hinge", sets: 2, reps: 8, seconds: null, restSeconds: 45 },
      {
        exerciseId: "draft-supported-split-squat",
        sets: 2,
        reps: 6,
        seconds: null,
        restSeconds: 45
      },
      { exerciseId: "draft-dead-bug", sets: 2, reps: 6, seconds: null, restSeconds: 45 }
    ],
    {
      title: "Warm-up",
      seconds: 120,
      cue: "March gently in place, roll your shoulders and circle your hips. Build up slowly."
    },
    {
      title: "Cool-down",
      seconds: 120,
      cue: "Slow your breathing. Hold a calf, hip and chest stretch for about twenty seconds each."
    }
  )
];

// packages/shared/src/home-exercises.ts
var NEEDS = {
  pack: "use-what-you-have",
  needs: [
    "Independent review by an exercise professional, strength coach or physiotherapist.",
    "The reviewer confirms the household-item limits, the repetitions and the easier versions for beginners."
  ]
};
var hx = (id, name, pattern, level, household, cues, regression, progression, safety, o = {}) => ({
  id,
  name,
  pattern,
  equipment: "none",
  cues,
  regression,
  progression,
  safety: [safety],
  contentOrigin: "original_text",
  review: "unreviewed",
  reviewer: null,
  household,
  level,
  ...o.seated ? { seated: true } : {},
  ...o.needsBalance ? { needsBalance: true } : {},
  ...o.loadNote ? { loadNote: o.loadNote } : {},
  ...o.holdSeconds ? { holdSeconds: o.holdSeconds } : {},
  draft: NEEDS
});
var LIGHT_BOTTLES = "Use bottles that feel light. Stop the set if your form slips, and put them down gently.";
var LIGHT_BAG = "Keep the backpack soft and light enough to hold against your chest comfortably.";
var HOME_EXERCISES = [
  // No equipment
  hx(
    "home-glute-bridge",
    "Glute bridge",
    "hinge",
    "beginner",
    [],
    [
      "Lie on your back with your knees bent and your feet flat on the floor.",
      "Press through your feet and lift your hips until your body makes a line from shoulders to knees.",
      "Lower slowly."
    ],
    "Lift your hips only a short way and pause briefly at the top.",
    "Lift one foot slightly off the floor while your hips are up.",
    "Stop if you feel pain in your lower back, and keep your neck relaxed."
  ),
  hx(
    "home-single-leg-bridge",
    "Single-leg glute bridge",
    "hinge",
    "advanced",
    [],
    [
      "Lie on your back with one foot flat and the other leg straight out, level with your other knee.",
      "Press through your planted foot and lift your hips, keeping them level.",
      "Lower slowly and finish all repetitions before switching legs."
    ],
    "Go back to the two-footed glute bridge.",
    null,
    "Stop if you feel pain in your lower back or hamstring, or a cramp."
  ),
  hx(
    "home-hip-hinge",
    "Standing hip hinge",
    "hinge",
    "beginner",
    [],
    [
      "Stand with your feet hip-width apart and your hands on your thighs.",
      "Push your hips back with a flat back and slide your hands toward your knees.",
      "Squeeze your hips forward to stand tall."
    ],
    "Hinge only a short way.",
    "Reach your hands further down your legs, keeping your back flat.",
    "Stop if you feel pain in your lower back or the back of your knees."
  ),
  hx(
    "home-bird-dog",
    "Bird-dog",
    "core",
    "beginner",
    [],
    [
      "Start on your hands and knees with a flat back.",
      "Slide one leg straight back and reach the opposite arm forward.",
      "Return and switch sides, counting one repetition for each side."
    ],
    "Lift only an arm, or only a leg, at a time.",
    "Hold each lift for three seconds.",
    "Stop if you feel pain in your wrists, knees or lower back."
  ),
  hx(
    "home-dead-bug",
    "Dead bug",
    "core",
    "beginner",
    [],
    [
      "Lie on your back with your knees bent over your hips and your arms reaching up.",
      "Slowly lower one arm and the opposite leg toward the floor, keeping your lower back gently pressed down.",
      "Return and switch sides, counting one repetition for each side."
    ],
    "Lower only the arm, or tap one foot to the floor and back.",
    "Lower the arm and leg further.",
    "Stop if you feel pain in your lower back or neck."
  ),
  hx(
    "home-knee-plank",
    "Plank on your knees",
    "core",
    "beginner",
    [],
    [
      "Rest on your forearms and knees with your body in a straight line from head to knees.",
      "Gently pull your belly button toward your spine and keep breathing.",
      "Hold, then lower to rest."
    ],
    "Hold for a shorter time, or do it with your hands on a firm wall.",
    "Lift your knees off the floor into a full forearm plank.",
    "Stop if you feel pain in your shoulders, wrists or lower back.",
    { holdSeconds: 20 }
  ),
  hx(
    "home-plank",
    "Forearm plank",
    "core",
    "intermediate",
    [],
    [
      "Rest on your forearms and toes with your body in a straight line from head to heels.",
      "Gently pull your belly button toward your spine and keep breathing.",
      "Hold, then lower to rest."
    ],
    "Go back to the plank on your knees.",
    "Hold for longer.",
    "Stop if you feel pain in your shoulders, wrists or lower back.",
    { holdSeconds: 25 }
  ),
  hx(
    "home-bridge-march",
    "Glute bridge march",
    "hinge",
    "intermediate",
    [],
    [
      "Lift into a glute bridge and keep your hips level.",
      "Slowly lift one foot a few centimetres off the floor and put it down, then the other.",
      "Lower your hips slowly when the set is done."
    ],
    "Do the plain glute bridge.",
    "Lift each foot a little higher.",
    "Stop if you feel pain in your lower back, or your hips drop."
  ),
  // Chair
  hx(
    "home-chair-sit-to-stand",
    "Chair sit-to-stand",
    "squat",
    "beginner",
    ["chair"],
    [
      "Sit near the front of the chair with your feet about hip-width apart.",
      "Lean slightly forward and stand up, pressing through your whole foot.",
      "Sit back down slowly and with control."
    ],
    "Use a higher seat, or push gently on your thighs to help you stand.",
    "Lower yourself more slowly, taking about three seconds to sit.",
    "Stop if you feel pain in your knees or hips, or feel dizzy."
  ),
  hx(
    "home-chair-slow-sit-to-stand",
    "Slow chair sit-to-stand",
    "squat",
    "intermediate",
    ["chair"],
    [
      "Sit near the front of the chair with your feet about hip-width apart and your arms crossed.",
      "Stand up smoothly, then take about three seconds to sit back down.",
      "Lightly touch the seat and stand again."
    ],
    "Do the ordinary chair sit-to-stand.",
    "Take about four seconds to lower yourself.",
    "Stop if you feel pain in your knees or hips, or feel dizzy."
  ),
  hx(
    "home-chair-staggered-sit-to-stand",
    "Staggered chair sit-to-stand",
    "squat",
    "advanced",
    ["chair"],
    [
      "Sit near the front of the chair with one foot slightly behind the other, so the front foot does most of the work.",
      "Stand up smoothly and sit down slowly. Keep your hands ready to touch the seat or a nearby wall.",
      "Finish all repetitions, then swap which foot is in front."
    ],
    "Place your feet level and use the slow chair sit-to-stand.",
    null,
    "Stop if you feel pain in your knees or hips, or feel unsteady.",
    { needsBalance: true }
  ),
  hx(
    "home-chair-split-squat",
    "Chair-supported split squat",
    "lunge",
    "intermediate",
    ["chair"],
    [
      "Hold the back of a sturdy chair and step one foot back.",
      "Bend both knees to lower a short way, keeping your chest tall.",
      "Press through your front foot to stand. Finish all repetitions before switching legs."
    ],
    "Take a shorter step and lower only a little.",
    "Lower a little further, still holding the chair.",
    "Stop if you feel pain in your knees or hips, and always keep a hand on the chair."
  ),
  hx(
    "home-seated-knee-extension",
    "Seated knee extension",
    "squat",
    "beginner",
    ["chair"],
    [
      "Sit tall with your back against the chair and your feet flat.",
      "Slowly straighten one knee until your leg is level, then lower it.",
      "Finish all repetitions before switching legs."
    ],
    "Lift your foot only part of the way.",
    "Hold the straight leg for three seconds.",
    "Stop if you feel pain in your knee or the front of your thigh.",
    { seated: true }
  ),
  hx(
    "home-seated-knee-lift",
    "Seated knee lift",
    "core",
    "beginner",
    ["chair"],
    [
      "Sit tall near the front of the chair and hold the sides of the seat.",
      "Lift one knee toward your chest and lower it with control.",
      "Alternate legs, counting one repetition for each leg."
    ],
    "Lift your foot only a few centimetres.",
    "Hold each lifted knee for two seconds.",
    "Stop if you feel pain in your hips or lower back.",
    { seated: true }
  ),
  hx(
    "home-seated-trunk-twist",
    "Seated trunk twist",
    "core",
    "beginner",
    ["chair"],
    [
      "Sit tall with your feet flat and your arms crossed over your chest.",
      "Turn your upper body gently to one side, then the other, keeping your hips still.",
      "Count one repetition for each side."
    ],
    "Turn only a little.",
    "Slow the twist to three seconds each way.",
    "Stop if you feel pain in your back, or feel dizzy.",
    { seated: true }
  ),
  // Wall
  hx(
    "home-wall-push-up",
    "Wall push-up",
    "push",
    "beginner",
    ["wall"],
    [
      "Stand an arm\u2019s length from the wall with your hands on it at chest height, a little wider than your shoulders.",
      "Bend your elbows to bring your chest toward the wall, keeping your body in a straight line.",
      "Press back to the start."
    ],
    "Stand closer to the wall and bend your elbows less.",
    "Stand a little further from the wall.",
    "Stop if you feel pain in your shoulders, wrists or elbows."
  ),
  hx(
    "home-wall-push-up-far",
    "Wall push-up, feet back",
    "push",
    "intermediate",
    ["wall"],
    [
      "Place your hands on the wall at chest height and step your feet back a little further than for the wall push-up, keeping a straight line.",
      "Bend your elbows slowly to bring your chest toward the wall.",
      "Press back to the start."
    ],
    "Step closer to the wall.",
    null,
    "Stop if you feel pain in your shoulders, wrists or elbows, or your feet start to slip."
  ),
  hx(
    "home-wall-sit",
    "Wall sit",
    "squat",
    "intermediate",
    ["wall"],
    [
      "Lean your back against the wall and walk your feet forward until your knees are bent, only as far as is comfortable.",
      "Keep your back flat on the wall and breathe.",
      "Hold, then slide back up."
    ],
    "Bend your knees only a little, or hold for less time.",
    "Hold for longer.",
    "Stop if you feel pain in your knees, or feel dizzy.",
    { holdSeconds: 20 }
  ),
  hx(
    "home-wall-angel",
    "Wall slide (wall angel)",
    "pull",
    "beginner",
    ["wall"],
    [
      "Stand with your back and head near the wall and your elbows bent beside you.",
      "Slowly slide your arms up the wall as far as is comfortable, keeping your ribs down.",
      "Slide them back down."
    ],
    "Slide your arms up only part of the way.",
    "Slide up slower and a little higher.",
    "Stop if you feel pain or pinching in your shoulders or neck."
  ),
  // Towel
  hx(
    "home-towel-pull-apart",
    "Towel pull-apart",
    "pull",
    "beginner",
    ["towel"],
    [
      "Hold a towel in front of your chest with your hands wider than your shoulders.",
      "Gently pull your hands apart as if you were stretching the towel, squeezing your shoulder blades together.",
      "Hold briefly, then release."
    ],
    "Pull more gently and hold for less time.",
    "Hold for three seconds.",
    "Stop if you feel pain in your shoulders or neck. Hold the towel only in your own hands.",
    { seated: true }
  ),
  // Water bottles
  hx(
    "home-bottle-seated-press",
    "Seated bottle press",
    "push",
    "beginner",
    ["water_bottles", "chair"],
    [
      "Sit tall holding a bottle in each hand at shoulder height.",
      "Press the bottles up until your arms are almost straight, then lower with control.",
      "Keep your back against the chair and your ribs down."
    ],
    "Use smaller bottles, or press with no bottles.",
    "Use slightly bigger bottles and lower more slowly.",
    "Stop if you feel pain in your shoulders or neck.",
    { seated: true, loadNote: LIGHT_BOTTLES }
  ),
  hx(
    "home-bottle-standing-press",
    "Standing bottle press",
    "push",
    "intermediate",
    ["water_bottles"],
    [
      "Stand tall with your feet hip-width apart, holding a bottle in each hand at shoulder height.",
      "Press the bottles up until your arms are almost straight, then lower with control.",
      "Keep your ribs down and do not lean back."
    ],
    "Do the seated bottle press.",
    "Use slightly bigger bottles.",
    "Stop if you feel pain in your shoulders, neck or lower back.",
    { loadNote: LIGHT_BOTTLES }
  ),
  hx(
    "home-bottle-seated-row",
    "Seated bottle row",
    "pull",
    "beginner",
    ["water_bottles", "chair"],
    [
      "Sit tall near the front of the chair, leaning slightly forward with a bottle in each hand and your arms hanging.",
      "Pull your elbows back, squeezing your shoulder blades together.",
      "Lower slowly."
    ],
    "Use smaller bottles, or row with no bottles.",
    "Pause for two seconds with your elbows back.",
    "Stop if you feel pain in your shoulders or lower back.",
    { seated: true, loadNote: LIGHT_BOTTLES }
  ),
  hx(
    "home-bottle-supported-row",
    "Supported bottle row",
    "pull",
    "intermediate",
    ["water_bottles", "chair"],
    [
      "Rest one hand on the back of a sturdy chair, hinge forward with a flat back and hold a bottle in the other hand.",
      "Pull your elbow back toward your hip, then lower slowly.",
      "Finish all repetitions before switching arms."
    ],
    "Do the seated bottle row.",
    "Lower more slowly.",
    "Stop if you feel pain in your lower back or shoulder.",
    { loadNote: LIGHT_BOTTLES }
  ),
  hx(
    "home-bottle-curl",
    "Bottle curl",
    "pull",
    "beginner",
    ["water_bottles"],
    [
      "Sit or stand tall with a bottle in each hand and your elbows by your sides.",
      "Bend your elbows to bring the bottles toward your shoulders, then lower slowly.",
      "Keep your elbows still."
    ],
    "Use smaller bottles.",
    "Lower the bottles over three seconds.",
    "Stop if you feel pain in your elbows or wrists.",
    { seated: true, loadNote: LIGHT_BOTTLES }
  ),
  hx(
    "home-bottle-hinge",
    "Bottle hip hinge",
    "hinge",
    "intermediate",
    ["water_bottles"],
    [
      "Stand with your feet hip-width apart holding a bottle in each hand in front of your thighs.",
      "Push your hips back with a flat back and slide the bottles down your legs.",
      "Squeeze your hips forward to stand tall."
    ],
    "Do the standing hip hinge with no bottles.",
    "Lower more slowly.",
    "Stop if you feel pain in your lower back or the back of your knees.",
    { loadNote: LIGHT_BOTTLES }
  ),
  // Backpack
  hx(
    "home-backpack-squat",
    "Backpack squat",
    "squat",
    "intermediate",
    ["backpack"],
    [
      "Hold a soft, light backpack against your chest with both arms and stand with your feet shoulder-width apart.",
      "Push your hips back and bend your knees to lower a short way, keeping your chest tall.",
      "Press through your feet to stand."
    ],
    "Squat with no backpack, or to a chair.",
    null,
    "Stop if you feel pain in your knees or back.",
    { loadNote: LIGHT_BAG }
  ),
  hx(
    "home-backpack-slow-squat",
    "Slow backpack squat",
    "squat",
    "advanced",
    ["backpack"],
    [
      "Hold a soft, light backpack against your chest with both arms and stand with your feet shoulder-width apart.",
      "Take about three seconds to lower a short way, then stand smoothly.",
      "Keep your chest tall and your weight over your whole foot."
    ],
    "Do the backpack squat at an ordinary speed.",
    null,
    "Stop if you feel pain in your knees or back.",
    { loadNote: LIGHT_BAG }
  ),
  hx(
    "home-backpack-press",
    "Seated backpack chest press",
    "push",
    "intermediate",
    ["backpack", "chair"],
    [
      "Sit tall holding a soft, light backpack against your chest.",
      "Press it straight out in front of you until your arms are almost straight, then bring it back.",
      "Keep your back against the chair."
    ],
    "Press with no backpack.",
    null,
    "Stop if you feel pain in your shoulders or neck.",
    { seated: true, loadNote: LIGHT_BAG }
  ),
  // Stairs (bottom step only, always beside a handrail, never carrying anything)
  hx(
    "home-rail-calf-raise",
    "Calf raise holding the rail",
    "squat",
    "beginner",
    ["stairs"],
    [
      "Stay on level floor next to the stairs, standing tall and holding the handrail with one hand and your feet hip-width apart.",
      "Rise onto the balls of your feet, then lower your heels slowly.",
      "Keep holding the rail throughout."
    ],
    "Rise only a little.",
    "Lower your heels over three seconds.",
    "Stop if you feel pain in your calves or ankles, or feel unsteady."
  ),
  hx(
    "home-step-up",
    "Step-up",
    "lunge",
    "intermediate",
    ["stairs"],
    [
      "Face the stairs holding the handrail, and place one foot flat on the bottom step.",
      "Press through that foot to stand up on the step, then step back down with control.",
      "Finish all repetitions before switching legs."
    ],
    "Do the calf raise holding the rail, or the chair sit-to-stand.",
    null,
    "Stop if you feel pain in your knees or hips, or feel unsteady. Never carry anything on the stairs.",
    { needsBalance: true }
  ),
  hx(
    "home-step-up-slow",
    "Slow step-up",
    "lunge",
    "advanced",
    ["stairs"],
    [
      "Face the stairs holding the handrail, and place one foot flat on the bottom step.",
      "Stand up on the step, then take about three seconds to lower the other foot back down.",
      "Finish all repetitions before switching legs."
    ],
    "Do the step-up at an ordinary speed.",
    null,
    "Stop if you feel pain in your knees or hips, or feel unsteady. Never carry anything on the stairs.",
    { needsBalance: true }
  ),
  hx(
    "home-step-incline-push-up",
    "Incline push-up on the bottom step",
    "push",
    "intermediate",
    ["stairs"],
    [
      "Place your hands on the bottom step, a little wider than your shoulders, with your body in a straight line.",
      "Bend your elbows to bring your chest toward the step, then press back.",
      "Keep your feet on a non-slip floor."
    ],
    "Do the wall push-up.",
    null,
    "Stop if you feel pain in your shoulders or wrists, or your hands or feet start to slip."
  )
];

// packages/shared/src/trainer-rig.ts
var STAND = {
  yaw: 0,
  bp: 0,
  x: 0,
  tp: 0,
  tr: 0,
  tw: 0,
  hd: 0,
  alp: 0,
  ala: 8,
  ale: 5,
  arp: 0,
  ara: 8,
  are: 5,
  llp: 0,
  lla: 3,
  llk: 0,
  lrp: 0,
  lra: 3,
  lrk: 0
};
var SEATED = {
  ...STAND,
  llp: 90,
  llk: 90,
  lrp: 90,
  lrk: 90,
  lla: 4,
  lra: 4,
  tp: 0
};
var BONES = {
  torso: 0.5,
  neck: 0.17,
  headR: 0.11,
  halfShoulder: 0.19,
  halfHip: 0.1,
  upperArm: 0.3,
  foreArm: 0.27,
  thigh: 0.43,
  shin: 0.43,
  foot: 0.2
};
var STAND_HIP_HEIGHT = BONES.thigh + BONES.shin + 0.04;
var SEAT_HEIGHT = BONES.thigh + 0.04;
var BONE_LIST = [
  ["pelvis", "neck", BONES.torso],
  ["shoulderL", "elbowL", BONES.upperArm],
  ["elbowL", "wristL", BONES.foreArm],
  ["shoulderR", "elbowR", BONES.upperArm],
  ["elbowR", "wristR", BONES.foreArm],
  ["hipL", "kneeL", BONES.thigh],
  ["kneeL", "ankleL", BONES.shin],
  ["hipR", "kneeR", BONES.thigh],
  ["kneeR", "ankleR", BONES.shin]
];

// packages/shared/src/trainer-motions.ts
var k = (t2, p = {}) => [t2, p];
var M = (m) => m;
var MOTIONS = [
  // Standing, for dance blocks.
  M({
    id: "weight_shift",
    label: "weight shift",
    base: "standing",
    cycleS: 2.4,
    view: "front",
    seatedId: "seated_sway",
    keys: [
      k(0),
      k(0.6, { x: 0.07, tr: -4, llk: 4 }),
      k(1.2),
      k(1.8, { x: -0.07, tr: 4, lrk: 4 }),
      k(2.4)
    ]
  }),
  M({
    id: "march",
    label: "march",
    base: "standing",
    cycleS: 2,
    view: "front",
    seatedId: "seated_knee_lift",
    keys: [
      k(0),
      k(0.5, { llp: 55, llk: 70, arp: 25, alp: -25 }),
      k(1),
      k(1.5, { lrp: 55, lrk: 70, alp: 25, arp: -25 }),
      k(2)
    ]
  }),
  M({
    id: "bounce",
    label: "soft bounce",
    base: "standing",
    cycleS: 1,
    view: "front",
    seatedId: "seated_bounce",
    keys: [
      k(0),
      k(0.5, { llk: 22, lrk: 22, llp: 12, lrp: 12, tp: 4, alp: 10, arp: 10, ale: 25, are: 25 }),
      k(1)
    ]
  }),
  M({
    id: "side_step",
    label: "side step",
    base: "standing",
    cycleS: 2.4,
    view: "front",
    seatedId: "seated_step_out",
    keys: [
      k(0),
      k(0.6, { x: 0.12, lra: 18, tr: -4, ara: 25, ala: 25, are: 30, ale: 30 }),
      k(1.2),
      k(1.8, { x: -0.12, lla: 18, tr: 4, ara: 25, ala: 25, are: 30, ale: 30 }),
      k(2.4)
    ]
  }),
  M({
    id: "step_touch",
    label: "step and touch",
    base: "standing",
    cycleS: 2.4,
    view: "front",
    seatedId: "seated_step_out",
    keys: [
      k(0),
      k(0.6, { x: 0.1, lra: 20, lrk: 8, arp: 15, alp: 15, are: 35, ale: 35 }),
      k(1.2),
      k(1.8, { x: -0.1, lla: 20, llk: 8, alp: 15, arp: 15, are: 35, ale: 35 }),
      k(2.4)
    ]
  }),
  M({
    id: "hip_sway",
    label: "hip sway",
    base: "standing",
    cycleS: 2.4,
    view: "front",
    seatedId: "seated_sway",
    keys: [
      k(0, { llk: 8, lrk: 8, llp: 4, lrp: 4 }),
      k(0.6, { x: 0.07, tr: -7, llk: 8, lrk: 8, llp: 4, lrp: 4 }),
      k(1.2, { llk: 8, lrk: 8, llp: 4, lrp: 4 }),
      k(1.8, { x: -0.07, tr: 7, llk: 8, lrk: 8, llp: 4, lrp: 4 }),
      k(2.4, { llk: 8, lrk: 8, llp: 4, lrp: 4 })
    ]
  }),
  M({
    id: "hip_rock",
    label: "hip rock",
    base: "standing",
    cycleS: 1.2,
    view: "side",
    seatedId: "seated_sway",
    keys: [
      k(0, { llk: 10, lrk: 10, llp: 5, lrp: 5 }),
      k(0.6, { tp: -6, llk: 20, lrk: 20, llp: 16, lrp: 16 }),
      k(1.2, { llk: 10, lrk: 10, llp: 5, lrp: 5 })
    ]
  }),
  M({
    id: "knee_bend",
    label: "knee bend",
    base: "standing",
    cycleS: 2.4,
    view: "side",
    seatedId: "seated_bounce",
    keys: [
      k(0),
      k(1.2, { llk: 45, lrk: 45, llp: 40, lrp: 40, tp: 12, alp: 30, arp: 30, ale: 20, are: 20 }),
      k(2.4)
    ]
  }),
  M({
    id: "arm_swing",
    label: "arm swing",
    base: "standing",
    cycleS: 2,
    view: "front",
    seatedId: "seated_bounce",
    keys: [
      k(0),
      k(0.5, { alp: 35, arp: -35, ale: 25, are: 25 }),
      k(1),
      k(1.5, { alp: -35, arp: 35, ale: 25, are: 25 }),
      k(2)
    ]
  }),
  M({
    id: "arm_reach",
    label: "overhead reach",
    base: "standing",
    cycleS: 3,
    view: "front",
    seatedId: "seated_reach",
    keys: [k(0), k(1.5, { alp: 170, arp: 170, ale: 5, are: 5, hd: -10 }), k(3)]
  }),
  M({
    id: "arm_circles",
    label: "shoulder and arm circles",
    base: "standing",
    cycleS: 2.4,
    view: "front",
    seatedId: "seated_sway",
    keys: [
      k(0),
      k(0.6, { alp: 20, arp: 20 }),
      k(1.2, { ala: 28, ara: 28 }),
      k(1.8, { alp: -20, arp: -20 }),
      k(2.4)
    ]
  }),
  M({
    id: "twist",
    label: "torso twist",
    base: "standing",
    cycleS: 2.4,
    view: "front",
    seatedId: "seated_twist",
    keys: [
      k(0, { alp: 40, arp: 40, ale: 110, are: 110 }),
      k(0.6, { tw: 35, alp: 40, arp: 40, ale: 110, are: 110 }),
      k(1.2, { alp: 40, arp: 40, ale: 110, are: 110 }),
      k(1.8, { tw: -35, alp: 40, arp: 40, ale: 110, are: 110 }),
      k(2.4, { alp: 40, arp: 40, ale: 110, are: 110 })
    ]
  }),
  M({
    id: "turn",
    label: "quarter turn",
    base: "standing",
    cycleS: 3.2,
    view: "three_quarter",
    seatedId: "seated_twist",
    keys: [k(0), k(1.6, { yaw: 90 }), k(3.2)]
  }),
  M({
    id: "lean",
    label: "side lean",
    base: "standing",
    cycleS: 2.4,
    view: "front",
    seatedId: "seated_sway",
    keys: [
      k(0),
      k(0.6, { tr: 12, x: 0.05, ala: 30 }),
      k(1.2),
      k(1.8, { tr: -12, x: -0.05, ara: 30 }),
      k(2.4)
    ]
  }),
  M({
    id: "breathe",
    label: "breathing with the arms",
    base: "standing",
    cycleS: 4,
    view: "front",
    seatedId: "seated_breathe",
    keys: [k(0), k(2, { alp: 150, arp: 150, hd: -8 }), k(4)]
  }),
  M({
    id: "stretch",
    label: "side stretch",
    base: "standing",
    cycleS: 4,
    view: "front",
    seatedId: "seated_reach",
    keys: [k(0), k(2, { tr: -18, arp: 165, ara: 10, alp: 20, ale: 70 }), k(4)]
  }),
  // Standing, for exercises.
  M({
    id: "squat",
    label: "squat holding a load at the chest",
    base: "standing",
    cycleS: 2.4,
    view: "side",
    keys: [
      k(0, { alp: 60, arp: 60, ale: 100, are: 100 }),
      k(1.2, { llp: 55, lrp: 55, llk: 80, lrk: 80, tp: 20, alp: 60, arp: 60, ale: 100, are: 100 }),
      k(2.4, { alp: 60, arp: 60, ale: 100, are: 100 })
    ]
  }),
  M({
    id: "sit_to_stand",
    label: "sit-to-stand with a chair",
    base: "standing",
    cycleS: 4,
    view: "side",
    chair: true,
    keys: [
      k(0),
      k(1, { tp: 25, llp: 50, llk: 70, lrp: 50, lrk: 70, alp: 40, arp: 40 }),
      k(2, { tp: 5, llp: 90, llk: 90, lrp: 90, lrk: 90 }),
      k(3, { tp: 25, llp: 55, llk: 75, lrp: 55, lrk: 75, alp: 40, arp: 40 }),
      k(4)
    ]
  }),
  M({
    id: "hip_hinge",
    label: "hip hinge",
    base: "standing",
    cycleS: 3,
    view: "side",
    keys: [k(0), k(1.5, { tp: 55, llk: 14, lrk: 14, llp: 10, lrp: 10, alp: 40, arp: 40 }), k(3)]
  }),
  M({
    id: "wall_push_up",
    label: "wall push-up",
    base: "standing",
    cycleS: 3,
    view: "side",
    keys: [
      k(0, { bp: 62, alp: 28, arp: 28, ale: 6, are: 6, ala: 15, ara: 15 }),
      k(1.5, { bp: 74, alp: 16, arp: 16, ale: 78, are: 78, ala: 15, ara: 15 }),
      k(3, { bp: 62, alp: 28, arp: 28, ale: 6, are: 6, ala: 15, ara: 15 })
    ]
  }),
  M({
    id: "split_squat",
    chairFront: true,
    label: "split squat holding a chair",
    base: "standing",
    cycleS: 2.6,
    view: "side",
    chair: true,
    keys: [
      k(0, { llp: 15, lrp: -20, lrk: 10, alp: 30, arp: 30, ale: 20, are: 20 }),
      k(1.3, { llp: 60, llk: 70, lrp: -35, lrk: 60, tp: 5, alp: 30, arp: 30, ale: 20, are: 20 }),
      k(2.6, { llp: 15, lrp: -20, lrk: 10, alp: 30, arp: 30, ale: 20, are: 20 })
    ]
  }),
  M({
    id: "overhead_press",
    label: "overhead press",
    base: "standing",
    cycleS: 3,
    view: "front",
    seatedId: "seated_press",
    keys: [
      k(0, { alp: 15, arp: 15, ala: 35, ara: 35, ale: 115, are: 115 }),
      k(1.5, { alp: 170, arp: 170, ala: 10, ara: 10, ale: 5, are: 5 }),
      k(3, { alp: 15, arp: 15, ala: 35, ara: 35, ale: 115, are: 115 })
    ]
  }),
  M({
    id: "curl",
    label: "arm curl",
    base: "standing",
    cycleS: 3,
    view: "front",
    seatedId: "seated_curl",
    keys: [k(0), k(1.5, { ale: 130, are: 130, alp: 5, arp: 5 }), k(3)]
  }),
  M({
    id: "towel_pull_apart",
    label: "towel pull-apart",
    base: "standing",
    cycleS: 2.4,
    view: "front",
    seatedId: "seated_towel",
    keys: [
      k(0, { alp: 80, arp: 80, ale: 25, are: 25, ala: 12, ara: 12 }),
      k(1, { alp: 60, arp: 60, ale: 15, are: 15, ala: 75, ara: 75 }),
      k(2.4, { alp: 80, arp: 80, ale: 25, are: 25, ala: 12, ara: 12 })
    ]
  }),
  M({
    id: "wall_slide",
    label: "wall slide",
    base: "standing",
    cycleS: 3,
    view: "front",
    keys: [
      k(0, { ala: 45, ara: 45, ale: 90, are: 90 }),
      k(1.5, { ala: 150, ara: 150, ale: 20, are: 20 }),
      k(3, { ala: 45, ara: 45, ale: 90, are: 90 })
    ]
  }),
  // Seated.
  M({
    id: "seated_knee_lift",
    label: "seated knee lift",
    base: "seated",
    cycleS: 3.2,
    view: "side",
    chair: true,
    keys: [
      k(0),
      k(0.8, { llp: 125, llk: 100, tp: -3 }),
      k(1.6),
      k(2.4, { lrp: 125, lrk: 100, tp: -3 }),
      k(3.2)
    ]
  }),
  M({
    id: "seated_knee_extension",
    label: "seated knee extension",
    base: "seated",
    cycleS: 7.2,
    view: "side",
    chair: true,
    keys: [
      k(0),
      k(1.2, { llk: 8 }),
      k(2.4, { llk: 8 }),
      k(3.6),
      k(4.8, { lrk: 8 }),
      k(6, { lrk: 8 }),
      k(7.2)
    ]
  }),
  M({
    id: "seated_twist",
    label: "seated torso twist",
    base: "seated",
    cycleS: 2.4,
    view: "front",
    chair: true,
    keys: [
      k(0, { alp: 40, arp: 40, ale: 110, are: 110 }),
      k(0.6, { tw: 35, alp: 40, arp: 40, ale: 110, are: 110 }),
      k(1.2, { alp: 40, arp: 40, ale: 110, are: 110 }),
      k(1.8, { tw: -35, alp: 40, arp: 40, ale: 110, are: 110 }),
      k(2.4, { alp: 40, arp: 40, ale: 110, are: 110 })
    ]
  }),
  M({
    id: "seated_press",
    label: "seated overhead press",
    base: "seated",
    cycleS: 3,
    view: "front",
    chair: true,
    keys: [
      k(0, { alp: 15, arp: 15, ala: 35, ara: 35, ale: 115, are: 115 }),
      k(1.5, { alp: 170, arp: 170, ala: 10, ara: 10, ale: 5, are: 5 }),
      k(3, { alp: 15, arp: 15, ala: 35, ara: 35, ale: 115, are: 115 })
    ]
  }),
  M({
    id: "seated_curl",
    label: "seated arm curl",
    base: "seated",
    cycleS: 3,
    view: "front",
    chair: true,
    keys: [k(0), k(1.5, { ale: 130, are: 130, alp: 5, arp: 5 }), k(3)]
  }),
  M({
    id: "seated_row",
    label: "seated row",
    base: "seated",
    cycleS: 2.4,
    view: "side",
    chair: true,
    keys: [
      k(0, { tp: 25, alp: 40, arp: 40, ale: 5, are: 5 }),
      k(1.2, { tp: 20, alp: -20, arp: -20, ale: 95, are: 95 }),
      k(2.4, { tp: 25, alp: 40, arp: 40, ale: 5, are: 5 })
    ]
  }),
  M({
    id: "seated_towel",
    label: "seated towel pull-apart",
    base: "seated",
    cycleS: 2.4,
    view: "front",
    chair: true,
    keys: [
      k(0, { alp: 80, arp: 80, ale: 25, are: 25, ala: 12, ara: 12 }),
      k(1, { alp: 60, arp: 60, ale: 15, are: 15, ala: 75, ara: 75 }),
      k(2.4, { alp: 80, arp: 80, ale: 25, are: 25, ala: 12, ara: 12 })
    ]
  }),
  M({
    id: "seated_bounce",
    label: "seated bounce",
    base: "seated",
    cycleS: 1.2,
    view: "front",
    chair: true,
    keys: [
      k(0),
      k(0.3, { llk: 80, lrk: 100, alp: 15, arp: -15, ale: 25, are: 25 }),
      k(0.6),
      k(0.9, { llk: 100, lrk: 80, alp: -15, arp: 15, ale: 25, are: 25 }),
      k(1.2)
    ]
  }),
  M({
    id: "seated_sway",
    label: "seated sway",
    base: "seated",
    cycleS: 2.4,
    view: "front",
    chair: true,
    keys: [k(0), k(0.6, { tr: -8, x: 0.04 }), k(1.2), k(1.8, { tr: 8, x: -0.04 }), k(2.4)]
  }),
  M({
    id: "seated_step_out",
    label: "seated step-out",
    base: "seated",
    cycleS: 2.4,
    view: "front",
    chair: true,
    keys: [k(0), k(0.6, { lra: 24, tr: -3 }), k(1.2), k(1.8, { lla: 24, tr: 3 }), k(2.4)]
  }),
  M({
    id: "seated_reach",
    label: "seated overhead reach",
    base: "seated",
    cycleS: 3,
    view: "front",
    chair: true,
    keys: [k(0), k(1.5, { alp: 170, arp: 170, ale: 5, are: 5, hd: -10 }), k(3)]
  }),
  M({
    id: "seated_breathe",
    label: "seated breathing with the arms",
    base: "seated",
    cycleS: 4,
    view: "front",
    chair: true,
    keys: [k(0), k(2, { alp: 150, arp: 150, hd: -8 }), k(4)]
  })
];
var MOTION_BY_ID = new Map(MOTIONS.map((m) => [m.id, m]));
function resolveMotion(id, seated) {
  const m = MOTION_BY_ID.get(id);
  if (!m) return null;
  if (seated && m.base !== "seated")
    return m.seatedId ? MOTION_BY_ID.get(m.seatedId) ?? null : null;
  return m;
}
function clipDuration(motionIds) {
  if (motionIds.length > 1) return motionIds.length * 6;
  const m = MOTION_BY_ID.get(motionIds[0] ?? "");
  return m ? Math.max(6, Math.round(m.cycleS * Math.ceil(8 / m.cycleS) * 10) / 10) : 8;
}

// packages/shared/src/trainer-clips.ts
var EXERCISE_MOTION = {
  "home-chair-sit-to-stand": "sit_to_stand",
  "home-chair-slow-sit-to-stand": "sit_to_stand",
  "home-chair-staggered-sit-to-stand": "sit_to_stand",
  "draft-sit-to-stand": "sit_to_stand",
  "home-backpack-squat": "squat",
  "home-backpack-slow-squat": "squat",
  "home-hip-hinge": "hip_hinge",
  "home-bottle-hinge": "hip_hinge",
  "draft-hip-hinge": "hip_hinge",
  "home-wall-push-up": "wall_push_up",
  "home-wall-push-up-far": "wall_push_up",
  "draft-wall-push-up": "wall_push_up",
  "home-chair-split-squat": "split_squat",
  "draft-supported-split-squat": "split_squat",
  "home-seated-knee-extension": "seated_knee_extension",
  "home-seated-knee-lift": "seated_knee_lift",
  "home-seated-trunk-twist": "seated_twist",
  "home-towel-pull-apart": "towel_pull_apart",
  "home-bottle-seated-press": "seated_press",
  "home-bottle-standing-press": "overhead_press",
  "home-backpack-press": "seated_press",
  "home-bottle-curl": "curl",
  "home-bottle-seated-row": "seated_row",
  "home-wall-angel": "wall_slide"
};
var COMPOSITE = {
  dancehall: ["bounce", "side_step", "hip_rock"],
  reggae: ["hip_sway", "side_step", "arm_reach"],
  chair_dance: ["seated_bounce", "seated_step_out", "seated_sway"],
  low_impact: ["step_touch", "hip_sway", "arm_reach"]
};
var RULES = [
  [/put it together|routine|run-through|flow it|link/i, []],
  // composite, filled per style
  [/quarter-turn/i, ["turn"]],
  [/weight shift|slow weight/i, ["weight_shift"]],
  [/knee bends?|knee and/i, ["knee_bend"]],
  [/march/i, ["march"]],
  [
    /step and sweep|step-out|step-touch|side-to-side step|step and lean|side step|step, lean/i,
    ["side_step"]
  ],
  [/hip rock|hip and knee/i, ["hip_rock"]],
  [/hip sway|side sway|hip circles/i, ["hip_sway"]],
  [/bounce/i, ["bounce"]],
  [/twist/i, ["twist"]],
  [/arm lifts|arm reaches|reach/i, ["arm_reach"]],
  [/arm circles|roll/i, ["arm_circles"]],
  [/breath/i, ["breathe"]],
  [/stretch|settle|slow down|slow sway/i, ["stretch"]],
  [/arms and hips/i, ["hip_sway", "arm_reach"]],
  [/toe and heel taps|taps/i, ["march"]]
];
function motionsForBlock(style, block2) {
  for (const [re, motions] of RULES) {
    if (re.test(block2.title)) return motions.length > 0 ? motions : COMPOSITE[style] ?? [];
  }
  return [];
}
var styleLabel = (s) => STYLE_DEFS[s].label;
var SAME = "It is not a reviewed demonstration and no professional has checked it. Follow the written steps.";
function blockClip(w, index) {
  const block2 = w.blocks[index];
  const motions = motionsForBlock(w.style, block2).map(
    (id) => STYLE_DEFS[w.style].seatedOnly ? resolveMotion(id, true)?.id ?? "" : id
  );
  const known = motions.filter((id) => MOTION_BY_ID.has(id));
  if (known.length === 0) return null;
  const labels = known.map((id) => MOTION_BY_ID.get(id).label).join(", then ");
  return {
    id: `trainer-${w.id}-${index}`,
    subjectId: movementId(w.id, index),
    kind: "animation",
    uri: `trainer:${known.join("+")}`,
    durationS: clipDuration(known),
    captions: `Placeholder animation of a generic ${labels}. It shows a plain movement pattern only. It is not the ${styleLabel(w.style)} choreography, not a recording of any dancer, and no practitioner has reviewed it. ${SAME}`,
    audioDescription: `A plain figure repeats a ${labels}. Placeholder only.`,
    review: "unreviewed",
    attribution: {
      creditLine: "Original placeholder animation, generated in code. Not a reviewed demonstration."
    },
    fixture: true
  };
}
function exerciseClip(id) {
  const motion = EXERCISE_MOTION[id];
  const m = motion ? MOTION_BY_ID.get(motion) : void 0;
  if (!m) return null;
  return {
    id: `trainer-${id}`,
    subjectId: id,
    kind: "animation",
    uri: `trainer:${m.id}`,
    durationS: clipDuration([m.id]),
    captions: `Placeholder animation of a generic ${m.label}. It shows a plain movement pattern with a simple figure, not a character or a recorded person. ${SAME}`,
    audioDescription: `A plain figure repeats a ${m.label}. Placeholder only.`,
    review: "unreviewed",
    attribution: {
      creditLine: "Original placeholder animation, generated in code. Not a reviewed demonstration."
    },
    fixture: true
  };
}
function buildTrainerClips() {
  const out = [];
  for (const w of DRAFT_WORKOUTS)
    w.blocks.forEach((_, i) => {
      const c = blockClip(w, i);
      if (c) out.push(c);
    });
  for (const e of [...DRAFT_STRENGTH_EXERCISES, ...HOME_EXERCISES]) {
    const c = exerciseClip(e.id);
    if (c) out.push(c);
  }
  return out;
}
var TRAINER_CLIPS = buildTrainerClips();

// packages/shared/src/food-staged.json
var food_staged_default = {
  _notice: "STAGED, UNREVIEWED food data. Every nutrient value and serving weight was read from the USDA FoodData Central SR Legacy release by scripts/import-fdc-sr.mjs; none was typed in or estimated. No registered dietitian has reviewed these foods and no cultural reviewer has confirmed their region tags or aliases, so they are never bundled, never seeded and appear only in development and review builds. Foods missing from the source (for example ackee) are not included.",
  source: "USDA FoodData Central, SR Legacy, April 2018 release",
  foods: [
    {
      id: "yam-boiled",
      name: "Yam, boiled",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 116,
        proteinG: 1.49,
        carbsG: 27.48,
        fatG: 0.14,
        fiberG: 3.9
      },
      servingG: 136,
      servingLabel: "1 cup, cubes",
      costTier: 1,
      aliases: ["yam"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 170072: Yam, cooked, boiled, drained, or baked, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "plantain-green-boiled",
      name: "Green plantain, boiled",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 121,
        proteinG: 1.09,
        carbsG: 29.15,
        fatG: 0.08,
        fiberG: 2.6
      },
      servingG: 137,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["plantain", "green plantain"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 168216: Plantains, green, boiled",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "plantain-yellow-baked",
      name: "Ripe plantain, baked",
      category: "fruit",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 155,
        proteinG: 1.52,
        carbsG: 41.37,
        fatG: 0.16,
        fiberG: 2.2
      },
      servingG: 139,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["plantain", "ripe plantain"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169131: Plantains, yellow, baked",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "breadfruit-raw",
      name: "Breadfruit, raw",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean"],
      per100g: {
        kcal: 103,
        proteinG: 1.07,
        carbsG: 27.12,
        fatG: 0.23,
        fiberG: 4.9
      },
      servingG: 220,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["breadfruit"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 171714: Breadfruit, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "sweet-potato-boiled",
      name: "Sweet potato, boiled, no skin",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 76,
        proteinG: 1.37,
        carbsG: 17.72,
        fatG: 0.14,
        fiberG: 2.5
      },
      servingG: 328,
      servingLabel: "1 cup, mashed",
      costTier: 1,
      aliases: ["sweet potato"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 168484: Sweet potato, cooked, boiled, without skin",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "taro-cooked",
      name: "Taro, cooked",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 142,
        proteinG: 0.52,
        carbsG: 34.6,
        fatG: 0.11,
        fiberG: 5.1
      },
      servingG: 132,
      servingLabel: "1 cup, sliced",
      costTier: 1,
      aliases: ["taro", "dasheen", "cocoyam"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 168486: Taro, cooked, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "pumpkin-boiled",
      name: "Pumpkin, boiled",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean"],
      per100g: {
        kcal: 20,
        proteinG: 0.72,
        carbsG: 4.9,
        fatG: 0.07,
        fiberG: 1.1
      },
      servingG: 245,
      servingLabel: "1 cup, mashed",
      costTier: 1,
      aliases: ["pumpkin"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 168449: Pumpkin, cooked, boiled, drained, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "chayote-boiled",
      name: "Chayote, boiled",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean"],
      per100g: {
        kcal: 24,
        proteinG: 0.62,
        carbsG: 5.09,
        fatG: 0.48,
        fiberG: 2.8
      },
      servingG: 160,
      servingLabel: '1 cup (1" pieces)',
      costTier: 1,
      aliases: ["chayote", "cho cho", "christophene"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 170403: Chayote, fruit, cooked, boiled, drained, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "okra-boiled",
      name: "Okra, boiled",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 22,
        proteinG: 1.87,
        carbsG: 4.51,
        fatG: 0.21,
        fiberG: 2.5
      },
      servingG: 80,
      servingLabel: "0.5 cup slices",
      costTier: 1,
      aliases: ["okra", "okro"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169261: Okra, cooked, boiled, drained, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "amaranth-leaves-boiled",
      name: "Amaranth leaves, boiled",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 21,
        proteinG: 2.11,
        carbsG: 4.11,
        fatG: 0.18
      },
      servingG: 132,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["amaranth", "callaloo", "calaloo"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169202: Amaranth leaves, cooked, boiled, drained, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "cowpea-leaves-boiled",
      name: "Cowpea leaves, boiled",
      category: "vegetable",
      regionTags: ["west_african"],
      per100g: {
        kcal: 22,
        proteinG: 4.67,
        carbsG: 2.8,
        fatG: 0.1
      },
      servingG: 53,
      servingLabel: "1 cup, chopped",
      costTier: 1,
      aliases: ["cowpea leaves", "bean leaves"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 168406: Cowpeas, leafy tips, cooked, boiled, drained, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "sweet-potato-leaves-steamed",
      name: "Sweet potato leaves, steamed",
      category: "vegetable",
      regionTags: ["west_african"],
      per100g: {
        kcal: 35,
        proteinG: 2.18,
        carbsG: 7.38,
        fatG: 0.34,
        fiberG: 1.9
      },
      servingG: 64,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["sweet potato leaves"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169304: Sweet potato leaves, cooked, steamed, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "eggplant-boiled",
      name: "Eggplant, boiled",
      category: "vegetable",
      regionTags: ["west_african", "caribbean"],
      per100g: {
        kcal: 35,
        proteinG: 0.83,
        carbsG: 8.73,
        fatG: 0.23,
        fiberG: 2.5
      },
      servingG: 99,
      servingLabel: '1 cup (1" cubes)',
      costTier: 1,
      aliases: ["eggplant", "aubergine"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169229: Eggplant, cooked, boiled, drained, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "pigeon-peas-boiled",
      name: "Pigeon peas (green), boiled",
      category: "legume",
      regionTags: ["jamaican", "caribbean"],
      per100g: {
        kcal: 111,
        proteinG: 5.96,
        carbsG: 19.49,
        fatG: 1.36,
        fiberG: 4.2
      },
      servingG: 153,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["pigeon peas", "gungo peas", "gandules"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 170430: Pigeonpeas, immature seeds, cooked, boiled, drained, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "kidney-beans-boiled",
      name: "Kidney beans, boiled",
      category: "legume",
      regionTags: ["jamaican", "caribbean"],
      per100g: {
        kcal: 127,
        proteinG: 8.67,
        carbsG: 22.8,
        fatG: 0.5,
        fiberG: 6.4
      },
      servingG: 177,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["kidney beans", "red peas"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 173740: Beans, kidney, all types, mature seeds, cooked, boiled, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "cowpeas-boiled",
      name: "Black-eyed peas (cowpeas), boiled",
      category: "legume",
      regionTags: ["west_african", "caribbean"],
      per100g: {
        kcal: 116,
        proteinG: 7.73,
        carbsG: 20.76,
        fatG: 0.53,
        fiberG: 6.5
      },
      servingG: 171,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["black-eyed peas", "cowpeas", "beans"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 173759: Cowpeas, common (blackeyes, crowder, southern), mature seeds, cooked, boiled, without salt",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "salt-cod-dried",
      name: "Salted cod, dried (before soaking)",
      category: "protein",
      regionTags: ["jamaican", "caribbean"],
      per100g: {
        kcal: 290,
        proteinG: 62.82,
        carbsG: 0,
        fatG: 2.37,
        fiberG: 0
      },
      servingG: 28.4,
      servingLabel: "1 oz",
      costTier: 2,
      aliases: ["saltfish", "salt fish", "salted cod"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 174190: Fish, cod, Atlantic, dried and salted",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "mackerel-atlantic-cooked",
      name: "Atlantic mackerel, cooked",
      category: "protein",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 262,
        proteinG: 23.85,
        carbsG: 0,
        fatG: 17.81,
        fiberG: 0
      },
      servingG: 88,
      servingLabel: "1 fillet",
      costTier: 2,
      aliases: ["mackerel"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 175120: Fish, mackerel, Atlantic, cooked, dry heat",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "tilapia-cooked",
      name: "Tilapia, cooked",
      category: "protein",
      regionTags: ["west_african", "caribbean"],
      per100g: {
        kcal: 128,
        proteinG: 26.15,
        carbsG: 0,
        fatG: 2.65,
        fiberG: 0
      },
      servingG: 87,
      servingLabel: "1 fillet",
      costTier: 2,
      aliases: ["tilapia"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 175177: Fish, tilapia, cooked, dry heat",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "goat-roasted",
      name: "Goat, roasted",
      category: "protein",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 143,
        proteinG: 27.1,
        carbsG: 0,
        fatG: 3.03,
        fiberG: 0
      },
      servingG: 85,
      servingLabel: "3 oz",
      costTier: 3,
      aliases: ["goat", "curry goat"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 175304: Game meat, goat, cooked, roasted",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "millet-cooked",
      name: "Millet, cooked",
      category: "grain",
      regionTags: ["west_african"],
      per100g: {
        kcal: 119,
        proteinG: 3.51,
        carbsG: 23.67,
        fatG: 1,
        fiberG: 1.3
      },
      servingG: 174,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["millet"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 168871: Millet, cooked",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "sorghum-grain-dry",
      name: "Sorghum grain (dry)",
      category: "grain",
      regionTags: ["west_african"],
      per100g: {
        kcal: 329,
        proteinG: 10.62,
        carbsG: 72.09,
        fatG: 3.46,
        fiberG: 6.7
      },
      servingG: 192,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["sorghum", "guinea corn"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169716: Sorghum grain",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "cornmeal-yellow-dry",
      name: "Cornmeal, yellow (dry)",
      category: "grain",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 362,
        proteinG: 8.12,
        carbsG: 76.89,
        fatG: 3.59,
        fiberG: 7.3
      },
      servingG: 122,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["cornmeal", "maize meal"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169697: Cornmeal, whole-grain, yellow",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "peanuts-raw",
      name: "Peanuts, raw",
      category: "snack",
      regionTags: ["west_african"],
      per100g: {
        kcal: 567,
        proteinG: 25.8,
        carbsG: 16.13,
        fatG: 49.24,
        fiberG: 8.5
      },
      servingG: 28.4,
      servingLabel: "1 oz",
      costTier: 1,
      aliases: ["peanuts", "groundnuts"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 172430: Peanuts, all types, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "watermelon-seeds-dried",
      name: "Watermelon seed kernels, dried",
      category: "snack",
      regionTags: ["west_african"],
      per100g: {
        kcal: 557,
        proteinG: 28.33,
        carbsG: 15.31,
        fatG: 47.37
      },
      servingG: 108,
      servingLabel: "1 cup",
      costTier: 2,
      aliases: ["watermelon seeds"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169407: Seeds, watermelon seed kernels, dried",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "palm-oil",
      name: "Palm oil",
      category: "fat",
      regionTags: ["west_african"],
      per100g: {
        kcal: 884,
        proteinG: 0,
        carbsG: 0,
        fatG: 100,
        fiberG: 0
      },
      servingG: 13.6,
      servingLabel: "1 tbsp",
      costTier: 2,
      aliases: ["palm oil", "red palm oil"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 171015: Oil, palm",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "coconut-milk-canned",
      name: "Coconut milk, canned",
      category: "fat",
      regionTags: ["jamaican", "caribbean"],
      per100g: {
        kcal: 197,
        proteinG: 2.02,
        carbsG: 2.81,
        fatG: 21.33
      },
      servingG: 226,
      servingLabel: "1 cup",
      costTier: 2,
      aliases: ["coconut milk"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 170173: Nuts, coconut milk, canned (liquid expressed from grated meat and water)",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "hot-chili-pepper-red-raw",
      name: "Hot chili pepper, red, raw",
      category: "vegetable",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 40,
        proteinG: 1.87,
        carbsG: 8.81,
        fatG: 0.44,
        fiberG: 1.5
      },
      servingG: 45,
      servingLabel: "1 pepper",
      costTier: 1,
      aliases: ["hot pepper", "chili pepper"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 170106: Peppers, hot chili, red, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "mango-raw",
      name: "Mango, raw",
      category: "fruit",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 60,
        proteinG: 0.82,
        carbsG: 14.98,
        fatG: 0.38,
        fiberG: 1.6
      },
      servingG: 165,
      servingLabel: "1 cup pieces",
      costTier: 1,
      aliases: ["mango"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169910: Mangos, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "papaya-raw",
      name: "Papaya, raw",
      category: "fruit",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 43,
        proteinG: 0.47,
        carbsG: 10.82,
        fatG: 0.26,
        fiberG: 1.7
      },
      servingG: 145,
      servingLabel: '1 cup 1" pieces',
      costTier: 1,
      aliases: ["papaya", "pawpaw"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 169926: Papayas, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "guava-raw",
      name: "Guava, raw",
      category: "fruit",
      regionTags: ["jamaican", "caribbean"],
      per100g: {
        kcal: 68,
        proteinG: 2.55,
        carbsG: 14.32,
        fatG: 0.95,
        fiberG: 5.4
      },
      servingG: 165,
      servingLabel: "1 cup",
      costTier: 1,
      aliases: ["guava"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 173044: Guavas, common, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "soursop-raw",
      name: "Soursop, raw",
      category: "fruit",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 66,
        proteinG: 1,
        carbsG: 16.84,
        fatG: 0.3,
        fiberG: 3.3
      },
      servingG: 225,
      servingLabel: "1 cup, pulp",
      costTier: 2,
      aliases: ["soursop", "graviola"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 167761: Soursop, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "banana-raw",
      name: "Banana, raw",
      category: "fruit",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 89,
        proteinG: 1.09,
        carbsG: 22.84,
        fatG: 0.33,
        fiberG: 2.6
      },
      servingG: 225,
      servingLabel: "1 cup, mashed",
      costTier: 1,
      aliases: ["banana"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 173944: Bananas, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    },
    {
      id: "roselle-raw",
      name: "Roselle (sorrel), raw",
      category: "fruit",
      regionTags: ["jamaican", "caribbean", "west_african"],
      per100g: {
        kcal: 49,
        proteinG: 0.96,
        carbsG: 11.31,
        fatG: 0.64
      },
      servingG: 57,
      servingLabel: "1 cup, without refuse",
      costTier: 2,
      aliases: ["roselle", "sorrel", "hibiscus"],
      staged: {
        sourceId: "usda_fdc",
        sourceFoodId: "FDC 168170: Roselle, raw",
        sourceVersion: "USDA FoodData Central, SR Legacy (April 2018 release, published 2019-04-01)",
        retrievedOn: "2026-11-15",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.",
        licenceNote: "USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published."
      }
    }
  ]
};

// packages/shared/src/food-staged.ts
var STAGED_FOOD_NOTICE = food_staged_default._notice;
var STAGED_FOODS = food_staged_default.foods;

// packages/shared/src/fixtures.ts
var NOTE = "Placeholder text for a pipeline test. Not a real movement or instruction.";
var block = (kind, title, seconds2, seated) => ({
  kind,
  title,
  seconds: seconds2,
  cue: `[Fixture] ${NOTE}`,
  lowImpactAlt: `[Fixture] ${NOTE} (low-impact version)`,
  ...seated ? { seatedAlt: `[Fixture] ${NOTE} (seated version)` } : {}
});
var fixtureWorkout = (id, title, style, minutes, level, extra = {}) => {
  const seated = style === "chair_dance" || extra.seatedSuitable === true;
  const edge = minutes === 5 ? 30 : minutes === 10 ? 60 : 90;
  const main = minutes * 60 - 2 * edge;
  return {
    id,
    title: `[Internal fixture] ${title}`,
    style,
    level,
    minutes,
    intensity: "low",
    impact: "low",
    summary: `[Fixture] Pipeline test only. ${NOTE}`,
    instructorId: null,
    equipment: "none",
    contentOrigin: "original_text",
    blocks: [
      block("warmup", "Fixture warm-up", edge, seated),
      block("main", "Fixture main block", main, seated),
      block("cooldown", "Fixture cool-down", edge, seated)
    ],
    safety: [
      "[Fixture] Placeholder safety note for a pipeline test.",
      "Stop if you feel unwell and speak to a health professional."
    ],
    fixture: true,
    ...extra
  };
};
var FIXTURE_WORKOUTS = [
  fixtureWorkout(
    "fixture-dancehall-beginner",
    "Dancehall pipeline test",
    "dancehall",
    10,
    "beginner"
  ),
  fixtureWorkout("fixture-reggae-flow", "Reggae pipeline test", "reggae", 15, "beginner"),
  fixtureWorkout(
    "fixture-chair-dance-10",
    "Chair dance pipeline test",
    "chair_dance",
    10,
    "beginner"
  ),
  fixtureWorkout("fixture-chair-dance-5", "Chair dance short test", "chair_dance", 5, "beginner"),
  fixtureWorkout(
    "fixture-seated-suitable",
    "Seated-suitable attribute test",
    "afrobeats",
    10,
    "beginner",
    {
      seatedSuitable: true
    }
  )
];
var ex = (id, name, pattern) => ({
  id,
  name: `[Internal fixture] ${name}`,
  pattern,
  equipment: "none",
  cues: [`[Fixture] ${NOTE}`],
  regression: `[Fixture] ${NOTE}`,
  progression: null,
  safety: ["[Fixture] Placeholder safety note for a pipeline test."],
  contentOrigin: "original_text",
  review: "unreviewed",
  reviewer: null,
  fixture: true
});
var FIXTURE_STRENGTH_EXERCISES = [
  ex("fixture-ex-a", "Exercise A", "squat"),
  ex("fixture-ex-b", "Exercise B", "push"),
  ex("fixture-ex-c", "Exercise C", "core")
];
var FIXTURE_STRENGTH_WORKOUTS = [
  {
    id: "fixture-strength-bodyweight",
    title: "[Internal fixture] Strength pipeline test",
    level: "beginner",
    minutes: 12,
    equipment: "none",
    warmup: { title: "Fixture warm-up", seconds: 60, cue: `[Fixture] ${NOTE}` },
    cooldown: { title: "Fixture cool-down", seconds: 60, cue: `[Fixture] ${NOTE}` },
    blocks: [
      { exerciseId: "fixture-ex-a", sets: 3, reps: 8, seconds: null, restSeconds: 45 },
      { exerciseId: "fixture-ex-b", sets: 2, reps: null, seconds: 30, restSeconds: 30 },
      { exerciseId: "fixture-ex-c", sets: 2, reps: 6, seconds: null, restSeconds: 30 }
    ],
    safety: ["[Fixture] Placeholder safety note for a pipeline test."],
    contentOrigin: "original_text",
    review: "unreviewed",
    reviewer: null,
    fixture: true
  }
];
var PLACEHOLDER_CAPTIONS = "Placeholder captions for a player test. This clip shows nothing and is not a demonstration.";
var clip = (subjectId, uri, durationS, id = `fixture-clip-${subjectId}`) => ({
  id,
  subjectId,
  kind: "video",
  uri,
  durationS,
  captions: PLACEHOLDER_CAPTIONS,
  captionCues: [
    {
      startS: 0,
      endS: durationS / 2,
      text: "Placeholder caption, first half. Not a demonstration."
    },
    {
      startS: durationS / 2,
      endS: durationS,
      text: "Placeholder caption, second half. Not a demonstration."
    }
  ],
  audioDescription: "Placeholder audio description for a player test. Nothing is shown.",
  review: "unreviewed",
  attribution: { creditLine: "[Internal fixture] placeholder, not a demonstration" },
  fixture: true
});
var FIXTURE_DEMO_CLIPS = [
  clip("fixture-ex-a", "fixture:placeholder", 12),
  clip("fixture-dancehall-beginner:1", "fixture:placeholder", 12),
  clip("home-dead-bug", "/e2e-clip.webm", 4),
  clip("home-bird-dog", "https://invalid.example.test/missing.mp4", 6)
];

// packages/shared/src/account-gate.ts
var PENDING_TTL_MS = 24 * 36e5;

// packages/shared/src/security-questions.ts
var SECURITY_QUESTIONS = [
  {
    id: "q-first-school-teacher",
    text: "What was the surname of your favourite teacher at your first school?"
  },
  {
    id: "q-childhood-street",
    text: "What was the name of the street you lived on when you were seven?"
  },
  { id: "q-first-job-place", text: "What was the name of the place where you had your first job?" },
  {
    id: "q-grandparent-home",
    text: "In which town or village did one of your grandparents grow up?"
  },
  { id: "q-first-song-danced", text: "What was the first song you remember dancing to?" },
  { id: "q-best-friend-nickname", text: "What was your childhood best friend\u2019s nickname?" },
  { id: "q-first-pet", text: "What was the name of your first pet or a pet you loved as a child?" },
  { id: "q-family-dish", text: "What dish does your family cook for celebrations?" },
  { id: "q-first-concert", text: "What was the first live show or party you went to?" },
  { id: "q-childhood-hero", text: "Who was your hero when you were ten?" },
  { id: "q-first-phone-model", text: "What was the make of your first mobile phone?" },
  { id: "q-favourite-school-subject", text: "What was your favourite subject at school?" }
];
var QUESTION_IDS = SECURITY_QUESTIONS.map((q) => q.id);
var SCRYPT = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 };

// packages/shared/src/account-core.ts
var DEFAULT_POLICY = {
  coolingOffMs: 24 * 36e5,
  txTtlMs: 15 * 6e4,
  maxFailures: 5,
  lockMs: 36e5,
  ipWindowMs: 36e5,
  ipLimits: { provision: 20, start: 10, verify: 20, complete: 20 },
  globalProvisionLimit: 300,
  staleProvisionMs: 10 * 6e4
};
var reply = (status, body) => ({ status, body });
var GENERIC_FAILURE = reply(400, { ok: false, error: "recovery_failed" });
var RATE_LIMITED = reply(429, { ok: false, error: "rate_limited" });
var INVALID = reply(400, { ok: false, error: "invalid_request" });
var UNAUTHENTICATED = reply(401, { ok: false, error: "unauthenticated" });

// packages/shared/src/account-memory-db.ts
var COMPLETE_WINDOW_MS = 72 * 36e5;

// packages/shared/src/recipes.ts
var r = (id, name, mealTypes, regionTags, servings, prepMinutes, ingredients, steps) => ({
  id,
  name,
  mealTypes,
  regionTags,
  servings,
  prepMinutes,
  steps,
  ingredients: ingredients.map(([foodId, grams, o]) => ({
    foodId,
    grams,
    ...o ? { optional: true } : {}
  }))
});
var RECIPES = [
  r(
    "oats-banana-pb",
    "Banana peanut-butter oats",
    ["breakfast"],
    ["global"],
    1,
    5,
    [
      ["oatmeal", 240],
      ["banana", 118],
      ["peanut-butter", 16]
    ],
    ["Warm the oatmeal.", "Slice the banana on top.", "Stir in the peanut butter."]
  ),
  r(
    "egg-toast-avocado",
    "Egg and avocado toast",
    ["breakfast"],
    ["global"],
    1,
    10,
    [
      ["whole-wheat-bread", 80],
      ["boiled-egg", 100],
      ["avocado", 50]
    ],
    ["Toast the bread.", "Mash the avocado onto it.", "Slice the eggs on top."]
  ),
  r(
    "yogurt-mango-nuts",
    "Yogurt, mango and nuts",
    ["breakfast", "snack"],
    ["global"],
    1,
    3,
    [
      ["plain-yogurt", 170],
      ["mango", 100],
      ["mixed-nuts", 20]
    ],
    ["Spoon the yogurt into a bowl.", "Add the mango and nuts."]
  ),
  r(
    "pancakes-banana",
    "Pancakes with banana",
    ["breakfast"],
    ["american", "global"],
    1,
    10,
    [
      ["pancakes", 130],
      ["banana", 118]
    ],
    ["Warm the pancakes.", "Top with sliced banana."]
  ),
  r(
    "plantain-egg-stew",
    "Boiled plantain, egg and tomato stew",
    ["breakfast", "lunch"],
    ["west_african", "caribbean"],
    1,
    20,
    [
      ["boiled-plantain", 150],
      ["boiled-egg", 100],
      ["tomato-stew", 100]
    ],
    ["Boil the plantain until soft.", "Warm the tomato stew.", "Serve with the sliced eggs."]
  ),
  r(
    "roti-chickpea",
    "Roti with spiced chickpeas",
    ["breakfast", "lunch"],
    ["south_asian", "caribbean"],
    1,
    15,
    [
      ["roti", 90],
      ["chickpeas", 160],
      ["spinach-cooked", 60, "optional"]
    ],
    ["Warm the chickpeas with your spices.", "Fold in the spinach.", "Serve with the roti."]
  ),
  r(
    "jollof-chicken-salad",
    "Jollof rice, grilled chicken and salad",
    ["lunch", "dinner"],
    ["west_african"],
    1,
    25,
    [
      ["jollof-rice", 200],
      ["grilled-chicken", 120],
      ["mixed-salad", 80]
    ],
    ["Warm the jollof rice.", "Grill or reheat the chicken.", "Serve with the salad."]
  ),
  r(
    "rice-peas-jerk",
    "Rice and peas with jerk chicken",
    ["lunch", "dinner"],
    ["caribbean"],
    1,
    30,
    [
      ["rice-and-peas", 200],
      ["jerk-chicken", 130],
      ["mixed-salad", 80, "optional"]
    ],
    ["Warm the rice and peas.", "Heat the jerk chicken through.", "Serve with salad."]
  ),
  r(
    "goat-curry-roti",
    "Goat curry with roti and greens",
    ["dinner"],
    ["caribbean", "south_asian"],
    1,
    40,
    [
      ["goat-curry", 180],
      ["roti", 90],
      ["spinach-cooked", 90]
    ],
    ["Simmer the curry until hot.", "Warm the roti.", "Serve with the greens."]
  ),
  r(
    "egusi-yam",
    "Egusi soup with boiled yam",
    ["lunch", "dinner"],
    ["west_african"],
    1,
    35,
    [
      ["egusi-soup", 200],
      ["yam-boiled", 150],
      ["spinach-cooked", 60, "optional"]
    ],
    ["Boil the yam.", "Warm the egusi soup.", "Serve together."]
  ),
  r(
    "tilapia-yam-stew",
    "Grilled tilapia, yam and tomato stew",
    ["lunch", "dinner"],
    ["west_african"],
    1,
    30,
    [
      ["grilled-tilapia", 140],
      ["yam-boiled", 150],
      ["tomato-stew", 100]
    ],
    ["Grill the tilapia.", "Boil the yam.", "Serve with the stew."]
  ),
  r(
    "beef-stew-rice",
    "Beef stew with rice",
    ["dinner"],
    ["west_african", "caribbean"],
    1,
    35,
    [
      ["beef-stew", 200],
      ["white-rice", 150],
      ["broccoli", 90, "optional"]
    ],
    ["Cook the rice.", "Warm the stew.", "Serve with the broccoli."]
  ),
  r(
    "lentil-rice-greens",
    "Lentils, brown rice and greens",
    ["lunch", "dinner"],
    ["south_asian", "global"],
    1,
    30,
    [
      ["lentils", 180],
      ["brown-rice", 150],
      ["spinach-cooked", 90]
    ],
    ["Cook the rice.", "Warm the lentils with your spices.", "Add the greens."]
  ),
  r(
    "black-bean-bowl",
    "Black bean rice bowl",
    ["lunch", "dinner"],
    ["latin_american", "global"],
    1,
    20,
    [
      ["black-beans", 170],
      ["white-rice", 150],
      ["avocado", 50],
      ["mixed-salad", 60, "optional"]
    ],
    ["Cook the rice.", "Warm the beans.", "Top with avocado and salad."]
  ),
  r(
    "tikka-rice",
    "Chicken tikka masala with rice",
    ["dinner"],
    ["south_asian"],
    1,
    30,
    [
      ["chicken-tikka-masala", 200],
      ["white-rice", 150],
      ["mixed-salad", 60, "optional"]
    ],
    ["Cook the rice.", "Warm the tikka masala.", "Serve with salad."]
  ),
  r(
    "tofu-stirfry",
    "Tofu and broccoli with rice",
    ["lunch", "dinner"],
    ["asian", "global"],
    1,
    20,
    [
      ["tofu", 150],
      ["broccoli", 120],
      ["white-rice", 150]
    ],
    ["Cook the rice.", "Pan-fry the tofu.", "Add the broccoli and stir until just tender."]
  ),
  r(
    "salmon-sweet-potato",
    "Baked salmon, sweet potato and broccoli",
    ["dinner"],
    ["global"],
    1,
    30,
    [
      ["baked-salmon", 140],
      ["sweet-potato", 150],
      ["broccoli", 90]
    ],
    ["Bake the salmon and the sweet potato.", "Steam the broccoli."]
  ),
  r(
    "chicken-pasta-veg",
    "Chicken pasta with greens",
    ["lunch", "dinner"],
    ["mediterranean", "global"],
    1,
    25,
    [
      ["pasta", 180],
      ["grilled-chicken", 120],
      ["spinach-cooked", 60]
    ],
    ["Cook the pasta.", "Slice the chicken.", "Toss everything together."]
  ),
  r(
    "falafel-pita",
    "Falafel pita with hummus and salad",
    ["lunch"],
    ["mediterranean"],
    1,
    10,
    [
      ["pita-bread", 60],
      ["falafel", 80],
      ["hummus", 60],
      ["greek-salad", 150, "optional"]
    ],
    ["Warm the pita.", "Fill with falafel and hummus.", "Serve with salad."]
  ),
  r(
    "greek-chickpea-bowl",
    "Greek salad with chickpeas and pita",
    ["lunch"],
    ["mediterranean"],
    1,
    10,
    [
      ["greek-salad", 150],
      ["chickpeas", 120],
      ["pita-bread", 60]
    ],
    ["Combine the salad and chickpeas.", "Serve with the pita."]
  ),
  r(
    "paneer-spinach",
    "Paneer, spinach and roti",
    ["lunch", "dinner"],
    ["south_asian"],
    1,
    20,
    [
      ["paneer", 80],
      ["spinach-cooked", 120],
      ["roti", 90]
    ],
    ["Pan-fry the paneer.", "Add the spinach.", "Serve with the roti."]
  ),
  r(
    "fried-rice-egg",
    "Egg fried rice with broccoli",
    ["lunch", "dinner"],
    ["asian", "global"],
    1,
    15,
    [
      ["fried-rice", 200],
      ["boiled-egg", 50],
      ["broccoli", 90]
    ],
    ["Warm the fried rice.", "Add the chopped egg and broccoli."]
  ),
  r(
    "fruit-nut-snack",
    "Apple with peanut butter",
    ["snack"],
    ["global"],
    1,
    2,
    [
      ["apple", 180],
      ["peanut-butter", 16]
    ],
    ["Slice the apple.", "Dip in the peanut butter."]
  ),
  r(
    "plantain-bean-plate",
    "Plantain and black bean plate",
    ["lunch", "dinner"],
    ["caribbean", "latin_american"],
    1,
    20,
    [
      ["fried-plantain", 100],
      ["black-beans", 170],
      ["white-rice", 100, "optional"]
    ],
    ["Warm the beans.", "Fry or warm the plantain.", "Serve with the rice if using."]
  )
];
var RECIPE_BY_ID = new Map(RECIPES.map((x) => [x.id, x]));

// packages/shared/src/social-server.ts
var done = (extra = {}) => ({
  status: 200,
  body: { ok: true, ...extra }
});
var Invalid = class extends Error {
  constructor(field) {
    super("invalid_input");
    this.field = field;
  }
  field;
};
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var USERNAME = /^[a-z][a-z0-9_]{2,19}$/;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var DAY = /^\d{4}-\d{2}-\d{2}$/;
function username(b2, k2) {
  const v = b2[k2];
  if (typeof v !== "string") throw new Invalid(k2);
  const n = v.trim().toLowerCase();
  if (!USERNAME.test(n) || n.includes("__") || n.endsWith("_")) throw new Invalid(k2);
  return n;
}
var bool = (b2, k2) => {
  if (typeof b2[k2] !== "boolean") throw new Invalid(k2);
  return b2[k2];
};
var uuid = (b2, k2) => {
  const v = b2[k2];
  if (typeof v !== "string" || !UUID.test(v)) throw new Invalid(k2);
  return v.toLowerCase();
};
function day(b2, k2) {
  const v = b2[k2];
  if (typeof v !== "string" || !DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || (/* @__PURE__ */ new Date(`${v}T00:00:00Z`)).toISOString().slice(0, 10) !== v)
    throw new Invalid(k2);
  return v;
}
function oneOf(b2, k2, allowed) {
  const v = b2[k2];
  if (typeof v !== "string" || !allowed.includes(v)) throw new Invalid(k2);
  return v;
}
var SOCIAL_RATE = {
  read: ["social-read", 90, 60],
  write: ["social-write", 30, 60],
  ask: ["social-ask", 12, 60],
  claim: ["social-claim", 6, 3600]
};
var rpc = (c, fn, args) => c.deps.rpc.call(fn, args);
var ROUTES = {
  overview: {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({ overview: await rpc(c, "social_overview", { p_user: c.user }) })
  },
  profile: {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({ profile: await rpc(c, "community_profile", { p_user: c.user }) })
  },
  "username/claim": {
    limit: SOCIAL_RATE.claim,
    run: async (c) => {
      const name = username(c.body, "username");
      const r2 = await rpc(c, "community_claim_username", { p_user: c.user, p_name: name });
      return done({ username: typeof r2 === "string" ? r2 : name });
    }
  },
  "friend/request": {
    limit: SOCIAL_RATE.ask,
    run: async (c) => done({
      status: await rpc(c, "social_request", {
        p_user: c.user,
        p_name: username(c.body, "username")
      })
    })
  },
  "friend/respond": {
    limit: SOCIAL_RATE.write,
    run: async (c) => {
      await rpc(c, "social_respond", {
        p_user: c.user,
        p_name: username(c.body, "username"),
        p_accept: bool(c.body, "accept")
      });
      return done();
    }
  },
  "friend/cancel": {
    limit: SOCIAL_RATE.write,
    run: async (c) => (await rpc(c, "social_cancel", { p_user: c.user, p_name: username(c.body, "username") }), done())
  },
  "friend/remove": {
    limit: SOCIAL_RATE.write,
    run: async (c) => (await rpc(c, "social_remove", { p_user: c.user, p_name: username(c.body, "username") }), done())
  },
  block: {
    limit: SOCIAL_RATE.write,
    run: async (c) => (await rpc(c, "social_block", { p_user: c.user, p_name: username(c.body, "username") }), done())
  },
  unblock: {
    limit: SOCIAL_RATE.write,
    run: async (c) => (await rpc(c, "social_unblock", { p_user: c.user, p_name: username(c.body, "username") }), done())
  },
  "share/set": {
    limit: SOCIAL_RATE.write,
    run: async (c) => {
      if (typeof c.body.category !== "string" || c.body.category.length > 40)
        throw new Invalid("category");
      await rpc(c, "social_set_share", {
        p_user: c.user,
        p_name: username(c.body, "username"),
        p_category: c.body.category,
        p_on: bool(c.body, "on")
      });
      return done();
    }
  },
  "share/get": {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({
      shares: await rpc(c, "social_shares_with", {
        p_user: c.user,
        p_name: username(c.body, "username")
      })
    })
  },
  "share/revoke-all": {
    limit: SOCIAL_RATE.write,
    run: async (c) => done({ withdrawn: await rpc(c, "social_revoke_all", { p_user: c.user }) })
  },
  "friend/view": {
    limit: SOCIAL_RATE.read,
    run: async (c) => {
      const r2 = await rpc(c, "social_view_friend", {
        p_user: c.user,
        p_name: username(c.body, "username")
      });
      return done(isObj(r2) ? { username: r2.username, activity: r2.activity ?? null } : {});
    }
  },
  "group/create": {
    limit: SOCIAL_RATE.write,
    run: async (c) => {
      const b2 = c.body;
      const kind = oneOf(b2, "kind", ["challenge", "couple", "family"]);
      const metric = oneOf(b2, "metric", ["active_minutes", "active_days"]);
      if (typeof b2.title !== "string" || b2.title.trim().length < 1 || b2.title.length > 60)
        throw new Invalid("title");
      const target = b2.target === void 0 || b2.target === null ? null : b2.target;
      if (target !== null && (typeof target !== "number" || !Number.isInteger(target) || target < 1 || target > 1e5))
        throw new Invalid("target");
      if (!Array.isArray(b2.invite) || b2.invite.length > 12) throw new Invalid("invite");
      const invite = b2.invite.map((n) => username({ n }, "n"));
      const id = await rpc(c, "social_create_group", {
        p_user: c.user,
        p_kind: kind,
        p_title: b2.title,
        p_metric: metric,
        p_target: target,
        p_start: day(b2, "startDay"),
        p_end: day(b2, "endDay"),
        p_invite: invite
      });
      return done({ id });
    }
  },
  "group/respond": {
    limit: SOCIAL_RATE.write,
    run: async (c) => (await rpc(c, "social_respond_group", {
      p_user: c.user,
      p_group: uuid(c.body, "groupId"),
      p_accept: bool(c.body, "accept")
    }), done())
  },
  "group/leave": {
    limit: SOCIAL_RATE.write,
    run: async (c) => (await rpc(c, "social_leave_group", { p_user: c.user, p_group: uuid(c.body, "groupId") }), done())
  },
  "group/sync": {
    limit: SOCIAL_RATE.write,
    run: async (c) => done({
      days: await rpc(c, "social_sync_group", {
        p_user: c.user,
        p_group: uuid(c.body, "groupId")
      })
    })
  },
  "gm/state": {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({ state: await rpc(c, "gm_state", { p_user: c.user }) })
  },
  "gm/sync": {
    // The server reads the person's OWN records (ids, times, durations, days), runs the shared engine, and records the result. The client sends only its
    // personal preferences (a weekly target of 1 to 5 days and planned rest weekdays), which are normalised here and only change how easy a personal goal is.
    limit: SOCIAL_RATE.write,
    run: async (c) => {
      const raw = isObj(c.body.prefs) ? c.body.prefs : {};
      const prefs = normalizePrefs({
        enabled: true,
        targetDaysPerWeek: typeof raw.targetDaysPerWeek === "number" ? raw.targetDaysPerWeek : void 0,
        restWeekdays: Array.isArray(raw.restWeekdays) ? raw.restWeekdays : void 0
      });
      const inputs = await rpc(c, "gm_inputs", { p_user: c.user });
      if (!isObj(inputs)) throw new Error("server_error");
      const g = computeGamification({ ...inputs, prefs });
      const ledger = await rpc(c, "gm_record", { p_user: c.user, p_events: g.events.slice(-400) });
      return done({
        totalXp: isObj(ledger) ? ledger.totalXp : g.totalXp,
        weekXp: isObj(ledger) ? ledger.weekXp : g.weekXp,
        level: g.level,
        streak: g.streak,
        restNudge: g.restNudge,
        dailyQuests: g.dailyQuests,
        weeklyQuests: g.weeklyQuests,
        badges: g.badges,
        cosmetics: g.cosmetics,
        seasonal: {
          id: g.seasonal.season.id,
          activeDays: g.seasonal.activeDays,
          goalDays: g.seasonal.season.goalDays,
          done: g.seasonal.done
        }
      });
    }
  },
  "gm/league": {
    limit: SOCIAL_RATE.read,
    run: async (c) => done({ league: await rpc(c, "gm_league", { p_user: c.user }) })
  },
  "gm/league/optin": {
    limit: SOCIAL_RATE.write,
    run: async (c) => (await rpc(c, "gm_set_league", { p_user: c.user, p_on: bool(c.body, "on") }), done())
  }
};
var SOCIAL_ROUTES = Object.keys(ROUTES);

// packages/ai/src/cost.ts
var PLACEHOLDER_PRICES = {
  "mock-small": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  "mock-large": { inputUsdPerMTok: 3, outputUsdPerMTok: 15 }
};
function costUsd(price, usage) {
  return (usage.inputTokens * price.inputUsdPerMTok + usage.outputTokens * price.outputUsdPerMTok) / 1e6;
}
function maxCostUsd(price, inputTokens, maxOutputTokens) {
  return costUsd(price, { inputTokens, outputTokens: maxOutputTokens });
}

// packages/ai/src/budget.ts
var ALERT_THRESHOLDS = [0.5, 0.8, 0.9, 1];
var newBudget = (ceilingUsd = DEFAULT_AI_MONTHLY_BUDGET_USD) => ({
  ceilingUsd,
  settledUsd: 0,
  reservedUsd: 0
});
var committedUsd = (b2) => b2.settledUsd + b2.reservedUsd;
function reserve(b2, worstCaseUsd) {
  if (!(worstCaseUsd >= 0) || committedUsd(b2) + worstCaseUsd > b2.ceilingUsd) {
    return { ok: false, reason: "budget_exhausted" };
  }
  return { ok: true, budget: { ...b2, reservedUsd: b2.reservedUsd + worstCaseUsd } };
}
function settle(b2, reservedUsd, actualUsd) {
  return {
    ...b2,
    reservedUsd: Math.max(0, b2.reservedUsd - reservedUsd),
    settledUsd: b2.settledUsd + actualUsd
  };
}
function crossedThresholds(ceilingUsd, beforeUsd, afterUsd) {
  return ALERT_THRESHOLDS.filter((t2) => beforeUsd < ceilingUsd * t2 && afterUsd >= ceilingUsd * t2);
}

// packages/ai/src/ports.ts
var InMemoryBudgetPort = class {
  constructor(state) {
    this.state = state;
  }
  state;
  async reserve(_month, worstUsd) {
    const r2 = reserve(this.state, worstUsd);
    if (r2.ok) this.state = r2.budget;
    return r2.ok;
  }
  async settle(_month, reservedUsd, actualUsd) {
    this.state = settle(this.state, reservedUsd, actualUsd);
    return { settledUsd: this.state.settledUsd, ceilingUsd: this.state.ceilingUsd };
  }
};

// packages/ai/src/schemas.ts
import { z as z2 } from 'npm:zod@4.6.7';
var confidence = z2.enum(["low", "medium", "high"]);
var foodPhotoItemSchema = z2.object({
  name: z2.string().min(1).max(80),
  likelyIngredients: z2.array(z2.string().max(60)).max(12),
  gramsLow: z2.number().positive(),
  gramsHigh: z2.number().positive(),
  confidence,
  /** Suggested reference-database search terms; the server grounds each item in nutrition reference data. */
  referenceQuery: z2.string().min(1).max(80)
});
var foodPhotoResponseSchema = z2.object({
  items: z2.array(foodPhotoItemSchema).max(15),
  /** Always true: the UI must present the result as an editable estimate. */
  isEstimate: z2.literal(true),
  notes: z2.string().max(280).optional()
}).refine((r2) => r2.items.every((i) => i.gramsHigh >= i.gramsLow), "gramsHigh must be >= gramsLow");
var isoDate = z2.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var planModeSchema = z2.enum(["normal", "busy", "travel", "comeback"]);
var proposedChangeSchema = z2.discriminatedUnion("kind", [
  z2.object({
    kind: z2.literal("update_daily_plan"),
    summary: z2.string().min(1).max(200),
    payload: z2.object({ mode: planModeSchema, date: isoDate.optional() }).strict()
  }),
  z2.object({
    kind: z2.literal("add_workout"),
    summary: z2.string().min(1).max(200),
    payload: z2.object({
      workoutId: z2.string().min(1).max(80),
      plannedFor: isoDate,
      lowImpact: z2.boolean().optional()
    }).strict()
  }),
  z2.object({
    kind: z2.literal("swap_meal"),
    summary: z2.string().min(1).max(200),
    payload: z2.object({
      fromFoodId: z2.string().max(60),
      toFoodId: z2.string().max(60),
      grams: z2.number().positive().max(2e3)
    }).strict()
  }),
  z2.object({
    kind: z2.literal("adjust_goal"),
    summary: z2.string().min(1).max(200),
    // `replacePeriod` names the goal this one replaces (so it can be ended on confirmation). There is deliberately no target field.
    payload: z2.object({
      type: z2.enum(["lose", "maintain", "gain"]),
      period: z2.enum(["weekly", "monthly", "yearly"]),
      replacePeriod: z2.enum(["weekly", "monthly", "yearly"]).optional()
    }).strict()
  }),
  z2.object({
    kind: z2.literal("add_habit"),
    summary: z2.string().min(1).max(200),
    payload: z2.object({ title: z2.string().min(1).max(80) }).strict()
  })
]);
var conciergeResponseSchema = z2.object({
  message: z2.string().min(1).max(1500),
  /** Why the assistant suggested this, in plain language (transparent recommendations). */
  because: z2.array(z2.string().max(200)).max(5),
  proposedChanges: z2.array(proposedChangeSchema).max(5),
  /** Set when the assistant steered toward professional or crisis support instead of coaching. */
  supportReferral: z2.boolean().default(false)
});
var weeklyReviewResponseSchema = z2.object({
  highlights: z2.array(z2.string().max(200)).min(1).max(5),
  nonScaleWins: z2.array(z2.string().max(200)).max(5),
  suggestions: z2.array(z2.string().max(200)).max(3),
  /** Tone guard: the review never shames; the validator in the gateway also rejects guilt language. */
  tone: z2.literal("encouraging")
});
var AI_RESPONSE_SCHEMAS = {
  food_photo: foodPhotoResponseSchema,
  concierge_chat: conciergeResponseSchema,
  weekly_review: weeklyReviewResponseSchema
};
var GUILT_LANGUAGE = /\b(you failed|lazy|you should be ashamed|bad food|cheat(ed|ing)? day|no excuses|disappointing)\b/i;
var containsGuiltLanguage = (text) => GUILT_LANGUAGE.test(text);

// packages/ai/src/gateway.ts
var AiGateway = class {
  constructor(provider, usage, cfg, budget = newBudget(), ports = {}) {
    this.provider = provider;
    this.usage = usage;
    this.cfg = cfg;
    this.ports = ports;
    this.budgetPort = ports.budget ?? new InMemoryBudgetPort(budget);
  }
  provider;
  usage;
  cfg;
  ports;
  budgetPort;
  /** In-process budget state (only when no external budget port is used). */
  get budget() {
    if (this.budgetPort instanceof InMemoryBudgetPort) return this.budgetPort.state;
    throw new Error("Budget lives in the external budget port.");
  }
  async run(req) {
    return (await this.runDetailed(req)).data;
  }
  /** Like `run`, but also reports the outcome so callers can tell a fixed safety redirect from a normal answer. */
  async runDetailed(req) {
    const at = this.cfg.now();
    const month = at.toISOString().slice(0, 7);
    const staff = this.ports.staff ? await this.ports.staff.load() : { killAll: this.cfg.killAll, killFeatures: this.cfg.killFeatures };
    if (staff.killAll || staff.killFeatures[req.feature]) {
      throw new AppError("feature_disabled", "This feature is temporarily unavailable.");
    }
    if (await this.ports.userPause?.isPaused(req.userId)) {
      throw new AppError(
        "ai_paused",
        "AI is paused in your settings. You can turn it back on any time."
      );
    }
    if (req.feature === "concierge_chat") {
      const screen = screenCoachInput(req.userText ?? req.prompt);
      if (screen.kind !== "ok") {
        await this.usage.record({
          userId: req.userId,
          feature: req.feature,
          model: "none",
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          outcome: screen.kind === "risk" ? "risk_referral" : "safety_redirect",
          at: at.toISOString()
        });
        const r2 = SAFE_REDIRECT_MESSAGES[screen.kind];
        return {
          outcome: screen.kind === "risk" ? "risk_referral" : "safety_redirect",
          data: {
            message: r2.message,
            because: r2.because,
            proposedChanges: [],
            supportReferral: r2.supportReferral
          }
        };
      }
    }
    const used = this.ports.quota ? 0 : await this.usage.monthlyCount(req.userId, req.feature, month);
    const access = checkAiAccess({
      entitlement: req.entitlement,
      feature: req.feature,
      usedThisMonth: used,
      flags: this.cfg.flags,
      now: at
    });
    if (!access.allowed) {
      throw access.reason === "quota_used" || access.reason === "not_in_tier" ? new AppError("quota_exceeded", "You have used this feature\u2019s allowance for the month.") : new AppError("feature_disabled", "This feature is not available yet.");
    }
    let quotaTaken = false;
    if (this.ports.quota) {
      const limit = access.remaining;
      quotaTaken = await this.ports.quota.consume(req.userId, month, req.feature, limit);
      if (!quotaTaken)
        throw new AppError(
          "quota_exceeded",
          "You have used this feature\u2019s allowance for the month."
        );
    }
    const refundQuota = async () => {
      if (quotaTaken) await this.ports.quota.refund(req.userId, month, req.feature);
    };
    const model = this.cfg.models[req.feature];
    const price = PLACEHOLDER_PRICES[model];
    if (!price) {
      await refundQuota();
      throw new AppError("internal", "Model pricing is not configured.");
    }
    const inputTokens = Math.ceil(req.prompt.length / 4) + (req.hasImage ? 1600 : 0);
    const worst = maxCostUsd(price, inputTokens, this.cfg.maxOutputTokens);
    const reserved = await this.budgetPort.reserve(month, worst, this.cfg.budgetCeilingUsd ?? 50);
    if (!reserved) {
      await refundQuota();
      throw new AppError(
        "budget_exhausted",
        "AI features are paused for now. Please try again later."
      );
    }
    try {
      const raw = await this.provider.complete({
        feature: req.feature,
        model,
        prompt: req.prompt,
        hasImage: req.hasImage,
        maxOutputTokens: this.cfg.maxOutputTokens
      });
      const actual = costUsd(price, raw.usage);
      const after = await this.budgetPort.settle(month, worst, actual);
      const beforeUsd = after.settledUsd - actual;
      for (const t2 of crossedThresholds(after.ceilingUsd, beforeUsd, after.settledUsd))
        this.cfg.onAlert?.(t2, {
          ceilingUsd: after.ceilingUsd,
          settledUsd: after.settledUsd,
          reservedUsd: 0
        });
      const parsed = AI_RESPONSE_SCHEMAS[req.feature].safeParse(raw.json);
      const base2 = {
        userId: req.userId,
        feature: req.feature,
        model,
        inputTokens: raw.usage.inputTokens,
        outputTokens: raw.usage.outputTokens,
        costUsd: actual,
        at: at.toISOString()
      };
      if (!parsed.success) {
        await this.usage.record({ ...base2, outcome: "schema_rejected" });
        throw new AppError(
          "upstream_failure",
          "We could not prepare that safely. Please try again."
        );
      }
      const shown = JSON.stringify(parsed.data);
      if (containsGuiltLanguage(shown) || unsafeOutputProblems(shown).length > 0) {
        await this.usage.record({ ...base2, outcome: "output_rejected" });
        throw new AppError(
          "upstream_failure",
          "We could not prepare that safely. Please try again."
        );
      }
      await this.usage.record({ ...base2, outcome: "ok" });
      return { data: parsed.data, outcome: "ok" };
    } catch (e) {
      if (e instanceof AppError) throw e;
      await this.budgetPort.settle(month, worst, 0);
      await refundQuota();
      await this.usage.record({
        userId: req.userId,
        feature: req.feature,
        model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        outcome: "provider_error",
        at: at.toISOString()
      });
      throw new AppError("upstream_failure", "The assistant is unavailable right now.", {
        cause: e
      });
    }
  }
};

// packages/ai/src/coach-mock.ts
var clampMin = (m, d) => m === 5 || m === 10 || m === 15 ? m : d;
function reasons(c, extra = []) {
  const r2 = [...extra];
  if (!c.personalized) r2.push("Personalization is off, so this is general guidance.");
  else {
    if (c.activity)
      r2.push(
        c.activity.sessionsThisWeek > 0 ? `You have done ${c.activity.sessionsThisWeek} session(s) this week.` : "No sessions are logged yet this week, and that is fine."
      );
    if (c.lowImpact) r2.push("Low-impact options come first because of your readiness answers.");
    if (c.food)
      r2.push(
        c.food.mealsToday > 0 ? `You have logged ${c.food.mealsToday} meal(s) today.` : "No meals are logged yet today."
      );
  }
  return r2.slice(0, 5);
}
function composeCoachReply(userText, c) {
  const { intent, minutes } = classifyIntent(userText);
  const lowOnly = !!c.lowImpact || c.mode === "comeback";
  const today = c.today;
  const quick = (m, low = lowOnly) => suggestQuickFit({ minutes: m, lowImpactOnly: low, seed: c.localHour });
  const addWorkout = (w, date = today, low = lowOnly) => ({
    kind: "add_workout",
    summary: `Schedule ${w.title} (${w.minutes} min) for ${date === today ? "today" : date}`,
    payload: { workoutId: w.id, plannedFor: date, lowImpact: low }
  });
  switch (intent) {
    case "busy": {
      const w = quick(clampMin(minutes, 5), lowOnly);
      return {
        message: `Short on time? Even ${w?.minutes ?? 5} minutes counts. ${w ? `${w.title} fits.` : ""} I can switch today to a lighter plan if you like.`,
        because: reasons(c, ["Short sessions are easier to keep up on busy days."]),
        proposedChanges: [
          {
            kind: "update_daily_plan",
            summary: "Switch today to a light Busy-Day plan",
            payload: { mode: "busy", date: today }
          },
          ...w ? [addWorkout(w)] : []
        ]
      };
    }
    case "travel": {
      const w = quick(10, true);
      return {
        message: "Travelling is a great time for something flexible: a gentle, low-impact session needs no equipment and little space. Eating out? Enjoy it and use Swap ideas if you want options.",
        because: reasons(c, ["Travel changes your routine, so flexible beats strict."]),
        proposedChanges: [
          {
            kind: "update_daily_plan",
            summary: "Switch today to a Travel plan",
            payload: { mode: "travel", date: today }
          },
          ...w ? [addWorkout(w, today, true)] : []
        ]
      };
    }
    case "comeback": {
      const away = c.comeback?.daysAway;
      return {
        message: `Welcome back${away ? `: it has been ${away} days and that is completely okay` : ""}. There is nothing to make up. Let's ease in with three short, low-impact sessions over the week.`,
        because: reasons(c, [
          "Returning gradually lowers the chance of soreness and keeps it enjoyable."
        ]),
        proposedChanges: [
          {
            kind: "update_daily_plan",
            summary: "Switch today to a gentle Comeback plan",
            payload: { mode: "comeback", date: today }
          },
          ...comebackSessions(today).map((s) => {
            const w = WORKOUT_BY_ID.get(s.workoutId);
            return {
              kind: "add_workout",
              summary: `${w.title} (${w.minutes} min) on ${s.plannedFor === today ? "today" : s.plannedFor}`,
              payload: { workoutId: w.id, plannedFor: s.plannedFor, lowImpact: true }
            };
          })
        ]
      };
    }
    case "workout_request": {
      const w = quick(clampMin(minutes, 10));
      return {
        message: w ? `How about ${w.title}? It is ${w.minutes} minutes, ${w.intensity === "low" ? "gentle" : w.intensity === "moderate" ? "moderate" : "high-energy"}, with a low-impact version you can switch to any time.` : "I could not find a matching session right now.",
        because: reasons(c, ["It matches the length you asked for."]),
        proposedChanges: w ? [addWorkout(w)] : []
      };
    }
    case "food_swap": {
      const item = [...c.food?.lastMealItems ?? []].filter((i) => i.foodId).sort((a, b2) => b2.kcal - a.kcal)[0];
      const hidden = c.wellness?.numbersHidden === true;
      const swap = item ? suggestSwaps(
        { foodId: item.foodId, grams: item.grams, kcal: item.kcal },
        hidden ? "more_fiber" : "lighter"
      )[0] : void 0;
      if (item && swap) {
        const from = FOOD_BY_ID.get(item.foodId);
        return {
          message: hidden ? `A comparable swap for ${from.name} is ${swap.food.name}, which has more fiber. These are ideas, not rules, and both are fine.` : `A comparable swap for ${from.name} is ${swap.food.name}: ${swap.reason}. These are ideas, not rules, and both are fine.`,
          because: reasons(c, ["I compared equal portions using the sample reference data."]),
          proposedChanges: [
            {
              kind: "swap_meal",
              summary: `Try ${swap.food.name} instead of ${from.name} next time`,
              payload: { fromFoodId: from.id, toFoodId: swap.food.id, grams: item.grams }
            }
          ]
        };
      }
      return {
        message: "Open Swap ideas in the Food tab, pick a food, and I can compare options with it. Log a meal first and I can suggest one from it.",
        because: reasons(c),
        proposedChanges: []
      };
    }
    case "goal_too_hard": {
      const g = c.goals?.[0];
      return {
        message: "Goals should fit your life, not the other way round. A gentler timeframe is a perfectly good choice, and you can change it again any time.",
        because: reasons(c, ["A steady pace is easier to sustain."]),
        proposedChanges: g ? [
          {
            kind: "adjust_goal",
            summary: `Replace your ${g.period} goal with a gentler monthly one`,
            payload: { type: g.type, period: "monthly", replacePeriod: g.period }
          }
        ] : []
      };
    }
    case "weight_question": {
      const t2 = c.weightTrend;
      return {
        message: `Weight moves day to day with water, food timing and sleep, so the overall direction matters more than any single number.${t2 ? ` Lately it looks ${t2 === "steady" ? "fairly steady" : t2 === "down" ? "to be drifting down" : "to be drifting up"}, which is normal variation.` : ""} Progress is also energy, mood, strength and how much you enjoy moving.`,
        because: reasons(c, ["Weight is only one part of progress."]),
        proposedChanges: []
      };
    }
    case "plan_explain": {
      const items = (c.plan?.items ?? []).slice(0, 5);
      return {
        message: items.length ? `Here is why each suggestion is in today's plan: ${items.map((i) => `${i.title}: ${i.why ?? "a small, optional step"}${i.done ? " (done)" : ""}`).join("; ")}. You can skip any of it.` : 'Open the Daily Fit Plan on the Coach tab and tap "Why" on any item to see the reason. Every suggestion is rule-based, optional and based only on what you have logged.',
        because: reasons(c, ["Suggestions come from simple rules, not from a model."]),
        proposedChanges: []
      };
    }
    case "plateau": {
      const wl = c.wellness;
      if (wl?.numbersHidden)
        return {
          message: "Progress is more than any number. If food or weight feel hard right now, it is completely okay to focus on how you feel, sleep and the movement you enjoy. A doctor or registered dietitian can give support that fits you.",
          because: reasons(c, ["You asked us not to focus on numbers."]),
          proposedChanges: [],
          supportReferral: true
        };
      const notes = [];
      if (wl && wl.sleepAvgHours !== null && wl.sleepAvgHours < 7)
        notes.push(`you logged about ${wl.sleepAvgHours} hours of sleep on average`);
      if (wl && wl.walkMinutesWeek === 0 && wl.strengthSessionsWeek === 0 && !c.activity?.sessionsThisWeek)
        notes.push("no movement is logged this week");
      return {
        message: `Plateaus are common and usually temporary. Weight moves day to day with water, hormones, sleep and stress, so one flat stretch rarely means anything is wrong. Look at the 2 to 3 week direction, and at other signs like energy, strength and how clothes fit.${notes.length ? ` From what you logged: ${notes.join(" and ")}, which can matter.` : ""} Avoid cutting food sharply; that tends to backfire. If you are worried, a doctor or registered dietitian can look at your whole picture.`,
        because: reasons(c, ["This is general education, not a diagnosis."]),
        proposedChanges: []
      };
    }
    case "recovery": {
      const wl = c.wellness;
      const lowSleep = !wl?.numbersHidden && wl?.sleepAvgHours != null && wl.sleepAvgHours < 6.5;
      const w = quick(5, true);
      return {
        message: `Rest is part of progress. ${wl?.recoveryToday === "sore" || wl?.recoveryToday === "worn" ? `You said your body feels ${wl.recoveryToday === "worn" ? "worn out" : "sore"} today, so ` : "On days like this "}a gentle walk, light stretching or a short low-impact session can feel better than pushing, and taking the day off is fine.${lowSleep ? ` You logged about ${wl.sleepAvgHours} hours of sleep on average this week; a regular wind-down time may help.` : ""} If pain is sharp or lasts, please see a health professional.`,
        because: reasons(c, ["Recovery supports energy and keeps movement enjoyable."]),
        proposedChanges: [
          {
            kind: "update_daily_plan",
            summary: "Switch today to a gentle Comeback plan",
            payload: { mode: "comeback", date: today }
          },
          ...w ? [addWorkout(w, today, true)] : []
        ]
      };
    }
    case "habits": {
      const wl = c.wellness;
      const ideas = [
        "a glass of water with each meal",
        "a 10-minute walk after one meal",
        "a fixed wind-down time at night"
      ];
      return {
        message: `Habits stick when they are small and tied to something you already do. Pick one: ${ideas.join(", ")}. Missing a day does not reset anything.${wl && !wl.numbersHidden && wl.walkMinutesWeek > 0 ? ` You have logged ${wl.walkMinutesWeek} minutes of walking this week, which is a good base.` : ""}`,
        because: reasons(c, ["Small habits are easier to repeat than big changes."]),
        proposedChanges: []
      };
    }
    case "calorie_needs": {
      const hidden = c.wellness?.numbersHidden === true;
      if (hidden)
        return {
          message: "I will not share calorie numbers, because of the privacy choices you made. We can focus on how meals feel, regular movement, sleep and water instead.",
          because: reasons(c, ["Your settings turn calorie and weight numbers off."]),
          proposedChanges: []
        };
      if (!c.personalized)
        return {
          message: "Personalization is off, so I cannot see your details and will not guess a number. Your own estimate is on the Goals and Food screens. If you want me to use it, you can turn personalization on in the coach settings.",
          because: reasons(c),
          proposedChanges: []
        };
      if (c.guideKcal === void 0)
        return {
          message: "I do not have a calorie estimate for you yet, and I will not guess one. The Goals screen shows what is still needed: usually your weight, height, birth date, usual activity and the quick safety questions. Some answers also mean we suggest talking to a professional first.",
          because: reasons(c, ["Estimates come from the same calculation as your Goals screen."]),
          proposedChanges: []
        };
      const old = c.guideWeightDaysOld !== void 0 ? ` It rests on a weight recorded about ${c.guideWeightDaysOld} days ago, not a current measurement, so updating your weight would refresh it.` : "";
      return {
        message: `Your current daily estimate is about ${c.guideKcal} kcal. It is provisional: a rough estimate from general formulas that no dietitian has reviewed, not a target to hit. Your usual activity level already includes your regular exercise, so I do not add workout calories on top.${old}`,
        because: reasons(c, [
          "This is the same estimate your Goals and Food screens show, rounded."
        ]),
        proposedChanges: []
      };
    }
    case "nutrition_balance":
      return {
        message: `A simple plate picture, for any cuisine: ${PLATE_MODEL.map((p) => `${p.share} ${p.label.toLowerCase()}`).join("; ")}. ${PLATE_NOTE} Your Food tab shows today's protein and fibre guidance${c.wellness?.numbersHidden ? " as a plate picture only" : ""}.`,
        because: reasons(c, ["Plate guidance is general and provisional, not medical advice."]),
        proposedChanges: []
      };
    case "maintenance": {
      if (c.wellness?.numbersHidden === true)
        return {
          message: "Keeping steady is mostly about habits you enjoy: movement, regular meals, sleep and water. We can build those together without any numbers.",
          because: reasons(c, ["Your settings turn weight and calorie numbers off."]),
          proposedChanges: []
        };
      return {
        message: `${MAINTENANCE_EDUCATION[0]} ${MAINTENANCE_EDUCATION[2]} If you have reached a goal, you can choose Maintain weight on the Goals screen at any time; your history stays as it is.`,
        because: reasons(c, ["This is general guidance, not medical advice."]),
        proposedChanges: []
      };
    }
    case "weekly_review":
      return {
        message: "Your weekly review is ready to generate from the Weekly review screen. It looks at consistency, effort and non-scale wins.",
        because: reasons(c),
        proposedChanges: []
      };
    case "plan_today": {
      const open = (c.plan?.items ?? []).filter((i) => !i.done).slice(0, 3).map((i) => i.title);
      const w = !c.plan?.items.some((i) => i.kind === "workout") ? quick(10) : null;
      return {
        message: open.length ? `Here is a simple day: ${open.join("; ")}. All of it is optional, so take what helps.` : "A simple day: a short dance session, a balanced meal and one small habit like a glass of water. All of it is optional.",
        because: reasons(c, ["Small, specific steps are easier to follow."]),
        proposedChanges: w ? [addWorkout(w)] : []
      };
    }
    default:
      return {
        message: "I can plan your day, suggest a Quick Fit session, adapt for a busy day or travel, help you ease back in, compare food swaps, or review your week. What would help most?",
        because: reasons(c),
        proposedChanges: []
      };
  }
}
function composeWeeklyReview(f) {
  const highlights = [];
  if (f.sessions > 0)
    highlights.push(
      `You moved on ${f.activeDays} day(s) this week, ${f.minutes} minutes in total.`
    );
  else highlights.push("You checked in this week, and that counts. A fresh week is a fresh start.");
  if (f.foodLoggedDays > 0) highlights.push(`You logged food on ${f.foodLoggedDays} day(s).`);
  const wins = [];
  if (f.styles.length >= 2) wins.push(`You tried ${f.styles.length} different dance styles.`);
  if (f.lowImpactSessions > 0) wins.push("You chose the low-impact version when it suited you.");
  if (f.sessions > 0) wins.push("You showed up at your own level.");
  if (f.weightTrend === "steady") wins.push("Your weight stayed steady, which is a fine result.");
  const wl = f.wellness;
  if (wl) {
    if (wl.walkMinutes > 0)
      highlights.push(`You walked on ${wl.walkDays} day(s), ${wl.walkMinutes} minutes in total.`);
    if (wl.strengthSessions > 0)
      wins.push(`You logged ${wl.strengthSessions} strength session(s).`);
    if (wl.sleepAvgHours !== null)
      highlights.push(
        `You logged ${wl.sleepNights} nights of sleep, about ${wl.sleepAvgHours} hours on average.`
      );
    if (wl.waterLoggedDays > 0) wins.push(`You tracked water on ${wl.waterLoggedDays} day(s).`);
    if (wl.hungerCheckins > 0) wins.push("You checked in with your hunger and fullness.");
  }
  const tips = [];
  if (f.sessions === 0) tips.push("Try one 5-minute Quick Fit on your busiest day.");
  else if (f.sessions < 3) tips.push("Pick a regular slot for a 10-minute session.");
  else tips.push("Keep what is working, and add a gentle stretch after sessions.");
  if (wl && wl.sleepAvgHours !== null && wl.sleepAvgHours < 6.5)
    tips.push("Try a regular wind-down time; sleep supports energy and appetite.");
  if (f.activeDays === 0 || wl && wl.walkMinutes === 0 && f.sessions === 0)
    tips.push("A 10-minute walk is an easy way to start the week.");
  if (f.foodLoggedDays === 0) tips.push("Log one meal a day to see patterns, if you like.");
  if (f.weightTrend)
    tips.push("Remember that weight moves day to day; the overall direction matters more.");
  return {
    highlights: highlights.slice(0, 5),
    nonScaleWins: wins.slice(0, 5),
    suggestions: tips.slice(0, 3),
    tone: "encouraging"
  };
}

// packages/ai/src/prompts.ts
var COACH_SYSTEM_PROMPT = [
  "You are the Locked In Fitness Concierge: one friendly, supportive coach for dance fitness, food and everyday habits. You help adults (18+).",
  "Use only the CONTEXT provided. If personalization is off, give general guidance and say so. Never ask for or reveal personal identifiers.",
  "Be warm, specific and brief. Never use guilt, shame, punishment, competition, streak pressure or hype. Rest and missed days are normal.",
  "Never diagnose, treat or interpret symptoms. Never prescribe extreme restriction, fasting, crash diets or very low calorie targets, and never promise results.",
  "Calorie and weight figures are rough estimates. Weight changes should be gradual; for any health concern, suggest a qualified professional.",
  "If CONTEXT.wellness.numbersHidden is true, share no calorie, weight, sleep-hour or minute figures and focus on how the person feels; point to a doctor or registered dietitian where relevant.",
  "You cannot change anything yourself. Suggest changes only in proposedChanges; the person must confirm each one.",
  "If CONTEXT.guideKcal is present it is a provisional estimate, not advice. If CONTEXT.guideWeightDaysOld is present the estimate rests on a weight recorded that many days ago: say it is based on an older recorded weight, never call it the current weight, and suggest updating it. Never invent a weight.",
  'Always explain why you suggest something in "because", referring to the CONTEXT where relevant.',
  "Reply as JSON matching the required schema."
].join("\n");
var clean = (t2) => t2.replace(/<<|>>/g, "").slice(0, 1e3);
function buildCoachPrompt(ctx, userText, history = []) {
  const recent = history.slice(-6).map((h) => ({ role: h.role, content: clean(h.content).slice(0, 300) }));
  return [
    COACH_SYSTEM_PROMPT,
    `<<CONTEXT>>${JSON.stringify(ctx)}<<END>>`,
    `<<HISTORY>>${JSON.stringify(recent)}<<END>>`,
    `<<USER>>${clean(userText)}<<END>>`
  ].join("\n");
}
function parseCoachPrompt(prompt) {
  const grab = (tag) => new RegExp(`<<${tag}>>([\\s\\S]*?)<<END>>`).exec(prompt)?.[1];
  const c = grab("CONTEXT");
  const u = grab("USER");
  if (c === void 0 || u === void 0) return null;
  try {
    return {
      ctx: JSON.parse(c),
      userText: u,
      history: JSON.parse(grab("HISTORY") ?? "[]")
    };
  } catch {
    return null;
  }
}
var REVIEW_SYSTEM_PROMPT = [
  "You write a short, encouraging weekly progress review for an adult using a fitness app.",
  "Use only the FACTS. Celebrate consistency, effort and non-scale wins. Never shame, compare with others, or pressure.",
  "Weight is only a direction; say it varies day to day. Never diagnose or prescribe restriction. Reply as JSON matching the schema."
].join("\n");
var buildReviewPrompt = (facts) => `${REVIEW_SYSTEM_PROMPT}
<<FACTS>>${JSON.stringify(facts)}<<END>>`;
function parseReviewPrompt(prompt) {
  const f = /<<FACTS>>([\s\S]*?)<<END>>/.exec(prompt)?.[1];
  if (!f) return null;
  try {
    return JSON.parse(f);
  } catch {
    return null;
  }
}

// packages/ai/src/provider.ts
var MockAiProvider = class {
  constructor(overrides = {}) {
    this.overrides = overrides;
  }
  overrides;
  name = "mock";
  calls = 0;
  async complete(req) {
    this.calls += 1;
    const usage = {
      inputTokens: Math.ceil(req.prompt.length / 4) + (req.hasImage ? 800 : 0),
      outputTokens: 150
    };
    if (req.feature in this.overrides) return { json: this.overrides[req.feature], usage };
    switch (req.feature) {
      case "food_photo":
        return { usage, json: mockFoodPhotoResponse(req.prompt) };
      case "weekly_review": {
        const facts = parseReviewPrompt(req.prompt);
        if (facts) return { usage, json: composeWeeklyReview(facts) };
        return {
          usage,
          json: {
            highlights: ["You moved on 3 days this week."],
            nonScaleWins: ["You finished a full warm-up each session."],
            suggestions: ["Try one 10-minute Quick Fit on a busy day."],
            tone: "encouraging"
          }
        };
      }
      default: {
        const parsed = parseCoachPrompt(req.prompt);
        if (parsed) return { usage, json: composeCoachReply(parsed.userText, parsed.ctx) };
        return {
          usage,
          json: {
            message: "Sample mock reply: a 10-minute low-impact dance session could suit today.",
            because: ["You asked for a short option."],
            proposedChanges: [],
            supportReferral: false
          }
        };
      }
    }
  }
};
var MOCK_MEAL_TEMPLATES = [
  {
    label: "West African plate",
    items: [
      { id: "jollof-rice", low: 150, high: 250, confidence: "medium" },
      { id: "grilled-chicken", low: 90, high: 150, confidence: "medium" },
      { id: "fried-plantain", low: 60, high: 110, confidence: "low" },
      { id: "mixed-salad", low: 30, high: 70, confidence: "low" }
    ]
  },
  {
    label: "Caribbean plate",
    items: [
      { id: "rice-and-peas", low: 160, high: 260, confidence: "medium" },
      { id: "jerk-chicken", low: 100, high: 170, confidence: "medium" },
      { id: "boiled-plantain", low: 70, high: 130, confidence: "low" },
      { id: "broccoli", low: 50, high: 100, confidence: "medium" }
    ]
  },
  {
    label: "Indian meal",
    items: [
      { id: "roti", low: 45, high: 90, confidence: "high" },
      { id: "lentils", low: 120, high: 200, confidence: "medium" },
      { id: "chicken-tikka-masala", low: 130, high: 230, confidence: "low" },
      { id: "plain-yogurt", low: 80, high: 150, confidence: "medium" }
    ]
  },
  {
    label: "Mediterranean bowl",
    items: [
      { id: "hummus", low: 40, high: 90, confidence: "medium" },
      { id: "greek-salad", low: 120, high: 220, confidence: "medium" },
      { id: "falafel", low: 60, high: 120, confidence: "medium" },
      { id: "pita-bread", low: 40, high: 80, confidence: "high" }
    ]
  },
  {
    label: "Breakfast",
    items: [
      { id: "oatmeal", low: 180, high: 300, confidence: "medium" },
      { id: "banana", low: 100, high: 130, confidence: "high" },
      { id: "boiled-egg", low: 45, high: 110, confidence: "medium" },
      { id: "orange-juice", low: 150, high: 250, confidence: "low" }
    ]
  }
];
function mockFoodPhotoResponse(prompt) {
  const m = /mock-seed:(\d+)/.exec(prompt);
  const seed = m ? Number(m[1]) : 0;
  const t2 = MOCK_MEAL_TEMPLATES[seed % MOCK_MEAL_TEMPLATES.length];
  const items = t2.items.map((i) => ({
    name: FOOD_BY_ID.get(i.id)?.name ?? i.id,
    likelyIngredients: [],
    gramsLow: i.low,
    gramsHigh: i.high,
    confidence: i.confidence,
    referenceQuery: FOOD_BY_ID.get(i.id)?.name ?? i.id
  }));
  if (seed % 7 === 3)
    items.push({
      name: "Unrecognized side",
      likelyIngredients: [],
      gramsLow: 40,
      gramsHigh: 90,
      confidence: "low",
      referenceQuery: "zzqx unrecognized"
    });
  return {
    isEstimate: true,
    items,
    notes: `Simulated result (${t2.label}). This is a development mock, not real image analysis. Portions and hidden oils are uncertain: please check and edit.`
  };
}

// packages/ai/src/server/handlers.ts
async function authenticate(deps, token) {
  if (!token) throw new AppError("unauthenticated", "Please sign in.");
  const who = await deps.repo.authenticate(token);
  if (!who) throw new AppError("unauthenticated", "Please sign in again.");
  return who.userId;
}
async function requireConsents(deps, userId, purposes) {
  for (const p of purposes)
    if (!await deps.repo.hasConsent(userId, p))
      throw new AppError(
        "forbidden",
        "This needs your permission first. You can allow it in Privacy settings."
      );
}
async function handleCoachMessage(deps, input) {
  const userId = await authenticate(deps, input.token);
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length < 1 || text.length > 1e3)
    throw new AppError("validation_failed", "Please write between 1 and 1000 characters.");
  await requireConsents(deps, userId, ["health_data_processing"]);
  const personalized = await deps.repo.hasConsent(userId, "ai_coach_personalization");
  let history = [];
  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    const h = await deps.repo.conversationHistory(userId, conversationId);
    if (!h) throw new AppError("not_found", "That conversation was not found.");
    history = h;
  } else {
    conversationId = await deps.repo.createConversation(userId, text.slice(0, 40));
  }
  await deps.repo.appendUserMessage(userId, conversationId, text);
  const now = deps.now();
  const ctx = await deps.repo.coachContext(userId, personalized, now);
  const { data, outcome } = await deps.gateway.runDetailed({
    userId,
    entitlement: await deps.repo.entitlement(userId),
    feature: "concierge_chat",
    prompt: buildCoachPrompt(ctx, text, history),
    userText: text
  });
  const reply2 = conciergeResponseSchema.parse(data);
  const redirected = outcome === "risk_referral" || outcome === "safety_redirect";
  const saved = await deps.repo.appendAssistantMessage(
    userId,
    conversationId,
    {
      ...reply2,
      proposedChanges: reply2.proposedChanges.slice(0, 5),
      usedPersonalData: personalized && !redirected
    },
    deps.provider
  );
  return { conversationId, messageId: saved.messageId, reply: reply2, provider: deps.provider };
}
async function handleWeeklyReview(deps, input) {
  const userId = await authenticate(deps, input.token);
  await requireConsents(deps, userId, ["health_data_processing", "ai_coach_personalization"]);
  const now = deps.now();
  let week = weekStartOf(now.toISOString().slice(0, 10));
  if (input.weekStart !== void 0) {
    if (typeof input.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart) || weekStartOf(input.weekStart) !== input.weekStart)
      throw new AppError("validation_failed", "That week is not valid.");
    week = input.weekStart;
  }
  const facts = await deps.repo.weekFacts(userId, week, now);
  const { data } = await deps.gateway.runDetailed({
    userId,
    entitlement: await deps.repo.entitlement(userId),
    feature: "weekly_review",
    prompt: buildReviewPrompt(facts)
  });
  const content = weeklyReviewResponseSchema.parse(data);
  const id = await deps.repo.saveWeeklyReview(userId, week, content, deps.provider);
  return { id, weekStart: week, content, provider: deps.provider };
}
async function handlePhotoAnalysis(deps, input) {
  const userId = await authenticate(deps, input.token);
  const path = input.storagePath;
  if (typeof path !== "string" || !path.startsWith(`${userId}/`) || path.includes("..") || path.length > 200)
    throw new AppError("forbidden", "That photo is not yours.");
  await requireConsents(deps, userId, ["health_data_processing", "ai_processing_of_food_photos"]);
  const id = await deps.repo.beginPhotoAnalysis(userId, path, deps.provider);
  try {
    const { data } = await deps.gateway.runDetailed({
      userId,
      entitlement: await deps.repo.entitlement(userId),
      feature: "food_photo",
      prompt: `mock-seed:${Number.isInteger(input.seed) ? input.seed : 0}`,
      hasImage: true
    });
    const out = foodPhotoResponseSchema.parse(data);
    const items = groundPhotoItems(out.items);
    await deps.repo.completePhotoAnalysis(id, {
      items,
      notes: out.notes ?? null,
      provider: deps.provider
    });
    return { analysisId: id, provider: deps.provider, items, notes: out.notes ?? null };
  } catch (e) {
    await deps.repo.failPhotoAnalysis(id);
    throw e;
  }
}
async function handleAccountDeletionRequest(deps, token) {
  const userId = await authenticate(deps, token);
  const r2 = await deps.repo.requestAccountDeletion(
    userId,
    deps.now(),
    await deps.repo.deletionGraceDays()
  );
  return { ...r2, status: "requested", completed: false };
}
async function handleAccountDeletionCancel(deps, token) {
  const userId = await authenticate(deps, token);
  return { cancelled: await deps.repo.cancelAccountDeletion(userId) };
}
var bearer = (h) => /^Bearer (.+)$/i.exec(h.authorization ?? "")?.[1] ?? null;
async function handleHttp(deps, req) {
  try {
    const token = bearer(req.headers);
    const b2 = req.body ?? {};
    if (req.method !== "POST") throw new AppError("not_found", "Not found.");
    switch (req.path) {
      case "/v1/coach/messages":
        return {
          status: 200,
          json: await handleCoachMessage(deps, {
            token,
            conversationId: typeof b2.conversationId === "string" ? b2.conversationId : null,
            text: b2.text
          })
        };
      case "/v1/coach/weekly-review":
        return {
          status: 200,
          json: await handleWeeklyReview(deps, { token, weekStart: b2.weekStart })
        };
      case "/v1/food/photo-analysis":
        return {
          status: 200,
          json: await handlePhotoAnalysis(deps, {
            token,
            storagePath: b2.storagePath,
            seed: typeof b2.seed === "number" ? b2.seed : void 0
          })
        };
      case "/v1/account/deletion":
        return { status: 202, json: await handleAccountDeletionRequest(deps, token) };
      case "/v1/account/deletion/cancel":
        return { status: 200, json: await handleAccountDeletionCancel(deps, token) };
      default:
        throw new AppError("not_found", "Not found.");
    }
  } catch (e) {
    const err = toAppError(e);
    return {
      status: err.httpStatus,
      json: { error: { code: err.code, message: err.userMessage } }
    };
  }
}

// packages/ai/src/server/supabase-repo.ts
function ok(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
var SupabaseServerRepo = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async authenticate(token) {
    const { data, error } = await this.db.auth.getUser(token);
    return error || !data.user ? null : { userId: data.user.id };
  }
  /** No store webhook exists yet, so everyone is on the free entitlement. Paid tiers cannot be reached by accident. */
  async entitlement(_userId) {
    return FREE_ENTITLEMENT;
  }
  async hasConsent(userId, purpose) {
    const r2 = ok(
      await this.db.from("consents").select("granted").eq("user_id", userId).eq("purpose", purpose).order("id", { ascending: false }).limit(1),
      "consents"
    );
    return r2[0]?.granted === true;
  }
  /**
   * The person's wellness logs (last 8 days) and preferences, validated. Scoped by userId like every other query here. If either read fails, the
   * result is `failed`, and callers share NO wellness numbers rather than risk showing numbers a person asked not to see.
   */
  async wellness(userId, today, sinceDay = addDaysIso(today, -8)) {
    try {
      const [entries, prefs] = await Promise.all([
        this.db.from("wellness_entries").select("id,kind,day,amount,amount2,label,created_at").eq("user_id", userId).gte("day", sinceDay).order("day", { ascending: false }).limit(500),
        this.db.from("wellness_prefs").select("data").eq("user_id", userId).maybeSingle()
      ]);
      const rows = ok(entries, "wellness_entries") ?? [];
      const p = ok(prefs, "wellness_prefs");
      return {
        failed: false,
        entries: rows.map((r2) => wellnessEntryFromRow(r2, today)).filter((e) => e !== null),
        prefs: p ? parsePrefs(p.data) : null
      };
    } catch {
      return { failed: true };
    }
  }
  async records(userId) {
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const [profile, sessions, logs, weights, goals] = await Promise.all([
      this.db.from("profiles").select("time_zone, unit_system").eq("id", userId).maybeSingle(),
      this.db.from("workout_sessions").select("status, completed_at, duration_s, minutes, style, low_impact, planned_for, title").eq("user_id", userId).gte("created_at", since),
      this.db.from("food_logs").select("logged_at, food_log_items(kcal)").eq("user_id", userId).gte("logged_at", since),
      this.db.from("weight_entries").select("weight_kg, measured_at").eq("user_id", userId).gte("measured_at", since),
      this.db.from("goals").select("type, period").eq("user_id", userId).eq("status", "active")
    ]);
    return {
      profile: ok(profile, "profiles") ?? {},
      sessions: ok(sessions, "workout_sessions") ?? [],
      logs: ok(logs, "food_logs") ?? [],
      weights: ok(weights, "weight_entries") ?? [],
      goals: ok(goals, "goals") ?? []
    };
  }
  /**
   * The daily calorie guide the coach may mention, from the SAME engine as every screen in the app (`calorieNeedsFromRecords`), so the coach can never quote a number the
   * person's own Goals screen would not show. Read-only; every query is scoped by the verified user id. Uses the latest weight however old it is. Fails closed: any
   * read error, missing fact or withheld estimate (cautious readiness, hidden numbers, professional advice needed) gives NO guide. PROVISIONAL: not professionally reviewed.
   */
  async calorieGuide(userId, prefs, now) {
    try {
      const first = (v) => Array.isArray(v) ? v[0] ?? null : v;
      const [priv, weights, goals, readiness] = await Promise.all([
        this.db.from("profile_private").select("birth_date, height_cm, sex, activity_level").eq("user_id", userId).maybeSingle(),
        this.db.from("weight_entries").select("weight_kg, measured_at").eq("user_id", userId).order("measured_at", { ascending: false }).limit(1),
        this.db.from("goals").select("type, status, end_date, target_kg, planned_weekly_change_kg").eq("user_id", userId).eq("status", "active"),
        this.db.from("readiness_screenings").select("outcome").eq("user_id", userId).order("created_at", { ascending: false }).limit(1)
      ]);
      const p = first(ok(priv, "profile_private"));
      const w = first(ok(weights, "weight_entries"));
      const outcome = first(ok(readiness, "readiness_screenings"))?.outcome;
      const targets = calorieNeedsFromRecords({
        prefs: prefs ?? DEFAULT_PREFS,
        readinessOutcome: outcome === "clear" || outcome === "low_impact_and_check_with_professional" ? outcome : null,
        priv: p ? {
          birthDate: String(p.birth_date),
          heightCm: Number(p.height_cm),
          sex: p.sex,
          activityLevel: p.activity_level
        } : null,
        latestWeightKg: w ? Number(w.weight_kg) : null,
        latestWeightAt: w ? String(w.measured_at) : null,
        goals: (ok(goals, "goals") ?? []).map((g2) => ({
          type: g2.type,
          status: String(g2.status),
          endDate: String(g2.end_date),
          targetKg: Number(g2.target_kg),
          plannedWeeklyChangeKg: Number(g2.planned_weekly_change_kg)
        })),
        now
      });
      const g = energyGuideFromTargets(targets);
      return g ? { kcal: g.guideKcal, weightDaysOld: g.staleWeightDays } : void 0;
    } catch {
      return void 0;
    }
  }
  async coachContext(userId, personalized, now) {
    const unitSystem = "metric";
    if (!personalized) return buildCoachContext({ personalized: false, unitSystem, now });
    const r2 = await this.records(userId);
    const tz = r2.profile.time_zone ?? null;
    const today = localDateKey(now, tz);
    const wk = weekStartOf(today);
    const done2 = r2.sessions.filter((s) => s.status === "completed" && s.completed_at);
    const thisWeek = done2.filter(
      (s) => weekStartOf(localDateKey(s.completed_at, tz)) === wk
    );
    const last = done2.map((s) => localDateKey(s.completed_at, tz)).sort().pop();
    const todays = r2.logs.filter((l) => localDateKey(l.logged_at, tz) === today);
    const w = r2.weights.map((x) => ({ kg: Number(x.weight_kg), at: x.measured_at })).sort((a, b2) => a.at.localeCompare(b2.at));
    const change = w.length >= 2 ? w[w.length - 1].kg - w[0].kg : null;
    const wl = await this.wellness(userId, today);
    const guide = wl.failed ? void 0 : await this.calorieGuide(userId, wl.prefs, now);
    return buildCoachContext({
      personalized: true,
      guideKcal: guide?.kcal,
      guideWeightDaysOld: guide?.weightDaysOld,
      unitSystem: r2.profile.unit_system === "imperial" ? "imperial" : unitSystem,
      now,
      timeZone: tz,
      goals: r2.goals.map((g) => ({ type: g.type, period: g.period })),
      weightTrend: change === null ? null : Math.abs(change) < 0.3 ? "steady" : change < 0 ? "down" : "up",
      activity: {
        sessionsThisWeek: thisWeek.length,
        minutesThisWeek: thisWeek.reduce(
          (n, s) => n + (s.duration_s ? Math.max(1, Math.round(Number(s.duration_s) / 60)) : Number(s.minutes)),
          0
        ),
        activeDaysThisWeek: new Set(thisWeek.map((s) => localDateKey(s.completed_at, tz))).size,
        daysSinceLastSession: last ? Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 864e5
        ) : null,
        plannedToday: r2.sessions.filter((s) => s.status === "planned" && s.planned_for === today).map((s) => String(s.title)),
        missedPlannedLast7: r2.sessions.filter(
          (s) => (s.status === "planned" || s.status === "skipped") && s.planned_for && s.planned_for < today
        ).length
      },
      wellness: wl.failed ? WELLNESS_FAIL_CLOSED : coachWellnessContext({ prefs: wl.prefs, entries: wl.entries, today }),
      food: {
        mealsToday: todays.length,
        kcalToday: todays.flatMap((l) => l.food_log_items ?? []).reduce((n, i) => n + Number(i.kcal), 0)
      }
    });
  }
  async weekFacts(userId, weekStart) {
    const r2 = await this.records(userId);
    const tz = r2.profile.time_zone ?? null;
    const wl = await this.wellness(userId, localDateKey(/* @__PURE__ */ new Date(), tz), weekStart);
    return buildWeekFacts({
      weekStart,
      timeZone: tz,
      sessions: r2.sessions.map((s) => ({
        status: String(s.status),
        completedAt: s.completed_at ?? null,
        durationS: s.duration_s ?? null,
        minutes: Number(s.minutes),
        style: s.style ?? null,
        lowImpact: s.low_impact === true
      })),
      foodLogTimes: r2.logs.map((l) => l.logged_at),
      weights: r2.weights.map((x) => ({
        weightKg: Number(x.weight_kg),
        measuredAt: x.measured_at
      })),
      activeGoals: r2.goals.length,
      wellness: wl.failed ? [] : wl.entries,
      hideWellnessNumbers: wl.failed || coachWellnessContext({ prefs: wl.prefs, entries: [], today: weekStart })?.numbersHidden === true
    });
  }
  async conversationHistory(userId, conversationId) {
    const c = ok(
      await this.db.from("ai_conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle(),
      "ai_conversations"
    );
    if (!c) return null;
    const rows = ok(
      await this.db.from("ai_messages").select("role, content").eq("conversation_id", conversationId).eq("user_id", userId).order("seq", { ascending: false }).limit(6),
      "ai_messages"
    );
    return rows.reverse();
  }
  async createConversation(userId, title) {
    const r2 = ok(
      await this.db.from("ai_conversations").insert({ user_id: userId, title }).select("id").single(),
      "ai_conversations"
    );
    return r2.id;
  }
  async appendUserMessage(userId, conversationId, content) {
    const r2 = ok(
      await this.db.from("ai_messages").insert({ user_id: userId, conversation_id: conversationId, role: "user", content }).select("id").single(),
      "ai_messages"
    );
    return r2.id;
  }
  async appendAssistantMessage(userId, conversationId, reply2, provider) {
    const m = ok(
      await this.db.from("ai_messages").insert({
        user_id: userId,
        conversation_id: conversationId,
        role: "assistant",
        content: reply2.message,
        because: reply2.because,
        support_referral: reply2.supportReferral,
        used_personal_data: reply2.usedPersonalData,
        provider
      }).select("id").single(),
      "ai_messages"
    );
    const messageId = m.id;
    let actionIds = [];
    if (reply2.proposedChanges.length) {
      const a = ok(
        await this.db.from("coach_actions").insert(
          reply2.proposedChanges.map((c) => ({
            message_id: messageId,
            user_id: userId,
            kind: c.kind,
            summary: c.summary,
            payload: c.payload
          }))
        ).select("id"),
        "coach_actions"
      );
      actionIds = a.map((x) => x.id);
    }
    await this.db.from("ai_conversations").update({ updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", conversationId).eq("user_id", userId);
    return { messageId, actionIds };
  }
  async saveWeeklyReview(userId, weekStart, content, provider) {
    const r2 = ok(
      await this.db.from("weekly_reviews").upsert(
        { user_id: userId, week_start: weekStart, content, provider },
        { onConflict: "user_id,week_start" }
      ).select("id").single(),
      "weekly_reviews"
    );
    return r2.id;
  }
  async beginPhotoAnalysis(userId, storagePath, provider) {
    const r2 = ok(
      await this.db.from("food_photo_analyses").insert({ user_id: userId, storage_path: storagePath, provider }).select("id").single(),
      "food_photo_analyses"
    );
    return r2.id;
  }
  async completePhotoAnalysis(id, result) {
    ok(
      await this.db.rpc("food_photo_complete", { p_id: id, p_result: result }),
      "food_photo_complete"
    );
  }
  async failPhotoAnalysis(id) {
    ok(await this.db.rpc("food_photo_fail", { p_id: id }), "food_photo_fail");
  }
  async expiredPhotos(now) {
    const rows = ok(
      await this.db.rpc("food_photo_expired", { p_now: now.toISOString() }),
      "food_photo_expired"
    );
    return (rows ?? []).map((r2) => ({
      id: r2.id,
      userId: r2.user_id,
      storagePath: r2.storage_path ?? null
    }));
  }
  async markPhotoDeleted(id) {
    ok(await this.db.rpc("food_photo_mark_deleted", { p_id: id }), "food_photo_mark_deleted");
  }
  async deletionGraceDays() {
    const r2 = ok(
      await this.db.from("app_config").select("int_value").eq("key", "account_deletion_grace_days").maybeSingle(),
      "app_config"
    );
    return Number(r2?.int_value ?? 30);
  }
  async requestAccountDeletion(userId, now, graceDays) {
    const existing = ok(
      await this.db.from("account_deletion_requests").select("id, scheduled_for").eq("user_id", userId).eq("status", "pending").maybeSingle(),
      "account_deletion_requests"
    );
    if (existing)
      return { id: existing.id, scheduledFor: existing.scheduled_for };
    const scheduled = new Date(now.getTime() + graceDays * 864e5).toISOString();
    const r2 = ok(
      await this.db.from("account_deletion_requests").insert({ user_id: userId, scheduled_for: scheduled }).select("id, scheduled_for").single(),
      "account_deletion_requests"
    );
    return { id: r2.id, scheduledFor: r2.scheduled_for };
  }
  async cancelAccountDeletion(userId) {
    const r2 = ok(
      await this.db.from("account_deletion_requests").update({ status: "cancelled", resolved_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", userId).eq("status", "pending").select("id"),
      "account_deletion_requests"
    );
    return r2.length > 0;
  }
};
var SupabasePhotoStorage = class {
  constructor(db, bucket = "food-photos") {
    this.db = db;
    this.bucket = bucket;
  }
  db;
  bucket;
  async remove(path) {
    const { error } = await this.db.storage.from(this.bucket).remove([path]);
    if (error) throw new Error(`storage remove: ${error.message}`);
  }
};

// packages/ai/src/supabase-ports.ts
function check(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
var SupabaseBudgetPort = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async reserve(month, worstUsd, ceilingUsd) {
    const data = check(
      await this.db.rpc("ai_budget_reserve", {
        p_month: month,
        p_worst: worstUsd,
        p_ceiling: ceilingUsd
      }),
      "ai_budget_reserve"
    );
    return data === true;
  }
  async settle(month, reservedUsd, actualUsd) {
    const rows = check(
      await this.db.rpc("ai_budget_settle", {
        p_month: month,
        p_reserved: reservedUsd,
        p_actual: actualUsd
      }),
      "ai_budget_settle"
    );
    const r2 = rows?.[0];
    return { settledUsd: Number(r2?.settled ?? 0), ceilingUsd: Number(r2?.ceiling ?? 50) };
  }
};
var SupabaseQuotaPort = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async consume(userId, month, feature, limit) {
    const data = check(
      await this.db.rpc("ai_quota_consume", {
        p_user: userId,
        p_month: month,
        p_feature: feature,
        p_limit: limit
      }),
      "ai_quota_consume"
    );
    return data === true;
  }
  async refund(userId, month, feature) {
    check(
      await this.db.rpc("ai_quota_refund", { p_user: userId, p_month: month, p_feature: feature }),
      "ai_quota_refund"
    );
  }
};
var SupabaseStaffControls = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async load() {
    const rows = check(
      await this.db.from("feature_flags").select("key, enabled").like("key", "ai.kill%"),
      "feature_flags"
    );
    const killFeatures = {};
    let killAll = false;
    for (const r2 of rows ?? []) {
      if (r2.key === "ai.kill_all") killAll = r2.enabled;
      else if (r2.key.startsWith("ai.kill.") && r2.enabled)
        killFeatures[r2.key.slice(8)] = true;
    }
    return { killAll, killFeatures };
  }
};
var SupabaseUserAiPause = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async isPaused(userId) {
    return check(await this.db.rpc("ai_user_paused", { p_user: userId }), "ai_user_paused") === true;
  }
};
var SupabaseUsageStore = class {
  constructor(db) {
    this.db = db;
  }
  db;
  async monthlyCount(userId, feature, month) {
    const res = await this.db.from("ai_user_usage").select("count").eq("user_id", userId).eq("month", month).eq("feature", feature).maybeSingle();
    return Number(check(res, "ai_user_usage")?.count ?? 0);
  }
  async record(e) {
    check(
      await this.db.from("ai_usage_events").insert({
        user_id: e.userId,
        feature: e.feature,
        model: e.model,
        input_tokens: e.inputTokens,
        output_tokens: e.outputTokens,
        cost_usd: e.costUsd,
        outcome: e.outcome,
        created_at: e.at
      }),
      "ai_usage_events"
    );
  }
};

// packages/ai/src/edge.ts
var ROUTES2 = {
  coach: ["/v1/coach/messages", "/v1/coach/weekly-review"],
  photo: ["/v1/food/photo-analysis"]
};
var NEVER = /* @__PURE__ */ new Set(["/v1/account/deletion", "/v1/account/deletion/cancel"]);
function resolveAiEdgeConfig(env) {
  const provider = (env.AI_PROVIDER ?? "").trim();
  if (provider === "live") return { ok: false, reason: "live_provider_not_implemented" };
  if (provider !== "mock") return { ok: false, reason: "provider_not_set" };
  const raw = (env.AI_ROUTES ?? "").trim() || "coach";
  const groups = raw.split(",").map((x) => x.trim());
  if (!groups.every((g) => g === "coach" || g === "photo") || groups.length === 0)
    return { ok: false, reason: "bad_routes" };
  return { ok: true, config: { provider: "mock", routes: [...new Set(groups)] } };
}
var AI_EDGE_MODELS = {
  food_photo: "mock-large",
  concierge_chat: "mock-small",
  weekly_review: "mock-small"
};
function buildServerDeps(db, now = () => /* @__PURE__ */ new Date()) {
  const gateway = new AiGateway(
    new MockAiProvider(),
    new SupabaseUsageStore(db),
    {
      flags: { ai_gateway: true },
      killAll: false,
      killFeatures: {},
      models: AI_EDGE_MODELS,
      maxOutputTokens: 800,
      now
    },
    void 0,
    {
      budget: new SupabaseBudgetPort(db),
      quota: new SupabaseQuotaPort(db),
      staff: new SupabaseStaffControls(db),
      userPause: new SupabaseUserAiPause(db)
    }
  );
  return {
    repo: new SupabaseServerRepo(db),
    gateway,
    photos: new SupabasePhotoStorage(db),
    now,
    provider: "mock"
  };
}
var MAX_BODY = 8192;
var json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
});
var failure = (code, message, status) => json(status, { error: { code, message } });
var notConfigured = () => failure("feature_disabled", "This feature is temporarily unavailable.", 503);
var routeOf = (url) => {
  const path = new URL(url).pathname.replace(/^.*\/ai(?=\/v1\/)/, "").replace(/\/$/, "");
  return /^\/v1\/[A-Za-z0-9/_-]*$/.test(path) ? path : "";
};
function createAiEdgeHandler(deps, config) {
  const served = new Set(config.routes.flatMap((g) => ROUTES2[g]));
  const known = new Set(Object.values(ROUTES2).flat());
  return async (req) => {
    try {
      if (req.method !== "POST") return failure("method_not_allowed", "Not found.", 405);
      const path = routeOf(req.url);
      if (NEVER.has(path) || !(known.has(path) || served.has(path)))
        return failure("not_found", "Not found.", 404);
      if (!served.has(path))
        return failure("feature_disabled", "This feature is temporarily unavailable.", 503);
      if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY)
        return failure("validation_failed", "That request is too large.", 413);
      const text = await req.text();
      if (text.length > MAX_BODY)
        return failure("validation_failed", "That request is too large.", 413);
      let body = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          return failure("validation_failed", "That request could not be read.", 400);
        }
      }
      const r2 = await handleHttp(deps, {
        method: "POST",
        path,
        headers: { authorization: req.headers.get("authorization") ?? void 0 },
        body
      });
      return json(r2.status, r2.json);
    } catch (e) {
      const err = e instanceof AppError ? e : toAppError(e);
      return failure(err.code, err.userMessage, err.httpStatus);
    }
  };
}
export {
  AI_EDGE_MODELS,
  ROUTES2 as ROUTES,
  buildServerDeps,
  createAiEdgeHandler,
  notConfigured,
  resolveAiEdgeConfig,
  routeOf
};
