"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CustomFields } from "@/components/CustomFields";

type Campaign = {
  id: number;
  name: string;
  event_date: string | null;
  goal_amount: number | null;
  status: string;
  custom: Record<string, string>;
  created_at: string;
};
type Progress = { raised: number; gifts: number; donors: number; average: number; last_gift: string | null };
type TopDonor = { contact_id: number; name: string; total: number; gifts: number };
type Donation = { id: number; amount: number; donated_at: string; contact_id: number; donor: string };
type Payload = {
  campaign: Campaign;
  progress: Progress;
  topDonors: TopDonor[];
  donations: Donation[];
  role: string;
};

const STATUSES = ["draft", "active", "closed"];

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

export default function CampaignPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit modal state.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/campaigns/${params.id}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || "Failed to load");
        setData(body as Payload);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function openEdit() {
    if (!data) return;
    setName(data.campaign.name);
    setGoalInput(data.campaign.goal_amount != null ? String(data.campaign.goal_amount) : "");
    setEventDate(data.campaign.event_date ? data.campaign.event_date.slice(0, 10) : "");
    setStatus(data.campaign.status);
    setEditError(null);
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);
    if (!name.trim()) {
      setEditError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/campaigns/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          goal_amount: goalInput === "" ? null : Number(goalInput),
          event_date: eventDate || null,
          status,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || "Failed to save");
      setEditing(false);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const cp = data?.campaign;
  const canEdit = data?.role === "admin" || data?.role === "staff";

  async function saveCustom(custom: Record<string, string>) {
    const r = await fetch(`/api/campaigns/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body?.error || "Failed to save");
    await load();
  }
  const goal = cp?.goal_amount ?? 0;
  const raised = data?.progress.raised ?? 0;
  const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : null;
  const remaining = goal > 0 ? Math.max(0, goal - raised) : 0;

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/dashboard" style={styles.back}>
            ← Dashboard
          </Link>
          {cp && (
            <div style={styles.titleRow}>
              <h1 style={styles.title}>
                {cp.name} <span style={styles.status}>{cp.status}</span>
              </h1>
              {canEdit && (
                <button type="button" onClick={openEdit} style={styles.editBtn}>
                  Edit
                </button>
              )}
            </div>
          )}
          {cp?.event_date && <div style={styles.sub}>Event {fmtDate(cp.event_date)}</div>}
        </header>

        {editing && cp && (
          <div style={styles.overlay} onClick={() => !saving && setEditing(false)}>
            <form style={styles.modal} onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
              <div style={styles.modalTitle}>Edit campaign</div>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
              </label>
              <div style={styles.formRow}>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Goal amount</span>
                  <div style={styles.amountWrap}>
                    <span style={styles.dollar}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      placeholder="No goal"
                      style={{ ...styles.input, paddingLeft: 20 }}
                    />
                  </div>
                </label>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Event date</span>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    style={styles.input}
                  />
                </label>
              </div>
              <label style={styles.field}>
                <span style={styles.fieldLabel}>Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} style={styles.input}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              {editError && <div style={styles.formError}>{editError}</div>}
              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  style={styles.cancelBtn}
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={styles.saveBtn}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div style={styles.card}>Loading…</div>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : data && cp ? (
          <>
            <section style={{ ...styles.card, marginBottom: 14 }}>
              <div style={styles.cardTitle}>Goal progress</div>
              {goal > 0 ? (
                <>
                  <div style={styles.progressHead}>
                    <span style={styles.raised}>{usd(raised)}</span>
                    <span style={styles.goal}>of {usd(goal)}</span>
                    <span style={styles.pct}>{pct!.toFixed(0)}%</span>
                  </div>
                  <div style={styles.track}>
                    <div style={{ ...styles.fill, width: `${pct}%` }} />
                  </div>
                  <div style={styles.remain}>
                    {raised >= goal ? "🎉 Goal reached!" : `${usd(remaining)} to go`}
                  </div>
                </>
              ) : (
                <div style={styles.noGoal}>
                  <span style={styles.raised}>{usd(raised)}</span> raised · no goal set for this campaign.
                </div>
              )}
              <div style={styles.stats}>
                <Stat label="Gifts" value={data.progress.gifts.toLocaleString()} />
                <Stat label="Donors" value={data.progress.donors.toLocaleString()} />
                <Stat label="Average" value={usd(data.progress.average)} />
                <Stat label="Last gift" value={fmtDate(data.progress.last_gift)} />
              </div>
            </section>

            <section style={{ ...styles.card, marginBottom: 14 }}>
              <CustomFields fields={cp.custom || {}} canEdit={canEdit} onSave={saveCustom} />
            </section>

            <div style={styles.grid}>
              <section style={styles.card}>
                <div style={styles.cardTitle}>Top donors</div>
                {data.topDonors.length === 0 ? (
                  <div style={styles.empty}>No gifts to this campaign yet.</div>
                ) : (
                  <ul style={styles.list}>
                    {data.topDonors.map((t) => (
                      <li key={t.contact_id} style={styles.li}>
                        <Link href={`/contacts/${t.contact_id}`} style={styles.link}>
                          {t.name.trim() || "—"}
                        </Link>
                        <span style={styles.muted}>{usd(t.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardTitle}>Recent gifts</div>
                {data.donations.length === 0 ? (
                  <div style={styles.empty}>No gifts recorded yet.</div>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Donor</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.donations.map((d) => (
                        <tr key={d.id}>
                          <td style={styles.td}>{fmtDate(d.donated_at)}</td>
                          <td style={styles.td}>
                            <Link href={`/contacts/${d.contact_id}`} style={styles.link}>
                              {d.donor.trim() || "—"}
                            </Link>
                          </td>
                          <td style={{ ...styles.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {usd(d.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "6vh 20px 60px" },
  container: { width: "100%", maxWidth: 820 },
  header: { marginBottom: 18 },
  back: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  titleRow: { display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" },
  title: { fontSize: 26, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 10 },
  editBtn: {
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--fg)",
    cursor: "pointer",
  },
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
    maxWidth: 440,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "var(--shadow)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: 600 },
  formRow: { display: "flex", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 },
  fieldLabel: { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" },
  amountWrap: { position: "relative", display: "flex", alignItems: "center" },
  dollar: { position: "absolute", left: 9, color: "var(--muted)", fontSize: 13.5, pointerEvents: "none" },
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
  formError: { fontSize: 12.5, color: "#d9534f" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  cancelBtn: {
    padding: "8px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--fg)",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "8px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    cursor: "pointer",
  },
  status: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--muted)",
    border: "1px solid var(--border)",
    borderRadius: 999,
    padding: "2px 9px",
  },
  sub: { fontSize: 13, color: "var(--muted)", marginTop: 6 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "var(--shadow)",
  },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 14 },
  progressHead: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 },
  raised: { fontSize: 24, fontWeight: 700 },
  goal: { fontSize: 14, color: "var(--muted)" },
  pct: { marginLeft: "auto", fontSize: 15, fontWeight: 600, color: "var(--accent)" },
  track: { height: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width .3s ease" },
  remain: { fontSize: 13, color: "var(--muted)", marginTop: 8 },
  noGoal: { fontSize: 14, color: "var(--muted)", marginBottom: 4 },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
    gap: 10,
    marginTop: 16,
  },
  stat: { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" },
  statValue: { fontSize: 18, fontWeight: 700, lineHeight: 1.1 },
  statLabel: { fontSize: 11, color: "var(--muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.04em" },
  empty: { fontSize: 13, color: "var(--muted)" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  li: { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 },
  link: { color: "var(--accent)", textDecoration: "none", fontWeight: 500 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13.5 },
  th: {
    textAlign: "left",
    fontWeight: 600,
    color: "var(--muted)",
    fontSize: 12,
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
  },
  td: { padding: "8px", borderBottom: "1px solid var(--border)" },
  muted: { color: "var(--muted)", flexShrink: 0 },
  error: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #d9534f",
    color: "#d9534f",
    background: "rgba(217,83,79,0.06)",
    fontSize: 14,
  },
};
