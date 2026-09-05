import { NextResponse } from "next/server";
import { getTokenFromCookie, verifySession, authSecret } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me → the current user, or 401 if not signed in. */
export async function GET(req: Request) {
  const token = getTokenFromCookie(req.headers.get("cookie"));
  if (!token) return NextResponse.json({ user: null }, { status: 401 });
  try {
    const payload = await verifySession(token, authSecret());
    if (!payload) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: { email: payload.email, role: payload.role } });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
