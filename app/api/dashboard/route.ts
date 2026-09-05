import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { contextFromRequest } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dashboard summary. Everything is org-scoped (and sensitivity-scoped for
 * contacts) via RLS, so a volunteer's dashboard automatically reflects only what
 * they're allowed to see.
 */
export async function GET(req: Request) {
  const ctx = await contextFromRequest(req);
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();

      const [{ contacts }] = (await sql`SELECT count(*)::int AS contacts FROM contacts`) as {
        contacts: number;
      }[];
      const byTag = (await sql`
        SELECT tag, count(*)::int AS n FROM contacts, unnest(tags) AS tag
        GROUP BY tag ORDER BY n DESC
      `) as { tag: string; n: number }[];

      const [{ households }] = (await sql`
        SELECT count(*)::int AS households FROM households
      `) as { households: number }[];
      const topHouseholds = (await sql`
        SELECT h.name, count(c.id)::int AS members
        FROM households h LEFT JOIN contacts c ON c.household_id = h.id
        GROUP BY h.id, h.name ORDER BY members DESC, h.name LIMIT 6
      `) as { name: string | null; members: number }[];

      const [don] = (await sql`
        SELECT coalesce(sum(amount), 0)::float AS total,
               count(*)::int AS gifts,
               count(DISTINCT contact_id)::int AS donors
        FROM donations
      `) as { total: number; gifts: number; donors: number }[];
      const topDonors = (await sql`
        SELECT coalesce(ct.first_name,'') || ' ' || coalesce(ct.last_name,'') AS name,
               sum(d.amount)::float AS total
        FROM donations d JOIN contacts ct ON ct.id = d.contact_id
        GROUP BY ct.id, name ORDER BY total DESC LIMIT 6
      `) as { name: string; total: number }[];

      const campaigns = (await sql`
        SELECT status, count(*)::int AS n FROM campaigns GROUP BY status
      `) as { status: string; n: number }[];
      const [{ drafts }] = (await sql`
        SELECT count(*)::int AS drafts FROM campaign_drafts
      `) as { drafts: number }[];

      const recentContacts = (await sql`
        SELECT id, coalesce(first_name,'') || ' ' || coalesce(last_name,'') AS name,
               email, tags, created_at
        FROM contacts ORDER BY created_at DESC LIMIT 6
      `) as { id: number; name: string; email: string | null; tags: string[]; created_at: string }[];

      return NextResponse.json({
        contacts,
        byTag,
        households,
        topHouseholds,
        donations: don,
        topDonors,
        campaigns,
        drafts,
        recentContacts,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load dashboard.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
