import { dailyCalorieGuidance, type ActivityLevel, type Sex } from './safety';

export interface EnergyGuide {
  /** A rough daily energy guide in kcal. It is an estimate from general formulas, not a target the person must hit. */
  guideKcal: number;
  maintenanceKcal: number;
  /** The person's own estimated resting energy: the guide is never lower than this. */
  floorKcal: number;
}

/**
 * Daily energy guide used on the Food and Today screens. Uses the individualized safety rules (deficit capped relative to the
 * person's own maintenance, never below their own resting energy). PROVISIONAL: not reviewed by a dietitian or clinician.
 */
export function energyGuideFor(args: {
  weightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  activity: ActivityLevel;
  weeklyChangeKg?: number;
}): EnergyGuide {
  const g = dailyCalorieGuidance({ ...args, weeklyChangeKg: args.weeklyChangeKg ?? 0 });
  return { guideKcal: g.targetKcal, maintenanceKcal: g.maintenanceKcal, floorKcal: g.floorKcal };
}
