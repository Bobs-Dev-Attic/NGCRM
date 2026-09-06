import { NextResponse } from "next/server";
import { getSql, runWithContext } from "@/lib/db";
import { contextFromRequest } from "@/lib/access";
import { embedOne, toVectorLiteral, parseEmbedConfig, EmbeddingError } from "@/lib/ai/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Semantic contact search. Embeds the query with the caller's (browser-provided)
 * OpenAI-compatible provider, then ranks contacts by cosine similarity to their
 * stored embedding. RLS-scoped: only contacts the signed-in user may see are
 * ranked or returned. The API key is used for this request only, never stored.
 */
export async function POST(req: Request) {
  const ctx = await contextFromRequest(req);
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let body: { q?: unknown; embed?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!q) return NextResponse.json({ error: "Enter something to search for." }, { status: 400 });

  const embed = parseEmbedConfig(body.embed);
  if (!embed) {
    return NextResponse.json(
      { error: "Semantic search needs an OpenAI-compatible provider with a key. Add one in Settings." },
      { status: 400 }
    );
  }
  const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 50);

  let vector: number[];
  try {
    vector = await embedOne(q, embed);
  } catch (err) {
    const message = err instanceof EmbeddingError ? err.message : "Failed to embed the query.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const lit = toVectorLiteral(vector);

  return runWithContext(ctx, async () => {
    try {
      const sql = getSql();
      const rows = (await sql`
        SELECT id,
               coalesce(first_name,'') || ' ' || coalesce(last_name,'') AS name,
               email, tags, city, state,
               1 - (embedding <=> ${lit}::vector) AS similarity
        FROM contacts
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${lit}::vector
        LIMIT ${limit}
      `) as {
        id: number;
        name: string;
        email: string | null;
        tags: string[];
        city: string | null;
        state: string | null;
        similarity: number;
      }[];

      const [{ indexed }] = (await sql`
        SELECT count(*)::int AS indexed FROM contacts WHERE embedding IS NOT NULL
      `) as { indexed: number }[];

      return NextResponse.json({ results: rows, indexed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed.";
      // Most likely cause: pgvector not installed / column missing (run db:migrate).
      const hint = /vector|embedding|operator/i.test(message)
        ? " (Has the schema been migrated with pgvector? Run db:migrate.)"
        : "";
      return NextResponse.json({ error: message + hint }, { status: 500 });
    }
  });
}
