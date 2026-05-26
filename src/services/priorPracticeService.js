const KEY = 'drummate_prior_hours';

export function getPriorHours() {
  return Number(localStorage.getItem(KEY)) || 0;
}

export async function setPriorHours(hours, backend, userId) {
  const value = Math.floor(Math.max(0, hours));
  localStorage.setItem(KEY, String(value));
  await backend.setUserSetting(userId, 'priorPracticeHours', value);
}

export async function initPriorHours(backend, userId) {
  const settings = await backend.getUserSettings(userId);
  if (settings?.priorPracticeHours != null) {
    localStorage.setItem(KEY, String(settings.priorPracticeHours));
  }
}
