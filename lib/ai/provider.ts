import type { LLMProvider, ProviderConfig } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";

/**
 * Selects the model provider. A per-request config (from the browser Settings
 * page, bring-your-own-key) takes precedence; otherwise falls back to the
 * AI_PROVIDER env var, defaulting to Anthropic. This is the single switch point —
 * the agent loop stays provider-agnostic.
 */
export function getProvider(config: ProviderConfig = {}): LLMProvider {
  const which = (config.provider || process.env.AI_PROVIDER || "anthropic").toLowerCase();
  switch (which) {
    case "openai":
    case "openai-compatible":
    case "local":
      return new OpenAICompatibleProvider(config);
    case "anthropic":
    default:
      return new AnthropicProvider(config);
  }
}
