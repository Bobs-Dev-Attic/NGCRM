"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Contact = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  tags: string[];
  source: string | null;
  notes: string | null;
  created_at: string;
  household_id: number | null;
  household: string | null;
};

type Giving = {
  total: number;
  gifts: number;
  largest: number;
  last_gift: string | null;
  first_gift: string | null;
};

type Donation = {
  id: number;
  amount: number;
  donated_at: string;
  campaign_id: number | null;
  campaign: string | null;
};

type Campaign = { id: number; name: string };
type Payload = {
  contact: Contact;
  giving: Giving;
  donations: Donation[];
  campaigns: Campaign[];
  role: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

export default function ContactPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Quick "record a gift" form state.
  const [amount, setAmount] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/contacts/${params.id}`)
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

  async function recordGift(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError("Enter a gift amount greater than 0.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/contacts/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          campaign_id: campaignId ? Number(campaignId) : null,
          donated_at: date || null,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || "Failed to record gift");
      setAmount("");
      setCampaignId("");
      setDate(today());
      await load(); // refresh totals + history
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to record gift");
    } finally {
      setSaving(false);
    }
  }

  const c = data?.contact;
  const name = c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "Contact" : "";
  const canRecord = data?.role === "admin" || data?.role === "staff";

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/dashboard" style={styles.back}>
            ← Dashboard
          </Link>
          {c && <h1 style={styles.title}>{name}</h1>}
        </header>

        {loading ? (
          <div style={styles.card}>Loading…</div>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : data && c ? (
          <div style={styles.grid}>
            <section style={styles.card}>
              <div style={styles.cardTitle}>Details</div>
              <dl style={styles.dl}>
                <Row label="Email" value={c.email} />
                <Row label="Phone" value={c.phone} />
                <Row
                  label="Address"
                  value={[c.address_line, [c.city, c.state].filter(Boolean).join(", "), c.postal_code]
                    .filter(Boolean)
                    .join(" · ") || null}
                />
                <div style={styles.row}>
                  <dt style={styles.dt}>Household</dt>
                  <dd style={styles.dd}>
                    {c.household_id ? (
                      <Link href={`/households/${c.household_id}`} style={styles.link}>
                        {c.household || "Household"}
                      </Link>
                    ) : (
                      <span style={styles.muted}>—</span>
                    )}
                  </dd>
                </div>
                <Row label="Source" value={c.source} />
                <Row label="Added" value={new Date(c.created_at).toLocaleDateString()} />
              </dl>
              {c.tags?.length > 0 && (
                <div style={styles.tags}>
                  {c.tags.map((t) => (
                    <span key={t} style={styles.tag}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {c.notes && <p style={styles.notes}>{c.notes}</p>}
            </section>

            <section style={styles.card}>
              <div style={styles.cardTitle}>Giving history</div>
              <div style={styles.stats}>
                <Stat label="Total given" value={usd(data.giving.total)} />
                <Stat label="Gifts" value={data.giving.gifts.toLocaleString()} />
                <Stat label="Largest" value={usd(data.giving.largest)} />
                <Stat label="Last gift" value={fmtDate(data.giving.last_gift)} />
              </div>

              {canRecord && (
              <form onSubmit={recordGift} style={styles.form}>
                <div style={styles.formRow}>
                  <label style={styles.field}>
                    <span style={styles.fieldLabel}>Amount</span>
                    <div style={styles.amountWrap}>
                      <span style={styles.dollar}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="100"
                        style={{ ...styles.input, paddingLeft: 20 }}
                      />
                    </div>
                  </label>
                  <label style={styles.field}>
                    <span style={styles.fieldLabel}>Date</span>
                    <input
                      type="date"
                      value={date}
                      max={today()}
                      onChange={(e) => setDate(e.target.value)}
                      style={styles.input}
                    />
                  </label>
                </div>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Campaign (optional)</span>
                  <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={styles.input}>
                    <option value="">— None —</option>
                    {data.campaigns.map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.name}
                      </option>
                    ))}
                  </select>
                </label>
                {formError && <div style={styles.formError}>{formError}</div>}
                <button type="submit" disabled={saving} style={styles.button}>
                  {saving ? "Recording…" : "Record gift"}
                </button>
              </form>
              )}

              {data.donations.length === 0 ? (
                <div style={styles.empty}>
                  No gifts recorded yet. Ask the assistant to “record a $100 gift from {name}”.
                </div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Campaign</th>
                      <th style={{ ...styles.th, textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.donations.map((d) => (
                      <tr key={d.id}>
                        <td style={styles.td}>{fmtDate(d.donated_at)}</td>
                        <td style={styles.td}>
                          {d.campaign_id ? (
                            <Link href={`/campaigns/${d.campaign_id}`} style={styles.link}>
                              {d.campaign || "Campaign"}
                            </Link>
                          ) : (
                            <span style={styles.muted}>—</span>
                          )}
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
        ) : null}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={styles.row}>
      <dt style={styles.dt}>{label}</dt>
      <dd style={styles.dd}>{value || <span style={styles.muted}>—</span>}</dd>
    </div>
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
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 0" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "var(--shadow)",
  },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 14 },
  dl: { margin: 0, display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", gap: 12, fontSize: 13.5 },
  dt: { width: 92, flexShrink: 0, color: "var(--muted)", margin: 0 },
  dd: { margin: 0 },
  link: { color: "var(--accent)", textDecoration: "none", fontWeight: 500 },
  tags: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 },
  tag: {
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 999,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    color: "var(--muted)",
  },
  notes: { fontSize: 13, color: "var(--fg)", marginTop: 14, marginBottom: 0, lineHeight: 1.5 },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
    gap: 10,
    marginBottom: 16,
  },
  stat: { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" },
  statValue: { fontSize: 18, fontWeight: 700, lineHeight: 1.1 },
  statLabel: { fontSize: 11, color: "var(--muted)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.04em" },
  empty: { fontSize: 13, color: "var(--muted)" },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--bg)",
  },
  formRow: { display: "flex", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
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
    background: "var(--card)",
    color: "var(--fg)",
  },
  button: {
    alignSelf: "flex-start",
    padding: "8px 16px",
    fontSize: 13.5,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    cursor: "pointer",
  },
  formError: { fontSize: 12.5, color: "#d9534f" },
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
  muted: { color: "var(--muted)" },
  error: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #d9534f",
    color: "#d9534f",
    background: "rgba(217,83,79,0.06)",
    fontSize: 14,
  },
};
