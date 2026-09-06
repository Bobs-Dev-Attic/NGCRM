import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { requireStaff } from "@/lib/access";
import {
  embedTexts,
  toVectorLiteral,
  contactEmbedText,
  parseEmbedConfig,
  EmbeddingError,
} from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 64; // contacts embedded per call; the UI loops until remaining = 0

/**
 * Backfill contact embeddings for semantic search. Admin/staff only. Embeds one
 * batch of not-yet-indexed contacts (or all, when `all` is set) using the
 * caller's OpenAI-compatible provider, then reports how many remain so the UI
 * can call again until done. Org- and sensitivity-scoped via RLS.
 */
export async function POST(req: Request) {
  const guard = await requireStaff(req);
  if (guard === 401) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (guard === 403) return NextResponse.json({ error: "Admins and staff only." }, { status: 403 });
  const ctx = guard;

  let body: { embed?: unknown; all?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const embed = parseEmbedConfig(body.embed);
  if (!embed) {
    return NextResponse.json(
      { error: "Reindexing needs an OpenAI-compatible provider with a key. Add one in Settings." },
      { status: 400 }
    );
  }
  const reembedAll = body.all === true;

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();

      const pending = (await sql`
        SELECT id, first_name, last_name, email, city, state, tags, notes
        FROM contacts
        WHERE ${reembedAll} OR embedding IS NULL OR embedding_model IS DISTINCT FROM ${embed.model}
        ORDER BY id
        LIMIT ${BATCH}
      `) as {
        id: number;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        city: string | null;
        state: string | null;
        tags: string[] | null;
        notes: string | null;
      }[];

      if (pending.length > 0) {
        const vectors = await embedTexts(pending.map(contactEmbedText), embed);
        for (let i = 0; i < pending.length; i++) {
          await sql`
            UPDATE contacts
            SET embedding = ${toVectorLiteral(vectors[i])}::vector, embedding_model = ${embed.model}
            WHERE id = ${pending[i].id}
          `;
        }
      }

      const [counts] = (await sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE embedding IS NOT NULL
                             AND embedding_model IS NOT DISTINCT FROM ${embed.model})::int AS indexed
        FROM contacts
      `) as { total: number; indexed: number }[];

      return NextResponse.json({
        embedded: pending.length,
        indexed: counts.indexed,
        total: counts.total,
        remaining: Math.max(0, counts.total - counts.indexed),
      });
    } catch (err) {
      const message = err instanceof EmbeddingError ? err.message : err instanceof Error ? err.message : "Reindex failed.";
      const hint =
        !(err instanceof EmbeddingError) && /vector|embedding|operator|column/i.test(message)
          ? " (Has the schema been migrated with pgvector? Run db:migrate.)"
          : "";
      return NextResponse.json({ error: message + hint }, { status: 400 });
    }
  });
}
