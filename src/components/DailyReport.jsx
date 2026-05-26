import { useState, useEffect } from 'react';
import { formatTime, formatMinutes, formatDuration } from '../utils/formatTime';
import { formatDateLabel, shiftDate, getTodayString } from '../utils/dateHelpers';
import { useLanguage } from '../contexts/LanguageContext';

function DailyReport({ items, allItems, reportDate, reportLogs, onDateChange, onEditTime, onAddTime, onMergeToYesterday, timeUnit, groupByCategory, compactMode = false }) {
  const { t } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showItemPicker, setShowItemPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [merging, setMerging] = useState(false);

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
        className={`bg-white dark:bg-slate-800 shadow-sm transition-colors ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'} ${
          editMode ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-700' : ''
        }`}
        onClick={editMode ? () => onEditTime(entry.id, entry.name, entry.duration) : undefined}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-800 dark:text-slate-100">{entry.name}</span>
          <div className="text-right text-gray-600 dark:text-slate-400">
            <div>{formatDuration(entry.duration, timeUnit)} {t(timeUnit)}</div>
            {entry.duration > 0 && (
              <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
            )}
          </div>
        </div>
        {grandTotal > 0 && (
          <div className={`${compactMode ? 'mt-1' : 'mt-2'} bg-gray-100 dark:bg-slate-700 rounded-full h-1.5`}>
            <div
              className="bg-blue-500 dark:bg-indigo-500 rounded-full h-1.5"
              style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${compactMode ? 'gap-2' : 'gap-4'}`}>
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onDateChange(shiftDate(reportDate, -1))}
          className={`${compactMode ? 'p-1' : 'p-2'} text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors`}
          aria-label="Previous day"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={compactMode ? 'h-5 w-5' : 'h-6 w-6'}
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
        <span className={`${compactMode ? 'text-base' : 'text-lg'} font-semibold text-gray-800 dark:text-slate-100`}>
          {formatDateLabel(reportDate, t)}
        </span>
        <button
          onClick={() => onDateChange(shiftDate(reportDate, 1))}
          disabled={isToday}
          className={`${compactMode ? 'p-1' : 'p-2'} transition-colors ${
            isToday
              ? 'text-gray-300 dark:text-slate-600 cursor-not-allowed'
              : 'text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200'
          }`}
          aria-label="Next day"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={compactMode ? 'h-5 w-5' : 'h-6 w-6'}
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
              ? 'text-blue-600 dark:text-indigo-600 bg-blue-50 dark:bg-indigo-50 dark:bg-indigo-900/30'
              : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
          }`}
        >
          {editMode ? t('done') : t('edit')}
        </button>
      </div>

      {/* Grand total card */}
      <div className={`bg-white dark:bg-slate-800 shadow-sm text-center ${compactMode ? 'rounded-md p-3' : 'rounded-lg p-6'}`}>
        <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">{t('totalPracticeTime')}</p>
        <p className={`${compactMode ? 'text-2xl' : 'text-3xl'} font-mono text-gray-800 dark:text-slate-100 mt-1`}>
          {formatDuration(grandTotal, timeUnit)} {t(timeUnit)}
        </p>
        {grandTotal === 0 && (
          <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">{t('noPracticeRecorded')}</p>
        )}
      </div>

      {/* Per-item breakdown */}
      {groupByCategory ? (
        <>
          {fundamentals.length > 0 && (
            <>
              <div className="flex justify-between items-center px-1 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  {t('categories.fundamentals')}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-500">
                  {formatDuration(fundamentals.reduce((s, e) => s + e.duration, 0), timeUnit)} {t(timeUnit)}
                </span>
              </div>
              {fundamentals.map(renderItemCard)}
            </>
          )}

          {songs.length > 0 && (
            <>
              <div className="flex justify-between items-center px-1 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                  {t('categories.songs')}
                </span>
                <span className="text-xs text-gray-400 dark:text-slate-500">
                  {formatDuration(songs.reduce((s, e) => s + e.duration, 0), timeUnit)} {t(timeUnit)}
                </span>
              </div>
              {songs.map(renderItemCard)}
            </>
          )}
        </>
      ) : (
        breakdown.map(renderItemCard)
      )}

      {items.length === 0 && (
        <p className="text-center text-gray-400 dark:text-slate-500 py-8">
          {t('noPracticeItems')}
        </p>
      )}

      {/* Add time button (edit mode only) */}
      {editMode && (
        <button
          onClick={() => setShowItemPicker(true)}
          className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 dark:text-slate-400 font-medium hover:border-blue-400 dark:hover:border-indigo-400 hover:text-blue-500 dark:hover:text-indigo-500 transition-colors"
        >
          + {t('addManualTime')}
        </button>
      )}

      {/* Merge today's practice to yesterday (edit mode + today + has logs) */}
      {editMode && isToday && grandTotal > 0 && (
        <button
          onClick={() => setShowMergeConfirm(true)}
          className="w-full px-4 py-3 border border-amber-300 dark:border-amber-700 rounded-lg text-amber-700 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
        >
          {t('mergeToYesterday')}
        </button>
      )}

      {/* Generate Report button */}
      {grandTotal > 0 && (
        <button
          onClick={() => { setCopied(false); setShowModal(true); }}
          className="mt-1 px-4 py-2 bg-blue-600 dark:bg-indigo-600 text-white rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors"
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
            className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-md w-full p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">{t('dailyReport')}</h2>
            <pre className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap select-text">
              {generateReportText(reportDate, grandTotal, breakdown, t, timeUnit, groupByCategory)}
            </pre>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  generateReportText(reportDate, grandTotal, breakdown, t, timeUnit, groupByCategory)
                );
                setCopied(true);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                copied
                  ? 'bg-teal-600 text-white'
                  : 'bg-blue-600 dark:bg-indigo-600 text-white hover:bg-blue-700 dark:hover:bg-indigo-700'
              }`}
            >
              {copied ? t('copied') : t('copyToClipboard')}
            </button>
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-gray-500 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
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
            className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-sm w-full p-6 flex flex-col gap-2 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100 mb-2">{t('selectItem')}</h2>
            {availableItems.length === 0 ? (
              <p className="text-gray-400 dark:text-slate-500 text-center py-4">{t('noItemsToAdd')}</p>
            ) : (
              availableItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setShowItemPicker(false);
                    onAddTime(item.id);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-between"
                >
                  <span className="font-medium text-gray-800 dark:text-slate-100">{item.name}</span>
                  <div className="flex items-center gap-2 ml-2">
                    {item.category && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.category === 'fundamentals'
                          ? 'bg-blue-100 dark:bg-indigo-100 text-blue-600 dark:text-indigo-600'
                          : 'bg-purple-100 text-purple-600'
                      }`}>
                        {t(`categories.${item.category}`)}
                      </span>
                    )}
                    {item.archived && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">{t('archived')}</span>
                    )}
                  </div>
                </button>
              ))
            )}
            <button
              onClick={() => setShowItemPicker(false)}
              className="mt-2 px-4 py-2 text-gray-500 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Merge-to-yesterday confirm modal */}
      {showMergeConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
          onClick={() => !merging && setShowMergeConfirm(false)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-sm w-full p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">{t('mergeToYesterday')}</h2>
            <p className="text-sm text-gray-600 dark:text-slate-400">
              {t('confirmMergeToYesterday')}
            </p>
            <div className="flex gap-2">
              <button
                disabled={merging}
                onClick={() => setShowMergeConfirm(false)}
                className="flex-1 px-4 py-2 text-gray-500 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                disabled={merging}
                onClick={async () => {
                  setMerging(true);
                  try {
                    await onMergeToYesterday();
                    setShowMergeConfirm(false);
                    setEditMode(false);
                  } finally {
                    setMerging(false);
                  }
                }}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {merging ? '…' : t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function generateReportText(reportDate, grandTotal, breakdown, t, timeUnit, groupByCategory) {
  const [year, month, day] = reportDate.split('-');
  const formattedDate = `${year}/${month}/${day}`;
  const fmt = (d) => `${formatDuration(d, timeUnit)} ${t(timeUnit)}`;

  const fundamentals = breakdown.filter((e) => e.category === 'fundamentals' || !e.category);
  const songs = breakdown.filter((e) => e.category === 'songs');

  const lines = [
    `${t('date')}: ${formattedDate}`,
    `${t('total')}: ${fmt(grandTotal)}`,
  ];

  if (groupByCategory) {
    if (fundamentals.length > 0) {
      lines.push('');
      lines.push(`${t('categories.fundamentals')}:`);
      for (const entry of fundamentals) {
        lines.push(`${entry.name}: ${fmt(entry.duration)}`);
      }
    }
    if (songs.length > 0) {
      lines.push('');
      lines.push(`${t('categories.songs')}:`);
      for (const entry of songs) {
        lines.push(`${entry.name}: ${fmt(entry.duration)}`);
      }
    }
  } else {
    lines.push('');
    for (const entry of breakdown) {
      lines.push(`${entry.name}: ${fmt(entry.duration)}`);
    }
  }

  return lines.join('\n');
}

export default DailyReport;
