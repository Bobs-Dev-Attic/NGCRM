import { NextResponse } from "next/server";
import { getRawSql } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  authSecret,
  type SessionPayload,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = String(body?.email || "").trim().toLowerCase();
    password = String(body?.password || "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const sql = getRawSql();
    const rows = (await sql`
      SELECT id, org_id, email, role, password_hash FROM users WHERE email = ${email}
    `) as {
      id: number;
      org_id: number | null;
      email: string;
      role: string;
      password_hash: string;
    }[];
    const user = rows[0];
    // Verify even on missing user to reduce timing signal, then reject uniformly.
    const ok = user ? verifyPassword(password, user.password_hash) : false;
    if (!user || !ok) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    const payload: SessionPayload = {
      userId: Number(user.id),
      orgId: user.org_id == null ? null : Number(user.org_id),
      role: user.role,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    };
    const token = await signSession(payload, authSecret());
    const res = NextResponse.json({ email: user.email, role: user.role });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
