# Color Schemes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick an accent color scheme (blue / orange / green) independently of light/dark mode, giving six combinations.

**Architecture:** A `--color-accent-50…900` CSS custom property ramp is declared in Tailwind v4's `@theme` and redefined by compound selectors on `<html>` (`html.dark[data-accent="orange"]`). Components stop naming hues and use `bg-accent-600`; because the dark ramp already resolves correctly, the ~160 matched `X-blue-N dark:X-indigo-N` pairs collapse to single `X-accent-N` utilities. A parallel accent axis in `themeService` writes `data-attribute` before React mounts, exactly as the existing `dark` class does.

**Tech Stack:** React 19, Vite 7, Tailwind v4 (`@theme`, CSS custom properties), Vitest, `@testing-library/react`.

**Spec:** [docs/superpowers/specs/2026-09-20-color-schemes-design.md](../specs/2026-09-20-color-schemes-design.md)

## Global Constraints

- **Tailwind v4 only.** No CSS modules. No inline styles, except where JS must compute a color for an SVG `fill`/`stroke` attribute — that is pre-existing and stays.
- **The blue scheme must stay pixel-identical to today.** Every blue-scheme hex in this plan is copied from the current code. If a step's value would change, that is a bug, not an improvement.
- **Status colors never change.** `red`, `green`, `emerald`, `amber`, `yellow`, `rose` utilities are out of scope everywhere. Only `blue`, `indigo`, `purple`, `violet` migrate.
- **Accent values:** `blue | orange | green`, default `blue`, persisted at `localStorage['drummate_accent']`.
- **`accent-600` is a role, not a Tailwind reference.** In the orange and green schemes it holds Tailwind's *700*-step hex, because `orange-600` (3.56:1) and `emerald-600` (3.77:1) fail WCAG AA against white text.
- **Pre-paint discipline.** `data-accent` must be on `<html>` before React mounts, like the `dark` class. Never gate it behind React state.
- **All user-facing text goes through `t()`**, with keys added to both `src/locales/en.json` and `src/locales/zh.json`.
- **No browser automation.** Verification is a numbered manual checklist (Task 12).
- **Commit style:** `feat:` / `fix:` / `refactor:` / `docs:`, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

**Create:**
| File | Responsibility |
|---|---|
| `src/constants/accentPalettes.js` | The six ramps as data. Single source of truth for JS; cross-checked against `index.css` by test. |
| `src/utils/accentPalette.js` | Resolves the live `--color-accent-*` values off `<html>`; falls back to blue in non-browser environments. The only place CSS tokens cross into JS. |
| `src/hooks/useAccent.js` | Reactive current accent, mirroring `useIsDarkMode`. |
| `tests/colorSchemes.test.js` | Contrast + ordering assertions, and a CSS↔JS drift check. |
| `tests/themeService.test.js` | Theme + accent axis behavior (none exists today). |
| `tests/useAccent.test.jsx` | Hook subscription. |
| `tests/accentPalette.test.js` | Resolver fallback + parsing. |

**Modify:**
| File | Change |
|---|---|
| `src/index.css` | `@theme` ramp, six override blocks, datepicker hexes → `var()` |
| `src/services/themeService.js` | accent axis alongside theme axis |
| `src/hooks/useUiPreferences.js` | expose `accent` / `setAccent` |
| `src/App.jsx` | pass accent through to SettingsPanel |
| `src/components/SettingsPanel.jsx` | scheme picker row |
| `src/locales/en.json`, `src/locales/zh.json` | picker labels |
| `src/utils/heatmap.js` | palette-driven; add `intensityTextColor` |
| `src/components/MonthlyReport.jsx` | drop the hex-keyed `BG_TEXT` map |
| `src/components/YearlyReport.jsx`, `TrendLineChart.jsx`, `BpmDial.jsx` | JS accent hexes → resolved palette |
| 30 component files | utility sweep (Tasks 7–11) |

---

## Task 1: Palette constants and the contrast gate `[model: claude-haiku-4-5]`

The ramps land first, with the accessibility assertions that justify them. Everything downstream reads from here.

**Files:**
- Create: `src/constants/accentPalettes.js`
- Test: `tests/colorSchemes.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `ACCENTS` (`['blue','orange','green']`), `DEFAULT_ACCENT` (`'blue'`), `ACCENT_STEPS` (`[50,100,…,900]`), `ACCENT_PALETTES` — a `{ [accent]: { light: {step:hex}, dark: {step:hex} } }` map.

- [ ] **Step 1: Write the failing test**

Create `tests/colorSchemes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ACCENTS, ACCENT_STEPS, ACCENT_PALETTES, DEFAULT_ACCENT } from '../src/constants/accentPalettes';

// --- WCAG helpers (relative luminance per WCAG 2.1) ---
const toRgb = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
};
const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const WHITE = '#ffffff';
const SLATE_800 = '#1e293b'; // dark-mode card surface
const SLATE_900 = '#0f172a'; // dark-mode page surface
const AA = 4.5;

describe('accent palettes', () => {
  it('defines a light and dark ramp for every accent', () => {
    expect(ACCENTS).toEqual(['blue', 'orange', 'green']);
    expect(ACCENTS).toContain(DEFAULT_ACCENT);
    for (const accent of ACCENTS) {
      for (const mode of ['light', 'dark']) {
        const ramp = ACCENT_PALETTES[accent][mode];
        expect(Object.keys(ramp).map(Number)).toEqual(ACCENT_STEPS);
        for (const step of ACCENT_STEPS) {
          expect(ramp[step]).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it('keeps the blue scheme identical to the pre-migration palette', () => {
    // These are the exact values the app shipped before color schemes existed.
    expect(ACCENT_PALETTES.blue.light[600]).toBe('#2563eb'); // was bg-blue-600
    expect(ACCENT_PALETTES.blue.light[700]).toBe('#1d4ed8'); // was hover:bg-blue-700
    expect(ACCENT_PALETTES.blue.dark[600]).toBe('#4f46e5');  // was dark:bg-indigo-600
    expect(ACCENT_PALETTES.blue.dark[400]).toBe('#818cf8');  // was dark:text-indigo-400
  });

  it('darkens monotonically from 50 to 900 in every ramp', () => {
    for (const accent of ACCENTS) {
      for (const mode of ['light', 'dark']) {
        const ramp = ACCENT_PALETTES[accent][mode];
        for (let i = 0; i < ACCENT_STEPS.length - 1; i++) {
          const here = luminance(ramp[ACCENT_STEPS[i]]);
          const next = luminance(ramp[ACCENT_STEPS[i + 1]]);
          expect(here, `${accent}/${mode} step ${ACCENT_STEPS[i]}`).toBeGreaterThan(next);
        }
      }
    }
  });

  it('clears WCAG AA for white text on the primary and hover steps', () => {
    for (const accent of ACCENTS) {
      for (const mode of ['light', 'dark']) {
        const ramp = ACCENT_PALETTES[accent][mode];
        expect(contrast(ramp[600], WHITE), `${accent}/${mode} button`).toBeGreaterThanOrEqual(AA);
        expect(contrast(ramp[700], WHITE), `${accent}/${mode} hover`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it('clears WCAG AA for link text on its surface', () => {
    for (const accent of ACCENTS) {
      // light mode: accent-600 text on a white card
      expect(contrast(ACCENT_PALETTES[accent].light[600], WHITE), `${accent} light link`)
        .toBeGreaterThanOrEqual(AA);
      // dark mode: accent-400 text on slate surfaces
      expect(contrast(ACCENT_PALETTES[accent].dark[400], SLATE_800), `${accent} dark link on card`)
        .toBeGreaterThanOrEqual(AA);
      expect(contrast(ACCENT_PALETTES[accent].dark[400], SLATE_900), `${accent} dark link on page`)
        .toBeGreaterThanOrEqual(AA);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/colorSchemes.test.js`
Expected: FAIL — `Failed to resolve import "../src/constants/accentPalettes"`.

- [ ] **Step 3: Write the implementation**

Create `src/constants/accentPalettes.js`:

```js
// Accent color ramps, one pair (light/dark) per scheme.
//
// These are NOT aliases of Tailwind's named ramps. `accent-600` is a role —
// the primary interactive color that carries white text on buttons and serves
// as link text on white. Tailwind's own orange-600 (3.56:1) and emerald-600
// (3.77:1) fail WCAG AA against white, so the warm and green schemes shift the
// 600 role onto Tailwind's 700-step hex. tests/colorSchemes.test.js enforces
// this; do not "correct" these back to the vendor steps.
//
// The blue ramps reproduce the pre-migration palette exactly (Tailwind blue in
// light, indigo in dark), so existing users see no change until they opt in.

export const ACCENTS = ['blue', 'orange', 'green'];
export const DEFAULT_ACCENT = 'blue';
export const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const ramp = (...hexes) =>
  Object.fromEntries(ACCENT_STEPS.map((step, i) => [step, hexes[i]]));

export const ACCENT_PALETTES = {
  blue: {
    // Tailwind blue 50-900, unshifted.
    light: ramp('#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa',
                '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'),
    // Tailwind indigo 50-900, unshifted.
    dark:  ramp('#eef2ff', '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8',
                '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81'),
  },
  orange: {
    // Tailwind orange, shifted one step darker from 500 up.
    light: ramp('#fff7ed', '#ffedd5', '#fed7aa', '#fdba74', '#fb923c',
                '#ea580c', '#c2410c', '#9a3412', '#7c2d12', '#431407'),
    // Tailwind amber, likewise. Mirrors how the blue scheme shifts hue in dark.
    dark:  ramp('#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24',
                '#f59e0b', '#b45309', '#92400e', '#78350f', '#451a03'),
  },
  green: {
    // Tailwind emerald, shifted one step darker from 600 up.
    light: ramp('#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399',
                '#10b981', '#047857', '#065f46', '#064e3b', '#022c22'),
    // Tailwind teal. Chosen over emerald for dark mode because it sits 33deg
    // from the success green, versus emerald's 21deg.
    dark:  ramp('#f0fdfa', '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf',
                '#14b8a6', '#0f766e', '#115e59', '#134e4a', '#042f2e'),
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/colorSchemes.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/constants/accentPalettes.js tests/colorSchemes.test.js
git commit -m "feat(theme): add contrast-verified accent color ramps

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: CSS token layer `[model: claude-haiku-4-5]`

**Files:**
- Modify: `src/index.css`
- Test: `tests/colorSchemes.test.js` (append a drift check)

**Interfaces:**
- Consumes: `ACCENT_PALETTES`, `ACCENTS`, `ACCENT_STEPS` from Task 1.
- Produces: the `--color-accent-50…900` custom properties, and therefore the `bg-accent-*` / `text-accent-*` / `border-accent-*` / `ring-accent-*` / `from-accent-*` / `to-accent-*` / `shadow-accent-*` utilities used by every later task.

**Cascade note — read before writing the CSS.** Both the `dark` class and the `data-accent` attribute live on the same `<html>` element, so the combined selectors are *compound* (`html.dark[data-accent="orange"]`), not descendant. `html.dark` and `html[data-accent="orange"]` have equal specificity (0,1,1), so source order decides between them — the dark blocks must come after the light ones, and the compound blocks (0,2,1) come last and win outright. An unconfigured document (no class, no attribute) must resolve to blue/light.

- [ ] **Step 1: Write the failing drift test**

Append to `tests/colorSchemes.test.js`. **Move the two new `import` lines up to
join the existing imports at the top of the file** — ESM hoists them anyway, but
leaving them mid-file trips `import/first` in lint.

```js
// --- these two go at the TOP of the file, with the existing imports ---
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// --- this block goes at the bottom ---
describe('index.css token blocks', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../src/index.css', import.meta.url)),
    'utf8',
  );

  // Pulls every `--color-accent-N: #hex;` declaration out of the block that
  // starts at `selector`, so the stylesheet can be compared to the JS tables.
  const rampFor = (selector) => {
    const start = css.indexOf(selector);
    if (start === -1) throw new Error(`no CSS block for selector: ${selector}`);
    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);
    const body = css.slice(open, close);
    const found = {};
    for (const m of body.matchAll(/--color-accent-(\d+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
      found[Number(m[1])] = m[2].toLowerCase();
    }
    return found;
  };

  const selectors = {
    'blue/light': '@theme',
    'orange/light': 'html[data-accent="orange"]',
    'green/light': 'html[data-accent="green"]',
    'blue/dark': 'html.dark {',
    'orange/dark': 'html.dark[data-accent="orange"]',
    'green/dark': 'html.dark[data-accent="green"]',
  };

  for (const [label, selector] of Object.entries(selectors)) {
    it(`${label} matches accentPalettes.js`, () => {
      const [accent, mode] = label.split('/');
      expect(rampFor(selector)).toEqual(ACCENT_PALETTES[accent][mode]);
    });
  }

  it('declares the blue light ramp as the @theme default', () => {
    // An unconfigured document must resolve to blue/light.
    expect(rampFor('@theme')[600]).toBe('#2563eb');
  });

  it('orders dark blocks after light blocks so equal specificity resolves correctly', () => {
    expect(css.indexOf('html.dark {')).toBeGreaterThan(css.indexOf('html[data-accent="green"]'));
    expect(css.indexOf('html.dark[data-accent="orange"]')).toBeGreaterThan(css.indexOf('html.dark {'));
  });

  it('drives the date picker from accent tokens rather than hardcoded indigo', () => {
    // Scope to the datepicker rules only. The indigo hexes legitimately appear
    // earlier in the file as the blue scheme's dark ramp, so asserting against
    // the whole stylesheet would fail.
    const datepickerCss = css.slice(css.indexOf('.react-datepicker-popper'));
    expect(datepickerCss).not.toMatch(/#4f46e5|#4338ca|#818cf8/);
    expect(datepickerCss).toMatch(
      /react-datepicker__day--selected[\s\S]{0,200}var\(--color-accent-600\)/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/colorSchemes.test.js`
Expected: FAIL — `no CSS block for selector: html[data-accent="orange"]`.

- [ ] **Step 3: Add the token blocks to `src/index.css`**

Insert immediately after the existing `@custom-variant dark (...)` line, before the `html, body` rule:

```css
/* ---------------------------------------------------------------------------
 * Accent color schemes.
 *
 * `accent-600` is the primary interactive role: it carries white text on
 * buttons and serves as link text on white. It is NOT Tailwind's 600 step in
 * every scheme — see src/constants/accentPalettes.js for why.
 *
 * Both `dark` and `data-accent` sit on <html>, so the combined selectors are
 * compound, not descendant. `html.dark` and `html[data-accent="…"]` tie at
 * specificity (0,1,1), so ORDER MATTERS: light blocks first, then dark, then
 * the compound blocks which win outright at (0,2,1). Do not reorder.
 *
 * tests/colorSchemes.test.js checks these against the JS tables. Edit both.
 * ------------------------------------------------------------------------- */

@theme {
  /* blue / light — also the fallback for an unconfigured document */
  --color-accent-50:  #eff6ff;
  --color-accent-100: #dbeafe;
  --color-accent-200: #bfdbfe;
  --color-accent-300: #93c5fd;
  --color-accent-400: #60a5fa;
  --color-accent-500: #3b82f6;
  --color-accent-600: #2563eb;
  --color-accent-700: #1d4ed8;
  --color-accent-800: #1e40af;
  --color-accent-900: #1e3a8a;
}

html[data-accent="orange"] {
  --color-accent-50:  #fff7ed;
  --color-accent-100: #ffedd5;
  --color-accent-200: #fed7aa;
  --color-accent-300: #fdba74;
  --color-accent-400: #fb923c;
  --color-accent-500: #ea580c;
  --color-accent-600: #c2410c;
  --color-accent-700: #9a3412;
  --color-accent-800: #7c2d12;
  --color-accent-900: #431407;
}

html[data-accent="green"] {
  --color-accent-50:  #ecfdf5;
  --color-accent-100: #d1fae5;
  --color-accent-200: #a7f3d0;
  --color-accent-300: #6ee7b7;
  --color-accent-400: #34d399;
  --color-accent-500: #10b981;
  --color-accent-600: #047857;
  --color-accent-700: #065f46;
  --color-accent-800: #064e3b;
  --color-accent-900: #022c22;
}

/* blue / dark — matches an absent data-accent, so it is the dark default */
html.dark {
  --color-accent-50:  #eef2ff;
  --color-accent-100: #e0e7ff;
  --color-accent-200: #c7d2fe;
  --color-accent-300: #a5b4fc;
  --color-accent-400: #818cf8;
  --color-accent-500: #6366f1;
  --color-accent-600: #4f46e5;
  --color-accent-700: #4338ca;
  --color-accent-800: #3730a3;
  --color-accent-900: #312e81;
}

html.dark[data-accent="orange"] {
  --color-accent-50:  #fffbeb;
  --color-accent-100: #fef3c7;
  --color-accent-200: #fde68a;
  --color-accent-300: #fcd34d;
  --color-accent-400: #fbbf24;
  --color-accent-500: #f59e0b;
  --color-accent-600: #b45309;
  --color-accent-700: #92400e;
  --color-accent-800: #78350f;
  --color-accent-900: #451a03;
}

html.dark[data-accent="green"] {
  --color-accent-50:  #f0fdfa;
  --color-accent-100: #ccfbf1;
  --color-accent-200: #99f6e4;
  --color-accent-300: #5eead4;
  --color-accent-400: #2dd4bf;
  --color-accent-500: #14b8a6;
  --color-accent-600: #0f766e;
  --color-accent-700: #115e59;
  --color-accent-800: #134e4a;
  --color-accent-900: #042f2e;
}
```

- [ ] **Step 4: Repoint the date picker overrides**

In the same file, replace the three hardcoded indigo hexes in the `.dark .react-datepicker*` rules:

```css
.dark .react-datepicker__day--selected,
.dark .react-datepicker__day--keyboard-selected {
  background-color: var(--color-accent-600);
  color: #ffffff;
}

.dark .react-datepicker__day--selected:hover,
.dark .react-datepicker__day--keyboard-selected:hover {
  background-color: var(--color-accent-700);
}

.dark .react-datepicker__day--today {
  color: var(--color-accent-400);
  font-weight: bold;
}
```

Leave the slate greys alone — they are surface colors, not accent.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/colorSchemes.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 6: Verify the utilities actually generate**

Run: `npm run build`
Expected: succeeds. Then confirm Tailwind emitted the class:

```bash
grep -rl "accent-600" dist/assets/*.css
```

Expected: at least one match once a component uses it. **At this point nothing uses `bg-accent-600` yet, so an empty result here is correct** — re-run this check at the end of Task 7. If it is still empty then, the `@theme` variable is being tree-shaken; switch `@theme` to `@theme static`.

- [ ] **Step 7: Commit**

```bash
git add src/index.css tests/colorSchemes.test.js
git commit -m "feat(theme): add accent CSS token layer with per-scheme overrides

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The accent axis in themeService `[model: claude-sonnet-5]`

**Files:**
- Modify: `src/services/themeService.js`
- Test: `tests/themeService.test.js` (create — no test exists today)

**Interfaces:**
- Consumes: `ACCENTS`, `DEFAULT_ACCENT` from Task 1.
- Produces: `getAccent(): 'blue'|'orange'|'green'`, `setAccent(accent): void` (throws on invalid), and the existing `subscribeTheme(listener)` now also firing on accent changes.

- [ ] **Step 1: Write the failing test**

Create `tests/themeService.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getTheme, setTheme, getAccent, setAccent, subscribeTheme,
} from '../src/services/themeService';

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  setTheme('light');
  setAccent('blue');
});

afterEach(() => {
  setTheme('light');
  setAccent('blue');
});

describe('themeService accent axis', () => {
  it('defaults to blue', () => {
    expect(getAccent()).toBe('blue');
  });

  it('applies the accent as a data attribute on <html>', () => {
    setAccent('orange');
    expect(root().getAttribute('data-accent')).toBe('orange');
    setAccent('green');
    expect(root().getAttribute('data-accent')).toBe('green');
  });

  it('persists the accent to localStorage', () => {
    setAccent('green');
    expect(localStorage.getItem('drummate_accent')).toBe('green');
  });

  it('rejects an unknown accent', () => {
    expect(() => setAccent('chartreuse')).toThrow(/invalid accent/i);
    expect(getAccent()).toBe('blue');
  });

  it('notifies subscribers on accent change', () => {
    let calls = 0;
    const unsub = subscribeTheme(() => { calls += 1; });
    setAccent('orange');
    expect(calls).toBe(1);
    unsub();
    setAccent('green');
    expect(calls).toBe(1);
  });

  it('keeps the two axes independent', () => {
    setAccent('orange');
    setTheme('dark');
    expect(getAccent()).toBe('orange');
    expect(getTheme()).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(root().getAttribute('data-accent')).toBe('orange');

    setTheme('light');
    expect(getAccent()).toBe('orange');
    expect(root().getAttribute('data-accent')).toBe('orange');

    setAccent('blue');
    expect(getTheme()).toBe('light');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/themeService.test.js`
Expected: FAIL — `getAccent is not a function`.

- [ ] **Step 3: Implement the accent axis**

In `src/services/themeService.js`, add the import at the top:

```js
import { ACCENTS, DEFAULT_ACCENT } from '../constants/accentPalettes';
```

Add this alongside the existing theme constants (`STORAGE_KEY`, `DEFAULT_THEME`, `VALID`):

```js
const ACCENT_STORAGE_KEY = 'drummate_accent';
const VALID_ACCENTS = new Set(ACCENTS);

function readAccentCache() {
  try {
    const v = globalThis.localStorage?.getItem(ACCENT_STORAGE_KEY);
    if (v && VALID_ACCENTS.has(v)) return v;
  } catch {
    // localStorage unavailable; fall through
  }
  return null;
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
```

After the existing `let currentTheme = ...` line, add:

```js
let currentAccent = readAccentCache() ?? DEFAULT_ACCENT;
```

Next to the existing module-load `applyTheme(currentTheme)` call, add — the same
pre-paint discipline, so there is no flash of the wrong scheme on reload:

```js
applyAccent(currentAccent);
```

Then export the pair, mirroring `getTheme` / `setTheme` exactly:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/themeService.test.js tests/useIsDarkMode.test.jsx`
Expected: PASS. The existing `useIsDarkMode` suite must still pass untouched — it shares the listener set.

- [ ] **Step 5: Commit**

```bash
git add src/services/themeService.js tests/themeService.test.js
git commit -m "feat(theme): add accent axis to themeService

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The `useAccent` hook `[model: claude-haiku-4-5]`

**Files:**
- Create: `src/hooks/useAccent.js`
- Test: `tests/useAccent.test.jsx`

**Interfaces:**
- Consumes: `getAccent`, `subscribeTheme` from Task 3.
- Produces: `useAccent(): 'blue'|'orange'|'green'`.

- [ ] **Step 1: Write the failing test**

Create `tests/useAccent.test.jsx`:

```jsx
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccent } from '../src/hooks/useAccent';
import { setAccent } from '../src/services/themeService';

afterEach(() => {
  act(() => setAccent('blue'));
});

describe('useAccent', () => {
  it('reflects the current accent on mount', () => {
    act(() => setAccent('orange'));
    const { result } = renderHook(() => useAccent());
    expect(result.current).toBe('orange');
  });

  it('re-renders when the accent changes after mount', () => {
    act(() => setAccent('blue'));
    const { result } = renderHook(() => useAccent());
    expect(result.current).toBe('blue');
    act(() => setAccent('green'));
    expect(result.current).toBe('green');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/useAccent.test.jsx`
Expected: FAIL — cannot resolve `../src/hooks/useAccent`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/useAccent.js`:

```js
import { useSyncExternalStore } from 'react';
import { subscribeTheme, getAccent } from '../services/themeService';
import { DEFAULT_ACCENT } from '../constants/accentPalettes';

// Reactive current accent scheme. Companion to useIsDarkMode — the two axes
// share themeService's listener set, so either one changing re-renders both.
export function useAccent() {
  return useSyncExternalStore(
    subscribeTheme,
    getAccent,
    () => DEFAULT_ACCENT,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/useAccent.test.jsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAccent.js tests/useAccent.test.jsx
git commit -m "feat(theme): add useAccent hook

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The accent palette resolver `[model: claude-haiku-4-5]`

The single place where CSS tokens cross back into JS, for the SVG and canvas colors that cannot be expressed as Tailwind classes.

**Files:**
- Create: `src/utils/accentPalette.js`
- Test: `tests/accentPalette.test.js`

**Interfaces:**
- Consumes: `ACCENT_PALETTES`, `ACCENT_STEPS`, `DEFAULT_ACCENT` from Task 1.
- Produces:
  - `resolveAccentRamp(accent, isDark): { 50: '#hex', …, 900: '#hex' }`
  - `buildHeatmapPalette(ramp, isDark): { empty, l1, l2, l3, l4, emptyText, l1Text, l2Text, l3Text, l4Text }`

Note `resolveAccentRamp` reads from the JS tables rather than `getComputedStyle`. The tables and the stylesheet are held in lockstep by the Task 2 drift test, and reading from JS keeps these functions pure, synchronous, and testable in jsdom without a real stylesheet. The `accent`/`isDark` arguments come from `useAccent()` and `useIsDarkMode()` at the call site.

- [ ] **Step 1: Write the failing test**

Create `tests/accentPalette.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveAccentRamp, buildHeatmapPalette } from '../src/utils/accentPalette';
import { ACCENT_PALETTES } from '../src/constants/accentPalettes';

describe('resolveAccentRamp', () => {
  it('returns the light ramp for the requested accent', () => {
    expect(resolveAccentRamp('orange', false)).toEqual(ACCENT_PALETTES.orange.light);
  });

  it('returns the dark ramp when isDark', () => {
    expect(resolveAccentRamp('green', true)).toEqual(ACCENT_PALETTES.green.dark);
  });

  it('falls back to blue for an unknown accent', () => {
    expect(resolveAccentRamp('chartreuse', false)).toEqual(ACCENT_PALETTES.blue.light);
    expect(resolveAccentRamp(undefined, true)).toEqual(ACCENT_PALETTES.blue.dark);
  });
});

describe('buildHeatmapPalette', () => {
  it('reproduces the pre-migration blue heatmap exactly', () => {
    const light = buildHeatmapPalette(ACCENT_PALETTES.blue.light, false);
    expect(light.empty).toBe('#e2e8f0');
    expect(light.l1).toBe('#bfdbfe');
    expect(light.l2).toBe('#60a5fa');
    expect(light.l3).toBe('#2563eb');
    expect(light.l4).toBe('#1e3a8a');

    const dark = buildHeatmapPalette(ACCENT_PALETTES.blue.dark, true);
    expect(dark.empty).toBe('#334155');
    expect(dark.l1).toBe('#a5b4fc');
    expect(dark.l2).toBe('#6366f1');
    expect(dark.l3).toBe('#4338ca');
    expect(dark.l4).toBe('#3730a3');
  });

  it('reproduces the pre-migration text colors exactly', () => {
    const light = buildHeatmapPalette(ACCENT_PALETTES.blue.light, false);
    expect(light.emptyText).toBe('#94a3b8');
    expect(light.l1Text).toBe('#1e3a8a');
    expect(light.l2Text).toBe('#ffffff');
    expect(light.l3Text).toBe('#ffffff');
    expect(light.l4Text).toBe('#ffffff');

    const dark = buildHeatmapPalette(ACCENT_PALETTES.blue.dark, true);
    expect(dark.l1Text).toBe('#312e81');
  });

  it('tracks the scheme for non-blue accents', () => {
    const orange = buildHeatmapPalette(ACCENT_PALETTES.orange.light, false);
    expect(orange.l3).toBe(ACCENT_PALETTES.orange.light[600]);
    expect(orange.l1Text).toBe(ACCENT_PALETTES.orange.light[900]);
    // surface greys are not accent-derived
    expect(orange.empty).toBe('#e2e8f0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/accentPalette.test.js`
Expected: FAIL — cannot resolve `../src/utils/accentPalette`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/accentPalette.js`:

```js
import { ACCENT_PALETTES, DEFAULT_ACCENT } from '../constants/accentPalettes';

// Resolved accent ramp for a scheme + mode. Pure: callers pass the values they
// already hold from useAccent() / useIsDarkMode(). Unknown accents fall back to
// blue rather than returning undefined, so a stale localStorage value from a
// future version renders a working UI instead of a blank chart.
export function resolveAccentRamp(accent, isDark) {
  const scheme = ACCENT_PALETTES[accent] ?? ACCENT_PALETTES[DEFAULT_ACCENT];
  return isDark ? scheme.dark : scheme.light;
}

// Surface greys used by the heatmap for empty days. Not accent-derived: an
// unpracticed day should read as absence, not as a faint version of the accent.
const EMPTY_LIGHT = '#e2e8f0'; // slate-200
const EMPTY_DARK = '#334155';  // slate-700
const EMPTY_TEXT = '#94a3b8';  // slate-400

// Five heatmap intensity levels plus the text color that sits on each.
//
// The step choices reproduce the pre-migration blue heatmap exactly: light mode
// used blue 200/400/600/900, dark mode indigo 300/500/700/800. Text is the
// accent-900 on the lightest fill and white above it.
//
// Known nit, carried over deliberately: white on `l2` is a weak contrast ratio
// (it was ~2.6:1 for blue before this change, and is lower still for orange).
// Raising it would alter the blue scheme, which this feature promises not to
// do. Revisit as its own change if the manual check finds it unreadable.
export function buildHeatmapPalette(ramp, isDark) {
  const steps = isDark ? [300, 500, 700, 800] : [200, 400, 600, 900];
  const [s1, s2, s3, s4] = steps;
  return {
    empty: isDark ? EMPTY_DARK : EMPTY_LIGHT,
    l1: ramp[s1],
    l2: ramp[s2],
    l3: ramp[s3],
    l4: ramp[s4],
    emptyText: EMPTY_TEXT,
    l1Text: ramp[900],
    l2Text: '#ffffff',
    l3Text: '#ffffff',
    l4Text: '#ffffff',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/accentPalette.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/accentPalette.js tests/accentPalette.test.js
git commit -m "feat(theme): add accent palette resolver and heatmap palette builder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Make the heatmap palette-driven `[model: claude-haiku-4-5]`

**Files:**
- Modify: `src/utils/heatmap.js`
- Test: `tests/heatmap.test.js` (rewrite the `intensityColor` block)

**Interfaces:**
- Consumes: `buildHeatmapPalette` output shape from Task 5.
- Produces:
  - `intensityColor(seconds, buckets, palette): string` — **signature change**, third argument is now a palette object, not `isDark`
  - `intensityTextColor(seconds, buckets, palette): string` — new
  - `computePercentiles` unchanged

Why `intensityTextColor` exists: `MonthlyReport.jsx:52-54` currently holds a `BG_TEXT` map keyed by the literal hex strings `intensityColor` returns. Once those hexes become scheme-dependent, every key in that map silently stops matching and the day numbers lose their contrast treatment. Bucketing the text color the same way the fill is bucketed removes the coupling entirely.

- [ ] **Step 1: Rewrite the failing test**

In `tests/heatmap.test.js`, leave the `computePercentiles` block untouched and replace the entire `describe('intensityColor', …)` block with:

```js
import { buildHeatmapPalette } from '../src/utils/accentPalette';
import { ACCENT_PALETTES } from '../src/constants/accentPalettes';
// add to the existing import from '../src/utils/heatmap':
//   computePercentiles, intensityColor, intensityTextColor

describe('intensityColor', () => {
  const buckets = { p25: 20, p50: 30, p75: 40 };
  const light = buildHeatmapPalette(ACCENT_PALETTES.blue.light, false);
  const dark = buildHeatmapPalette(ACCENT_PALETTES.blue.dark, true);

  it('returns the empty-cell color for zero', () => {
    expect(intensityColor(0, buckets, light)).toBe('#e2e8f0');
    expect(intensityColor(0, buckets, dark)).toBe('#334155');
  });

  it('buckets by percentile (light) exactly as before the migration', () => {
    expect(intensityColor(20, buckets, light)).toBe('#bfdbfe');
    expect(intensityColor(30, buckets, light)).toBe('#60a5fa');
    expect(intensityColor(40, buckets, light)).toBe('#2563eb');
    expect(intensityColor(99, buckets, light)).toBe('#1e3a8a');
  });

  it('buckets by percentile (dark) exactly as before the migration', () => {
    expect(intensityColor(20, buckets, dark)).toBe('#a5b4fc');
    expect(intensityColor(99, buckets, dark)).toBe('#3730a3');
  });

  it('follows the active scheme', () => {
    const orange = buildHeatmapPalette(ACCENT_PALETTES.orange.light, false);
    expect(intensityColor(99, buckets, orange)).toBe(ACCENT_PALETTES.orange.light[900]);
  });
});

describe('intensityTextColor', () => {
  const buckets = { p25: 20, p50: 30, p75: 40 };
  const light = buildHeatmapPalette(ACCENT_PALETTES.blue.light, false);
  const dark = buildHeatmapPalette(ACCENT_PALETTES.blue.dark, true);

  it('reproduces the old BG_TEXT lookup for light mode', () => {
    expect(intensityTextColor(0, buckets, light)).toBe('#94a3b8');
    expect(intensityTextColor(20, buckets, light)).toBe('#1e3a8a');
    expect(intensityTextColor(30, buckets, light)).toBe('#ffffff');
    expect(intensityTextColor(40, buckets, light)).toBe('#ffffff');
    expect(intensityTextColor(99, buckets, light)).toBe('#ffffff');
  });

  it('reproduces the old BG_TEXT lookup for dark mode', () => {
    expect(intensityTextColor(0, buckets, dark)).toBe('#94a3b8');
    expect(intensityTextColor(20, buckets, dark)).toBe('#312e81');
    expect(intensityTextColor(99, buckets, dark)).toBe('#ffffff');
  });

  it('buckets on the same boundaries as intensityColor', () => {
    for (const s of [0, 1, 20, 21, 30, 31, 40, 41, 99]) {
      const fill = intensityColor(s, buckets, light);
      const text = intensityTextColor(s, buckets, light);
      const level = [light.empty, light.l1, light.l2, light.l3, light.l4].indexOf(fill);
      const textLevel = [light.emptyText, light.l1Text, light.l2Text, light.l3Text, light.l4Text]
        .indexOf(text);
      expect(textLevel).toBe(level);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/heatmap.test.js`
Expected: FAIL — `intensityTextColor is not a function`, plus failures in `intensityColor` where a palette object is passed where a boolean was expected.

- [ ] **Step 3: Rewrite `src/utils/heatmap.js`**

Keep `computePercentiles` exactly as it is. Replace `intensityColor` and add its text sibling:

```js
// Which of the five intensity levels a duration falls into. Shared by the fill
// and text helpers so the two can never bucket differently.
function level(seconds, { p25, p50, p75 }) {
  if (seconds === 0) return 0;
  if (seconds <= p25) return 1;
  if (seconds <= p50) return 2;
  if (seconds <= p75) return 3;
  return 4;
}

// Cell fill for a duration (seconds). `palette` comes from buildHeatmapPalette
// in utils/accentPalette, so the heatmap follows the active color scheme.
export function intensityColor(seconds, buckets, palette) {
  return [palette.empty, palette.l1, palette.l2, palette.l3, palette.l4][
    level(seconds, buckets)
  ];
}

// Text color that sits on that fill. This replaces a hex-keyed lookup map in
// MonthlyReport, which silently broke once fills became scheme-dependent.
export function intensityTextColor(seconds, buckets, palette) {
  return [palette.emptyText, palette.l1Text, palette.l2Text, palette.l3Text, palette.l4Text][
    level(seconds, buckets)
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/heatmap.test.js`
Expected: PASS. Both call sites still fail to build — that is Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/utils/heatmap.js tests/heatmap.test.js
git commit -m "refactor(reports): make heatmap colors palette-driven

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Wire the JS color call sites `[model: claude-sonnet-5]`

Four components compute colors in JS rather than through Tailwind classes. They must read the active scheme.

**Files:**
- Modify: `src/components/MonthlyReport.jsx` (lines ~50–54, ~179)
- Modify: `src/components/YearlyReport.jsx` (lines ~49, ~229–230)
- Modify: `src/components/TrendLineChart.jsx` (lines ~19–23)
- Modify: `src/components/BpmDial.jsx` (line ~67)

**Interfaces:**
- Consumes: `useAccent` (Task 4), `resolveAccentRamp` / `buildHeatmapPalette` (Task 5), `intensityColor` / `intensityTextColor` (Task 6).
- Produces: nothing new.

- [ ] **Step 1: Update `MonthlyReport.jsx`**

Add to the imports:

```jsx
import { useAccent } from '../hooks/useAccent';
import { resolveAccentRamp, buildHeatmapPalette } from '../utils/accentPalette';
import { computePercentiles, intensityColor, intensityTextColor } from '../utils/heatmap';
```

Just after the existing `const isDarkMode = useIsDarkMode();`, add:

```jsx
  const accent = useAccent();
  const heatPalette = buildHeatmapPalette(resolveAccentRamp(accent, isDarkMode), isDarkMode);
```

Delete the whole `BG_TEXT` constant (the `const BG_TEXT = isDarkMode ? {...} : {...}` block at lines ~52–54). It was a hex-keyed lookup into `intensityColor`'s return value and cannot survive scheme-dependent hexes.

At the cell render (~line 179), replace the fill lookup and every `BG_TEXT[bg]` read:

```jsx
            const bg = intensityColor(seconds, { p25, p50, p75 }, heatPalette);
            const fg = intensityTextColor(seconds, { p25, p50, p75 }, heatPalette);
```

Then use `fg` wherever `BG_TEXT[bg]` appeared.

- [ ] **Step 2: Update `YearlyReport.jsx`**

Add the same three imports and the same two lines after `const isDarkMode = useIsDarkMode();`. At line ~229 replace the fill:

```jsx
                fill={intensityColor(seconds, { p25, p50, p75 }, heatPalette)}
```

At line ~230, the "today" ring reads `isDarkMode ? '#6366f1' : '#3b82f6'` — that is accent-500 in both modes:

```jsx
                stroke={isToday ? ramp[500] : 'none'}
```

which requires keeping the ramp around:

```jsx
  const accent = useAccent();
  const ramp = resolveAccentRamp(accent, isDarkMode);
  const heatPalette = buildHeatmapPalette(ramp, isDarkMode);
```

Leave the `#9ca3af` axis labels alone — grey, not accent.

- [ ] **Step 3: Update `TrendLineChart.jsx`**

Replace the two accent constants. `'#6366f1' / '#3b82f6'` is accent-500, and `'#a5b4fc' / '#93c5fd'` is accent-300:

```jsx
import { useAccent } from '../hooks/useAccent';
import { resolveAccentRamp } from '../utils/accentPalette';

export default function TrendLineChart({ title, points, timeUnit, compactMode = false }) {
  const isDarkMode = useIsDarkMode();
  const accent = useAccent();
  if (!points || points.length === 0) return null;

  const ramp = resolveAccentRamp(accent, isDarkMode);
  const accentColor = ramp[500];
  const accentLight = ramp[300];
  const futureDot = isDarkMode ? '#334155' : '#e5e7eb';
```

Rename the existing `accent` / `accentLight` usages in the JSX below to `accentColor` / `accentLight`. **Watch for the name collision** — the new `useAccent()` result is also called `accent`, which is why the color is renamed to `accentColor`.

- [ ] **Step 4: Update `BpmDial.jsx`**

`'#4f46e5' / '#2563eb'` is accent-600:

```jsx
import { useAccent } from '../hooks/useAccent';
import { resolveAccentRamp } from '../utils/accentPalette';

// inside the component, next to the existing useIsDarkMode() call:
  const accent = useAccent();
  const accentColor = resolveAccentRamp(accent, isDarkMode)[600];
```

Replace the `accentColor` assignment that read the ternary.

- [ ] **Step 5: Verify the build and the suite**

Run: `npm run build && npm run test`
Expected: build succeeds, all tests pass.

- [ ] **Step 6: Confirm Tailwind emits the accent utilities**

This is the deferred check from Task 2 Step 6. Nothing uses `bg-accent-*` yet, so add a throwaway probe to confirm generation:

```bash
grep -c "color-accent-600" dist/assets/*.css
```

Expected: at least 1 — the custom property declarations from `@theme` and the override blocks are present in the built CSS. If the count is 0, the `@theme` block is being tree-shaken; change `@theme` to `@theme static` in `src/index.css` and rebuild.

- [ ] **Step 7: Commit**

```bash
git add src/components/MonthlyReport.jsx src/components/YearlyReport.jsx \
        src/components/TrendLineChart.jsx src/components/BpmDial.jsx
git commit -m "feat(reports): drive chart and heatmap colors from the active scheme

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: The scheme picker `[model: claude-sonnet-5]`

**Files:**
- Modify: `src/hooks/useUiPreferences.js`
- Modify: `src/App.jsx` (lines ~46, ~314)
- Modify: `src/components/SettingsPanel.jsx` (props at ~112, theme row at ~303)
- Modify: `src/locales/en.json`, `src/locales/zh.json`
- Test: `tests/useUiPreferences.test.js` (extend)

**Interfaces:**
- Consumes: `getAccent` / `setAccent` (Task 3), `ACCENTS` (Task 1).
- Produces: `useUiPreferences()` now returns `accent` and `setAccent` alongside `theme` / `setTheme`.

- [ ] **Step 1: Write the failing test**

Append to `tests/useUiPreferences.test.js`:

```js
import { renderHook, act } from '@testing-library/react';
import { useUiPreferences } from '../src/hooks/useUiPreferences';

describe('useUiPreferences accent', () => {
  it('defaults to blue and round-trips a change', () => {
    localStorage.clear();
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.accent).toBe('blue');
    act(() => result.current.setAccent('orange'));
    expect(result.current.accent).toBe('orange');
    expect(localStorage.getItem('drummate_accent')).toBe('orange');
  });

  it('does not disturb the theme axis', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => result.current.setTheme('dark'));
    act(() => result.current.setAccent('green'));
    expect(result.current.theme).toBe('dark');
    expect(result.current.accent).toBe('green');
  });
});
```

If `tests/useUiPreferences.test.js` has no `import { describe, it, expect }` line yet, add one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/useUiPreferences.test.js`
Expected: FAIL — `result.current.accent` is `undefined`.

- [ ] **Step 3: Extend `useUiPreferences.js`**

Update the themeService import and add the accent state, mirroring the theme axis exactly:

```js
import {
  getTheme, setTheme as setThemeService,
  getAccent, setAccent as setAccentService,
} from '../services/themeService';
```

Next to `const [theme, setThemeState] = useState(getTheme);`:

```js
  const [accent, setAccentState] = useState(getAccent);
```

Next to the existing `setTheme` callback:

```js
  const setAccent = useCallback((next) => {
    setAccentService(next);
    setAccentState(next);
  }, []);
```

And in the returned object, next to `theme, setTheme,`:

```js
    accent, setAccent,
```

Note persistence lives in `themeService`, not in a `useEffect` here — same as theme.

- [ ] **Step 4: Add the translation keys**

In `src/locales/en.json`, next to the existing `theme` keys:

```json
  "colorScheme": "Color",
  "colorSchemeBlue": "Blue",
  "colorSchemeOrange": "Orange",
  "colorSchemeGreen": "Green",
```

In `src/locales/zh.json`, at the matching position:

```json
  "colorScheme": "配色",
  "colorSchemeBlue": "蓝色",
  "colorSchemeOrange": "橙色",
  "colorSchemeGreen": "绿色",
```

- [ ] **Step 5: Thread the prop through `App.jsx`**

At the `useUiPreferences()` destructure (~line 46), add `accent, setAccent,` next to `theme, setTheme,`. At the `<SettingsPanel>` call (~line 314), add next to `theme={theme}` and `onThemeChange={setTheme}`:

```jsx
        accent={accent}
        onAccentChange={setAccent}
```

- [ ] **Step 6: Add the picker row in `SettingsPanel.jsx`**

Add `accent,` and `onAccentChange,` to the destructured props, next to `theme,` and `onThemeChange,`.

Then insert a new `Row` directly after the existing theme `Row`. The swatch makes the choice legible without relying on the label, since the control is itself about color:

```jsx
          <Row
            label={t('colorScheme')}
            control={
              <PillGroup
                options={[
                  { value: 'blue', label: t('colorSchemeBlue'), swatch: '#2563eb' },
                  { value: 'orange', label: t('colorSchemeOrange'), swatch: '#c2410c' },
                  { value: 'green', label: t('colorSchemeGreen'), swatch: '#047857' },
                ]}
                value={accent}
                onSelect={(v) => onAccentChange(v)}
              />
            }
          />
```

The swatches are the light-mode `accent-600` of each scheme, so the control previews the choice rather than describing it. They are intentionally literal hexes, not tokens — every pill must show its own scheme's color, not the active one.

Extend `PillGroup` (line ~67) to render an optional swatch. The existing callers pass no `swatch`, so they are unaffected:

```jsx
function PillGroup({ options, value, onSelect }) {
  return (
    <div className="flex bg-gray-200 dark:bg-slate-700 rounded-lg p-1 gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => value !== opt.value && onSelect(opt.value)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            value === opt.value
              ? 'bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 shadow-sm'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          {opt.swatch && (
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10"
              style={{ backgroundColor: opt.swatch }}
            />
          )}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

The `style` attribute is the one sanctioned exception to the Tailwind-only rule: the swatch color is per-option data, and Tailwind cannot generate a class from a runtime value.

- [ ] **Step 7: Run the tests and build**

Run: `npm run test && npm run build && npm run lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useUiPreferences.js src/App.jsx src/components/SettingsPanel.jsx \
        src/locales/en.json src/locales/zh.json tests/useUiPreferences.test.js
git commit -m "feat(settings): add color scheme picker

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tasks 9–11: The utility sweep

Three tasks, same procedure, different files. **Read this preamble before starting any of them.**

### The transformation

| Before | After | Why |
|---|---|---|
| `bg-blue-600 dark:bg-indigo-600` | `bg-accent-600` | dark ramp already resolves to indigo |
| `hover:bg-blue-700 dark:hover:bg-indigo-700` | `hover:bg-accent-700` | same |
| `text-blue-600 dark:text-indigo-600` | `text-accent-600` | same |
| `ring-blue-500 dark:ring-indigo-500` | `ring-accent-500` | same |
| `bg-blue-50 dark:bg-indigo-50` | `bg-accent-50` | same |

Applies to every prefix (`bg`, `text`, `border`, `ring`, `from`, `to`, `via`, `shadow`) and every variant (`hover:`, `focus:`, `active:`, `group-hover:`, `disabled:`).

### The six irregular pairs — keep an explicit `dark:` variant

These name *different steps* on each side, so collapsing them would change the appearance. They are the complete list across the codebase:

| File | Before | After |
|---|---|---|
| `SettingsPanel.jsx:467` | `text-blue-600 dark:text-indigo-400` | `text-accent-600 dark:text-accent-400` |
| `GoalCard.jsx:94` | `text-blue-600 dark:text-indigo-400` | `text-accent-600 dark:text-accent-400` |
| `ReportGeneratorModal.jsx:158` | `text-blue-600 dark:text-indigo-400` | `text-accent-600 dark:text-accent-400` |
| `VisitorSignUpModal.jsx:46` | `bg-blue-50 dark:bg-indigo-900/30` | `bg-accent-50 dark:bg-accent-900/30` |
| `VisitorSignUpModal.jsx:46` | `border-blue-200 dark:border-indigo-700` | `border-accent-200 dark:border-accent-700` |
| `VisitorSignUpModal.jsx:46` | `text-blue-700 dark:text-indigo-200` | `text-accent-700 dark:text-accent-200` |

The `/30` opacity modifier works on `var()`-backed colors in Tailwind v4 via `color-mix`.

### Unpaired utilities — judgment required, do not sweep blindly

A utility that names a hue with **no `dark:` counterpart** renders identically in both modes today. After migration it will shift with the mode. That is almost always the intended fix, but it *is* a behavior change.

For each one, decide and note which:
- **Intended** → migrate to `accent-*` (the common case: the element sits on a surface that already flips, and staying blue in dark mode was an oversight).
- **Deliberate** → the color is fixed on purpose, e.g. text on a permanently-colored surface. Keep it pinned by writing the explicit pair `text-accent-600 dark:text-accent-600`, with a one-line comment saying why.

### The completion gate for each task

```bash
grep -nE "(blue|indigo|purple|violet)-[0-9]{2,3}" <the files in this task>
```
Expected: no output.

### Per-task step template

Each of Tasks 9, 10 and 11 runs these five steps against its own file list.

- [ ] **Step 1:** Apply the transformation to every file in the task's list, handling irregular and unpaired cases per the rules above.
- [ ] **Step 2:** Run the gate — `grep -nE "(blue|indigo|purple|violet)-[0-9]{2,3}" <files>` — expected: no output.
- [ ] **Step 3:** Run `npm run build && npm run lint` — expected: both succeed.
- [ ] **Step 4:** Run `npm run test` — expected: all pass. `practicePage`, `practiceEditModal`, `reportItemCard`, `reportItemBreakdown`, `reportNavHeader` and `trendLineChart` render real components; a broken className surfaces here.
- [ ] **Step 5:** Commit with the message given in the task.

---

## Task 9: Sweep — metronome `[model: claude-sonnet-5]`

**Files:** `src/components/SequencerPage.jsx` (35 tokens), `src/components/MultiMeterPage.jsx` (33), `src/components/Metronome.jsx` (14), `src/components/BeatIndicator.jsx` (4).

Highest-density files in the codebase. `BeatIndicator` colors the active beat; check that the accent still reads clearly against the inactive state in all six combinations during manual verification.

- [ ] **Step 0: Read the sweep rules.** Open the **"Tasks 9–11: The utility sweep"** section of this plan file and follow it. It holds the transformation table, the complete list of six irregular pairs, the unpaired-utility judgment rule, and the five-step procedure below. Do not start without it.

Run the five steps from the preamble, then:

```bash
git add src/components/SequencerPage.jsx src/components/MultiMeterPage.jsx \
        src/components/Metronome.jsx src/components/BeatIndicator.jsx
git commit -m "refactor(metronome): migrate to accent color tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Sweep — practice and reports `[model: claude-sonnet-5]`

**Files:** `src/components/PracticeItemList.jsx` (26), `PracticeRunView.jsx` (13), `PracticePage.jsx` (10), `PracticeEditModal.jsx` (10), `EditTimeModal.jsx` (6), `MergeTargetPicker.jsx` (6), `ReportGeneratorModal.jsx` (20), `DailyReport.jsx` (19), `GoalSetupModal.jsx` (12), `GoalCard.jsx` (6), `StatsReport.jsx` (4), `GoalsPage.jsx` (4), `ReportItemCard.jsx` (2), `GoalBanner.jsx` (2).

Contains two of the six irregular pairs (`ReportGeneratorModal.jsx:158`, `GoalCard.jsx:94`). `PracticeItemList` holds the trash UI, where accent buttons sit beside destructive red — flag anything that looks ambiguous for the Task 12 check.

- [ ] **Step 0: Read the sweep rules.** Open the **"Tasks 9–11: The utility sweep"** section of this plan file and follow it. It holds the transformation table, the complete list of six irregular pairs, the unpaired-utility judgment rule, and the five-step procedure below. Do not start without it.

Run the five steps from the preamble, then:

```bash
git add src/components/PracticeItemList.jsx src/components/PracticeRunView.jsx \
        src/components/PracticePage.jsx src/components/PracticeEditModal.jsx \
        src/components/EditTimeModal.jsx src/components/MergeTargetPicker.jsx \
        src/components/ReportGeneratorModal.jsx src/components/DailyReport.jsx \
        src/components/GoalSetupModal.jsx src/components/GoalCard.jsx \
        src/components/StatsReport.jsx src/components/GoalsPage.jsx \
        src/components/ReportItemCard.jsx src/components/GoalBanner.jsx
git commit -m "refactor(practice,reports): migrate to accent color tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11: Sweep — shell, auth, notes and modals `[model: claude-sonnet-5]`

**Files:** `src/components/SettingsPanel.jsx` (22), `EncouragementModal.jsx` (22), `VisitorSignUpModal.jsx` (16), `AuthScreen.jsx` (16), `NotesPage.jsx` (4), `NotesByDate.jsx` (4), `NoteEditModal.jsx` (4), `FloatingVoiceIndicator.jsx` (4), `FloatingPracticeWidget.jsx` (4), `ErrorBoundary.jsx` (4), `EncouragementButton.jsx` (4), `AppHeader.jsx` (4), `TabBar.jsx` (2), `src/App.jsx` (2).

**Must run after Task 8**, since the scheme picker adds markup to `SettingsPanel.jsx`. Contains the other four irregular pairs (`SettingsPanel.jsx:467`, and `VisitorSignUpModal.jsx:46` ×3).

- [ ] **Step 0: Read the sweep rules.** Open the **"Tasks 9–11: The utility sweep"** section of this plan file and follow it. It holds the transformation table, the complete list of six irregular pairs, the unpaired-utility judgment rule, and the five-step procedure below. Do not start without it.

Three specific notes:

- `SettingsPanel.jsx` also has `Toggle`'s `tone` prop: `const onBg = tone === 'amber' ? 'bg-amber-500' : 'bg-blue-600 dark:bg-indigo-600';` → the second branch becomes `'bg-accent-600'`. Leave the `amber` branch alone; it is a status tone.
- `ErrorBoundary.jsx` is intentionally English-only because a crash may break the `LanguageProvider`. Migrate its colors, but do **not** add `t()` calls.
- The three literal swatch hexes added in Task 8 are per-option data, not accent tokens. The gate regex does not match bare hexes, so they pass untouched — leave them.

Run the five steps from the preamble, then:

```bash
git add src/components/SettingsPanel.jsx src/components/EncouragementModal.jsx \
        src/components/VisitorSignUpModal.jsx src/components/AuthScreen.jsx \
        src/components/NotesPage.jsx src/components/NotesByDate.jsx \
        src/components/NoteEditModal.jsx src/components/FloatingVoiceIndicator.jsx \
        src/components/FloatingPracticeWidget.jsx src/components/ErrorBoundary.jsx \
        src/components/EncouragementButton.jsx src/components/AppHeader.jsx \
        src/components/TabBar.jsx src/App.jsx
git commit -m "refactor(shell,notes): migrate to accent color tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 12: Final verification and documentation `[model: claude-sonnet-5]`

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Run the global completion gate**

```bash
grep -rnE "(blue|indigo|purple|violet)-[0-9]{2,3}" src/
```

Expected: **no output.** Any hit is a missed utility. (The accent hexes in `src/constants/accentPalettes.js` and `src/index.css` are bare hex literals and do not match this pattern.)

- [ ] **Step 2: Full verification**

Run: `npm run build && npm run lint && npm run test`
Expected: all three succeed. Record the test count.

- [ ] **Step 3: Update `CLAUDE.md`**

Add `drummate_accent` to the localStorage preferences table:

```markdown
| `drummate_accent` | `'blue'` \| `'orange'` \| `'green'` | `'blue'` | accent color scheme |
```

Add to the **Styling** section:

```markdown
**Accent color tokens:** Components never name a hue. Use `bg-accent-600`,
`text-accent-600`, `ring-accent-500` etc. — the `--color-accent-*` ramp in
[src/index.css](src/index.css) resolves per scheme (`data-accent` on `<html>`)
and per mode (`.dark`), so `dark:` accent variants are almost never needed.
`accent-600` is the primary interactive role and is contrast-guaranteed
against white text; it is NOT Tailwind's 600 step in every scheme. The ramps
live in [src/constants/accentPalettes.js](src/constants/accentPalettes.js) and
are mirrored in `index.css` — **edit both**, `tests/colorSchemes.test.js`
enforces that they match and that every scheme clears WCAG AA.

Status colors (red/green/amber) are deliberately NOT part of the scheme system.
JS-computed colors (SVG fills in charts and heatmaps) go through
`resolveAccentRamp` in [src/utils/accentPalette.js](src/utils/accentPalette.js).
```

Add to **Gotchas → Boot / setup**:

```markdown
- `themeService` applies BOTH the `dark` class and the `data-accent` attribute
  at module load, before React mounts. Do not gate either behind React state —
  that reintroduces a flash of the wrong scheme on reload.
```

- [ ] **Step 4: Update `README.md`**

Add color schemes to the feature list, next to the existing dark-mode entry.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document accent color scheme tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand the user this manual checklist**

Per the project's no-browser-automation rule, verification is manual. Present exactly this:

1. `npm run dev`, open http://localhost:5173.
2. **Default is unchanged.** With fresh storage, confirm the app looks exactly as it did before — blue in light mode, indigo in dark. Nothing should look new.
3. Open Settings. Confirm a **Color** row sits below **Theme**, with three pills each showing a colored dot.
4. Select **Orange**. Confirm buttons, the header avatar, tab highlights and focus rings all turn orange **immediately**, with no reload.
5. Toggle light/dark with `L` and `D`. Confirm the scheme stays orange in both, and the two controls do not interfere.
6. **Reload the page.** Confirm orange is still active and there is **no flash of blue** during load. Repeat in dark mode.
7. Repeat steps 4–6 for **Green**.
8. Walk all four tabs (Practice, Metronome, Report, Notes) in each of the six combinations. Look for any element still rendering blue.
9. **Metronome:** start playback and confirm the beat indicators use the scheme and that the active beat is clearly distinguishable from inactive ones.
10. **Reports:** open Monthly and Yearly. Confirm the heatmaps follow the scheme, and that day numbers remain readable on every intensity level — particularly the mid-tones.
11. **Report → Stats:** confirm the trend line chart follows the scheme.
12. **Date picker:** open any modal with a date field in dark mode. Confirm the selected day and the today-marker use the scheme.
13. **Red-adjacency check (the documented trade-off).** In the **orange** scheme, open: an item's delete confirmation, the trash view in Practice, and the offline banner (DevTools → Network → Offline, then reload). Confirm the orange primary button is not mistakable for the red destructive button or an amber warning. If it is, say so — the fix is one step darker in the ramp.
14. **Visitor mode:** sign out, choose "Continue as guest", confirm the scheme persists across the auth boundary.
