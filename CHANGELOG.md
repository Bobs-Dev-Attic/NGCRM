# Changelog

The version shown in the bottom-right of the app (`vX.Y.Z · <sha>`) matches an
entry below, so you can tell what a deploy contains. The `· <sha>` suffix is the
exact Git commit (on Vercel deploys).

This project uses loose semantic versioning while pre-1.0: minor bumps for
features, patch bumps for fixes.

## 0.25.0 — Custom fields for contacts (JSONB)
- Contacts can now carry **org-specific custom fields** (key/value), stored in a
  `contacts.custom` **JSONB** column — the "post-relational" escape hatch for
  data the fixed schema can't predict. **Re-run `db:migrate`** (adds the column +
  a GIN index).
- Contact page shows custom fields in Details, with an **Add/Edit** modal
  (admin/staff) — a key/value editor. Saved via `PATCH /api/contacts/[id]`
  (admin/staff, RLS-scoped, values coerced to trimmed strings, capped).
- Agent: `add_contact` accepts a `custom` object; new tool
  `set_contact_custom_fields` merges/removes fields on an existing contact.
- Custom values are folded into the contact's embedding text, so semantic search
  finds them (re-embedded on edit; Reindex backfills).

## 0.24.0 — Giving-over-time chart
- The dashboard gains a **"Giving over time"** card: a 12-month column chart of
  monthly donation totals (empty months filled in), with the window total and
  per-month amount/gift count on hover. Theme-aware, accessible (labeled), and
  built with the existing CSS-bar style — no chart library.
- `GET /api/dashboard` now returns `givingByMonth` (monthly sums for the last 12
  months), RLS-scoped like the rest of the dashboard. No migration.

## 0.23.0 — Embed-on-write (contacts self-index)
- Contacts created by the agent (`add_contact`, `import_contacts`) are now
  embedded immediately, so they're findable by semantic search without waiting
  for a manual Reindex. Best-effort: any embedding failure is swallowed so
  contact creation never breaks, and Reindex still backfills anything missed.
- The embeddings config now rides along on the agent request (client sends it;
  carried on the request context) so tools can embed newly-created rows. Bulk
  imports embed in batches, capped so very large imports stay responsive (the
  remainder falls to Reindex). No migration.

## 0.22.0 — Semantic search (pgvector)
- Contacts can now be searched by **meaning**, not just keywords. New `/search`
  page: type a description ("lapsed major donors near Chicago") and get contacts
  ranked by cosine similarity, each with a match %, linking to the contact view.
- New agent tool **`find_similar_contacts`** — "find people like this donor" /
  fuzzy near-duplicates — using stored embeddings (no key needed at query time).
- Schema: **pgvector** extension, `contacts.embedding vector(1536)` +
  `embedding_model`, and an HNSW cosine index. **Re-run `db:migrate`** (needs
  pgvector, available on Neon).
- Embeddings are provider-agnostic over the OpenAI-compatible `/embeddings`
  endpoint (default `text-embedding-3-small`, 1536-dim). Admin/staff backfill via
  a **Reindex** button on the search page (`POST /api/contacts/reindex`, batched).
  The query is embedded per request via `POST /api/search`. Keys stay in the
  browser — sent per request, never stored server-side.
- Everything is RLS-scoped: similarity ranking and results only include contacts
  the signed-in user may see.

## 0.21.0 — Gate donation writes to admin/staff
- Recording a gift is now **admin/staff only**, consistent with campaign
  editing. `POST /api/contacts/[id]` and `POST /api/households/[id]` use the
  `requireStaff` guard (volunteers get 403); the `record_donation` agent tool
  refuses for volunteers with a clear message.
- The "Record a gift" forms are hidden for volunteers (the contact and
  household GETs now return the caller's role); viewing giving history is
  unchanged. No migration.

## 0.20.0 — Edit campaign details
- The campaign page has an **Edit** button (admin/staff only) opening a modal to
  change the campaign's **name, goal amount, event date, and status**
  (draft/active/closed); the progress bar and stats refresh in place on save.
- `PATCH /api/campaigns/[id]` applies it — **admin/staff only** (volunteers get
  403), org-scoped under RLS, with server-side validation (name required, goal
  non-negative, status from the allowed set). New `requireStaff` guard in
  `lib/access.ts`. The campaign GET now returns the caller's role so the button
  shows only when allowed. No migration.

## 0.19.0 — Campaign detail page with goal progress
- New `/campaigns/[id]` page: a **goal progress bar** (raised vs. goal, % and
  amount remaining), stats (gifts, donors, average, last gift), top donors, and
  a recent-gifts table. Handles campaigns with no goal set gracefully.
- `GET /api/campaigns/[id]` backs it, auth-gated and **RLS-scoped**: gifts from
  contacts the user can't see are excluded from the raised total and lists, so
  progress reflects only visible giving.
- Discovery: the dashboard has a new **Campaigns** card (each with a mini
  progress bar) linking to the detail page, and campaign names in the contact
  and household gift-history tables now link there too.
- Added to the middleware matcher. No migration.

## 0.18.0 — "Record a gift" on the household page
- The household view's combined-giving card now has the same **Record a gift**
  form, with a **member picker** ("From") so you can log a gift for any member
  without leaving the household; totals, member giving, and history refresh in
  place on save.
- `POST /api/households/[id]` records it, auth-gated and **RLS-scoped**: the
  donor must be a visible member of that household, the campaign must be in
  scope, org_id comes from the session, and the amount is validated
  server-side. The household GET now returns campaigns for the dropdown.
  No migration.

## 0.17.0 — "Record a gift" quick form
- The contact view's giving panel now has an inline **Record a gift** form
  (amount, date, optional campaign dropdown) — log a gift without the
  assistant; totals and history refresh in place on save.
- `POST /api/contacts/[id]` records the gift, auth-gated and **RLS-scoped**:
  the insert only succeeds when the contact (and chosen campaign) is visible
  to the signed-in user, and org_id comes from the session — a user can't log
  a gift against a record they can't see. Amount is validated server-side.
- The contact GET now returns the org's campaigns to populate the dropdown.
  No migration.

## 0.16.0 — Household view with combined giving
- New `/households/[id]` page: **combined giving** across the household
  (total, gift count, distinct donors, largest, last gift), a member list
  with each member's giving, and a household-wide gift history (date, donor,
  campaign, amount).
- `GET /api/households/[id]` backs it, auth-gated and **RLS-scoped**: members
  (and their gifts) the signed-in user isn't allowed to see are excluded from
  the list and the combined totals — the rollup only reflects visible members.
- Cross-linking: dashboard "Top households" and a contact's Household field now
  link to the household view; member and donor names link back to contacts.
- Added to the middleware matcher. No migration.

## 0.15.0 — Contact view with giving history
- New `/contacts/[id]` page: a contact's details (email, phone, address,
  household, tags, notes) alongside a **giving history panel** — total given,
  gift count, largest gift, last gift, and a dated table of every gift with
  its campaign.
- `GET /api/contacts/[id]` backs it, auth-gated and **RLS-scoped**: a contact
  a user isn't allowed to see returns 404 (the row is invisible under RLS),
  not a partial record.
- Recent contacts on the dashboard now link through to the contact view.
- Added to the middleware matcher. No migration (uses existing tables).

## 0.14.0 — Donation tracking
- New agent tools: `record_donation` (log a gift; resolves the donor by
  contact_id / exact email / full name, and returns candidates to
  disambiguate rather than guessing), `list_donations`, `donation_summary`
  (totals, top donors, by campaign, optional date range), and
  `household_giving` (giving rolled up per household).
- Gifts can be tied to a campaign (matched or created) and dated; the agent
  is instructed to confirm an ambiguous donor before recording.
- These feed the existing dashboard tiles, so real gifts now drive
  "Total raised" / "Top donors". Uses the existing `donations` table under
  RLS — no migration.
- Home page: logo moved to the left, on the same row as the
  "What do you need to get done today?" prompt.

## 0.13.0 — Contacts/households dashboard
- New `/dashboard` page (linked from the home topbar, gated by middleware):
  at-a-glance tiles for contacts, households, donors, total raised, and
  campaigns, plus a contacts-by-tag bar chart and top-households / top-donors /
  recent-contacts lists.
- `GET /api/dashboard` returns the aggregates, auth-gated and **RLS-scoped** —
  a volunteer's dashboard reflects only the records they're allowed to see
  (e.g. restricted board/major donors are excluded).
- Seed now loads a handful of demo donations so "Total raised" / "Top donors"
  populate; re-run `db:seed` to refresh. No migration.

## 0.12.0 — Campaign send step (with approval gate)
- `approve_campaign_draft` marks a draft approved (required before sending).
- `send_campaign` sends an approved draft to its audience — a real outbound
  action, gated: defaults to a **dry run** (records the send, emails no one);
  `mode:"live"` sends via Resend and only when `RESEND_API_KEY`/`RESEND_FROM`
  are set. `{first_name}` is personalized per recipient; live sends are capped.
- `list_campaign_sends` shows send history; `campaign_sends` table + `sent_at`
  on drafts record it (org-scoped under RLS).
- Agent is instructed never to send on its own: draft → user approves →
  approve_campaign_draft → send (dry run unless the user asks for live).
- New optional env: `RESEND_API_KEY`, `RESEND_FROM`. **Re-run `db:migrate`.**

## 0.11.1 — Providers table UI
- Settings → Providers is now a compact table: one row per provider (name,
  model, on/off, used/threshold). Reorder by drag & drop; a ⋯ row menu has
  Edit / Turn on-off / Delete. Editing opens a modal with the full form.
- Table actions (toggle, delete, reorder, add) persist immediately; the old
  stacked forms and ▲▼ buttons are gone. No behavior change to failover.

## 0.11.0 — Provider failover chain
- Settings → Providers is now an ordered list of providers (add any number,
  reorder, enable/disable). Each has a **retry count** and a **token threshold**
  (0 = unlimited) with a per-provider usage counter.
- The agent tries providers top-to-bottom: retries transient errors up to the
  retry count, and falls through to the next provider on a fatal error (auth,
  out of credit, quota, missing model) or once a provider passes its threshold.
- `FailoverProvider` (`lib/ai/provider.ts`) wraps the chain and reports which
  provider served + any failovers; the home meta line shows "⤳ failed over N×".
- Per-provider usage is tracked in the browser and drives the thresholds.
- No migration.

## 0.10.0 — Auto-build households
- `auto_build_households` agent tool: groups contacts sharing a last name +
  locality into households ("The <Last> Household") and assigns members;
  idempotent, org-scoped under RLS. `list_households` lists them with members.
- `households` table gets `org_id` + RLS (org isolation), consistent with the
  other tenant tables. **Re-run `db:migrate`.**

## 0.9.1 — Health/diagnostics endpoint
- `GET /api/health` reports the database the deployed app is connected to
  (host + name only, no credentials), whether core tables exist / the schema is
  migrated, and whether `DATABASE_URL` / `AUTH_SECRET` are set. Helps catch a
  local-vs-Vercel `DATABASE_URL` (or Neon branch) mismatch behind
  "relation ... does not exist".

## 0.9.0 — On-screen version + changelog
- Show the app version (and commit SHA on Vercel) in a bottom-right badge on
  every page.
- Start tracking versions here; `lib/version.ts` is the single source of truth
  (kept in sync with `package.json`).

### Previously shipped (pre-versioning milestones)
Grouped by area; these landed before the version badge existed.

- **Core loop** — minimalist "What do you need to get done today?" intent UI;
  provider-agnostic agent loop; DB-backed CRM tools; Neon Postgres schema.
- **Providers** — Settings page with presets: Anthropic (Claude), OpenAI,
  Google Gemini, Ollama, LM Studio; bring-your-own-key stored per browser;
  org-scoped Anthropic key support; Gemini `thought_signature` handling and
  retired-model self-heal.
- **Contacts** — count / list / add / import; duplicate detection and merge
  (`merge_contacts`, `auto_merge_duplicate_contacts`); possible-relatives.
- **Campaigns** — campaign builder: audience segmentation + AI-drafted,
  reviewable email drafts (no sending).
- **History & personalization** — request history saved to the DB with 👍/👎
  feedback; a working-style profile derived from history and injected into the
  agent's prompt.
- **UI** — token + estimated-cost readout with toggles; logo + favicon; tabbed
  Settings (Profiles / Providers / Theme) with color schemes and "Surprise me!".
- **Security** — org scoping + Postgres Row-Level Security (identity in session
  GUCs); email/password auth with signed session cookies and route/middleware
  gating; admin user-management UI.
