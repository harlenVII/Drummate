const STORAGE_KEY = 'drummate_timezone';
const DEFAULT_TZ = 'America/Los_Angeles';

function isValidTz(tz) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function readCache() {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (v && isValidTz(v)) return v;
  } catch {
    // localStorage unavailable; fall through
  }
  return null;
}

let currentTz = readCache() ?? DEFAULT_TZ;

export function getTimezone() {
  return currentTz;
}

export async function setTimezone(tz, backend = null, userId = null) {
  if (!isValidTz(tz)) {
    throw new Error(`Invalid timezone: ${tz}`);
  }
  currentTz = tz;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, tz);
  } catch {
    // ignore
  }
  if (backend && userId) {
    backend.setUserSetting(userId, 'timezone', tz).catch(console.error);
  }
}

export async function initTimezone(backend, userId) {
  if (!backend || !userId) return;
  try {
    const settings = await backend.getUserSettings(userId);
    if (settings?.timezone && isValidTz(settings.timezone)) {
      currentTz = settings.timezone;
      try { globalThis.localStorage?.setItem(STORAGE_KEY, currentTz); } catch {}
      return;
    }
    // No remote value yet — write the backfill default for this user.
    await backend.setUserSetting(userId, 'timezone', DEFAULT_TZ);
    currentTz = DEFAULT_TZ;
    try { globalThis.localStorage?.setItem(STORAGE_KEY, currentTz); } catch {}
  } catch (err) {
    console.error('initTimezone failed; keeping cached value', err);
  }
}

export function detectDeviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}
