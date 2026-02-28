import { useState, useEffect } from 'react';
import { formatTime, formatMinutes } from '../utils/formatTime';
import { formatDateLabel, shiftDate, getTodayString } from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';

function DailyReport({ items, reportDate, reportLogs, onDateChange }) {
  const { t } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Close modal on Escape key
  useEffect(() => {
    if (!showModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowModal(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);
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
          {formatDateLabel(reportDate, t)}
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
        <p className="text-sm text-gray-500 font-medium">{t('totalPracticeTime')}</p>
        <p className="text-3xl font-mono text-gray-800 mt-1">
          {formatMinutes(grandTotal)} {t('minutes')}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 mt-2">{t('noPracticeRecorded')}</p>
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
              <div className={`text-right ${entry.duration > 0 ? 'text-gray-600' : 'text-gray-400'}`}>
                <div>
                  {entry.duration > 0 ? formatMinutes(entry.duration) : 0} {t('minutes')}
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
                style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
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

      {/* Generate Report button */}
      {grandTotal > 0 && (
        <button
          onClick={() => { setCopied(false); setShowModal(true); }}
          className="mt-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          {t('generateReport')}
        </button>
      )}

      {/* Report modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-md w-full p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800">{t('dailyReport')}</h2>
            <pre className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap select-text">
              {generateReportText(reportDate, grandTotal, breakdown, t)}
            </pre>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  generateReportText(reportDate, grandTotal, breakdown, t)
                );
                setCopied(true);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                copied
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {copied ? t('copied') : t('copyToClipboard')}
            </button>
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-gray-500 border border-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function generateReportText(reportDate, grandTotal, breakdown, t) {
  // Format date as YYYY/MM/DD
  const [year, month, day] = reportDate.split('-');
  const formattedDate = `${year}/${month}/${day}`;

  const lines = [
    `${t('date')}: ${formattedDate}`,
    `${t('total')}: ${formatMinutes(grandTotal)} ${t('minutes')}`,
  ];
  for (const entry of breakdown) {
    if (entry.duration > 0) {
      lines.push(`${entry.name}: ${formatMinutes(entry.duration)} ${t('minutes')}`);
    }
  }
  return lines.join('\n');
}

export default DailyReport;
