"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadSettings, hasUsableKey } from "@/lib/settings";
import { estimateCostUSD, formatUSD } from "@/lib/pricing";
import { Logo } from "@/components/Logo";

type AgentStep = {
  type: "text" | "tool";
  label: string;
  input?: Record<string, unknown>;
  result?: unknown;
};

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number };

type AgentResult = {
  provider: string;
  model: string;
  answer: string;
  steps: AgentStep[];
  usage?: Usage;
  turns?: number;
  historyId?: number | null;
  personalized?: boolean;
  role?: string;
};

type HistoryItem = {
  id: number;
  intent: string;
  model: string | null;
  total_tokens: number;
  tools_used: string[];
  rating: number | null;
  created_at: string;
};

const EXAMPLES = [
  "Draft an email campaign for our Spring Gala targeting potential donors",
  "How many contacts do we have?",
  "Import these contacts: Maria Chang, maria@example.org; David Chang, david@example.org",
  "Find possible duplicate contacts",
  "Find contacts who might be related",
];

export default function Home() {
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyConfigured, setKeyConfigured] = useState(true);
  const [display, setDisplay] = useState({ showTokens: true, showCost: true });
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);
  const router = useRouter();

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    router.replace("/login");
  }

  async function refreshRecent() {
    try {
      const res = await fetch("/api/history?limit=6");
      const data = await res.json();
      setRecent(Array.isArray(data?.items) ? data.items : []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const s = loadSettings();
    setKeyConfigured(hasUsableKey(s));
    setDisplay({ showTokens: s.showTokens ?? true, showCost: s.showCost ?? true });
    refreshRecent();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null));
  }, []);

  async function rate(value: number) {
    if (!result?.historyId) return;
    setRating(value);
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: result.historyId, rating: value }),
      });
      refreshRecent();
    } catch {
      /* ignore */
    }
  }

  async function submit(text: string) {
    const value = text.trim();
    if (!value || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setRating(null);
    const settings = loadSettings();
    setDisplay({ showTokens: settings.showTokens ?? true, showCost: settings.showCost ?? true });
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: value, config: settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setResult(data as AgentResult);
      refreshRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <div style={styles.topbar}>
          {me && (
            <span style={styles.who}>
              {me.email} · {me.role}
            </span>
          )}
          {me?.role === "admin" && (
            <Link href="/admin" style={styles.settingsLink}>
              👤 Users
            </Link>
          )}
          <Link href="/settings" style={styles.settingsLink}>
            ⚙ Settings
          </Link>
          {me && (
            <button type="button" onClick={logout} style={styles.logout}>
              Log out
            </button>
          )}
        </div>

        <header style={styles.header}>
          <div style={styles.logoRow}>
            <Logo size={40} />
          </div>
          <div style={styles.logo}>Next-Gen CRM</div>
          <h1 style={styles.prompt}>What do you need to get done today?</h1>
        </header>

        {!keyConfigured && (
          <div style={styles.banner}>
            No AI provider key set for this browser.{" "}
            <Link href="/settings" style={styles.bannerLink}>
              Add one in Settings
            </Link>{" "}
            to run the agent (or the server&apos;s key is used if configured).
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(intent);
          }}
          style={styles.form}
        >
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit(intent);
              }
            }}
            placeholder="e.g. Import 1,000 new contacts and find duplicates…"
            rows={3}
            style={styles.textarea}
            autoFocus
          />
          <div style={styles.formFooter}>
            <span style={styles.hint}>⌘/Ctrl + Enter to run</span>
            <button type="submit" style={styles.button} disabled={loading || !intent.trim()}>
              {loading ? "Working…" : "Get it done"}
            </button>
          </div>
        </form>

        {!result && !loading && (
          <div style={styles.examples}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                style={styles.chip}
                onClick={() => {
                  setIntent(ex);
                  submit(ex);
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {!result && !loading && recent.length > 0 && (
          <div style={styles.recent}>
            <div style={styles.recentTitle}>Recent</div>
            {recent.map((h) => (
              <button
                key={h.id}
                style={styles.recentItem}
                onClick={() => {
                  setIntent(h.intent);
                  submit(h.intent);
                }}
                title={h.tools_used?.length ? `Tools: ${h.tools_used.join(", ")}` : undefined}
              >
                <span style={styles.recentIntent}>{h.intent}</span>
                <span style={styles.recentMeta}>
                  {h.rating === 1 ? "👍 " : h.rating === -1 ? "👎 " : ""}
                  {new Date(h.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        {result && (
          <section style={styles.result}>
            <div style={styles.answer}>{result.answer}</div>

            <div style={styles.meta}>
              {result.provider}/{result.model}
              {display.showTokens && result.usage && result.usage.totalTokens > 0 && (
                <>
                  {" · "}
                  <span title={`${result.usage.inputTokens.toLocaleString()} in · ${result.usage.outputTokens.toLocaleString()} out`}>
                    {result.usage.totalTokens.toLocaleString()} tokens
                    {" "}({result.usage.inputTokens.toLocaleString()} in · {result.usage.outputTokens.toLocaleString()} out)
                  </span>
                </>
              )}
              {display.showCost && result.usage && result.usage.totalTokens > 0 && (() => {
                const cost = estimateCostUSD(result.model, result.usage);
                return cost === null
                  ? " · cost n/a"
                  : ` · ~${formatUSD(cost)} est.`;
              })()}
              {result.turns ? ` · ${result.turns} model ${result.turns === 1 ? "turn" : "turns"}` : ""}
              {result.personalized ? " · ✦ personalized" : ""}
              {result.role ? ` · 🔒 as ${result.role}` : ""}
            </div>

            {result.historyId != null && (
              <div style={styles.feedback}>
                <span style={styles.feedbackLabel}>Was this helpful?</span>
                <button
                  type="button"
                  onClick={() => rate(1)}
                  style={{ ...styles.rateBtn, ...(rating === 1 ? styles.rateBtnActive : {}) }}
                  aria-label="Helpful"
                >
                  👍
                </button>
                <button
                  type="button"
                  onClick={() => rate(-1)}
                  style={{ ...styles.rateBtn, ...(rating === -1 ? styles.rateBtnActive : {}) }}
                  aria-label="Not helpful"
                >
                  👎
                </button>
                {rating !== null && <span style={styles.feedbackThanks}>Thanks — saved.</span>}
              </div>
            )}

            {result.steps.some((s) => s.type === "tool") && (
              <details style={styles.details}>
                <summary style={styles.summary}>
                  What the agent did ({result.steps.filter((s) => s.type === "tool").length} actions)
                </summary>
                <div style={styles.steps}>
                  {result.steps.map((s, i) =>
                    s.type === "tool" ? (
                      <div key={i} style={styles.step}>
                        <div style={styles.stepName}>🛠 {s.label}</div>
                        <pre style={styles.pre}>{JSON.stringify(s.result, null, 2)}</pre>
                      </div>
                    ) : null
                  )}
                </div>
              </details>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    padding: "8vh 20px 60px",
  },
  container: { width: "100%", maxWidth: 720 },
  topbar: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, marginBottom: 8 },
  who: { fontSize: 12.5, color: "var(--muted)", marginRight: "auto" },
  settingsLink: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  logout: {
    fontSize: 13,
    color: "var(--muted)",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  banner: {
    marginTop: 18,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--muted)",
    fontSize: 13,
    textAlign: "center",
  },
  bannerLink: { color: "var(--accent)", textDecoration: "none", fontWeight: 600 },
  header: { textAlign: "center", marginBottom: 28 },
  logoRow: { display: "flex", justifyContent: "center", marginBottom: 14 },
  logo: {
    fontSize: 13,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 18,
  },
  prompt: { fontSize: 30, fontWeight: 600, margin: 0, lineHeight: 1.2 },
  form: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 14,
    boxShadow: "var(--shadow)",
  },
  textarea: {
    width: "100%",
    border: "none",
    outline: "none",
    resize: "vertical",
    background: "transparent",
    color: "var(--fg)",
    fontSize: 17,
    lineHeight: 1.5,
    padding: 4,
  },
  formFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  hint: { fontSize: 12, color: "var(--muted)" },
  button: {
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: 10,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  examples: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 22,
    justifyContent: "center",
  },
  chip: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    color: "var(--muted)",
    borderRadius: 999,
    padding: "7px 14px",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left",
  },
  error: {
    marginTop: 22,
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #d9534f",
    color: "#d9534f",
    background: "rgba(217, 83, 79, 0.06)",
    fontSize: 14,
  },
  result: { marginTop: 26 },
  answer: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "18px 20px",
    fontSize: 16,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    boxShadow: "var(--shadow)",
  },
  meta: { marginTop: 10, fontSize: 12.5, color: "var(--muted)" },
  recent: { marginTop: 26, display: "flex", flexDirection: "column", gap: 6 },
  recentTitle: {
    fontSize: 12,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 4,
    textAlign: "center",
  },
  recentItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    width: "100%",
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "9px 14px",
    fontSize: 13,
    color: "var(--fg)",
    cursor: "pointer",
    textAlign: "left",
  },
  recentIntent: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  recentMeta: { color: "var(--muted)", fontSize: 12, flexShrink: 0 },
  feedback: { marginTop: 12, display: "flex", alignItems: "center", gap: 8 },
  feedbackLabel: { fontSize: 13, color: "var(--muted)" },
  rateBtn: {
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 14,
    cursor: "pointer",
  },
  rateBtnActive: { borderColor: "var(--accent)", background: "rgba(181,80,42,0.12)" },
  feedbackThanks: { fontSize: 12, color: "var(--ok)" },
  details: { marginTop: 14 },
  summary: { cursor: "pointer", fontSize: 13, color: "var(--muted)" },
  steps: { marginTop: 12, display: "flex", flexDirection: "column", gap: 12 },
  step: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 12,
    background: "var(--card)",
  },
  stepName: { fontSize: 13, fontWeight: 600, marginBottom: 6 },
  pre: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--muted)",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};
