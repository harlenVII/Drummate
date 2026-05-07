/**
 * Backend Interface — every backend must export an object matching this shape.
 *
 * Identity model: practice items are identified by a stable `uid` (UUID
 * generated at creation). Names are mutable display labels. All sync push
 * methods take `uid` so that renames and deletes propagate correctly across
 * devices that may have been offline.
 *
 * Auth methods:
 *   signIn(email, password) → { id, email, name }
 *   signUp(email, password, name) → { id, email, name }
 *   signOut() → void
 *   getUser() → { id, email, name } | null
 *   onAuthChange(callback: (user | null) => void) → unsubscribe: () => void
 *   refreshAuth() → { id, email, name } | null  (throws if token invalid)
 *   isAbortError(err) → boolean  (true if err is from a cancelled request)
 *   isNetworkError(err) → boolean  (true if err is from a network failure, not auth rejection)
 *
 * Sync methods:
 *   pushItem(localItem, userId) → void
 *     localItem must include: { uid, name, category, sortOrder?, archived?, trashed?, trashedAt? }
 *   pushLog(localLog, userId) → void
 *     localLog must include: { uid, itemUid, date, duration }
 *   pushDeleteItem(uid, userId) → void
 *   pushRenameItem(uid, newName, userId) → void
 *   pushReorder(items, userId) → void       // items: [{ uid, sortOrder, category? }]
 *   pushArchiveItem(uid, archived, userId) → void
 *   pushTrashItem(uid, trashed, trashedAt, userId) → void
 *   pushSetCategory(uid, category, userId) → void
 *   pullAll(userId) → void
 *   pushAllLocal(userId) → void
 *   flushSyncQueue(userId) → void
 *   subscribeToChanges(onDataChanged: () => void) → unsubscribe: () => void
 *
 * The `user` object returned by auth methods must have at minimum:
 *   { id: string, email: string, name: string | null }
 */
export const BACKEND_TYPES = {
  POCKETBASE: 'pocketbase',
  FIREBASE: 'firebase',
};
