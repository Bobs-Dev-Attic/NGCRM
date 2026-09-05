import type { LLMProvider } from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";

/**
 * Selects the model provider from env (AI_PROVIDER), defaulting to Anthropic.
 * This is the single switch point — the agent loop is provider-agnostic.
 */
export function getProvider(): LLMProvider {
  const which = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  switch (which) {
    case "openai":
    case "openai-compatible":
    case "local":
      return new OpenAICompatibleProvider();
    case "anthropic":
    default:
      return new AnthropicProvider();
  }
}
