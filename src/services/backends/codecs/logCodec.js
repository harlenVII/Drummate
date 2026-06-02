// Practice-logs codec. Logs are special: they need parent-item resolution
// (itemId/itemUid come from the resolved local item, not the remote doc) and
// loggedAt derivation. So toLocal/diff take an extra `localItem` arg and there
// is no toRemote here (push shape differs / item lookup lives in pushLog).
//
// Uses named exports (not an object literal) because the signatures differ
// from the other codecs; the codecs index re-exports this as a namespace.
import { resolveLoggedAt } from '../resolveLoggedAt.js';

export const table = 'practiceLogs';

export function toLocal(data, localItem) {
  return {
    itemId: localItem.id,
    itemUid: localItem.uid,
    date: data.date,
    duration: data.duration,
    uid: data.uid,
    loggedAt: resolveLoggedAt(data),
    syncedOnce: true,
  };
}

export function diff(data, existing, localItem) {
  if (!existing) return { action: 'add', fields: toLocal(data, localItem) };
  const fields = {};
  if (existing.itemUid !== localItem.uid || existing.itemId !== localItem.id) {
    fields.itemUid = localItem.uid;
    fields.itemId = localItem.id;
  }
  const remoteLoggedAt = resolveLoggedAt(data);
  if (remoteLoggedAt != null && existing.loggedAt !== remoteLoggedAt) {
    fields.loggedAt = remoteLoggedAt;
    fields.date = data.date;
  }
  if (!existing.syncedOnce) fields.syncedOnce = true;
  return { action: Object.keys(fields).length ? 'update' : 'skip', fields };
}
