// Pure helpers for practice sessions: the individual practiceLogs rows behind
// an item's daily total on the Daily report.
//
// A row's end is `loggedAt` and its start is `loggedAt - duration * 1000` (the
// practice timer has no pause). Rows with a negative duration are old
// edit-mode adjustments; they have no time range.
//
// Nothing here touches the database, so every rule is unit-tested directly.
// Spec: docs/superpowers/specs/2026-09-25-daily-sessions-design.md

const byLoggedAt = (a, b) => (a.loggedAt - b.loggedAt) || (a.id - b.id);

// Display rows for one item's logs on one day: sessions sorted by start time,
// then adjustments (negative rows) last.
export function toSessionRows(logs) {
  const sessions = logs
    .filter((l) => l.duration > 0)
    .map((l) => ({
      id: l.id,
      kind: 'session',
      startMs: l.loggedAt - l.duration * 1000,
      endMs: l.loggedAt,
      duration: l.duration,
    }))
    .sort((a, b) => (a.startMs - b.startMs) || (a.id - b.id));
  const adjustments = logs
    .filter((l) => l.duration < 0)
    .map((l) => ({ id: l.id, kind: 'adjustment', startMs: null, endMs: null, duration: l.duration }));
  return [...sessions, ...adjustments];
}

// Plan how an edit-mode change to an item's daily total is applied to that
// item's rows for the day.
//
//   entries      every practiceLogs row for the item on that day
//   deltaSeconds the total the user typed minus the total the modal showed
//   anchorMs     "now" when editing today, else 23:59:59 of the edited day
//   dayStartMs   00:00 of the edited day; a shortened row's end never moves
//                before it, or the row would change days
//
// Returns { updates: [{ id, loggedAt, duration }], deleteIds: [id],
//           create: { loggedAt, duration } | null }.
export function planTimeEdit(entries, deltaSeconds, { anchorMs, dayStartMs }) {
  const plan = { updates: [], deleteIds: [], create: null };
  if (deltaSeconds === 0) return plan;

  const sum = entries.reduce((s, e) => s + e.duration, 0);
  // buildBreakdown clamps an item's total at 0, so that is what the modal showed.
  const target = Math.max(0, sum) + deltaSeconds;

  // Delete, or a total typed as 0: remove everything, old negative rows included.
  if (target <= 0) {
    plan.deleteIds = entries.map((e) => e.id);
    return plan;
  }

  const positives = entries.filter((e) => e.duration > 0).sort(byLoggedAt);
  const negatives = entries.filter((e) => e.duration < 0);

  // Legacy fold: old negative rows that cancel out the whole day would swallow
  // the time being added, so clear them first. Otherwise leave them alone.
  let base = sum;
  if (sum <= 0 && negatives.length > 0) {
    plan.deleteIds.push(...negatives.map((e) => e.id));
    base = positives.reduce((s, e) => s + e.duration, 0);
  }

  const d = target - base;
  if (d > 0) {
    if (positives.length === 0) {
      plan.create = { loggedAt: anchorMs, duration: d };
    } else {
      // The latest session gets longer and moves to end at the anchor.
      const latest = positives[positives.length - 1];
      plan.updates.push({ id: latest.id, loggedAt: anchorMs, duration: latest.duration + d });
    }
  } else if (d < 0) {
    // Shorten from the latest session backwards: each keeps its start and its
    // end moves earlier; a session that runs out is deleted. target > 0
    // guarantees the walk stops before the sessions run out.
    let remaining = -d;
    for (let i = positives.length - 1; i >= 0 && remaining > 0; i--) {
      const s = positives[i];
      if (s.duration > remaining) {
        plan.updates.push({
          id: s.id,
          duration: s.duration - remaining,
          loggedAt: Math.max(s.loggedAt - remaining * 1000, dayStartMs),
        });
        remaining = 0;
      } else {
        plan.deleteIds.push(s.id);
        remaining -= s.duration;
      }
    }
  }
  return plan;
}

// Plan Merge-to-yesterday stamps: positive rows are packed back to back in
// their original order so the last one ends at dayEndMs (23:59:59). Rows keep
// their durations. Negative rows have no time range and go to dayEndMs.
// No row is stamped before dayStartMs. Returns [{ id, loggedAt }].
export function planPackIntoDay(entries, { dayStartMs, dayEndMs }) {
  const positives = entries.filter((e) => e.duration > 0).sort(byLoggedAt);
  const out = [];
  let cursor = dayEndMs;
  for (let i = positives.length - 1; i >= 0; i--) {
    const loggedAt = Math.max(cursor, dayStartMs);
    out.push({ id: positives[i].id, loggedAt });
    cursor = loggedAt - positives[i].duration * 1000;
  }
  for (const e of entries) {
    if (!(e.duration > 0)) out.push({ id: e.id, loggedAt: dayEndMs });
  }
  return out;
}
