import { getSql } from "@/lib/db";
import type { AgentTool } from "./types";

/**
 * The CRM toolbox the agent can use. Each tool is a thin, safe wrapper over a
 * parameterized SQL query. Adding a capability to the product = adding a tool
 * here; the UI and agent loop don't change.
 */

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

type ContactInput = {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  address_line?: unknown;
  city?: unknown;
  state?: unknown;
  postal_code?: unknown;
  tags?: unknown;
  source?: unknown;
  notes?: unknown;
};

function normalizeContact(c: ContactInput) {
  return {
    first_name: str(c.first_name),
    last_name: str(c.last_name),
    email: str(c.email),
    phone: str(c.phone),
    address_line: str(c.address_line),
    city: str(c.city),
    state: str(c.state),
    postal_code: str(c.postal_code),
    tags: Array.isArray(c.tags) ? c.tags.map((t) => String(t)) : [],
    source: str(c.source) ?? "agent",
    notes: str(c.notes),
  };
}

export const tools: AgentTool[] = [
  {
    name: "count_contacts",
    description:
      "Get a quick summary of the CRM: total number of contacts, and counts by tag. Use this to answer 'how many contacts / donors do we have'.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const sql = getSql();
      const [{ total }] = (await sql`SELECT count(*)::int AS total FROM contacts`) as {
        total: number;
      }[];
      const byTag = (await sql`
        SELECT tag, count(*)::int AS n
        FROM contacts, unnest(tags) AS tag
        GROUP BY tag ORDER BY n DESC
      `) as { tag: string; n: number }[];
      return { total_contacts: total, by_tag: byTag };
    },
  },

  {
    name: "list_contacts",
    description:
      "List contacts, optionally filtered by a search term (matches name or email) or a tag. Returns up to `limit` rows (default 25).",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Free-text match on name or email" },
        tag: { type: "string", description: "Only contacts carrying this tag" },
        limit: { type: "number", description: "Max rows (default 25, max 200)" },
      },
    },
    async execute(input) {
      const sql = getSql();
      const search = str(input.search);
      const tag = str(input.tag);
      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 200);
      const like = search ? `%${search.toLowerCase()}%` : null;
      const rows = await sql`
        SELECT id, first_name, last_name, email, phone, city, state, tags
        FROM contacts
        WHERE (${like}::text IS NULL
               OR lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) LIKE ${like}
               OR lower(coalesce(email,'')) LIKE ${like})
          AND (${tag}::text IS NULL OR ${tag} = ANY(tags))
        ORDER BY last_name NULLS LAST, first_name NULLS LAST
        LIMIT ${limit}
      `;
      return { count: rows.length, contacts: rows };
    },
  },

  {
    name: "add_contact",
    description: "Add a single new contact to the CRM.",
    inputSchema: {
      type: "object",
      properties: {
        first_name: { type: "string" },
        last_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address_line: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        postal_code: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
    },
    async execute(input) {
      const sql = getSql();
      const c = normalizeContact(input as ContactInput);
      const [row] = await sql`
        INSERT INTO contacts
          (first_name, last_name, email, phone, address_line, city, state, postal_code, tags, source, notes)
        VALUES
          (${c.first_name}, ${c.last_name}, ${c.email}, ${c.phone}, ${c.address_line},
           ${c.city}, ${c.state}, ${c.postal_code}, ${c.tags}, ${c.source}, ${c.notes})
        RETURNING id, first_name, last_name, email
      `;
      return { added: row };
    },
  },

  {
    name: "import_contacts",
    description:
      "Bulk-import many contacts at once (e.g. from a spreadsheet the user pasted or described). Pass an array of contact objects.",
    inputSchema: {
      type: "object",
      properties: {
        contacts: {
          type: "array",
          description: "Array of contact objects (first_name, last_name, email, etc.)",
          items: { type: "object", properties: {} },
        },
      },
      required: ["contacts"],
    },
    async execute(input) {
      const sql = getSql();
      const raw = Array.isArray(input.contacts) ? (input.contacts as ContactInput[]) : [];
      if (raw.length === 0) return { imported: 0 };
      const cs = raw.map(normalizeContact);
      // Single round-trip bulk insert via unnest of column arrays.
      const rows = await sql`
        INSERT INTO contacts
          (first_name, last_name, email, phone, address_line, city, state, postal_code, source, notes)
        SELECT * FROM unnest(
          ${cs.map((c) => c.first_name)}::text[],
          ${cs.map((c) => c.last_name)}::text[],
          ${cs.map((c) => c.email)}::text[],
          ${cs.map((c) => c.phone)}::text[],
          ${cs.map((c) => c.address_line)}::text[],
          ${cs.map((c) => c.city)}::text[],
          ${cs.map((c) => c.state)}::text[],
          ${cs.map((c) => c.postal_code)}::text[],
          ${cs.map((c) => c.source ?? "import")}::text[],
          ${cs.map((c) => c.notes)}::text[]
        )
        RETURNING id
      `;
      return { imported: rows.length };
    },
  },

  {
    name: "find_duplicate_contacts",
    description:
      "Find likely duplicate contacts — records sharing an email address, or the same first + last name. Returns clusters of ids so the user can review before merging.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const sql = getSql();
      const byEmail = await sql`
        SELECT lower(email) AS key, array_agg(id ORDER BY id) AS ids,
               array_agg(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) AS names
        FROM contacts
        WHERE email IS NOT NULL AND email <> ''
        GROUP BY lower(email) HAVING count(*) > 1
      `;
      const byName = await sql`
        SELECT lower(first_name) || '|' || lower(last_name) AS key,
               array_agg(id ORDER BY id) AS ids,
               array_agg(coalesce(email,'')) AS emails
        FROM contacts
        WHERE first_name IS NOT NULL AND last_name IS NOT NULL
        GROUP BY lower(first_name), lower(last_name) HAVING count(*) > 1
      `;
      return {
        duplicate_email_clusters: byEmail,
        duplicate_name_clusters: byName,
      };
    },
  },

  {
    name: "find_possible_relatives",
    description:
      "Find contacts who may be related / in the same household — people sharing a last name and a postal code (or city). Useful for building households and family giving.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const sql = getSql();
      const clusters = await sql`
        SELECT lower(last_name) AS last_name,
               coalesce(lower(postal_code), lower(city)) AS locality,
               count(*)::int AS n,
               array_agg(id ORDER BY id) AS ids,
               array_agg(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) AS names
        FROM contacts
        WHERE last_name IS NOT NULL AND last_name <> ''
          AND (postal_code IS NOT NULL OR city IS NOT NULL)
        GROUP BY lower(last_name), coalesce(lower(postal_code), lower(city))
        HAVING count(*) > 1
        ORDER BY n DESC
        LIMIT 50
      `;
      return { possible_household_clusters: clusters };
    },
  },

  {
    name: "create_goal",
    description:
      "Record a goal the user wants to accomplish (e.g. for this morning or afternoon).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        period: {
          type: "string",
          description: "One of: morning, afternoon, day",
        },
      },
      required: ["title"],
    },
    async execute(input) {
      const sql = getSql();
      const title = str(input.title);
      if (!title) return { error: "title is required" };
      const period = str(input.period) ?? "day";
      const [row] = await sql`
        INSERT INTO goals (title, period)
        VALUES (${title}, ${period})
        RETURNING id, title, period, status, goal_date
      `;
      return { created_goal: row };
    },
  },

  {
    name: "list_goals",
    description: "List today's goals and their status.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const sql = getSql();
      const rows = await sql`
        SELECT id, title, period, status, goal_date
        FROM goals
        WHERE goal_date = current_date
        ORDER BY id
      `;
      return { goals: rows };
    },
  },
];

export function getToolByName(name: string): AgentTool | undefined {
  return tools.find((t) => t.name === name);
}
