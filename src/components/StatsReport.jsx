import { useState, useEffect } from 'react';
import { formatDuration } from '../utils/formatTime';
import { getTodayString, shiftDate } from '../utils/dateHelpers';
import { getAllLogs } from '../services/database';
import { useLanguage } from '../contexts/LanguageContext';
import ReportGeneratorModal from './ReportGeneratorModal';
import { getPriorHours } from '../services/priorPracticeService';

function StatsReport({ items, timeUnit, compactMode = false }) {
  const { t } = useLanguage();
  const priorHours = getPriorHours();
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const allLogs = await getAllLogs();
      if (cancelled) return;
      setStats(computeStats(allLogs, items));
    })();
    return () => { cancelled = true; };
  }, [items]);

  if (!stats) return null;

  const sections = [
    {
      title: t('stats.overview'),
      items: [
        { label: t('stats.totalPracticeTime'), value: `${formatDuration(stats.totalTime + priorHours * 3600, timeUnit)} ${t(timeUnit)}`, sub: priorHours > 0 ? t('stats.priorIncluded', { hours: priorHours }) : null },
        { label: t('stats.totalPracticeDays'), value: String(stats.totalDays) },
        { label: t('stats.avgDailyTime'), value: stats.totalDays > 0 ? `${formatDuration(Math.round(stats.totalTime / stats.totalDays), timeUnit)} ${t(timeUnit)}` : '-' },
      ],
    },
    {
      title: t('stats.streaks'),
      items: [
        { label: t('stats.currentStreak'), value: `${stats.currentStreak} ${t('stats.days')}` },
        { label: t('stats.longestStreak'), value: `${stats.longestStreak} ${t('stats.days')}`, sub: stats.longestStreakStart ? `${formatDisplayDate(stats.longestStreakStart)} – ${formatDisplayDate(stats.longestStreakEnd)}` : null },
      ],
    },
    {
      title: t('stats.records'),
      items: [
        { label: t('stats.mostPracticedItem'), value: stats.topItem || '-', sub: stats.topItemDuration > 0 ? `${formatDuration(stats.topItemDuration, timeUnit)} ${t(timeUnit)}` : null },
        { label: t('stats.longestDayTime'), value: stats.longestDay ? `${formatDuration(stats.longestDay.duration, timeUnit)} ${t(timeUnit)}` : '-', sub: stats.longestDay ? formatDisplayDate(stats.longestDay.date) : null },
        { label: t('stats.bestMonth'), value: stats.bestMonth || '-', sub: stats.bestMonthDuration > 0 ? `${formatDuration(stats.bestMonthDuration, timeUnit)} ${t(timeUnit)}` : null },
      ],
    },
  ];

  return (
    <>
      <div className={`flex flex-col ${compactMode ? 'gap-2' : 'gap-4'}`}>
        {sections.map((section) => (
          <div key={section.title} className={`flex flex-col ${compactMode ? 'gap-1' : 'gap-2'}`}>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide px-1">
              {section.title}
            </h3>
            {section.items.map((item) => (
              <div key={item.label} className={`bg-white dark:bg-slate-800 shadow-sm flex items-center justify-between ${compactMode ? 'rounded-md p-2' : 'rounded-lg p-4'}`}>
                <span className="text-gray-600 dark:text-slate-400 text-sm">{item.label}</span>
                <div className="text-right">
                  <span className="font-mono font-semibold text-gray-800 dark:text-slate-100">{item.value}</span>
                  {item.sub && (
                    <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.sub}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        {stats.totalSessions === 0 && (
          <p className="text-center text-gray-400 dark:text-slate-500 py-8">
            {t('noPracticeRecorded')}
          </p>
        )}

      </div>

      <button
        onClick={() => setShowModal(true)}
        className={`mt-1 ${compactMode ? 'px-3 py-1' : 'px-4 py-2'} bg-blue-600 dark:bg-indigo-600 text-white rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-indigo-700 transition-colors`}
      >
        {t('generateReport')}
      </button>

      <ReportGeneratorModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        items={items}
        timeUnit={timeUnit}
      />
    </>
  );
}

function formatDisplayDate(dateString) {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function computeStats(allLogs, items) {
  const activeItemIds = new Set(items.map(i => i.id));
  const logs = allLogs.filter(log => activeItemIds.has(log.itemId));

  if (logs.length === 0) {
    return {
      totalTime: 0,
      totalDays: 0,
      totalSessions: 0,
      currentStreak: 0,
      longestStreak: 0,
      longestStreakStart: null,
      longestStreakEnd: null,
      longestDay: null,
      topItem: null,
      bestMonth: null,
    };
  }

  // Total time & sessions
  let totalTime = 0;
  for (const log of logs) {
    totalTime += log.duration;
  }
  const totalSessions = logs.length;

  // Days with practice
  const dayTotals = {};
  for (const log of logs) {
    dayTotals[log.date] = (dayTotals[log.date] || 0) + log.duration;
  }
  const practiceDays = Object.keys(dayTotals).sort();
  const totalDays = practiceDays.length;

  // Current streak
  const today = getTodayString();
  const daysSet = new Set(practiceDays);
  let currentStreak = 0;
  let date = today;
  while (daysSet.has(date)) {
    currentStreak++;
    date = shiftDate(date, -1);
  }

  // Longest streak
  let longestStreak = 0;
  let longestStreakStart = null;
  let longestStreakEnd = null;
  let streak = 1;
  let streakStart = practiceDays[0] ?? null;
  for (let i = 1; i < practiceDays.length; i++) {
    const expected = shiftDate(practiceDays[i - 1], 1);
    if (practiceDays[i] === expected) {
      streak++;
    } else {
      if (streak > longestStreak) {
        longestStreak = streak;
        longestStreakStart = streakStart;
        longestStreakEnd = practiceDays[i - 1];
      }
      streak = 1;
      streakStart = practiceDays[i];
    }
  }
  if (streak > longestStreak) {
    longestStreak = streak;
    longestStreakStart = streakStart;
    longestStreakEnd = practiceDays[practiceDays.length - 1];
  }
  if (practiceDays.length === 0) longestStreak = 0;

  // Longest day
  let longestDay = null;
  let maxDayDuration = 0;
  for (const [d, dur] of Object.entries(dayTotals)) {
    if (dur > maxDayDuration) {
      maxDayDuration = dur;
      longestDay = { date: d, duration: dur };
    }
  }

  // Most practiced item
  const itemTotals = {};
  for (const log of logs) {
    itemTotals[log.itemId] = (itemTotals[log.itemId] || 0) + log.duration;
  }
  let topItemId = null;
  let topItemDuration = 0;
  for (const [id, dur] of Object.entries(itemTotals)) {
    if (dur > topItemDuration) {
      topItemDuration = dur;
      topItemId = Number(id);
    }
  }
  const topItem = topItemId != null
    ? items.find((i) => i.id === topItemId)?.name || null
    : null;

  // Best month
  const monthTotals = {};
  for (const log of logs) {
    const month = log.date.slice(0, 7); // "YYYY-MM"
    monthTotals[month] = (monthTotals[month] || 0) + log.duration;
  }
  let bestMonthKey = null;
  let bestMonthDuration = 0;
  for (const [month, dur] of Object.entries(monthTotals)) {
    if (dur > bestMonthDuration) {
      bestMonthDuration = dur;
      bestMonthKey = month;
    }
  }
  const bestMonth = bestMonthKey
    ? formatMonthLabel(bestMonthKey)
    : null;

  return {
    totalTime,
    totalDays,
    totalSessions,
    currentStreak,
    longestStreak,
    longestStreakStart,
    longestStreakEnd,
    longestDay,
    topItem,
    topItemDuration,
    bestMonth,
    bestMonthDuration,
  };
}

function formatMonthLabel(monthKey) {
  // monthKey is "YYYY-MM"
  const [year, month] = monthKey.split('-');
  const date = new Date(`${year}-${month}-01T12:00:00`);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default StatsReport;
