# Color Schemes Design

**Date:** 2026-09-20
**Status:** Approved for planning

## Problem

The app has exactly one accent color, and it is welded to the light/dark
mode. Light mode is blue, dark mode is indigo, expressed as ~340 hardcoded
Tailwind utilities across 33 files. The dominant form is a matched pair:

```jsx
className="bg-blue-600 dark:bg-indigo-600 hover:bg-blue-700 dark:hover:bg-indigo-700"
```

There is no concept of an accent color independent of the mode, so adding an
orange or a green scheme is not a matter of adding values — there is nowhere
to put them.

## Goals

- Users can pick a color scheme (blue / orange / green) independently of
  light/dark mode, giving six combinations.
- The default blue scheme is pixel-identical to today. No existing user sees
  a visual change until they opt in.
- Every brand-colored surface follows the scheme: buttons, tabs, focus rings,
  links, the header avatar, metronome beat indicators, report heatmaps, and
  the date picker.
- Status colors (red = error, green = success, amber = warning) never change.
- Adding a fourth scheme later is one CSS block, not another 33-file sweep.

## Non-goals

- Changing the light/dark system itself. The `dark` class on `<html>` and the
  `L` / `D` shortcuts stay exactly as they are.
- User-defined or custom-hex accents. Three curated schemes only.
- Keyboard shortcuts for scheme switching. The letters are crowded and the
  scheme is a set-once preference.
- Re-theming status colors per scheme.

## Approach

A CSS custom property ramp, defined in Tailwind v4's `@theme` and overridden
per scheme and per mode.

Components stop naming hues. They use a role:

```jsx
// before
className="bg-blue-600 dark:bg-indigo-600 hover:bg-blue-700 dark:hover:bg-indigo-700"
// after
className="bg-accent-600 hover:bg-accent-700"
```

The dark-mode variant disappears because the dark ramp already resolves to the
correct value. ~160 matched pairs collapse into ~160 single utilities, so the
migration makes the codebase smaller rather than larger.

### Rejected alternatives

**Per-scheme Tailwind variants** (`accent-orange:bg-orange-600`). Every
accented element would carry six utilities instead of one, and a fourth scheme
means touching all 33 files again.

**JS palette with inline styles.** Violates the Tailwind-only rule in
CLAUDE.md. The one place JS genuinely must produce a color is the heatmap,
handled below by reading the resolved tokens.

## The palettes

Each scheme defines a ten-step ramp per mode. `accent-600` is the primary
interactive color — the one that carries white text on buttons and serves as
link text on white.

**These are not Tailwind ramp aliases.** The steps are calibrated so that
`accent-600` clears WCAG AA (4.5:1) against white in both modes. Tailwind's
own `orange-600` (3.56:1) and `emerald-600` (3.77:1) fail that bar, so in the
warm and green schemes the `accent-600` role holds Tailwind's *700*-step hex.
`accent-600` is a role, not a reference to any vendor step.

### blue — default, unchanged from today

| Step | Light (Tailwind blue) | Dark (Tailwind indigo) |
|------|------|------|
| 50  | `#eff6ff` | `#eef2ff` |
| 100 | `#dbeafe` | `#e0e7ff` |
| 200 | `#bfdbfe` | `#c7d2fe` |
| 300 | `#93c5fd` | `#a5b4fc` |
| 400 | `#60a5fa` | `#818cf8` |
| 500 | `#3b82f6` | `#6366f1` |
| 600 | `#2563eb` | `#4f46e5` |
| 700 | `#1d4ed8` | `#4338ca` |
| 800 | `#1e40af` | `#3730a3` |
| 900 | `#1e3a8a` | `#312e81` |

### orange

| Step | Light (orange-based) | Dark (amber-based) |
|------|------|------|
| 50  | `#fff7ed` | `#fffbeb` |
| 100 | `#ffedd5` | `#fef3c7` |
| 200 | `#fed7aa` | `#fde68a` |
| 300 | `#fdba74` | `#fcd34d` |
| 400 | `#fb923c` | `#fbbf24` |
| 500 | `#ea580c` | `#f59e0b` |
| 600 | `#c2410c` | `#b45309` |
| 700 | `#9a3412` | `#92400e` |
| 800 | `#7c2d12` | `#78350f` |
| 900 | `#431407` | `#451a03` |

### green

| Step | Light (emerald-based) | Dark (teal-based) |
|------|------|------|
| 50  | `#ecfdf5` | `#f0fdfa` |
| 100 | `#d1fae5` | `#ccfbf1` |
| 200 | `#a7f3d0` | `#99f6e4` |
| 300 | `#6ee7b7` | `#5eead4` |
| 400 | `#34d399` | `#2dd4bf` |
| 500 | `#10b981` | `#14b8a6` |
| 600 | `#047857` | `#0f766e` |
| 700 | `#065f46` | `#115e59` |
| 800 | `#064e3b` | `#134e4a` |
| 900 | `#022c22` | `#042f2e` |

### Verified contrast

Every scheme/mode combination was checked against the surfaces the app
actually uses (white cards in light mode, `slate-800` and `slate-900` in dark).
All pass WCAG AA, and every ramp is monotonically darkening from 50 to 900.

| Scheme / mode | white on 600 | white on 700 | link text |
|---|---|---|---|
| blue / light   | 5.17 | 6.70 | 5.17 |
| blue / dark    | 6.29 | 7.90 | 4.90 |
| orange / light | 5.18 | 7.31 | 5.18 |
| orange / dark  | 5.02 | 7.09 | 8.76 |
| green / light  | 5.48 | 7.68 | 5.48 |
| green / dark   | 5.47 | 7.58 | 7.86 |

Link text is `accent-600` on white in light mode, `accent-400` on `slate-800`
in dark mode.

### Known trade-off: orange sits near red and amber

Deep orange is hue-adjacent to both the error red and the warning amber. In
the orange scheme the primary color is 17° from `red-600` and 15° from
`amber-600`. Every orange dark enough to carry white text has this problem;
moving toward amber to clear red only tightens the collision with the warning
color. `#c2410c` is the balanced choice, and it is visibly browner and darker
than `red-600`.

This is accepted rather than solved. Implementation must include a visual
check of the screens where an accent button sits next to a destructive red
button or a warning banner — the delete confirmations, the trash UI, and the
offline banner.

## Components

### 1. Token layer — `src/index.css`

An `@theme` block declares the `--color-accent-*` ramp, seeded with the blue
light values. Override blocks then redefine the whole ramp:

```css
@theme {
  --color-accent-50: #eff6ff;
  /* … through 900, blue/light as the seed */
}

html[data-accent="orange"]        { /* orange light ramp */ }
html[data-accent="green"]         { /* green light ramp  */ }

html.dark                         { /* indigo ramp */ }
html.dark[data-accent="orange"]   { /* amber ramp  */ }
html.dark[data-accent="green"]    { /* teal ramp   */ }
```

Both the `dark` class and the `data-accent` attribute live on the same
`<html>` element, so the combined selectors are compound, not descendant.
Each block redefines the full ramp; ordering gives the dark blocks the last
word, and equal specificity between the scheme-only and scheme-plus-dark
blocks is broken by source order. The requirement is that mode and scheme
compose without either clobbering the other, and that an unconfigured
document — no attribute, no class — resolves to blue/light.

The date picker overrides at the bottom of `index.css` currently hardcode
indigo hexes. They become `var(--color-accent-*)` references.

### 2. `src/services/themeService.js` — second axis

Gains an accent axis alongside the existing theme axis, mirroring its shape
exactly:

- `getAccent()` / `setAccent(accent)`, validated against `blue | orange | green`
- persisted to `localStorage['drummate_accent']`, default `'blue'`
- applied as `data-accent` on `<html>` at module load, before React mounts —
  the same pre-paint discipline the `dark` class already follows, so there is
  no flash of the wrong scheme on reload
- `setAccent` notifies the existing listener set, so subscribers re-render

Invalid or absent stored values fall back to `'blue'`. `setTheme` and the
`L`/`D` shortcuts are untouched.

A `useAccent()` hook joins `useIsDarkMode()` in `src/hooks/`, built on the
same `useSyncExternalStore` pattern, for the JS consumers that need the
current scheme.

### 3. JS color consumers — `src/utils/heatmap.js`

`intensityColor(seconds, buckets, isDark)` hardcodes indigo and blue hexes.
It becomes palette-driven: the resolved accent steps are passed in rather than
baked in, keeping the function pure and directly testable.

The resolved values come from a small helper that reads the computed
`--color-accent-*` custom properties off `<html>`. That helper is the single
place where CSS tokens cross into JS; it must tolerate a non-browser
environment (tests, SSR) by returning the blue defaults.

Beat indicators in the metronome are Tailwind classes, not JS colors, so they
migrate with the component sweep.

### 4. Component migration — 33 files

Mechanical, in three shapes:

| Before | After |
|---|---|
| `bg-blue-600 dark:bg-indigo-600` | `bg-accent-600` |
| `hover:bg-blue-700 dark:hover:bg-indigo-700` | `hover:bg-accent-700` |
| `bg-blue-600 dark:bg-indigo-400` (irregular) | `bg-accent-600 dark:bg-accent-400` |

~160 of the pairs are same-step hue swaps and collapse cleanly. Roughly a
dozen are irregular — the light and dark sides name different steps — and keep
an explicit `dark:` variant, which still works because the dark ramp is fully
defined.

Utilities that name a hue but have no dark counterpart need a judgment call
per site: today they render identically in both modes, and after migration
they will shift with the mode. That is almost always the intended fix, but it
is a behavior change and each one is reviewed rather than swept.

Status colors — red, green, amber, rose, yellow — are left alone everywhere.

### 5. Settings and i18n

A scheme picker sits directly below the existing theme toggle in
`SettingsPanel.jsx`, using the same `ToggleGroup` component and the same
`t()`-driven label pattern as the theme control. New keys are added to both
`src/locales/en.json` and `src/locales/zh.json`.

The control shows the three schemes; showing a color swatch alongside each
label is preferred over a text-only toggle, since the choice is visual.

## Data flow

```
localStorage['drummate_accent']
    ↓ (module load, before React mounts)
themeService.applyAccent() → <html data-accent="orange">
    ↓ (CSS cascade)
--color-accent-* resolve to the orange ramp
    ↓
bg-accent-600 / text-accent-600 / ring-accent-500 … across all components
    ↓ (getComputedStyle, for JS-only consumers)
heatmap palette
```

Mode flows through the identical path via the `dark` class. The two are
independent: the CSS override blocks are keyed on the combination, so neither
axis needs to know about the other at runtime.

## Error handling

- Unreadable or disabled `localStorage` — already wrapped in try/catch in
  `themeService`; the accent axis follows the same pattern and falls back to
  `'blue'`.
- An unrecognized stored accent value (a downgrade after a future fourth
  scheme, or hand-edited storage) resolves to `'blue'` rather than leaving the
  document unstyled.
- `getComputedStyle` unavailable — the heatmap palette helper returns the blue
  defaults, so reports render rather than throwing.

## Testing

- **themeService** — accent get/set round-trip, persistence, `data-attribute`
  application, rejection of invalid values, independence from the theme axis
  (setting one must not disturb the other).
- **useAccent** — subscription fires on change, mirroring the existing
  `useIsDarkMode` test.
- **heatmap** — updated for the palette-driven signature; assert bucket
  boundaries still map to the right step, independent of which scheme is
  active.
- **Contrast regression** — the ramp tables and their WCAG ratios are checked
  by a test, so a future palette edit that drops a step below 4.5:1 fails CI
  rather than shipping.

## Manual verification

Per the project's no-browser-automation rule, implementation ends with a
numbered manual checklist covering: each of the six combinations across all
four tabs; the pre-paint check (reload in each scheme, confirm no flash of
blue); the date picker in a modal; the report heatmaps; the metronome beat
indicators; and the red-adjacency check called out above.

## Risks

| Risk | Mitigation |
|---|---|
| A missed utility leaves a blue element in an orange app | Grep for residual `(blue\|indigo)-` in `src/` as a completion gate; the count should reach zero outside the token definitions |
| Orange reads as an error or warning color | Documented trade-off; explicit visual review of red- and amber-adjacent screens |
| An unpaired utility silently changes dark-mode appearance | Reviewed per site rather than swept |
| Tailwind v4 does not emit an unused `@theme` variable | The ramp is referenced by generated utilities; if any step proves absent, `@theme static` forces emission |
