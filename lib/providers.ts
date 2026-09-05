/**
 * Provider presets for the Settings page.
 *
 * Every provider except Anthropic speaks the OpenAI-compatible
 * /chat/completions dialect, so they all share the "openai-compatible"
 * transport — only the base URL, default model, and key requirements differ.
 */

export type ProviderPreset = {
  id: string;
  label: string;
  /** Which server-side transport handles this preset. */
  transport: "anthropic" | "openai-compatible";
  defaultBaseUrl?: string;
  defaultModel: string;
  /** Whether an API key is required (local runtimes usually don't need one). */
  needsKey: boolean;
  /** Runs on the user's own machine (localhost). */
  local?: boolean;
  /** Where to get a key / short help line. */
  keyHelp?: string;
  /** Step-by-step setup, shown for local providers. */
  setup?: string[];
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    transport: "anthropic",
    defaultModel: "claude-sonnet-5",
    needsKey: true,
    keyHelp: "Create a workspace-scoped key at console.anthropic.com → API keys.",
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    transport: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    needsKey: true,
    keyHelp: "Create a key at platform.openai.com → API keys.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    transport: "openai-compatible",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.5-flash",
    needsKey: true,
    keyHelp: "Create a key at aistudio.google.com/apikey. Gemini exposes an OpenAI-compatible endpoint.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    transport: "openai-compatible",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    needsKey: false,
    local: true,
    setup: [
      "Install Ollama from ollama.com/download and launch it (it starts a server automatically).",
      "Pull a model that supports tool/function calling, e.g. run: ollama pull llama3.1 (or qwen2.5, mistral-nemo).",
      "Ollama serves an OpenAI-compatible API at http://localhost:11434/v1 — no API key needed.",
      "Set Model below to the exact model you pulled (e.g. llama3.1).",
    ],
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    transport: "openai-compatible",
    defaultBaseUrl: "http://localhost:1234/v1",
    defaultModel: "(your loaded model)",
    needsKey: false,
    local: true,
    setup: [
      "Install LM Studio from lmstudio.ai and download a tool-capable model in the Discover tab.",
      "Open the Developer tab (the terminal icon), load the model, and click Start Server.",
      "It exposes an OpenAI-compatible API at http://localhost:1234/v1 — the API key can be left blank.",
      "Set Model below to the identifier LM Studio shows for the loaded model.",
    ],
  },
];

export function getPreset(id: string | undefined): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[0];
}
