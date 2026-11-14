import type { AiFeature } from '@dancehall/shared';
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
        return {
          usage,
          json: {
            isEstimate: true,
            items: [
              {
                name: 'Jollof rice (sample)',
                likelyIngredients: ['rice', 'tomato', 'oil'],
                gramsLow: 150,
                gramsHigh: 250,
                confidence: 'medium',
                referenceQuery: 'jollof rice',
              },
              {
                name: 'Grilled chicken (sample)',
                likelyIngredients: ['chicken'],
                gramsLow: 80,
                gramsHigh: 140,
                confidence: 'medium',
                referenceQuery: 'grilled chicken breast',
              },
            ],
            notes: 'Sample mock response. Portions and hidden oils are uncertain; please adjust.',
          },
        };
      case 'weekly_review':
        return {
          usage,
          json: {
            highlights: ['You moved on 3 days this week.'],
            nonScaleWins: ['You finished a full warm-up each session.'],
            suggestions: ['Try one 10-minute Quick Fit on a busy day.'],
            tone: 'encouraging',
          },
        };
      default:
        return {
          usage,
          json: {
            message: 'Sample mock reply: a 10-minute low-impact dance session could suit today.',
            because: ['You asked for a short option.'],
            proposedChanges: [
              {
                kind: 'add_workout',
                summary: 'Add a 10-minute low-impact session today',
                payload: { minutes: 10 },
              },
            ],
            supportReferral: false,
          },
        };
    }
  }
}
