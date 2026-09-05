"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProviderConfig } from "@/lib/ai/types";
import { loadSettings, saveSettings, clearSettings, DEFAULT_SETTINGS } from "@/lib/settings";

export default function SettingsPage() {
  const [s, setS] = useState<ProviderConfig>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setS(loadSettings());
  }, []);

  function update<K extends keyof ProviderConfig>(k: K, v: ProviderConfig[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }

  function onSave() {
    saveSettings(s);
    setSaved(true);
  }

  function onClear() {
    clearSettings();
    setS(DEFAULT_SETTINGS);
    setSaved(false);
  }

  const isAnthropic = (s.provider || "anthropic") === "anthropic";

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/" style={styles.back}>
            ← Back
          </Link>
          <h1 style={styles.title}>Settings</h1>
          <p style={styles.sub}>
            Configure the AI provider the agent uses. Your key is stored only in
            this browser and sent with each request — it is never saved on the server.
          </p>
        </header>

        <div style={styles.card}>
          <label style={styles.label}>
            Provider
            <select
              value={s.provider || "anthropic"}
              onChange={(e) => update("provider", e.target.value)}
              style={styles.input}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai-compatible">OpenAI-compatible / Local (Ollama, LM Studio…)</option>
            </select>
          </label>

          <label style={styles.label}>
            Model
            <input
              value={s.model || ""}
              onChange={(e) => update("model", e.target.value)}
              placeholder={isAnthropic ? "claude-sonnet-5" : "gpt-4o / llama3.1"}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            API key
            <div style={styles.keyRow}>
              <input
                type={showKey ? "text" : "password"}
                value={s.apiKey || ""}
                onChange={(e) => update("apiKey", e.target.value)}
                placeholder={isAnthropic ? "sk-ant-…" : "(often not required for local models)"}
                style={{ ...styles.input, marginBottom: 0 }}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" style={styles.reveal} onClick={() => setShowKey((v) => !v)}>
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {isAnthropic ? (
            <label style={styles.label}>
              Workspace ID <span style={styles.optional}>(only for org-scoped keys)</span>
              <input
                value={s.workspaceId || ""}
                onChange={(e) => update("workspaceId", e.target.value)}
                placeholder="wrkspc_…"
                style={styles.input}
              />
            </label>
          ) : (
            <label style={styles.label}>
              Base URL
              <input
                value={s.baseUrl || ""}
                onChange={(e) => update("baseUrl", e.target.value)}
                placeholder="http://localhost:11434/v1"
                style={styles.input}
              />
            </label>
          )}

          <div style={styles.actions}>
            <button type="button" style={styles.save} onClick={onSave}>
              {saved ? "Saved ✓" : "Save"}
            </button>
            <button type="button" style={styles.clear} onClick={onClear}>
              Clear
            </button>
          </div>
        </div>

        <p style={styles.note}>
          Leave everything blank to use the server&apos;s configured provider (if any).
          For a local model, choose &ldquo;OpenAI-compatible&rdquo; and point the Base URL at
          your endpoint — e.g. Ollama at <code>http://localhost:11434/v1</code>.
        </p>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "6vh 20px 60px" },
  container: { width: "100%", maxWidth: 560 },
  header: { marginBottom: 22 },
  back: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 6px" },
  sub: { fontSize: 14, color: "var(--muted)", lineHeight: 1.5, margin: 0 },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "var(--shadow)",
  },
  label: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 16 },
  optional: { fontWeight: 400, color: "var(--muted)" },
  input: {
    display: "block",
    width: "100%",
    marginTop: 6,
    marginBottom: 0,
    padding: "10px 12px",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    outline: "none",
  },
  keyRow: { display: "flex", gap: 8, alignItems: "stretch", marginTop: 6 },
  reveal: {
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--muted)",
    borderRadius: 10,
    padding: "0 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  actions: { display: "flex", gap: 10, marginTop: 4 },
  save: {
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: 10,
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  clear: {
    background: "transparent",
    color: "var(--muted)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "10px 18px",
    fontSize: 14,
    cursor: "pointer",
  },
  note: { fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 18 },
};
