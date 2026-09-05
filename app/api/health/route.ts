import { NextResponse } from "next/server";
import { getRawSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint. Reports which database the deployed app is actually
 * connected to and whether the schema has been migrated there. Secret-safe:
 * exposes only the DB host + database name (never credentials). Useful for
 * catching a local-vs-Vercel DATABASE_URL / Neon-branch mismatch.
 */
export async function GET() {
  const url = process.env.DATABASE_URL || "";
  let dbHost: string | null = null;
  try {
    dbHost = url ? new URL(url).host : null; // host only, no user:password
  } catch {
    dbHost = null;
  }

  const result: Record<string, unknown> = {
    ok: false,
    databaseUrlSet: Boolean(url),
    authSecretSet: Boolean(process.env.AUTH_SECRET),
    dbHost,
  };

  try {
    const sql = getRawSql();
    const [row] = (await sql`
      SELECT current_database() AS database,
             to_regclass('public.users')    IS NOT NULL AS has_users,
             to_regclass('public.orgs')     IS NOT NULL AS has_orgs,
             to_regclass('public.contacts') IS NOT NULL AS has_contacts
    `) as {
      database: string;
      has_users: boolean;
      has_orgs: boolean;
      has_contacts: boolean;
    }[];
    result.ok = true;
    result.database = row.database;
    result.tables = {
      users: row.has_users,
      orgs: row.has_orgs,
      contacts: row.has_contacts,
    };
    result.migrated = row.has_users && row.has_orgs && row.has_contacts;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result);
}
