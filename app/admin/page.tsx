"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type User = { id: number; email: string; role: string; created_at: string };
const ROLES = ["admin", "staff", "volunteer"];

export default function AdminPage() {
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  // new-user form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [creating, setCreating] = useState(false);

  async function loadUsers() {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
      else setError(data?.error || "Failed to load users");
    } catch {
      setError("Failed to load users");
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = res.ok ? await res.json() : null;
        setMe(data?.user ?? null);
        if (data?.user?.role === "admin") await loadUsers();
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to create user");
      setEmail("");
      setPassword("");
      setRole("staff");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function changeRole(id: number, newRole: string) {
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to update role");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function removeUser(id: number, userEmail: string) {
    if (!confirm(`Remove ${userEmail}? This can't be undone.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to remove user");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove user");
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link href="/" style={styles.back}>
            ← Back
          </Link>
          <h1 style={styles.title}>User management</h1>
        </header>

        {!loaded ? (
          <div style={styles.card}>
            <div style={styles.empty}>Loading…</div>
          </div>
        ) : me?.role !== "admin" ? (
          <div style={styles.card}>
            <div style={styles.empty}>
              This page is for admins only.{" "}
              {me ? `You are signed in as ${me.role}.` : "Please sign in."}
            </div>
          </div>
        ) : (
          <>
            <div style={styles.card}>
              <div style={styles.fieldLabel}>Add a user</div>
              <form onSubmit={createUser} style={styles.form}>
                <input
                  type="email"
                  placeholder="email@org.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  required
                />
                <input
                  type="password"
                  placeholder="temporary password (8+ chars)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  minLength={8}
                  required
                />
                <select value={role} onChange={(e) => setRole(e.target.value)} style={styles.select}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button type="submit" style={styles.button} disabled={creating}>
                  {creating ? "Adding…" : "Add"}
                </button>
              </form>
              {error && <div style={styles.error}>{error}</div>}
            </div>

            <div style={styles.card}>
              <div style={styles.fieldLabel}>Users ({users.length})</div>
              <div style={styles.list}>
                {users.map((u) => (
                  <div key={u.id} style={styles.row}>
                    <span style={styles.rowEmail}>{u.email}</span>
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      style={styles.rowSelect}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeUser(u.id, u.email)}
                      style={styles.remove}
                      aria-label={`Remove ${u.email}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <p style={styles.note}>
              Roles are enforced by database row-level security: <strong>volunteer</strong> accounts
              can&apos;t see records marked restricted. The last admin can&apos;t be demoted or removed.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", justifyContent: "center", padding: "6vh 20px 60px" },
  container: { width: "100%", maxWidth: 620 },
  header: { marginBottom: 16 },
  back: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  title: { fontSize: 26, fontWeight: 600, margin: "12px 0 0" },
  card: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "var(--shadow)",
    marginBottom: 16,
  },
  fieldLabel: { fontSize: 13, fontWeight: 600, marginBottom: 12 },
  form: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  input: {
    flex: "1 1 160px",
    padding: "9px 12px",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    outline: "none",
  },
  select: {
    padding: "9px 10px",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
  },
  button: {
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: 10,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 4px",
    borderBottom: "1px solid var(--border)",
  },
  rowEmail: { flex: 1, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowSelect: {
    padding: "6px 8px",
    fontSize: 13,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
  },
  remove: {
    background: "transparent",
    color: "#d9534f",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 13,
    cursor: "pointer",
  },
  empty: { fontSize: 14, color: "var(--muted)", lineHeight: 1.6 },
  error: {
    marginTop: 12,
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid #d9534f",
    color: "#d9534f",
    fontSize: 13,
  },
  note: { fontSize: 13, color: "var(--muted)", lineHeight: 1.6 },
};
