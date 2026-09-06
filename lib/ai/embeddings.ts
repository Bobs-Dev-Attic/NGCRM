/**
 * Provider-agnostic text embeddings over the OpenAI-compatible `/embeddings`
 * endpoint (OpenAI, Gemini's OpenAI-compat, Ollama, LM Studio all speak it).
 *
 * The contacts.embedding column is fixed at 1536 dims, so semantic search needs
 * a 1536-dim model — the default is OpenAI `text-embedding-3-small`. If a
 * configured model returns a different dimension, callers surface a clear error
 * rather than storing a mismatched vector.
 */

export const EMBEDDING_DIM = 1536;
export const DEFAULT_EMBED_MODEL = "text-embedding-3-small";

export type EmbedConfig = { baseUrl: string; apiKey: string; model: string };

export class EmbeddingError extends Error {}

function joinUrl(baseUrl: string, path: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  return `${b}/${path.replace(/^\/+/, "")}`;
}

/** Embed a batch of texts. Returns one vector per input, in order. */
export async function embedTexts(texts: string[], cfg: EmbedConfig): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!cfg.baseUrl) throw new EmbeddingError("No embeddings base URL configured.");

  const res = await fetch(joinUrl(cfg.baseUrl, "embeddings"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: cfg.model || DEFAULT_EMBED_MODEL, input: texts }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EmbeddingError(
      `Embeddings request failed (${res.status}). ${detail.slice(0, 300)}`.trim()
    );
  }

  const json = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
  const data = json.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new EmbeddingError("Embeddings response was malformed.");
  }
  // Order by index defensively — some providers don't preserve input order.
  const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = sorted.map((d) => d.embedding);

  const dim = vectors[0]?.length ?? 0;
  if (dim !== EMBEDDING_DIM) {
    throw new EmbeddingError(
      `This model returns ${dim}-dim vectors, but search needs ${EMBEDDING_DIM}. ` +
        `Use an OpenAI-compatible ${EMBEDDING_DIM}-dim model (e.g. ${DEFAULT_EMBED_MODEL}).`
    );
  }
  return vectors;
}

/** Embed a single text; convenience wrapper. */
export async function embedOne(text: string, cfg: EmbedConfig): Promise<number[]> {
  const [v] = await embedTexts([text], cfg);
  return v;
}

/** Postgres vector literal, e.g. [0.12,-0.03,...] — cast with ::vector. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/** Compose the profile text we embed for a contact. */
export function contactEmbedText(c: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  tags?: string[] | null;
  notes?: string | null;
}): string {
  const parts = [
    [c.first_name, c.last_name].filter(Boolean).join(" "),
    c.email || "",
    [c.city, c.state].filter(Boolean).join(", "),
    (c.tags || []).join(", "),
    c.notes || "",
  ].filter((s) => s && s.trim());
  return parts.join(". ").trim() || "(no details)";
}

/** Parse an embed config from the request body, or null if incomplete. */
export function parseEmbedConfig(input: unknown): EmbedConfig | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const baseUrl = typeof o.baseUrl === "string" ? o.baseUrl.trim() : "";
  if (!baseUrl) return null;
  return {
    baseUrl,
    apiKey: typeof o.apiKey === "string" ? o.apiKey : "",
    model: typeof o.model === "string" && o.model.trim() ? o.model.trim() : DEFAULT_EMBED_MODEL,
  };
}
