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

  isNetworkError(err) {
    return err?.code === 'auth/network-request-failed';
  },

  // Sync — push
  async pushItem(localItem, userId) {
    if (!localItem.uid) {
      console.error('pushItem: missing uid', localItem);
      return;
    }
    try {
      const data = {
        uid: localItem.uid,
        name: localItem.name,
        category: localItem.category ?? 'fundamentals',
        created: serverTimestamp(),
      };
      if (localItem.sortOrder != null) data.sort_order = localItem.sortOrder;
      data.archived = localItem.archived ?? false;
      data.trashed = localItem.trashed ?? false;
      data.trashed_at = localItem.trashedAt || '';
      await setDoc(doc(itemsRef(userId), localItem.uid), data, { merge: true });

      // Mark local as synced so pullAll's deletion reconciliation is safe.
      if (localItem.id != null && !localItem.syncedOnce) {
        await db.practiceItems.update(localItem.id, { syncedOnce: true });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('create_item', { uid: localItem.uid, name: localItem.name });
      } else {
        throw err;
      }
    }
  },

  async pushLog(localLog, userId) {
    try {
      const item = await db.practiceItems.get(localLog.itemId);
      if (!item) return;

      const itemUid = localLog.itemUid || item.uid;

      const logDocRef = doc(logsRef(userId), localLog.uid);
      await setDoc(logDocRef, {
        uid: localLog.uid,
        item_uid: itemUid,
        item_name: item.name,
        date: localLog.date,
        duration: localLog.duration,
        created: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      if (!navigator.onLine) {
        const item = await db.practiceItems.get(localLog.itemId);
        await queueSync('create_log', {
          itemUid: localLog.itemUid || item?.uid,
          itemName: item?.name,
          date: localLog.date,
          duration: localLog.duration,
          uid: localLog.uid,
        });
      } else {
        throw err;
      }
    }
  },

  async pushDeleteItem(uid, userId) {
    try {
      const q = query(logsRef(userId), where('item_uid', '==', uid));
      const snap = await getDocs(q);
      for (const logDoc of snap.docs) {
        await deleteDoc(logDoc.ref);
      }
      await deleteDoc(doc(itemsRef(userId), uid));
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('delete_item', { uid });
      } else {
        throw err;
      }
    }
  },

  async pushRenameItem(uid, newName, userId) {
    try {
      await setDoc(doc(itemsRef(userId), uid), { name: newName }, { merge: true });

      // Update denormalized item_name on this item's logs (human-readable hint).
      const q = query(logsRef(userId), where('item_uid', '==', uid));
      const snap = await getDocs(q);
      for (const logDoc of snap.docs) {
        await updateDoc(logDoc.ref, { item_name: newName });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('rename_item', { uid, newName });
      } else {
        throw err;
      }
    }
  },

  async pushReorder(items, userId) {
    try {
      for (const item of items) {
        const updates = { sort_order: item.sortOrder };
        if (item.category != null) updates.category = item.category;
        await updateDoc(doc(itemsRef(userId), item.uid), updates);
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('reorder', {
          items: items.map(i => ({
            uid: i.uid, sortOrder: i.sortOrder, category: i.category,
          })),
        });
      } else {
        throw err;
      }
    }
  },

  async pushArchiveItem(uid, archived, userId) {
    try {
      await updateDoc(doc(itemsRef(userId), uid), { archived: !!archived });
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('archive_item', { uid, archived: !!archived });
      } else {
        throw err;
      }
    }
  },

  async pushTrashItem(uid, trashed, trashedAt, userId) {
    try {
      await updateDoc(doc(itemsRef(userId), uid), {
        trashed: !!trashed,
        trashed_at: trashedAt || '',
      });
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('trash_item', { uid, trashed: !!trashed, trashedAt: trashedAt || '' });
      } else {
        throw err;
      }
    }
  },

  async pushSetCategory(uid, category, userId) {
    try {
      await updateDoc(doc(itemsRef(userId), uid), { category });
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('set_category', { uid, category });
      } else {
        throw err;
      }
    }
  },

  // Sync — pull
  async pullAll(userId) {
    const itemsSnap = await getDocs(itemsRef(userId));
    const remoteUids = new Set();

    for (const docSnap of itemsSnap.docs) {
      const data = docSnap.data();

      // Legacy doc detection: pre-migration docs were keyed by encodeURIComponent(name)
      // and have no `uid` field. Migrate them inline.
      if (!data.uid) {
        const localByName = await db.practiceItems.where('name').equals(data.name).first();
        const uid = localByName?.uid || crypto.randomUUID();

        await setDoc(doc(itemsRef(userId), uid), {
          uid,
          name: data.name,
          category: data.category ?? 'fundamentals',
          sort_order: data.sort_order ?? 0,
          archived: data.archived ?? false,
          trashed: data.trashed ?? false,
          trashed_at: data.trashed_at || '',
          created: serverTimestamp(),
        }, { merge: true });

        // Backfill item_uid on this item's existing logs in Firestore.
        const logsByName = await getDocs(query(logsRef(userId), where('item_name', '==', data.name)));
        for (const logDoc of logsByName.docs) {
          await updateDoc(logDoc.ref, { item_uid: uid });
        }

        await deleteDoc(docSnap.ref);

        if (localByName && !localByName.uid) {
          await db.practiceItems.update(localByName.id, { uid, syncedOnce: true });
          await db.practiceLogs.where('itemId').equals(localByName.id).modify({ itemUid: uid });
        }

        data.uid = uid;
      }

      // Reconciliation: if remote uid is unknown locally but a same-named local
      // item exists (without a uid), adopt the remote uid (covers two-device
      // migration races).
      let local = await db.practiceItems.where('uid').equals(data.uid).first();
      if (!local) {
        const sameName = await db.practiceItems.where('name').equals(data.name).first();
        if (sameName && !sameName.uid) {
          await db.practiceItems.update(sameName.id, { uid: data.uid, syncedOnce: true });
          await db.practiceLogs.where('itemId').equals(sameName.id).modify({ itemUid: data.uid });
          local = await db.practiceItems.get(sameName.id);
        }
      }

      if (!local) {
        await db.practiceItems.add({
          uid: data.uid,
          name: data.name,
          category: data.category ?? 'fundamentals',
          sortOrder: data.sort_order ?? 0,
          archived: data.archived ?? false,
          trashed: data.trashed ?? false,
          trashedAt: data.trashed_at || null,
          syncedOnce: true,
        });
      } else {
        const updates = {};
        if (data.name != null && local.name !== data.name) updates.name = data.name;
        if (data.sort_order != null && local.sortOrder !== data.sort_order) updates.sortOrder = data.sort_order;
        if (data.archived != null && local.archived !== data.archived) updates.archived = data.archived;
        if (data.trashed != null && local.trashed !== data.trashed) {
          updates.trashed = data.trashed;
          updates.trashedAt = data.trashed_at || null;
        }
        if (data.category !== undefined && local.category !== data.category) {
          updates.category = data.category;
        }
        if (!local.syncedOnce) updates.syncedOnce = true;
        if (Object.keys(updates).length > 0) {
          await db.practiceItems.update(local.id, updates);
        }
      }

      remoteUids.add(data.uid);
    }

    // Pull logs BEFORE reconciling item deletions, so logs whose `item_uid`
    // moved to a different parent (via merge on another device) get remapped
    // locally before their old parent gets deleted.
    const logsSnap = await getDocs(logsRef(userId));
    for (const docSnap of logsSnap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;

      // Resolve the parent item locally — prefer item_uid, fall back to item_name
      // for any legacy log whose item_uid hasn't been backfilled yet.
      let localItem = null;
      if (data.item_uid) {
        localItem = await db.practiceItems.where('uid').equals(data.item_uid).first();
      }
      if (!localItem && data.item_name) {
        localItem = await db.practiceItems.where('name').equals(data.item_name).first();
      }
      if (!localItem) continue;

      const existing = await db.practiceLogs.where('uid').equals(data.uid).first();
      if (existing) {
        // Remap if remote moved this log under a different parent (cross-device merge).
        if (existing.itemUid !== localItem.uid || existing.itemId !== localItem.id) {
          await db.practiceLogs.update(existing.id, {
            itemUid: localItem.uid,
            itemId: localItem.id,
          });
        }
        continue;
      }

      await db.practiceLogs.add({
        itemId: localItem.id,
        itemUid: localItem.uid,
        date: data.date,
        duration: data.duration,
        uid: data.uid,
      });
    }

    // Reconciliation step: any local item that has been synced before but is
    // now missing from the cloud was deleted on another device. Apply the
    // delete locally + cascade logs. Local-only items (syncedOnce=false) are
    // preserved so pushAllLocal can push them up.
    //
    // NOTE: This MUST run AFTER pulling logs, otherwise a cross-device merge
    // would delete logs locally that have been remapped to a different parent
    // on the server.
    const allLocal = await db.practiceItems.toArray();
    for (const local of allLocal) {
      if (local.syncedOnce && !remoteUids.has(local.uid)) {
        await db.practiceLogs.where('itemId').equals(local.id).delete();
        await db.practiceItems.delete(local.id);
      }
    }
  },

  async pushAllLocal(userId) {
    const items = await db.practiceItems.toArray();
    for (const item of items) {
      if (!item.uid) continue;
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
          const local = await db.practiceItems.where('uid').equals(entry.payload.uid).first();
          if (local) await firebaseBackend.pushItem(local, userId);
        } else if (entry.action === 'create_log') {
          const local = await db.practiceLogs.where('uid').equals(entry.payload.uid).first();
          if (local) await firebaseBackend.pushLog(local, userId);
        } else if (entry.action === 'delete_item') {
          await firebaseBackend.pushDeleteItem(entry.payload.uid, userId);
        } else if (entry.action === 'rename_item') {
          await firebaseBackend.pushRenameItem(entry.payload.uid, entry.payload.newName, userId);
        } else if (entry.action === 'reorder') {
          for (const item of entry.payload.items) {
            const updates = { sort_order: item.sortOrder };
            if (item.category != null) updates.category = item.category;
            await updateDoc(doc(itemsRef(userId), item.uid), updates);
          }
        } else if (entry.action === 'archive_item') {
          await firebaseBackend.pushArchiveItem(entry.payload.uid, entry.payload.archived, userId);
        } else if (entry.action === 'trash_item') {
          await firebaseBackend.pushTrashItem(entry.payload.uid, entry.payload.trashed, entry.payload.trashedAt, userId);
        } else if (entry.action === 'set_category') {
          await firebaseBackend.pushSetCategory(entry.payload.uid, entry.payload.category, userId);
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

        // Skip legacy docs in the live stream — pullAll handles their migration.
        if (!data.uid) continue;

        if (change.type === 'added') {
          const existing = await db.practiceItems.where('uid').equals(data.uid).first();
          if (!existing) {
            const maxOrder = await db.practiceItems.orderBy('sortOrder').last();
            const sortOrder = data.sort_order ?? (maxOrder ? maxOrder.sortOrder + 1 : 0);
            await db.practiceItems.add({
              uid: data.uid,
              name: data.name,
              category: data.category ?? 'fundamentals',
              sortOrder,
              archived: data.archived ?? false,
              trashed: data.trashed ?? false,
              trashedAt: data.trashed_at || null,
              syncedOnce: true,
            });
            onDataChanged();
          }
        } else if (change.type === 'modified') {
          const local = await db.practiceItems.where('uid').equals(data.uid).first();
          if (!local) continue;
          const updates = {};
          if (data.name != null && local.name !== data.name) updates.name = data.name;
          if (data.sort_order != null && local.sortOrder !== data.sort_order) updates.sortOrder = data.sort_order;
          if (data.archived != null && local.archived !== data.archived) updates.archived = data.archived;
          if (data.trashed != null && local.trashed !== data.trashed) {
            updates.trashed = data.trashed;
            updates.trashedAt = data.trashed_at || null;
          }
          if (data.category !== undefined && local.category !== data.category) {
            updates.category = data.category;
          }
          if (!local.syncedOnce) updates.syncedOnce = true;
          if (Object.keys(updates).length > 0) {
            await db.practiceItems.update(local.id, updates);
            onDataChanged();
          }
        } else if (change.type === 'removed') {
          const existing = await db.practiceItems.where('uid').equals(data.uid).first();
          if (existing) {
            // Safe cascade: in the uid model, "removed" means truly deleted
            // (not a rename — renames are now in-place modifications).
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
        if (!data.uid) continue;

        if (change.type === 'added') {
          const existing = await db.practiceLogs.where('uid').equals(data.uid).first();
          if (existing) continue;

          let localItem = null;
          if (data.item_uid) {
            localItem = await db.practiceItems.where('uid').equals(data.item_uid).first();
          }
          if (!localItem && data.item_name) {
            localItem = await db.practiceItems.where('name').equals(data.item_name).first();
          }
          if (!localItem) continue;

          await db.practiceLogs.add({
            itemId: localItem.id,
            itemUid: localItem.uid,
            date: data.date,
            duration: data.duration,
            uid: data.uid,
          });
          onDataChanged();
        } else if (change.type === 'removed') {
          const existing = await db.practiceLogs.where('uid').equals(data.uid).first();
          if (existing) {
            await db.practiceLogs.delete(existing.id);
            onDataChanged();
          }
        }
        // 'modified' on logs is a no-op: only the denormalized item_name field
        // changes on rename, and we don't store item_name locally.
      }
    });

    return () => {
      unsubItems();
      unsubLogs();
    };
  },
};

export default firebaseBackend;
