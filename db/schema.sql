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
