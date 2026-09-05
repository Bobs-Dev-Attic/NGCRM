import type {
  AgentTool,
  LLMProvider,
  Message,
  ProviderResponse,
  ToolCall,
} from "./types";

/**
 * OpenAI-compatible provider. Works with the OpenAI API and any server that
 * speaks the same /chat/completions dialect — Ollama, LM Studio, vLLM,
 * OpenRouter, etc. Configured entirely by env, so swapping to a local LLM is
 * just a matter of pointing OPENAI_BASE_URL at localhost.
 *
 * Implemented with plain fetch to avoid pulling in another vendor SDK.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai-compatible";
  readonly model: string;
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.model = process.env.OPENAI_MODEL || "gpt-4o";
  }

  async complete(
    system: string,
    messages: Message[],
    tools: AgentTool[]
  ): Promise<ProviderResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: toOpenAIMessages(system, messages),
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI-compatible request failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as OpenAIChatResponse;
    const msg = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeParse(tc.function.arguments),
    }));
    return { text: msg?.content ?? "", toolCalls };
  }
}

function toOpenAIMessages(system: string, messages: Message[]) {
  const out: unknown[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls && m.toolCalls.length
          ? {
              tool_calls: m.toolCalls.map((tc) => ({
                id: tc.id,
                type: "function",
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.input),
                },
              })),
            }
          : {}),
      });
    } else {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content,
      });
    }
  }
  return out;
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

type OpenAIChatResponse = {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id: string;
        function: { name: string; arguments: string };
      }[];
    };
  }[];
};
