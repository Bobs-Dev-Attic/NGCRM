import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { contextFromRequest, requireStaff } from "@/lib/access";

const STATUSES = ["draft", "active", "closed"] as const;

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

      return NextResponse.json({ campaign, progress, topDonors, donations, role: ctx.role });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load campaign.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

/**
 * Edit campaign details (name, goal, event date, status). Admin/staff only —
 * volunteers get 403. Org-scoped via RLS: the update only touches a campaign in
 * the user's org.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(req);
  if (guard === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (guard === 403) return NextResponse.json({ error: "Admins and staff only." }, { status: 403 });
  const ctx = guard;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid campaign id." }, { status: 400 });
  }

  let body: { name?: unknown; goal_amount?: unknown; event_date?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  let goal: number | null = null;
  if (body.goal_amount !== null && body.goal_amount !== undefined && body.goal_amount !== "") {
    goal = Number(body.goal_amount);
    if (!Number.isFinite(goal) || goal < 0) {
      return NextResponse.json({ error: "Goal must be a non-negative number." }, { status: 400 });
    }
  }

  const eventDate =
    typeof body.event_date === "string" && body.event_date.trim() ? body.event_date.trim() : null;

  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: `Status must be one of: ${STATUSES.join(", ")}.` }, { status: 400 });
  }

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();
      const [row] = (await sql`
        UPDATE campaigns
        SET name = ${name},
            goal_amount = ${goal},
            event_date = ${eventDate}::date,
            status = ${status}
        WHERE id = ${id}
        RETURNING id, name, event_date, goal_amount::float AS goal_amount, status, created_at
      `) as {
        id: number;
        name: string;
        event_date: string | null;
        goal_amount: number | null;
        status: string;
        created_at: string;
      }[];
      if (!row) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
      return NextResponse.json({ campaign: row });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update campaign.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
