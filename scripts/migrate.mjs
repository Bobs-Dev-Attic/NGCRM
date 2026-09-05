// Applies db/schema.sql to the Neon database in DATABASE_URL.
// Usage: node scripts/migrate.mjs   (reads .env.local if present)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";

loadEnvLocal();

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const schema = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
const statements = splitSql(schema);
const sql = neon(url);

console.log(`Applying ${statements.length} statements to Neon…`);
for (const stmt of statements) {
  await sql.query(stmt);
}
console.log("✓ Schema applied.");

// --- helpers ---

function splitSql(text) {
  // Strip line comments, then split on semicolons. Schema uses no functions
  // or dollar-quoting, so naive splitting is safe here.
  return text
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadEnvLocal() {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // no .env.local — rely on real env
  }
}
