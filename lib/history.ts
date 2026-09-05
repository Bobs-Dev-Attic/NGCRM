import { getSql } from "@/lib/db";
import type { AgentResult } from "@/lib/ai/agent";

/**
 * Server-side persistence of request history. Every agent request is logged
 * here (best-effort — a logging failure never breaks the response), and the
 * rows double as the training signal for personalizing the agent over time.
 */

export type HistoryItem = {
  id: number;
  intent: string;
  model: string | null;
  total_tokens: number;
  tools_used: string[];
  rating: number | null;
  created_at: string;
};

/** Persist a completed request. Returns the new row id, or null on failure. */
export async function saveRequest(intent: string, r: AgentResult): Promise<number | null> {
  try {
    const sql = getSql();
    const toolsUsed = r.steps.filter((s) => s.type === "tool").map((s) => s.label);
    const [row] = await sql`
      INSERT INTO request_history
        (intent, answer, provider, model, input_tokens, output_tokens, total_tokens, turns, tools_used, steps)
      VALUES
        (${intent}, ${r.answer}, ${r.provider}, ${r.model},
         ${r.usage.inputTokens}, ${r.usage.outputTokens}, ${r.usage.totalTokens},
         ${r.turns}, ${toolsUsed}, ${JSON.stringify(r.steps)}::jsonb)
      RETURNING id
    `;
    return Number(row.id);
  } catch {
    // Table may not exist yet (schema not migrated) — don't fail the request.
    return null;
  }
}

export async function listHistory(limit = 20): Promise<HistoryItem[]> {
  const sql = getSql();
  const n = Math.min(Math.max(limit, 1), 100);
  const rows = await sql`
    SELECT id, intent, model, total_tokens, tools_used, rating, created_at
    FROM request_history
    ORDER BY created_at DESC
    LIMIT ${n}
  `;
  return rows as HistoryItem[];
}

/** Record thumbs up/down feedback on a past request. */
export async function rateRequest(id: number, rating: number): Promise<void> {
  const sql = getSql();
  const normalized = rating > 0 ? 1 : rating < 0 ? -1 : null;
  await sql`UPDATE request_history SET rating = ${normalized} WHERE id = ${id}`;
}
