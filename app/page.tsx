"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadSettings, hasUsableKey } from "@/lib/settings";

type AgentStep = {
  type: "text" | "tool";
  label: string;
  input?: Record<string, unknown>;
  result?: unknown;
};

type AgentResult = {
  provider: string;
  model: string;
  answer: string;
  steps: AgentStep[];
};

const EXAMPLES = [
  "Set a goal for this morning: prepare an email campaign for potential donors for our spring gala",
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

  useEffect(() => {
    setKeyConfigured(hasUsableKey(loadSettings()));
  }, []);

  async function submit(text: string) {
    const value = text.trim();
    if (!value || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: value, config: loadSettings() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setResult(data as AgentResult);
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
          <Link href="/settings" style={styles.settingsLink}>
            ⚙ Settings
          </Link>
        </div>

        <header style={styles.header}>
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

        {error && <div style={styles.error}>{error}</div>}

        {result && (
          <section style={styles.result}>
            <div style={styles.answer}>{result.answer}</div>

            {result.steps.some((s) => s.type === "tool") && (
              <details style={styles.details}>
                <summary style={styles.summary}>
                  What the agent did ({result.steps.filter((s) => s.type === "tool").length} actions
                  · {result.provider}/{result.model})
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
  topbar: { display: "flex", justifyContent: "flex-end", marginBottom: 8 },
  settingsLink: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
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
