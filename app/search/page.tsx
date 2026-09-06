"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadSettings, embeddingConfig } from "@/lib/settings";

type Result = {
  id: number;
  name: string;
  email: string | null;
  tags: string[];
  city: string | null;
  state: string | null;
  similarity: number;
};

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [indexed, setIndexed] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<string | null>(null);
  const [hasEmbed, setHasEmbed] = useState(true);

  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);

  useEffect(() => {
    setHasEmbed(embeddingConfig(loadSettings()) !== null);
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(d?.user?.role ?? d?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!q.trim()) return;
    const embed = embeddingConfig(loadSettings());
    if (!embed) {
      setError("Semantic search needs an OpenAI-compatible provider with a key. Add one in Settings.");
      return;
    }
    setSearching(true);
    try {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: q.trim(), embed, limit: 15 }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || "Search failed");
      setResults(body.results as Result[]);
      setIndexed(typeof body.indexed === "number" ? body.indexed : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  async function reindex() {
    setReindexMsg(null);
    const embed = embeddingConfig(loadSettings());
    if (!embed) {
      setReindexMsg("Add an OpenAI-compatible provider with a key in Settings first.");
      return;
    }
    setReindexing(true);
    try {
      let total = 0;
      let embeddedThisRun = 0;
      // Loop batches until nothing remains.
      for (let i = 0; i < 200; i++) {
        const r = await fetch("/api/contacts/reindex", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embed }),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || "Reindex failed");
        embeddedThisRun += body.embedded ?? 0;
        total = body.total ?? total;
        setReindexMsg(`Indexed ${body.indexed}/${body.total} contacts…`);
        if (!body.remaining || body.embedded === 0) {
          setReindexMsg(`✓ Indexed ${body.indexed}/${body.total} contacts (${embeddedThisRun} this run).`);
          break;
        }
      }
    } catch (err) {
      setReindexMsg(err instanceof Error ? err.message : "Reindex failed");
    } finally {
      setReindexing(false);
    }
  }

  const canReindex = role === "admin" || role === "staff";

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/" style={styles.back}>
            ← Back
          </Link>
          <h1 style={styles.title}>Semantic search</h1>
          <p style={styles.sub}>
            Find contacts by meaning, not just keywords — e.g. “lapsed major donors near Chicago”.
          </p>
        </header>

        {!hasEmbed && (
          <div style={styles.banner}>
            No OpenAI-compatible provider is set for this browser.{" "}
            <Link href="/settings" style={styles.bannerLink}>
              Add one in Settings
            </Link>{" "}
            to enable semantic search.
          </div>
        )}

        <form onSubmit={search} style={styles.form}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Describe who you're looking for…"
            style={styles.input}
            autoFocus
          />
          <button type="submit" disabled={searching || !q.trim()} style={styles.button}>
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {canReindex && (
          <div style={styles.reindexRow}>
            <button type="button" onClick={reindex} disabled={reindexing} style={styles.reindexBtn}>
              {reindexing ? "Reindexing…" : "Reindex contacts"}
            </button>
            {reindexMsg && <span style={styles.reindexMsg}>{reindexMsg}</span>}
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        {results && (
          <div style={styles.results}>
            {results.length === 0 ? (
              <div style={styles.empty}>
                No matches.{" "}
                {indexed === 0
                  ? "No contacts are indexed yet — run Reindex above."
                  : "Try different wording."}
              </div>
            ) : (
              <ul style={styles.list}>
                {results.map((c) => (
                  <li key={c.id} style={styles.li}>
                    <div style={styles.liMain}>
                      <Link href={`/contacts/${c.id}`} style={styles.link}>
                        {c.name.trim() || c.email || "—"}
                      </Link>
                      <span style={styles.meta}>
                        {[c.email, [c.city, c.state].filter(Boolean).join(", "), (c.tags || []).join(", ")]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <span style={styles.score}>{Math.round(c.similarity * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "6vh 20px 60px" },
  container: { width: "100%", maxWidth: 720 },
  header: { marginBottom: 18 },
  back: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 6px" },
  sub: { fontSize: 14, color: "var(--muted)", margin: 0 },
  banner: {
    marginTop: 14,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    fontSize: 13.5,
    color: "var(--muted)",
  },
  bannerLink: { color: "var(--accent)", textDecoration: "none", fontWeight: 600 },
  form: { display: "flex", gap: 10, marginTop: 16 },
  input: {
    flex: 1,
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--fg)",
  },
  button: {
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 10,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    cursor: "pointer",
  },
  reindexRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 10 },
  reindexBtn: {
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--fg)",
    cursor: "pointer",
  },
  reindexMsg: { fontSize: 12.5, color: "var(--muted)" },
  error: {
    marginTop: 16,
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #d9534f",
    color: "#d9534f",
    background: "rgba(217,83,79,0.06)",
    fontSize: 14,
  },
  results: { marginTop: 20 },
  empty: { fontSize: 14, color: "var(--muted)" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  li: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
  },
  liMain: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  link: { color: "var(--accent)", textDecoration: "none", fontWeight: 600, fontSize: 14.5 },
  meta: { fontSize: 12.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  score: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  },
};
