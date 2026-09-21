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
