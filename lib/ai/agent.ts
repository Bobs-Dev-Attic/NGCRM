import { getProvider } from "./provider";
import { tools, getToolByName } from "./tools";
import { buildWorkingStyle } from "@/lib/profile";
import type { Message, ProviderCandidate, ProviderConfig, Usage } from "./types";

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
  /** Total token usage across every model turn in this request. */
  usage: Usage;
  /** How many model turns (API round-trips) the request took. */
  turns: number;
  /** Whether a learned working-style profile was applied to this request. */
  personalized: boolean;
  /** Failover: which provider (label) served, per-provider token usage, and any failovers. */
  providerUsed?: string | null;
  providerUsage?: { label: string; model: string; tokens: number }[];
  failovers?: { label: string; reason: string }[];
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
- Households: "build/auto-build households" or "group families" -> call auto_build_households
  (it groups contacts sharing a last name + locality into households). Show the result and
  offer find_possible_relatives first if the user wants to preview before committing.
- Email campaigns: to "prepare/build an email campaign", (1) find or create the campaign
  (create_campaign, or pass campaign_name to save_campaign_draft), (2) choose the audience with
  preview_audience (e.g. tag "prospect" or "donor" for potential donors), (3) WRITE the subject and
  body yourself — warm, specific, non-profit-appropriate, with a clear ask and a placeholder like
  {first_name} for personalization — then (4) call save_campaign_draft. Then show the subject and
  body in your answer and state the recipient count.
- Donations: to log a gift use record_donation (identify the donor by contact_id, exact email,
  or full name; if it returns candidates, ask the user which one, then re-call with contact_id).
  For giving questions use donation_summary (totals, top donors, by campaign), list_donations
  (recent gifts), and household_giving (rolled up per household). Report dollar amounts clearly.
- Sending a campaign is a real, irreversible outbound action. NEVER send on your own initiative.
  The flow is: save_campaign_draft -> the user reviews -> approve_campaign_draft (only when the
  user approves) -> send_campaign (only when the user explicitly says to send this draft).
  send_campaign defaults to a DRY RUN (emails no one); use mode:"live" ONLY if the user explicitly
  asks to send for real. Always state whether a send was a dry run or live, and the counts.
- Keep your final answer short, warm, and specific about what you did or found. When you drafted a
  campaign email, include the full subject and body in your answer so the user can review it.`;

const MAX_TURNS = 6;

/**
 * Runs the intent-to-action loop: the model plans, calls CRM tools, sees the
 * results, and iterates until it produces a final answer (or hits MAX_TURNS).
 */
export async function runAgent(
  userIntent: string,
  providerInput: ProviderConfig | ProviderCandidate[] = {}
): Promise<AgentResult> {
  const provider = getProvider(providerInput);
  const messages: Message[] = [{ role: "user", content: userIntent }];
  const steps: AgentStep[] = [];
  let answer = "";
  const usage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let turns = 0;

  // Personalize: fold the learned working-style profile into the system prompt.
  const style = await buildWorkingStyle();
  const system = style ? `${SYSTEM_PROMPT}\n\n${style.promptBlock}` : SYSTEM_PROMPT;
  const personalized = style !== null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await provider.complete(system, messages, tools);
    turns++;
    if (res.usage) {
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      usage.totalTokens += res.usage.totalTokens;
    }

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

  const rep = provider.report?.();
  return {
    provider: provider.name,
    model: provider.model,
    answer,
    steps,
    usage,
    turns,
    personalized,
    providerUsed: rep?.providerUsed,
    providerUsage: rep?.providerUsage,
    failovers: rep?.failovers,
  };
}
