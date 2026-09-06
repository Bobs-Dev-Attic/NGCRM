"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { parseCsv } from "@/lib/csv";
import { loadSettings, embeddingConfig } from "@/lib/settings";

type Field = { key: string; label: string; synonyms: string[] };

const FIELDS: Field[] = [
  { key: "first_name", label: "First name", synonyms: ["firstname", "first", "fname", "givenname"] },
  { key: "last_name", label: "Last name", synonyms: ["lastname", "last", "lname", "surname", "familyname"] },
  { key: "email", label: "Email", synonyms: ["email", "emailaddress", "e-mail", "mail"] },
  { key: "phone", label: "Phone", synonyms: ["phone", "phonenumber", "mobile", "cell", "tel", "telephone"] },
  { key: "address_line", label: "Address", synonyms: ["address", "addressline", "street", "address1", "addr"] },
  { key: "city", label: "City", synonyms: ["city", "town"] },
  { key: "state", label: "State", synonyms: ["state", "province", "region"] },
  { key: "postal_code", label: "Postal code", synonyms: ["postalcode", "zip", "zipcode", "postcode", "postal"] },
  { key: "tags", label: "Tags", synonyms: ["tags", "tag", "labels", "label"] },
  { key: "notes", label: "Notes", synonyms: ["notes", "note", "comments", "comment", "description"] },
];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function ImportPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({}); // field.key -> column index (-1 = skip)
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const [mode, setMode] = useState<"update" | "skip" | "create">("update");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(d?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);
  const canImport = role === "admin" || role === "staff";

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setResult(null);
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const matrix = parseCsv(String(reader.result || ""));
        if (matrix.length < 2) {
          setParseError("The file needs a header row and at least one data row.");
          setHeaders([]);
          setRows([]);
          return;
        }
        const [hdr, ...data] = matrix;
        setHeaders(hdr);
        setRows(data);
        // Auto-map by header name.
        const guess: Record<string, number> = {};
        FIELDS.forEach((f) => {
          const idx = hdr.findIndex((h) => {
            const n = norm(h);
            return n === norm(f.key) || f.synonyms.includes(n);
          });
          guess[f.key] = idx;
        });
        setMapping(guess);
      } catch {
        setParseError("Could not parse that file as CSV.");
      }
    };
    reader.readAsText(file);
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);
  const mappedCount = FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).length;

  async function runImport() {
    setError(null);
    setResult(null);
    const contacts = rows.map((r) => {
      const obj: Record<string, string> = {};
      for (const f of FIELDS) {
        const idx = mapping[f.key];
        if (idx != null && idx >= 0) obj[f.key] = r[idx] ?? "";
      }
      return obj;
    });
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, mode, embed: embeddingConfig(loadSettings()) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Import failed");
      setResult({ imported: body.imported ?? 0, updated: body.updated ?? 0, skipped: body.skipped ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/dashboard" style={styles.back}>
            ← Dashboard
          </Link>
          <h1 style={styles.title}>Import contacts</h1>
          <p style={styles.sub}>Upload a CSV, map its columns, and import. Matches the CSV export format.</p>
        </header>

        {!canImport && role !== null && (
          <div style={styles.banner}>Importing is limited to admins and staff.</div>
        )}

        <div style={styles.card}>
          <input type="file" accept=".csv,text/csv" onChange={onFile} disabled={!canImport} style={styles.file} />
          {fileName && <div style={styles.fileName}>{fileName} · {rows.length} rows</div>}
          {parseError && <div style={styles.error}>{parseError}</div>}
        </div>

        {headers.length > 0 && (
          <>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Map columns</div>
              <div style={styles.mapGrid}>
                {FIELDS.map((f) => (
                  <label key={f.key} style={styles.mapRow}>
                    <span style={styles.mapLabel}>{f.label}</span>
                    <select
                      value={mapping[f.key] ?? -1}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                      style={styles.select}
                    >
                      <option value={-1}>— skip —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Preview (first {preview.length})</div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => (
                        <th key={f.key} style={styles.th}>
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        {FIELDS.filter((f) => (mapping[f.key] ?? -1) >= 0).map((f) => (
                          <td key={f.key} style={styles.td}>
                            {r[mapping[f.key]] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Duplicates (matched by email)</div>
              <div style={styles.modes}>
                {[
                  { v: "update", label: "Update existing", hint: "Fill in blank fields & merge tags on matches" },
                  { v: "skip", label: "Skip existing", hint: "Only add contacts whose email is new" },
                  { v: "create", label: "Always create", hint: "Insert every row (may make duplicates)" },
                ].map((m) => (
                  <label key={m.v} style={styles.modeRow}>
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === m.v}
                      onChange={() => setMode(m.v as typeof mode)}
                    />
                    <span>
                      <span style={styles.modeLabel}>{m.label}</span>
                      <span style={styles.modeHint}>{m.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error && <div style={styles.error}>{error}</div>}
            {result && (
              <div style={styles.success}>
                ✓ {result.imported} added{result.updated > 0 && ` · ${result.updated} updated`}
                {result.skipped > 0 && ` · ${result.skipped} skipped`}.{" "}
                <Link href="/dashboard" style={styles.successLink}>
                  View dashboard
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={runImport}
              disabled={!canImport || importing || rows.length === 0 || mappedCount === 0}
              style={styles.button}
            >
              {importing ? "Importing…" : `Import ${rows.length} contacts`}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "6vh 20px 60px" },
  container: { width: "100%", maxWidth: 760 },
  header: { marginBottom: 18 },
  back: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 6px" },
  sub: { fontSize: 14, color: "var(--muted)", margin: 0 },
  banner: {
    marginBottom: 14,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card)",
    fontSize: 13.5,
    color: "var(--muted)",
  },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "var(--shadow)",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 12 },
  file: { fontSize: 14, color: "var(--fg)" },
  fileName: { fontSize: 13, color: "var(--muted)", marginTop: 10 },
  mapGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 },
  mapRow: { display: "flex", flexDirection: "column", gap: 4 },
  mapLabel: { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" },
  select: {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 9px",
    fontSize: 13.5,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
  },
  modes: { display: "flex", flexDirection: "column", gap: 10 },
  modeRow: { display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, cursor: "pointer" },
  modeLabel: { fontWeight: 600, display: "block" },
  modeHint: { fontSize: 12.5, color: "var(--muted)", display: "block", marginTop: 1 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    fontWeight: 600,
    color: "var(--muted)",
    fontSize: 11.5,
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  },
  td: { padding: "6px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" },
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
  error: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #d9534f",
    color: "#d9534f",
    background: "rgba(217,83,79,0.06)",
    fontSize: 14,
    marginBottom: 14,
  },
  success: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid var(--accent)",
    background: "var(--card)",
    fontSize: 14,
    marginBottom: 14,
  },
  successLink: { color: "var(--accent)", textDecoration: "none", fontWeight: 600 },
};
