import { MAINTAIN_TOLERANCE_KG, goalProgress } from './goals';
import { summarizeWeights, type WeightPoint } from './progress';
import type { GoalIntent } from './wellness';

/**
 * Sustainable weight-maintenance support. A gentle transition when a weight goal is reached or progress has levelled off, and calm support for people who are keeping
 * their weight steady. Everything is an OFFER the person chooses: nothing changes their goal by itself.
 *
 * It only exists for people who track weight on purpose. With hidden numbers, an eating concern, pregnancy or postpartum, or weight tracking off, it produces nothing
 * ("not_applicable"). Wording is about normal fluctuation and habits, never about "failing", never a promise, and never medical advice. PROVISIONAL.
 */
export type MaintenanceState = 'not_applicable' | 'goal_reached' | 'plateau' | 'maintaining';

export interface MaintenanceInput {
  /** The goal the person is following (the effective goal from the calorie engine). */
  intent: GoalIntent;
  /** The person tracks weight on purpose AND their numbers are not hidden (`showWeight`). */
  weightShown: boolean;
  weights: readonly WeightPoint[];
  /** The active weight goal, if any. */
  activeGoal: {
    type: 'lose' | 'maintain' | 'gain';
    startKg: number;
    targetKg: number;
    startDate: string;
  } | null;
  now: Date;
}

export interface Maintenance {
  state: MaintenanceState;
  /** Plain-language, gentle headline for the state. */
  title: string;
  body: string;
  /** The person may switch their main goal to Maintain Weight. Never done automatically. */
  offerMaintain: boolean;
  /** For people maintaining: the steady band around their reference weight, and whether recent weights sit inside it. */
  band: {
    lowKg: number;
    highKg: number;
    referenceKg: number;
    recentAvgKg: number;
    within: boolean;
  } | null;
  /** Short education, shown only when it applies. */
  education: string[];
  provisional: true;
}

export const MAINTENANCE_EDUCATION = [
  'Weight naturally moves up and down by a kilo or two from day to day with water, food timing and sleep. The direction over weeks matters more than any single day.',
  'A calm weekly check-in works better than daily weighing. You can skip weighing altogether and still keep your habits.',
  'Keeping the habits that got you here (movement you enjoy, regular meals, sleep) matters more than any number.',
] as const;

const none = (): Maintenance => ({
  state: 'not_applicable',
  title: '',
  body: '',
  offerMaintain: false,
  band: null,
  education: [],
  provisional: true,
});

const DAY = 86_400_000;

export function maintenanceSupport(i: MaintenanceInput): Maintenance {
  if (!i.weightShown || i.weights.length === 0) return none();
  const summary = summarizeWeights(i.weights);
  const latest = summary.latest;
  if (!latest) return none();
  const g = i.activeGoal;

  // 1. A goal that has been reached: offer the move to maintenance (and nothing else changes).
  if (g && g.type !== 'maintain') {
    const p = goalProgress(
      { type: g.type, startKg: g.startKg, targetKg: g.targetKg },
      latest.weightKg,
    );
    if (p.fraction >= 1 && p.onTrack)
      return {
        state: 'goal_reached',
        title: 'You reached your goal',
        body: 'Well done for sticking with it. If you like, you can move to keeping your weight steady. Your history stays exactly as it is, and you can change your goal again any time.',
        offerMaintain: true,
        band: null,
        education: [...MAINTENANCE_EDUCATION],
        provisional: true,
      };
  }

  // 2. Maintaining: a steady band around a reference weight.
  if (i.intent === 'maintain' || g?.type === 'maintain') {
    const reference =
      g?.type === 'maintain' ? g.targetKg : (summary.sevenDayAverageKg ?? latest.weightKg);
    const recent = summary.sevenDayAverageKg ?? latest.weightKg;
    const low = Math.round((reference - MAINTAIN_TOLERANCE_KG) * 10) / 10;
    const high = Math.round((reference + MAINTAIN_TOLERANCE_KG) * 10) / 10;
    const within = recent >= low && recent <= high;
    return {
      state: 'maintaining',
      title: 'Keeping steady',
      body: within
        ? 'Your recent weights sit inside your steady range. Small ups and downs are normal.'
        : 'Your recent average is a little outside your usual range. That is common and often settles on its own. Look at the weeks, not the days, and lean on the habits that work for you.',
      offerMaintain: false,
      band: {
        lowKg: low,
        highKg: high,
        referenceKg: Math.round(reference * 10) / 10,
        recentAvgKg: Math.round(recent * 10) / 10,
        within,
      },
      education: [...MAINTENANCE_EDUCATION],
      provisional: true,
    };
  }

  // 3. A levelled-off loss: say it is normal, and offer (not push) maintenance.
  if (i.intent === 'lose' && g?.type === 'lose') {
    const goalAgeDays = (i.now.getTime() - Date.parse(`${g.startDate}T00:00:00Z`)) / DAY;
    const latestAt = Date.parse(latest.measuredAt);
    const recentCount = i.weights.filter((w) => {
      const at = Date.parse(w.measuredAt);
      return at <= latestAt && at >= latestAt - 28 * DAY;
    }).length;
    if (
      goalAgeDays >= 21 &&
      recentCount >= 3 &&
      summary.weeklyRateKg !== null &&
      Math.abs(summary.weeklyRateKg) < 0.1
    )
      return {
        state: 'plateau',
        title: 'Progress has levelled off',
        body: 'Plateaus are common and usually temporary, and one flat stretch rarely means anything is wrong. You can keep going gently, or choose to keep your weight steady for a while. If you are worried, a doctor or registered dietitian can help.',
        offerMaintain: true,
        band: null,
        education: [MAINTENANCE_EDUCATION[0], MAINTENANCE_EDUCATION[2]],
        provisional: true,
      };
  }
  return none();
}
