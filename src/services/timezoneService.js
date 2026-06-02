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

// Module contract: `initTimezone` must be called once on auth resolve,
// before any UI surface that can call `setTimezone` becomes interactive.
// The sync init effect runs `initTimezone` before the reactive UI settles,
// so the order is enforced by the auth effect — there is no in-flight guard here.
let currentTz = readCache() ?? DEFAULT_TZ;

// Pub/sub so reactive consumers (useTimezone → liveQuery deps) re-bucket
// when the home timezone changes at runtime. Mirrors themeService. Only
// setTimezone (a deliberate runtime change) broadcasts; initTimezone updates
// currentTz directly at boot, before any subscriber exists.
const listeners = new Set();

export function subscribeTimezone(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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
  listeners.forEach((l) => l());
}

export async function initTimezone(backend, userId) {
  if (!backend || !userId) return;
  try {
    const settings = await backend.getUserSettings(userId);
    if (settings?.timezone && isValidTz(settings.timezone)) {
      currentTz = settings.timezone;
      try { globalThis.localStorage?.setItem(STORAGE_KEY, currentTz); } catch { /* localStorage unavailable */ }
      return;
    }
    // No remote value yet — backfill with the resolved current value (which
    // may be the default or a localStorage-cached value).
    await backend.setUserSetting(userId, 'timezone', currentTz);
    try { globalThis.localStorage?.setItem(STORAGE_KEY, currentTz); } catch { /* localStorage unavailable */ }
    console.info('timezoneService: backfilled default for new user');
  } catch (err) {
    console.error('initTimezone failed; keeping cached value', err);
  }
}

