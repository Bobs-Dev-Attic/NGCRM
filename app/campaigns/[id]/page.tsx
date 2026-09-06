"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Campaign = {
  id: number;
  name: string;
  event_date: string | null;
  goal_amount: number | null;
  status: string;
  created_at: string;
};
type Progress = { raised: number; gifts: number; donors: number; average: number; last_gift: string | null };
type TopDonor = { contact_id: number; name: string; total: number; gifts: number };
type Donation = { id: number; amount: number; donated_at: string; contact_id: number; donor: string };
type Payload = { campaign: Campaign; progress: Progress; topDonors: TopDonor[]; donations: Donation[] };

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

export default function CampaignPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/campaigns/${params.id}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || "Failed to load");
        setData(body as Payload);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [params.id]);

  const cp = data?.campaign;
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
            <h1 style={styles.title}>
              {cp.name} <span style={styles.status}>{cp.status}</span>
            </h1>
          )}
          {cp?.event_date && <div style={styles.sub}>Event {fmtDate(cp.event_date)}</div>}
        </header>

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
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 0", display: "flex", alignItems: "center", gap: 10 },
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
