import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { contextFromRequest, requireStaff } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contact detail + giving history. Org- and sensitivity-scoped via RLS, so a
 * volunteer requesting a restricted contact simply gets a 404 (the row is
 * invisible to them), not a partial record.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contextFromRequest(req);
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid contact id." }, { status: 400 });
  }

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();

      const [contact] = (await sql`
        SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
               c.address_line, c.city, c.state, c.postal_code,
               c.tags, c.source, c.notes, c.created_at,
               c.household_id, h.name AS household
        FROM contacts c
        LEFT JOIN households h ON h.id = c.household_id
        WHERE c.id = ${id}
      `) as {
        id: number;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        address_line: string | null;
        city: string | null;
        state: string | null;
        postal_code: string | null;
        tags: string[];
        source: string | null;
        notes: string | null;
        created_at: string;
        household_id: number | null;
        household: string | null;
      }[];

      if (!contact) {
        return NextResponse.json({ error: "Contact not found." }, { status: 404 });
      }

      const [giving] = (await sql`
        SELECT coalesce(sum(amount), 0)::float AS total,
               count(*)::int AS gifts,
               coalesce(max(amount), 0)::float AS largest,
               max(donated_at) AS last_gift,
               min(donated_at) AS first_gift
        FROM donations WHERE contact_id = ${id}
      `) as {
        total: number;
        gifts: number;
        largest: number;
        last_gift: string | null;
        first_gift: string | null;
      }[];

      const donations = (await sql`
        SELECT d.id, d.amount::float AS amount, d.donated_at,
               d.campaign_id, c.name AS campaign
        FROM donations d
        LEFT JOIN campaigns c ON c.id = d.campaign_id
        WHERE d.contact_id = ${id}
        ORDER BY d.donated_at DESC, d.id DESC
        LIMIT 100
      `) as {
        id: number;
        amount: number;
        donated_at: string;
        campaign_id: number | null;
        campaign: string | null;
      }[];

      const campaigns = (await sql`
        SELECT id, name FROM campaigns ORDER BY coalesce(event_date, created_at::date) DESC, name LIMIT 100
      `) as { id: number; name: string }[];

      return NextResponse.json({ contact, giving, donations, campaigns, role: ctx.role });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load contact.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

/**
 * Record a gift for this contact. Admin/staff only (volunteers get 403) and
 * RLS-scoped: the insert only succeeds when the contact is visible to the
 * signed-in user, and org_id is derived from the session GUC.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff(req);
  if (guard === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (guard === 403) return NextResponse.json({ error: "Admins and staff only." }, { status: 403 });
  const ctx = guard;

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid contact id." }, { status: 400 });
  }

  let body: { amount?: unknown; campaign_id?: unknown; donated_at?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
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

      // Confirm the contact is visible to this user (RLS) before inserting.
      const [exists] = (await sql`SELECT id FROM contacts WHERE id = ${id}`) as { id: number }[];
      if (!exists) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

      // Validate the campaign is in scope, if one was chosen.
      if (campaign !== null) {
        const [c] = (await sql`SELECT id FROM campaigns WHERE id = ${campaign}`) as { id: number }[];
        if (!c) return NextResponse.json({ error: "Campaign not found." }, { status: 400 });
      }

      const [row] = (await sql`
        INSERT INTO donations (contact_id, campaign_id, amount, donated_at)
        VALUES (${id}, ${campaign}, ${amount}, coalesce(${donatedAt}::date, current_date))
        RETURNING id, amount::float AS amount, donated_at, campaign_id
      `) as { id: number; amount: number; donated_at: string; campaign_id: number | null }[];

      return NextResponse.json({ recorded: row }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record gift.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
