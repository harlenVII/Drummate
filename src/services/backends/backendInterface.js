/**
 * Backend Interface — every backend must export an object matching this shape.
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
 *   pushLog(localLog, userId) → void
 *   pushDeleteItem(name, userId) → void
 *   pushRenameItem(oldName, newName, userId) → void
 *   pushReorder(items, userId) → void       // items: [{ name, sortOrder }]
 *   pushArchiveItem(name, archived, userId) → void
 *   pushTrashItem(name, trashed, trashedAt, userId) → void
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
