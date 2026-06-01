import { formatDuration } from '../utils/formatTime';
import { useLanguage } from '../contexts/LanguageContext';

function ReportItemBreakdown({ groupByCategory, fundamentals, songs, breakdown, timeUnit, renderCard }) {
  const { t } = useLanguage();

  if (!groupByCategory) {
    return <>{breakdown.map(renderCard)}</>;
  }

  return (
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
          {fundamentals.map(renderCard)}
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
          {songs.map(renderCard)}
        </>
      )}
    </>
  );
}

export default ReportItemBreakdown;
