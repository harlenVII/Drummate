import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import { getTodayString, shiftDate, getMonthStart } from '../utils/dateHelpers';
import { getLogsByDateRange } from '../services/database';
import { buildReportText, formatReportDate } from '../utils/reportText';
import { useLanguage } from '../contexts/LanguageContext';

// The single report modal, behind all three entry points:
//   - `R` shortcut (App.jsx)        — today, range collapsed
//   - Daily view "Generate Report"  — the viewed date, range collapsed
//   - Stats view "Generate Report"  — today, range expanded
// The report rebuilds whenever the range changes, so there is no Generate button.

const moveCursorToEnd = (el) => {
  if (!el) return;
  const len = el.value.length;
  el.setSelectionRange(len, len);
};

const toPickerDate = (s) => (s ? new Date(s + 'T12:00:00') : null);
const fromPickerDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function ReportGeneratorModal({
  isOpen,
  onClose,
  items,
  timeUnit,
  groupByCategory = true,
  initialStartDate,
  initialEndDate,
  rangeExpanded = false,
}) {
  const { t } = useLanguage();
  const [startDate, setStartDate] = useState(getTodayString);
  const [endDate, setEndDate] = useState(getTodayString);
  const [showRange, setShowRange] = useState(rangeExpanded);
  const [reportText, setReportText] = useState(null);
  const [copied, setCopied] = useState(false);
  const startPickerRef = useRef(null);
  const endPickerRef = useRef(null);

  // Filtered here, not by the caller: a fresh array prop would retrigger the build effect
  const activeItems = useMemo(() => items.filter((i) => !i.trashed), [items]);

  // Reset to the caller's seed range whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    const today = getTodayString();
    setStartDate(initialStartDate || today);
    setEndDate(initialEndDate || today);
    setShowRange(rangeExpanded);
    setCopied(false);
  }, [isOpen, initialStartDate, initialEndDate, rangeExpanded]);

  // Rebuild on open and on every range change so the text always matches the pickers
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setReportText(null);
    (async () => {
      try {
        const logs = await getLogsByDateRange(startDate, endDate);
        if (cancelled) return;
        setReportText(
          buildReportText({ logs, startDate, endDate, items: activeItems, t, timeUnit, groupByCategory })
        );
      } catch (err) {
        console.error('ReportGeneratorModal: failed to build report', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, startDate, endDate, activeItems, timeUnit, groupByCategory, t]);

  const handleCopy = useCallback(async () => {
    if (reportText === null) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
    } catch (err) {
      console.error('ReportGeneratorModal: clipboard write failed', err);
    }
  }, [reportText]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      // Buttons and date inputs handle Enter themselves; don't copy on top of them
      else if (e.key === 'Enter' && !['BUTTON', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        handleCopy();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleCopy]);

  if (!isOpen) return null;

  const today = getTodayString();

  function handleStartDateChange(value) {
    setStartDate(value);
    if (value > endDate) setEndDate(value);
    setCopied(false);
  }

  function handleEndDateChange(value) {
    setEndDate(value);
    if (value < startDate) setStartDate(value);
    setCopied(false);
  }

  function applyPreset(start, end) {
    setStartDate(start);
    setEndDate(end);
    setCopied(false);
  }

  const presets = [
    { id: 'today', label: t('today'), start: today, end: today },
    { id: 'last7', label: t('reportGenerator.last7Days'), start: shiftDate(today, -6), end: today },
    { id: 'thisMonth', label: t('reportGenerator.thisMonth'), start: getMonthStart(today), end: today },
  ];

  const rangeLabel =
    startDate === endDate
      ? formatReportDate(startDate)
      : `${formatReportDate(startDate)} – ${formatReportDate(endDate)}`;

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
        aria-labelledby="report-generator-modal-title"
      >
        <h2 id="report-generator-modal-title" className="text-lg font-bold text-gray-800 dark:text-slate-100">
          {t('reportGenerator.title')}
        </h2>

        {/* Collapsed range summary */}
        {!showRange && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-700 dark:text-slate-200">{rangeLabel}</span>
            <button
              onClick={() => setShowRange(true)}
              className="text-sm font-medium text-blue-600 dark:text-indigo-400 hover:underline"
            >
              {t('reportGenerator.changeRange')}
            </button>
          </div>
        )}

        {showRange && (
          <>
            {/* Preset buttons */}
            <div className="flex gap-2">
              {presets.map((preset) => {
                const active = startDate === preset.start && endDate === preset.end;
                return (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.start, preset.end)}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                      active
                        ? 'bg-blue-600 dark:bg-indigo-600 text-white border-blue-600 dark:border-indigo-600'
                        : 'text-gray-600 dark:text-slate-400 border-gray-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-indigo-400 hover:text-blue-600 dark:hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Date inputs */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <label htmlFor="report-start-date" className="text-sm text-gray-600 dark:text-slate-400 w-20 shrink-0">
                  {t('reportGenerator.startDate')}
                </label>
                <DatePicker
                  id="report-start-date"
                  ref={startPickerRef}
                  selected={toPickerDate(startDate)}
                  onChange={(d) => {
                    handleStartDateChange(fromPickerDate(d));
                    requestAnimationFrame(() => moveCursorToEnd(startPickerRef.current?.input));
                  }}
                  onFocus={(e) => moveCursorToEnd(e.target)}
                  maxDate={new Date()}
                  dateFormat="yyyy/MM/dd"
                  calendarStartDay={1}
                  shouldCloseOnSelect
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
                  wrapperClassName="flex-1"
                  popperProps={{ strategy: 'fixed' }}
                />
              </div>
              <div className="flex items-center gap-3">
                <label htmlFor="report-end-date" className="text-sm text-gray-600 dark:text-slate-400 w-20 shrink-0">
                  {t('reportGenerator.endDate')}
                </label>
                <DatePicker
                  id="report-end-date"
                  ref={endPickerRef}
                  selected={toPickerDate(endDate)}
                  onChange={(d) => {
                    handleEndDateChange(fromPickerDate(d));
                    requestAnimationFrame(() => moveCursorToEnd(endPickerRef.current?.input));
                  }}
                  onFocus={(e) => moveCursorToEnd(e.target)}
                  minDate={toPickerDate(startDate)}
                  maxDate={new Date()}
                  dateFormat="yyyy/MM/dd"
                  calendarStartDay={1}
                  shouldCloseOnSelect
                  className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
                  wrapperClassName="flex-1"
                  popperProps={{ strategy: 'fixed' }}
                />
              </div>
            </div>
          </>
        )}

        {/* Report output */}
        {reportText !== null && (
          <>
            <pre className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap select-text max-h-[50vh] overflow-y-auto">
              {reportText}
            </pre>
            <button
              onClick={handleCopy}
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

export default ReportGeneratorModal;
