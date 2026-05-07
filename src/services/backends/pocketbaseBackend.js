import { pb } from '../pocketbase';
import {
  pushItem, pushLog, pushDeleteItem, pushRenameItem, pushReorder,
  pushArchiveItem, pushTrashItem, pushSetCategory,
  pullAll, pushAllLocal, flushSyncQueue, subscribeToChanges,
} from '../sync';

function normalizeUser(record) {
  if (!record) return null;
  return { id: record.id, email: record.email, name: record.name || null };
}

const pocketbaseBackend = {
  name: 'pocketbase',

  // Auth
  async signIn(email, password) {
    await pb.collection('users').authWithPassword(email, password);
    return normalizeUser(pb.authStore.record);
  },

  async signUp(email, password, name) {
    await pb.collection('users').create({
      email, password, passwordConfirm: password, name,
    });
    await pb.collection('users').authWithPassword(email, password);
    return normalizeUser(pb.authStore.record);
  },

  signOut() {
    pb.authStore.clear();
  },

  getUser() {
    return normalizeUser(pb.authStore.record);
  },

  onAuthChange(callback) {
    return pb.authStore.onChange((_token, record) => {
      callback(normalizeUser(record));
    });
  },

  async refreshAuth() {
    await pb.collection('users').authRefresh({ requestKey: 'auth-refresh' });
    return normalizeUser(pb.authStore.record);
  },

  isAbortError(err) {
    return !!err?.isAbort;
  },

  isNetworkError(err) {
    // PocketBase ClientResponseError with status 0 = no response received (network down, DNS failure, etc.)
    return err?.status === 0 || err?.originalError?.name === 'TypeError';
  },

  // Sync
  pushItem,
  pushLog,
  pushDeleteItem,
  pushRenameItem,
  pushReorder,
  pushArchiveItem,
  pushTrashItem,
  pushSetCategory,
  pullAll,
  pushAllLocal,
  flushSyncQueue,
  subscribeToChanges,
};

export default pocketbaseBackend;
