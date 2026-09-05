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
  campaigns, donations, goals, tasks.

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

## Switching AI providers

The agent never imports a vendor SDK directly. To use a local LLM instead of Claude:

```bash
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:11434/v1   # Ollama
OPENAI_API_KEY=ollama
OPENAI_MODEL=llama3.1
```

> Note: tool-calling quality depends on the model. Claude and GPT-4-class models
> handle the CRM tools reliably; smaller local models may need a tool-capable variant.

## Deploying (Vercel + Neon)

Push to GitHub, import the repo in Vercel, and set the same env vars in the
Vercel project settings. The agent route runs on the Node.js runtime.

## What's next (beyond the skeleton)

- Merge flow for duplicates; auto-build households from relative clusters
- Full campaign builder (segment → draft → review → send) with email provider
- Donations analytics and giving history per household
- Streaming agent responses; task/goal tracking surfaced in the UI
- MCP transport so external MCP tool servers can be plugged in alongside the built-in tools
