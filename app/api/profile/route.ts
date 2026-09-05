import { NextResponse } from "next/server";
import { buildWorkingStyle } from "@/lib/profile";
import { runWithContext } from "@/lib/db";
import { contextFromRequest } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/profile → the working-style profile derived from request_history. */
export async function GET(req: Request) {
  const ctx = await contextFromRequest(req);
  if (!ctx) return NextResponse.json({ profile: null }, { status: 401 });
  return runWithContext(ctx, async () => {
    try {
      const style = await buildWorkingStyle();
      if (!style) return NextResponse.json({ profile: null });
      return NextResponse.json({ profile: style.summary, promptBlock: style.promptBlock });
    } catch {
      return NextResponse.json({ profile: null });
    }
  });
}
