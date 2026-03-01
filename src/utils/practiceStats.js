import { getLogsByDateRange } from '../services/database';
import { getTodayString, shiftDate } from './dateHelpers';

/**
 * Build practice context object for the LLM encouragement prompt.
 * Queries IndexedDB for recent history and computes stats.
 */
export async function buildPracticeContext({ items, totals, activeItemId, elapsedTime }) {
  const today = getTodayString();

  // Get last 30 days of logs for streak calculation
  const recentLogs = await getLogsByDateRange(shiftDate(today, -29), today);

  // Per-item totals for today
  const todayTotals = Object.entries(totals)
    .map(([itemId, seconds]) => ({
      name: items.find(i => i.id === Number(itemId))?.name ?? 'Unknown',
      minutes: Math.round(seconds / 60),
    }))
    .filter(e => e.minutes > 0);

  // Grand total today (including live session)
  const todayTotalSeconds = Object.values(totals).reduce((a, b) => a + b, 0)
    + (activeItemId != null ? (elapsedTime || 0) : 0);
  const todayTotalMinutes = Math.round(todayTotalSeconds / 60);

  // Weekly total (last 7 days)
  const weekStart = shiftDate(today, -6);
  const weeklyLogs = recentLogs.filter(l => l.date >= weekStart);
  const weeklyMinutes = Math.round(
    weeklyLogs.reduce((a, l) => a + l.duration, 0) / 60
  );

  // Streak: consecutive days with any practice, walking backwards from today
  const streak = computeStreak(recentLogs, today);

  // Active session info
  const activeName = activeItemId
    ? items.find(i => i.id === activeItemId)?.name
    : null;
  const activeMinutes = Math.round((elapsedTime || 0) / 60);

  return {
    today,
    todayTotalMinutes,
    todayTotals,
    weeklyMinutes,
    streak,
    activeName,
    activeMinutes,
  };
}

function computeStreak(logs, today) {
  const daysWithPractice = new Set(logs.map(l => l.date));
  let streak = 0;
  let date = today;
  while (daysWithPractice.has(date)) {
    streak++;
    date = shiftDate(date, -1);
  }
  return streak;
}
