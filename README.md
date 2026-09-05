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
  campaigns, donations, goals, tasks, and `request_history` (every intent +
  result + usage + feedback). `db:migrate` is idempotent — re-run it after
  pulling schema changes to add new tables.

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

- Auto-build households from relative clusters (duplicate detection + merge now shipped:
  `find_duplicate_contacts`, `merge_contacts`, `auto_merge_duplicate_contacts`)
- Campaign builder shipped: `create_campaign`, `list_campaigns`, `preview_audience`,
  `save_campaign_draft`, `list_campaign_drafts` — the agent segments an audience and
  drafts a reviewable email (sending is intentionally out of scope). Wiring an email
  provider to actually send is a natural follow-up.
- Full campaign builder (segment → draft → review → send) with email provider
- Donations analytics and giving history per household
- Streaming agent responses; task/goal tracking surfaced in the UI
- MCP transport so external MCP tool servers can be plugged in alongside the built-in tools
