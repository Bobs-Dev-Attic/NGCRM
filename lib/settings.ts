"use client";

import { getPreset, PROVIDER_PRESETS } from "@/lib/providers";

/**
 * Bring-your-own-key settings, stored in the browser's localStorage.
 * Keys never leave the browser except to be sent with each agent request.
 *
 * Providers are an ordered failover chain: the agent tries them top-to-bottom,
 * retrying transient errors up to `maxRetries` and moving to the next when one
 * errors (e.g. out of credit) or hits its `thresholdTokens` usage cap.
 */

export type ProviderEntry = {
  id: string;
  preset: string;
  provider: string; // transport: anthropic | openai-compatible
  model: string;
  apiKey: string;
  baseUrl: string;
  workspaceId: string;
  enabled: boolean;
  maxRetries: number;
  thresholdTokens: number; // 0 = unlimited
  usedTokens: number; // cumulative, tracked client-side
};

export type ClientSettings = {
  providers: ProviderEntry[];
  showTokens?: boolean;
  showCost?: boolean;
};

/** Candidate shape sent to the server (matches ProviderCandidate). */
export type Candidate = {
  label: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  workspaceId: string;
  maxRetries: number;
};

const KEY = "ngcrm.settings.v1";

const RETIRED_MODELS: Record<string, string> = {
  "gemini-2.5-flash": "gemini-3.6-flash",
  "gemini-2.5-pro": "gemini-3.6-flash",
};

function genId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh provider entry seeded from a preset. */
export function makeEntry(presetId = "anthropic"): ProviderEntry {
  const p = getPreset(presetId);
  return {
    id: genId(),
    preset: p.id,
    provider: p.transport,
    model: p.defaultModel,
    apiKey: "",
    baseUrl: p.defaultBaseUrl ?? "",
    workspaceId: "",
    enabled: true,
    maxRetries: 1,
    thresholdTokens: 0,
    usedTokens: 0,
  };
}

export const DEFAULT_SETTINGS: ClientSettings = {
  providers: [makeEntry("anthropic")],
  showTokens: true,
  showCost: true,
};

/** Load settings, migrating the old single-provider shape into a chain. */
export function loadSettings(): ClientSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS, providers: [makeEntry()] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, providers: [makeEntry()] };
    const parsed = JSON.parse(raw) as Partial<ClientSettings> & Record<string, unknown>;

    let providers: ProviderEntry[];
    if (Array.isArray(parsed.providers) && parsed.providers.length > 0) {
      providers = parsed.providers.map(normalizeEntry);
    } else {
      // Legacy single-provider settings -> one entry.
      const legacy = makeEntry((parsed.preset as string) || "anthropic");
      providers = [
        {
          ...legacy,
          provider: (parsed.provider as string) || legacy.provider,
          model: (parsed.model as string) || legacy.model,
          apiKey: (parsed.apiKey as string) || "",
          baseUrl: (parsed.baseUrl as string) || legacy.baseUrl,
          workspaceId: (parsed.workspaceId as string) || "",
        },
      ];
    }
    return {
      providers,
      showTokens: parsed.showTokens ?? true,
      showCost: parsed.showCost ?? true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, providers: [makeEntry()] };
  }
}

function normalizeEntry(e: Partial<ProviderEntry>): ProviderEntry {
  const base = makeEntry(e.preset || "anthropic");
  const model = e.model || base.model;
  return {
    ...base,
    ...e,
    id: e.id || base.id,
    model: RETIRED_MODELS[model] || model, // self-heal retired ids
    maxRetries: Number.isFinite(Number(e.maxRetries)) ? Number(e.maxRetries) : base.maxRetries,
    thresholdTokens: Number.isFinite(Number(e.thresholdTokens)) ? Number(e.thresholdTokens) : 0,
    usedTokens: Number.isFinite(Number(e.usedTokens)) ? Number(e.usedTokens) : 0,
    enabled: e.enabled !== false,
  };
}

export function saveSettings(s: ClientSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function clearSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Whether an entry can actually be used (enabled, has a key if required, under threshold). */
export function entryEligible(e: ProviderEntry): boolean {
  if (!e.enabled) return false;
  const needsKey = getPreset(e.preset).needsKey;
  if (needsKey && !e.apiKey.trim()) return false;
  if (e.thresholdTokens > 0 && e.usedTokens >= e.thresholdTokens) return false;
  return true;
}

/** The ordered failover chain to send with a request. */
export function eligibleChain(s: ClientSettings): Candidate[] {
  return s.providers.filter(entryEligible).map((e) => ({
    label: e.id,
    provider: e.provider,
    model: e.model,
    apiKey: e.apiKey,
    baseUrl: e.baseUrl,
    workspaceId: e.workspaceId,
    maxRetries: e.maxRetries,
  }));
}

/** Whether at least one provider is ready to use. */
export function hasUsableKey(s: ClientSettings): boolean {
  return s.providers.some(entryEligible);
}

/** Accumulate per-provider token usage returned by the server (matched by id/label). */
export function recordUsage(
  usage: { label: string; tokens: number }[] | undefined
): void {
  if (!usage || usage.length === 0) return;
  const s = loadSettings();
  let changed = false;
  for (const u of usage) {
    const entry = s.providers.find((p) => p.id === u.label);
    if (entry) {
      entry.usedTokens += u.tokens;
      changed = true;
    }
  }
  if (changed) saveSettings(s);
}

export const PRESET_OPTIONS = PROVIDER_PRESETS;
