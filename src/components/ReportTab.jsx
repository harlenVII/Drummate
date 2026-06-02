import DailyReport from './DailyReport';
import WeeklyReport from './WeeklyReport';
import MonthlyReport from './MonthlyReport';
import YearlyReport from './YearlyReport';
import StatsReport from './StatsReport';
import GoalsPage from './GoalsPage';
import { useLanguage } from '../contexts/LanguageContext';

export default function ReportTab({
  reportSubpage, setReportSubpage,
  items,
  reports,
  timeUnit, groupByCategory, compactMode,
  user, firebaseBackend,
}) {
  const { t } = useLanguage();

  const {
    reportDate, weekStart, weekLogs, monthStart, monthLogs, yearStart, yearLogs,
    reportLogs,
    handleReportDateChange,
    handleEditTime, handleAddTime, handleMergeToYesterday,
    handleDayClick,
    handleWeekChange, handleMonthChange, handleYearChange,
    handleWeekClick, handleMonthClick,
  } = reports;

  const nonTrashedItems = items.filter(i => !i.trashed);

  return (
    <>
      {/* Report subpage toggle */}
      <div className="flex bg-gray-200 dark:bg-slate-700 rounded-lg p-1 gap-1">
        {['daily', 'weekly', 'monthly', 'yearly', 'stats', 'goals'].map((page) => (
          <button
            key={page}
            onClick={() => setReportSubpage(page)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              reportSubpage === page
                ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-slate-100 shadow-sm'
                : 'text-gray-500 dark:text-slate-400'
            }`}
          >
            {t(`reportSubpages.${page}`)}
          </button>
        ))}
      </div>

      {reportSubpage === 'daily' && (
        <DailyReport
          items={nonTrashedItems}
          allItems={nonTrashedItems}
          reportDate={reportDate}
          reportLogs={reportLogs}
          onDateChange={handleReportDateChange}
          onEditTime={handleEditTime}
          onAddTime={handleAddTime}
          onMergeToYesterday={handleMergeToYesterday}
          timeUnit={timeUnit}
          groupByCategory={groupByCategory}
          compactMode={compactMode}
        />
      )}

      {reportSubpage === 'weekly' && (
        <WeeklyReport
          items={nonTrashedItems}
          weekStart={weekStart}
          weekLogs={weekLogs}
          onWeekChange={handleWeekChange}
          onDayClick={handleDayClick}
          timeUnit={timeUnit}
          groupByCategory={groupByCategory}
          compactMode={compactMode}
        />
      )}

      {reportSubpage === 'monthly' && (
        <MonthlyReport
          items={nonTrashedItems}
          monthStart={monthStart}
          monthLogs={monthLogs}
          onMonthChange={handleMonthChange}
          onDayClick={handleDayClick}
          onWeekClick={handleWeekClick}
          timeUnit={timeUnit}
          groupByCategory={groupByCategory}
          compactMode={compactMode}
        />
      )}

      {reportSubpage === 'yearly' && (
        <YearlyReport
          items={nonTrashedItems}
          yearStart={yearStart}
          yearLogs={yearLogs}
          onYearChange={handleYearChange}
          onDayClick={handleDayClick}
          onMonthClick={handleMonthClick}
          timeUnit={timeUnit}
          groupByCategory={groupByCategory}
          compactMode={compactMode}
        />
      )}

      {reportSubpage === 'stats' && (
        <StatsReport
          items={nonTrashedItems}
          timeUnit={timeUnit}
          compactMode={compactMode}
        />
      )}

      {reportSubpage === 'goals' && (
        <GoalsPage
          user={user}
          firebaseBackend={firebaseBackend}
          compactMode={compactMode}
          timeUnit={timeUnit}
        />
      )}
    </>
  );
}
