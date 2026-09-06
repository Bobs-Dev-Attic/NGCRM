import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { requireStaff } from "@/lib/access";
import {
  embedTexts,
  toVectorLiteral,
  contactEmbedText,
  parseEmbedConfig,
} from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INSERT_CHUNK = 500;
const EMBED_CAP = 256;
const EMBED_BATCH = 64;

type Row = Record<string, unknown>;

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

/**
 * Bulk-import contacts from mapped CSV rows. Admin/staff only, RLS-scoped
 * (org_id comes from the session). Rows with no name and no email are skipped.
 * Best-effort embed-on-write when an embeddings config is supplied.
 *   POST { contacts: [{ first_name, last_name, email, ... , tags }], embed? }
 */
export async function POST(req: Request) {
  const guard = await requireStaff(req);
  if (guard === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (guard === 403) return NextResponse.json({ error: "Admins and staff only." }, { status: 403 });
  const ctx = guard;

  let body: { contacts?: unknown; embed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const raw = Array.isArray(body.contacts) ? (body.contacts as Row[]) : [];
  if (raw.length === 0) return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  if (raw.length > 20000) return NextResponse.json({ error: "Too many rows (max 20,000)." }, { status: 400 });

  // Normalize; skip rows that carry no identifying info at all.
  const cs = raw
    .map((c) => ({
      first_name: s(c.first_name),
      last_name: s(c.last_name),
      email: s(c.email),
      phone: s(c.phone),
      address_line: s(c.address_line),
      city: s(c.city),
      state: s(c.state),
      postal_code: s(c.postal_code),
      notes: s(c.notes),
      tags: normalizeTags(c.tags),
    }))
    .filter((c) => c.first_name || c.last_name || c.email);

  const skipped = raw.length - cs.length;
  if (cs.length === 0) {
    return NextResponse.json({ imported: 0, skipped, error: "No rows had a name or email." }, { status: 400 });
  }

  const embed = parseEmbedConfig(body.embed);

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();
      const ids: number[] = [];

      for (let i = 0; i < cs.length; i += INSERT_CHUNK) {
        const chunk = cs.slice(i, i + INSERT_CHUNK);
        const rows = (await sql`
          INSERT INTO contacts
            (first_name, last_name, email, phone, address_line, city, state, postal_code, tags, source, notes)
          SELECT first_name, last_name, email, phone, address_line, city, state, postal_code,
                 coalesce(string_to_array(nullif(tag_str, ''), '|'), '{}')::text[],
                 'import', notes
          FROM unnest(
            ${chunk.map((c) => c.first_name)}::text[],
            ${chunk.map((c) => c.last_name)}::text[],
            ${chunk.map((c) => c.email)}::text[],
            ${chunk.map((c) => c.phone)}::text[],
            ${chunk.map((c) => c.address_line)}::text[],
            ${chunk.map((c) => c.city)}::text[],
            ${chunk.map((c) => c.state)}::text[],
            ${chunk.map((c) => c.postal_code)}::text[],
            ${chunk.map((c) => c.tags.join("|"))}::text[],
            ${chunk.map((c) => c.notes)}::text[]
          ) AS t(first_name, last_name, email, phone, address_line, city, state, postal_code, tag_str, notes)
          RETURNING id
        `) as { id: number }[];
        for (const r of rows) ids.push(Number(r.id));
      }

      if (embed) await embedInserted(ids);

      return NextResponse.json({ imported: ids.length, skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    // Best-effort: embed a bounded number of the freshly-imported contacts.
    async function embedInserted(newIds: number[]) {
      if (!embed) return;
      const targets = newIds.slice(0, EMBED_CAP);
      try {
        const sql = getSql();
        const rows = (await sql`
          SELECT id, first_name, last_name, email, city, state, tags, notes, custom
          FROM contacts WHERE id = ANY(${targets}::bigint[])
        `) as Record<string, unknown>[];
        for (let i = 0; i < rows.length; i += EMBED_BATCH) {
          const batch = rows.slice(i, i + EMBED_BATCH);
          const vectors = await embedTexts(
            batch.map((r) =>
              contactEmbedText({
                first_name: r.first_name as string | null,
                last_name: r.last_name as string | null,
                email: r.email as string | null,
                city: r.city as string | null,
                state: r.state as string | null,
                tags: (r.tags as string[]) ?? [],
                notes: r.notes as string | null,
                custom: r.custom,
              })
            ),
            embed
          );
          for (let j = 0; j < batch.length; j++) {
            await sql`
              UPDATE contacts
              SET embedding = ${toVectorLiteral(vectors[j])}::vector, embedding_model = ${embed.model}
              WHERE id = ${Number(batch[j].id)}
            `;
          }
        }
      } catch {
        /* best-effort — Reindex will index anything we couldn't */
      }
    }
  });
}

/** Split a tags cell on comma/semicolon/pipe into a clean list. */
function normalizeTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
  const str = s(v);
  if (!str) return [];
  return str
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
