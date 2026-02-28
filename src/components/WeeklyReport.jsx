import { formatMinutes } from '../utils/formatTime';
import {
  getWeekEnd,
  getDaysInRange,
  shiftDate,
  getTodayString,
} from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function WeeklyReport({ items, weekStart, weekLogs, onWeekChange }) {
  const { t } = useLanguage();
  const weekEnd = getWeekEnd(weekStart);
  const weekDays = getDaysInRange(weekStart, weekEnd);
  const today = getTodayString();

  // Grand total
  let grandTotal = 0;
  for (const log of weekLogs) {
    grandTotal += log.duration;
  }

  // Per-item totals
  const itemTotals = {};
  for (const log of weekLogs) {
    itemTotals[log.itemId] = (itemTotals[log.itemId] || 0) + log.duration;
  }

  // Per-day totals for bar chart
  const dayTotals = {};
  for (const log of weekLogs) {
    dayTotals[log.date] = (dayTotals[log.date] || 0) + log.duration;
  }
  const maxDay = Math.max(...weekDays.map((d) => dayTotals[d] || 0), 1);

  // Sorted breakdown
  const breakdown = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      duration: itemTotals[item.id] || 0,
    }))
    .sort((a, b) => b.duration - a.duration);

  const isCurrentWeek = weekEnd >= today;

  // Format date range label
  const formatShortDate = (dateString) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  // Bar chart dimensions
  const BAR_W = 24;
  const BAR_GAP = 16;
  const CHART_W = 7 * (BAR_W + BAR_GAP);
  const CHART_H = 80;

  return (
    <div className="flex flex-col gap-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onWeekChange(shiftDate(weekStart, -7))}
          className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
          aria-label="Previous week"
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
        <span className="text-lg font-semibold text-gray-800">
          {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
        </span>
        <button
          onClick={() => onWeekChange(shiftDate(weekStart, 7))}
          disabled={isCurrentWeek}
          className={`p-2 transition-colors ${
            isCurrentWeek
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          aria-label="Next week"
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
          {t('analytics.totalThisWeek')}
        </p>
        <p className="text-3xl font-mono text-gray-800 mt-1">
          {formatMinutes(grandTotal)} {t('minutes')}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 mt-2">
            {t('analytics.noDataThisWeek')}
          </p>
        )}
      </div>

      {/* Bar chart */}
      {grandTotal > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H + 24}`}
            className="w-full"
          >
            {weekDays.map((day, i) => {
              const seconds = dayTotals[day] || 0;
              const barH =
                seconds > 0 ? Math.max(4, (seconds / maxDay) * CHART_H) : 4;
              const x = i * (BAR_W + BAR_GAP) + BAR_GAP / 2;
              const y = CHART_H - barH;
              const isToday = day === today;

              return (
                <g key={day}>
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={3}
                    fill={
                      isToday
                        ? '#3b82f6'
                        : seconds > 0
                          ? '#93c5fd'
                          : '#f3f4f6'
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
                      {formatMinutes(seconds)}
                    </text>
                  )}
                  <text
                    x={x + BAR_W / 2}
                    y={CHART_H + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fill={isToday ? '#3b82f6' : '#9ca3af'}
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

export default WeeklyReport;
