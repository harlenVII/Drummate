import { formatDuration } from '../utils/formatTime';
import ReportItemCard from './ReportItemCard';
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
import TrendLineChart from './TrendLineChart';
import {
  getYearStart,
  getYearEnd,
  getMonthEnd,
  getDaysInRange,
  getTodayString,
} from '../utils/dateHelpers';
import { computeLongestStreak, computeCurrentStreak } from '../utils/streaks';
import { useLanguage } from '../contexts/LanguageContext';
import { useIsDarkMode } from '../hooks/useIsDarkMode';
import { buildBreakdown } from '../utils/practiceStats';
import { computePercentiles, intensityColor } from '../utils/heatmap';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function YearlyReport({ items, yearStart, yearLogs, onYearChange, onDayClick, onMonthClick, timeUnit, groupByCategory, compactMode = false }) {
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

  // Intensity buckets from per-day durations across the heatmap range.
  const { p25, p50, p75 } = computePercentiles(allDays.map((d) => dayTotals[d] || 0));

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

  const monthShortLabels = MONTH_KEYS.map((key) => t(`analytics.months.${key}`));

  const trendPoints = monthTotals.map((total, i) => {
    const mStart = `${year}-${String(i + 1).padStart(2, '0')}-01`;
    return {
      key: mStart,
      value: total,
      xLabel: monthShortLabels[i],
      highlight: isCurrentYear && mStart.slice(0, 7) === today.slice(0, 7),
      future: mStart > today,
      onClick: () => onMonthClick(mStart),
    };
  });

  // Practice days count
  const practiceDayCount = allDays.filter((d) => (dayTotals[d] || 0) > 0).length;
  const totalDaysInYear = allDays.length;

  // Days with practice within the heatmap range, ascending.
  const practiceDaysInRange = allDays.filter((d) => (dayTotals[d] || 0) > 0);

  // Best streak: longest consecutive run within the year.
  const bestStreak = computeLongestStreak(practiceDaysInRange).length;

  // Current streak (current year only): anchor on today, else yesterday,
  // capped at the year start.
  const currentStreak = isCurrentYear
    ? computeCurrentStreak(new Set(practiceDaysInRange), {
        today,
        anchorOnYesterday: true,
        minDate: yearStart,
      })
    : 0;

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
                fill={intensityColor(seconds, { p25, p50, p75 }, isDarkMode)}
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

      {/* Monthly trend chart */}
      {grandTotal > 0 && (
        <TrendLineChart
          title={t('analytics.monthlyTrend')}
          points={trendPoints}
          timeUnit={timeUnit}
          compactMode={compactMode}
        />
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
