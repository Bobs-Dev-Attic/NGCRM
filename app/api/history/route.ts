import { NextResponse } from "next/server";
import { listHistory, rateRequest } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/history?limit=10 → recent requests. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit")) || 10;
  try {
    const items = await listHistory(limit);
    return NextResponse.json({ items });
  } catch {
    // Table may not exist yet — return empty rather than erroring.
    return NextResponse.json({ items: [] });
  }
}

/** POST /api/history { id, rating } → record thumbs up/down. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = Number(body?.id);
    const rating = Number(body?.rating);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }
    await rateRequest(id, rating);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
