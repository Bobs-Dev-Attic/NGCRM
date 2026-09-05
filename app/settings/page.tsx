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
import {
  THEMES,
  loadTheme,
  saveTheme,
  surpriseTheme,
  type ThemeId,
  type ThemeState,
} from "@/lib/theme";

type WorkingStyle = {
  totalRequests: number;
  dominantPeriod: string | null;
  topTools: { tool: string; n: number }[];
  likedTools: string[];
  dislikedTools: string[];
  recentIntents: string[];
};

type Tab = "profiles" | "providers" | "theme";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("providers");

  // Provider settings
  const [s, setS] = useState<ClientSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Profile
  const [profile, setProfile] = useState<WorkingStyle | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Theme
  const [theme, setThemeState] = useState<ThemeState>({ theme: "system" });

  useEffect(() => {
    setS(loadSettings());
    setThemeState(loadTheme());
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        setProfile(data?.profile ?? null);
      } catch {
        setProfile(null);
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, []);

  // --- provider handlers ---
  const preset = getPreset(s.preset);
  const isAnthropic = preset.transport === "anthropic";

  function update<K extends keyof ClientSettings>(k: K, v: ClientSettings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }
  function choosePreset(id: string) {
    const p = getPreset(id);
    setS((prev) => ({
      ...prev,
      preset: p.id,
      provider: p.transport,
      baseUrl: p.defaultBaseUrl ?? "",
      model: p.defaultModel,
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

  // Display toggles persist immediately, merged onto stored settings so an
  // unsaved (half-typed) provider key isn't written out early.
  function updateDisplay(k: "showTokens" | "showCost", v: boolean) {
    const next = { ...loadSettings(), [k]: v };
    saveSettings(next);
    setS((prev) => ({ ...prev, [k]: v }));
  }

  // --- theme handlers ---
  function chooseTheme(id: ThemeId) {
    const next: ThemeState = { theme: id };
    saveTheme(next);
    setThemeState(next);
  }
  function onSurprise() {
    const next = surpriseTheme();
    saveTheme(next);
    setThemeState(next);
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/" style={styles.back}>
            ← Back
          </Link>
          <h1 style={styles.title}>Settings</h1>
        </header>

        <div style={styles.tabs}>
          {(["profiles", "providers", "theme"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            >
              {t === "profiles" ? "Profiles" : t === "providers" ? "Providers" : "Theme"}
            </button>
          ))}
        </div>

        {/* ---------- PROFILES ---------- */}
        {tab === "profiles" && (
          <div style={styles.card}>
            <div style={styles.fieldLabel}>Working style — learned from your history</div>
            {!profileLoaded ? (
              <div style={styles.styleEmpty}>Loading…</div>
            ) : !profile ? (
              <div style={styles.styleEmpty}>
                No history yet. Run a few requests (and rate them 👍/👎) and this fills in.
                It&apos;s derived from your saved request history and folded into the agent&apos;s
                instructions on every request.
              </div>
            ) : (
              <div style={styles.styleBody}>
                <div style={styles.styleRow}>
                  <span style={styles.styleKey}>Requests logged</span>
                  <span>{profile.totalRequests}</span>
                </div>
                {profile.dominantPeriod && (
                  <div style={styles.styleRow}>
                    <span style={styles.styleKey}>Usually works</span>
                    <span>{profile.dominantPeriod}</span>
                  </div>
                )}
                {profile.topTools.length > 0 && (
                  <div style={styles.styleRow}>
                    <span style={styles.styleKey}>Most-used actions</span>
                    <span>{profile.topTools.map((t) => `${t.tool} (${t.n})`).join(", ")}</span>
                  </div>
                )}
                {profile.likedTools.length > 0 && (
                  <div style={styles.styleRow}>
                    <span style={styles.styleKey}>Rated well 👍</span>
                    <span>{profile.likedTools.join(", ")}</span>
                  </div>
                )}
                {profile.dislikedTools.length > 0 && (
                  <div style={styles.styleRow}>
                    <span style={styles.styleKey}>Rated poorly 👎</span>
                    <span>{profile.dislikedTools.join(", ")}</span>
                  </div>
                )}
                <div style={styles.styleNote}>
                  This profile is injected into the agent&apos;s instructions on every request,
                  so its answers adapt to how you work.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- PROVIDERS ---------- */}
        {tab === "providers" && (
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
                    style={{ ...styles.presetChip, ...(active ? styles.presetChipActive : {}) }}
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
                  ⚠ Local models run on your machine, and the agent calls the provider from the{" "}
                  <strong>server</strong>. So a <code>localhost</code> endpoint only works when you
                  run NGCRM locally (<code>npm run dev</code>) — the hosted{" "}
                  <code>ngcrm.vercel.app</code> server can&apos;t reach your computer. Also pick a
                  model that supports <strong>tool / function calling</strong>.
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

            <div style={styles.actions}>
              <button type="button" style={styles.save} onClick={onSave}>
                {saved ? "Saved ✓" : "Save"}
              </button>
              <button type="button" style={styles.clear} onClick={onClear}>
                Clear
              </button>
            </div>

            <p style={styles.note}>
              Your key is stored only in this browser and sent with each request — never saved on the
              server. Leave it blank to fall back to the server&apos;s configured provider.
            </p>
          </div>
        )}

        {/* ---------- THEME ---------- */}
        {tab === "theme" && (
          <div style={styles.card}>
            <div style={styles.fieldLabel}>Color scheme</div>
            <div style={styles.themeGrid}>
              {THEMES.map((t) => {
                const active = theme.theme === t.id && !theme.accent;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => chooseTheme(t.id)}
                    style={{ ...styles.themeCard, ...(active ? styles.themeCardActive : {}) }}
                  >
                    <span style={{ ...styles.swatch, background: t.bg }}>
                      <span style={{ ...styles.swatchBar, background: t.fg }} />
                      <span style={{ ...styles.swatchDot, background: t.accent }} />
                    </span>
                    <span style={styles.themeLabel}>{t.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={onSurprise}
                style={{ ...styles.themeCard, ...(theme.accent ? styles.themeCardActive : {}) }}
              >
                <span style={{ ...styles.swatch, background: "linear-gradient(135deg,#ff6b6b,#feca57,#48dbfb,#1dd1a1)" }}>
                  <span style={styles.swatchSparkle}>✦</span>
                </span>
                <span style={styles.themeLabel}>Surprise me!</span>
              </button>
            </div>
            {theme.accent && (
              <div style={styles.themeNote}>
                Surprise applied a <strong>{theme.theme}</strong> base with a random accent
                (<code>{theme.accent}</code>). Press it again for another, or pick a scheme above.
              </div>
            )}

            <div style={styles.divider} />

            <div style={styles.fieldLabel}>Display</div>
            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={s.showTokens ?? true}
                onChange={(e) => updateDisplay("showTokens", e.target.checked)}
              />
              Show token counts under each answer
            </label>
            <label style={styles.toggle}>
              <input
                type="checkbox"
                checked={s.showCost ?? true}
                onChange={(e) => updateDisplay("showCost", e.target.checked)}
              />
              Show estimated dollar cost under each answer
            </label>
          </div>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "6vh 20px 60px" },
  container: { width: "100%", maxWidth: 560 },
  header: { marginBottom: 16 },
  back: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 0" },

  tabs: {
    display: "flex",
    gap: 4,
    marginBottom: 16,
    borderBottom: "1px solid var(--border)",
  },
  tab: {
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "var(--muted)",
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: -1,
  },
  tabActive: { color: "var(--fg)", borderBottom: "2px solid var(--accent)" },

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

  // theme picker
  themeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 10,
  },
  themeCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    borderRadius: 12,
    padding: 10,
    cursor: "pointer",
    textAlign: "left",
  },
  themeCardActive: { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" },
  swatch: {
    position: "relative",
    width: 40,
    height: 40,
    borderRadius: 8,
    flexShrink: 0,
    border: "1px solid rgba(128,128,128,0.25)",
    overflow: "hidden",
    display: "block",
  },
  swatchBar: {
    position: "absolute",
    left: 7,
    top: 11,
    width: 20,
    height: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
  swatchDot: {
    position: "absolute",
    left: 7,
    bottom: 8,
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  swatchSparkle: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 18,
    textShadow: "0 1px 2px rgba(0,0,0,0.4)",
  },
  themeLabel: { fontSize: 13, fontWeight: 600, color: "var(--fg)" },
  themeNote: { fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6, marginTop: 12 },

  divider: { height: 1, background: "var(--border)", margin: "20px 0 18px" },
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13.5,
    color: "var(--fg)",
    marginBottom: 12,
    cursor: "pointer",
  },

  // profile
  styleEmpty: { fontSize: 13, color: "var(--muted)", lineHeight: 1.6 },
  styleBody: { display: "flex", flexDirection: "column", gap: 8 },
  styleRow: { display: "flex", gap: 12, fontSize: 13.5, alignItems: "baseline" },
  styleKey: { color: "var(--muted)", minWidth: 140, flexShrink: 0 },
  styleNote: {
    marginTop: 6,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--muted)",
    lineHeight: 1.6,
  },
};
