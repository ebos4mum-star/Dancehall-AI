import { describe, expect, it } from 'vitest';
import { MAINTENANCE_EDUCATION, maintenanceSupport, type MaintenanceInput } from './index';

const NOW = new Date('2026-07-01T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const w = (kg: number, ago: number) => ({ weightKg: kg, measuredAt: day(ago) });
const base: MaintenanceInput = {
  intent: 'lose',
  weightShown: true,
  weights: [w(70, 0)],
  activeGoal: null,
  now: NOW,
};
const lose = (target: number, startDaysAgo = 60) => ({
  type: 'lose' as const,
  startKg: 75,
  targetKg: target,
  startDate: day(startDaysAgo).slice(0, 10),
});

describe('maintenance support: only for people who track weight on purpose', () => {
  it('produces nothing when weight is not shown (hidden numbers, eating concern, tracking off), or there are no weights', () => {
    expect(maintenanceSupport({ ...base, weightShown: false, activeGoal: lose(70) }).state).toBe(
      'not_applicable',
    );
    expect(maintenanceSupport({ ...base, weights: [] }).state).toBe('not_applicable');
    expect(maintenanceSupport({ ...base, intent: 'fitness' }).state).toBe('not_applicable');
    expect(maintenanceSupport({ ...base, intent: 'strength' }).state).toBe('not_applicable');
  });
});

describe('a reached goal', () => {
  it('offers maintenance (loss and gain), keeps history, and changes nothing by itself', () => {
    const l = maintenanceSupport({ ...base, activeGoal: lose(70) });
    expect(l.state).toBe('goal_reached');
    expect(l.offerMaintain).toBe(true);
    expect(l.body).toMatch(/history stays exactly as it is/);
    const g = maintenanceSupport({
      ...base,
      intent: 'gain',
      weights: [w(72, 0)],
      activeGoal: { type: 'gain', startKg: 68, targetKg: 72, startDate: day(60).slice(0, 10) },
    });
    expect(g.state).toBe('goal_reached');
    expect(g.offerMaintain).toBe(true);
  });
  it('is not triggered before the target, or by moving the wrong way', () => {
    expect(
      maintenanceSupport({ ...base, weights: [w(72, 0)], activeGoal: lose(70) }).state,
    ).not.toBe('goal_reached');
    expect(
      maintenanceSupport({ ...base, weights: [w(80, 0)], activeGoal: lose(70) }).state,
    ).not.toBe('goal_reached');
  });
  it('speaks plainly, without promises or praise of the number', () => {
    const t = JSON.stringify(maintenanceSupport({ ...base, activeGoal: lose(70) }));
    expect(t).not.toMatch(
      /guarantee|never regain|will keep|fail|cheat|bad|good weight|skinny|thin|fat/i,
    );
  });
});

describe('maintaining', () => {
  const steady = [w(70.2, 14), w(69.9, 10), w(70.4, 6), w(70.1, 3), w(70, 0)];
  it('shows a steady band of ±1 kg and says small ups and downs are normal', () => {
    const m = maintenanceSupport({ ...base, intent: 'maintain', weights: steady });
    expect(m.state).toBe('maintaining');
    expect(m.band!.within).toBe(true);
    expect(m.band!.highKg - m.band!.lowKg).toBeCloseTo(2, 5);
    expect(m.body).toMatch(/Small ups and downs are normal/);
    expect(m.offerMaintain).toBe(false);
    expect(m.education).toEqual([...MAINTENANCE_EDUCATION]);
  });
  it('a recent average outside the band gets a calm note about weeks, not days, never an instruction to restrict', () => {
    const m = maintenanceSupport({
      ...base,
      intent: 'maintain',
      weights: [w(70, 20), w(72.6, 3), w(72.4, 2), w(72.5, 0)],
      activeGoal: { type: 'maintain', startKg: 70, targetKg: 70, startDate: day(30).slice(0, 10) },
    });
    expect(m.band!.within).toBe(false);
    expect(m.body).toMatch(/weeks, not the days/);
    expect(JSON.stringify(m)).not.toMatch(/diet|cut|restrict|skip meals|starve|burn|calorie|kcal/i);
  });
  it('a stored maintain goal counts even if the main goal is another', () => {
    const m = maintenanceSupport({
      ...base,
      intent: 'fitness',
      weights: steady,
      activeGoal: { type: 'maintain', startKg: 70, targetKg: 70, startDate: day(30).slice(0, 10) },
    });
    expect(m.state).toBe('maintaining');
  });
});

describe('a levelled-off loss', () => {
  const flat = [w(72.1, 24), w(72, 17), w(72.2, 10), w(72, 5), w(72.1, 0)];
  it('says plateaus are common, offers (does not push) maintenance, and points to a professional if worried', () => {
    const m = maintenanceSupport({ ...base, weights: flat, activeGoal: lose(68) });
    expect(m.state).toBe('plateau');
    expect(m.offerMaintain).toBe(true);
    expect(m.body).toMatch(/common and usually temporary/);
    expect(m.body).toMatch(/doctor or registered dietitian/);
  });
  it('needs a goal old enough, enough weigh-ins, and a genuinely flat trend', () => {
    expect(maintenanceSupport({ ...base, weights: flat, activeGoal: lose(68, 10) }).state).toBe(
      'not_applicable',
    );
    expect(
      maintenanceSupport({ ...base, weights: [w(72, 20), w(72, 0)], activeGoal: lose(68) }).state,
    ).toBe('not_applicable');
    const falling = [w(74, 24), w(73.2, 17), w(72.6, 10), w(72, 5), w(71.4, 0)];
    expect(maintenanceSupport({ ...base, weights: falling, activeGoal: lose(68) }).state).toBe(
      'not_applicable',
    );
  });
  it('is never reported for someone whose main goal is not weight loss', () => {
    expect(
      maintenanceSupport({ ...base, intent: 'strength', weights: flat, activeGoal: lose(68) })
        .state,
    ).toBe('not_applicable');
  });
});
