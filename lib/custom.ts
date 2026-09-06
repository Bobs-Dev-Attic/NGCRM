/**
 * Custom (JSONB) contact fields: a flat map of string keys to string values.
 * Shared by the agent tools, the contact API, and the embedding text builder so
 * normalization is identical everywhere.
 */

export type CustomFields = Record<string, string>;

const MAX_KEYS = 50;
const MAX_KEY = 60;
const MAX_VALUE = 500;

/**
 * Coerce arbitrary input into a clean {string: string} map: trims keys/values,
 * drops empty keys and null/empty values, stringifies scalars, and caps size so
 * a contact's custom blob stays bounded.
 */
export function normalizeCustom(input: unknown): CustomFields {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: CustomFields = {};
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim().slice(0, MAX_KEY);
    if (!key) continue;
    if (rawVal === null || rawVal === undefined) continue;
    if (typeof rawVal === "object") continue; // only scalars
    const value = String(rawVal).trim().slice(0, MAX_VALUE);
    if (!value) continue;
    out[key] = value;
    if (Object.keys(out).length >= MAX_KEYS) break;
  }
  return out;
}

/** Merge `patch` into `base`; a null/empty value removes that key. */
export function mergeCustom(base: unknown, patch: unknown): CustomFields {
  const result = normalizeCustom(base);
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    for (const [rawKey, rawVal] of Object.entries(patch as Record<string, unknown>)) {
      const key = rawKey.trim().slice(0, MAX_KEY);
      if (!key) continue;
      if (rawVal === null || rawVal === undefined || String(rawVal).trim() === "") {
        delete result[key];
      } else if (typeof rawVal !== "object") {
        result[key] = String(rawVal).trim().slice(0, MAX_VALUE);
      }
    }
  }
  return normalizeCustom(result);
}

/** "key: value; key: value" — for embedding text / display. */
export function customText(custom: unknown): string {
  const c = normalizeCustom(custom);
  return Object.entries(c)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}
