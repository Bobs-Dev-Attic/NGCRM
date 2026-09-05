import { getSql } from "@/lib/db";

/**
 * Working-style profile, derived deterministically from request_history.
 *
 * This is "step 1" of personalization: no model training — we aggregate the
 * user's past requests (which tools they use, when they work, what they rated
 * well) into a compact block that is injected into the agent's system prompt so
 * it tailors its approach. Cheap, provider-agnostic, and fully explainable.
 */

export type WorkingStyleSummary = {
  totalRequests: number;
  dominantPeriod: string | null; // morning | afternoon | evening
  topTools: { tool: string; n: number }[];
  likedTools: string[];
  dislikedTools: string[];
  recentIntents: string[];
};

export type WorkingStyle = { summary: WorkingStyleSummary; promptBlock: string };

/** Build the profile, or null if there's no history yet (or the table is absent). */
export async function buildWorkingStyle(): Promise<WorkingStyle | null> {
  try {
    const sql = getSql();

    const [agg] = (await sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE extract(hour from created_at) < 12)::int AS morning,
        count(*) FILTER (WHERE extract(hour from created_at) >= 12
                          AND extract(hour from created_at) < 17)::int AS afternoon,
        count(*) FILTER (WHERE extract(hour from created_at) >= 17)::int AS evening
      FROM request_history
    `) as { total: number; morning: number; afternoon: number; evening: number }[];

    if (!agg || agg.total < 1) return null;

    const toolRows = (await sql`
      SELECT tool,
             count(*)::int AS n,
             count(*) FILTER (WHERE rating = 1)::int AS liked,
             count(*) FILTER (WHERE rating = -1)::int AS disliked
      FROM request_history, unnest(tools_used) AS tool
      GROUP BY tool
      ORDER BY n DESC
      LIMIT 8
    `) as { tool: string; n: number; liked: number; disliked: number }[];

    const recentRows = (await sql`
      SELECT intent FROM request_history ORDER BY created_at DESC LIMIT 5
    `) as { intent: string }[];

    const period =
      agg.morning >= agg.afternoon && agg.morning >= agg.evening
        ? "morning"
        : agg.afternoon >= agg.evening
        ? "afternoon"
        : "evening";

    const summary: WorkingStyleSummary = {
      totalRequests: agg.total,
      dominantPeriod: agg.total >= 2 ? period : null,
      topTools: toolRows.map((r) => ({ tool: r.tool, n: r.n })),
      likedTools: toolRows.filter((r) => r.liked > 0).map((r) => r.tool),
      dislikedTools: toolRows.filter((r) => r.disliked > 0).map((r) => r.tool),
      recentIntents: recentRows.map((r) => r.intent),
    };

    return { summary, promptBlock: renderPromptBlock(summary) };
  } catch {
    // request_history not migrated yet, or DB unavailable — no profile.
    return null;
  }
}

function renderPromptBlock(s: WorkingStyleSummary): string {
  const lines: string[] = [
    "## This operator's working style (learned from their past requests)",
    `They have made ${s.totalRequests} request(s) to this CRM.`,
  ];
  if (s.dominantPeriod) lines.push(`They usually work in the ${s.dominantPeriod}.`);
  if (s.topTools.length) {
    lines.push(
      `Most-used actions: ${s.topTools.slice(0, 5).map((t) => `${t.tool} (${t.n})`).join(", ")}.`
    );
  }
  if (s.likedTools.length) lines.push(`They rated these approaches well: ${s.likedTools.join(", ")}.`);
  if (s.dislikedTools.length) lines.push(`They rated these poorly: ${s.dislikedTools.join(", ")}.`);
  if (s.recentIntents.length) {
    lines.push(`Recent focus: ${s.recentIntents.map((i) => `"${i}"`).join("; ")}.`);
  }
  lines.push(
    "Tailor your approach accordingly: lead with what they usually do, favor approaches they rate well, avoid ones they rate poorly, and keep continuity with their recent focus. Never invent history — rely only on the facts above."
  );
  return lines.join("\n");
}
