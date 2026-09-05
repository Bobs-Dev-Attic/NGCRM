import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentTool,
  LLMProvider,
  Message,
  ProviderResponse,
  ToolCall,
} from "./types";

/** Claude (Anthropic Messages API) implementation of LLMProvider. */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example)."
      );
    }
    this.model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    this.client = new Anthropic({ apiKey });
  }

  async complete(
    system: string,
    messages: Message[],
    tools: AgentTool[]
  ): Promise<ProviderResponse> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
      messages: toAnthropicMessages(messages),
    });

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input as Record<string, unknown>) ?? {},
        });
      }
    }
    return { text, toolCalls };
  }
}

function toAnthropicMessages(
  messages: Message[]
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      out.push({ role: "assistant", content });
    } else {
      // tool result -> a user message carrying a tool_result block
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId,
            content: m.content,
          },
        ],
      });
    }
  }
  return out;
}
