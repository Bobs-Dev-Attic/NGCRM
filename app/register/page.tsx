"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Registration failed");
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <form style={styles.card} onSubmit={submit}>
        <div style={styles.logo}>Next-Gen CRM</div>
        <h1 style={styles.title}>Create account</h1>
        <label style={styles.label}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            autoFocus
            required
          />
        </label>
        <label style={styles.label}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            minLength={8}
            required
          />
        </label>
        <div style={styles.hint}>At least 8 characters. New accounts get the “staff” role.</div>
        {error && <div style={styles.error}>{error}</div>}
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? "Creating…" : "Create account"}
        </button>
        <div style={styles.alt}>
          Already have an account? <Link href="/login" style={styles.link}>Sign in</Link>
        </div>
      </form>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    width: "100%",
    maxWidth: 380,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 24,
    boxShadow: "var(--shadow)",
  },
  logo: {
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--muted)",
    textAlign: "center",
  },
  title: { fontSize: 24, fontWeight: 600, margin: "10px 0 20px", textAlign: "center" },
  label: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 14 },
  input: {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: "10px 12px",
    fontSize: 14,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--fg)",
    outline: "none",
  },
  hint: { fontSize: 12, color: "var(--muted)", marginBottom: 14 },
  button: {
    width: "100%",
    background: "var(--accent)",
    color: "var(--accent-fg)",
    border: "none",
    borderRadius: 10,
    padding: "11px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    marginBottom: 12,
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid #d9534f",
    color: "#d9534f",
    fontSize: 13,
  },
  alt: { marginTop: 16, fontSize: 13, color: "var(--muted)", textAlign: "center" },
  link: { color: "var(--accent)", textDecoration: "none", fontWeight: 600 },
};
