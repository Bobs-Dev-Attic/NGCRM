"use client";

import { useState } from "react";

/**
 * Reusable custom (JSONB) fields display + editor. Shows the current key/value
 * pairs and, for users who may edit, an Add/Edit modal. The parent supplies
 * `onSave(fields)` which persists (e.g. PATCH) and refreshes. Theme-aware.
 */
export function CustomFields({
  fields,
  canEdit,
  onSave,
  title = "Custom fields",
}: {
  fields: Record<string, string>;
  canEdit: boolean;
  onSave: (fields: Record<string, string>) => Promise<void>;
  title?: string;
}) {
  const entries = Object.entries(fields || {});
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<{ key: string; value: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setRows(entries.length ? entries.map(([key, value]) => ({ key, value })) : [{ key: "", value: "" }]);
    setError(null);
    setEditing(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const out: Record<string, string> = {};
    for (const { key, value } of rows) {
      const k = key.trim();
      const v = value.trim();
      if (k && v) out[k] = v;
    }
    setSaving(true);
    try {
      await onSave(out);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={s.head}>
        <span style={s.title}>{title}</span>
        {canEdit && (
          <button type="button" onClick={open} style={s.editBtn}>
            {entries.length ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div style={s.empty}>None yet.</div>
      ) : (
        <dl style={s.dl}>
          {entries.map(([k, v]) => (
            <div key={k} style={s.row}>
              <dt style={s.dt}>{k}</dt>
              <dd style={s.dd}>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {editing && (
        <div style={s.overlay} onClick={() => !saving && setEditing(false)}>
          <form style={s.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div style={s.modalTitle}>{title}</div>
            {rows.map((r, i) => (
              <div key={i} style={s.fieldRow}>
                <input
                  value={r.key}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                  placeholder="Field"
                  style={{ ...s.input, flex: 1 }}
                />
                <input
                  value={r.value}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                  placeholder="Value"
                  style={{ ...s.input, flex: 1.4 }}
                />
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  style={s.removeBtn}
                  aria-label="Remove field"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, { key: "", value: "" }])}
              style={s.addBtn}
            >
              + Add field
            </button>
            {error && <div style={s.error}>{error}</div>}
            <div style={s.actions}>
              <button type="button" onClick={() => setEditing(false)} disabled={saving} style={s.cancel}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={s.save}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 13, fontWeight: 600 },
  editBtn: {
    padding: "4px 10px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    cursor: "pointer",
  },
  empty: { fontSize: 13, color: "var(--muted)" },
  dl: { margin: 0, display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", gap: 12, fontSize: 13.5 },
  dt: { width: 120, flexShrink: 0, color: "var(--muted)", margin: 0 },
  dd: { margin: 0, wordBreak: "break-word" },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 50,
  },
  modal: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "80vh",
    overflowY: "auto",
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "var(--shadow)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: 600 },
  fieldRow: { display: "flex", gap: 8, alignItems: "center" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 9px",
    fontSize: 13.5,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
  },
  removeBtn: {
    flexShrink: 0,
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: 12,
  },
  addBtn: {
    alignSelf: "flex-start",
    padding: "5px 10px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px dashed var(--border)",
    background: "transparent",
    color: "var(--accent)",
    cursor: "pointer",
  },
  error: { fontSize: 12.5, color: "#d9534f" },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 },
  cancel: {
    padding: "8px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    cursor: "pointer",
  },
  save: {
    padding: "8px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    cursor: "pointer",
  },
};
