import { useState, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

function MergeTargetPicker({ sourceItem, items, onCancel, onConfirm }) {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [pendingTarget, setPendingTarget] = useState(null);

  const eligible = useMemo(() => {
    return items.filter(
      (i) => !i.trashed && i.id !== sourceItem.id
    );
  }, [items, sourceItem.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter((i) => i.name.toLowerCase().includes(q));
  }, [eligible, search]);

  const fundamentals = filtered.filter((i) => i.category === 'fundamentals');
  const songs = filtered.filter((i) => i.category === 'songs');

  if (pendingTarget) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg max-w-md w-full p-5">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-3">
            {t('mergeConfirmTitle')}
          </h2>
          <p className="text-sm text-gray-700 dark:text-slate-200 mb-5">
            {t('mergeConfirmBody', {
              source: sourceItem.name,
              target: pendingTarget.name,
            })}
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPendingTarget(null)}
              className="px-4 py-2 text-gray-600 dark:text-slate-200 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => onConfirm(pendingTarget.id)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
            >
              {t('mergeConfirmAction')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderRow = (item) => (
    <button
      key={item.id}
      onClick={() => setPendingTarget(item)}
      className={`text-left w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-indigo-50 hover:border-indigo-300 transition-colors ${
        item.archived ? 'opacity-60' : ''
      }`}
    >
      <span className="font-medium text-gray-800 dark:text-slate-100">{item.name}</span>
      {item.archived && (
        <span className="ml-2 text-xs text-gray-500 dark:text-slate-400">{t('mergeArchivedTag')}</span>
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg max-w-md w-full max-h-[80vh] flex flex-col">
        <div className="p-5 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
              {t('mergePickerTitle')}
            </h2>
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"
              aria-label={t('cancel')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('mergeSearchPlaceholder')}
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:text-slate-100"
          />
        </div>

        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          {eligible.length === 0 && (
            <p className="text-center text-gray-400 dark:text-slate-500 italic">{t('mergeEmptyState')}</p>
          )}
          {eligible.length > 0 && filtered.length === 0 && (
            <p className="text-center text-gray-400 dark:text-slate-500 italic">{t('mergeNoOtherItems')}</p>
          )}
          {fundamentals.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                {t('categories.fundamentals')}
              </h3>
              {fundamentals.map(renderRow)}
            </div>
          )}
          {songs.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                {t('categories.songs')}
              </h3>
              {songs.map(renderRow)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MergeTargetPicker;
