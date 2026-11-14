import { FOOD_BY_ID, type AiFeature, type Confidence } from '@dancehall/shared';
import { composeCoachReply, composeWeeklyReview } from './coach-mock';
import { parseCoachPrompt, parseReviewPrompt } from './prompts';
import type { TokenUsage } from './cost';

export interface AiRequest {
  feature: AiFeature;
  model: string;
  /** Text prompt. Phase 0B never sends real user data anywhere. */
  prompt: string;
  /** True when an image accompanies the request (never a real photo in this phase). */
  hasImage?: boolean;
  maxOutputTokens: number;
}
export interface AiRawResponse {
  /** Parsed JSON the model returned (unvalidated). */
  json: unknown;
  usage: TokenUsage;
}
export interface AiProvider {
  readonly name: string;
  complete(req: AiRequest): Promise<AiRawResponse>;
}

/**
 * Deterministic mock used for development and tests. It never touches the network and never costs money.
 * A real provider is a separate implementation behind this interface and is out of scope for Phase 0B.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  calls = 0;
  constructor(private readonly overrides: Partial<Record<AiFeature, unknown>> = {}) {}

  async complete(req: AiRequest): Promise<AiRawResponse> {
    this.calls += 1;
    const usage = {
      inputTokens: Math.ceil(req.prompt.length / 4) + (req.hasImage ? 800 : 0),
      outputTokens: 150,
    };
    if (req.feature in this.overrides) return { json: this.overrides[req.feature], usage };
    switch (req.feature) {
      case 'food_photo':
        return { usage, json: mockFoodPhotoResponse(req.prompt) };
      case 'weekly_review': {
        const facts = parseReviewPrompt(req.prompt);
        if (facts) return { usage, json: composeWeeklyReview(facts) };
        return {
          usage,
          json: {
            highlights: ['You moved on 3 days this week.'],
            nonScaleWins: ['You finished a full warm-up each session.'],
            suggestions: ['Try one 10-minute Quick Fit on a busy day.'],
            tone: 'encouraging',
          },
        };
      }
      default: {
        const parsed = parseCoachPrompt(req.prompt);
        if (parsed) return { usage, json: composeCoachReply(parsed.userText, parsed.ctx) };
        return {
          usage,
          json: {
            message: 'Sample mock reply: a 10-minute low-impact dance session could suit today.',
            because: ['You asked for a short option.'],
            proposedChanges: [],
            supportReferral: false,
          },
        };
      }
    }
  }
}

/**
 * Deterministic SIMULATED meal recognition for development and tests. It never looks at an image: the "mock-seed:N" token in the
 * prompt picks one of a few sample plates, each with several foods and portion RANGES. Its output is labeled as a simulation and
 * flows through the same grounding and editing steps a real model's output would.
 */
export const MOCK_MEAL_TEMPLATES: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ id: string; low: number; high: number; confidence: Confidence }>;
}> = [
  {
    label: 'West African plate',
    items: [
      { id: 'jollof-rice', low: 150, high: 250, confidence: 'medium' },
      { id: 'grilled-chicken', low: 90, high: 150, confidence: 'medium' },
      { id: 'fried-plantain', low: 60, high: 110, confidence: 'low' },
      { id: 'mixed-salad', low: 30, high: 70, confidence: 'low' },
    ],
  },
  {
    label: 'Caribbean plate',
    items: [
      { id: 'rice-and-peas', low: 160, high: 260, confidence: 'medium' },
      { id: 'jerk-chicken', low: 100, high: 170, confidence: 'medium' },
      { id: 'boiled-plantain', low: 70, high: 130, confidence: 'low' },
      { id: 'broccoli', low: 50, high: 100, confidence: 'medium' },
    ],
  },
  {
    label: 'Indian meal',
    items: [
      { id: 'roti', low: 45, high: 90, confidence: 'high' },
      { id: 'lentils', low: 120, high: 200, confidence: 'medium' },
      { id: 'chicken-tikka-masala', low: 130, high: 230, confidence: 'low' },
      { id: 'plain-yogurt', low: 80, high: 150, confidence: 'medium' },
    ],
  },
  {
    label: 'Mediterranean bowl',
    items: [
      { id: 'hummus', low: 40, high: 90, confidence: 'medium' },
      { id: 'greek-salad', low: 120, high: 220, confidence: 'medium' },
      { id: 'falafel', low: 60, high: 120, confidence: 'medium' },
      { id: 'pita-bread', low: 40, high: 80, confidence: 'high' },
    ],
  },
  {
    label: 'Breakfast',
    items: [
      { id: 'oatmeal', low: 180, high: 300, confidence: 'medium' },
      { id: 'banana', low: 100, high: 130, confidence: 'high' },
      { id: 'boiled-egg', low: 45, high: 110, confidence: 'medium' },
      { id: 'orange-juice', low: 150, high: 250, confidence: 'low' },
    ],
  },
];

export function mockFoodPhotoResponse(prompt: string): unknown {
  const m = /mock-seed:(\d+)/.exec(prompt);
  const seed = m ? Number(m[1]) : 0;
  const t = MOCK_MEAL_TEMPLATES[seed % MOCK_MEAL_TEMPLATES.length]!;
  // Some seeds simulate an unrecognizable item so the "needs a match" path is exercised.
  const items = t.items.map((i) => ({
    name: FOOD_BY_ID.get(i.id)?.name ?? i.id,
    likelyIngredients: [],
    gramsLow: i.low,
    gramsHigh: i.high,
    confidence: i.confidence,
    referenceQuery: FOOD_BY_ID.get(i.id)?.name ?? i.id,
  }));
  if (seed % 7 === 3)
    items.push({
      name: 'Unrecognized side',
      likelyIngredients: [],
      gramsLow: 40,
      gramsHigh: 90,
      confidence: 'low',
      referenceQuery: 'zzqx unrecognized',
    });
  return {
    isEstimate: true,
    items,
    notes: `Simulated result (${t.label}). This is a development mock, not real image analysis. Portions and hidden oils are uncertain: please check and edit.`,
  };
}
