"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadSettings,
  saveSettings,
  clearSettings,
  DEFAULT_SETTINGS,
  type ClientSettings,
} from "@/lib/settings";
import { PROVIDER_PRESETS, getPreset } from "@/lib/providers";

export default function SettingsPage() {
  const [s, setS] = useState<ClientSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setS(loadSettings());
  }, []);

  const preset = getPreset(s.preset);

  function update<K extends keyof ClientSettings>(k: K, v: ClientSettings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }

  function choosePreset(id: string) {
    const p = getPreset(id);
    // Switching preset prefills the transport, base URL, and default model.
    setS((prev) => ({
      ...prev,
      preset: p.id,
      provider: p.transport,
      baseUrl: p.defaultBaseUrl ?? "",
      model: p.defaultModel,
      // workspace id only makes sense for Anthropic
      workspaceId: p.transport === "anthropic" ? prev.workspaceId : "",
    }));
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

  const isAnthropic = preset.transport === "anthropic";

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/" style={styles.back}>
            ← Back
          </Link>
          <h1 style={styles.title}>Settings</h1>
          <p style={styles.sub}>
            Choose the AI provider the agent uses. Your key is stored only in this
            browser and sent with each request — it is never saved on the server.
          </p>
        </header>

        <div style={styles.card}>
          <div style={styles.fieldLabel}>Provider</div>
          <div style={styles.presetGrid}>
            {PROVIDER_PRESETS.map((p) => {
              const active = p.id === preset.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => choosePreset(p.id)}
                  style={{
                    ...styles.presetChip,
                    ...(active ? styles.presetChipActive : {}),
                  }}
                >
                  {p.label}
                  {p.local ? <span style={styles.localTag}>local</span> : null}
                </button>
              );
            })}
          </div>

          {preset.local && (
            <div style={styles.guide}>
              <div style={styles.guideTitle}>Set up {preset.label}</div>
              <ol style={styles.guideList}>
                {preset.setup?.map((step, i) => (
                  <li key={i} style={styles.guideStep}>
                    {step}
                  </li>
                ))}
              </ol>
              <div style={styles.guideCaveat}>
                ⚠ Local models run on your machine, and the agent calls the
                provider from the <strong>server</strong>. So a{" "}
                <code>localhost</code> endpoint only works when you run NGCRM
                locally (<code>npm run dev</code>) — the hosted{" "}
                <code>ngcrm.vercel.app</code> server can&apos;t reach your
                computer. Also pick a model that supports{" "}
                <strong>tool / function calling</strong>, which the agent relies on.
              </div>
            </div>
          )}

          <label style={styles.label}>
            Model
            <input
              value={s.model || ""}
              onChange={(e) => update("model", e.target.value)}
              placeholder={preset.defaultModel}
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            API key {!preset.needsKey && <span style={styles.optional}>(optional for local)</span>}
            <div style={styles.keyRow}>
              <input
                type={showKey ? "text" : "password"}
                value={s.apiKey || ""}
                onChange={(e) => update("apiKey", e.target.value)}
                placeholder={preset.needsKey ? "paste your key…" : "(usually not required)"}
                style={{ ...styles.input, marginBottom: 0 }}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" style={styles.reveal} onClick={() => setShowKey((v) => !v)}>
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            {preset.keyHelp && <span style={styles.help}>{preset.keyHelp}</span>}
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
                placeholder={preset.defaultBaseUrl}
                style={styles.input}
              />
            </label>
          )}

          <div style={styles.divider} />

          <div style={styles.fieldLabel}>Display</div>
          <label style={styles.toggle}>
            <input
              type="checkbox"
              checked={s.showTokens ?? true}
              onChange={(e) => update("showTokens", e.target.checked)}
            />
            Show token counts under each answer
          </label>
          <label style={styles.toggle}>
            <input
              type="checkbox"
              checked={s.showCost ?? true}
              onChange={(e) => update("showCost", e.target.checked)}
            />
            Show estimated dollar cost under each answer
          </label>

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
          Leave the key blank to fall back to the server&apos;s configured provider
          (if any). Per-request browser settings always take precedence.
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
  fieldLabel: { fontSize: 13, fontWeight: 600, marginBottom: 10 },
  presetGrid: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  presetChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    borderRadius: 999,
    padding: "8px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  presetChipActive: {
    borderColor: "var(--accent)",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    fontWeight: 600,
  },
  localTag: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    opacity: 0.7,
    border: "1px solid currentColor",
    borderRadius: 4,
    padding: "0 4px",
  },
  guide: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "14px 16px",
    marginBottom: 18,
    background: "var(--bg)",
  },
  guideTitle: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  guideList: { margin: 0, paddingLeft: 18 },
  guideStep: { fontSize: 13, color: "var(--fg)", lineHeight: 1.6, marginBottom: 4 },
  guideCaveat: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "var(--muted)",
    borderTop: "1px solid var(--border)",
    paddingTop: 10,
  },
  label: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 16 },
  optional: { fontWeight: 400, color: "var(--muted)" },
  help: { display: "block", fontWeight: 400, color: "var(--muted)", fontSize: 12, marginTop: 6 },
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
  divider: { height: 1, background: "var(--border)", margin: "4px 0 18px" },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13.5,
    color: "var(--fg)",
    marginBottom: 12,
    cursor: "pointer",
  },
  actions: { display: "flex", gap: 10, marginTop: 8 },
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
