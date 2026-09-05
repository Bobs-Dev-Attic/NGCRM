"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  loadSettings,
  saveSettings,
  clearSettings,
  DEFAULT_SETTINGS,
  makeEntry,
  type ClientSettings,
  type ProviderEntry,
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
  const [, setSaved] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Profile
  const [profile, setProfile] = useState<WorkingStyle | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Theme
  const [theme, setThemeState] = useState<ThemeState>({ theme: "system" });

  // Signed-in user
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);
  const router = useRouter();

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
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null));
  }, []);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    router.replace("/login");
  }

  // --- provider chain handlers (operate on s.providers) ---
  function setProviders(next: ProviderEntry[]) {
    setS((prev) => ({ ...prev, providers: next }));
    setSaved(false);
  }
  function updateEntry(id: string, patch: Partial<ProviderEntry>) {
    setProviders(s.providers.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function choosePresetFor(id: string, presetId: string) {
    const p = getPreset(presetId);
    updateEntry(id, {
      preset: p.id,
      provider: p.transport,
      baseUrl: p.defaultBaseUrl ?? "",
      model: p.defaultModel,
      workspaceId: p.transport === "anthropic" ? undefined : "",
    } as Partial<ProviderEntry>);
  }
  // Table actions persist immediately (discrete, single-click changes).
  function persist(next: ProviderEntry[]) {
    const ns = { ...s, providers: next };
    setS(ns);
    saveSettings(ns);
    setSaved(true);
  }
  function addProvider() {
    const entry = makeEntry("anthropic");
    persist([...s.providers, entry]);
    setEditId(entry.id); // open the editor for the new provider
    setMenuOpenId(null);
  }
  function removeProvider(id: string) {
    persist(s.providers.filter((e) => e.id !== id));
    setMenuOpenId(null);
  }
  function toggleEnabled(id: string) {
    persist(s.providers.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
    setMenuOpenId(null);
  }
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const arr = [...s.providers];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    persist(arr);
  }
  function resetUsage(id: string) {
    updateEntry(id, { usedTokens: 0 });
  }
  function onDoneEdit() {
    saveSettings(s); // persist the entry's edits made in the modal
    setSaved(true);
    setEditId(null);
  }
  function onClear() {
    clearSettings();
    setS(loadSettings());
    setEditId(null);
    setMenuOpenId(null);
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
            <div style={styles.fieldLabel}>Signed in</div>
            {me ? (
              <div style={styles.styleBody}>
                <div style={styles.styleRow}>
                  <span style={styles.styleKey}>Account</span>
                  <span>{me.email}</span>
                </div>
                <div style={styles.styleRow}>
                  <span style={styles.styleKey}>Role</span>
                  <span>{me.role}</span>
                </div>
                <div style={styles.actions}>
                  <button type="button" style={styles.clear} onClick={logout}>
                    Log out
                  </button>
                </div>
                <div style={styles.styleNote}>
                  Your role comes from your account and is enforced by database row-level security.
                  A <strong>volunteer</strong> cannot see records marked restricted (e.g. board /
                  major donors) — the database withholds them, not the AI. Roles are managed per
                  user in the <code>users</code> table.
                </div>
              </div>
            ) : (
              <div style={styles.styleEmpty}>Not signed in.</div>
            )}

            <div style={styles.divider} />

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
          <>
            <p style={styles.chainIntro}>
              Providers are tried <strong>top to bottom</strong>. If one errors (e.g. out of credit)
              or reaches its usage threshold, the agent falls through to the next enabled provider.
              Drag a row to reorder; use the ⋯ menu to edit, toggle, or delete.
            </p>

            <div style={styles.tableCard}>
              {s.providers.map((e, i) => {
                const p = getPreset(e.preset);
                const overThreshold = e.thresholdTokens > 0 && e.usedTokens >= e.thresholdTokens;
                const dragging = dragIndex === i;
                return (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null) reorder(dragIndex, i);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    style={{
                      ...styles.row,
                      ...(dragging ? styles.rowDragging : {}),
                      ...(e.enabled ? {} : styles.rowDisabled),
                    }}
                  >
                    <span style={styles.dragHandle} title="Drag to reorder">
                      ⠿
                    </span>
                    <span style={styles.rowNum}>{i + 1}</span>
                    <div style={styles.rowMain}>
                      <div style={styles.rowName}>
                        {p.label}
                        {p.local ? <span style={styles.localTag}>local</span> : null}
                      </div>
                      <div style={styles.rowSub}>{e.model || p.defaultModel}</div>
                    </div>
                    <div style={styles.rowStatus}>
                      <span
                        style={{
                          ...styles.dot,
                          background: e.enabled ? "var(--ok)" : "var(--muted)",
                        }}
                      />
                      {e.enabled ? "On" : "Off"}
                      {overThreshold && <span style={styles.overTag}>over</span>}
                    </div>
                    <div style={styles.rowUsed}>
                      {e.usedTokens.toLocaleString()}
                      {e.thresholdTokens > 0 ? ` / ${e.thresholdTokens.toLocaleString()}` : ""} tok
                    </div>
                    <div style={styles.menuWrap}>
                      <button
                        type="button"
                        style={styles.ellipsis}
                        onClick={() => setMenuOpenId(menuOpenId === e.id ? null : e.id)}
                        aria-label="Provider options"
                      >
                        ⋯
                      </button>
                      {menuOpenId === e.id && (
                        <div style={styles.menu}>
                          <button
                            type="button"
                            style={styles.menuItem}
                            onClick={() => {
                              setEditId(e.id);
                              setMenuOpenId(null);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={styles.menuItem}
                            onClick={() => toggleEnabled(e.id)}
                          >
                            {e.enabled ? "Turn off" : "Turn on"}
                          </button>
                          <button
                            type="button"
                            style={{ ...styles.menuItem, color: "#d9534f" }}
                            onClick={() => removeProvider(e.id)}
                            disabled={s.providers.length <= 1}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {menuOpenId && (
              <div style={styles.backdrop} onClick={() => setMenuOpenId(null)} aria-hidden />
            )}

            <div style={styles.chainActions}>
              <button type="button" style={styles.addBtn} onClick={addProvider}>
                + Add provider
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" style={styles.clear} onClick={onClear}>
                Reset all
              </button>
            </div>

            <p style={styles.note}>
              Keys are stored only in this browser and sent with each request — never saved on the
              server. Usage is tracked per provider here; a provider past its token threshold is
              skipped until you raise the limit or reset its counter.
            </p>
          </>
        )}

        {/* ---------- PROVIDER EDIT MODAL ---------- */}
        {editId &&
          (() => {
            const e = s.providers.find((x) => x.id === editId);
            if (!e) return null;
            const p = getPreset(e.preset);
            const isAnthropic = p.transport === "anthropic";
            return (
              <div style={styles.modalBackdrop} onClick={() => onDoneEdit()}>
                <div style={styles.modal} onClick={(ev) => ev.stopPropagation()}>
                  <div style={styles.modalHead}>
                    <div style={styles.fieldLabel}>Edit provider</div>
                    <button type="button" style={styles.iconBtn} onClick={() => onDoneEdit()}>
                      ✕
                    </button>
                  </div>

                  <div style={styles.presetGrid}>
                    {PROVIDER_PRESETS.map((pp) => (
                      <button
                        key={pp.id}
                        type="button"
                        onClick={() => choosePresetFor(e.id, pp.id)}
                        style={{
                          ...styles.presetChip,
                          ...(pp.id === e.preset ? styles.presetChipActive : {}),
                        }}
                      >
                        {pp.label}
                        {pp.local ? <span style={styles.localTag}>local</span> : null}
                      </button>
                    ))}
                  </div>

                  <label style={styles.label}>
                    Model
                    <input
                      value={e.model}
                      onChange={(ev) => updateEntry(e.id, { model: ev.target.value })}
                      placeholder={p.defaultModel}
                      style={styles.input}
                    />
                  </label>

                  <label style={styles.label}>
                    API key {!p.needsKey && <span style={styles.optional}>(optional for local)</span>}
                    <div style={styles.keyRow}>
                      <input
                        type={showKeys[e.id] ? "text" : "password"}
                        value={e.apiKey}
                        onChange={(ev) => updateEntry(e.id, { apiKey: ev.target.value })}
                        placeholder={p.needsKey ? "paste your key…" : "(usually not required)"}
                        style={{ ...styles.input, marginBottom: 0 }}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        style={styles.reveal}
                        onClick={() => setShowKeys((m) => ({ ...m, [e.id]: !m[e.id] }))}
                      >
                        {showKeys[e.id] ? "Hide" : "Show"}
                      </button>
                    </div>
                    {p.keyHelp && <span style={styles.help}>{p.keyHelp}</span>}
                  </label>

                  {isAnthropic ? (
                    <label style={styles.label}>
                      Workspace ID <span style={styles.optional}>(only for org-scoped keys)</span>
                      <input
                        value={e.workspaceId}
                        onChange={(ev) => updateEntry(e.id, { workspaceId: ev.target.value })}
                        placeholder="wrkspc_…"
                        style={styles.input}
                      />
                    </label>
                  ) : (
                    <label style={styles.label}>
                      Base URL
                      <input
                        value={e.baseUrl}
                        onChange={(ev) => updateEntry(e.id, { baseUrl: ev.target.value })}
                        placeholder={p.defaultBaseUrl}
                        style={styles.input}
                      />
                    </label>
                  )}

                  <div style={styles.entryRow}>
                    <label style={styles.smallField}>
                      Retries
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={e.maxRetries}
                        onChange={(ev) =>
                          updateEntry(e.id, { maxRetries: Math.max(0, Number(ev.target.value) || 0) })
                        }
                        style={styles.smallInput}
                      />
                    </label>
                    <label style={styles.smallField}>
                      Token threshold <span style={styles.optional}>(0 = ∞)</span>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={e.thresholdTokens}
                        onChange={(ev) =>
                          updateEntry(e.id, {
                            thresholdTokens: Math.max(0, Number(ev.target.value) || 0),
                          })
                        }
                        style={styles.smallInput}
                      />
                    </label>
                    <div style={styles.usedBox}>
                      <span style={styles.optional}>Used</span>
                      <span>{e.usedTokens.toLocaleString()} tok</span>
                      <button type="button" style={styles.resetBtn} onClick={() => resetUsage(e.id)}>
                        Reset
                      </button>
                    </div>
                  </div>

                  <div style={styles.actions}>
                    <button type="button" style={styles.save} onClick={() => onDoneEdit()}>
                      Done
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

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
    marginBottom: 14,
  },
  fieldLabel: { fontSize: 13, fontWeight: 600, marginBottom: 10 },

  chainIntro: { fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 14px" },
  entryHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  entryNum: {
    width: 22,
    height: 22,
    borderRadius: 999,
    background: "var(--accent)",
    color: "var(--accent-fg)",
    fontSize: 12,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  entryToggle: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" },
  overTag: {
    fontSize: 11,
    color: "#d9534f",
    border: "1px solid #d9534f",
    borderRadius: 6,
    padding: "1px 6px",
  },
  iconBtn: {
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    borderRadius: 8,
    width: 30,
    height: 28,
    fontSize: 12,
    cursor: "pointer",
  },
  entryRow: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" },
  smallField: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 },
  smallInput: {
    width: 120,
    padding: "8px 10px",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    outline: "none",
  },
  usedBox: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginLeft: "auto" },
  resetBtn: {
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--muted)",
    borderRadius: 8,
    padding: "5px 10px",
    fontSize: 12,
    cursor: "pointer",
  },
  chainActions: { display: "flex", alignItems: "center", gap: 10, marginTop: 4 },
  addBtn: {
    border: "1px dashed var(--border)",
    background: "transparent",
    color: "var(--fg)",
    borderRadius: 10,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },

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

  // provider table
  tableCard: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    boxShadow: "var(--shadow)",
    overflow: "visible",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    cursor: "grab",
  },
  rowDragging: { opacity: 0.5 },
  rowDisabled: { opacity: 0.55 },
  dragHandle: { color: "var(--muted)", fontSize: 16, cursor: "grab", userSelect: "none" },
  rowNum: {
    width: 20,
    height: 20,
    borderRadius: 999,
    background: "var(--accent)",
    color: "var(--accent-fg)",
    fontSize: 11,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
  rowSub: {
    fontSize: 12,
    color: "var(--muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowStatus: { display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--muted)" },
  dot: { width: 8, height: 8, borderRadius: 999, display: "inline-block" },
  rowUsed: {
    fontSize: 12,
    color: "var(--muted)",
    fontVariantNumeric: "tabular-nums",
    minWidth: 96,
    textAlign: "right",
  },
  menuWrap: { position: "relative" },
  ellipsis: {
    border: "none",
    background: "transparent",
    color: "var(--fg)",
    fontSize: 20,
    lineHeight: 1,
    cursor: "pointer",
    padding: "2px 8px",
    borderRadius: 8,
  },
  menu: {
    position: "absolute",
    right: 0,
    top: "100%",
    marginTop: 4,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    boxShadow: "var(--shadow)",
    zIndex: 60,
    minWidth: 130,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  menuItem: {
    background: "transparent",
    border: "none",
    textAlign: "left",
    padding: "9px 14px",
    fontSize: 13,
    color: "var(--fg)",
    cursor: "pointer",
  },
  backdrop: { position: "fixed", inset: 0, zIndex: 40 },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "6vh 16px",
    zIndex: 70,
    overflowY: "auto",
  },
  modal: {
    width: "100%",
    maxWidth: 520,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "var(--shadow)",
  },
  modalHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },

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
