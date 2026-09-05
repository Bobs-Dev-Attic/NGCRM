import { NextResponse } from "next/server";
import { runAgent } from "@/lib/ai/agent";

// The agent uses the Node.js runtime (SDKs + DB pooling), not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let intent = "";
  try {
    const body = await req.json();
    intent = typeof body?.intent === "string" ? body.intent.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!intent) {
    return NextResponse.json({ error: "Please describe what you need to get done." }, { status: 400 });
  }

  try {
    const result = await runAgent(intent);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
