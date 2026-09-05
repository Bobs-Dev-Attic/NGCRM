import type {
  AgentTool,
  FailoverReport,
  LLMProvider,
  Message,
  ProviderCandidate,
  ProviderConfig,
  ProviderResponse,
  Usage,
} from "./types";
import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";

/** Build a single concrete provider from a config. */
export function buildProvider(config: ProviderConfig = {}): LLMProvider {
  const which = (config.provider || process.env.AI_PROVIDER || "anthropic").toLowerCase();
  switch (which) {
    case "openai":
    case "openai-compatible":
    case "local":
      return new OpenAICompatibleProvider(config);
    case "anthropic":
    default:
      return new AnthropicProvider(config);
  }
}

/**
 * Classify a provider error to decide the failover strategy:
 * - "transient": worth retrying the SAME provider (network blips, overload, 5xx).
 * - "fatal": move to the NEXT provider immediately (auth, no credit, quota,
 *   rate limit, missing model). Unknown errors are treated as fatal so we fail
 *   over rather than hammer one provider.
 */
export function classifyError(err: unknown): "transient" | "fatal" {
  const status = (err as { status?: number })?.status;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (status && [408, 500, 502, 503, 504, 529].includes(status)) return "transient";
  if (/\b(408|500|502|503|504|529)\b/.test(msg)) return "transient";
  if (/(overloaded|timeout|timed out|econnreset|temporarily|try again|network)/.test(msg)) {
    return "transient";
  }
  return "fatal";
}

function shortMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tries an ordered list of providers. Each call to complete() uses the first
 * provider that succeeds, retrying transient errors up to the candidate's
 * maxRetries, and falling through to the next provider on a fatal error (e.g.
 * exhausted credits). Once it has advanced past a provider it won't return to
 * it for the rest of the request. Reports which providers served and any
 * failovers so the UI can attribute usage and show what happened.
 */
export class FailoverProvider implements LLMProvider {
  private candidates: ProviderCandidate[];
  private cache = new Map<number, LLMProvider>();
  private idx = 0;
  private activeLabel: string | null = null;
  private activeName = "";
  private activeModel = "";
  private usage = new Map<string, { model: string; tokens: number }>();
  private failoverLog: { label: string; reason: string }[] = [];

  constructor(candidates: ProviderCandidate[]) {
    this.candidates = candidates;
    this.activeModel = candidates[0]?.model || "";
  }

  get name() {
    return this.activeName || "failover";
  }
  get model() {
    return this.activeModel;
  }

  private providerFor(i: number): LLMProvider {
    let p = this.cache.get(i);
    if (!p) {
      p = buildProvider(this.candidates[i]);
      this.cache.set(i, p);
    }
    return p;
  }

  private addUsage(label: string, model: string, u?: Usage) {
    if (!u) return;
    const cur = this.usage.get(label) || { model, tokens: 0 };
    cur.tokens += u.totalTokens;
    cur.model = model;
    this.usage.set(label, cur);
  }

  async complete(
    system: string,
    messages: Message[],
    tools: AgentTool[]
  ): Promise<ProviderResponse> {
    let lastErr: unknown;
    for (; this.idx < this.candidates.length; this.idx++) {
      const cand = this.candidates[this.idx];
      const label = cand.label || `provider-${this.idx + 1}`;
      const maxRetries = Math.max(0, Math.min(cand.maxRetries ?? 0, 5));
      let provider: LLMProvider;
      try {
        provider = this.providerFor(this.idx);
      } catch (e) {
        // Misconfigured (e.g. missing key) — treat as fatal, move on.
        lastErr = e;
        this.failoverLog.push({ label, reason: shortMessage(e) });
        continue;
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await provider.complete(system, messages, tools);
          this.activeLabel = label;
          this.activeName = provider.name;
          this.activeModel = provider.model;
          this.addUsage(label, provider.model, res.usage);
          return res;
        } catch (e) {
          lastErr = e;
          const kind = classifyError(e);
          if (kind === "transient" && attempt < maxRetries) {
            await sleep(300 * (attempt + 1)); // small linear backoff
            continue;
          }
          this.failoverLog.push({ label, reason: shortMessage(e) });
          break; // give up on this provider, fall through to the next
        }
      }
    }
    throw lastErr ?? new Error("No providers available.");
  }

  report(): FailoverReport {
    return {
      providerUsed: this.activeLabel,
      providerUsage: Array.from(this.usage.entries()).map(([label, v]) => ({
        label,
        model: v.model,
        tokens: v.tokens,
      })),
      failovers: this.failoverLog,
    };
  }
}

/** Single config -> one provider; an array -> a failover chain. */
export function getProvider(input: ProviderConfig | ProviderCandidate[] = {}): LLMProvider {
  if (Array.isArray(input)) {
    if (input.length === 0) return buildProvider({});
    return new FailoverProvider(input);
  }
  return buildProvider(input);
}
