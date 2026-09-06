import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { requireStaff } from "@/lib/access";
import {
  embedTexts,
  toVectorLiteral,
  contactEmbedText,
  parseEmbedConfig,
  type EmbedConfig,
} from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK = 500;
const EMBED_CAP = 256;
const EMBED_BATCH = 64;

type Row = Record<string, unknown>;
type Contact = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  tags: string[];
};

const MODES = ["create", "skip", "update"] as const;
type Mode = (typeof MODES)[number];

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

/**
 * Bulk-import contacts from mapped CSV rows, with optional dedupe against
 * existing contacts by email. Admin/staff only, RLS-scoped.
 *   POST { contacts: [...], mode: "create"|"skip"|"update", embed? }
 *   - create: insert every row (no dedupe)
 *   - skip:   insert rows whose email isn't already present; skip matches
 *   - update: insert new; merge non-blank fields (and union tags) into matches
 * Rows with no name and no email are always skipped. Best-effort embed-on-write.
 */
export async function POST(req: Request) {
  const guard = await requireStaff(req);
  if (guard === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (guard === 403) return NextResponse.json({ error: "Admins and staff only." }, { status: 403 });
  const ctx = guard;

  let body: { contacts?: unknown; mode?: unknown; embed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const raw = Array.isArray(body.contacts) ? (body.contacts as Row[]) : [];
  if (raw.length === 0) return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  if (raw.length > 20000) return NextResponse.json({ error: "Too many rows (max 20,000)." }, { status: 400 });
  const mode: Mode = MODES.includes(body.mode as Mode) ? (body.mode as Mode) : "update";

  const normalized: Contact[] = raw
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

  let skipped = raw.length - normalized.length; // rows with no identifying info

  const embed = parseEmbedConfig(body.embed);

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();

      // --- create: no dedupe, insert everything ---
      if (mode === "create") {
        const ids = await insertContacts(sql, normalized);
        await maybeEmbed(sql, embed, ids);
        return NextResponse.json({ imported: ids.length, updated: 0, skipped });
      }

      // --- skip/update: collapse within-file email dups (last wins) ---
      const byEmail = new Map<string, Contact>();
      const noEmail: Contact[] = [];
      for (const c of normalized) {
        if (c.email) {
          const key = c.email.toLowerCase();
          if (byEmail.has(key)) skipped++; // within-file duplicate
          byEmail.set(key, c);
        } else {
          noEmail.push(c);
        }
      }
      const emailed = [...byEmail.values()];
      const keys = [...byEmail.keys()];

      // Which of those emails already exist (RLS-scoped)?
      const existing = new Set<string>();
      for (let i = 0; i < keys.length; i += CHUNK) {
        const batch = keys.slice(i, i + CHUNK);
        const rows = (await sql`
          SELECT DISTINCT lower(email) AS e FROM contacts
          WHERE email IS NOT NULL AND lower(email) = ANY(${batch}::text[])
        `) as { e: string }[];
        for (const r of rows) existing.add(r.e);
      }

      const matched = emailed.filter((c) => existing.has(c.email!.toLowerCase()));
      const newEmailed = emailed.filter((c) => !existing.has(c.email!.toLowerCase()));
      const toInsert = [...noEmail, ...newEmailed];

      const insertedIds = await insertContacts(sql, toInsert);
      let updatedIds: number[] = [];
      if (mode === "update" && matched.length > 0) {
        updatedIds = await updateContacts(sql, matched);
      } else {
        skipped += matched.length; // mode === "skip"
      }

      await maybeEmbed(sql, embed, [...insertedIds, ...updatedIds]);
      return NextResponse.json({ imported: insertedIds.length, updated: updatedIds.length, skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

type Sql = ReturnType<typeof getSql>;

async function insertContacts(sql: Sql, rows: Contact[]): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const out = (await sql`
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
    for (const r of out) ids.push(Number(r.id));
  }
  return ids;
}

/** Merge non-blank fields (union tags) into existing contacts matched by email. */
async function updateContacts(sql: Sql, rows: Contact[]): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const out = (await sql`
      UPDATE contacts c SET
        first_name   = coalesce(nullif(u.first_name, ''), c.first_name),
        last_name    = coalesce(nullif(u.last_name, ''), c.last_name),
        phone        = coalesce(nullif(u.phone, ''), c.phone),
        address_line = coalesce(nullif(u.address_line, ''), c.address_line),
        city         = coalesce(nullif(u.city, ''), c.city),
        state        = coalesce(nullif(u.state, ''), c.state),
        postal_code  = coalesce(nullif(u.postal_code, ''), c.postal_code),
        notes        = coalesce(nullif(u.notes, ''), c.notes),
        tags         = (
          SELECT array(
            SELECT DISTINCT t
            FROM unnest(c.tags || coalesce(string_to_array(nullif(u.tag_str, ''), '|'), '{}')) AS t
            WHERE t <> ''
          )
        ),
        updated_at   = now()
      FROM unnest(
        ${chunk.map((c) => c.email!.toLowerCase())}::text[],
        ${chunk.map((c) => c.first_name ?? "")}::text[],
        ${chunk.map((c) => c.last_name ?? "")}::text[],
        ${chunk.map((c) => c.phone ?? "")}::text[],
        ${chunk.map((c) => c.address_line ?? "")}::text[],
        ${chunk.map((c) => c.city ?? "")}::text[],
        ${chunk.map((c) => c.state ?? "")}::text[],
        ${chunk.map((c) => c.postal_code ?? "")}::text[],
        ${chunk.map((c) => c.notes ?? "")}::text[],
        ${chunk.map((c) => c.tags.join("|"))}::text[]
      ) AS u(email_lc, first_name, last_name, phone, address_line, city, state, postal_code, notes, tag_str)
      WHERE lower(c.email) = u.email_lc
      RETURNING c.id
    `) as { id: number }[];
    for (const r of out) ids.push(Number(r.id));
  }
  return ids;
}

/** Best-effort embed of a bounded set of contact ids. */
async function maybeEmbed(sql: Sql, embed: EmbedConfig | null, ids: number[]): Promise<void> {
  if (!embed || ids.length === 0) return;
  const targets = ids.slice(0, EMBED_CAP);
  try {
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
