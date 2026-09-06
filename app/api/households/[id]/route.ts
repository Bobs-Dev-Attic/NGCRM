import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { contextFromRequest, requireStaff } from "@/lib/access";

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

      const campaigns = (await sql`
        SELECT id, name FROM campaigns ORDER BY coalesce(event_date, created_at::date) DESC, name LIMIT 100
      `) as { id: number; name: string }[];

      return NextResponse.json({ household, members, giving, donations, campaigns, role: ctx.role });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load household.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

/**
 * Record a gift from a member of this household. Admin/staff only (volunteers
 * get 403) and RLS-scoped: the donor must be a contact in this household that's
 * visible to the signed-in user, and org_id is derived from the session.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(req);
  if (guard === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (guard === 403) return NextResponse.json({ error: "Admins and staff only." }, { status: 403 });
  const ctx = guard;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid household id." }, { status: 400 });
  }

  let body: { contact_id?: unknown; amount?: unknown; campaign_id?: unknown; donated_at?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const contactId = Number(body.contact_id);
  if (!Number.isInteger(contactId) || contactId <= 0) {
    return NextResponse.json({ error: "Choose which member the gift is from." }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a gift amount greater than 0." }, { status: 400 });
  }
  const campaignId = Number(body.campaign_id);
  const campaign = Number.isInteger(campaignId) && campaignId > 0 ? campaignId : null;
  const donatedAt = typeof body.donated_at === "string" && body.donated_at.trim() ? body.donated_at.trim() : null;

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();

      // The donor must be a visible member of this household (RLS + household_id).
      const [member] = (await sql`
        SELECT id FROM contacts WHERE id = ${contactId} AND household_id = ${id}
      `) as { id: number }[];
      if (!member) {
        return NextResponse.json({ error: "That contact isn't a member of this household." }, { status: 400 });
      }

      if (campaign !== null) {
        const [c] = (await sql`SELECT id FROM campaigns WHERE id = ${campaign}`) as { id: number }[];
        if (!c) return NextResponse.json({ error: "Campaign not found." }, { status: 400 });
      }

      const [row] = (await sql`
        INSERT INTO donations (contact_id, campaign_id, amount, donated_at)
        VALUES (${contactId}, ${campaign}, ${amount}, coalesce(${donatedAt}::date, current_date))
        RETURNING id, contact_id, amount::float AS amount, donated_at, campaign_id
      `) as { id: number; contact_id: number; amount: number; donated_at: string; campaign_id: number | null }[];

      return NextResponse.json({ recorded: row }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record gift.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
