import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';

const toPickerDate = (s) => (s ? new Date(s + 'T12:00:00') : null);
const fromPickerDate = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function GoalSetupModal({ isOpen, onClose, onSave, goal }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (goal) {
      setName(goal.name || '');
      setStartDate(goal.startDate);
      setEndDate(goal.endDate);
      setTargetHours(String(goal.targetHours));
    } else {
      setName('');
      setStartDate(getTodayString());
      setEndDate('');
      setTargetHours('');
    }
    setError('');
  }, [isOpen, goal]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!startDate || !endDate) { setError(t('goal.errorDates')); return; }
    if (startDate >= endDate) { setError(t('goal.errorDateOrder')); return; }
    const hours = parseFloat(targetHours);
    if (isNaN(hours) || hours <= 0) { setError(t('goal.errorHours')); return; }
    const trimmedName = name.trim();
    try {
      await onSave({
        uid: goal?.uid,
        name: trimmedName,
        startDate,
        endDate,
        targetHours: hours,
      });
      onClose();
    } catch (err) {
      console.error('GoalSetupModal save failed:', err);
      setError(String(err?.message || err));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">{t('goal.title')}</h2>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600 dark:text-slate-400">{t('goal.optionalName')}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('goal.namePlaceholder')}
            maxLength={80}
            className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-gray-600 dark:text-slate-400">{t('goal.startDate')}</span>
          <DatePicker
            selected={toPickerDate(startDate)}
            onChange={(d) => { setStartDate(fromPickerDate(d)); setError(''); }}
            onFocus={(e) => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
            dateFormat="yyyy/MM/dd"
            calendarStartDay={1}
            shouldCloseOnSelect
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
            wrapperClassName="w-full"
            popperProps={{ strategy: 'fixed' }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-gray-600 dark:text-slate-400">{t('goal.endDate')}</span>
          <DatePicker
            selected={toPickerDate(endDate)}
            onChange={(d) => { setEndDate(fromPickerDate(d)); setError(''); }}
            onFocus={(e) => { const l = e.target.value.length; e.target.setSelectionRange(l, l); }}
            dateFormat="yyyy/MM/dd"
            calendarStartDay={1}
            shouldCloseOnSelect
            className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
            wrapperClassName="w-full"
            popperProps={{ strategy: 'fixed' }}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-gray-600 dark:text-slate-400">{t('goal.targetHours')}</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={targetHours}
            onChange={(e) => { setTargetHours(e.target.value); setError(''); }}
            className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500"
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 dark:bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GoalSetupModal;
