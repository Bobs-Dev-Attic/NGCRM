import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai/agent";
import type { ProviderConfig } from "@/lib/ai/types";

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

export async function POST(req: Request) {
  let intent = "";
  let config: ProviderConfig = {};
  try {
    const body = await req.json();
    intent = typeof body?.intent === "string" ? body.intent.trim() : "";
    config = parseConfig(body?.config);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!intent) {
    return NextResponse.json({ error: "Please describe what you need to get done." }, { status: 400 });
  }

  try {
    // Note: config may carry a user's API key (bring-your-own-key). It is used
    // transiently for this request only and never logged or persisted.
    const result = await runAgent(intent, config);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
