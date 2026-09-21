import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cwd } from 'node:process';
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

  it('is text-safe (AA, 4.5:1) at step 600 on white for every scheme, but NOT at step 500', () => {
    // Executable contract for the ramp: step 600 and darker may be used as
    // foreground text (`text-accent-600`) on a white surface. Step 500 and
    // lighter are for fills/borders/rings/gradients only — they read as too
    // light for text and must never be used as `text-*`. This guards against
    // a repeat of the light/500 foreground-text bug (blue 3.68:1, orange
    // 3.56:1, green 2.54:1 — none of which clear even AA-large 3:1 for green).
    for (const accent of ACCENTS) {
      const ramp = ACCENT_PALETTES[accent].light;
      expect(contrast(ramp[600], WHITE), `${accent} light/600 on white`).toBeGreaterThanOrEqual(AA);
      expect(contrast(ramp[500], WHITE), `${accent} light/500 on white`).toBeLessThan(AA);
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

describe('index.css token blocks', () => {
  // Note: using cwd() fallback for compatibility with different test environments
  let cssPath;
  try {
    cssPath = fileURLToPath(new URL('../src/index.css', import.meta.url));
  } catch {
    cssPath = `${cwd()}/src/index.css`;
  }
  const css = readFileSync(cssPath, 'utf8');

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

  it('drives the LIGHT-mode date picker selected day from accent tokens too', () => {
    // Regression guard: the datepicker overrides originally only existed
    // under `.dark`, so a light-mode selection kept react-datepicker's own
    // vendor blue (#216ba5) instead of following the chosen scheme. Split the
    // datepicker rules into what comes before vs. after the `.dark
    // .react-datepicker {` block, and require the LIGHT half to already
    // define a token-driven, unscoped (non-`.dark`) selected-day rule.
    const datepickerCss = css.slice(css.indexOf('.react-datepicker-popper'));
    const darkBlockStart = datepickerCss.indexOf('.dark .react-datepicker {');
    expect(darkBlockStart).toBeGreaterThan(-1);
    const lightBlock = datepickerCss.slice(0, darkBlockStart);

    // Must be unscoped (not gated behind `.dark`) and reference the token.
    expect(lightBlock).toMatch(
      /(?<!\.dark\s)\.react-datepicker__day--selected,\s*\n\.react-datepicker__day--keyboard-selected\s*\{\s*background-color:\s*var\(--color-accent-600\)/,
    );
    expect(lightBlock).toMatch(/var\(--color-accent-700\)/); // hover
    expect(lightBlock).toMatch(
      /\.react-datepicker__day--today\s*\{[^}]*var\(--color-accent-600\)/,
    );
  });
});
