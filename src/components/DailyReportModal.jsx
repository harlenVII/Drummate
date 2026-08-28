import { useState, useEffect } from 'react';
import { getTodayString } from '../utils/dateHelpers';
import { getLogsByDateRange } from '../services/database';
import { buildReportText } from '../utils/reportText';
import { useLanguage } from '../contexts/LanguageContext';

// Opened with the `R` shortcut from any tab: today's report text, ready to copy.
// No date pickers and no navigation — see ReportGeneratorModal for the range export.
function DailyReportModal({ isOpen, onClose, items, timeUnit }) {
  const { t } = useLanguage();
  const [reportText, setReportText] = useState(null);
  const [copied, setCopied] = useState(false);

  // Rebuild on every open so the text reflects time logged since the last open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setReportText(null);
    setCopied(false);
    (async () => {
      const today = getTodayString();
      try {
        const logs = await getLogsByDateRange(today, today);
        if (cancelled) return;
        // Filtered here, not by the caller: a fresh array prop would retrigger this effect
        const activeItems = items.filter((i) => !i.trashed);
        setReportText(buildReportText(logs, today, today, activeItems, t, timeUnit));
      } catch (err) {
        console.error('DailyReportModal: failed to build report', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, items, timeUnit, t]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-md w-full p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-report-modal-title"
      >
        <h2 id="daily-report-modal-title" className="text-lg font-bold text-gray-800 dark:text-slate-100">
          {t('dailyReport')}
        </h2>

        {reportText !== null && (
          <>
            <pre className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap select-text max-h-[50vh] overflow-y-auto">
              {reportText}
            </pre>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(reportText);
                  setCopied(true);
                } catch (err) {
                  console.error('DailyReportModal: clipboard write failed', err);
                }
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                copied
                  ? 'bg-teal-600 text-white'
                  : 'bg-blue-600 dark:bg-indigo-600 text-white hover:bg-blue-700 dark:hover:bg-indigo-700'
              }`}
            >
              {copied ? t('copied') : t('copyToClipboard')}
            </button>
          </>
        )}

        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-500 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
        >
          {t('close')}
        </button>
      </div>
    </div>
  );
}

export default DailyReportModal;
