import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db } from '../services/database';
import { useLanguage } from '../contexts/LanguageContext';

function OfflineBanner({ onShowPending, onGoOnline }) {
  const { t } = useLanguage();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const sub = liveQuery(() => db.syncQueue.count()).subscribe({
      next: (count) => setPendingCount(count),
      error: (err) => console.error('OfflineBanner pendingCount liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, []);

  const pendingLabel = pendingCount === 0
    ? t('offline.noPendingChanges')
    : t('offline.pendingChanges', { count: pendingCount });

  return (
    <div
      className="bg-amber-500 text-white text-sm px-3 py-1.5 flex items-center justify-between gap-2 shrink-0"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden="true">⚡</span>
        <span className="font-medium">{t('offline.modeLabel')}</span>
        <span aria-hidden="true">·</span>
        <button
          onClick={onShowPending}
          className="underline truncate"
        >
          {pendingLabel}
        </button>
      </div>
      <button
        onClick={onGoOnline}
        className="underline font-medium shrink-0"
      >
        {t('offline.goOnline')}
      </button>
    </div>
  );
}

export default OfflineBanner;
