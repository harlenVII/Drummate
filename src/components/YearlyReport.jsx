import { formatDuration } from '../utils/formatTime';
import ReportItemCard from './ReportItemCard';
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
import {
  getYearStart,
  getYearEnd,
  getMonthEnd,
  getDaysInRange,
  getTodayString,
  shiftDate,
} from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import { buildBreakdown } from '../utils/practiceStats';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function YearlyReport({ items, yearStart, yearLogs, onYearChange, onDayClick, timeUnit, groupByCategory, compactMode = false }) {
  const { t } = useLanguage();
  const isDarkMode = useIsDarkMode();
  const yearEnd = getYearEnd(yearStart);
  const year = yearStart.split('-')[0];
  const today = getTodayString();

  const activeItemIds = new Set(items.map(i => i.id));
  const activeLogs = yearLogs.filter(log => activeItemIds.has(log.itemId));

  // Per-day totals
  const dayTotals = {};
  for (const log of activeLogs) {
    dayTotals[log.date] = (dayTotals[log.date] || 0) + log.duration;
  }

  // Build per-item breakdown (totals, split by category, grandTotal)
  const { breakdown, fundamentals, songs, grandTotal } = buildBreakdown(items, activeLogs);

  const isCurrentYear = yearStart >= getYearStart(today);

  // --- GitHub-style heatmap ---
  // Build week columns starting from Jan 1, up to today for current year
  const heatmapEnd = isCurrentYear ? (today < yearEnd ? today : yearEnd) : yearEnd;
  const allDays = getDaysInRange(yearStart, heatmapEnd);

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
    if (seconds === 0) return isDarkMode ? '#334155' : '#e2e8f0'; // slate-700 / slate-200
    if (seconds <= p25) return isDarkMode ? '#a5b4fc' : '#bfdbfe'; // indigo-300 / blue-200
    if (seconds <= p50) return isDarkMode ? '#6366f1' : '#60a5fa'; // indigo-500 / blue-400
    if (seconds <= p75) return isDarkMode ? '#4338ca' : '#2563eb'; // indigo-700 / blue-600
    return isDarkMode ? '#3730a3' : '#1e3a8a'; // indigo-800 / blue-900
  };

  // Build grid: columns = day of week (0=Mon, 6=Sun), rows = weeks
  const CELL = 10;
  const GAP = 2;
  const HEADER_H = 14; // space for weekday headers

  const jan1 = new Date(yearStart + 'T12:00:00');
  const jan1DayOfWeek = (jan1.getDay() + 6) % 7;

  const cells = [];
  for (const day of allDays) {
    const date = new Date(day + 'T12:00:00');
    const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon, 6=Sun
    const daysSinceStart = Math.round((date - jan1) / (1000 * 60 * 60 * 24));
    const weekRow = Math.floor((daysSinceStart + jan1DayOfWeek) / 7);
    cells.push({ date: day, col: dayOfWeek, row: weekRow });
  }

  const maxRow = cells.length > 0 ? Math.max(...cells.map((c) => c.row)) : 0;
  const LABEL_W = 18; // space for month labels on left
  const gridW = LABEL_W + 7 * (CELL + GAP) - GAP;
  const gridH = (maxRow + 1) * (CELL + GAP) - GAP;

  // Month labels for heatmap (positioned on left by row)
  const monthLabels = [];
  for (let m = 0; m < 12; m++) {
    const monthStr = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    if (monthStr > yearEnd) break;
    const monthDate = new Date(monthStr + 'T12:00:00');
    const daysSince = Math.round((monthDate - jan1) / (1000 * 60 * 60 * 24));
    const weekRow = Math.floor((daysSince + jan1DayOfWeek) / 7);
    monthLabels.push({ label: t(`analytics.months.${MONTH_KEYS[m]}`), y: HEADER_H + weekRow * (CELL + GAP) + CELL / 2 + 2 });
  }

  const heatmapTotalH = HEADER_H + gridH + 2; // +2 padding for stroke/rounded corners

  // --- Monthly bar chart ---
  const monthTotals = [];
  for (let m = 0; m < 12; m++) {
    const mStart = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const mEnd = getMonthEnd(mStart);
    const days = getDaysInRange(mStart, mEnd);
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

  const monthShortLabels = MONTH_KEYS.map((key) => t(`analytics.months.${key}`));

  // Practice days count
  const practiceDayCount = allDays.filter((d) => (dayTotals[d] || 0) > 0).length;
  const totalDaysInYear = allDays.length;

  // Best streak: longest run of consecutive practice days within the year
  let bestStreak = 0;
  let runLen = 0;
  for (const d of allDays) {
    if ((dayTotals[d] || 0) > 0) {
      runLen += 1;
      if (runLen > bestStreak) bestStreak = runLen;
    } else {
      runLen = 0;
    }
  }

  // Current streak (current year only): walk backward from today, or yesterday
  // if today has no practice yet. Capped at year start.
  let currentStreak = 0;
  if (isCurrentYear) {
    let anchor = null;
    if ((dayTotals[today] || 0) > 0) {
      anchor = today;
    } else {
      const yesterday = shiftDate(today, -1);
      if (yesterday >= yearStart && (dayTotals[yesterday] || 0) > 0) {
        anchor = yesterday;
      }
    }
    if (anchor) {
      let cursor = anchor;
      while (cursor >= yearStart && (dayTotals[cursor] || 0) > 0) {
        currentStreak += 1;
        cursor = shiftDate(cursor, -1);
      }
    }
  }

  // Navigation
  const handlePrevYear = () => {
    const prevYear = String(Number(year) - 1);
    onYearChange(`${prevYear}-01-01`);
  };

  const handleNextYear = () => {
    const nextYear = String(Number(year) + 1);
    onYearChange(`${nextYear}-01-01`);
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
      {/* Year navigation */}
      <ReportNavHeader
        onPrev={handlePrevYear}
        onNext={handleNextYear}
        nextDisabled={isCurrentYear}
        prevLabel={t('accessibility.prevYear')}
        nextLabel={t('accessibility.nextYear')}
        compactMode={compactMode}
      >
        {year}
      </ReportNavHeader>

      {/* Grand total card */}
      <div className={`bg-white dark:bg-slate-800 shadow-sm text-center ${compactMode ? 'rounded-md p-3' : 'rounded-lg p-6'}`}>
        <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">
          {t('analytics.totalThisYear')}
        </p>
        <p className={`${compactMode ? 'text-2xl' : 'text-3xl'} font-mono text-gray-800 dark:text-slate-100 mt-1`}>
          {formatDuration(grandTotal, timeUnit)} {t(timeUnit)}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">
            {t('analytics.noDataThisYear')}
          </p>
        )}
      </div>

      {/* GitHub-style heatmap */}
      <div className={`bg-white dark:bg-slate-800 shadow-sm flex justify-center ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
        <svg
          width={gridW * 3}
          viewBox={`0 0 ${gridW} ${heatmapTotalH}`}
          preserveAspectRatio="xMidYMin meet"
          style={{ maxWidth: '100%' }}
        >
          {/* Weekday headers (columns) */}
          {WEEKDAY_KEYS.map((key, i) => (
            <text
              key={key}
              x={LABEL_W + i * (CELL + GAP) + CELL / 2}
              y={10}
              textAnchor="middle"
              fontSize="7"
              fill="#9ca3af"
            >
              {t(`analytics.weekdaysShort.${key}`)}
            </text>
          ))}
          {/* Month labels (rows, left side) */}
          {monthLabels.map(({ label, y }, i) => (
            <text
              key={i}
              x={0}
              y={y}
              fontSize="5.5"
              fill="#9ca3af"
            >
              {label}
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
                y={HEADER_H + row * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                fill={intensityColor(seconds)}
                stroke={isToday ? (isDarkMode ? '#6366f1' : '#3b82f6') : 'none'}
                strokeWidth={isToday ? 1 : 0}
                onClick={() => onDayClick(date)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </svg>
      </div>

      {/* Practice days count */}
      <div className={`bg-white dark:bg-slate-800 shadow-sm text-center ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
        <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">
          {t('analytics.practiceDays')}
        </p>
        <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono">
          <span className="text-xl text-gray-800 dark:text-slate-100">
            {practiceDayCount}/{totalDaysInYear} {t('analytics.days')}
          </span>
          <span className="flex items-baseline gap-x-2 text-sm text-gray-500 dark:text-slate-400">
            {isCurrentYear && (
              <>
                <span>{t('analytics.currentStreak')} {currentStreak}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{t('analytics.bestStreak')} {bestStreak}</span>
          </span>
        </div>
      </div>

      {/* Monthly bar chart */}
      {grandTotal > 0 && (
        <div className={`bg-white dark:bg-slate-800 shadow-sm ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
          <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mb-2">
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
                    fill={isDarkMode ? '#1e293b' : '#f3f4f6'}
                  />
                  {/* Bar fill */}
                  {barH > 0 && (
                    <rect
                      x={x}
                      y={y}
                      width={BAR_W}
                      height={barH}
                      rx={3}
                      fill={isFutureMonth ? (isDarkMode ? '#a5b4fc' : '#93c5fd') : (isDarkMode ? '#6366f1' : '#3b82f6')}
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

export default YearlyReport;
