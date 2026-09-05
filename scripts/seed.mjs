// Seeds sample non-profit CRM data so the demo has something to work with.
// Usage: node scripts/seed.mjs   (run after db:migrate)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scryptSync, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = scryptSync(pw, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const sql = neon(url);

// A small, deliberately messy sample: some shared surnames + addresses (for
// "possible relatives"), and a duplicate or two (for dedupe demos).
const contacts = [
  ["Maria", "Chang", "maria.chang@example.org", "94110", "San Francisco", ["donor"]],
  ["David", "Chang", "david.chang@example.org", "94110", "San Francisco", ["donor", "volunteer"]],
  ["Grace", "Chang", "grace.chang@example.org", "94110", "San Francisco", ["prospect"]],
  ["Maria", "Chang", "maria.chang@example.org", "94110", "San Francisco", ["donor"]], // dup email
  ["James", "Okafor", "james.okafor@example.org", "10025", "New York", ["donor"]],
  ["Amara", "Okafor", "amara.okafor@example.org", "10025", "New York", ["volunteer"]],
  ["Lena", "Novak", "lena.novak@example.org", "60614", "Chicago", ["board", "donor"]],
  ["Sofia", "Reyes", "sofia.reyes@example.org", "78701", "Austin", ["prospect"]],
];

// Resolve the default org so seeded rows are visible under RLS (the app scopes
// by org). Falls back to null if the orgs table isn't present yet.
let orgId = null;
try {
  const rows = await sql`SELECT min(id)::int AS id FROM orgs`;
  orgId = rows[0]?.id ?? null;
} catch {
  orgId = null;
}

console.log(`Seeding ${contacts.length} contacts…`);
for (const [first, last, email, zip, city, tags] of contacts) {
  // Board members are marked restricted to demo sensitivity-based RLS.
  const sensitivity = tags.includes("board") ? "restricted" : "normal";
  await sql`
    INSERT INTO contacts (first_name, last_name, email, postal_code, city, tags, source, org_id, sensitivity)
    VALUES (${first}, ${last}, ${email}, ${zip}, ${city}, ${tags}, 'seed', ${orgId}, ${sensitivity})
  `;
}

await sql`
  INSERT INTO campaigns (name, event_date, goal_amount, status, org_id)
  VALUES ('Spring Gala 2026', '2026-04-18', 50000, 'draft', ${orgId})
`;

// Demo users so the role-based RLS is testable by logging in. Password: demo1234
const demoUsers = [
  ["admin@demo.org", "admin"],
  ["staff@demo.org", "staff"],
  ["volunteer@demo.org", "volunteer"],
];
console.log("Seeding demo users (password: demo1234)…");
for (const [email, role] of demoUsers) {
  await sql`
    INSERT INTO users (org_id, email, password_hash, role)
    VALUES (${orgId}, ${email}, ${hashPassword("demo1234")}, ${role})
    ON CONFLICT (email) DO NOTHING
  `;
}

console.log("✓ Seed complete.");

function loadEnvLocal() {
  try {
    const content = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* rely on real env */
  }
}
