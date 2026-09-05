# Changelog

The version shown in the bottom-right of the app (`vX.Y.Z · <sha>`) matches an
entry below, so you can tell what a deploy contains. The `· <sha>` suffix is the
exact Git commit (on Vercel deploys).

This project uses loose semantic versioning while pre-1.0: minor bumps for
features, patch bumps for fixes.

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
