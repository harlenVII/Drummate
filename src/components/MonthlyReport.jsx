import { formatDuration } from '../utils/formatTime';
import ReportItemCard from './ReportItemCard';
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
import {
  getMonthEnd,
  getMonthStart,
  getWeekStart,
  getDaysInRange,
  shiftDate,
  getTodayString,
} from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';
import { buildBreakdown } from '../utils/practiceStats';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function MonthlyReport({ items, monthStart, monthLogs, onMonthChange, onDayClick, timeUnit, groupByCategory, compactMode = false }) {
  const { t } = useLanguage();
  const isDarkMode = document.documentElement.classList.contains('dark');
  const monthEnd = getMonthEnd(monthStart);
  const monthDays = getDaysInRange(monthStart, monthEnd);
  const today = getTodayString();

  const activeItemIds = new Set(items.map(i => i.id));
  const activeLogs = monthLogs.filter(log => activeItemIds.has(log.itemId));

  // Per-day totals
  const dayTotals = {};
  for (const log of activeLogs) {
    dayTotals[log.date] = (dayTotals[log.date] || 0) + log.duration;
  }

  // Build per-item breakdown (totals, split by category, grandTotal)
  const { breakdown, fundamentals, songs, grandTotal } = buildBreakdown(items, activeLogs);

  const isCurrentMonth = monthStart >= getMonthStart(today);

  // Month label
  const monthLabel = (() => {
    const [y, m] = monthStart.split('-');
    return `${y}/${m}`;
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

  const BG_TEXT = isDarkMode
    ? { '#334155': '#94a3b8', '#a5b4fc': '#312e81', '#6366f1': '#ffffff', '#4338ca': '#ffffff', '#3730a3': '#ffffff' }
    : { '#e2e8f0': '#94a3b8', '#bfdbfe': '#1e3a8a', '#60a5fa': '#ffffff', '#2563eb': '#ffffff', '#1e3a8a': '#ffffff' };

  const intensityColor = (seconds) => {
    if (seconds === 0) return isDarkMode ? '#334155' : '#e2e8f0'; // slate-700 / slate-200
    if (seconds <= p25) return isDarkMode ? '#a5b4fc' : '#bfdbfe'; // indigo-300 / blue-200
    if (seconds <= p50) return isDarkMode ? '#6366f1' : '#60a5fa'; // indigo-500 / blue-400
    if (seconds <= p75) return isDarkMode ? '#4338ca' : '#2563eb'; // indigo-700 / blue-600
    return isDarkMode ? '#3730a3' : '#1e3a8a'; // indigo-800 / blue-900
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

  const CELL = compactMode ? 26 : 32;
  const GAP = compactMode ? 3 : 4;
  const HEADER_H = compactMode ? 16 : 20;
  const PADDING = 2; // extra space for today's stroke ring
  const gridW = 7 * (CELL + GAP) - GAP + PADDING * 2;
  const gridH = (row + 1) * (CELL + GAP) - GAP + HEADER_H + PADDING;

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
  const TREND_PAD_X = 6; // horizontal padding for dot radius
  const TREND_PAD_TOP = 16; // space for label text above dots
  const TREND_PAD_BOTTOM = 6;
  const TREND_W = 280;
  const TREND_H = 60;

  const trendPoints = weekTotals.map((v, i) => ({
    x:
      weekTotals.length === 1
        ? (TREND_W + TREND_PAD_X * 2) / 2
        : TREND_PAD_X + (i / (weekTotals.length - 1)) * TREND_W,
    y: TREND_PAD_TOP + TREND_H - (v / maxWeek) * TREND_H,
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

  const renderItemCard = (entry) => (
    <ReportItemCard
      key={entry.id}
      entry={entry}
      grandTotal={grandTotal}
      timeUnit={timeUnit}
      compactMode={compactMode}
      dimZero
    />
  );

  return (
    <div className={`flex flex-col ${compactMode ? 'gap-2' : 'gap-4'}`}>
      {/* Month navigation */}
      <ReportNavHeader
        onPrev={handlePrevMonth}
        onNext={handleNextMonth}
        nextDisabled={isCurrentMonth}
        prevLabel="Previous month"
        nextLabel="Next month"
        compactMode={compactMode}
      >
        {monthLabel}
      </ReportNavHeader>

      {/* Grand total card */}
      <div className={`bg-white dark:bg-slate-800 shadow-sm text-center ${compactMode ? 'rounded-md p-3' : 'rounded-lg p-6'}`}>
        <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">
          {t('analytics.totalThisMonth')}
        </p>
        <p className={`${compactMode ? 'text-2xl' : 'text-3xl'} font-mono text-gray-800 dark:text-slate-100 mt-1`}>
          {formatDuration(grandTotal, timeUnit)} {t(timeUnit)}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">
            {t('analytics.noDataThisMonth')}
          </p>
        )}
      </div>

      {/* Calendar heatmap */}
      <div className={`bg-white dark:bg-slate-800 shadow-sm ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
        <svg viewBox={`0 0 ${gridW} ${gridH}`} className="w-full">
          {/* Day-of-week headers */}
          {WEEKDAY_KEYS.map((key, i) => (
            <text
              key={key}
              x={PADDING + i * (CELL + GAP) + CELL / 2}
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
            const dayNum = parseInt(date.split('-')[2], 10);
            const cx = PADDING + c * (CELL + GAP);
            const cy = r * (CELL + GAP) + HEADER_H;
            const bg = intensityColor(seconds);
            return (
              <g key={date} onClick={() => onDayClick(date)} style={{ cursor: 'pointer' }}>
                <rect
                  x={cx}
                  y={cy}
                  width={CELL}
                  height={CELL}
                  rx={4}
                  fill={bg}
                  stroke={isToday ? (isDarkMode ? '#6366f1' : '#3b82f6') : 'none'}
                  strokeWidth={isToday ? 2 : 0}
                />
                <text
                  x={cx + CELL / 2}
                  y={cy + CELL / 2 + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fill={BG_TEXT[bg]}
                >
                  {dayNum}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Weekly trend chart */}
      {grandTotal > 0 && weekTotals.length > 1 && (
        <div className={`bg-white dark:bg-slate-800 shadow-sm ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
          <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-2">
            {t('analytics.weeklyTrend')}
          </p>
          <svg viewBox={`0 0 ${TREND_W + TREND_PAD_X * 2} ${TREND_PAD_TOP + TREND_H + TREND_PAD_BOTTOM}`} className="w-full">
            <polyline
              points={polylineStr}
              fill="none"
              stroke={isDarkMode ? '#6366f1' : '#3b82f6'}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {trendPoints.map((p, i) => {
              const anchor =
                i === 0
                  ? 'start'
                  : i === trendPoints.length - 1
                    ? 'end'
                    : 'middle';
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4} fill={isDarkMode ? '#6366f1' : '#3b82f6'} />
                  <text
                    x={p.x}
                    y={p.y - 8}
                    textAnchor={anchor}
                    fontSize="9"
                    fill="#6b7280"
                  >
                    {formatDuration(weekTotals[i], timeUnit)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Per-item breakdown */}
      <ReportItemBreakdown
        groupByCategory={groupByCategory}
        fundamentals={fundamentals}
        songs={songs}
        breakdown={breakdown}
        timeUnit={timeUnit}
        renderCard={renderItemCard}
      />

      {items.length === 0 && (
        <p className="text-center text-gray-400 dark:text-slate-500 py-8">
          {t('noPracticeItems')}
        </p>
      )}
    </div>
  );
}

export default MonthlyReport;
