export function computeGoalStatus(goal, logs) {
  let practicedSeconds = 0;
  for (const l of logs) {
    if (!l || !l.date) continue;
    if (l.date >= goal.startDate && l.date <= goal.endDate) {
      practicedSeconds += l.duration || 0;
    }
  }
  const practicedHours = practicedSeconds / 3600;
  const targetHours = goal.targetHours > 0 ? goal.targetHours : 0;
  const progressPercent = targetHours > 0
    ? Math.min(100, (practicedHours / targetHours) * 100)
    : 0;
  const met = targetHours > 0 && practicedHours >= targetHours;
  return { practicedSeconds, practicedHours, progressPercent, met };
}

export function isCurrentGoal(goal, today) {
  return !goal.archived && goal.endDate >= today;
}

export function isHistoryGoal(goal, today) {
  return !!goal.archived || goal.endDate < today;
}

export function selectExpiredForArchive(goals, today) {
  return goals.filter(g => !g.archived && g.endDate < today);
}

function parseLegacy(raw) {
  if (!raw) return null;
  let g;
  try { g = JSON.parse(raw); } catch { return null; }
  if (!g || typeof g !== 'object') return null;
  if (!g.startDate || !g.endDate) return null;
  if (typeof g.targetHours !== 'number' || g.targetHours <= 0) return null;
  return g;
}

export function shouldMigrateLegacy(dexieCount, legacyRaw) {
  if (dexieCount > 0) return false;
  return parseLegacy(legacyRaw) !== null;
}

export function buildMigratedGoal(legacyRaw, nowMs, uuid) {
  const g = parseLegacy(legacyRaw);
  if (!g) return null;
  return {
    uid: uuid(),
    name: '',
    startDate: g.startDate,
    endDate: g.endDate,
    targetHours: g.targetHours,
    archived: false,
    archivedAt: null,
    pinned: true,
    createdAt: nowMs,
    syncedOnce: false,
  };
}
