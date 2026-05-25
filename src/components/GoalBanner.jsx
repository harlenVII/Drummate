import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import { getLogsByDateRange } from '../services/database';

const GOAL_KEY = 'drummate_goal';

function dateDiffDays(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function readGoal() {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (!g.startDate || !g.endDate || !g.targetHours || g.targetHours <= 0) return null;
    if (g.startDate >= g.endDate) return null;
    return g;
  } catch {
    return null;
  }
}

function GoalBanner({ refreshKey = 0 }) {
  const { t } = useLanguage();
  const [goal] = useState(readGoal);
  const [practicedSeconds, setPracticedSeconds] = useState(0);

  useEffect(() => {
    if (!goal) return;
    let cancelled = false;
    (async () => {
      const logs = await getLogsByDateRange(goal.startDate, goal.endDate);
      if (cancelled) return;
      setPracticedSeconds(logs.reduce((sum, l) => sum + l.duration, 0));
    })();
    return () => { cancelled = true; };
  }, [goal, refreshKey]);

  if (!goal) return null;

  const today = getTodayString();
  const expired = today > goal.endDate;
  const practicedHours = practicedSeconds / 3600;
  const progressPercent = Math.min(100, (practicedHours / goal.targetHours) * 100);
  const goalMet = practicedHours >= goal.targetHours;

  let rightText = '';
  if (goalMet) {
    rightText = t('goal.met');
  } else if (expired) {
    rightText = t('goal.missed');
  } else {
    const daysLeft = dateDiffDays(today, goal.endDate) + 1;
    const remainingHours = Math.max(0, goal.targetHours - practicedHours);
    const perDay = remainingHours / daysLeft;
    const amount = perDay < 1
      ? `${Math.round(perDay * 60)} ${t('minutes')}`
      : `${perDay.toFixed(1)} ${t('hours')}`;
    rightText = t('goal.needPerDay', { amount });
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-4 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
        <span>
          {t('goal.title')}: {practicedHours.toFixed(1)} / {goal.targetHours} {t('hours')} ({progressPercent.toFixed(2)}%)
        </span>
        <span className={goalMet ? 'text-green-600 font-medium' : ''}>
          {rightText}
        </span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-1">
        <div
          className={`h-1 rounded-full transition-all ${goalMet ? 'bg-green-500' : 'bg-blue-500 dark:bg-indigo-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

export default GoalBanner;
