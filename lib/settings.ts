"use client";

import type { ProviderConfig } from "@/lib/ai/types";

/**
 * Bring-your-own-key settings, stored in the browser's localStorage.
 * The API key never leaves the visitor's browser except to be sent with each
 * agent request over HTTPS; it is never persisted on the server.
 */
const KEY = "ngcrm.settings.v1";

export const DEFAULT_SETTINGS: ProviderConfig = {
  provider: "anthropic",
  model: "claude-sonnet-5",
  apiKey: "",
  baseUrl: "",
  workspaceId: "",
};

export function loadSettings(): ProviderConfig {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as ProviderConfig) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: ProviderConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode, blocked) — ignore */
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

/** Whether the user has configured enough to run against their own provider. */
export function hasUsableKey(s: ProviderConfig): boolean {
  // openai-compatible/local endpoints (e.g. Ollama) often need no real key.
  if (s.provider && s.provider !== "anthropic") return true;
  return Boolean(s.apiKey && s.apiKey.trim());
}
