# Next-Gen CRM

An AI-native CRM for non-profits. Instead of menus and forms, there's a single
prompt — **"What do you need to get done today?"** — and an AI agent that reads
and manages the CRM database on your behalf: importing contacts, finding
duplicates, surfacing possible relatives, setting goals, and preparing campaigns.

This repo is the **walking skeleton**: the whole loop, built thin, so the vision
is demonstrable end-to-end.

## Architecture

```
Browser (minimalist intent UI)
   │  POST /api/agent   { intent }
   ▼
Agent loop  (lib/ai/agent.ts)
   │  provider-agnostic — Claude by default, swappable to OpenAI-compatible / local LLMs
   ├── plans with the model
   ├── calls CRM tools (lib/ai/tools.ts)  ── parameterized SQL ──▶  Neon Postgres
   └── summarizes the outcome for the user
```

- **Frontend** — Next.js (App Router) + React. One centered prompt, à la Claude.ai.
- **AI layer** — a provider-agnostic interface (`lib/ai/types.ts`). Default is
  Claude (`lib/ai/anthropic.ts`); `lib/ai/openai-compatible.ts` covers OpenAI and
  any local LLM that speaks the OpenAI `/chat/completions` dialect (Ollama, LM
  Studio, vLLM…). Selected by the `AI_PROVIDER` env var.
- **Tools** — each CRM capability is one tool in `lib/ai/tools.ts`. Adding a
  feature = adding a tool; the UI and agent loop don't change.
- **Database** — Neon Postgres (`db/schema.sql`): contacts, households,
  campaigns, donations, goals, tasks, `request_history`, and `orgs`.
  `db:migrate` is idempotent — re-run it after pulling schema changes.
- **Contact view** — `/contacts/[id]` shows a contact's details next to a
  **giving history** panel (total given, gift count, largest/last gift, and a
  dated list of every gift with its campaign) plus an inline **Record a gift**
  form (amount, date, optional campaign). Backed by `GET`/`POST /api/contacts/[id]`,
  auth-gated and RLS-scoped (an out-of-scope contact returns 404; a gift can't be
  logged against a record the user can't see; recording is admin/staff only,
  volunteers get 403). Reachable from the dashboard's recent-contacts list.
  Contacts also carry **custom fields** — org-specific key/value data in a JSONB
  column, editable on the page by admins/staff and by the agent
  (`set_contact_custom_fields`), and folded into semantic search. Households and
  campaigns carry custom fields too (editable on their pages by admins/staff).
- **Household view** — `/households/[id]` rolls up **combined giving** across a
  household (total, gifts, donors, largest, last gift) with a member list and a
  household-wide gift history, plus a **Record a gift** form with a member
  picker. Backed by `GET`/`POST /api/households/[id]`, auth-gated and RLS-scoped
  (members a user can't see are excluded from the totals; a gift can only be
  logged for a visible member). Cross-linked with the contact view and dashboard.
- **Campaign view** — `/campaigns/[id]` shows a **goal progress bar** (raised
  vs. goal, % and remaining), gift/donor/average stats, top donors, and a recent
  gifts table. Backed by `GET /api/campaigns/[id]`, auth-gated and RLS-scoped
  (progress reflects only visible giving). Linked from the dashboard's Campaigns
  card and from campaign names in gift-history tables. Admins/staff can **edit**
  the campaign (name, goal, event date, status) from the page via
  `PATCH /api/campaigns/[id]` (volunteers get 403).
- **Semantic search** — `/search` ranks contacts by **meaning** using pgvector
  embeddings (e.g. "lapsed major donors near Chicago"), each with a match %.
  Embeddings are provider-agnostic (OpenAI-compatible `/embeddings`, default
  `text-embedding-3-small`); admin/staff backfill with a **Reindex** button.
  The `find_similar_contacts` agent tool ("find people like this donor") uses the
  stored vectors. RLS-scoped like everything else. Requires `db:migrate` with the
  pgvector extension. New contacts added by the agent self-index (embed-on-write);
  Reindex backfills anything created before indexing was set up.
- **Dashboard** — `/dashboard` gives an at-a-glance view: tiles for contacts,
  a **giving-over-time** column chart (last 12 months), **CSV/Excel export** of
  contacts and donations (RLS-scoped), **CSV import** of contacts (`/import`,
  column-mapping, admin/staff),
  households, donors, total raised and campaigns, plus a contacts-by-tag chart
  and top-households / top-donors / recent-contacts lists. It reads
  `GET /api/dashboard`, which is auth-gated and **RLS-scoped**, so each user
  only sees totals for records they're allowed to (e.g. a volunteer's numbers
  exclude restricted board/major donors).
- **Admin** — admins get a `/admin` user-management page: list users, add users
  with a role, change roles, and remove users — scoped to their org and enforced
  server-side (`app/api/admin/users`). The last admin can't be demoted or removed.
- **Auth** — email + password accounts (`users` table). Passwords hashed with
  scrypt (`lib/password.ts`); sessions are HMAC-signed HttpOnly cookies
  (`lib/auth.ts`, Web Crypto so edge middleware can verify them). `middleware.ts`
  redirects unauthenticated visitors to `/login`; the data routes return 401.
  Requires `AUTH_SECRET` in the environment.
- **Access control** — enforced by Postgres **Row-Level Security**, not by the
  agent. Each request derives its identity (org + role) from the **verified
  session**, sets it as session GUCs, and RLS policies filter every query the
  agent's tools run — so the model can never return rows the signed-in user isn't
  allowed to see. Sign in as `volunteer@demo.org` vs `staff@demo.org` (seeded,
  password `demo1234`): the volunteer cannot see `restricted` records (board /
  major donors). See `lib/db.ts` (per-request scoped client) and the policies at
  the end of `db/schema.sql`.

## Getting started

1. **Install**
   ```bash
   npm install
   ```

2. **Configure** — copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — your Neon pooled connection string
   - `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`)

3. **Create the schema + sample data** in your Neon DB
   ```bash
   npm run db:migrate
   npm run db:seed     # optional: loads messy sample contacts for dedupe/relatives demos
   ```

4. **Run**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and try: *"How many contacts do we have?"* or
   *"Find contacts who might be related."*

## Configuring the AI provider

There are two ways to tell the agent which provider/model/key to use:

1. **In-app Settings page (`/settings`) — bring-your-own-key.** Each visitor enters
   their provider, model, and API key; these are stored in *their* browser
   (localStorage) and sent with each request. The key is never persisted on the
   server. This is the default path for the hosted demo, and it's what lets you
   point at a local LLM without redeploying.
2. **Server environment variables.** If a request carries no browser config, the
   server falls back to `AI_PROVIDER` / `ANTHROPIC_API_KEY` / etc. Useful for a
   single-tenant deployment where you'd rather set the key once in Vercel.

Per-request browser config always takes precedence over the server env.

**Failover chain.** Settings → Providers is an ordered list. The agent tries
providers top-to-bottom, retrying transient errors up to each provider's retry
count and falling through to the next when one errors (out of credit, auth,
quota, missing model) or passes its per-provider token threshold. Usage is
tracked per provider in the browser; the home page shows when a request failed
over.

## Supported providers

The Settings page offers presets; all non-Anthropic providers share one
OpenAI-compatible transport (only base URL / model / key differ):

| Preset | Transport | Base URL | Key |
|---|---|---|---|
| Anthropic (Claude) | `anthropic` | — | required |
| OpenAI (ChatGPT) | `openai-compatible` | `https://api.openai.com/v1` | required |
| Google Gemini | `openai-compatible` | `https://generativelanguage.googleapis.com/v1beta/openai/` | required |
| Ollama (local) | `openai-compatible` | `http://localhost:11434/v1` | none |
| LM Studio (local) | `openai-compatible` | `http://localhost:1234/v1` | none |

> **Local providers (Ollama, LM Studio)** only work when you run NGCRM locally
> (`npm run dev`). The agent calls the provider from the **server**, so a
> `localhost` endpoint is unreachable from the hosted Vercel deployment. Pick a
> model that supports **tool / function calling**, which the agent relies on.

## Switching AI providers via env (server-side)

The agent never imports a vendor SDK directly. To set a default on the server:

```bash
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:11434/v1   # Ollama
OPENAI_API_KEY=ollama
OPENAI_MODEL=llama3.1
```

## Deploying (Vercel + Neon)

Push to GitHub, import the repo in Vercel, and set the same env vars in the
Vercel project settings. The agent route runs on the Node.js runtime.

## What's next (beyond the skeleton)

- Duplicate detection + merge (`find_duplicate_contacts`, `merge_contacts`,
  `auto_merge_duplicate_contacts`) and household building (`find_possible_relatives`,
  `auto_build_households`, `list_households`) are shipped.
- Campaign builder + send shipped: `create_campaign`, `list_campaigns`,
  `preview_audience`, `save_campaign_draft`, `list_campaign_drafts`,
  `approve_campaign_draft`, `send_campaign`, `list_campaign_sends`. Sending is
  gated (draft → approve → send), defaults to a dry run, and only goes live via
  Resend when `RESEND_API_KEY`/`RESEND_FROM` are set and the user asks.
- Full campaign builder (segment → draft → review → send) with email provider
- Donation tracking shipped: `record_donation`, `list_donations`,
  `donation_summary`, and `household_giving` (per-household giving rollups),
  feeding the dashboard's "Total raised" / "Top donors".
- Streaming agent responses; task/goal tracking surfaced in the UI
- MCP transport so external MCP tool servers can be plugged in alongside the built-in tools
