import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection, query, where, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
} from 'firebase/firestore';
import { getFirebaseApp } from '../firebase';
import { db } from '../database';

function normalizeUser(fbUser) {
  if (!fbUser) return null;
  return { id: fbUser.uid, email: fbUser.email, name: fbUser.displayName || null };
}

// --- Helpers ---

function itemsRef(userId) {
  const { db: firestore } = getFirebaseApp();
  return collection(firestore, 'users', userId, 'practice_items');
}

function logsRef(userId) {
  const { db: firestore } = getFirebaseApp();
  return collection(firestore, 'users', userId, 'practice_logs');
}

async function findRemoteItemByName(userId, name) {
  const q = query(itemsRef(userId), where('name', '==', name));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0];
}

async function findRemoteLogByUid(userId, uid) {
  const q = query(logsRef(userId), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0];
}

// --- Offline sync queue (reuses Dexie syncQueue table) ---

async function queueSync(action, payload) {
  await db.syncQueue.add({ action, payload });
}

// --- Backend ---

const firebaseBackend = {
  name: 'firebase',

  // Auth
  async signIn(email, password) {
    const { auth } = getFirebaseApp();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return normalizeUser(cred.user);
  },

  async signUp(email, password, name) {
    const { auth } = getFirebaseApp();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      await updateProfile(cred.user, { displayName: name });
    }
    return normalizeUser(cred.user);
  },

  signOut() {
    const { auth } = getFirebaseApp();
    firebaseSignOut(auth);
  },

  getUser() {
    const { auth } = getFirebaseApp();
    return normalizeUser(auth.currentUser);
  },

  onAuthChange(callback) {
    const { auth } = getFirebaseApp();
    return onAuthStateChanged(auth, (fbUser) => {
      callback(normalizeUser(fbUser));
    });
  },

  async refreshAuth() {
    const { auth } = getFirebaseApp();
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('No user signed in');
    await fbUser.reload();
    return normalizeUser(auth.currentUser);
  },

  isAbortError() {
    return false; // Firebase doesn't have auto-cancellation like PocketBase
  },

  // Sync — push
  async pushItem(localItem, userId) {
    try {
      // Deterministic doc ID based on name — setDoc is idempotent, prevents duplicates
      const docId = encodeURIComponent(localItem.name);
      const data = { name: localItem.name, created: serverTimestamp() };
      if (localItem.sortOrder != null) data.sort_order = localItem.sortOrder;
      data.archived = localItem.archived ?? false;
      data.trashed = localItem.trashed ?? false;
      data.trashed_at = localItem.trashedAt || '';
      await setDoc(doc(itemsRef(userId), docId), data, { merge: true });
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('create_item', { name: localItem.name });
      } else {
        throw err;
      }
    }
  },

  async pushLog(localLog, userId) {
    try {
      const item = await db.practiceItems.get(localLog.itemId);
      if (!item) return;

      const remoteItemDocId = encodeURIComponent(item.name);
      const remoteItem = await findRemoteItemByName(userId, item.name);
      if (!remoteItem) {
        await queueSync('create_log', {
          itemName: item.name, date: localLog.date,
          duration: localLog.duration, uid: localLog.uid,
        });
        return;
      }

      // Use uid as doc ID to prevent duplicates from race conditions
      const logDocRef = doc(logsRef(userId), localLog.uid);
      await setDoc(logDocRef, {
        item_name: item.name,
        date: localLog.date,
        duration: localLog.duration,
        uid: localLog.uid,
        created: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      if (!navigator.onLine) {
        const item = await db.practiceItems.get(localLog.itemId);
        await queueSync('create_log', {
          itemName: item?.name, date: localLog.date,
          duration: localLog.duration, uid: localLog.uid,
        });
      } else {
        throw err;
      }
    }
  },

  async pushDeleteItem(name, userId) {
    try {
      const docId = encodeURIComponent(name);
      // Delete all logs for this item
      const q = query(logsRef(userId), where('item_name', '==', name));
      const snap = await getDocs(q);
      for (const logDoc of snap.docs) {
        await deleteDoc(logDoc.ref);
      }
      await deleteDoc(doc(itemsRef(userId), docId));
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('delete_item', { name });
      } else {
        throw err;
      }
    }
  },

  async pushRenameItem(oldName, newName, userId) {
    try {
      // Delete old doc and create new one with new deterministic ID
      const oldDocId = encodeURIComponent(oldName);
      const newDocId = encodeURIComponent(newName);
      const oldRef = doc(itemsRef(userId), oldDocId);
      const newRef = doc(itemsRef(userId), newDocId);

      await setDoc(newRef, { name: newName, created: serverTimestamp() }, { merge: true });
      await deleteDoc(oldRef);

      // Also update denormalized item_name in logs
      const q = query(logsRef(userId), where('item_name', '==', oldName));
      const snap = await getDocs(q);
      for (const logDoc of snap.docs) {
        await updateDoc(logDoc.ref, { item_name: newName });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('rename_item', { oldName, newName });
      } else {
        throw err;
      }
    }
  },

  async pushReorder(items, userId) {
    try {
      for (const item of items) {
        const docId = encodeURIComponent(item.name);
        await updateDoc(doc(itemsRef(userId), docId), { sort_order: item.sortOrder });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('reorder', { items: items.map(i => ({ name: i.name, sortOrder: i.sortOrder })) });
      } else {
        throw err;
      }
    }
  },

  async pushArchiveItem(name, archived, userId) {
    try {
      const docId = encodeURIComponent(name);
      await updateDoc(doc(itemsRef(userId), docId), { archived: !!archived });
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('archive_item', { name, archived: !!archived });
      } else {
        throw err;
      }
    }
  },

  async pushTrashItem(name, trashed, trashedAt, userId) {
    try {
      const docId = encodeURIComponent(name);
      await updateDoc(doc(itemsRef(userId), docId), {
        trashed: !!trashed,
        trashed_at: trashedAt || '',
      });
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('trash_item', { name, trashed: !!trashed, trashedAt: trashedAt || '' });
      } else {
        throw err;
      }
    }
  },

  // Sync — pull
  async pullAll(userId) {
    const itemsSnap = await getDocs(itemsRef(userId));
    for (const docSnap of itemsSnap.docs) {
      const data = docSnap.data();
      const existing = await db.practiceItems
        .where('name').equals(data.name).first();
      if (!existing) {
        await db.practiceItems.add({
          name: data.name,
          sortOrder: data.sort_order ?? 0,
          archived: data.archived ?? false,
          trashed: data.trashed ?? false,
          trashedAt: data.trashed_at || null,
        });
      } else {
        const updates = {};
        if (data.sort_order != null && existing.sortOrder !== data.sort_order) {
          updates.sortOrder = data.sort_order;
        }
        if (data.archived != null && existing.archived !== data.archived) {
          updates.archived = data.archived;
        }
        if (data.trashed != null && existing.trashed !== data.trashed) {
          updates.trashed = data.trashed;
          updates.trashedAt = data.trashed_at || null;
        }
        if (Object.keys(updates).length > 0) {
          await db.practiceItems.update(existing.id, updates);
        }
      }
    }

    const logsSnap = await getDocs(logsRef(userId));
    for (const docSnap of logsSnap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;
      const existing = await db.practiceLogs
        .where('uid').equals(data.uid).first();
      if (!existing) {
        const localItem = await db.practiceItems
          .where('name').equals(data.item_name).first();
        if (localItem) {
          await db.practiceLogs.add({
            itemId: localItem.id,
            date: data.date,
            duration: data.duration,
            uid: data.uid,
          });
        }
      }
    }
  },

  async pushAllLocal(userId) {
    const items = await db.practiceItems.toArray();
    for (const item of items) {
      await firebaseBackend.pushItem(item, userId);
    }
    const logs = await db.practiceLogs.toArray();
    for (const log of logs) {
      await firebaseBackend.pushLog(log, userId);
    }
  },

  async flushSyncQueue(userId) {
    const pending = await db.syncQueue.toArray();
    for (const entry of pending) {
      try {
        if (entry.action === 'create_item') {
          await firebaseBackend.pushItem({ name: entry.payload.name }, userId);
        } else if (entry.action === 'create_log') {
          const localItem = await db.practiceItems
            .where('name').equals(entry.payload.itemName).first();
          if (localItem) {
            await firebaseBackend.pushLog({
              itemId: localItem.id, date: entry.payload.date,
              duration: entry.payload.duration, uid: entry.payload.uid,
            }, userId);
          }
        } else if (entry.action === 'delete_item') {
          await firebaseBackend.pushDeleteItem(entry.payload.name, userId);
        } else if (entry.action === 'rename_item') {
          await firebaseBackend.pushRenameItem(
            entry.payload.oldName, entry.payload.newName, userId);
        } else if (entry.action === 'reorder') {
          for (const item of entry.payload.items) {
            const docId = encodeURIComponent(item.name);
            await updateDoc(doc(itemsRef(userId), docId), { sort_order: item.sortOrder });
          }
        } else if (entry.action === 'archive_item') {
          await firebaseBackend.pushArchiveItem(entry.payload.name, entry.payload.archived, userId);
        } else if (entry.action === 'trash_item') {
          await firebaseBackend.pushTrashItem(entry.payload.name, entry.payload.trashed, entry.payload.trashedAt, userId);
        }
        await db.syncQueue.delete(entry.id);
      } catch (err) {
        console.error('Sync queue flush failed for entry:', entry, err);
        break;
      }
    }
  },

  // Real-time subscriptions
  subscribeToChanges(onDataChanged) {
    const { auth } = getFirebaseApp();
    const userId = auth.currentUser?.uid;
    if (!userId) return () => {};

    const unsubItems = onSnapshot(itemsRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (change.type === 'added') {
          const existing = await db.practiceItems
            .where('name').equals(data.name).first();
          if (!existing) {
            const maxOrder = await db.practiceItems.orderBy('sortOrder').last();
            const sortOrder = data.sort_order ?? (maxOrder ? maxOrder.sortOrder + 1 : 0);
            await db.practiceItems.add({
              name: data.name,
              sortOrder,
              archived: data.archived ?? false,
              trashed: data.trashed ?? false,
              trashedAt: data.trashed_at || null,
            });
            onDataChanged();
          }
        } else if (change.type === 'modified') {
          const localItem = await db.practiceItems
            .where('name').equals(data.name).first();
          if (localItem) {
            const updates = {};
            if (data.sort_order != null && localItem.sortOrder !== data.sort_order) {
              updates.sortOrder = data.sort_order;
            }
            if (data.archived != null && localItem.archived !== data.archived) {
              updates.archived = data.archived;
            }
            if (data.trashed != null && localItem.trashed !== data.trashed) {
              updates.trashed = data.trashed;
              updates.trashedAt = data.trashed_at || null;
            }
            if (Object.keys(updates).length > 0) {
              await db.practiceItems.update(localItem.id, updates);
            }
          }
          // Handle renames: find local item with old name
          const allLocal = await db.practiceItems.toArray();
          const allRemoteNames = new Set();
          const itemsSnap = await getDocs(itemsRef(userId));
          itemsSnap.forEach(d => allRemoteNames.add(d.data().name));
          const stale = allLocal.find(li => !allRemoteNames.has(li.name));
          if (stale) {
            await db.practiceItems.update(stale.id, { name: data.name });
          }
          onDataChanged();
        } else if (change.type === 'removed') {
          const existing = await db.practiceItems
            .where('name').equals(data.name).first();
          if (existing) {
            await db.practiceLogs.where('itemId').equals(existing.id).delete();
            await db.practiceItems.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });

    const unsubLogs = onSnapshot(logsRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (change.type === 'added' && data.uid) {
          const existing = await db.practiceLogs
            .where('uid').equals(data.uid).first();
          if (!existing) {
            const localItem = await db.practiceItems
              .where('name').equals(data.item_name).first();
            if (localItem) {
              await db.practiceLogs.add({
                itemId: localItem.id,
                date: data.date,
                duration: data.duration,
                uid: data.uid,
              });
              onDataChanged();
            }
          }
        } else if (change.type === 'removed' && data.uid) {
          const existing = await db.practiceLogs
            .where('uid').equals(data.uid).first();
          if (existing) {
            await db.practiceLogs.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });

    return () => {
      unsubItems();
      unsubLogs();
    };
  },
};

export default firebaseBackend;
