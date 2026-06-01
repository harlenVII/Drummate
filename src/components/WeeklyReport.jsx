import { formatDuration } from '../utils/formatTime';
import ReportItemCard from './ReportItemCard';
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
import {
  getWeekEnd,
  getDaysInRange,
  shiftDate,
  getTodayString,
} from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';
import { buildBreakdown } from '../utils/practiceStats';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function WeeklyReport({ items, weekStart, weekLogs, onWeekChange, onDayClick, timeUnit, groupByCategory, compactMode = false }) {
  const { t } = useLanguage();
  const isDarkMode = document.documentElement.classList.contains('dark');
  const weekEnd = getWeekEnd(weekStart);
  const weekDays = getDaysInRange(weekStart, weekEnd);
  const today = getTodayString();

  const activeItemIds = new Set(items.map(i => i.id));
  const activeLogs = weekLogs.filter(log => activeItemIds.has(log.itemId));

  // Per-day totals for bar chart
  const dayTotals = {};
  for (const log of activeLogs) {
    dayTotals[log.date] = (dayTotals[log.date] || 0) + log.duration;
  }
  const maxDay = Math.max(...weekDays.map((d) => dayTotals[d] || 0), 1);

  // Build per-item breakdown (totals, split by category, grandTotal)
  const { breakdown, fundamentals, songs, grandTotal } = buildBreakdown(items, activeLogs);

  const isCurrentWeek = weekEnd >= today;

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

  // Format date range label
  const formatShortDate = (dateString) => dateString.replace(/-/g, '/');

  // Bar chart dimensions
  const BAR_W = 24;
  const BAR_GAP = 16;
  const CHART_W = 7 * (BAR_W + BAR_GAP);
  const CHART_H = 80;
  const LABEL_TOP = 16; // space above bars for minute labels

  return (
    <div className={`flex flex-col ${compactMode ? 'gap-2' : 'gap-4'}`}>
      {/* Week navigation */}
      <ReportNavHeader
        onPrev={() => onWeekChange(shiftDate(weekStart, -7))}
        onNext={() => onWeekChange(shiftDate(weekStart, 7))}
        nextDisabled={isCurrentWeek}
        prevLabel="Previous week"
        nextLabel="Next week"
        compactMode={compactMode}
      >
        {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
      </ReportNavHeader>

      {/* Grand total card */}
      <div className={`bg-white dark:bg-slate-800 shadow-sm text-center ${compactMode ? 'rounded-md p-3' : 'rounded-lg p-6'}`}>
        <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">
          {t('analytics.totalThisWeek')}
        </p>
        <p className={`${compactMode ? 'text-2xl' : 'text-3xl'} font-mono text-gray-800 dark:text-slate-100 mt-1`}>
          {formatDuration(grandTotal, timeUnit)} {t(timeUnit)}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">
            {t('analytics.noDataThisWeek')}
          </p>
        )}
      </div>

      {/* Bar chart */}
      {grandTotal > 0 && (
        <div className={`bg-white dark:bg-slate-800 shadow-sm ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
          <svg
            viewBox={`0 0 ${CHART_W} ${LABEL_TOP + CHART_H + 24}`}
            className="w-full"
          >
            {weekDays.map((day, i) => {
              const seconds = dayTotals[day] || 0;
              const barH =
                seconds > 0 ? Math.max(4, (seconds / maxDay) * CHART_H) : 4;
              const x = i * (BAR_W + BAR_GAP) + BAR_GAP / 2;
              const y = LABEL_TOP + CHART_H - barH;
              const isToday = day === today;

              return (
                <g key={day} onClick={() => onDayClick(day)} style={{ cursor: 'pointer' }}>
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={3}
                    fill={
                      isToday
                        ? (isDarkMode ? '#6366f1' : '#3b82f6')
                        : seconds > 0
                          ? (isDarkMode ? '#a5b4fc' : '#93c5fd')
                          : isDarkMode ? '#1e293b' : '#f3f4f6'
                    }
                  />
                  {seconds > 0 && (
                    <text
                      x={x + BAR_W / 2}
                      y={y - 4}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#6b7280"
                    >
                      {formatDuration(seconds, timeUnit)}
                    </text>
                  )}
                  <text
                    x={x + BAR_W / 2}
                    y={LABEL_TOP + CHART_H + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fill={isToday ? (isDarkMode ? '#6366f1' : '#3b82f6') : '#9ca3af'}
                  >
                    {t(`analytics.weekdays.${WEEKDAY_KEYS[i]}`)}
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

export default WeeklyReport;
