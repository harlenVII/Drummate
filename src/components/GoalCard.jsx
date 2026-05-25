import { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getTodayString } from '../utils/dateHelpers';
import { getLogsByDateRange } from '../services/database';
import GoalSetupModal from './GoalSetupModal';

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

function formatRequired(hoursPerDay, t) {
  if (hoursPerDay <= 0) return t('goal.met');
  if (hoursPerDay < 1) return `${Math.round(hoursPerDay * 60)} ${t('minutes')}`;
  return `${hoursPerDay.toFixed(1)} ${t('hours')}`;
}

function GoalCard() {
  const { t } = useLanguage();
  const [goal, setGoal] = useState(readGoal);
  const [practicedSeconds, setPracticedSeconds] = useState(0);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!goal) { setPracticedSeconds(0); return; }
    let cancelled = false;
    (async () => {
      const logs = await getLogsByDateRange(goal.startDate, goal.endDate);
      if (cancelled) return;
      setPracticedSeconds(logs.reduce((sum, l) => sum + l.duration, 0));
    })();
    return () => { cancelled = true; };
  }, [goal]);

  const handleSave = () => setGoal(readGoal());
  const handleClear = () => { localStorage.removeItem(GOAL_KEY); setGoal(null); };

  if (!goal) {
    return (
      <>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 flex items-center justify-between">
          <span className="text-gray-500 dark:text-slate-400 text-sm">{t('goal.noGoal')}</span>
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-violet-600 text-white text-sm rounded-lg font-medium hover:bg-violet-700 transition-colors"
          >
            {t('goal.setGoal')}
          </button>
        </div>
        <GoalSetupModal isOpen={showModal} onClose={() => setShowModal(false)} onSave={handleSave} goal={null} />
      </>
    );
  }

  const today = getTodayString();
  const expired = today > goal.endDate;
  const notStarted = today < goal.startDate;
  const totalDays = dateDiffDays(goal.startDate, goal.endDate) + 1;
  const practicedHours = practicedSeconds / 3600;
  const progressPercent = Math.min(100, (practicedHours / goal.targetHours) * 100);
  const remainingHours = Math.max(0, goal.targetHours - practicedHours);
  const goalMet = practicedHours >= goal.targetHours;

  let statusText = '';
  let requiredText = '';

  if (notStarted) {
    const daysUntilStart = dateDiffDays(today, goal.startDate);
    statusText = t('goal.startsIn', { days: daysUntilStart });
    const perDay = goal.targetHours / totalDays;
    requiredText = t('goal.needPerDay', { amount: formatRequired(perDay, t) });
  } else if (expired) {
    statusText = goalMet ? t('goal.met') : t('goal.missed');
  } else {
    const daysLeft = dateDiffDays(today, goal.endDate) + 1;
    statusText = t('goal.daysLeft', { days: daysLeft });
    if (goalMet) {
      requiredText = t('goal.met');
    } else {
      const perDay = remainingHours / daysLeft;
      requiredText = t('goal.needPerDay', { amount: formatRequired(perDay, t) });
    }
  }

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="text-xs text-gray-400 dark:text-slate-500">{goal.startDate} – {goal.endDate}</div>
          <div className="flex gap-3">
            <button onClick={() => setShowModal(true)} className="text-xs text-violet-600 hover:underline">
              {t('goal.editGoal')}
            </button>
            <button onClick={handleClear} className="text-xs text-red-500 hover:underline">
              {t('goal.clearGoal')}
            </button>
          </div>
        </div>

        <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${goalMet ? 'bg-green-500' : 'bg-violet-500'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400">
          <span>
            {practicedHours.toFixed(1)} / {goal.targetHours} {t('hours')} ({progressPercent.toFixed(2)}%)
          </span>
          <span className={goalMet || (expired && goalMet) ? 'text-green-600 font-medium' : ''}>
            {statusText}
          </span>
        </div>

        {requiredText && (
          <div className="text-xs text-gray-500 dark:text-slate-400 border-t border-gray-100 dark:border-slate-700 pt-2">
            {requiredText}
          </div>
        )}
      </div>

      <GoalSetupModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        goal={goal}
      />
    </>
  );
}

export default GoalCard;
