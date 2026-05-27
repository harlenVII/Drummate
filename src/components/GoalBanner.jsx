import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import { db, getLogsByDateRange } from '../services/database';
import { computeGoalStatus } from '../utils/goalStatus';

function dateDiffDays(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function GoalBanner() {
  const { t } = useLanguage();
  const [goal, setGoal] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const sub = liveQuery(() => db.goals.toArray()).subscribe({
      next: (all) => setGoal(all.find(g => g.pinned) || null),
      error: (err) => console.error('GoalBanner liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!goal) { setLogs([]); return; }
    const sub = liveQuery(() => getLogsByDateRange(goal.startDate, goal.endDate)).subscribe({
      next: (rows) => setLogs(rows),
      error: (err) => console.error('GoalBanner logs liveQuery error:', err),
    });
    return () => sub.unsubscribe();
  }, [goal]);

  if (!goal) return null;

  const today = getTodayString();
  const expired = today > goal.endDate;
  const { practicedHours, progressPercent, met } = computeGoalStatus(goal, logs);

  let rightText = '';
  if (met) {
    rightText = t('goal.met');
  } else if (expired) {
    rightText = t('goal.missed');
  } else {
    const daysLeft = dateDiffDays(today, goal.endDate) + 1;
    const remainingHours = Math.max(0, goal.targetHours - practicedHours);
    const perDay = remainingHours / daysLeft;
    const amount = perDay < 1
      ? `${(perDay * 60).toFixed(2)} ${t('minutes')}`
      : `${perDay.toFixed(1)} ${t('hours')}`;
    rightText = t('goal.needPerDay', { amount });
  }

  const headerLabel = goal.name?.trim() || t('goal.title');

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
        <span className="truncate">
          {headerLabel}: {practicedHours.toFixed(1)} / {goal.targetHours} {t('hours')} ({progressPercent.toFixed(2)}%)
        </span>
        <span className={met ? 'text-green-600 font-medium shrink-0 ml-2' : 'shrink-0 ml-2'}>
          {rightText}
        </span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${met ? 'bg-green-500' : 'bg-blue-500 dark:bg-indigo-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

export default GoalBanner;
