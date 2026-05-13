import { useState, useEffect } from 'react';
import { formatTime, formatMinutes, formatDuration } from '../utils/formatTime';
import { formatDateLabel, shiftDate, getTodayString } from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';

function DailyReport({ items, allItems, reportDate, reportLogs, onDateChange, onEditTime, onAddTime, timeUnit }) {
  const { t } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);

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
  for (const log of reportLogs) {
    itemTotals[log.itemId] = (itemTotals[log.itemId] || 0) + log.duration;
  }

  // Create sorted list: items with data first (sorted by duration desc)
  const breakdown = items
    .map((item) => ({ id: item.id, name: item.name, category: item.category, duration: Math.max(0, itemTotals[item.id] || 0) }))
    .filter((e) => e.duration > 0)
    .sort((a, b) => b.duration - a.duration);

  const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
  const songs = breakdown.filter((e) => e.category === 'songs');

  // Derive total from breakdown so trashed items' logs don't inflate the count
  const grandTotal = breakdown.reduce((sum, e) => sum + e.duration, 0);

  // Items available for manual add (active + archived, excluding those already with logs today)
  const itemIdsWithLogs = new Set(breakdown.map(e => e.id));
  const availableItems = (allItems || items)
    .filter(item => !item.trashed && !itemIdsWithLogs.has(item.id))
    .sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return a.sortOrder - b.sortOrder;
    });

  const isToday = reportDate === getTodayString();

  function renderItemCard(entry) {
    const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
    return (
      <div
        key={entry.id}
        className={`bg-white rounded-lg shadow-sm p-4 transition-colors ${
          editMode ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' : ''
        }`}
        onClick={editMode ? () => onEditTime(entry.id, entry.name, entry.duration) : undefined}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-800">{entry.name}</span>
          <div className="text-right text-gray-600">
            <div>{formatDuration(entry.duration, timeUnit)} {t(timeUnit)}</div>
            {entry.duration > 0 && (
              <div className="text-xs text-gray-500">({percentage}%)</div>
            )}
          </div>
        </div>
        {grandTotal > 0 && (
          <div className="mt-2 bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 rounded-full h-1.5"
              style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }

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

      {/* Edit mode toggle */}
      <div className="flex justify-end -mb-2">
        <button
          onClick={() => setEditMode(!editMode)}
          className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors ${
            editMode
              ? 'text-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {editMode ? t('done') : t('edit')}
        </button>
      </div>

      {/* Grand total card */}
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <p className="text-sm text-gray-500 font-medium">{t('totalPracticeTime')}</p>
        <p className="text-3xl font-mono text-gray-800 mt-1">
          {formatDuration(grandTotal, timeUnit)} {t(timeUnit)}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 mt-2">{t('noPracticeRecorded')}</p>
        )}
      </div>

      {/* Per-item breakdown */}
      {fundamentals.length > 0 && (
        <>
          <div className="flex justify-between items-center px-1 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t('categories.fundamentals')}
            </span>
            <span className="text-xs text-gray-400">
              {formatDuration(fundamentals.reduce((s, e) => s + e.duration, 0), timeUnit)} {t(timeUnit)}
            </span>
          </div>
          {fundamentals.map(renderItemCard)}
        </>
      )}

      {songs.length > 0 && (
        <>
          <div className="flex justify-between items-center px-1 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t('categories.songs')}
            </span>
            <span className="text-xs text-gray-400">
              {formatDuration(songs.reduce((s, e) => s + e.duration, 0), timeUnit)} {t(timeUnit)}
            </span>
          </div>
          {songs.map(renderItemCard)}
        </>
      )}

      {items.length === 0 && (
        <p className="text-center text-gray-400 py-8">
          {t('noPracticeItems')}
        </p>
      )}

      {/* Add time button (edit mode only) */}
      {editMode && (
        <button
          onClick={() => setShowItemPicker(true)}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-medium hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          + {t('addManualTime')}
        </button>
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
              {generateReportText(reportDate, grandTotal, breakdown, t, timeUnit)}
            </pre>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  generateReportText(reportDate, grandTotal, breakdown, t, timeUnit)
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

      {/* Item picker modal */}
      {showItemPicker && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          onClick={() => setShowItemPicker(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 flex flex-col gap-2 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800 mb-2">{t('selectItem')}</h2>
            {availableItems.length === 0 ? (
              <p className="text-gray-400 text-center py-4">{t('noItemsToAdd')}</p>
            ) : (
              availableItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setShowItemPicker(false);
                    onAddTime(item.id);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-between"
                >
                  <span className="font-medium text-gray-800">{item.name}</span>
                  <div className="flex items-center gap-2 ml-2">
                    {item.category && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.category === 'fundamentals'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-purple-100 text-purple-600'
                      }`}>
                        {t(`categories.${item.category}`)}
                      </span>
                    )}
                    {item.archived && (
                      <span className="text-xs text-gray-400">{t('archived')}</span>
                    )}
                  </div>
                </button>
              ))
            )}
            <button
              onClick={() => setShowItemPicker(false)}
              className="mt-2 px-4 py-2 text-gray-500 border border-gray-300 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function generateReportText(reportDate, grandTotal, breakdown, t, timeUnit) {
  // Format date as YYYY/MM/DD
  const [year, month, day] = reportDate.split('-');
  const formattedDate = `${year}/${month}/${day}`;

  const lines = [
    `${t('date')}: ${formattedDate}`,
    `${t('total')}: ${formatDuration(grandTotal, timeUnit)} ${t(timeUnit)}`,
  ];
  for (const entry of breakdown) {
    if (entry.duration > 0) {
      lines.push(`${entry.name}: ${formatDuration(entry.duration, timeUnit)} ${t(timeUnit)}`);
    }
  }
  return lines.join('\n');
}

export default DailyReport;
