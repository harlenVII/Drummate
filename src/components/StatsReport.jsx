import { useState, useEffect } from 'react';
import { formatDuration } from '../utils/formatTime';
import { getTodayString, shiftDate } from '../utils/dateHelpers';
import { getAllLogs } from '../services/database';
import { useLanguage } from '../contexts/LanguageContext';

function StatsReport({ items, timeUnit }) {
  const { t } = useLanguage();
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
        { label: t('stats.totalPracticeTime'), value: `${formatDuration(stats.totalTime, timeUnit)} ${t(timeUnit)}` },
        { label: t('stats.totalPracticeDays'), value: String(stats.totalDays) },
        { label: t('stats.totalSessions'), value: String(stats.totalSessions) },
        { label: t('stats.avgDailyTime'), value: stats.totalDays > 0 ? `${formatDuration(Math.round(stats.totalTime / stats.totalDays), timeUnit)} ${t(timeUnit)}` : '-' },
      ],
    },
    {
      title: t('stats.streaks'),
      items: [
        { label: t('stats.currentStreak'), value: `${stats.currentStreak} ${t('stats.days')}` },
        { label: t('stats.longestStreak'), value: `${stats.longestStreak} ${t('stats.days')}` },
        { label: t('stats.longestDayTime'), value: stats.longestDay ? `${formatDuration(stats.longestDay.duration, timeUnit)} ${t(timeUnit)}` : '-', sub: stats.longestDay ? formatDisplayDate(stats.longestDay.date) : null },
      ],
    },
    {
      title: t('stats.records'),
      items: [
        { label: t('stats.mostPracticedItem'), value: stats.topItem || '-' },
        { label: t('stats.bestMonth'), value: stats.bestMonth || '-' },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">
            {section.title}
          </h3>
          {section.items.map((item) => (
            <div key={item.label} className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
              <span className="text-gray-600 text-sm">{item.label}</span>
              <div className="text-right">
                <span className="font-mono font-semibold text-gray-800">{item.value}</span>
                {item.sub && (
                  <div className="text-xs text-gray-400 mt-0.5">{item.sub}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {stats.totalSessions === 0 && (
        <p className="text-center text-gray-400 py-8">
          {t('noPracticeRecorded')}
        </p>
      )}
    </div>
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
  if (allLogs.length === 0) {
    return {
      totalTime: 0,
      totalDays: 0,
      totalSessions: 0,
      currentStreak: 0,
      longestStreak: 0,
      longestDay: null,
      topItem: null,
      bestMonth: null,
    };
  }

  // Total time & sessions
  let totalTime = 0;
  for (const log of allLogs) {
    totalTime += log.duration;
  }
  const totalSessions = allLogs.length;

  // Days with practice
  const dayTotals = {};
  for (const log of allLogs) {
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
  let streak = 1;
  for (let i = 1; i < practiceDays.length; i++) {
    const expected = shiftDate(practiceDays[i - 1], 1);
    if (practiceDays[i] === expected) {
      streak++;
    } else {
      if (streak > longestStreak) longestStreak = streak;
      streak = 1;
    }
  }
  if (streak > longestStreak) longestStreak = streak;
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
  for (const log of allLogs) {
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
  for (const log of allLogs) {
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
    longestDay,
    topItem,
    bestMonth,
  };
}

function formatMonthLabel(monthKey) {
  // monthKey is "YYYY-MM"
  const [year, month] = monthKey.split('-');
  const date = new Date(`${year}-${month}-01T12:00:00`);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default StatsReport;
