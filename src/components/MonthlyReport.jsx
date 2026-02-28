import { formatMinutes } from '../utils/formatTime';
import {
  getMonthEnd,
  getMonthStart,
  getWeekStart,
  getDaysInRange,
  shiftDate,
  getTodayString,
} from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function MonthlyReport({ items, monthStart, monthLogs, onMonthChange }) {
  const { t } = useLanguage();
  const monthEnd = getMonthEnd(monthStart);
  const monthDays = getDaysInRange(monthStart, monthEnd);
  const today = getTodayString();

  // Grand total
  let grandTotal = 0;
  for (const log of monthLogs) {
    grandTotal += log.duration;
  }

  // Per-item totals
  const itemTotals = {};
  for (const log of monthLogs) {
    itemTotals[log.itemId] = (itemTotals[log.itemId] || 0) + log.duration;
  }

  // Per-day totals
  const dayTotals = {};
  for (const log of monthLogs) {
    dayTotals[log.date] = (dayTotals[log.date] || 0) + log.duration;
  }

  // Sorted breakdown
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      duration: itemTotals[item.id] || 0,
    }))
    .sort((a, b) => b.duration - a.duration);

  const isCurrentMonth = monthStart >= getMonthStart(today);

  // Month label
  const monthLabel = (() => {
    const date = new Date(monthStart + 'T12:00:00');
    return date.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  })();

  // --- Heatmap ---
  // Compute intensity buckets from active durations
  const activeDurations = monthDays
    .map((d) => dayTotals[d] || 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const getPercentile = (arr, p) =>
    arr.length > 0 ? arr[Math.floor(arr.length * p)] : 0;
  const p25 = getPercentile(activeDurations, 0.25);
  const p50 = getPercentile(activeDurations, 0.5);
  const p75 = getPercentile(activeDurations, 0.75);

  const intensityColor = (seconds) => {
    if (seconds === 0) return '#f3f4f6'; // gray-100
    if (seconds <= p25) return '#bfdbfe'; // blue-200
    if (seconds <= p50) return '#60a5fa'; // blue-400
    if (seconds <= p75) return '#2563eb'; // blue-600
    return '#1e3a8a'; // blue-900
  };

  // Build calendar grid cells
  const firstDayOfWeek = (new Date(monthStart + 'T12:00:00').getDay() + 6) % 7; // 0=Mon
  const cells = [];
  let col = firstDayOfWeek;
  let row = 0;
  for (const day of monthDays) {
    cells.push({ date: day, col, row });
    col++;
    if (col === 7) {
      col = 0;
      row++;
    }
  }

  const CELL = 32;
  const GAP = 4;
  const HEADER_H = 20;
  const gridW = 7 * (CELL + GAP) - GAP;
  const gridH = (row + 1) * (CELL + GAP) - GAP + HEADER_H;

  // --- Trend chart: week-by-week totals ---
  const weekStarts = [];
  let ws = getWeekStart(monthStart);
  // If week starts before month, still include it
  while (ws <= monthEnd) {
    weekStarts.push(ws);
    ws = shiftDate(ws, 7);
  }

  const weekTotals = weekStarts.map((wStart) => {
    const wEnd = shiftDate(wStart, 6);
    return monthDays
      .filter((d) => d >= wStart && d <= wEnd)
      .reduce((sum, d) => sum + (dayTotals[d] || 0), 0);
  });

  const maxWeek = Math.max(...weekTotals, 1);
  const TREND_W = 280;
  const TREND_H = 60;

  const trendPoints = weekTotals.map((v, i) => ({
    x:
      weekTotals.length === 1
        ? TREND_W / 2
        : (i / (weekTotals.length - 1)) * TREND_W,
    y: TREND_H - (v / maxWeek) * (TREND_H - 10) - 5,
  }));

  const polylineStr = trendPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // Navigation helpers
  const handlePrevMonth = () => {
    const prevLastDay = shiftDate(monthStart, -1);
    onMonthChange(getMonthStart(prevLastDay));
  };

  const handleNextMonth = () => {
    const nextFirstDay = shiftDate(monthEnd, 1);
    onMonthChange(getMonthStart(nextFirstDay));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
          aria-label="Previous month"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <span className="text-lg font-semibold text-gray-800">{monthLabel}</span>
        <button
          onClick={handleNextMonth}
          disabled={isCurrentMonth}
          className={`p-2 transition-colors ${
            isCurrentMonth
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          aria-label="Next month"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Grand total card */}
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <p className="text-sm text-gray-500 font-medium">
          {t('analytics.totalThisMonth')}
        </p>
        <p className="text-3xl font-mono text-gray-800 mt-1">
          {formatMinutes(grandTotal)} {t('minutes')}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 mt-2">
            {t('analytics.noDataThisMonth')}
          </p>
        )}
      </div>

      {/* Calendar heatmap */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <svg viewBox={`0 0 ${gridW} ${gridH}`} className="w-full">
          {/* Day-of-week headers */}
          {WEEKDAY_KEYS.map((key, i) => (
            <text
              key={key}
              x={i * (CELL + GAP) + CELL / 2}
              y={14}
              textAnchor="middle"
              fontSize="10"
              fill="#9ca3af"
            >
              {t(`analytics.weekdays.${key}`)}
            </text>
          ))}
          {/* Day cells */}
          {cells.map(({ date, col: c, row: r }) => {
            const seconds = dayTotals[date] || 0;
            const isToday = date === today;
            return (
              <rect
                key={date}
                x={c * (CELL + GAP)}
                y={r * (CELL + GAP) + HEADER_H}
                width={CELL}
                height={CELL}
                rx={4}
                fill={intensityColor(seconds)}
                stroke={isToday ? '#3b82f6' : 'none'}
                strokeWidth={isToday ? 2 : 0}
              />
            );
          })}
        </svg>
      </div>

      {/* Weekly trend chart */}
      {grandTotal > 0 && weekTotals.length > 1 && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-500 font-medium mb-2">
            {t('analytics.weeklyTrend')}
          </p>
          <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} className="w-full">
            <polyline
              points={polylineStr}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {trendPoints.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={4} fill="#3b82f6" />
                <text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#6b7280"
                >
                  {formatMinutes(weekTotals[i])}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* Per-item breakdown */}
      {breakdown.map((entry) => {
        const percentage =
          grandTotal > 0
            ? Math.round((entry.duration / grandTotal) * 100)
            : 0;
        return (
          <div key={entry.id} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <span
                className={`font-medium ${entry.duration > 0 ? 'text-gray-800' : 'text-gray-400'}`}
              >
                {entry.name}
              </span>
              <div
                className={`text-right ${entry.duration > 0 ? 'text-gray-600' : 'text-gray-400'}`}
              >
                <div>
                  {entry.duration > 0 ? formatMinutes(entry.duration) : 0}{' '}
                  {t('minutes')}
                </div>
                {entry.duration > 0 && (
                  <div className="text-xs text-gray-500">({percentage}%)</div>
                )}
              </div>
            </div>
            {entry.duration > 0 && grandTotal > 0 && (
              <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-blue-500 rounded-full h-1.5"
                  style={{
                    width: `${(entry.duration / grandTotal) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      {items.length === 0 && (
        <p className="text-center text-gray-400 py-8">
          {t('noPracticeItems')}
        </p>
      )}
    </div>
  );
}

export default MonthlyReport;
