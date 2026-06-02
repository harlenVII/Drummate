import { formatDuration } from '../utils/formatTime';
import ReportItemCard from './ReportItemCard';
import ReportNavHeader from './ReportNavHeader';
import ReportItemBreakdown from './ReportItemBreakdown';
import TrendLineChart from './TrendLineChart';
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
  const weekEnd = getWeekEnd(weekStart);
  const weekDays = getDaysInRange(weekStart, weekEnd);
  const today = getTodayString();

  const activeItemIds = new Set(items.map(i => i.id));
  const activeLogs = weekLogs.filter(log => activeItemIds.has(log.itemId));

  // Per-day totals for trend chart
  const dayTotals = {};
  for (const log of activeLogs) {
    dayTotals[log.date] = (dayTotals[log.date] || 0) + log.duration;
  }
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

  const trendPoints = weekDays.map((day, i) => ({
    key: day,
    value: dayTotals[day] || 0,
    xLabel: t(`analytics.weekdays.${WEEKDAY_KEYS[i]}`),
    highlight: day === today,
    future: day > today,
    onClick: () => onDayClick(day),
  }));

  return (
    <div className={`flex flex-col ${compactMode ? 'gap-2' : 'gap-4'}`}>
      {/* Week navigation */}
      <ReportNavHeader
        onPrev={() => onWeekChange(shiftDate(weekStart, -7))}
        onNext={() => onWeekChange(shiftDate(weekStart, 7))}
        nextDisabled={isCurrentWeek}
        prevLabel={t('accessibility.prevWeek')}
        nextLabel={t('accessibility.nextWeek')}
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

      {/* Trend chart */}
      {grandTotal > 0 && (
        <TrendLineChart
          title={t('analytics.dailyTrend')}
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

export default WeeklyReport;
