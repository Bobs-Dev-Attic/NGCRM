"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Household = { id: number; name: string | null; created_at: string };
type Member = { id: number; name: string; email: string | null; tags: string[]; given: number; gifts: number };
type Giving = { total: number; gifts: number; donors: number; largest: number; last_gift: string | null };
type Donation = {
  id: number;
  amount: number;
  donated_at: string;
  contact_id: number;
  donor: string;
  campaign_id: number | null;
  campaign: string | null;
};
type Campaign = { id: number; name: string };
type Payload = {
  household: Household;
  members: Member[];
  giving: Giving;
  donations: Donation[];
  campaigns: Campaign[];
};

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

const today = () => new Date().toISOString().slice(0, 10);

export default function HouseholdPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Quick "record a gift" form state.
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = () =>
    fetch(`/api/households/${params.id}`)
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
    if (!memberId) {
      setFormError("Choose which member the gift is from.");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError("Enter a gift amount greater than 0.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/households/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: Number(memberId),
          amount: amt,
          campaign_id: campaignId ? Number(campaignId) : null,
          donated_at: date || null,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || "Failed to record gift");
      setMemberId("");
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

  const h = data?.household;
  const name = h ? h.name || "Household" : "";

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/dashboard" style={styles.back}>
            ← Dashboard
          </Link>
          {h && (
            <h1 style={styles.title}>
              {name}{" "}
              {data && <span style={styles.count}>· {data.members.length} members</span>}
            </h1>
          )}
        </header>

        {loading ? (
          <div style={styles.card}>Loading…</div>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : data && h ? (
          <>
            <section style={{ ...styles.card, marginBottom: 14 }}>
              <div style={styles.cardTitle}>Combined giving</div>
              <div style={styles.stats}>
                <Stat label="Total given" value={usd(data.giving.total)} />
                <Stat label="Gifts" value={data.giving.gifts.toLocaleString()} />
                <Stat label="Donors" value={data.giving.donors.toLocaleString()} />
                <Stat label="Largest" value={usd(data.giving.largest)} />
                <Stat label="Last gift" value={fmtDate(data.giving.last_gift)} />
              </div>

              {data.members.length > 0 && (
                <form onSubmit={recordGift} style={styles.form}>
                  <div style={styles.formRow}>
                    <label style={{ ...styles.field, flex: 2 }}>
                      <span style={styles.fieldLabel}>From</span>
                      <select value={memberId} onChange={(e) => setMemberId(e.target.value)} style={styles.input}>
                        <option value="">— Select member —</option>
                        {data.members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name.trim() || m.email || `Contact ${m.id}`}
                          </option>
                        ))}
                      </select>
                    </label>
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
                  </div>
                  <div style={styles.formRow}>
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
                    <label style={{ ...styles.field, flex: 2 }}>
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
                  </div>
                  {formError && <div style={styles.formError}>{formError}</div>}
                  <button type="submit" disabled={saving} style={styles.button}>
                    {saving ? "Recording…" : "Record gift"}
                  </button>
                </form>
              )}
            </section>

            <div style={styles.grid}>
              <section style={styles.card}>
                <div style={styles.cardTitle}>Members</div>
                {data.members.length === 0 ? (
                  <div style={styles.empty}>No members.</div>
                ) : (
                  <ul style={styles.list}>
                    {data.members.map((m) => (
                      <li key={m.id} style={styles.li}>
                        <Link href={`/contacts/${m.id}`} style={styles.link}>
                          {m.name.trim() || m.email || "—"}
                        </Link>
                        <span style={styles.muted}>
                          {m.gifts > 0 ? usd(m.given) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardTitle}>Giving history</div>
                {data.donations.length === 0 ? (
                  <div style={styles.empty}>
                    No gifts recorded yet across this household.
                  </div>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Donor</th>
                        <th style={styles.th}>Campaign</th>
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
                          <td style={styles.td}>{d.campaign || <span style={styles.muted}>—</span>}</td>
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
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 0" },
  count: { fontSize: 15, fontWeight: 400, color: "var(--muted)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, alignItems: "start" },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "var(--shadow)",
  },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 14 },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
    gap: 10,
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
    marginTop: 16,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--bg)",
  },
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
