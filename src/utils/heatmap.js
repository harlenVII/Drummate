// Heatmap intensity helpers shared by MonthlyReport and YearlyReport.

// p25/p50/p75 thresholds over the positive durations in `values`. Filters out
// zeros and sorts internally so callers can pass raw per-day duration arrays.
// Matches the prior inline `getPercentile`: index = floor(len * p).
export function computePercentiles(values) {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  const at = (p) => (sorted.length > 0 ? sorted[Math.floor(sorted.length * p)] : 0);
  return { p25: at(0.25), p50: at(0.5), p75: at(0.75) };
}

// Cell fill color for a duration (seconds), bucketed by thresholds, theme-aware.
export function intensityColor(seconds, { p25, p50, p75 }, isDark) {
  if (seconds === 0) return isDark ? '#334155' : '#e2e8f0'; // slate-700 / slate-200
  if (seconds <= p25) return isDark ? '#a5b4fc' : '#bfdbfe'; // indigo-300 / blue-200
  if (seconds <= p50) return isDark ? '#6366f1' : '#60a5fa'; // indigo-500 / blue-400
  if (seconds <= p75) return isDark ? '#4338ca' : '#2563eb'; // indigo-700 / blue-600
  return isDark ? '#3730a3' : '#1e3a8a'; // indigo-800 / blue-900
}
