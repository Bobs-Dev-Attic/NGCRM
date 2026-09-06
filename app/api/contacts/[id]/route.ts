import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { contextFromRequest } from "@/lib/access";

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

      return NextResponse.json({ contact, giving, donations });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load contact.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
