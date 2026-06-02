import { getOfflineMode } from '../offlineService';

// Wraps a Firestore-mutating operation with offline-queue semantics.
//
//   action        - syncQueue action name (e.g. 'create_item')
//   buildPayload  - () => payload | Promise<payload>; called ONLY when an
//                   enqueue is needed (offline, or online attempt failed with
//                   lost connectivity). Built lazily so the happy online path
//                   does no extra Dexie reads.
//   onlineFn      - async; performs the real Firestore write when online.
//   queueFn       - async (action, payload) => void; enqueues to syncQueue.
//   isOffline     - injectable for tests; defaults to getOfflineMode.
//   isOnline      - injectable for tests; defaults to navigator.onLine.
//
// The SAME `buildPayload` feeds both the offline short-circuit and the
// catch-block fallback, so the two payloads can never drift.
export async function runWithOfflineQueue({
  action,
  buildPayload,
  onlineFn,
  queueFn,
  isOffline = getOfflineMode,
  isOnline = () => navigator.onLine,
}) {
  if (isOffline()) {
    await queueFn(action, await buildPayload());
    return;
  }
  try {
    await onlineFn();
  } catch (err) {
    if (!isOnline()) {
      await queueFn(action, await buildPayload());
    } else {
      throw err;
    }
  }
}
