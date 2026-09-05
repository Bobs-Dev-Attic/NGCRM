import { NextResponse } from "next/server";
import { getRawSql } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireAdmin, ROLES } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = { id: number; email: string; role: string; created_at: string };

function isRole(v: unknown): v is (typeof ROLES)[number] {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/** Users table isn't under RLS, so admin queries scope to the org explicitly. */
async function countAdmins(orgId: number | null): Promise<number> {
  const sql = getRawSql();
  const [{ n }] = (await sql`
    SELECT count(*)::int AS n FROM users WHERE org_id = ${orgId} AND role = 'admin'
  `) as { n: number }[];
  return n;
}

/** GET → list users in the admin's org. */
export async function GET(req: Request) {
  const ctx = await requireAdmin(req);
  if (ctx === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (ctx === 403) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const sql = getRawSql();
  const users = (await sql`
    SELECT id, email, role, created_at FROM users
    WHERE org_id = ${ctx.orgId} ORDER BY created_at
  `) as UserRow[];
  return NextResponse.json({ users, me: ctx.userId });
}

/** POST → create a user in the admin's org. */
export async function POST(req: Request) {
  const ctx = await requireAdmin(req);
  if (ctx === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (ctx === 403) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  let email = "";
  let password = "";
  let role = "staff";
  try {
    const body = await req.json();
    email = String(body?.email || "").trim().toLowerCase();
    password = String(body?.password || "");
    role = isRole(body?.role) ? body.role : "staff";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!email.includes("@")) return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const sql = getRawSql();
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
  }
  const [row] = (await sql`
    INSERT INTO users (org_id, email, password_hash, role)
    VALUES (${ctx.orgId}, ${email}, ${hashPassword(password)}, ${role})
    RETURNING id, email, role, created_at
  `) as UserRow[];
  return NextResponse.json({ user: row });
}

/** PATCH → change a user's role. */
export async function PATCH(req: Request) {
  const ctx = await requireAdmin(req);
  if (ctx === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (ctx === 403) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  let id = 0;
  let role = "";
  try {
    const body = await req.json();
    id = Number(body?.id);
    role = String(body?.role || "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!Number.isInteger(id) || !isRole(role)) {
    return NextResponse.json({ error: "Invalid id or role." }, { status: 400 });
  }

  const sql = getRawSql();
  const rows = (await sql`SELECT id, role FROM users WHERE id = ${id} AND org_id = ${ctx.orgId}`) as {
    id: number;
    role: string;
  }[];
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // Don't let the last admin be demoted (avoids locking the org out).
  if (target.role === "admin" && role !== "admin" && (await countAdmins(ctx.orgId)) <= 1) {
    return NextResponse.json({ error: "Can't demote the last admin." }, { status: 409 });
  }
  const [updated] = (await sql`
    UPDATE users SET role = ${role} WHERE id = ${id} AND org_id = ${ctx.orgId}
    RETURNING id, email, role, created_at
  `) as UserRow[];
  return NextResponse.json({ user: updated });
}

/** DELETE → remove a user. */
export async function DELETE(req: Request) {
  const ctx = await requireAdmin(req);
  if (ctx === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (ctx === 403) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  if (String(id) === ctx.userId) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 409 });
  }

  const sql = getRawSql();
  const rows = (await sql`SELECT id, role FROM users WHERE id = ${id} AND org_id = ${ctx.orgId}`) as {
    id: number;
    role: string;
  }[];
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (target.role === "admin" && (await countAdmins(ctx.orgId)) <= 1) {
    return NextResponse.json({ error: "Can't delete the last admin." }, { status: 409 });
  }
  await sql`DELETE FROM users WHERE id = ${id} AND org_id = ${ctx.orgId}`;
  return NextResponse.json({ ok: true });
}
