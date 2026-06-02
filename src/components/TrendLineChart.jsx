import { formatDuration } from '../utils/formatTime';
import { useIsDarkMode } from '../hooks/useIsDarkMode';

// SVG layout constants (viewBox units, scaled to container width).
const PAD_X = 12; // horizontal padding so edge dots/labels are not clipped
const PAD_TOP = 16; // space above dots for value labels
const PAD_BOTTOM = 18; // space below for x-axis labels
const PLOT_W = 280;
const PLOT_H = 60;

/**
 * Shared trend line chart for the Weekly / Monthly / Yearly reports.
 *
 * points: array of { key, value (seconds), xLabel, highlight?, onClick?, future? }.
 * Every point is rendered (reserving horizontal space), but future points show only a
 * dim baseline placeholder — no value label, not connected by the polyline.
 */
export default function TrendLineChart({ title, points, timeUnit, compactMode = false }) {
  const isDarkMode = useIsDarkMode();
  if (!points || points.length === 0) return null;

  const accent = isDarkMode ? '#6366f1' : '#3b82f6';
  const accentLight = isDarkMode ? '#a5b4fc' : '#93c5fd';
  const futureDot = isDarkMode ? '#334155' : '#e5e7eb';

  const n = points.length;
  // Scale only against non-future values so future placeholders don't affect the y-axis.
  const maxVal = Math.max(...points.filter((p) => !p.future).map((p) => p.value), 1);

  const baseline = PAD_TOP + PLOT_H;
  const coords = points.map((p, i) => ({
    ...p,
    x: n === 1 ? (PLOT_W + PAD_X * 2) / 2 : PAD_X + (i / (n - 1)) * PLOT_W,
    y: p.future ? baseline : baseline - (p.value / maxVal) * PLOT_H,
  }));

  // Polyline only through non-future points so the line doesn't drop to the baseline.
  const polylineStr = coords
    .filter((p) => !p.future)
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
  const viewW = PLOT_W + PAD_X * 2;
  const viewH = PAD_TOP + PLOT_H + PAD_BOTTOM;

  return (
    <div className={`bg-white dark:bg-slate-800 shadow-sm ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
      <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-2">{title}</p>
      <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full">
        {polylineStr && (
          <polyline
            points={polylineStr}
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {coords.map((p, i) => {
          // Anchor end value labels inward so they don't clip at the edges.
          const valueAnchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
          return (
            <g
              key={p.key}
              onClick={p.future ? undefined : p.onClick}
              style={{ cursor: !p.future && p.onClick ? 'pointer' : 'default' }}
            >
              {/* Invisible hit area widens the tap target around the dot. */}
              {!p.future && (
                <rect x={p.x - PAD_X} y={0} width={PAD_X * 2} height={viewH} fill="transparent" />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={p.future ? 3 : p.highlight ? 5 : 4}
                fill={p.future ? futureDot : p.highlight ? accent : accentLight}
              />
              {!p.future && (
                <text x={p.x} y={p.y - 8} textAnchor={valueAnchor} fontSize="9" fill="#6b7280">
                  {formatDuration(p.value, timeUnit)}
                </text>
              )}
              <text
                x={p.x}
                y={PAD_TOP + PLOT_H + 14}
                textAnchor="middle"
                fontSize="9"
                fill={p.future ? futureDot : p.highlight ? accent : '#9ca3af'}
              >
                {p.xLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
