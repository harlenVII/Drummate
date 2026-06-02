import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore } from './firestoreAccess';
import { getFirebaseApp } from '../firebase';
import { db } from '../database';
import { legacyDateToLoggedAt } from '../../utils/tzDateHelpers.js';
import { getOfflineMode } from '../offlineService';
import { runWithOfflineQueue } from './offlineQueue';
import { reconcileSnapshot, applyChange } from './reconcile';
import { noteCodec, practiceCodec, goalCodec, itemCodec, logCodec } from './codecs';

function normalizeUser(fbUser) {
  if (!fbUser) return null;
  return { id: fbUser.uid, email: fbUser.email, name: fbUser.displayName || null };
}

// --- Helpers ---

function itemsRef(userId) {
  const fs = getFirestore();
  return fs.collection(fs.getDb(), 'users', userId, 'practice_items');
}

function logsRef(userId) {
  const fs = getFirestore();
  return fs.collection(fs.getDb(), 'users', userId, 'practice_logs');
}

function notesRef(userId) {
  const fs = getFirestore();
  return fs.collection(fs.getDb(), 'users', userId, 'notes');
}

function practicesRef(userId) {
  const fs = getFirestore();
  return fs.collection(fs.getDb(), 'users', userId, 'metronomePractices');
}

function goalsRef(userId) {
  if (!userId) throw new Error('goalsRef requires userId');
  const fs = getFirestore();
  return fs.collection(fs.getDb(), 'users', userId, 'goals');
}

// --- Offline sync queue (reuses Dexie syncQueue table) ---

async function queueSync(action, payload) {
  await db.syncQueue.add({ action, payload });
}

// Binds runWithOfflineQueue to this module's queueSync. `buildPayload` is the
// single enriched payload used for BOTH the offline and catch-fallback enqueue.
function withOfflineQueue(action, buildPayload, onlineFn) {
  return runWithOfflineQueue({ action, buildPayload, onlineFn, queueFn: queueSync });
}

// --- flushSyncQueue enriched-payload replay helpers ---
// Each writes the user's offline intent to BOTH cloud and local Dexie, because
// pullAll* earlier in init may have overwritten the local row with cloud's
// prior state. Returns true when it handled an enriched payload; false when the
// payload is a legacy/minimal shape the caller must handle by re-reading local.

async function replayNotePayload(p, userId) {
  if (!(p.uid && p.itemUid !== undefined && p.body !== undefined)) return false;
  const fs = getFirestore();
  await fs.setDoc(fs.doc(notesRef(userId), p.uid), {
    ...noteCodec.toRemote(p),
    updated_at: fs.serverTimestamp(),
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
  return true;
}

async function replayPracticePayload(p, userId) {
  if (!(p.uid && p.startBpm !== undefined)) return false;
  const fs = getFirestore();
  await fs.setDoc(fs.doc(practicesRef(userId), p.uid), {
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
    linked_item_uid: p.linkedItemUid ?? null,
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
      timeSignature: { beats: p.timeSignatureBeats, noteValue: p.timeSignatureNoteValue },
      subdivision: p.subdivision,
      soundType: p.soundType,
      linkedItemUid: p.linkedItemUid ?? null,
      sortOrder: p.sortOrder ?? 0,
      syncedOnce: true,
    });
  }
  return true;
}

async function replayGoalPayload(p, userId) {
  if (!(p.uid && p.startDate && p.endDate && p.targetHours !== undefined)) return false;
  const fs = getFirestore();
  await fs.setDoc(fs.doc(goalsRef(userId), p.uid), {
    ...goalCodec.toRemote(p),
    updated_at: fs.serverTimestamp(),
  }, { merge: true });
  const localGoal = await db.goals.where('uid').equals(p.uid).first();
  if (localGoal) {
    await db.goals.update(localGoal.id, {
      name: p.name ?? '',
      startDate: p.startDate,
      endDate: p.endDate,
      targetHours: p.targetHours,
      archived: !!p.archived,
      archivedAt: p.archivedAt ?? null,
      pinned: !!p.pinned,
      createdAt: p.createdAt || localGoal.createdAt || 0,
      sortOrder: p.sortOrder ?? 0,
      syncedOnce: true,
    });
  }
  return true;
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
    await withOfflineQueue(
      'create_item',
      () => ({ uid: localItem.uid, name: localItem.name, displayName: localItem.name }),
      async () => {
        const fs = getFirestore();
        const data = {
          uid: localItem.uid,
          name: localItem.name,
          category: localItem.category ?? 'fundamentals',
          created: fs.serverTimestamp(),
        };
        if (localItem.sortOrder != null) data.sort_order = localItem.sortOrder;
        data.archived = localItem.archived ?? false;
        data.trashed = localItem.trashed ?? false;
        data.trashed_at = localItem.trashedAt || '';
        await fs.setDoc(fs.doc(itemsRef(userId), localItem.uid), data, { merge: true });

        if (localItem.id != null && !localItem.syncedOnce) {
          await db.practiceItems.update(localItem.id, { syncedOnce: true });
        }
      },
    );
  },

  async pushLog(localLog, userId) {
    await withOfflineQueue(
      'create_log',
      async () => {
        const item = await db.practiceItems.get(localLog.itemId);
        return {
          itemUid: localLog.itemUid || item?.uid,
          itemName: item?.name,
          date: localLog.date,
          duration: localLog.duration,
          uid: localLog.uid,
        };
      },
      async () => {
        const item = await db.practiceItems.get(localLog.itemId);
        if (!item) return;
        const itemUid = localLog.itemUid || item.uid;
        const fs = getFirestore();
        const logDocRef = fs.doc(logsRef(userId), localLog.uid);
        await fs.setDoc(logDocRef, {
          uid: localLog.uid,
          item_uid: itemUid,
          item_name: item.name,
          date: localLog.date,
          duration: localLog.duration,
          logged_at: localLog.loggedAt ?? legacyDateToLoggedAt(localLog.date),
          created: fs.serverTimestamp(),
        }, { merge: true });
        if (localLog.id != null && !localLog.syncedOnce) {
          await db.practiceLogs.update(localLog.id, { syncedOnce: true });
        }
      },
    );
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
    await withOfflineQueue(
      'push_note',
      async () => {
        const item = await db.practiceItems.where('uid').equals(localNote.itemUid).first();
        return {
          uid: localNote.uid,
          itemUid: localNote.itemUid,
          itemName: item?.name,
          date: localNote.date,
          body: localNote.body ?? '',
          trashed: !!localNote.trashed,
          trashedAt: localNote.trashedAt || '',
          createdAt: localNote.createdAt || '',
        };
      },
      async () => {
        const fs = getFirestore();
        await fs.setDoc(fs.doc(notesRef(userId), localNote.uid), {
          uid: localNote.uid,
          item_uid: localNote.itemUid,
          date: localNote.date,
          body: localNote.body ?? '',
          trashed: !!localNote.trashed,
          trashed_at: localNote.trashedAt || '',
          created_at: localNote.createdAt || '',
          updated_at: fs.serverTimestamp(),
        }, { merge: true });
        if (localNote.id != null && !localNote.syncedOnce) {
          await db.notes.update(localNote.id, { syncedOnce: true });
        }
      },
    );
  },

  async deleteNoteRemote(noteUid, userId) {
    await withOfflineQueue(
      'delete_note',
      () => ({ uid: noteUid }),
      async () => {
        const fs = getFirestore();
        await fs.deleteDoc(fs.doc(notesRef(userId), noteUid));
      },
    );
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
      linkedItemUid: localPractice.linkedItemUid ?? null,
      sortOrder: localPractice.sortOrder ?? 0,
      createdAt: localPractice.createdAt || '',
      updatedAt: localPractice.updatedAt || '',
    });
    await withOfflineQueue(
      'push_practice',
      enrichedPracticePayload,
      async () => {
        const fs = getFirestore();
        await fs.setDoc(fs.doc(practicesRef(userId), localPractice.uid), {
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
          linked_item_uid: localPractice.linkedItemUid ?? null,
          sort_order: localPractice.sortOrder ?? 0,
          created_at: localPractice.createdAt || '',
          updated_at: localPractice.updatedAt || '',
        }, { merge: true });

        if (localPractice.id != null && !localPractice.syncedOnce) {
          await db.metronomePractices.update(localPractice.id, { syncedOnce: true });
        }
      },
    );
  },

  async pushGoal(localGoal, userId) {
    if (!localGoal.uid) {
      console.error('pushGoal: missing uid', localGoal);
      return;
    }
    const enrichedGoalPayload = () => ({
      uid: localGoal.uid,
      name: localGoal.name ?? '',
      startDate: localGoal.startDate,
      endDate: localGoal.endDate,
      targetHours: localGoal.targetHours,
      archived: !!localGoal.archived,
      archivedAt: localGoal.archivedAt ?? null,
      pinned: !!localGoal.pinned,
      createdAt: localGoal.createdAt || 0,
      sortOrder: localGoal.sortOrder ?? 0,
    });
    await withOfflineQueue(
      'push_goal',
      enrichedGoalPayload,
      async () => {
        const fs = getFirestore();
        await fs.setDoc(fs.doc(goalsRef(userId), localGoal.uid), {
          uid: localGoal.uid,
          name: localGoal.name ?? '',
          start_date: localGoal.startDate,
          end_date: localGoal.endDate,
          target_hours: localGoal.targetHours,
          archived: !!localGoal.archived,
          archived_at: localGoal.archivedAt ?? null,
          pinned: !!localGoal.pinned,
          created_at: localGoal.createdAt || 0,
          sort_order: localGoal.sortOrder ?? 0,
          updated_at: fs.serverTimestamp(),
        }, { merge: true });

        if (localGoal.id != null && !localGoal.syncedOnce) {
          await db.goals.update(localGoal.id, { syncedOnce: true });
        }
      },
    );
  },

  async deleteGoalRemote(goalUid, userId) {
    await withOfflineQueue(
      'delete_goal_permanent',
      () => ({ uid: goalUid }),
      async () => {
        const fs = getFirestore();
        await fs.deleteDoc(fs.doc(goalsRef(userId), goalUid));
      },
    );
  },

  async pushDeletePractice(uid, userId) {
    await withOfflineQueue(
      'delete_practice',
      async () => {
        const local = await db.metronomePractices.where('uid').equals(uid).first();
        return { uid, name: local?.name };
      },
      async () => {
        const fs = getFirestore();
        await fs.deleteDoc(fs.doc(practicesRef(userId), uid));
      },
    );
  },

  async pushPracticeReorder(practices, userId) {
    await withOfflineQueue(
      'reorder_practices',
      () => ({ practices: practices.map(({ uid, sortOrder }) => ({ uid, sortOrder })) }),
      async () => {
        const fs = getFirestore();
        for (const p of practices) {
          await fs.updateDoc(fs.doc(practicesRef(userId), p.uid), { sort_order: p.sortOrder });
        }
      },
    );
  },

  async pushDeleteItem(uid, userId) {
    await withOfflineQueue(
      'delete_item',
      async () => {
        const local = await db.practiceItems.where('uid').equals(uid).first();
        return { uid, displayName: local?.name };
      },
      async () => {
        const fs = getFirestore();
        const logQ = fs.query(logsRef(userId), fs.where('item_uid', '==', uid));
        const logSnap = await fs.getDocs(logQ);
        for (const logDoc of logSnap.docs) {
          await fs.deleteDoc(logDoc.ref);
        }
        const noteQ = fs.query(notesRef(userId), fs.where('item_uid', '==', uid));
        const noteSnap = await fs.getDocs(noteQ);
        for (const noteDoc of noteSnap.docs) {
          await fs.deleteDoc(noteDoc.ref);
        }
        await fs.deleteDoc(fs.doc(itemsRef(userId), uid));
      },
    );
  },

  async pushRenameItem(uid, newName, userId) {
    await withOfflineQueue(
      'rename_item',
      async () => {
        const local = await db.practiceItems.where('uid').equals(uid).first();
        return { uid, newName, previousName: local?.name };
      },
      async () => {
        const fs = getFirestore();
        await fs.setDoc(fs.doc(itemsRef(userId), uid), { name: newName }, { merge: true });

        // Update denormalized item_name on this item's logs (human-readable hint).
        const q = fs.query(logsRef(userId), fs.where('item_uid', '==', uid));
        const snap = await fs.getDocs(q);
        for (const logDoc of snap.docs) {
          await fs.updateDoc(logDoc.ref, { item_name: newName });
        }
      },
    );
  },

  async pushReorder(items, userId) {
    await withOfflineQueue(
      'reorder',
      () => ({ items: items.map(({ uid, sortOrder, category }) => ({ uid, sortOrder, category })) }),
      async () => {
        const fs = getFirestore();
        for (const item of items) {
          const updates = { sort_order: item.sortOrder };
          if (item.category != null) updates.category = item.category;
          await fs.updateDoc(fs.doc(itemsRef(userId), item.uid), updates);
        }
      },
    );
  },

  async pushArchiveItem(uid, archived, userId) {
    await withOfflineQueue(
      'archive_item',
      async () => {
        const local = await db.practiceItems.where('uid').equals(uid).first();
        return { uid, archived: !!archived, displayName: local?.name };
      },
      async () => {
        const fs = getFirestore();
        await fs.updateDoc(fs.doc(itemsRef(userId), uid), { archived: !!archived });
      },
    );
  },

  async pushTrashItem(uid, trashed, trashedAt, userId) {
    await withOfflineQueue(
      'trash_item',
      async () => {
        const local = await db.practiceItems.where('uid').equals(uid).first();
        return { uid, trashed: !!trashed, trashedAt: trashedAt || '', displayName: local?.name };
      },
      async () => {
        const fs = getFirestore();
        await fs.updateDoc(fs.doc(itemsRef(userId), uid), {
          trashed: !!trashed,
          trashed_at: trashedAt || '',
        });
      },
    );
  },

  async pushSetCategory(uid, category, userId) {
    await withOfflineQueue(
      'set_category',
      async () => {
        const local = await db.practiceItems.where('uid').equals(uid).first();
        return { uid, category, displayName: local?.name };
      },
      async () => {
        const fs = getFirestore();
        await fs.updateDoc(fs.doc(itemsRef(userId), uid), { category });
      },
    );
  },

  async getUserSettings(userId) {
    const fs = getFirestore();
    const ref = fs.doc(fs.getDb(), 'users', userId);
    const snap = await fs.getDoc(ref);
    return snap.exists() ? snap.data() : {};
  },

  async setUserSetting(userId, key, value) {
    const fs = getFirestore();
    const ref = fs.doc(fs.getDb(), 'users', userId);
    await fs.setDoc(ref, { [key]: value }, { merge: true });
  },

  async mergeItems(sourceUid, targetUid, targetName, userId) {
    if (sourceUid === targetUid) return;
    await withOfflineQueue(
      'merge_items',
      async () => {
        const sourceLocal = await db.practiceItems.where('uid').equals(sourceUid).first();
        return { sourceUid, targetUid, targetName, previousName: sourceLocal?.name };
      },
      async () => {
        const fs = getFirestore();
        const logQ = fs.query(logsRef(userId), fs.where('item_uid', '==', sourceUid));
        const logSnap = await fs.getDocs(logQ);
        for (const logDoc of logSnap.docs) {
          await fs.updateDoc(logDoc.ref, {
            item_uid: targetUid,
            item_name: targetName,
          });
        }
        const noteQ = fs.query(notesRef(userId), fs.where('item_uid', '==', sourceUid));
        const noteSnap = await fs.getDocs(noteQ);
        for (const noteDoc of noteSnap.docs) {
          await fs.updateDoc(noteDoc.ref, { item_uid: targetUid });
        }
        await fs.deleteDoc(fs.doc(itemsRef(userId), sourceUid));
      },
    );
  },

  // Sync — pull
  async pullAll(userId) {
    // Fire both network requests in parallel — they're independent. The
    // loops still run sequentially (items first, then logs) because the
    // logs loop looks up parent items in the just-updated Dexie state.
    const fs = getFirestore();
    const [itemsSnap, logsSnap] = await Promise.all([
      fs.getDocs(itemsRef(userId)),
      fs.getDocs(logsRef(userId)),
    ]);
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

        await fs.setDoc(fs.doc(itemsRef(userId), uid), {
          uid,
          name: data.name,
          category: data.category ?? 'fundamentals',
          sort_order: data.sort_order ?? 0,
          archived: data.archived ?? false,
          trashed: data.trashed ?? false,
          trashed_at: data.trashed_at || '',
          created: fs.serverTimestamp(),
        }, { merge: true });

        // Backfill item_uid on this item's existing logs in Firestore.
        const logsByName = await fs.getDocs(fs.query(logsRef(userId), fs.where('item_name', '==', data.name)));
        for (const logDoc of logsByName.docs) {
          await fs.updateDoc(logDoc.ref, { item_uid: uid });
        }

        await fs.deleteDoc(docSnap.ref);

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

      const { action, fields } = itemCodec.diff(data, local);
      if (action === 'add') await db.practiceItems.add(fields);
      else if (action === 'update') await db.practiceItems.update(local.id, fields);

      remoteUids.add(data.uid);
    }

    // Process logs BEFORE reconciling item deletions, so logs whose `item_uid`
    // moved to a different parent (via merge on another device) get remapped
    // locally before their old parent gets deleted. The logsSnap network call
    // was fired in parallel with the items network call at the top of pullAll.
    if (logsSnap.metadata.fromCache) {
      // Cached/offline snapshot — bail before the deletion-reconciliation
      // loop below (same rationale as the itemsSnap guard above).
      return;
    }

    // Bulk-load local items + logs into maps so the per-remote-log lookups
    // become in-memory O(1) instead of N separate IndexedDB transactions.
    // The items loop above may have just added/updated rows, so re-read
    // here rather than capturing earlier.
    const localItemsArr = await db.practiceItems.toArray();
    const itemsByUid = new Map();
    const itemsByName = new Map();
    for (const i of localItemsArr) {
      if (i.uid) itemsByUid.set(i.uid, i);
      if (i.name) itemsByName.set(i.name, i);
    }
    const logsByUid = new Map();
    for (const l of await db.practiceLogs.toArray()) {
      if (l.uid) logsByUid.set(l.uid, l);
    }

    const logsToAdd = [];
    const logsToUpdate = []; // { id, fields }

    for (const docSnap of logsSnap.docs) {
      const data = docSnap.data();
      if (!data.uid) continue;

      // Resolve the parent item locally — prefer item_uid, fall back to item_name
      // for any legacy log whose item_uid hasn't been backfilled yet.
      let localItem = data.item_uid ? itemsByUid.get(data.item_uid) : null;
      if (!localItem && data.item_name) localItem = itemsByName.get(data.item_name);
      if (!localItem) continue;

      const existing = logsByUid.get(data.uid);
      if (existing) {
        const { action, fields } = logCodec.diff(data, existing, localItem);
        if (action === 'update') logsToUpdate.push({ id: existing.id, fields });
        continue;
      }

      logsToAdd.push(logCodec.toLocal(data, localItem));
    }

    if (logsToAdd.length > 0 || logsToUpdate.length > 0) {
      await db.transaction('rw', db.practiceLogs, async () => {
        if (logsToAdd.length > 0) await db.practiceLogs.bulkAdd(logsToAdd);
        for (const { id, fields } of logsToUpdate) {
          await db.practiceLogs.update(id, fields);
        }
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
    return reconcileSnapshot(noteCodec, await getFirestore().getDocs(notesRef(userId)));
  },

  async pullAllPractices(userId) {
    return reconcileSnapshot(practiceCodec, await getFirestore().getDocs(practicesRef(userId)));
  },

  async pullAllGoals(userId) {
    return reconcileSnapshot(goalCodec, await getFirestore().getDocs(goalsRef(userId)));
  },

  async pushAllLocalNotes(userId) {
    if (getOfflineMode()) return;
    // Only push notes that have never reached the cloud. Already-synced
    // notes that were edited offline are handled by their queued push_note
    // entries via flushSyncQueue; re-pushing them here would overwrite the
    // queue's freshly-applied cloud state with this device's pullAllNotes-
    // overwritten local state.
    const notes = await db.notes.toArray();
    await Promise.all(
      notes
        .filter((n) => n.uid && n.itemUid && !n.syncedOnce)
        .map((n) => firebaseBackend.pushNote(n, userId)),
    );
  },

  async pushAllLocalPractices(userId) {
    if (getOfflineMode()) return;
    const practices = await db.metronomePractices.toArray();
    await Promise.all(
      practices
        .filter((p) => p.uid && !p.syncedOnce)
        .map((p) => firebaseBackend.pushPractice(p, userId)),
    );
  },

  async pushAllLocalGoals(userId) {
    if (getOfflineMode()) return;
    const goals = await db.goals.toArray();
    await Promise.all(
      goals
        .filter((g) => g.uid && !g.syncedOnce)
        .map((g) => firebaseBackend.pushGoal(g, userId)),
    );
  },

  async pushAllLocal(userId) {
    if (getOfflineMode()) return;
    // Items must finish first — logs and notes reference itemUid and would
    // be orphaned in the cloud if a parent item hasn't been pushed yet.
    const items = await db.practiceItems.toArray();
    await Promise.all(
      items
        .filter((i) => i.uid && !i.syncedOnce)
        .map((i) => firebaseBackend.pushItem(i, userId)),
    );

    if (getOfflineMode()) return;
    // Only push logs that have never reached the cloud. Already-synced logs
    // are append-only and immutable on cloud after push, so re-pushing them
    // every refresh is pure waste (the dominant cost for users with many
    // logs). syncedOnce flips to true inside pushLog on success and by
    // pullAll / subscribeToChanges when adopting a remote log locally.
    const logs = await db.practiceLogs.toArray();
    await Promise.all([
      Promise.all(logs.filter((l) => !l.syncedOnce).map((log) => firebaseBackend.pushLog(log, userId))),
      firebaseBackend.pushAllLocalNotes(userId),
      firebaseBackend.pushAllLocalPractices(userId),
      firebaseBackend.pushAllLocalGoals(userId),
    ]);
  },

  async flushSyncQueue(userId) {
    const fs = getFirestore();
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
            await fs.updateDoc(fs.doc(itemsRef(userId), item.uid), updates);
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
          // Replay enriched payload (pullAllNotes may have reverted local).
          // Legacy/minimal payloads fall back to re-reading local.
          if (!(await replayNotePayload(entry.payload, userId))) {
            const local = await db.notes.where('uid').equals(entry.payload.uid).first();
            if (local) await firebaseBackend.pushNote(local, userId);
          }
        } else if (entry.action === 'delete_note') {
          await firebaseBackend.deleteNoteRemote(entry.payload.uid, userId);
        } else if (entry.action === 'push_practice') {
          if (!(await replayPracticePayload(entry.payload, userId))) {
            const local = await db.metronomePractices.where('uid').equals(entry.payload.uid).first();
            if (local) await firebaseBackend.pushPractice(local, userId);
          }
        } else if (entry.action === 'delete_practice') {
          await firebaseBackend.pushDeletePractice(entry.payload.uid, userId);
        } else if (entry.action === 'reorder_practices') {
          for (const p of entry.payload.practices) {
            await fs.updateDoc(fs.doc(practicesRef(userId), p.uid), { sort_order: p.sortOrder });
            const local = await db.metronomePractices.where('uid').equals(p.uid).first();
            if (local && local.sortOrder !== p.sortOrder) {
              await db.metronomePractices.update(local.id, { sortOrder: p.sortOrder });
            }
          }
        } else if (entry.action === 'push_goal') {
          if (!(await replayGoalPayload(entry.payload, userId))) {
            const local = await db.goals.where('uid').equals(entry.payload.uid).first();
            if (local) await firebaseBackend.pushGoal(local, userId);
          }
        } else if (entry.action === 'delete_goal_permanent') {
          // deleteGoalLocal was already called at action time (GoalsPage.handleDelete).
          // The Dexie row is already gone; just sync the cloud deletion.
          await firebaseBackend.deleteGoalRemote(entry.payload.uid, userId);
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

    const fs = getFirestore();
    const unsubItems = fs.onSnapshot(itemsRef(userId), async (snap) => {
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
            const { action, fields } = itemCodec.diff(data, existing);
            if (action === 'update') {
              await db.practiceItems.update(existing.id, fields);
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

    const unsubLogs = fs.onSnapshot(logsRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        const data = change.doc.data();
        if (!data.uid) continue;

        if (change.type === 'added') {
          const existing = await db.practiceLogs.where('uid').equals(data.uid).first();
          if (existing) {
            // Initial snapshot replays every doc as 'added' — patch the
            // syncedOnce flag on local rows that pre-date the v14 migration
            // path so they aren't re-pushed.
            if (!existing.syncedOnce) {
              await db.practiceLogs.update(existing.id, { syncedOnce: true });
            }
            continue;
          }

          let localItem = null;
          if (data.item_uid) {
            localItem = await db.practiceItems.where('uid').equals(data.item_uid).first();
          }
          if (!localItem && data.item_name) {
            localItem = await db.practiceItems.where('name').equals(data.item_name).first();
          }
          if (!localItem) continue;

          await db.practiceLogs.add(logCodec.toLocal(data, localItem));
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
          const { action, fields } = logCodec.diff(data, existing, localItem);
          if (action === 'update') {
            await db.practiceLogs.update(existing.id, fields);
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

    const unsubNotes = getFirestore().onSnapshot(notesRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        await applyChange(noteCodec, change, { onChange: onDataChanged });
      }
    });

    const unsubPractices = getFirestore().onSnapshot(practicesRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        await applyChange(practiceCodec, change, { onChange: onDataChanged });
      }
    });

    const unsubGoals = getFirestore().onSnapshot(goalsRef(userId), async (snap) => {
      for (const change of snap.docChanges()) {
        await applyChange(goalCodec, change, { onChange: onDataChanged });
      }
    });

    return () => {
      unsubItems();
      unsubLogs();
      unsubNotes();
      unsubPractices();
      unsubGoals();
    };
  },
};

export default firebaseBackend;
