import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

function EditTimeModal({ itemName, date, currentSeconds, onSave, onDelete, onClose }) {
  const { t } = useLanguage();
  const currentMinutes = Math.round(currentSeconds / 60);
  const [minutes, setMinutes] = useState(String(currentMinutes));
  const inputRef = useRef(null);

  // Focus and select input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const parsedMinutes = parseInt(minutes, 10);
  const isValid = !isNaN(parsedMinutes) && parsedMinutes >= 0;
  const isWarning = isValid && parsedMinutes > 480;
  const deltaSeconds = isValid ? (parsedMinutes * 60) - currentSeconds : 0;
  const hasChange = isValid && deltaSeconds !== 0;

  const handleSave = () => {
    if (!hasChange) return;
    onSave(deltaSeconds);
  };

  const handleDelete = () => {
    if (currentSeconds <= 0) return;
    if (!confirm(t('confirmDeleteTime'))) return;
    onDelete();
  };

  // Format date for display
  const [year, month, day] = date.split('-');
  const displayDate = `${year}/${month}/${day}`;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-lg max-w-sm w-full p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">
          {currentSeconds > 0 ? t('editTime') : t('addTime')}
        </h2>

        <div className="text-sm text-gray-500 dark:text-slate-400">
          <div className="font-medium text-gray-800 dark:text-slate-100">{itemName}</div>
          <div>{displayDate}</div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 dark:text-slate-200 mb-1">
            {t('durationMinutes')}
          </label>
          <input
            ref={inputRef}
            type="number"
            min="0"
            inputMode="numeric"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hasChange) handleSave();
            }}
            className={`w-full px-3 py-2 border rounded-lg text-lg font-mono focus:outline-none focus:ring-2 dark:bg-slate-700 dark:text-slate-100 ${
              !isValid
                ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
                : isWarning
                  ? 'border-yellow-300 dark:border-yellow-400 focus:ring-yellow-500'
                  : 'border-gray-300 dark:border-slate-600 focus:ring-violet-500'
            }`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSave}
            disabled={!hasChange}
            className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
              hasChange
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            {t('save')}
          </button>

          {currentSeconds > 0 && (
            <button
              onClick={handleDelete}
              className="w-full px-4 py-2 text-red-600 border border-red-300 dark:border-red-500 rounded-lg font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {t('deleteTime')}
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-500 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditTimeModal;
