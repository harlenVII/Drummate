// Heatmap intensity helpers shared by MonthlyReport and YearlyReport.

// p25/p50/p75 thresholds over the positive durations in `values`. Filters out
// zeros and sorts internally so callers can pass raw per-day duration arrays.
// Matches the prior inline `getPercentile`: index = floor(len * p).
export function computePercentiles(values) {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  const at = (p) => (sorted.length > 0 ? sorted[Math.floor(sorted.length * p)] : 0);
  return { p25: at(0.25), p50: at(0.5), p75: at(0.75) };
}

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
