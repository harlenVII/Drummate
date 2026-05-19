import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection, query, where, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, doc,
} from 'firebase/firestore';
import { getFirebaseApp } from '../firebase';
import { db } from '../database';
import { legacyDateToLoggedAt } from '../../utils/tzDateHelpers.js';
import { getOfflineMode } from '../offlineService';

function normalizeUser(fbUser) {
  if (!fbUser) return null;
  return { id: fbUser.uid, email: fbUser.email, name: fbUser.displayName || null };
}

function resolveLoggedAt(remote) {
  if (typeof remote.logged_at === 'number') return remote.logged_at;
  if (remote.date) return legacyDateToLoggedAt(remote.date);
  // Malformed remote doc (no date, no logged_at). Return null so the
  // local row is visibly broken rather than getting a phantom Date.now()
  // stamp that masquerades as a real practice instant.
  return null;
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

function notesRef(userId) {
  const { db: firestore } = getFirebaseApp();
  return collection(firestore, 'users', userId, 'notes');
}

function practicesRef(userId) {
  const { db: firestore } = getFirebaseApp();
  return collection(firestore, 'users', userId, 'metronomePractices');
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
    if (getOfflineMode()) {
      await queueSync('create_item', {
        uid: localItem.uid,
        name: localItem.name,
        displayName: localItem.name,
      });
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
    if (getOfflineMode()) {
      const item = await db.practiceItems.get(localLog.itemId);
      await queueSync('create_log', {
        itemUid: localLog.itemUid || item?.uid,
        itemName: item?.name,
        date: localLog.date,
        duration: localLog.duration,
        uid: localLog.uid,
      });
      return;
    }
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
        logged_at: localLog.loggedAt ?? legacyDateToLoggedAt(localLog.date),
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

  async pushNote(localNote, userId) {
    if (!localNote.uid) {
      console.error('pushNote: missing uid', localNote);
      return;
    }
    if (!localNote.itemUid) {
      console.error('pushNote: missing itemUid', localNote);
      return;
    }
    if (getOfflineMode()) {
      const item = await db.practiceItems.where('uid').equals(localNote.itemUid).first();
      await queueSync('push_note', {
        uid: localNote.uid,
        itemUid: localNote.itemUid,
        itemName: item?.name,
        date: localNote.date,
        body: localNote.body ?? '',
        trashed: !!localNote.trashed,
        trashedAt: localNote.trashedAt || '',
        createdAt: localNote.createdAt || '',
      });
      return;
    }
    try {
      await setDoc(doc(notesRef(userId), localNote.uid), {
        uid: localNote.uid,
        item_uid: localNote.itemUid,
        date: localNote.date,
        body: localNote.body ?? '',
        trashed: !!localNote.trashed,
        trashed_at: localNote.trashedAt || '',
        created_at: localNote.createdAt || '',
        updated_at: serverTimestamp(),
      }, { merge: true });

      if (localNote.id != null && !localNote.syncedOnce) {
        await db.notes.update(localNote.id, { syncedOnce: true });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('push_note', {
          uid: localNote.uid,
          itemUid: localNote.itemUid,
          date: localNote.date,
          body: localNote.body ?? '',
          trashed: !!localNote.trashed,
          trashedAt: localNote.trashedAt || '',
          createdAt: localNote.createdAt || '',
        });
      } else {
        throw err;
      }
    }
  },

  async deleteNoteRemote(noteUid, userId) {
    if (getOfflineMode()) {
      await queueSync('delete_note', { uid: noteUid });
      return;
    }
    try {
      await deleteDoc(doc(notesRef(userId), noteUid));
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('delete_note', { uid: noteUid });
      } else {
        throw err;
      }
    }
  },

  async pushPractice(localPractice, userId) {
    if (!localPractice.uid) {
      console.error('pushPractice: missing uid', localPractice);
      return;
    }
    const enrichedPracticePayload = () => ({
      uid: localPractice.uid,
      name: localPractice.name,
      startBpm: localPractice.startBpm,
      endBpm: localPractice.endBpm,
      bpmIncrement: localPractice.bpmIncrement,
      barsPerStep: localPractice.barsPerStep,
      timeSignatureBeats: localPractice.timeSignature?.beats,
      timeSignatureNoteValue: localPractice.timeSignature?.noteValue,
      subdivision: localPractice.subdivision,
      soundType: localPractice.soundType,
      sortOrder: localPractice.sortOrder ?? 0,
      createdAt: localPractice.createdAt || '',
      updatedAt: localPractice.updatedAt || '',
    });
    if (getOfflineMode()) {
      await queueSync('push_practice', enrichedPracticePayload());
      return;
    }
    try {
      await setDoc(doc(practicesRef(userId), localPractice.uid), {
        uid: localPractice.uid,
        name: localPractice.name,
        start_bpm: localPractice.startBpm,
        end_bpm: localPractice.endBpm,
        bpm_increment: localPractice.bpmIncrement,
        bars_per_step: localPractice.barsPerStep,
        time_signature_beats: localPractice.timeSignature.beats,
        time_signature_note_value: localPractice.timeSignature.noteValue,
        subdivision: localPractice.subdivision,
        sound_type: localPractice.soundType,
        sort_order: localPractice.sortOrder ?? 0,
        created_at: localPractice.createdAt || '',
        updated_at: localPractice.updatedAt || '',
      }, { merge: true });

      if (localPractice.id != null && !localPractice.syncedOnce) {
        await db.metronomePractices.update(localPractice.id, { syncedOnce: true });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('push_practice', enrichedPracticePayload());
      } else {
        throw err;
      }
    }
  },

  async pushDeletePractice(uid, userId) {
    if (getOfflineMode()) {
      const local = await db.metronomePractices.where('uid').equals(uid).first();
      await queueSync('delete_practice', {
        uid,
        name: local?.name,
      });
      return;
    }
    try {
      await deleteDoc(doc(practicesRef(userId), uid));
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('delete_practice', { uid });
      } else {
        throw err;
      }
    }
  },

  async pushPracticeReorder(practices, userId) {
    if (getOfflineMode()) {
      await queueSync('reorder_practices', {
        practices: practices.map(({ uid, sortOrder }) => ({ uid, sortOrder })),
      });
      return;
    }
    try {
      for (const p of practices) {
        await updateDoc(doc(practicesRef(userId), p.uid), { sort_order: p.sortOrder });
      }
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('reorder_practices', {
          practices: practices.map(p => ({ uid: p.uid, sortOrder: p.sortOrder })),
        });
      } else {
        throw err;
      }
    }
  },

  async pushDeleteItem(uid, userId) {
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('delete_item', {
        uid,
        displayName: local?.name,
      });
      return;
    }
    try {
      const logQ = query(logsRef(userId), where('item_uid', '==', uid));
      const logSnap = await getDocs(logQ);
      for (const logDoc of logSnap.docs) {
        await deleteDoc(logDoc.ref);
      }
      const noteQ = query(notesRef(userId), where('item_uid', '==', uid));
      const noteSnap = await getDocs(noteQ);
      for (const noteDoc of noteSnap.docs) {
        await deleteDoc(noteDoc.ref);
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
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('rename_item', {
        uid,
        newName,
        previousName: local?.name,
      });
      return;
    }
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
    if (getOfflineMode()) {
      await queueSync('reorder', {
        items: items.map(({ uid, sortOrder, category }) => ({ uid, sortOrder, category })),
      });
      return;
    }
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
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('archive_item', {
        uid,
        archived: !!archived,
        displayName: local?.name,
      });
      return;
    }
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
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('trash_item', {
        uid,
        trashed: !!trashed,
        trashedAt: trashedAt || '',
        displayName: local?.name,
      });
      return;
    }
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
    if (getOfflineMode()) {
      const local = await db.practiceItems.where('uid').equals(uid).first();
      await queueSync('set_category', {
        uid,
        category,
        displayName: local?.name,
      });
      return;
    }
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

  async getUserSettings(userId) {
    const ref = doc(getFirebaseApp().db, 'users', userId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : {};
  },

  async setUserSetting(userId, key, value) {
    const ref = doc(getFirebaseApp().db, 'users', userId);
    await setDoc(ref, { [key]: value }, { merge: true });
  },

  async mergeItems(sourceUid, targetUid, targetName, userId) {
    if (sourceUid === targetUid) return;
    if (getOfflineMode()) {
      const sourceLocal = await db.practiceItems.where('uid').equals(sourceUid).first();
      await queueSync('merge_items', {
        sourceUid,
        targetUid,
        targetName,
        previousName: sourceLocal?.name,
      });
      return;
    }
    try {
      const logQ = query(logsRef(userId), where('item_uid', '==', sourceUid));
      const logSnap = await getDocs(logQ);
      for (const logDoc of logSnap.docs) {
        await updateDoc(logDoc.ref, {
          item_uid: targetUid,
          item_name: targetName,
        });
      }
      const noteQ = query(notesRef(userId), where('item_uid', '==', sourceUid));
      const noteSnap = await getDocs(noteQ);
      for (const noteDoc of noteSnap.docs) {
        await updateDoc(noteDoc.ref, { item_uid: targetUid });
      }
      await deleteDoc(doc(itemsRef(userId), sourceUid));
    } catch (err) {
      if (!navigator.onLine) {
        await queueSync('merge_items', { sourceUid, targetUid, targetName });
      } else {
        throw err;
      }
    }
  },

  // Sync — pull
  async pullAll(userId) {
    const itemsSnap = await getDocs(itemsRef(userId));
    if (itemsSnap.metadata.fromCache) {
      // Server unreachable — snapshot is from the offline cache.
      // Skip reconciliation; deleting locally-synced items based on a
      // cached/empty snapshot is the data-loss bug we're guarding against.
      return;
    }
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
    if (logsSnap.metadata.fromCache) {
      // Cached/offline snapshot — bail before the deletion-reconciliation
      // loop below (same rationale as the itemsSnap guard above).
      return;
    }
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
        loggedAt: resolveLoggedAt(data),
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

  async pullAllNotes(userId) {
    const snap = await getDocs(notesRef(userId));
    if (snap.metadata.fromCache) {
      // Cached/offline snapshot — skip reconciliation to avoid false deletions.
      return;
    }
    const remoteUids = new Set();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;
      remoteUids.add(data.uid);

      const local = await db.notes.where('uid').equals(data.uid).first();
      const fields = {
        uid: data.uid,
        itemUid: data.item_uid,
        date: data.date,
        body: data.body ?? '',
        trashed: !!data.trashed,
        trashedAt: data.trashed_at || null,
        createdAt: data.created_at || '',
        syncedOnce: true,
      };

      if (!local) {
        await db.notes.add(fields);
      } else {
        const updates = {};
        if (data.item_uid && local.itemUid !== data.item_uid) updates.itemUid = data.item_uid;
        if (data.date != null && local.date !== data.date) updates.date = data.date;
        if (data.body != null && local.body !== data.body) updates.body = data.body;
        if (data.trashed != null && local.trashed !== !!data.trashed) {
          updates.trashed = !!data.trashed;
          updates.trashedAt = data.trashed_at || null;
        }
        if (data.created_at && !local.createdAt) updates.createdAt = data.created_at;
        if (!local.syncedOnce) updates.syncedOnce = true;
        if (Object.keys(updates).length > 0) {
          await db.notes.update(local.id, updates);
        }
      }
    }

    // Reconcile deletes: a local note that has been synced before but is
    // missing remotely was deleted on another device.
    const allLocal = await db.notes.toArray();
    for (const local of allLocal) {
      if (local.syncedOnce && !remoteUids.has(local.uid)) {
        await db.notes.delete(local.id);
      }
    }
  },

  async pullAllPractices(userId) {
    const snap = await getDocs(practicesRef(userId));
    if (snap.metadata.fromCache) {
      // Cached/offline snapshot — skip reconciliation to avoid false deletions.
      return;
    }
    const remoteUids = new Set();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;
      remoteUids.add(data.uid);

      const fields = {
        uid: data.uid,
        name: data.name ?? '',
        startBpm: data.start_bpm ?? 60,
        endBpm: data.end_bpm ?? 60,
        bpmIncrement: data.bpm_increment ?? 1,
        barsPerStep: data.bars_per_step ?? 1,
        timeSignature: {
          beats: data.time_signature_beats ?? 4,
          noteValue: data.time_signature_note_value ?? 4,
        },
        subdivision: data.subdivision ?? 'quarter',
        soundType: data.sound_type ?? 'click',
        sortOrder: data.sort_order ?? 0,
        createdAt: data.created_at || '',
        updatedAt: data.updated_at || '',
        syncedOnce: true,
      };

      const local = await db.metronomePractices.where('uid').equals(data.uid).first();
      if (!local) {
        await db.metronomePractices.add(fields);
      } else {
        const updates = {};
        for (const k of ['name', 'startBpm', 'endBpm', 'bpmIncrement', 'barsPerStep',
                         'subdivision', 'soundType', 'sortOrder', 'createdAt', 'updatedAt']) {
          if (fields[k] !== undefined && local[k] !== fields[k]) updates[k] = fields[k];
        }
        if (local.timeSignature?.beats !== fields.timeSignature.beats ||
            local.timeSignature?.noteValue !== fields.timeSignature.noteValue) {
          updates.timeSignature = fields.timeSignature;
        }
        if (!local.syncedOnce) updates.syncedOnce = true;
        if (Object.keys(updates).length > 0) {
          await db.metronomePractices.update(local.id, updates);
        }
      }
    }

    // Reconcile deletes: any local that synced before but is now missing
    // remotely was deleted on another device.
    const allLocal = await db.metronomePractices.toArray();
    for (const local of allLocal) {
      if (local.syncedOnce && !remoteUids.has(local.uid)) {
        await db.metronomePractices.delete(local.id);
      }
    }
  },

  async pushAllLocalNotes(userId) {
    if (getOfflineMode()) return;
    // Only push notes that have never reached the cloud. Already-synced
    // notes that were edited offline are handled by their queued push_note
    // entries via flushSyncQueue; re-pushing them here would overwrite the
    // queue's freshly-applied cloud state with this device's pullAllNotes-
    // overwritten local state.
    const notes = await db.notes.toArray();
    for (const note of notes) {
      if (getOfflineMode()) return;
      if (!note.uid || !note.itemUid) continue;
      if (note.syncedOnce) continue;
      await firebaseBackend.pushNote(note, userId);
    }
  },

  async pushAllLocalPractices(userId) {
    if (getOfflineMode()) return;
    const practices = await db.metronomePractices.toArray();
    for (const p of practices) {
      if (getOfflineMode()) return;
      if (!p.uid) continue;
      if (p.syncedOnce) continue;
      await firebaseBackend.pushPractice(p, userId);
    }
  },

  async pushAllLocal(userId) {
    if (getOfflineMode()) return;
    const items = await db.practiceItems.toArray();
    for (const item of items) {
      if (getOfflineMode()) return;
      if (!item.uid) continue;
      if (item.syncedOnce) continue;
      await firebaseBackend.pushItem(item, userId);
    }
    // Logs don't have a syncedOnce flag (they're append-only and the
    // pull-then-push race doesn't apply to them — pullAll never overwrites
    // log fields). Push them all defensively.
    const logs = await db.practiceLogs.toArray();
    for (const log of logs) {
      if (getOfflineMode()) return;
      await firebaseBackend.pushLog(log, userId);
    }
    await firebaseBackend.pushAllLocalNotes(userId);
    await firebaseBackend.pushAllLocalPractices(userId);
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
          // Restore local — pullAll may have reverted the offline rename.
          const local = await db.practiceItems.where('uid').equals(entry.payload.uid).first();
          if (local && local.name !== entry.payload.newName) {
            await db.practiceItems.update(local.id, { name: entry.payload.newName });
          }
        } else if (entry.action === 'reorder') {
          for (const item of entry.payload.items) {
            const updates = { sort_order: item.sortOrder };
            if (item.category != null) updates.category = item.category;
            await updateDoc(doc(itemsRef(userId), item.uid), updates);
            const local = await db.practiceItems.where('uid').equals(item.uid).first();
            if (local) {
              const localUpdates = { sortOrder: item.sortOrder };
              if (item.category != null) localUpdates.category = item.category;
              await db.practiceItems.update(local.id, localUpdates);
            }
          }
        } else if (entry.action === 'archive_item') {
          await firebaseBackend.pushArchiveItem(entry.payload.uid, entry.payload.archived, userId);
          const local = await db.practiceItems.where('uid').equals(entry.payload.uid).first();
          if (local && local.archived !== !!entry.payload.archived) {
            await db.practiceItems.update(local.id, { archived: !!entry.payload.archived });
          }
        } else if (entry.action === 'trash_item') {
          await firebaseBackend.pushTrashItem(entry.payload.uid, entry.payload.trashed, entry.payload.trashedAt, userId);
          const local = await db.practiceItems.where('uid').equals(entry.payload.uid).first();
          if (local) {
            const updates = {};
            if (local.trashed !== !!entry.payload.trashed) updates.trashed = !!entry.payload.trashed;
            const trashedAt = entry.payload.trashedAt || null;
            if (local.trashedAt !== trashedAt) updates.trashedAt = trashedAt;
            if (Object.keys(updates).length > 0) await db.practiceItems.update(local.id, updates);
          }
        } else if (entry.action === 'set_category') {
          await firebaseBackend.pushSetCategory(entry.payload.uid, entry.payload.category, userId);
          const local = await db.practiceItems.where('uid').equals(entry.payload.uid).first();
          if (local && local.category !== entry.payload.category) {
            await db.practiceItems.update(local.id, { category: entry.payload.category });
          }
        } else if (entry.action === 'merge_items') {
          await firebaseBackend.mergeItems(
            entry.payload.sourceUid,
            entry.payload.targetUid,
            entry.payload.targetName,
            userId,
          );
        } else if (entry.action === 'push_note') {
          // Push from payload (not from local Dexie), because pullAllNotes
          // earlier in init may have overwritten the offline edit back to
          // cloud's prior state. The payload carries the user's actual
          // intent; we replay that intent to cloud AND re-assert it locally.
          const p = entry.payload;
          if (p.uid && p.itemUid !== undefined && p.body !== undefined) {
            await setDoc(doc(notesRef(userId), p.uid), {
              uid: p.uid,
              item_uid: p.itemUid,
              date: p.date,
              body: p.body ?? '',
              trashed: !!p.trashed,
              trashed_at: p.trashedAt || '',
              created_at: p.createdAt || '',
              updated_at: serverTimestamp(),
            }, { merge: true });
            const localNote = await db.notes.where('uid').equals(p.uid).first();
            if (localNote) {
              await db.notes.update(localNote.id, {
                body: p.body ?? '',
                trashed: !!p.trashed,
                trashedAt: p.trashedAt || null,
                itemUid: p.itemUid ?? localNote.itemUid,
                syncedOnce: true,
              });
            }
          } else {
            // Legacy minimal payload — fall back to re-reading local.
            const local = await db.notes.where('uid').equals(p.uid).first();
            if (local) await firebaseBackend.pushNote(local, userId);
          }
        } else if (entry.action === 'delete_note') {
          await firebaseBackend.deleteNoteRemote(entry.payload.uid, userId);
        } else if (entry.action === 'push_practice') {
          // Same payload-driven approach as push_note. pullAllPractices
          // may have overwritten the offline edit; payload carries intent.
          const p = entry.payload;
          if (p.uid && p.startBpm !== undefined) {
            await setDoc(doc(practicesRef(userId), p.uid), {
              uid: p.uid,
              name: p.name,
              start_bpm: p.startBpm,
              end_bpm: p.endBpm,
              bpm_increment: p.bpmIncrement,
              bars_per_step: p.barsPerStep,
              time_signature_beats: p.timeSignatureBeats,
              time_signature_note_value: p.timeSignatureNoteValue,
              subdivision: p.subdivision,
              sound_type: p.soundType,
              sort_order: p.sortOrder ?? 0,
              created_at: p.createdAt || '',
              updated_at: p.updatedAt || '',
            }, { merge: true });
            const localPractice = await db.metronomePractices.where('uid').equals(p.uid).first();
            if (localPractice) {
              await db.metronomePractices.update(localPractice.id, {
                name: p.name,
                startBpm: p.startBpm,
                endBpm: p.endBpm,
                bpmIncrement: p.bpmIncrement,
                barsPerStep: p.barsPerStep,
                timeSignature: {
                  beats: p.timeSignatureBeats,
                  noteValue: p.timeSignatureNoteValue,
                },
                subdivision: p.subdivision,
                soundType: p.soundType,
                sortOrder: p.sortOrder ?? 0,
                syncedOnce: true,
              });
            }
          } else {
            // Legacy minimal payload — fall back to re-reading local.
            const local = await db.metronomePractices.where('uid').equals(p.uid).first();
            if (local) await firebaseBackend.pushPractice(local, userId);
          }
        } else if (entry.action === 'delete_practice') {
          await firebaseBackend.pushDeletePractice(entry.payload.uid, userId);
        } else if (entry.action === 'reorder_practices') {
          for (const p of entry.payload.practices) {
            await updateDoc(doc(practicesRef(userId), p.uid), { sort_order: p.sortOrder });
            const local = await db.metronomePractices.where('uid').equals(p.uid).first();
            if (local && local.sortOrder !== p.sortOrder) {
              await db.metronomePractices.update(local.id, { sortOrder: p.sortOrder });
            }
          }
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

        // 'added' and 'modified' share reconciliation. The initial snapshot
        // after subscribeToChanges registers reports every doc as 'added' —
        // including docs we just updated via flushSyncQueue. Without the
        // shared path, our queued reorder/rename/etc would not propagate
        // back to local Dexie until the user refreshes.
        if (change.type === 'added' || change.type === 'modified') {
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
          } else {
            const updates = {};
            if (data.name != null && existing.name !== data.name) updates.name = data.name;
            if (data.sort_order != null && existing.sortOrder !== data.sort_order) updates.sortOrder = data.sort_order;
            if (data.archived != null && existing.archived !== data.archived) updates.archived = data.archived;
            if (data.trashed != null && existing.trashed !== data.trashed) {
              updates.trashed = data.trashed;
              updates.trashedAt = data.trashed_at || null;
            }
            if (data.category !== undefined && existing.category !== data.category) {
              updates.category = data.category;
            }
            if (!existing.syncedOnce) updates.syncedOnce = true;
            if (Object.keys(updates).length > 0) {
              await db.practiceItems.update(existing.id, updates);
              onDataChanged();
            }
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
            loggedAt: resolveLoggedAt(data),
          });
          onDataChanged();
        } else if (change.type === 'modified') {
          const existing = await db.practiceLogs.where('uid').equals(data.uid).first();
          if (!existing) continue;
          // Remap parent if item_uid changed (e.g. from a cross-device merge).
          let localItem = null;
          if (data.item_uid) {
            localItem = await db.practiceItems.where('uid').equals(data.item_uid).first();
          }
          if (!localItem) continue;
          if (existing.itemUid !== localItem.uid || existing.itemId !== localItem.id) {
            await db.practiceLogs.update(existing.id, {
              itemUid: localItem.uid,
              itemId: localItem.id,
              loggedAt: resolveLoggedAt(data),
            });
            onDataChanged();
          }
        } else if (change.type === 'removed') {
          const existing = await db.practiceLogs.where('uid').equals(data.uid).first();
          if (existing) {
            await db.practiceLogs.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });

    const unsubNotes = onSnapshot(notesRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (!data.uid) continue;

        // See items handler — combined to reconcile fields on initial
        // snapshot too, so queued push_note replays propagate.
        if (change.type === 'added' || change.type === 'modified') {
          const existing = await db.notes.where('uid').equals(data.uid).first();
          if (!existing) {
            await db.notes.add({
              uid: data.uid,
              itemUid: data.item_uid,
              date: data.date,
              body: data.body ?? '',
              trashed: !!data.trashed,
              trashedAt: data.trashed_at || null,
              createdAt: data.created_at || '',
              syncedOnce: true,
            });
            onDataChanged();
          } else {
            const updates = {};
            // Remap itemUid if it changed (cross-device merge — mirrors logs gotcha #15).
            if (data.item_uid && existing.itemUid !== data.item_uid) updates.itemUid = data.item_uid;
            if (data.date != null && existing.date !== data.date) updates.date = data.date;
            if (data.body != null && existing.body !== data.body) updates.body = data.body;
            if (data.trashed != null && existing.trashed !== !!data.trashed) {
              updates.trashed = !!data.trashed;
              updates.trashedAt = data.trashed_at || null;
            }
            if (!existing.syncedOnce) updates.syncedOnce = true;
            if (Object.keys(updates).length > 0) {
              await db.notes.update(existing.id, updates);
              onDataChanged();
            }
          }
        } else if (change.type === 'removed') {
          const existing = await db.notes.where('uid').equals(data.uid).first();
          if (existing) {
            await db.notes.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });

    const unsubPractices = onSnapshot(practicesRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (!data.uid) continue;

        const buildFields = () => ({
          uid: data.uid,
          name: data.name ?? '',
          startBpm: data.start_bpm ?? 60,
          endBpm: data.end_bpm ?? 60,
          bpmIncrement: data.bpm_increment ?? 1,
          barsPerStep: data.bars_per_step ?? 1,
          timeSignature: {
            beats: data.time_signature_beats ?? 4,
            noteValue: data.time_signature_note_value ?? 4,
          },
          subdivision: data.subdivision ?? 'quarter',
          soundType: data.sound_type ?? 'click',
          sortOrder: data.sort_order ?? 0,
          createdAt: data.created_at || '',
          updatedAt: data.updated_at || '',
          syncedOnce: true,
        });

        // See items handler — combined to reconcile fields on initial
        // snapshot too, so queued push_practice replays propagate.
        if (change.type === 'added' || change.type === 'modified') {
          const local = await db.metronomePractices.where('uid').equals(data.uid).first();
          if (!local) {
            await db.metronomePractices.add(buildFields());
            onDataChanged();
          } else {
            const fields = buildFields();
            const updates = {};
            for (const k of ['name', 'startBpm', 'endBpm', 'bpmIncrement', 'barsPerStep',
                             'subdivision', 'soundType', 'sortOrder', 'createdAt', 'updatedAt']) {
              if (fields[k] !== undefined && local[k] !== fields[k]) updates[k] = fields[k];
            }
            if (local.timeSignature?.beats !== fields.timeSignature.beats ||
                local.timeSignature?.noteValue !== fields.timeSignature.noteValue) {
              updates.timeSignature = fields.timeSignature;
            }
            if (!local.syncedOnce) updates.syncedOnce = true;
            if (Object.keys(updates).length > 0) {
              await db.metronomePractices.update(local.id, updates);
              onDataChanged();
            }
          }
        } else if (change.type === 'removed') {
          const existing = await db.metronomePractices.where('uid').equals(data.uid).first();
          if (existing) {
            await db.metronomePractices.delete(existing.id);
            onDataChanged();
          }
        }
      }
    });

    return () => {
      unsubItems();
      unsubLogs();
      unsubNotes();
      unsubPractices();
    };
  },
};

export default firebaseBackend;
