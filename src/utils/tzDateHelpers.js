const LEGACY_BACKFILL_TZ = 'America/Los_Angeles';

const cachedFormatters = new Map();

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

// Returns the UTC offset (ms) for a given UTC instant when viewed in `tz`.
// Positive when tz is east of UTC (e.g. JST = +9h => +9*3600*1000).
function getTzOffsetMs(epochMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const get = (type) => Number(parts.find(p => p.type === type).value);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - epochMs;
}

// Converts "YYYY-MM-DD HH:mm:ss in tz" to the matching UTC epoch ms.
// Two-pass offset resolution handles DST transitions correctly.
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

export function noonInHomeTz(dateStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return tzLocalToUtcMs(y, m, d, 12, 0, 0, tz);
}

export function legacyDateToLoggedAt(dateStr) {
  return noonInHomeTz(dateStr, LEGACY_BACKFILL_TZ);
}
