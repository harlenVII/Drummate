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
//
// Text safety: steps 600 and darker are contrast-checked (WCAG AA, 4.5:1) as
// foreground text on white — see tests/colorSchemes.test.js. Step 500 and
// lighter are NOT text-safe on white (green/500 is as low as 2.54:1) and must
// only be used for fills, borders, rings, and gradients — never `text-*`.

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
