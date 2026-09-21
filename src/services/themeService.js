import { ACCENTS, DEFAULT_ACCENT } from '../constants/accentPalettes';

const STORAGE_KEY = 'drummate_theme';
const DEFAULT_THEME = 'light';
const VALID = new Set(['light', 'dark']);

const ACCENT_STORAGE_KEY = 'drummate_accent';
const VALID_ACCENTS = new Set(ACCENTS);

function readCache() {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (v && VALID.has(v)) return v;
  } catch {
    // localStorage unavailable; fall through
  }
  return null;
}

function readAccentCache() {
  try {
    const v = globalThis.localStorage?.getItem(ACCENT_STORAGE_KEY);
    if (v && VALID_ACCENTS.has(v)) return v;
  } catch {
    // localStorage unavailable; fall through
  }
  return null;
}

function applyTheme(theme) {
  try {
    const root = globalThis.document?.documentElement;
    if (!root) return;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  } catch {
    // SSR / no document; ignore
  }
}

function applyAccent(accent) {
  try {
    const root = globalThis.document?.documentElement;
    if (!root) return;
    root.setAttribute('data-accent', accent);
  } catch {
    // SSR / no document; ignore
  }
}

let currentTheme = readCache() ?? DEFAULT_THEME;
let currentAccent = readAccentCache() ?? DEFAULT_ACCENT;

const listeners = new Set();

export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Apply once at module load so the class is on <html> before React mounts.
// This prevents a light-flash when reloading in dark mode.
applyTheme(currentTheme);
applyAccent(currentAccent);

export function getTheme() {
  return currentTheme;
}

export function setTheme(theme) {
  if (!VALID.has(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }
  currentTheme = theme;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  applyTheme(theme);
  listeners.forEach((l) => l());
}

export function getAccent() {
  return currentAccent;
}

export function setAccent(accent) {
  if (!VALID_ACCENTS.has(accent)) {
    throw new Error(`Invalid accent: ${accent}`);
  }
  currentAccent = accent;
  try {
    globalThis.localStorage?.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    // ignore
  }
  applyAccent(accent);
  listeners.forEach((l) => l());
}
