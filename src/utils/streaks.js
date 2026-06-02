import { shiftDate } from './dateHelpers';

// Longest run of consecutive calendar days in an ASCENDING-sorted array of
// 'YYYY-MM-DD' practice days. Returns the run length and its inclusive bounds.
export function computeLongestStreak(sortedDays) {
  if (sortedDays.length === 0) return { length: 0, start: null, end: null };
  let longest = 0;
  let longestStart = null;
  let longestEnd = null;
  let runLen = 1;
  let runStart = sortedDays[0];
  for (let i = 1; i < sortedDays.length; i++) {
    if (sortedDays[i] === shiftDate(sortedDays[i - 1], 1)) {
      runLen += 1;
    } else {
      if (runLen > longest) {
        longest = runLen;
        longestStart = runStart;
        longestEnd = sortedDays[i - 1];
      }
      runLen = 1;
      runStart = sortedDays[i];
    }
  }
  if (runLen > longest) {
    longest = runLen;
    longestStart = runStart;
    longestEnd = sortedDays[sortedDays.length - 1];
  }
  return { length: longest, start: longestStart, end: longestEnd };
}

// Current streak walking backward from an anchor through `daysSet` (a Set of
// 'YYYY-MM-DD' practice days).
//   today             - anchor candidate
//   anchorOnYesterday - if today is missing, try yesterday (default false)
//   minDate           - inclusive lower bound; stop counting below it (default none)
export function computeCurrentStreak(daysSet, { today, anchorOnYesterday = false, minDate = null } = {}) {
  let anchor = null;
  if (daysSet.has(today)) {
    anchor = today;
  } else if (anchorOnYesterday) {
    const yesterday = shiftDate(today, -1);
    if ((minDate == null || yesterday >= minDate) && daysSet.has(yesterday)) {
      anchor = yesterday;
    }
  }
  if (!anchor) return 0;

  let count = 0;
  let cursor = anchor;
  while ((minDate == null || cursor >= minDate) && daysSet.has(cursor)) {
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}
