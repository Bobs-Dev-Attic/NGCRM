import { getSql } from "@/lib/db";
import { resendConfigured, sendEmail } from "@/lib/email";
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

// --- campaign builder helpers ---

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type AudienceFilter = {
  tag?: string | null;
  city?: string | null;
  state?: string | null;
  donor_only?: boolean;
};

function normalizeAudience(input: Record<string, unknown> | undefined): AudienceFilter {
  const f = input ?? {};
  return {
    tag: str(f.tag),
    city: str(f.city),
    state: str(f.state),
    donor_only: f.donor_only === true,
  };
}

/** Count and sample the contacts that match an audience filter. */
async function queryAudience(f: AudienceFilter) {
  const sql = getSql();
  const donorOnly = f.donor_only === true ? true : null;
  const where = sql`
    (${f.tag}::text IS NULL OR ${f.tag} = ANY(c.tags))
    AND (${f.city}::text IS NULL OR lower(c.city) = lower(${f.city}))
    AND (${f.state}::text IS NULL OR lower(c.state) = lower(${f.state}))
    AND (${donorOnly}::bool IS NOT TRUE
         OR EXISTS (SELECT 1 FROM donations d WHERE d.contact_id = c.id))
  `;
  const [{ n }] = (await sql`SELECT count(*)::int AS n FROM contacts c WHERE ${where}`) as {
    n: number;
  }[];
  const sample = await sql`
    SELECT id, first_name, last_name, email
    FROM contacts c WHERE ${where}
    ORDER BY last_name NULLS LAST LIMIT 10
  `;
  return { count: n, sample };
}

/** The contacts (with emails) that match an audience filter, capped. */
async function audienceEmails(f: AudienceFilter, cap = 1000) {
  const sql = getSql();
  const donorOnly = f.donor_only === true ? true : null;
  const rows = (await sql`
    SELECT first_name, email FROM contacts c
    WHERE email IS NOT NULL AND email <> ''
      AND (${f.tag}::text IS NULL OR ${f.tag} = ANY(c.tags))
      AND (${f.city}::text IS NULL OR lower(c.city) = lower(${f.city}))
      AND (${f.state}::text IS NULL OR lower(c.state) = lower(${f.state}))
      AND (${donorOnly}::bool IS NOT TRUE
           OR EXISTS (SELECT 1 FROM donations d WHERE d.contact_id = c.id))
    LIMIT ${cap}
  `) as { first_name: string | null; email: string }[];
  return rows;
}

/** Resolve a campaign by id, or by name (creating it if missing). */
async function resolveCampaign(
  campaignId: unknown,
  campaignName: unknown
): Promise<{ id: number; name: string } | null> {
  const sql = getSql();
  const id = toInt(campaignId);
  if (id) {
    const [row] = (await sql`SELECT id, name FROM campaigns WHERE id = ${id}`) as {
      id: number;
      name: string;
    }[];
    return row ? { id: Number(row.id), name: row.name } : null;
  }
  const name = str(campaignName);
  if (!name) return null;
  const [existing] = (await sql`
    SELECT id, name FROM campaigns WHERE lower(name) = lower(${name}) LIMIT 1
  `) as { id: number; name: string }[];
  if (existing) return { id: Number(existing.id), name: existing.name };
  const [created] = (await sql`
    INSERT INTO campaigns (name, status) VALUES (${name}, 'draft') RETURNING id, name
  `) as { id: number; name: string }[];
  return { id: Number(created.id), name: created.name };
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
    name: "auto_build_households",
    description:
      "Automatically group contacts into households: for each cluster sharing a last name and a postal code (or city), create a household ('The <Last> Household') and assign the members. Contacts already in a household keep it; a cluster with an existing household absorbs its unassigned members. Idempotent — re-running won't create duplicates. Preview first with find_possible_relatives if the user wants to review.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const sql = getSql();
      const clusters = (await sql`
        SELECT max(last_name) AS display_last,
               array_agg(id ORDER BY id) AS ids,
               array_agg(household_id) AS hids
        FROM contacts
        WHERE last_name IS NOT NULL AND last_name <> ''
          AND (postal_code IS NOT NULL OR city IS NOT NULL)
        GROUP BY lower(last_name), coalesce(lower(postal_code), lower(city))
        HAVING count(*) > 1
      `) as { display_last: string; ids: unknown[]; hids: unknown[] }[];

      let created = 0;
      let assigned = 0;
      const details: { household_id: number; name: string; assigned: number }[] = [];

      for (const c of clusters) {
        const ids = toIntArray(c.ids);
        // Reuse an existing household in the cluster if any; else create one.
        let target: number | null = null;
        for (const h of c.hids) {
          if (h != null) {
            target = Number(h);
            break;
          }
        }
        const name = `The ${c.display_last} Household`;
        if (target == null) {
          const [row] = (await sql`
            INSERT INTO households (name) VALUES (${name}) RETURNING id
          `) as { id: number }[];
          target = Number(row.id);
          created++;
        }
        const updated = await sql`
          UPDATE contacts SET household_id = ${target}, updated_at = now()
          WHERE id = ANY(${ids}::bigint[]) AND household_id IS DISTINCT FROM ${target}
          RETURNING id
        `;
        assigned += updated.length;
        details.push({ household_id: target, name, assigned: updated.length });
      }

      return { clusters: clusters.length, households_created: created, contacts_assigned: assigned, details };
    },
  },

  {
    name: "list_households",
    description: "List households and their members.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const sql = getSql();
      const rows = await sql`
        SELECT h.id, h.name,
               count(c.id)::int AS members,
               array_agg(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))
                 FILTER (WHERE c.id IS NOT NULL) AS member_names
        FROM households h
        LEFT JOIN contacts c ON c.household_id = h.id
        GROUP BY h.id, h.name
        ORDER BY h.id
        LIMIT 100
      `;
      return { households: rows };
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

  // ---- Campaign builder ----

  {
    name: "create_campaign",
    description:
      "Create a fundraising campaign / event (e.g. a spring gala). Returns the campaign id.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        event_date: { type: "string", description: "ISO date, e.g. 2026-04-18" },
        goal_amount: { type: "number" },
      },
      required: ["name"],
    },
    async execute(input) {
      const sql = getSql();
      const name = str(input.name);
      if (!name) return { error: "name is required" };
      const eventDate = str(input.event_date);
      const goal = Number(input.goal_amount) || null;
      const [row] = await sql`
        INSERT INTO campaigns (name, event_date, goal_amount, status)
        VALUES (${name}, ${eventDate}, ${goal}, 'draft')
        RETURNING id, name, event_date, goal_amount, status
      `;
      return { created_campaign: row };
    },
  },

  {
    name: "list_campaigns",
    description: "List fundraising campaigns and their status.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      const sql = getSql();
      const rows = await sql`
        SELECT id, name, event_date, goal_amount, status, created_at
        FROM campaigns ORDER BY created_at DESC LIMIT 50
      `;
      return { campaigns: rows };
    },
  },

  {
    name: "preview_audience",
    description:
      "Size and preview the segment of contacts an email campaign would target, by tag (e.g. donor, prospect, volunteer), city/state, and/or whether they've donated before. Use this to choose who a campaign should reach before drafting.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "Only contacts carrying this tag" },
        city: { type: "string" },
        state: { type: "string" },
        donor_only: { type: "boolean", description: "Only contacts with at least one donation" },
      },
    },
    async execute(input) {
      const f = normalizeAudience(input);
      const { count, sample } = await queryAudience(f);
      return { filter: f, recipient_count: count, sample };
    },
  },

  {
    name: "save_campaign_draft",
    description:
      "Save an email draft you composed for a campaign, targeting an audience segment. Provide the subject and body you wrote (personalize the copy for a non-profit's donors). Identify the campaign by campaign_id, or by campaign_name (it will be found or created). This saves a REVIEWABLE draft — it does not send email.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "number" },
        campaign_name: { type: "string", description: "Used if campaign_id is not given" },
        subject: { type: "string" },
        body: { type: "string" },
        audience_desc: { type: "string", description: "Short description of who this targets" },
        audience_filter: {
          type: "object",
          description: "The segment filter (tag, city, state, donor_only) used to size recipients",
          properties: {
            tag: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            donor_only: { type: "boolean" },
          },
        },
      },
      required: ["subject", "body"],
    },
    async execute(input) {
      const sql = getSql();
      const subject = str(input.subject);
      const body = str(input.body);
      if (!subject || !body) return { error: "subject and body are required" };

      const campaign = await resolveCampaign(input.campaign_id, input.campaign_name);
      if (!campaign) {
        return { error: "Provide a valid campaign_id or a campaign_name to save the draft under." };
      }

      const filter = normalizeAudience(
        input.audience_filter as Record<string, unknown> | undefined
      );
      const { count } = await queryAudience(filter);
      const audienceDesc = str(input.audience_desc);

      const [row] = await sql`
        INSERT INTO campaign_drafts
          (campaign_id, subject, body, audience_desc, audience_filter, recipient_count, status)
        VALUES
          (${campaign.id}, ${subject}, ${body}, ${audienceDesc},
           ${JSON.stringify(filter)}::jsonb, ${count}, 'draft')
        RETURNING id, campaign_id, subject, recipient_count, status, created_at
      `;
      return {
        saved_draft: row,
        campaign: campaign.name,
        recipient_count: count,
        note: "Draft saved for review. NGCRM does not send email; export or hand off to your mail tool to send.",
      };
    },
  },

  {
    name: "list_campaign_drafts",
    description: "List saved campaign email drafts (optionally for one campaign).",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "number", description: "Filter to one campaign" },
      },
    },
    async execute(input) {
      const sql = getSql();
      const id = toInt(input.campaign_id);
      const rows = await sql`
        SELECT d.id, d.campaign_id, c.name AS campaign_name, d.subject, d.body,
               d.audience_desc, d.recipient_count, d.status, d.created_at
        FROM campaign_drafts d
        JOIN campaigns c ON c.id = d.campaign_id
        WHERE (${id}::bigint IS NULL OR d.campaign_id = ${id})
        ORDER BY d.created_at DESC LIMIT 25
      `;
      return { drafts: rows };
    },
  },

  {
    name: "approve_campaign_draft",
    description:
      "Mark a campaign draft as approved, which is required before it can be sent. Only call this when the user has explicitly approved the draft's content and audience.",
    inputSchema: {
      type: "object",
      properties: { draft_id: { type: "number" } },
      required: ["draft_id"],
    },
    async execute(input) {
      const sql = getSql();
      const id = toInt(input.draft_id);
      if (!id) return { error: "A valid draft_id is required." };
      const [row] = (await sql`
        UPDATE campaign_drafts SET status = 'approved'
        WHERE id = ${id} AND status <> 'sent'
        RETURNING id, subject, status
      `) as { id: number; subject: string; status: string }[];
      if (!row) return { error: "Draft not found, or it was already sent." };
      return { approved: row };
    },
  },

  {
    name: "send_campaign",
    description:
      "Send an APPROVED campaign draft to its audience. This is a real outbound action, so only call it when the user has explicitly told you to send this specific draft. Defaults to a DRY RUN (records the send and marks it sent, but emails no one). Pass mode:'live' ONLY if the user explicitly asked to send for real — live sending also requires a configured email provider. The draft must be approved first (approve_campaign_draft).",
    inputSchema: {
      type: "object",
      properties: {
        draft_id: { type: "number" },
        mode: { type: "string", description: "'dry_run' (default) or 'live'" },
      },
      required: ["draft_id"],
    },
    async execute(input) {
      const sql = getSql();
      const id = toInt(input.draft_id);
      if (!id) return { error: "A valid draft_id is required." };

      const [draft] = (await sql`
        SELECT id, campaign_id, subject, body, audience_filter, status
        FROM campaign_drafts WHERE id = ${id}
      `) as {
        id: number;
        campaign_id: number | null;
        subject: string;
        body: string;
        audience_filter: AudienceFilter | null;
        status: string;
      }[];
      if (!draft) return { error: "Draft not found." };
      if (draft.status !== "approved") {
        return {
          error:
            "This draft isn't approved yet. Approve it with approve_campaign_draft after the user confirms, then send.",
        };
      }

      const wantLive = str(input.mode) === "live";
      const recipients = await audienceEmails(normalizeAudience(draft.audience_filter ?? {}));
      const recipientCount = recipients.length;

      let mode = "dry_run";
      let sent = 0;
      let failed = 0;
      let note = "";

      if (wantLive) {
        if (!resendConfigured()) {
          return {
            error:
              "Live send requested but no email provider is configured (set RESEND_API_KEY and RESEND_FROM). You can run a dry run instead.",
          };
        }
        if (recipientCount > 500) {
          return { error: `Too many recipients for a single live send (${recipientCount} > 500).` };
        }
        mode = "live";
        for (const r of recipients) {
          const body = draft.body.replaceAll("{first_name}", r.first_name || "there");
          try {
            await sendEmail(r.email, draft.subject, body);
            sent++;
          } catch {
            failed++;
          }
        }
        note = `Live send via Resend: ${sent} sent, ${failed} failed.`;
      } else {
        sent = recipientCount;
        note = "Dry run — no emails were sent.";
      }

      await sql`
        INSERT INTO campaign_sends
          (draft_id, campaign_id, mode, provider, recipient_count, sent_count, failed_count, note)
        VALUES
          (${draft.id}, ${draft.campaign_id}, ${mode}, ${mode === "live" ? "resend" : null},
           ${recipientCount}, ${sent}, ${failed}, ${note})
      `;
      await sql`UPDATE campaign_drafts SET status = 'sent', sent_at = now() WHERE id = ${draft.id}`;

      return { mode, recipient_count: recipientCount, sent_count: sent, failed_count: failed, note };
    },
  },

  {
    name: "list_campaign_sends",
    description: "List the send history (dry runs and live sends) for campaigns.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "number", description: "Filter to one campaign" } },
    },
    async execute(input) {
      const sql = getSql();
      const id = toInt(input.campaign_id);
      const rows = await sql`
        SELECT id, draft_id, campaign_id, mode, recipient_count, sent_count, failed_count, note, created_at
        FROM campaign_sends
        WHERE (${id}::bigint IS NULL OR campaign_id = ${id})
        ORDER BY created_at DESC LIMIT 25
      `;
      return { sends: rows };
    },
  },
];

export function getToolByName(name: string): AgentTool | undefined {
  return tools.find((t) => t.name === name);
}
