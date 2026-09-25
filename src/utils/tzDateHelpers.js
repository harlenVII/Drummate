// Original app data was logged by users in the Pacific timezone; legacy
// rows are anchored here when migrating to UTC instants.
const LEGACY_BACKFILL_TZ = 'America/Los_Angeles';

const cachedFormatters = new Map();
const cachedOffsetFormatters = new Map();
const cachedClockFormatters = new Map();

function getOffsetFormatter(tz) {
  let f = cachedOffsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    cachedOffsetFormatters.set(tz, f);
  }
  return f;
}

function getYmdFormatter(tz) {
  let f = cachedFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    cachedFormatters.set(tz, f);
  }
  return f;
}

export function formatInTimezone(epochMs, tz) {
  return getYmdFormatter(tz).format(new Date(epochMs));
}

// Clock formatter for session times. hourCycle 'h23' rather than
// hour12: false: some engines map hour12: false to h24 and render just after
// midnight as "24:07".
function getClockFormatter(tz) {
  let f = cachedClockFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    cachedClockFormatters.set(tz, f);
  }
  return f;
}

// "HH:MM" (24-hour, 00-23) for a UTC instant viewed in `tz`.
export function formatClockInTimezone(epochMs, tz) {
  const parts = getClockFormatter(tz).formatToParts(new Date(epochMs));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('hour')}:${get('minute')}`;
}

// Returns the UTC offset (ms) for a given UTC instant when viewed in `tz`.
// Positive when tz is east of UTC (e.g. JST = +9h => +9*3600*1000).
function getTzOffsetMs(epochMs, tz) {
  const dtf = getOffsetFormatter(tz);
  const parts = dtf.formatToParts(new Date(epochMs));
  const get = (type) => Number(parts.find(p => p.type === type).value);
  let hour = get('hour');
  // V8/WebKit advance the day rather than returning 24; this guard is
  // defensive for engines that return 24 without rolling the date.
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - epochMs;
}

/**
 * Convert a local wall-clock time in `tz` to a UTC epoch ms.
 *
 * Uses a two-pass offset probe: this is correct for any local time that
 * unambiguously exists in `tz`. Callers MUST NOT pass a local time inside
 * a spring-forward DST gap (e.g. 02:30 on a spring-forward Sunday in PT) —
 * the algorithm will return a nonsensical instant for those inputs. All
 * current callers use midnight (00:00) or noon (12:00), which are safe
 * in every timezone.
 */
function tzLocalToUtcMs(year, month, day, hour, minute, second, tz) {
  // First guess: pretend the local time is UTC, then subtract the offset at that instant.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = getTzOffsetMs(guess, tz);
  const candidate = guess - offset1;
  // Re-check the offset at the candidate; if it differs (DST boundary), use the second offset.
  const offset2 = getTzOffsetMs(candidate, tz);
  return guess - offset2;
}

export function getDateRangeUtc(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const startMs = tzLocalToUtcMs(y, m, d, 0, 0, 0, tz);
  // Next-day midnight via Date math on the source numbers (UTC arithmetic on the y/m/d triple).
  const nextMidnightUtc = Date.UTC(y, m - 1, d + 1);
  const nextY = new Date(nextMidnightUtc).getUTCFullYear();
  const nextM = new Date(nextMidnightUtc).getUTCMonth() + 1;
  const nextD = new Date(nextMidnightUtc).getUTCDate();
  const endMsExclusive = tzLocalToUtcMs(nextY, nextM, nextD, 0, 0, 0, tz);
  return { startMs, endMsExclusive };
}

// 23:59:59 local on `dateStr`: one second before the next local midnight.
// Built from getDateRangeUtc, not tzLocalToUtcMs(..., 23, 59, 59), which is
// only documented safe for 00:00 and 12:00.
export function lastSecondOfDay(dateStr, tz) {
  return getDateRangeUtc(dateStr, tz).endMsExclusive - 1000;
}

export function noonInHomeTz(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return tzLocalToUtcMs(y, m, d, 12, 0, 0, tz);
}

export function legacyDateToLoggedAt(dateStr) {
  return noonInHomeTz(dateStr, LEGACY_BACKFILL_TZ);
}
