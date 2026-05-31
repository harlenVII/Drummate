import { useLanguage } from '../contexts/LanguageContext';
import { formatDuration } from '../utils/formatTime';

export default function ReportItemCard({
  entry,
  grandTotal,
  timeUnit,
  compactMode,
  dimZero = false,
  editMode = false,
  onEditTime,
}) {
  const { t } = useLanguage();
  const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
  const dimmed = dimZero && entry.duration === 0;
  const clickable = editMode && typeof onEditTime === 'function';
  const showBar = (dimZero ? entry.duration > 0 : true) && grandTotal > 0;

  return (
    <div
      className={`bg-white dark:bg-slate-800 shadow-sm transition-colors ${
        compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'
      } ${
        clickable
          ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-700'
          : ''
      }`}
      onClick={clickable ? () => onEditTime(entry.id, entry.name, entry.duration) : undefined}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-medium ${
            dimmed ? 'text-gray-400 dark:text-slate-500' : 'text-gray-800 dark:text-slate-100'
          }`}
        >
          {entry.name}
        </span>
        <div
          className={`text-right ${
            dimmed ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'
          }`}
        >
          <div>
            {dimmed ? 0 : formatDuration(entry.duration, timeUnit)} {t(timeUnit)}
          </div>
          {entry.duration > 0 && (
            <div className="text-xs text-gray-500 dark:text-slate-400">({percentage}%)</div>
          )}
        </div>
      </div>
      {showBar && (
        <div
          className={`${compactMode ? 'mt-1' : 'mt-2'} bg-gray-100 dark:bg-slate-700 rounded-full h-1.5`}
        >
          <div
            className="bg-blue-500 dark:bg-indigo-500 rounded-full h-1.5"
            style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
