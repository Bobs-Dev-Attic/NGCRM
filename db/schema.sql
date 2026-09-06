-- Next-Gen CRM schema (walking skeleton)
-- Postgres / Neon. Idempotent: safe to run repeatedly.

-- Households group people who likely share a family / address unit.
-- Used to surface "possible relatives" and to de-duplicate at the household level.
CREATE TABLE IF NOT EXISTS households (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT,                      -- e.g. "The Chang Family"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Core CRM record. A person (donor, volunteer, prospect, staff contact).
CREATE TABLE IF NOT EXISTS contacts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name    TEXT,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  address_line  TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  household_id  BIGINT REFERENCES households(id) ON DELETE SET NULL,
  tags          TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {donor,volunteer,board}
  source        TEXT,                            -- how they entered the CRM (import, event, web)
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON contacts (lower(last_name));
CREATE INDEX IF NOT EXISTS idx_contacts_email     ON contacts (lower(email));
CREATE INDEX IF NOT EXISTS idx_contacts_household  ON contacts (household_id);

-- Fundraising campaigns / events (e.g. an upcoming gala).
CREATE TABLE IF NOT EXISTS campaigns (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  event_date  DATE,
  goal_amount NUMERIC(12,2),
  status      TEXT NOT NULL DEFAULT 'draft',   -- draft | active | closed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Donations tie a contact to money and (optionally) a campaign.
CREATE TABLE IF NOT EXISTS donations (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_id  BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
  amount      NUMERIC(12,2) NOT NULL,
  donated_at  DATE NOT NULL DEFAULT current_date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donations_contact  ON donations (contact_id);
CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations (campaign_id);

-- Goals: what the operator wants to accomplish this morning / afternoon.
CREATE TABLE IF NOT EXISTS goals (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       TEXT NOT NULL,
  period      TEXT,                             -- morning | afternoon | day
  goal_date   DATE NOT NULL DEFAULT current_date,
  status      TEXT NOT NULL DEFAULT 'open',     -- open | done
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks: concrete steps, optionally tied to a goal. The agent records what it did here.
CREATE TABLE IF NOT EXISTS tasks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  goal_id     BIGINT REFERENCES goals(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',     -- open | in_progress | done
  result      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Request history: every intent the operator typed, the agent's answer, which
-- tools it used, token/turn usage, and optional feedback. This is both a
-- convenience (recall past work) and the raw signal for personalizing how the
-- agent works for a given user over time.
CREATE TABLE IF NOT EXISTS request_history (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intent        TEXT NOT NULL,                  -- what the user asked
  answer        TEXT,                           -- the agent's final summary
  provider      TEXT,
  model         TEXT,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens  INT NOT NULL DEFAULT 0,
  turns         INT NOT NULL DEFAULT 0,
  tools_used    TEXT[] NOT NULL DEFAULT '{}',   -- names of tools the agent called
  steps         JSONB,                          -- full action trail
  rating        SMALLINT,                       -- user feedback: -1, +1, or NULL
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_created ON request_history (created_at DESC);

-- Campaign drafts: an email the agent composed for a campaign, targeting a
-- segment. Kept as a reviewable draft — NGCRM does not send email itself.
CREATE TABLE IF NOT EXISTS campaign_drafts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id     BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  audience_desc   TEXT,                           -- human description of the segment
  audience_filter JSONB,                          -- the filter used to size the audience
  recipient_count INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | approved
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_drafts_campaign ON campaign_drafts (campaign_id);

-- ============================================================================
-- Access control: organizations (tenants) + Row-Level Security.
-- Authorization is enforced HERE, below the agent. Each request sets the
-- session GUCs app.org_id / app.role; policies read them via app_org()/app_role().
-- "No identity set" (app_org() IS NULL) is treated as a trusted server path
-- (migrations, seeds) so those keep working; the app always sets an identity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS orgs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO orgs (name) SELECT 'Demo Organization' WHERE NOT EXISTS (SELECT 1 FROM orgs);

-- Users: authentication + role. Looked up by email pre-auth, so this table is
-- intentionally NOT under RLS (you don't know the org before you log in).
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        BIGINT REFERENCES orgs(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',   -- admin | staff | volunteer
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign sends: an audit record of each send of a draft (dry run or live).
CREATE TABLE IF NOT EXISTS campaign_sends (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id          BIGINT DEFAULT nullif(current_setting('app.org_id', true), '')::bigint,
  draft_id        BIGINT REFERENCES campaign_drafts(id) ON DELETE SET NULL,
  campaign_id     BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
  mode            TEXT NOT NULL DEFAULT 'dry_run',   -- dry_run | live
  provider        TEXT,
  recipient_count INT NOT NULL DEFAULT 0,
  sent_count      INT NOT NULL DEFAULT 0,
  failed_count    INT NOT NULL DEFAULT 0,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE campaign_drafts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Add org_id to every tenant-scoped table; contacts also get a sensitivity tag.
ALTER TABLE households      ADD COLUMN IF NOT EXISTS org_id BIGINT;
ALTER TABLE contacts        ADD COLUMN IF NOT EXISTS org_id BIGINT;
ALTER TABLE contacts        ADD COLUMN IF NOT EXISTS sensitivity TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE donations       ADD COLUMN IF NOT EXISTS org_id BIGINT;
ALTER TABLE campaigns       ADD COLUMN IF NOT EXISTS org_id BIGINT;
ALTER TABLE goals           ADD COLUMN IF NOT EXISTS org_id BIGINT;
ALTER TABLE tasks           ADD COLUMN IF NOT EXISTS org_id BIGINT;
ALTER TABLE campaign_drafts ADD COLUMN IF NOT EXISTS org_id BIGINT;
ALTER TABLE request_history ADD COLUMN IF NOT EXISTS org_id BIGINT;

-- Backfill existing rows to the default org (before RLS is forced).
UPDATE households      SET org_id = (SELECT min(id) FROM orgs) WHERE org_id IS NULL;
UPDATE contacts        SET org_id = (SELECT min(id) FROM orgs) WHERE org_id IS NULL;
UPDATE donations       SET org_id = (SELECT min(id) FROM orgs) WHERE org_id IS NULL;
UPDATE campaigns       SET org_id = (SELECT min(id) FROM orgs) WHERE org_id IS NULL;
UPDATE goals           SET org_id = (SELECT min(id) FROM orgs) WHERE org_id IS NULL;
UPDATE tasks           SET org_id = (SELECT min(id) FROM orgs) WHERE org_id IS NULL;
UPDATE campaign_drafts SET org_id = (SELECT min(id) FROM orgs) WHERE org_id IS NULL;
UPDATE request_history SET org_id = (SELECT min(id) FROM orgs) WHERE org_id IS NULL;

-- New rows adopt the session's org automatically (from the GUC set per request).
ALTER TABLE households      ALTER COLUMN org_id SET DEFAULT nullif(current_setting('app.org_id', true), '')::bigint;
ALTER TABLE contacts        ALTER COLUMN org_id SET DEFAULT nullif(current_setting('app.org_id', true), '')::bigint;
ALTER TABLE donations       ALTER COLUMN org_id SET DEFAULT nullif(current_setting('app.org_id', true), '')::bigint;
ALTER TABLE campaigns       ALTER COLUMN org_id SET DEFAULT nullif(current_setting('app.org_id', true), '')::bigint;
ALTER TABLE goals           ALTER COLUMN org_id SET DEFAULT nullif(current_setting('app.org_id', true), '')::bigint;
ALTER TABLE tasks           ALTER COLUMN org_id SET DEFAULT nullif(current_setting('app.org_id', true), '')::bigint;
ALTER TABLE campaign_drafts ALTER COLUMN org_id SET DEFAULT nullif(current_setting('app.org_id', true), '')::bigint;
ALTER TABLE request_history ALTER COLUMN org_id SET DEFAULT nullif(current_setting('app.org_id', true), '')::bigint;

-- Demo: treat board members as restricted (major-donor-style records).
UPDATE contacts SET sensitivity = 'restricted' WHERE 'board' = ANY(tags) AND sensitivity = 'normal';

-- Identity accessors used by policies.
CREATE OR REPLACE FUNCTION app_org() RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::bigint $$;
CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.role', true), '') $$;

-- Contacts: org isolation + sensitivity (restricted rows need admin/staff).
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contacts_select ON contacts;
CREATE POLICY contacts_select ON contacts FOR SELECT USING (app_org() IS NULL OR (org_id = app_org() AND (sensitivity <> 'restricted' OR app_role() IN ('admin', 'staff'))));
DROP POLICY IF EXISTS contacts_insert ON contacts;
CREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK (app_org() IS NULL OR org_id = app_org());
DROP POLICY IF EXISTS contacts_update ON contacts;
CREATE POLICY contacts_update ON contacts FOR UPDATE USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());
DROP POLICY IF EXISTS contacts_delete ON contacts;
CREATE POLICY contacts_delete ON contacts FOR DELETE USING (app_org() IS NULL OR org_id = app_org());

-- Other tenant tables: org isolation only.
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS households_all ON households;
CREATE POLICY households_all ON households FOR ALL USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS donations_all ON donations;
CREATE POLICY donations_all ON donations FOR ALL USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaigns_all ON campaigns;
CREATE POLICY campaigns_all ON campaigns FOR ALL USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS goals_all ON goals;
CREATE POLICY goals_all ON goals FOR ALL USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_all ON tasks;
CREATE POLICY tasks_all ON tasks FOR ALL USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());

ALTER TABLE campaign_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_drafts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_drafts_all ON campaign_drafts;
CREATE POLICY campaign_drafts_all ON campaign_drafts FOR ALL USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());

ALTER TABLE request_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS request_history_all ON request_history;
CREATE POLICY request_history_all ON request_history FOR ALL USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());

ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sends FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campaign_sends_all ON campaign_sends;
CREATE POLICY campaign_sends_all ON campaign_sends FOR ALL USING (app_org() IS NULL OR org_id = app_org()) WITH CHECK (app_org() IS NULL OR org_id = app_org());

-- Semantic search (pgvector). Contacts carry an embedding of their profile text
-- so we can rank by meaning ("major donors near Chicago"), not just keywords.
-- The column is fixed at 1536 dims (OpenAI text-embedding-3-small); embedding_model
-- records which model produced it so mismatched vectors aren't mixed. RLS on
-- contacts already scopes every similarity query. Requires the pgvector extension
-- (available on Neon). Backfill via the /search page's "Reindex" button.
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS embedding_model TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_embedding ON contacts USING hnsw (embedding vector_cosine_ops);

-- Custom fields: org-specific data the fixed schema can't predict (e.g.
-- "T-shirt size", "Board term ends"). Stored as a JSONB object of string keys
-- to string values on each contact. RLS on contacts already scopes it; a GIN
-- index keeps containment queries fast.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_contacts_custom ON contacts USING gin (custom);

-- Custom fields for households and campaigns too (same JSONB key/value model as
-- contacts). Org-scoped by the existing RLS on each table; GIN-indexed.
ALTER TABLE households ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_households_custom ON households USING gin (custom);
ALTER TABLE campaigns  ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_campaigns_custom ON campaigns USING gin (custom);
