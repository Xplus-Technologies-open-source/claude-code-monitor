/**
 * Token estimation and cost calculation for Claude models.
 *
 * Pricing as of March 2026 (per million tokens):
 *
 * | Model              | Input     | Output     |
 * |--------------------|-----------|------------|
 * | Claude Opus 4.6    | $5.00     | $25.00     |
 * | Claude Sonnet 4.6  | $3.00     | $15.00     |
 * | Claude Haiku 4.5   | $0.25     | $1.25      |
 *
 * Token estimation heuristic:
 * - Code averages ~3.5 characters per token
 * - Deleted lines count as input tokens (read by the model)
 * - Added lines count as output tokens (written by the model)
 */

import type { CostModel, TokenCostInfo } from '../types.js';

// ─── Pricing per Million Tokens (USD) ────────────────────────────

interface ModelPricing {
  name: string;
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<CostModel, ModelPricing> = {
  opus: {
    name: 'Claude Opus 4.6',
    inputPerMillion: 5.00,
    outputPerMillion: 25.00,
  },
  sonnet: {
    name: 'Claude Sonnet 4.6',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
  },
  haiku: {
    name: 'Claude Haiku 4.5',
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
  },
};

// ─── Constants ────────────────────────────────────────────────────

const CHARS_PER_TOKEN = 3.5;

// ─── Public API ───────────────────────────────────────────────────

/**
 * Estimate token count from a string of text/code.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Calculate cost breakdown for a given session.
 *
 * @param totalCharsAdded - Total characters in added lines (output)
 * @param totalCharsRemoved - Total characters in removed lines (input)
 * @param model - Which Claude model to price against
 */
export function calculateCost(
  totalCharsAdded: number,
  totalCharsRemoved: number,
  model: CostModel
): TokenCostInfo {
  const pricing = PRICING[model];

  const estimatedInputTokens = Math.ceil(totalCharsRemoved / CHARS_PER_TOKEN);
  const estimatedOutputTokens = Math.ceil(totalCharsAdded / CHARS_PER_TOKEN);

  const inputCostUsd = (estimatedInputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCostUsd = (estimatedOutputTokens / 1_000_000) * pricing.outputPerMillion;

  return {
    model,
    modelName: pricing.name,
    estimatedInputTokens,
    estimatedOutputTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}

/**
 * Format USD cost for display.
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  return `$${usd.toFixed(2)}`;
}

/**
 * Get all available model names for UI display.
 */
export function getAvailableModels(): Array<{ id: CostModel; name: string }> {
  return [
    { id: 'opus', name: PRICING.opus.name },
    { id: 'sonnet', name: PRICING.sonnet.name },
    { id: 'haiku', name: PRICING.haiku.name },
  ];
}
