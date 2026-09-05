"use client";

import type { ProviderConfig } from "@/lib/ai/types";
import { getPreset } from "@/lib/providers";

/**
 * Bring-your-own-key settings, stored in the browser's localStorage.
 * The API key never leaves the visitor's browser except to be sent with each
 * agent request over HTTPS; it is never persisted on the server.
 *
 * `preset` is a client-only convenience (which provider card is selected); the
 * server's route ignores it and reads only the ProviderConfig fields.
 */
export type ClientSettings = ProviderConfig & { preset?: string };

const KEY = "ngcrm.settings.v1";

export const DEFAULT_SETTINGS: ClientSettings = {
  preset: "anthropic",
  provider: "anthropic",
  model: "claude-sonnet-5",
  apiKey: "",
  baseUrl: "",
  workspaceId: "",
};

export function loadSettings(): ClientSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as ClientSettings) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: ClientSettings): void {
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
export function hasUsableKey(s: ClientSettings): boolean {
  // Local runtimes (Ollama, LM Studio) need no key; cloud providers do.
  if (!getPreset(s.preset).needsKey) return true;
  return Boolean(s.apiKey && s.apiKey.trim());
}
