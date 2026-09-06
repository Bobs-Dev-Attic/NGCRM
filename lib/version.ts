/**
 * Single source of truth for the app version shown on screen.
 * Bump this with every user-facing change and add a matching CHANGELOG.md entry.
 * Keep it in sync with package.json "version".
 */
export const APP_VERSION = "0.20.0";

/** Short commit SHA, when the deploy provides it (Vercel). Empty locally. */
export const COMMIT_SHA = (process.env.NEXT_PUBLIC_COMMIT_SHA || "").slice(0, 7);
