/**
 * Token pricing. The numbers here are PLACEHOLDERS for development and tests. Before any live AI call they must be
 * replaced with the provider's current published prices (and re-checked whenever the model changes).
 */
export interface ModelPrice {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export const PLACEHOLDER_PRICES: Readonly<Record<string, ModelPrice>> = {
  'mock-small': { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
  'mock-large': { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function costUsd(price: ModelPrice, usage: TokenUsage): number {
  return (
    (usage.inputTokens * price.inputUsdPerMTok + usage.outputTokens * price.outputUsdPerMTok) /
    1_000_000
  );
}

/** Worst-case cost used to reserve budget before a call is made. */
export function maxCostUsd(
  price: ModelPrice,
  inputTokens: number,
  maxOutputTokens: number,
): number {
  return costUsd(price, { inputTokens, outputTokens: maxOutputTokens });
}
