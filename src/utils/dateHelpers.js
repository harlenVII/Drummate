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
export function formatDateLabel(dateString) {
  const today = getTodayString();
  if (dateString === today) return 'Today';

  const yesterday = shiftDate(today, -1);
  if (dateString === yesterday) return 'Yesterday';

  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
