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
