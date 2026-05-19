let isOffline = false;

export function getOfflineMode() {
  return isOffline;
}

export function setOfflineMode(value) {
  isOffline = !!value;
}
