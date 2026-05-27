import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import { computeGoalStatus } from '../utils/goalStatus';

function dateDiffDays(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function formatRequired(hoursPerDay, t) {
  if (hoursPerDay <= 0) return t('goal.met');
  if (hoursPerDay < 1) return `${(hoursPerDay * 60).toFixed(2)} ${t('minutes')}`;
  return `${hoursPerDay.toFixed(1)} ${t('hours')}`;
}

function GoalCard({
  goal,
  logs,
  variant = 'current',          // 'current' | 'history'
  onEdit,
  onPin,
  onArchive,
  onDelete,
  onUnarchive,
  compactMode = false,
  dragHandleListeners,
  dragHandleAttributes,
}) {
  const { t } = useLanguage();
  const today = getTodayString();
  const status = computeGoalStatus(goal, logs);
  const { practicedHours, progressPercent, met } = status;

  const expired = today > goal.endDate;
  const notStarted = today < goal.startDate;
  const totalDays = dateDiffDays(goal.startDate, goal.endDate) + 1;
  const remainingHours = Math.max(0, goal.targetHours - practicedHours);

  let statusText = '';
  let requiredText = '';

  if (notStarted) {
    const daysUntilStart = dateDiffDays(today, goal.startDate);
    statusText = t('goal.startsIn', { days: daysUntilStart });
    const perDay = goal.targetHours / totalDays;
    requiredText = t('goal.needPerDay', { amount: formatRequired(perDay, t) });
  } else if (expired || variant === 'history') {
    statusText = met ? t('goal.statusMet') : t('goal.statusMissed');
  } else {
    const daysLeft = dateDiffDays(today, goal.endDate) + 1;
    statusText = t('goal.daysLeft', { days: daysLeft });
    if (met) {
      requiredText = t('goal.met');
    } else {
      const perDay = remainingHours / daysLeft;
      requiredText = t('goal.needPerDay', { amount: formatRequired(perDay, t) });
    }
  }

  const padding = compactMode ? 'p-3' : 'p-4';
  const gap = compactMode ? 'gap-2' : 'gap-3';
  const radius = compactMode ? 'rounded-md' : 'rounded-lg';

  const canArchiveNow = variant === 'current' && !goal.archived && today >= goal.startDate;
  const headerLabel = goal.name?.trim()
    ? goal.name.trim()
    : `${goal.startDate} – ${goal.endDate}`;

  return (
    <div className={`bg-white dark:bg-slate-800 ${radius} shadow-sm ${padding} flex flex-col ${gap}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {dragHandleListeners && (
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400"
              aria-label="Drag to reorder"
              {...dragHandleListeners}
              {...dragHandleAttributes}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="1" y="2" width="12" height="2" rx="1"/>
                <rect x="1" y="6" width="12" height="2" rx="1"/>
                <rect x="1" y="10" width="12" height="2" rx="1"/>
              </svg>
            </button>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100 truncate">
              {headerLabel}
            </span>
            {goal.name?.trim() && (
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {goal.startDate} – {goal.endDate}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-3 shrink-0">
          {onPin && (
            <button
              type="button"
              onClick={() => onPin(goal)}
              className={`text-xs hover:underline ${goal.pinned ? 'text-blue-600 dark:text-indigo-400 font-medium' : 'text-gray-400 dark:text-slate-500'}`}
            >
              {goal.pinned ? t('goal.pinned') : t('goal.pinAction')}
            </button>
          )}
          {onEdit && (
            <button onClick={() => onEdit(goal)} className="text-xs text-blue-600 dark:text-indigo-600 hover:underline">
              {t('goal.editGoal')}
            </button>
          )}
          {canArchiveNow && onArchive && (
            <button onClick={() => onArchive(goal)} className="text-xs text-amber-600 hover:underline">
              {t('goal.archiveNow')}
            </button>
          )}
          {variant === 'history' && onUnarchive && (
            <button onClick={() => onUnarchive(goal)} className="text-xs text-green-600 hover:underline">
              {t('goal.restore')}
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(goal)} className="text-xs text-red-500 hover:underline">
              {t('goal.delete')}
            </button>
          )}
        </div>
      </div>

      <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${met ? 'bg-green-500' : 'bg-blue-500 dark:bg-indigo-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400">
        <span>
          {practicedHours.toFixed(1)} / {goal.targetHours} {t('hours')} ({progressPercent.toFixed(2)}%)
        </span>
        <span className={met ? 'text-green-600 font-medium' : ''}>
          {statusText}
        </span>
      </div>

      {requiredText && (
        <div className="text-xs text-gray-500 dark:text-slate-400 border-t border-gray-100 dark:border-slate-700 pt-2">
          {requiredText}
        </div>
      )}
    </div>
  );
}

export default GoalCard;
