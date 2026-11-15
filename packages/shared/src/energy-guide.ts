import type { NutritionTargets } from './nutrition-plan';

export interface EnergyGuide {
  /** A rough daily energy guide in kcal. It is an estimate from general formulas, not a target the person must hit. */
  guideKcal: number;
  maintenanceKcal: number;
  /** The person's own estimated resting energy: the guide is never lower than this. */
  floorKcal: number;
  /** Days old when the weight behind the guide is older than 60 days; otherwise undefined. */
  staleWeightDays?: number;
}

/**
 * The compact daily energy guide used on the Food and Today screens, the meal planner and the coach. It is ONLY a view of the canonical result
 * (`calorieNeeds` -> `nutritionTargets`): there is no second calculator. When the goal-based number is withheld for safety (for example a Gain Weight surplus that is
 * not suggested), the guide is the person's estimated maintenance. When no estimate is given (numbers hidden, professional advice needed, inputs missing) there is no guide.
 * PROVISIONAL: not reviewed by a dietitian or clinician.
 */
export function energyGuideFromTargets(t: NutritionTargets): EnergyGuide | null {
  if (!t.kcal) return null;
  return {
    guideKcal: t.kcal.guide ?? t.kcal.maintenance,
    maintenanceKcal: t.kcal.maintenance,
    floorKcal: t.kcal.floor,
    staleWeightDays: t.weightStale && t.weightAgeDays !== null ? t.weightAgeDays : undefined,
  };
}
