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

// --- duplicate merge helpers ---

type ContactRow = Record<string, unknown>;

function toIntArray(v: unknown): number[] {
  const arr = Array.isArray(v) ? v : [];
  return arr
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** First non-empty value among the arguments, else null. */
function coalesce(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v);
  }
  return null;
}

/** Combine a survivor row with loser rows into a single merged record. */
function mergeFields(survivor: ContactRow, losers: ContactRow[]) {
  const all = [survivor, ...losers];
  const pick = (k: string) => coalesce(survivor[k], ...losers.map((l) => l[k]));
  const tags = Array.from(
    new Set(
      all.flatMap((r) => (Array.isArray(r.tags) ? (r.tags as unknown[]) : [])).map(String)
    )
  );
  const notes =
    Array.from(
      new Set(all.map((r) => r.notes).filter((n) => n && String(n).trim()).map(String))
    ).join("\n") || null;
  return {
    first_name: pick("first_name"),
    last_name: pick("last_name"),
    email: pick("email"),
    phone: pick("phone"),
    address_line: pick("address_line"),
    city: pick("city"),
    state: pick("state"),
    postal_code: pick("postal_code"),
    household_id: coalesce(survivor.household_id, ...losers.map((l) => l.household_id)),
    source: pick("source"),
    tags,
    notes,
  };
}

/**
 * Merge a group of duplicate contacts into one survivor: consolidate their
 * fields, re-point donations to the survivor, and delete the losers. The three
 * writes run in a single transaction so the group can never end up half-merged.
 */
type MergeResult =
  | { error: string }
  | { merged_into: number; removed: number[]; survivor: Record<string, unknown> };

async function mergeContactGroup(ids: number[], keepId?: number): Promise<MergeResult> {
  const sql = getSql();
  const unique = Array.from(new Set(ids));
  if (unique.length < 2) {
    return { error: "Need at least two distinct contact ids to merge." };
  }
  const rows = (await sql`
    SELECT * FROM contacts WHERE id = ANY(${unique}::bigint[]) ORDER BY id
  `) as ContactRow[];
  if (rows.length < 2) {
    return { error: "Fewer than two matching contacts were found." };
  }

  // Survivor: the requested keep_id if it's in the group, else the lowest id.
  const keep =
    keepId && rows.some((r) => Number(r.id) === keepId) ? keepId : Number(rows[0].id);
  const survivor = rows.find((r) => Number(r.id) === keep) as ContactRow;
  const losers = rows.filter((r) => Number(r.id) !== keep);
  const loserIds = losers.map((r) => Number(r.id));
  const m = mergeFields(survivor, losers);

  await sql.transaction([
    sql`UPDATE donations SET contact_id = ${keep} WHERE contact_id = ANY(${loserIds}::bigint[])`,
    sql`UPDATE contacts SET
          first_name=${m.first_name}, last_name=${m.last_name}, email=${m.email},
          phone=${m.phone}, address_line=${m.address_line}, city=${m.city},
          state=${m.state}, postal_code=${m.postal_code}, household_id=${m.household_id},
          source=${m.source}, tags=${m.tags}, notes=${m.notes}, updated_at=now()
        WHERE id=${keep}`,
    sql`DELETE FROM contacts WHERE id = ANY(${loserIds}::bigint[])`,
  ]);

  return { merged_into: keep, removed: loserIds, survivor: { id: keep, ...m } };
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
    name: "merge_contacts",
    description:
      "Merge a specific set of duplicate contacts into one record. Consolidates their fields (keeps non-empty values, unions tags, joins notes), re-points their donations to the survivor, and deletes the rest. Use this after the user confirms which records are the same person — especially for name-only matches, which may be different people.",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          description: "The contact ids to merge together (at least two).",
          items: { type: "number" },
        },
        keep_id: {
          type: "number",
          description: "Which id to keep as the surviving record. Defaults to the lowest id.",
        },
      },
      required: ["ids"],
    },
    async execute(input) {
      const ids = toIntArray(input.ids);
      const keepId = Number(input.keep_id) || undefined;
      return mergeContactGroup(ids, keepId);
    },
  },

  {
    name: "auto_merge_duplicate_contacts",
    description:
      "Automatically merge all HIGH-CONFIDENCE duplicates — contacts sharing the same email address. Each email cluster is merged into its lowest id. Name-only matches are NOT auto-merged (they may be different people); use find_duplicate_contacts + merge_contacts for those after confirming with the user.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const sql = getSql();
      const clusters = (await sql`
        SELECT array_agg(id ORDER BY id) AS ids
        FROM contacts
        WHERE email IS NOT NULL AND email <> ''
        GROUP BY lower(email) HAVING count(*) > 1
      `) as { ids: unknown[] }[];

      const merges: { merged_into: number; removed: number[] }[] = [];
      let removedTotal = 0;
      for (const c of clusters) {
        const ids = toIntArray(c.ids);
        const res = await mergeContactGroup(ids);
        if ("merged_into" in res) {
          merges.push({ merged_into: res.merged_into, removed: res.removed });
          removedTotal += res.removed.length;
        }
      }
      return {
        clusters_merged: merges.length,
        contacts_removed: removedTotal,
        details: merges,
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

  {
    name: "list_recent_requests",
    description:
      "Recall the user's recent requests to this CRM — what they asked, which tools ran, and how they rated the result. Use this to answer 'what did I work on earlier' or to tailor your approach to how this user likes to work.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many recent requests (default 10, max 50)." },
      },
    },
    async execute(input) {
      const sql = getSql();
      const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 50);
      const rows = await sql`
        SELECT intent, model, tools_used, rating, created_at
        FROM request_history
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return { recent_requests: rows };
    },
  },
];

export function getToolByName(name: string): AgentTool | undefined {
  return tools.find((t) => t.name === name);
}
