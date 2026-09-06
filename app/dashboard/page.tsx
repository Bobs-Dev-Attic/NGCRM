"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Dashboard = {
  contacts: number;
  byTag: { tag: string; n: number }[];
  households: number;
  topHouseholds: { id: number; name: string | null; members: number }[];
  donations: { total: number; gifts: number; donors: number };
  topDonors: { name: string; total: number }[];
  campaigns: { status: string; n: number }[];
  campaignList: { id: number; name: string; status: string; goal: number | null; raised: number }[];
  givingByMonth: { month: string; total: number; gifts: number }[];
  drafts: number;
  recentContacts: { id: number; name: string; email: string | null; tags: string[]; created_at: string }[];
};

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Failed to load");
        setD(data as Dashboard);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const campaignTotal = d?.campaigns.reduce((a, c) => a + c.n, 0) ?? 0;
  const maxTag = d ? Math.max(1, ...d.byTag.map((t) => t.n)) : 1;

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/" style={styles.back}>
            ← Back
          </Link>
          <h1 style={styles.title}>Dashboard</h1>
        </header>

        {loading ? (
          <div style={styles.card}>Loading…</div>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : d ? (
          <>
            <div style={styles.tiles}>
              <Tile label="Contacts" value={d.contacts.toLocaleString()} />
              <Tile label="Households" value={d.households.toLocaleString()} />
              <Tile label="Donors" value={d.donations.donors.toLocaleString()} />
              <Tile label="Total raised" value={usd(d.donations.total)} sub={`${d.donations.gifts} gifts`} />
              <Tile label="Campaigns" value={campaignTotal.toLocaleString()} sub={`${d.drafts} drafts`} />
            </div>

            <GivingChart data={d.givingByMonth} />

            <div style={styles.grid}>
              <section style={styles.card}>
                <div style={styles.cardTitle}>Contacts by tag</div>
                {d.byTag.length === 0 ? (
                  <div style={styles.empty}>No tags yet.</div>
                ) : (
                  <div style={styles.bars}>
                    {d.byTag.map((t) => (
                      <div key={t.tag} style={styles.barRow}>
                        <span style={styles.barLabel}>{t.tag}</span>
                        <span style={styles.barTrack}>
                          <span style={{ ...styles.barFill, width: `${(t.n / maxTag) * 100}%` }} />
                        </span>
                        <span style={styles.barVal}>{t.n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardTitle}>Top households</div>
                {d.topHouseholds.length === 0 ? (
                  <div style={styles.empty}>No households yet. Try “build households”.</div>
                ) : (
                  <ul style={styles.list}>
                    {d.topHouseholds.map((h) => (
                      <li key={h.id} style={styles.li}>
                        <Link href={`/households/${h.id}`} style={styles.contactLink}>
                          {h.name || "Household"}
                        </Link>
                        <span style={styles.muted}>{h.members} members</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardTitle}>Top donors</div>
                {d.topDonors.length === 0 ? (
                  <div style={styles.empty}>No donations recorded yet.</div>
                ) : (
                  <ul style={styles.list}>
                    {d.topDonors.map((t, i) => (
                      <li key={i} style={styles.li}>
                        <span>{t.name.trim() || "—"}</span>
                        <span style={styles.muted}>{usd(t.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardTitle}>Campaigns</div>
                {d.campaignList.length === 0 ? (
                  <div style={styles.empty}>No campaigns yet.</div>
                ) : (
                  <ul style={styles.list}>
                    {d.campaignList.map((c) => {
                      const pct = c.goal && c.goal > 0 ? Math.min(100, (c.raised / c.goal) * 100) : null;
                      return (
                        <li key={c.id} style={styles.campaignItem}>
                          <div style={styles.li}>
                            <Link href={`/campaigns/${c.id}`} style={styles.contactLink}>
                              {c.name}
                            </Link>
                            <span style={styles.muted}>
                              {c.goal && c.goal > 0 ? `${usd(c.raised)} / ${usd(c.goal)}` : usd(c.raised)}
                            </span>
                          </div>
                          {pct !== null && (
                            <span style={styles.campaignTrack}>
                              <span style={{ ...styles.barFill, width: `${pct}%` }} />
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardTitle}>Recent contacts</div>
                {d.recentContacts.length === 0 ? (
                  <div style={styles.empty}>No contacts yet.</div>
                ) : (
                  <ul style={styles.list}>
                    {d.recentContacts.map((c) => (
                      <li key={c.id} style={styles.li}>
                        <Link href={`/contacts/${c.id}`} style={styles.contactLink}>
                          {c.name.trim() || c.email || "—"}
                        </Link>
                        <span style={styles.muted}>
                          {(c.tags || []).slice(0, 2).join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section style={styles.card}>
                <div style={styles.cardTitle}>Export</div>
                <div style={styles.exportGroup}>
                  <span style={styles.exportLabel}>Contacts</span>
                  <div style={styles.exportBtns}>
                    <a href="/api/export?type=contacts&format=csv" style={styles.exportBtn}>
                      CSV
                    </a>
                    <a href="/api/export?type=contacts&format=xlsx" style={styles.exportBtn}>
                      Excel
                    </a>
                  </div>
                </div>
                <div style={styles.exportGroup}>
                  <span style={styles.exportLabel}>Donations</span>
                  <div style={styles.exportBtns}>
                    <a href="/api/export?type=donations&format=csv" style={styles.exportBtn}>
                      CSV
                    </a>
                    <a href="/api/export?type=donations&format=xlsx" style={styles.exportBtn}>
                      Excel
                    </a>
                  </div>
                </div>
                <div style={styles.exportNote}>Exports respect your access — only records you can see.</div>
                <Link href="/import" style={styles.importLink}>
                  Import contacts from CSV →
                </Link>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const usdFull = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/** Giving over the last 12 months as a column chart (empty months filled in). */
function GivingChart({ data }: { data: { month: string; total: number; gifts: number }[] }) {
  const byMonth = new Map(data.map((d) => [d.month, d]));
  const now = new Date();
  const months: { key: string; label: string; year: number; total: number; gifts: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const hit = byMonth.get(key);
    months.push({
      key,
      label: MONTH_LABELS[dt.getMonth()],
      year: dt.getFullYear(),
      total: hit?.total ?? 0,
      gifts: hit?.gifts ?? 0,
    });
  }
  const max = Math.max(1, ...months.map((m) => m.total));
  const windowTotal = months.reduce((a, m) => a + m.total, 0);
  const hasAny = windowTotal > 0;

  return (
    <section style={{ ...styles.card, marginBottom: 16 }}>
      <div style={styles.chartHead}>
        <div style={styles.cardTitle}>Giving over time</div>
        <div style={styles.chartMeta}>Last 12 months · {usd(windowTotal)}</div>
      </div>
      {!hasAny ? (
        <div style={styles.empty}>No gifts recorded in the last 12 months.</div>
      ) : (
        <div style={styles.chart} role="img" aria-label={`Monthly giving, last 12 months, total ${usdFull(windowTotal)}`}>
          {months.map((m) => (
            <div key={m.key} style={styles.col} title={`${m.label} ${m.year}: ${usdFull(m.total)} (${m.gifts} gift${m.gifts === 1 ? "" : "s"})`}>
              <div style={styles.colBarWrap}>
                <div
                  style={{
                    ...styles.colBar,
                    height: `${(m.total / max) * 100}%`,
                    opacity: m.total > 0 ? 1 : 0,
                  }}
                />
              </div>
              <div style={styles.colLabel}>{m.label}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={styles.tile}>
      <div style={styles.tileValue}>{value}</div>
      <div style={styles.tileLabel}>{label}</div>
      {sub && <div style={styles.tileSub}>{sub}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "6vh 20px 60px" },
  container: { width: "100%", maxWidth: 860 },
  header: { marginBottom: 18 },
  back: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 0" },
  tiles: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  tile: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: "16px 18px",
    boxShadow: "var(--shadow)",
  },
  tileValue: { fontSize: 26, fontWeight: 700, lineHeight: 1.1 },
  tileLabel: { fontSize: 12.5, color: "var(--muted)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.05em" },
  tileSub: { fontSize: 12, color: "var(--muted)", marginTop: 4 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "var(--shadow)",
  },
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 12 },
  chartHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  chartMeta: { fontSize: 12.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" },
  chart: { display: "flex", alignItems: "flex-end", gap: 6, height: 140, marginTop: 6 },
  col: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" },
  colBarWrap: { flex: 1, width: "100%", display: "flex", alignItems: "flex-end", minHeight: 0 },
  colBar: { width: "100%", background: "var(--accent)", borderRadius: "4px 4px 0 0", minHeight: 2 },
  colLabel: { fontSize: 10.5, color: "var(--muted)" },
  empty: { fontSize: 13, color: "var(--muted)" },
  bars: { display: "flex", flexDirection: "column", gap: 8 },
  barRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 },
  barLabel: { width: 84, flexShrink: 0, color: "var(--fg)" },
  barTrack: { flex: 1, height: 8, background: "var(--bg)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)" },
  barFill: { display: "block", height: "100%", background: "var(--accent)" },
  barVal: { width: 28, textAlign: "right", color: "var(--muted)", fontVariantNumeric: "tabular-nums" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 },
  li: { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 },
  muted: { color: "var(--muted)", flexShrink: 0 },
  contactLink: { color: "var(--accent)", textDecoration: "none", fontWeight: 500 },
  exportGroup: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  exportLabel: { fontSize: 13.5 },
  exportBtns: { display: "flex", gap: 8 },
  exportBtn: {
    padding: "5px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    textDecoration: "none",
  },
  exportNote: { fontSize: 12, color: "var(--muted)", marginTop: 4 },
  importLink: { display: "inline-block", marginTop: 12, fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 600 },
  campaignItem: { display: "flex", flexDirection: "column", gap: 6 },
  campaignTrack: {
    display: "block",
    width: "100%",
    height: 6,
    background: "var(--bg)",
    borderRadius: 999,
    overflow: "hidden",
    border: "1px solid var(--border)",
  },
  error: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #d9534f",
    color: "#d9534f",
    background: "rgba(217,83,79,0.06)",
    fontSize: 14,
  },
};
