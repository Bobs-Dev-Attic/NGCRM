# Changelog

The version shown in the bottom-right of the app (`vX.Y.Z · <sha>`) matches an
entry below, so you can tell what a deploy contains. The `· <sha>` suffix is the
exact Git commit (on Vercel deploys).

This project uses loose semantic versioning while pre-1.0: minor bumps for
features, patch bumps for fixes.

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
