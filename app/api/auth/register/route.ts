import { NextResponse } from "next/server";
import { getRawSql, getDefaultOrgId } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  authSecret,
  type SessionPayload,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Self-registration always creates a plain 'staff' user (no self-granted admin).
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

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const sql = getRawSql();
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
    }
    const orgId = await getDefaultOrgId();
    const [row] = (await sql`
      INSERT INTO users (org_id, email, password_hash, role)
      VALUES (${orgId}, ${email}, ${hashPassword(password)}, 'staff')
      RETURNING id, org_id, email, role
    `) as { id: number; org_id: number | null; email: string; role: string }[];

    const payload: SessionPayload = {
      userId: Number(row.id),
      orgId: row.org_id == null ? null : Number(row.org_id),
      role: row.role,
      email: row.email,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    };
    const token = await signSession(payload, authSecret());
    const res = NextResponse.json({ email: row.email, role: row.role });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Registration failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
