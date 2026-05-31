/**
 * localStorage access that never throws. Returns null / no-ops when storage is
 * unavailable (private mode, quota exceeded, disabled storage).
 */
export function getItem(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setItem(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // best-effort persistence; ignore
  }
}
