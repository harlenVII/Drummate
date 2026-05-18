import { formatInTimezone } from './tzDateHelpers.js';
import { getTimezone } from '../services/timezoneService.js';

/**
 * Returns "YYYY-MM-DD" for a Date object, in the user's configured timezone.
 */
export function toDateString(date) {
  return formatInTimezone(date.getTime(), getTimezone());
}

/**
 * Returns today's date string in the user's configured timezone.
 */
export function getTodayString() {
  return formatInTimezone(Date.now(), getTimezone());
}

// Calendar helpers below operate purely on YYYY-MM-DD strings using Date.UTC
// for arithmetic. They must NOT touch device-local time or the configured TZ —
// that mismatch (e.g. device PT, configured HK) breaks day-by-day navigation.
function ymdFromUtcMs(utcMs) {
  const dt = new Date(utcMs);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Shifts a "YYYY-MM-DD" string by `days` (positive = forward, negative = back).
 */
export function shiftDate(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number);
  return ymdFromUtcMs(Date.UTC(y, m - 1, d + days));
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

  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
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
  const [y, m, d] = dateString.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return shiftDate(dateString, diff);
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
  const [y, m] = dateString.split('-').map(Number);
  return ymdFromUtcMs(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
}

/**
 * Returns the first day of the year containing dateString.
 */
export function getYearStart(dateString) {
  const year = dateString.split('-')[0];
  return `${year}-01-01`;
}

/**
 * Returns the last day of the year containing dateString.
 */
export function getYearEnd(dateString) {
  const year = dateString.split('-')[0];
  return `${year}-12-31`;
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
