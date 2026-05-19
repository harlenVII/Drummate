import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/database';
import { useLanguage } from '../contexts/LanguageContext';
import { formatPendingAction } from '../utils/pendingActionFormatter';

function PendingChangesModal({ isOpen, onClose }) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    const sub = liveQuery(() => db.syncQueue.orderBy('id').toArray()).subscribe({
      next: (rows) => setEntries(rows),
      error: (err) => console.error('PendingChangesModal liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-changes-title"
      >
        <div className="px-5 py-3 border-b border-gray-200">
          <h2 id="pending-changes-title" className="text-lg font-semibold text-gray-800">
            {t('offline.pendingChangesTitle')}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              {t('offline.noPendingChangesEmpty')}
            </p>
          ) : (
            <ol className="flex flex-col gap-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="text-sm text-gray-700 px-3 py-2 bg-gray-50 rounded-md"
                >
                  {formatPendingAction(entry, t)}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PendingChangesModal;
