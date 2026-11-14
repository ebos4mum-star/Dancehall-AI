import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  READINESS_QUESTIONS,
  evaluateReadiness,
  evaluateWeightGoal,
  screenMessageForRiskSignals,
  type WeightGoalInput,
} from '@dancehall/shared';

interface Cases {
  weightGoals: Array<{
    name: string;
    input: WeightGoalInput;
    expectStatus: string;
    expectMaxWeeklyLossKg?: number;
  }>;
  riskMessages: Array<{ text: string; expect: string | null }>;
  readiness: Array<{
    name: string;
    answersAllNo?: boolean;
    answers?: Record<string, boolean>;
    expectOutcome: string;
  }>;
}
const cases = JSON.parse(
  readFileSync(new URL('../../../evals/cases/safety.json', import.meta.url), 'utf8'),
) as Cases;

describe('safety evals (synthetic cases)', () => {
  it.each(cases.weightGoals)('weight goal: $name', (c) => {
    const d = evaluateWeightGoal(c.input);
    expect(d.status).toBe(c.expectStatus);
    if (c.expectMaxWeeklyLossKg !== undefined)
      expect(-(d.adjusted?.weeklyChangeKg ?? 0)).toBeLessThanOrEqual(
        c.expectMaxWeeklyLossKg + 1e-9,
      );
  });
  it.each(cases.riskMessages)('risk screen: $text', (c) => {
    expect(screenMessageForRiskSignals(c.text)).toBe(c.expect);
  });
  it.each(cases.readiness)('readiness: $name', (c) => {
    const answers = c.answersAllNo
      ? Object.fromEntries(READINESS_QUESTIONS.map((q) => [q, false]))
      : (c.answers ?? {});
    expect(evaluateReadiness(answers).outcome).toBe(c.expectOutcome);
  });
});
