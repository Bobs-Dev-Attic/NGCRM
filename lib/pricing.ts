/**
 * Approximate model pricing, in USD per 1,000,000 tokens.
 *
 * These are ESTIMATES for on-screen display only. Provider prices change over
 * time — treat the dollar figures in the UI as rough guidance and update the
 * numbers below against each provider's official pricing page as needed.
 * Local runtimes (Ollama, LM Studio) are free and return a cost of 0.
 */
export type Price = { input: number; output: number };

// Keyed by exact model id where known. Best-effort values — verify & edit.
export const MODEL_PRICING: Record<string, Price> = {
  // Anthropic (approx)
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-4-8": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  // OpenAI (approx)
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // Google Gemini (approx)
  "gemini-3.6-flash": { input: 0.15, output: 0.6 },
  "gemini-3.6-pro": { input: 1.25, output: 10 },
};

/** Coarse fallback by model-family keyword when the exact id isn't listed. */
function heuristic(model: string): Price | null {
  const m = model.toLowerCase();
  if (m.includes("flash")) return { input: 0.15, output: 0.6 };
  if (m.includes("mini")) return { input: 0.15, output: 0.6 };
  if (m.includes("haiku")) return { input: 1, output: 5 };
  if (m.includes("opus")) return { input: 15, output: 75 };
  if (m.includes("sonnet")) return { input: 3, output: 15 };
  if (m.includes("gpt-4o")) return { input: 2.5, output: 10 };
  if (m.includes("gemini") && m.includes("pro")) return { input: 1.25, output: 10 };
  return null;
}

export function priceFor(model: string): Price | null {
  return MODEL_PRICING[model] ?? heuristic(model);
}

/** Estimated cost in USD for a request's usage, or null if the model is unpriced. */
export function estimateCostUSD(
  model: string,
  usage: { inputTokens: number; outputTokens: number }
): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (usage.inputTokens / 1e6) * p.input + (usage.outputTokens / 1e6) * p.output;
}

/** Human-friendly USD formatting that keeps tiny per-request costs legible. */
export function formatUSD(v: number): string {
  if (v <= 0) return "$0.00";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
