"use client";

/**
 * Theme system. A choice is stored in localStorage and applied by setting
 * data-theme on <html> (plus an optional inline accent override for "Surprise
 * me!"). The palettes themselves live in globals.css keyed by data-theme.
 *
 * A tiny boot script in the layout applies the saved theme before paint to
 * avoid a flash of the wrong colors; this module keeps the two in sync.
 */

export type ThemeId = "system" | "light" | "dark" | "contrast" | "lowlight" | "mono";

export type ThemeState = { theme: ThemeId; accent?: string; accentFg?: string };

export const THEME_STORAGE_KEY = "ngcrm.theme.v1";

/** Swatch colors for previews in the picker (bg, accent) — mirrors globals.css. */
export const THEMES: { id: ThemeId; label: string; bg: string; accent: string; fg: string }[] = [
  { id: "system", label: "System", bg: "#fafaf9", accent: "#b5502a", fg: "#1c1b19" },
  { id: "light", label: "Light", bg: "#fafaf9", accent: "#b5502a", fg: "#1c1b19" },
  { id: "dark", label: "Dark", bg: "#1a1917", accent: "#d67a54", fg: "#f2f0ec" },
  { id: "contrast", label: "High contrast", bg: "#000000", accent: "#ffd400", fg: "#ffffff" },
  { id: "lowlight", label: "Low light", bg: "#14110e", accent: "#b07a52", fg: "#cbb8a6" },
  { id: "mono", label: "Monochrome", bg: "#f4f4f5", accent: "#27272a", fg: "#18181b" },
];

export const DEFAULT_THEME: ThemeState = { theme: "system" };

export function loadTheme(): ThemeState {
  if (typeof window === "undefined") return { ...DEFAULT_THEME };
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    return { ...DEFAULT_THEME, ...(JSON.parse(raw) as ThemeState) };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

/** Apply a theme to <html> immediately. */
export function applyTheme(state: ThemeState): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (!state.theme || state.theme === "system") {
    el.removeAttribute("data-theme");
  } else {
    el.setAttribute("data-theme", state.theme);
  }
  if (state.accent) {
    el.style.setProperty("--accent", state.accent);
    el.style.setProperty("--accent-fg", state.accentFg || readableFg(state.accent));
  } else {
    el.style.removeProperty("--accent");
    el.style.removeProperty("--accent-fg");
  }
}

export function saveTheme(state: ThemeState): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }
  applyTheme(state);
}

/** "Surprise me!" — a random color-friendly base with a random accent hue. */
export function surpriseTheme(): ThemeState {
  const bases: ThemeId[] = ["light", "dark", "lowlight"];
  const base = bases[Math.floor(Math.random() * bases.length)];
  const hue = Math.floor(Math.random() * 360);
  const accent = hslToHex(hue, 62, base === "light" ? 45 : 58);
  return { theme: base, accent, accentFg: readableFg(accent) };
}

// --- color helpers ---

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function readableFg(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // Perceived luminance (sRGB approximation).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111111" : "#ffffff";
}
