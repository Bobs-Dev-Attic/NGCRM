/**
 * Provider-agnostic types for the agent layer.
 *
 * The goal: the agent loop and the CRM tools never import a specific vendor SDK.
 * Each provider (Anthropic, OpenAI-compatible, local LLMs) implements `LLMProvider`
 * and translates these normalized shapes to/from its own wire format.
 */

/** JSON-Schema-ish description of a tool's input. */
export type JSONSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

/** A single call the model wants to make to one of our tools. */
export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /**
   * Opaque, provider-specific data attached to the call that must be echoed
   * back verbatim on the next turn. Gemini 3 returns a `thought_signature`
   * here; OpenAI has no equivalent and leaves it undefined.
   */
  extra?: unknown;
};

/** Normalized conversation message passed to a provider. */
export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

/** What a provider returns after one model turn. */
export type ProviderResponse = {
  /** Any natural-language text the model produced this turn. */
  text: string;
  /** Tool calls the model requested (empty when it's done). */
  toolCalls: ToolCall[];
};

/**
 * Runtime provider configuration, supplied per request (e.g. from the browser's
 * Settings page in bring-your-own-key mode). Any field left undefined falls back
 * to the corresponding environment variable on the server.
 */
export type ProviderConfig = {
  provider?: string; // "anthropic" | "openai-compatible"
  model?: string;
  apiKey?: string;
  baseUrl?: string; // openai-compatible / local LLM endpoint
  workspaceId?: string; // Anthropic org-key workspace id
};

/** A tool the agent can call. Declared once, used by every provider. */
export type AgentTool = {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  /** Executes the tool and returns a JSON-serializable result. */
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

/** The contract every model provider implements. */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(
    system: string,
    messages: Message[],
    tools: AgentTool[]
  ): Promise<ProviderResponse>;
}
