import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { contextFromRequest } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Household detail + combined giving across its members. Org- and
 * sensitivity-scoped via RLS: a member the signed-in user can't see (e.g. a
 * restricted contact for a volunteer) is excluded from the member list and the
 * combined totals — the rollup reflects only what they're allowed to see.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextFromRequest(req);
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid household id." }, { status: 400 });
  }

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();

      const [household] = (await sql`
        SELECT id, name, created_at FROM households WHERE id = ${id}
      `) as { id: number; name: string | null; created_at: string }[];
      if (!household) {
        return NextResponse.json({ error: "Household not found." }, { status: 404 });
      }

      const members = (await sql`
        SELECT c.id,
               coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'') AS name,
               c.email, c.tags,
               coalesce(sum(d.amount), 0)::float AS given,
               count(d.id)::int AS gifts
        FROM contacts c
        LEFT JOIN donations d ON d.contact_id = c.id
        WHERE c.household_id = ${id}
        GROUP BY c.id
        ORDER BY given DESC, name
      `) as {
        id: number;
        name: string;
        email: string | null;
        tags: string[];
        given: number;
        gifts: number;
      }[];

      const [giving] = (await sql`
        SELECT coalesce(sum(d.amount), 0)::float AS total,
               count(d.id)::int AS gifts,
               count(DISTINCT d.contact_id)::int AS donors,
               coalesce(max(d.amount), 0)::float AS largest,
               max(d.donated_at) AS last_gift
        FROM contacts c
        JOIN donations d ON d.contact_id = c.id
        WHERE c.household_id = ${id}
      `) as {
        total: number;
        gifts: number;
        donors: number;
        largest: number;
        last_gift: string | null;
      }[];

      const donations = (await sql`
        SELECT d.id, d.amount::float AS amount, d.donated_at,
               d.contact_id,
               coalesce(ct.first_name,'') || ' ' || coalesce(ct.last_name,'') AS donor,
               d.campaign_id, cp.name AS campaign
        FROM contacts ct
        JOIN donations d ON d.contact_id = ct.id
        LEFT JOIN campaigns cp ON cp.id = d.campaign_id
        WHERE ct.household_id = ${id}
        ORDER BY d.donated_at DESC, d.id DESC
        LIMIT 100
      `) as {
        id: number;
        amount: number;
        donated_at: string;
        contact_id: number;
        donor: string;
        campaign_id: number | null;
        campaign: string | null;
      }[];

      return NextResponse.json({ household, members, giving, donations });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load household.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
