import { formatTime } from '../utils/formatTime';
import { formatDateLabel, shiftDate, getTodayString } from '../utils/dateHelpers';

function DailyReport({ items, reportDate, reportLogs, onDateChange }) {
  // Build per-item totals from logs
  const itemTotals = {};
  let grandTotal = 0;
  for (const log of reportLogs) {
    itemTotals[log.itemId] = (itemTotals[log.itemId] || 0) + log.duration;
    grandTotal += log.duration;
  }

  // Create sorted list: items with data first (sorted by duration desc)
  const breakdown = items
    .map((item) => ({ id: item.id, name: item.name, duration: itemTotals[item.id] || 0 }))
    .sort((a, b) => b.duration - a.duration);

  const isToday = reportDate === getTodayString();

  return (
    <div className="flex flex-col gap-4">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onDateChange(shiftDate(reportDate, -1))}
          className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
          aria-label="Previous day"
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
          {formatDateLabel(reportDate)}
        </span>
        <button
          onClick={() => onDateChange(shiftDate(reportDate, 1))}
          disabled={isToday}
          className={`p-2 transition-colors ${
            isToday
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-gray-600 hover:text-gray-800'
          }`}
          aria-label="Next day"
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
        <p className="text-sm text-gray-500 font-medium">Total Practice Time</p>
        <p className="text-3xl font-mono text-gray-800 mt-1">{formatTime(grandTotal)}</p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 mt-2">No practice recorded</p>
        )}
      </div>

      {/* Per-item breakdown */}
      {breakdown.map((entry) => {
        const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
        return (
          <div key={entry.id} className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between">
              <span className={`font-medium ${entry.duration > 0 ? 'text-gray-800' : 'text-gray-400'}`}>
                {entry.name}
              </span>
              <div className={`font-mono text-right ${entry.duration > 0 ? 'text-gray-600' : 'text-gray-400'}`}>
                <div>{formatTime(entry.duration)}</div>
                {entry.duration > 0 && (
                  <div className="text-xs text-gray-500">({percentage}%)</div>
                )}
              </div>
            </div>
          {entry.duration > 0 && grandTotal > 0 && (
            <div className="mt-2 bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-blue-500 rounded-full h-1.5"
                style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
              />
            </div>
          )}
        </div>
        );
      })}

      {items.length === 0 && (
        <p className="text-center text-gray-400 py-8">
          No practice items configured. Go to Practice to add some!
        </p>
      )}
    </div>
  );
}

export default DailyReport;
