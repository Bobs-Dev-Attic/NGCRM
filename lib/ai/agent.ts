import { getProvider } from "./provider";
import { tools, getToolByName } from "./tools";
import type { Message, ProviderConfig } from "./types";

export type AgentStep = {
  type: "text" | "tool";
  /** For text steps: the model's narration. For tool steps: the tool name. */
  label: string;
  /** For tool steps: the input the model passed. */
  input?: Record<string, unknown>;
  /** For tool steps: the (summarized) result. */
  result?: unknown;
};

export type AgentResult = {
  provider: string;
  model: string;
  /** Final natural-language answer for the user. */
  answer: string;
  /** The reasoning/action trail, so the UI can show what the agent did. */
  steps: AgentStep[];
};

const SYSTEM_PROMPT = `You are the assistant inside "Next-Gen CRM", an AI-native CRM for a non-profit organization.
The user manages donors, volunteers, prospects, campaigns, and donations.

You have tools that read and write the CRM database. Use them to actually get work done — do not
make up data. When the user states an intent (e.g. "import these contacts", "find duplicates",
"who are our donors", "set a goal for this morning"), pick the right tool(s), call them, and then
summarize the outcome clearly and concisely for a busy non-profit operator.

Guidelines:
- Prefer taking action with tools over asking clarifying questions, unless the request is truly ambiguous.
- When you set up work the user described (like "prepare an email campaign"), record it as a goal so it's tracked.
- Deduping: contacts sharing an email are safe to merge automatically (auto_merge_duplicate_contacts).
  For name-only matches, they may be different people — list them and ask the user to confirm before
  calling merge_contacts. When the user says which to merge, call merge_contacts with those ids.
- Keep your final answer short, warm, and specific about what you did or found.`;

const MAX_TURNS = 6;

/**
 * Runs the intent-to-action loop: the model plans, calls CRM tools, sees the
 * results, and iterates until it produces a final answer (or hits MAX_TURNS).
 */
export async function runAgent(
  userIntent: string,
  config: ProviderConfig = {}
): Promise<AgentResult> {
  const provider = getProvider(config);
  const messages: Message[] = [{ role: "user", content: userIntent }];
  const steps: AgentStep[] = [];
  let answer = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await provider.complete(SYSTEM_PROMPT, messages, tools);

    if (res.text) {
      answer = res.text;
      steps.push({ type: "text", label: res.text });
    }

    if (res.toolCalls.length === 0) break;

    // Record the assistant turn (text + the tool calls it wants to make).
    messages.push({
      role: "assistant",
      content: res.text,
      toolCalls: res.toolCalls,
    });

    // Execute each requested tool and feed results back.
    for (const call of res.toolCalls) {
      const tool = getToolByName(call.name);
      let result: unknown;
      if (!tool) {
        result = { error: `Unknown tool: ${call.name}` };
      } else {
        try {
          result = await tool.execute(call.input);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      steps.push({
        type: "tool",
        label: call.name,
        input: call.input,
        result,
      });
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify(result),
      });
    }
  }

  if (!answer) {
    answer =
      "I worked through that but didn't produce a final summary. Check the steps below for what happened.";
  }

  return { provider: provider.name, model: provider.model, answer, steps };
}
