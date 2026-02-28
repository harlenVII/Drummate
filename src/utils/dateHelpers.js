/**
 * Returns "YYYY-MM-DD" for a Date object, in local time.
 */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns today's date string.
 */
export function getTodayString() {
  return toDateString(new Date());
}

/**
 * Shifts a "YYYY-MM-DD" string by `days` (positive = forward, negative = back).
 */
export function shiftDate(dateString, days) {
  const date = new Date(dateString + 'T12:00:00'); // noon to avoid DST edge cases
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

/**
 * Formats "YYYY-MM-DD" into a human-readable label.
 * Returns "Today", "Yesterday", or a locale string like "Mon, Jan 6, 2025".
 */
export function formatDateLabel(dateString, t) {
  const today = getTodayString();
  if (dateString === today) return t ? t('today') : 'Today';

  const yesterday = shiftDate(today, -1);
  if (dateString === yesterday) return t ? t('yesterday') : 'Yesterday';

  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Returns the Monday of the week containing dateString (week starts Monday).
 */
export function getWeekStart(dateString) {
  const date = new Date(dateString + 'T12:00:00');
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateString(date);
}

/**
 * Returns the Sunday ending the week containing dateString.
 */
export function getWeekEnd(dateString) {
  return shiftDate(getWeekStart(dateString), 6);
}

/**
 * Returns the first day of the month containing dateString.
 */
export function getMonthStart(dateString) {
  const [year, month] = dateString.split('-');
  return `${year}-${month}-01`;
}

/**
 * Returns the last day of the month containing dateString.
 */
export function getMonthEnd(dateString) {
  const date = new Date(dateString.slice(0, 7) + '-01T12:00:00');
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return toDateString(date);
}

/**
 * Returns an array of all YYYY-MM-DD strings from startDate to endDate inclusive.
 */
export function getDaysInRange(startDate, endDate) {
  const days = [];
  let current = startDate;
  while (current <= endDate) {
    days.push(current);
    current = shiftDate(current, 1);
  }
  return days;
}
