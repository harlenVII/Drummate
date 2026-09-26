import { useLanguage } from '../contexts/LanguageContext';
import { formatDuration } from '../utils/formatTime';
import { formatClockInTimezone } from '../utils/tzDateHelpers';

export default function ReportItemCard({
  entry,
  grandTotal,
  timeUnit,
  compactMode,
  dimZero = false,
  editMode = false,
  onEditTime,
  // Optional session list (Daily report only). Without `sessions` and
  // `onToggleExpand` the card renders exactly as before.
  sessions,
  expanded = false,
  onToggleExpand,
  tz,
}) {
  const { t } = useLanguage();
  const percentage = grandTotal > 0 ? Math.round((entry.duration / grandTotal) * 100) : 0;
  const dimmed = dimZero && entry.duration === 0;
  const clickable = editMode && typeof onEditTime === 'function';
  const hasSessions = Array.isArray(sessions) && typeof onToggleExpand === 'function';
  // In edit mode a tap edits the total; an open list stays visible, read-only.
  const canToggle = hasSessions && !clickable;
  const showBar = (dimZero ? entry.duration > 0 : true) && grandTotal > 0;

  let handleClick;
  if (clickable) handleClick = () => onEditTime(entry.id, entry.name, entry.duration);
  else if (canToggle) handleClick = () => onToggleExpand(entry.id);

  return (
    <div
      className={`bg-white dark:bg-slate-800 shadow-sm transition-colors ${
        compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'
      } ${
        clickable || canToggle
          ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 active:bg-gray-100 dark:active:bg-slate-700'
          : ''
      }`}
      onClick={handleClick}
      role={canToggle ? 'button' : undefined}
      aria-expanded={canToggle ? expanded : undefined}
      title={canToggle ? t(expanded ? 'hideSessions' : 'showSessions') : undefined}
    >
      <div className="flex items-center justify-between">
        <span
          className={`font-medium flex items-center ${
            dimmed ? 'text-gray-400 dark:text-slate-500' : 'text-gray-800 dark:text-slate-100'
          }`}
        >
          {entry.name}
          {canToggle && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className={`ml-1 h-4 w-4 text-gray-400 dark:text-slate-500 transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
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
            className="bg-accent-500 rounded-full h-1.5"
            style={{ width: `${(entry.duration / grandTotal) * 100}%` }}
          />
        </div>
      )}
      {hasSessions && expanded && (
        <ul
          className={`flex flex-col text-sm text-gray-500 dark:text-slate-400 ${
            compactMode ? 'mt-1.5 gap-0.5' : 'mt-3 gap-1'
          }`}
        >
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between">
              <span className={s.kind === 'session' ? 'font-mono' : ''}>
                {s.kind === 'session'
                  ? `${formatClockInTimezone(s.startMs, tz)} – ${formatClockInTimezone(s.endMs, tz)}`
                  : t('sessionAdjustment')}
              </span>
              <span>
                {formatDuration(s.duration, timeUnit)} {t(timeUnit)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
