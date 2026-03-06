import { formatMinutes, formatDuration } from '../utils/formatTime';
import {
  getYearStart,
  getYearEnd,
  getMonthStart,
  getMonthEnd,
  getWeekStart,
  getDaysInRange,
  getTodayString,
} from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function YearlyReport({ items, yearStart, yearLogs, onYearChange, timeUnit }) {
  const { t } = useLanguage();
  const yearEnd = getYearEnd(yearStart);
  const year = yearStart.split('-')[0];
  const today = getTodayString();

  // Grand total
  let grandTotal = 0;
  for (const log of yearLogs) {
    grandTotal += log.duration;
  }

  // Per-item totals
  const itemTotals = {};
  for (const log of yearLogs) {
    itemTotals[log.itemId] = (itemTotals[log.itemId] || 0) + log.duration;
  }

  // Per-day totals
  const dayTotals = {};
  for (const log of yearLogs) {
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

  const isCurrentYear = yearStart >= getYearStart(today);

  // --- GitHub-style heatmap ---
  // Build week columns starting from Jan 1
  const allDays = getDaysInRange(yearStart, yearEnd > today ? today : yearEnd);

  // Compute intensity buckets
  const activeDurations = allDays
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

  // Build grid: columns = weeks, rows = day of week (0=Mon, 6=Sun)
  const CELL = 12;
  const GAP = 2;
  const LABEL_W = 20; // space for day-of-week labels

  const cells = [];
  for (const day of allDays) {
    const date = new Date(day + 'T12:00:00');
    const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon, 6=Sun
    // Week column: how many weeks since Jan 1
    const jan1 = new Date(yearStart + 'T12:00:00');
    const jan1DayOfWeek = (jan1.getDay() + 6) % 7;
    const daysSinceStart = Math.round((date - jan1) / (1000 * 60 * 60 * 24));
    const col = Math.floor((daysSinceStart + jan1DayOfWeek) / 7);
    cells.push({ date: day, col, row: dayOfWeek });
  }

  const maxCol = cells.length > 0 ? Math.max(...cells.map((c) => c.col)) : 0;
  const gridW = LABEL_W + (maxCol + 1) * (CELL + GAP);
  const gridH = 7 * (CELL + GAP) - GAP;

  // Month labels for heatmap
  const monthLabels = [];
  for (let m = 0; m < 12; m++) {
    const monthStr = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    if (monthStr > today) break;
    const monthDate = new Date(monthStr + 'T12:00:00');
    const jan1 = new Date(yearStart + 'T12:00:00');
    const jan1DayOfWeek = (jan1.getDay() + 6) % 7;
    const daysSince = Math.round((monthDate - jan1) / (1000 * 60 * 60 * 24));
    const col = Math.floor((daysSince + jan1DayOfWeek) / 7);
    const shortMonth = monthDate.toLocaleDateString(undefined, { month: 'short' });
    monthLabels.push({ label: shortMonth, x: LABEL_W + col * (CELL + GAP) });
  }

  const MONTH_LABEL_H = 16;
  const heatmapTotalH = MONTH_LABEL_H + gridH;

  // --- Monthly bar chart ---
  const monthTotals = [];
  for (let m = 0; m < 12; m++) {
    const mStart = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const mEnd = getMonthEnd(mStart);
    const days = getDaysInRange(mStart, mEnd > today ? today : mEnd);
    let total = 0;
    for (const d of days) {
      total += dayTotals[d] || 0;
    }
    monthTotals.push(total);
  }

  const maxMonth = Math.max(...monthTotals, 1);
  const BAR_W = 20;
  const BAR_GAP = 4;
  const CHART_H = 80;
  const CHART_PAD_TOP = 18;
  const CHART_PAD_BOTTOM = 18;
  const chartW = 12 * (BAR_W + BAR_GAP) - BAR_GAP;
  const chartTotalH = CHART_PAD_TOP + CHART_H + CHART_PAD_BOTTOM;

  const monthShortLabels = Array.from({ length: 12 }, (_, i) =>
    new Date(2024, i, 1).toLocaleDateString(undefined, { month: 'narrow' })
  );

  // Practice days count
  const practiceDayCount = allDays.filter((d) => (dayTotals[d] || 0) > 0).length;
  const totalDaysInYear = yearEnd > today
    ? getDaysInRange(yearStart, today).length
    : getDaysInRange(yearStart, yearEnd).length;

  // Navigation
  const handlePrevYear = () => {
    const prevYear = String(Number(year) - 1);
    onYearChange(`${prevYear}-01-01`);
  };

  const handleNextYear = () => {
    const nextYear = String(Number(year) + 1);
    onYearChange(`${nextYear}-01-01`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Year navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrevYear}
          className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
          aria-label="Previous year"
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
        <span className="text-lg font-semibold text-gray-800">{year}</span>
        <button
          onClick={handleNextYear}
          disabled={isCurrentYear}
          className={`p-2 transition-colors ${
            isCurrentYear
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          aria-label="Next year"
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
          {t('analytics.totalThisYear')}
        </p>
        <p className="text-3xl font-mono text-gray-800 mt-1">
          {formatDuration(grandTotal, timeUnit)} {t(timeUnit)}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 mt-2">
            {t('analytics.noDataThisYear')}
          </p>
        )}
      </div>

      {/* GitHub-style heatmap */}
      <div className="bg-white rounded-lg shadow-sm p-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${gridW} ${heatmapTotalH}`}
          className="w-full"
          style={{ minWidth: '500px' }}
        >
          {/* Month labels */}
          {monthLabels.map(({ label, x }, i) => (
            <text
              key={i}
              x={x}
              y={10}
              fontSize="8"
              fill="#9ca3af"
            >
              {label}
            </text>
          ))}
          {/* Day-of-week labels */}
          {[1, 3, 5].map((row) => (
            <text
              key={row}
              x={0}
              y={MONTH_LABEL_H + row * (CELL + GAP) + CELL / 2 + 3}
              fontSize="8"
              fill="#9ca3af"
            >
              {t(`analytics.weekdays.${WEEKDAY_KEYS[row]}`)}
            </text>
          ))}
          {/* Day cells */}
          {cells.map(({ date, col, row }) => {
            const seconds = dayTotals[date] || 0;
            const isToday = date === today;
            return (
              <rect
                key={date}
                x={LABEL_W + col * (CELL + GAP)}
                y={MONTH_LABEL_H + row * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                fill={intensityColor(seconds)}
                stroke={isToday ? '#3b82f6' : 'none'}
                strokeWidth={isToday ? 1.5 : 0}
              />
            );
          })}
        </svg>
      </div>

      {/* Practice days count */}
      <div className="bg-white rounded-lg shadow-sm p-4 text-center">
        <p className="text-sm text-gray-500 font-medium">
          {t('analytics.practiceDays')}
        </p>
        <p className="text-xl font-mono text-gray-800 mt-1">
          {practiceDayCount} / {totalDaysInYear}
        </p>
      </div>

      {/* Monthly bar chart */}
      {grandTotal > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-sm text-gray-500 font-medium mb-2">
            {t('analytics.monthlyTrend')}
          </p>
          <svg viewBox={`0 0 ${chartW} ${chartTotalH}`} className="w-full">
            {monthTotals.map((total, i) => {
              const barH = total > 0 ? (total / maxMonth) * CHART_H : 0;
              const x = i * (BAR_W + BAR_GAP);
              const y = CHART_PAD_TOP + CHART_H - barH;
              const isFutureMonth = `${year}-${String(i + 1).padStart(2, '0')}-01` > today;
              return (
                <g key={i}>
                  {/* Bar background */}
                  <rect
                    x={x}
                    y={CHART_PAD_TOP}
                    width={BAR_W}
                    height={CHART_H}
                    rx={3}
                    fill="#f3f4f6"
                  />
                  {/* Bar fill */}
                  {barH > 0 && (
                    <rect
                      x={x}
                      y={y}
                      width={BAR_W}
                      height={barH}
                      rx={3}
                      fill={isFutureMonth ? '#93c5fd' : '#3b82f6'}
                    />
                  )}
                  {/* Duration label */}
                  {total > 0 && (
                    <text
                      x={x + BAR_W / 2}
                      y={y - 4}
                      textAnchor="middle"
                      fontSize="7"
                      fill="#6b7280"
                    >
                      {formatDuration(total, timeUnit)}
                    </text>
                  )}
                  {/* Month label */}
                  <text
                    x={x + BAR_W / 2}
                    y={CHART_PAD_TOP + CHART_H + 14}
                    textAnchor="middle"
                    fontSize="8"
                    fill={isFutureMonth ? '#d1d5db' : '#9ca3af'}
                  >
                    {monthShortLabels[i]}
                  </text>
                </g>
              );
            })}
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
                  {entry.duration > 0 ? formatDuration(entry.duration, timeUnit) : 0}{' '}
                  {t(timeUnit)}
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

export default YearlyReport;
