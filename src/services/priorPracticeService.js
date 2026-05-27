const KEY = 'drummate_prior_hours';

export function getPriorHours() {
  return Number(globalThis.localStorage.getItem(KEY)) || 0;
}

export async function setPriorHours(hours, backend, userId) {
  const value = Math.floor(Math.max(0, hours));
  globalThis.localStorage.setItem(KEY, String(value));
  if (backend && userId) {
    await backend.setUserSetting(userId, 'priorPracticeHours', value);
  }
}

export async function initPriorHours(backend, userId) {
  try {
    const settings = await backend.getUserSettings(userId);
    if (settings?.priorPracticeHours != null) {
      globalThis.localStorage.setItem(KEY, String(settings.priorPracticeHours));
    }
  } catch (err) {
    console.error('initPriorHours failed; keeping cached value', err);
  }
}
