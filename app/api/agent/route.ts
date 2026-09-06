import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai/agent";
import { saveRequest } from "@/lib/history";
import { runWithContext } from "@/lib/db";
import { contextFromRequest } from "@/lib/access";
import { parseEmbedConfig } from "@/lib/ai/embeddings";
import type { ProviderCandidate, ProviderConfig } from "@/lib/ai/types";

// The agent uses the Node.js runtime (SDKs + DB pooling), not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pull only the known config fields, coercing each to a trimmed string. */
function parseConfig(raw: unknown): ProviderConfig {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const s = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  return {
    provider: s(r.provider),
    model: s(r.model),
    apiKey: s(r.apiKey),
    baseUrl: s(r.baseUrl),
    workspaceId: s(r.workspaceId),
  };
}

function parseCandidate(raw: unknown): ProviderCandidate {
  const base = parseConfig(raw);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const label = typeof r.label === "string" && r.label.trim() ? r.label.trim() : undefined;
  const maxRetries = Number.isFinite(Number(r.maxRetries)) ? Number(r.maxRetries) : 0;
  return { ...base, label, maxRetries };
}

export async function POST(req: Request) {
  let intent = "";
  let providerInput: ProviderConfig | ProviderCandidate[] = {};
  let embed: { baseUrl: string; apiKey: string; model: string } | undefined;
  try {
    const body = await req.json();
    intent = typeof body?.intent === "string" ? body.intent.trim() : "";
    // Preferred: an ordered failover chain. Falls back to a single config.
    if (Array.isArray(body?.providers)) {
      providerInput = body.providers.map(parseCandidate);
    } else {
      providerInput = parseConfig(body?.config);
    }
    // Optional embeddings config, so tools can embed newly-created contacts.
    embed = parseEmbedConfig(body?.embed) ?? undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!intent) {
    return NextResponse.json({ error: "Please describe what you need to get done." }, { status: 400 });
  }

  // Establish the access identity for this request; every DB call the agent
  // makes is scoped to it via RLS. No valid session -> reject.
  const ctx = await contextFromRequest(req);
  if (!ctx) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }
  if (embed) ctx.embed = embed;

  return runWithContext(ctx, async () => {
    try {
      const result = await runAgent(intent, providerInput);
      const historyId = await saveRequest(intent, result);
      return NextResponse.json({ ...result, historyId, role: ctx.role });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
