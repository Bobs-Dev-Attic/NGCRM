import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { contextFromRequest } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Campaign detail + progress toward its goal. Org- and sensitivity-scoped via
 * RLS: gifts from contacts the signed-in user can't see are excluded from the
 * raised total, donor count, and lists — so progress reflects only visible
 * giving.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextFromRequest(req);
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid campaign id." }, { status: 400 });
  }

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();

      const [campaign] = (await sql`
        SELECT id, name, event_date, goal_amount::float AS goal_amount, status, created_at
        FROM campaigns WHERE id = ${id}
      `) as {
        id: number;
        name: string;
        event_date: string | null;
        goal_amount: number | null;
        status: string;
        created_at: string;
      }[];
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      }

      const [progress] = (await sql`
        SELECT coalesce(sum(amount), 0)::float AS raised,
               count(*)::int AS gifts,
               count(DISTINCT contact_id)::int AS donors,
               coalesce(avg(amount), 0)::float AS average,
               max(donated_at) AS last_gift
        FROM donations WHERE campaign_id = ${id}
      `) as {
        raised: number;
        gifts: number;
        donors: number;
        average: number;
        last_gift: string | null;
      }[];

      const topDonors = (await sql`
        SELECT ct.id AS contact_id,
               coalesce(ct.first_name,'') || ' ' || coalesce(ct.last_name,'') AS name,
               sum(d.amount)::float AS total, count(*)::int AS gifts
        FROM donations d JOIN contacts ct ON ct.id = d.contact_id
        WHERE d.campaign_id = ${id}
        GROUP BY ct.id, name ORDER BY total DESC LIMIT 10
      `) as { contact_id: number; name: string; total: number; gifts: number }[];

      const donations = (await sql`
        SELECT d.id, d.amount::float AS amount, d.donated_at, d.contact_id,
               coalesce(ct.first_name,'') || ' ' || coalesce(ct.last_name,'') AS donor
        FROM donations d JOIN contacts ct ON ct.id = d.contact_id
        WHERE d.campaign_id = ${id}
        ORDER BY d.donated_at DESC, d.id DESC LIMIT 100
      `) as { id: number; amount: number; donated_at: string; contact_id: number; donor: string }[];

      return NextResponse.json({ campaign, progress, topDonors, donations });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load campaign.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
